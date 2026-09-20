import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { calendarDay, calendarMonth } from "../../../lib/reading-calendar";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const spaceId = params.get("spaceId") || "";
  const month = params.get("month") || "";
  const day = params.get("day") || `${month}-01`;
  const kind = params.get("kind") || "recommended";
  const page = Number(params.get("page") || 0);
  const range = calendarMonth(month);
  if (!range || !calendarDay(day, month) || !["recommended", "browsed", "completed"].includes(kind) || !Number.isInteger(page) || page < 0 || page > 1000) return Response.json({ error: "Invalid calendar query" }, { status: 400 });
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = getDatabase();
  await ensureSchema(db);
  const owned = await db.prepare("SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?").bind(spaceId, user.userId).first();
  if (!owned) return Response.json({ error: "Space not found" }, { status: 404 });
  const [counts, papers] = await Promise.all([
    db.prepare("SELECT day, kind, COUNT(*) AS count FROM reading_calendar_events WHERE space_id=? AND day>=? AND day<? GROUP BY day,kind ORDER BY day")
      .bind(spaceId, range.start, range.end).all<{ day: string; kind: string; count: number }>(),
    db.prepare(`SELECT p.id, p.title, p.authors, p.venue, e.occurred_at AS occurredAt
      FROM reading_calendar_events e JOIN monitored_papers p ON p.id=e.paper_id AND p.space_id=e.space_id
      WHERE e.space_id=? AND e.day=? AND e.kind=? ORDER BY e.occurred_at DESC,e.paper_id LIMIT 51 OFFSET ?`)
      .bind(spaceId, day, kind, page * 50).all(),
  ]);
  return Response.json({ month, day, kind, counts: counts.results, papers: papers.results.slice(0, 50), hasMore: papers.results.length > 50, timezone: "Asia/Shanghai" }, { headers: { "Cache-Control": "private, no-store" } });
}
