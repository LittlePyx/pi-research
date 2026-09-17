/** One-hop starts from explicit interest or an active route, never arbitrary neighbors. */
export const CITATION_SCAN_SEEDS_SQL = `WITH seeds AS (
 SELECT p.canonical_id,p.doi,p.url,p.title,p.track_id,0 AS priority,p.citation_count
 FROM research_track_papers p JOIN research_tracks t ON t.id=p.track_id AND t.space_id=p.space_id
 WHERE p.space_id=? AND p.curation_status='active' AND COALESCE(t.monitoring_status,'active')='active'
 UNION ALL
 SELECT p.canonical_id,p.doi,p.url,p.title,'' AS track_id,
   CASE WHEN r.status='reading' THEN 1 ELSE 2 END AS priority,p.citation_count
 FROM monitored_papers p
 LEFT JOIN paper_feedback f ON f.paper_id=p.id AND f.space_id=p.space_id
 LEFT JOIN paper_reading_progress r ON r.paper_id=p.id AND r.space_id=p.space_id
 WHERE p.space_id=? AND (f.feedback='relevant' OR r.status='reading')
), eligible AS (
 SELECT *,ROW_NUMBER() OVER (PARTITION BY lower(canonical_id) ORDER BY priority,track_id) AS rank
 FROM seeds s WHERE (NULLIF(trim(doi),'') IS NOT NULL OR url LIKE '%arxiv.org/%' OR canonical_id LIKE 's2:%' OR canonical_id LIKE 'arxiv:%')
 AND NOT EXISTS (SELECT 1 FROM monitored_papers p JOIN paper_feedback f ON f.paper_id=p.id AND f.space_id=p.space_id
  WHERE p.space_id=? AND lower(p.canonical_id)=lower(s.canonical_id) AND f.feedback='not_relevant')
), balanced AS (
 SELECT *,ROW_NUMBER() OVER (PARTITION BY priority ORDER BY citation_count DESC,canonical_id) AS priority_rank
 FROM eligible WHERE rank=1
) SELECT canonical_id,doi,url,title,track_id FROM balanced WHERE priority_rank<=8
 ORDER BY priority,citation_count DESC,canonical_id LIMIT 24`;

export function citationDiscoveryDescription(raw: string) {
  try {
    const data=JSON.parse(raw) as { seedTitle?: string; relation?: string };
    if (!data.seedTitle || !['references','citations'].includes(data.relation || '')) return null;
    return data.relation==='references'
      ? { zh:`被关注论文《${data.seedTitle}》引用`,en:`Referenced by “${data.seedTitle}”` }
      : { zh:`引用了关注论文《${data.seedTitle}》`,en:`Cites “${data.seedTitle}”` };
  } catch { return null; }
}
