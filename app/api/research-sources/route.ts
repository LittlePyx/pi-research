import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { researchSourcePlan, normalizeSourceTitle, SOURCE_ACTIVITY_SQL, SOURCE_RECENT_PAPERS_SQL } from "../../../lib/research-source-plan";

export async function GET(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const spaceId = new URL(request.url).searchParams.get("spaceId") || "";
  const db = getDatabase(); await ensureSchema(db);
  const space = await db.prepare("SELECT name, description FROM research_spaces WHERE id=? AND owner_user_id=?")
    .bind(spaceId, user.userId).first<{ name: string; description: string }>();
  if (!space) return Response.json({ error: "Space not found" }, { status: 404 });
  const [stats, papers] = await Promise.all([
    db.prepare(SOURCE_ACTIVITY_SQL).bind(spaceId).all<{ venue: string; discovered: number; recommended: number; latestAt: string }>(),
    db.prepare(SOURCE_RECENT_PAPERS_SQL).bind(spaceId).all<{ id: string; title: string; venue: string; recommended: number }>(),
  ]);
  return Response.json({ plan: researchSourcePlan(space.name, space.description), periodDays: 30,
    activity: stats.results.map(row => ({ ...row, key: normalizeSourceTitle(row.venue), papers: papers.results.filter(p => normalizeSourceTitle(p.venue) === normalizeSourceTitle(row.venue)).slice(0, 2) })) },
  { headers: { "Cache-Control": "private, no-store" } });
}
