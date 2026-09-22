/** Keep confirmed question routes inside the same bounded review context. */
export async function prioritizedReviewTracks<T>(database: D1Database, spaceId: string, activeTrackIds: string[]) {
  const ids = [...new Set(activeTrackIds.filter(Boolean))].slice(0, 6);
  return database.prepare(`SELECT id, title_zh, title_en, summary_en, search_queries, intelligence_json, intelligence_updated_at
    FROM research_tracks WHERE space_id = ?
    ORDER BY CASE WHEN id IN (${ids.length ? ids.map(() => '?').join(',') : 'NULL'}) THEN 0 ELSE 1 END, position, id
    LIMIT 6`).bind(spaceId, ...ids).all<T>();
}
