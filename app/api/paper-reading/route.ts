import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";

export async function GET(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url);
  const spaceId = url.searchParams.get("spaceId") || "";
  const paperId = url.searchParams.get("paperId") || "";
  if (!spaceId || !paperId) return Response.json({ error: "spaceId and paperId required" }, { status: 400 });
  const db = getDatabase(); await ensureSchema(db);
  const paper = await db.prepare(`SELECT COALESCE(i.abstract_text, '') AS abstractText
    FROM monitored_papers p JOIN research_spaces s ON s.id = p.space_id
    LEFT JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
    WHERE p.id = ? AND p.space_id = ? AND s.owner_user_id = ? LIMIT 1`)
    .bind(paperId, spaceId, user.userId).first<{ abstractText: string }>();
  if (!paper) return Response.json({ error: "Paper not found" }, { status: 404 });
  return Response.json({ paper }, { headers: { "Cache-Control": "private, no-store" } });
}
