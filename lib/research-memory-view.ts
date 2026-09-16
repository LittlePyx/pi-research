export type MemoryRow = { paperId: string; title: string; venue: string; note: string; updatedAt: string; readingStatus: string;
  analysisStatus: string | null; noteHash: string | null; takeawayZh: string | null; takeawayEn: string | null;
  methodsZh: string | null; methodsEn: string | null; questionsZh: string | null; questionsEn: string | null; analyzedAt: string | null };
const list = (value: string | null) => { try { const items: unknown = JSON.parse(value || "[]"); return Array.isArray(items) ? items.filter((x): x is string => typeof x === "string").slice(0, 16) : []; } catch { return []; } };
export async function publicResearchMemory(row: MemoryRow) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(row.note.trim())))).map(x => x.toString(16).padStart(2, "0")).join("");
  const stale = Boolean(row.noteHash && row.noteHash !== hash);
  const ready = row.analysisStatus === "ready" && !stale && row.noteHash === hash;
  return { paperId: row.paperId, title: row.title, venue: row.venue, note: row.note, updatedAt: row.updatedAt, readingStatus: row.readingStatus,
    status: stale ? "stale" : ready ? "ready" : row.analysisStatus === "error" ? "error" : row.analysisStatus === "needs_more_context" ? "needs_more_context" : "pending",
    takeawayZh: ready ? row.takeawayZh || "" : "", takeawayEn: ready ? row.takeawayEn || "" : "",
    methodsZh: ready ? list(row.methodsZh) : [], methodsEn: ready ? list(row.methodsEn) : [],
    questionsZh: ready ? list(row.questionsZh) : [], questionsEn: ready ? list(row.questionsEn) : [], analyzedAt: ready ? row.analyzedAt : null };
}
export type ResearchMemoryItem = Awaited<ReturnType<typeof publicResearchMemory>>;
export const MEMORY_JOIN_SQL = `FROM paper_reading_progress r JOIN monitored_papers p ON p.id=r.paper_id AND p.space_id=r.space_id
 LEFT JOIN paper_reading_memories m ON m.paper_id=r.paper_id AND m.space_id=r.space_id
 WHERE r.space_id=? AND length(trim(r.note))>0
 AND (?='' OR p.title LIKE ? ESCAPE '\\' OR r.note LIKE ? ESCAPE '\\'
 OR (m.analysis_status='ready' AND datetime(m.analyzed_at)>=datetime(r.updated_at)
 AND (m.takeaway_zh LIKE ? ESCAPE '\\' OR m.takeaway_en LIKE ? ESCAPE '\\' OR m.methods_zh LIKE ? ESCAPE '\\'
 OR m.methods_en LIKE ? ESCAPE '\\' OR m.questions_zh LIKE ? ESCAPE '\\' OR m.questions_en LIKE ? ESCAPE '\\')))`;
export function memorySearchBindings(spaceId: string, query: string) {
  const escaped = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  return [spaceId, query, ...Array(8).fill(escaped)];
}
