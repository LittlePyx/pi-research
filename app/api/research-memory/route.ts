import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { MEMORY_JOIN_SQL, memorySearchBindings, memorySearchPattern, publicResearchMemory, savedComparison, SAVED_COMPARISON_PAGE_SIZE, type MemoryRow, type SavedComparisonRow } from "../../../lib/research-memory-view";

const COMPARISON_MEMORY = `WITH records AS (
  SELECT w.id AS workbookId, w.track_id AS trackId, t.title_zh AS routeZh, t.title_en AS routeEn, w.question,
    CASE WHEN json_valid(w.content_json) THEN json_extract(w.content_json, '$.questionZh') END AS questionZh,
    CASE WHEN json_valid(w.content_json) THEN json_extract(w.content_json, '$.questionEn') END AS questionEn,
    CASE WHEN json_valid(a.value_json) THEN json_extract(a.value_json, '$.decision') END AS decision,
    CASE WHEN json_valid(a.value_json) THEN json_extract(a.value_json, '$.unresolved') END AS unresolved,
    a.created_at AS savedAt, a.revision
  FROM research_comparison_workbooks w
  JOIN research_tracks t ON t.id=w.track_id AND t.space_id=w.space_id
  JOIN research_comparison_artifacts a ON a.workbook_id=w.id AND a.space_id=w.space_id AND a.revision=(
    SELECT MAX(revision) FROM research_comparison_artifacts WHERE workbook_id=w.id AND space_id=w.space_id
  )
  WHERE w.space_id=? AND (?='' OR w.track_id=?)
), matches AS (
  SELECT * FROM records WHERE ?='' OR question LIKE ? ESCAPE '\\'
    OR questionZh LIKE ? ESCAPE '\\' OR questionEn LIKE ? ESCAPE '\\'
    OR routeZh LIKE ? ESCAPE '\\' OR routeEn LIKE ? ESCAPE '\\'
    OR decision LIKE ? ESCAPE '\\' OR unresolved LIKE ? ESCAPE '\\'
)`;

export async function GET(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url), spaceId = url.searchParams.get("spaceId") || "", query = (url.searchParams.get("q") || "").trim().slice(0, 160);
  const offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return Response.json({ error: "Invalid offset" }, { status: 400 });
  const db = getDatabase(); await ensureSchema(db);
  const space = await db.prepare("SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?").bind(spaceId, user.userId).first();
  if (!space) return Response.json({ error: "Space not found" }, { status: 404 });
  if (url.searchParams.get('kind') === 'comparisons') {
    const trackId = url.searchParams.get('trackId') || '';
    const bindings = [spaceId, trackId, trackId, query, ...Array(7).fill(memorySearchPattern(query))];
    const [count, rows] = await Promise.all([
      db.prepare(`${COMPARISON_MEMORY} SELECT COUNT(*) AS total FROM matches`).bind(...bindings).first<{ total: number }>(),
      db.prepare(`${COMPARISON_MEMORY} SELECT * FROM matches ORDER BY datetime(savedAt) DESC, workbookId LIMIT ? OFFSET ?`)
        .bind(...bindings, SAVED_COMPARISON_PAGE_SIZE, offset).all<SavedComparisonRow>(),
    ]);
    const items = rows.results.map(savedComparison), total = count?.total || 0;
    return Response.json({ items, total, offset, nextOffset: offset + items.length < total && items.length ? offset + items.length : null }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
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
