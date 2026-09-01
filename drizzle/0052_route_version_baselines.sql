INSERT OR IGNORE INTO research_route_revisions
 (id, space_id, track_id, version, status, input_revision,
  title_zh, title_en, summary_zh, summary_en, rationale_zh, rationale_en,
  previous_title_zh, previous_title_en, previous_summary_zh, previous_summary_en,
  previous_search_queries_json, search_queries_json,
  source_paper_ids_json, source_statement_ids_json, source_papers_json, source_statements_json,
  confidence, model, decided_at, created_at, updated_at)
SELECT 'route-baseline:' || track.id, track.space_id, track.id, 1, 'confirmed',
 'route-baseline:' || track.id,
 track.title_zh, track.title_en, track.summary_zh, track.summary_en,
 '系统记录的初始正式路线基线；没有改变路线内容、检索词或历史证据。',
 'System-recorded baseline of the existing formal route. It changes no route content, queries, or historical evidence.',
 track.title_zh, track.title_en, track.summary_zh, track.summary_en,
 track.search_queries, track.search_queries,
 '[]', '[]', '[]', '[]', 0, 'system-baseline',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM research_tracks track
WHERE NOT EXISTS (
 SELECT 1 FROM research_route_revisions revision WHERE revision.track_id = track.id
);
