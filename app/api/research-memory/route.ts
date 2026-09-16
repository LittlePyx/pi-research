import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { MEMORY_JOIN_SQL, memorySearchBindings, publicResearchMemory, type MemoryRow } from "../../../lib/research-memory-view";

export async function GET(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url), spaceId = url.searchParams.get("spaceId") || "", query = (url.searchParams.get("q") || "").trim().slice(0, 160);
  const offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return Response.json({ error: "Invalid offset" }, { status: 400 });
  const db = getDatabase(); await ensureSchema(db);
  const space = await db.prepare("SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?").bind(spaceId, user.userId).first();
  if (!space) return Response.json({ error: "Space not found" }, { status: 404 });
  const bindings = memorySearchBindings(spaceId, query);
  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total ${MEMORY_JOIN_SQL}`).bind(...bindings).first<{ total: number }>(),
    db.prepare(`SELECT p.id AS paperId, p.title, p.venue, r.note, r.updated_at AS updatedAt, r.status AS readingStatus,
     m.analysis_status AS analysisStatus, m.note_hash AS noteHash, m.takeaway_zh AS takeawayZh, m.takeaway_en AS takeawayEn,
     m.methods_zh AS methodsZh, m.methods_en AS methodsEn, m.questions_zh AS questionsZh, m.questions_en AS questionsEn,
     m.analyzed_at AS analyzedAt ${MEMORY_JOIN_SQL} ORDER BY r.updated_at DESC, p.id LIMIT 24 OFFSET ?`).bind(...bindings, offset).all<MemoryRow>(),
  ]);
  const items = await Promise.all(rows.results.map(publicResearchMemory));
  return Response.json({ items, total: count?.total || 0, offset, nextOffset: offset + items.length < (count?.total || 0) ? offset + items.length : null }, { headers: { "Cache-Control": "private, no-store" } });
}
