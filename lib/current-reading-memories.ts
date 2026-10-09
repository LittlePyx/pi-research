import { readingNoteHash } from './reading-note-consistency.mjs';

type CurrentMemory = {
  paper_id: string; note_hash: string; current_note: string;
  takeaway_zh: string; takeaway_en: string; methods_zh: string; methods_en: string;
  questions_zh: string; questions_en: string; connections_zh: string; connections_en: string;
  topics_zh: string; topics_en: string;
};

/** Model context must not reuse legacy ready rows whose source note has changed. */
export async function currentReadingMemories(database: D1Database, spaceId: string, limit: number, recentOnly = false) {
  const results: Omit<CurrentMemory, "note_hash" | "current_note">[] = [];
  for (let offset = 0; results.length < limit; offset += 100) {
    const page = await database.prepare(`SELECT m.paper_id,m.note_hash,r.note AS current_note,
      m.takeaway_zh,m.takeaway_en,m.methods_zh,m.methods_en,m.questions_zh,m.questions_en,
      m.connections_zh,m.connections_en,m.topics_zh,m.topics_en
      FROM paper_reading_memories m JOIN paper_reading_progress r ON r.space_id=m.space_id AND r.paper_id=m.paper_id
      WHERE m.space_id=? AND m.analysis_status='ready' AND length(trim(r.note))>0
      AND (?=0 OR m.updated_at>=datetime('now','-7 days')) ORDER BY m.updated_at DESC,m.id LIMIT 100 OFFSET ?`)
      .bind(spaceId, recentOnly ? 1 : 0, offset).all<CurrentMemory>();
    for (const row of page.results) {
      const {current_note, note_hash, ...memory} = row;
      if (await readingNoteHash(current_note) === note_hash) results.push(memory);
      if (results.length >= limit) break;
    }
    if (page.results.length < 100) break;
  }
  return { results };
}
