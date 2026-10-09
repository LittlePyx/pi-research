export async function readingNoteHash(note) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(note));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// The memory ID is an analysis attempt token, not a stable public identity.
export function readingNoteGuard(spaceId, paperId, note, attemptId, noteHash) {
  return {
    sql: `EXISTS (SELECT 1 FROM paper_reading_memories m
      JOIN paper_reading_progress r ON r.space_id=m.space_id AND r.paper_id=m.paper_id
      WHERE m.space_id=? AND m.paper_id=? AND r.note=? AND m.id=? AND m.note_hash=?
      AND m.analysis_status IN ('pending','ready'))`,
    values: [spaceId, paperId, note, attemptId, noteHash],
  };
}

// Include these in the same transaction as the reading progress write.
export function invalidateReadingNoteStatements(db, spaceId, paperId, noteHash) {
  return [
    db.prepare(`DELETE FROM monitor_query_plans WHERE space_id=? AND plan_date>=date('now')
      AND (EXISTS (SELECT 1 FROM paper_reading_memories WHERE space_id=? AND paper_id=? AND note_hash<>?)
      OR EXISTS (SELECT 1 FROM research_preference_signals WHERE space_id=? AND source_type='reading_note'
        AND substr(source_id,1,length(?))=? AND substr(source_id,length(?)+1,64)<>? AND active=1))`)
      .bind(spaceId, spaceId, paperId, noteHash, spaceId, paperId+':', paperId+':', paperId+':', noteHash),
    db.prepare(`UPDATE paper_reading_memories SET analysis_status='stale', error=NULL, updated_at=CURRENT_TIMESTAMP
      WHERE space_id=? AND paper_id=? AND note_hash<>?`).bind(spaceId, paperId, noteHash),
    db.prepare(`UPDATE research_preference_signals SET active=0, updated_at=CURRENT_TIMESTAMP
      WHERE space_id=? AND source_type='reading_note' AND substr(source_id,1,length(?))=?
      AND substr(source_id,length(?)+1,64)<>?`).bind(spaceId, paperId+':', paperId+':', paperId+':', noteHash),
  ];
}
