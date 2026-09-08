/** Internal only. The caller must authorize spaceId before invoking this reader.
 * No HTTP route, credentials, model calls, migrations or state transitions.
 */
export async function readPaperDiagnostic(database, spaceId, canonicalIds) {
  if (typeof spaceId !== 'string' || !spaceId.trim() || spaceId.length > 128) throw new Error('invalid_space');
  if (!Array.isArray(canonicalIds) || !canonicalIds.length || canonicalIds.length > 8
    || canonicalIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 300)) throw new Error('invalid_identities');
  const ids = [...new Set(canonicalIds)];
  const papers = await database.prepare(`SELECT p.id, p.canonical_id,
    CASE WHEN i.paper_id IS NULL THEN NULL ELSE length(trim(i.abstract_text)) END AS abstract_characters,
    i.analysis_source, i.verification_status, i.ever_recommended, i.updated_at,
    (SELECT COUNT(*) FROM monitor_candidate_sources cs WHERE cs.space_id = p.space_id AND cs.paper_id = p.id) AS source_count,
    (SELECT COUNT(*) FROM monitor_candidate_sources cs WHERE cs.space_id = p.space_id AND cs.paper_id = p.id
      AND cs.source_key = 'research-route:learning') AS learning_source_count
    FROM monitored_papers p LEFT JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
    WHERE p.space_id = ? AND p.canonical_id IN (${ids.map(() => '?').join(',')})
    ORDER BY p.canonical_id LIMIT 8`).bind(spaceId, ...ids).all();
  const jobs = await database.prepare(`SELECT id, status, checkpoint, started_at, work_queue_json
    FROM monitor_scan_jobs WHERE space_id = ? ORDER BY started_at DESC, id DESC LIMIT 5`).bind(spaceId).all();
  const byIdentity = new Map(papers.results.map(paper => [paper.canonical_id, paper]));
  return {
    scope: { spaceId, jobWindow: 'latest_five', historicalAbsenceIsUnknown: true },
    papers: ids.map(canonicalId => {
      const paper = byIdentity.get(canonicalId);
      return {
        canonicalId, found: Boolean(paper),
        evidence: { abstractCharacters: paper?.abstract_characters ?? null,
          availability: !paper || paper.abstract_characters == null ? 'unknown' : paper.abstract_characters > 0 ? 'stored' : 'missing' },
        review: { analysisSource: paper?.analysis_source ?? null, verificationStatus: paper?.verification_status ?? null,
          everRecommended: paper?.ever_recommended == null ? null : Boolean(paper.ever_recommended), updatedAt: paper?.updated_at ?? null },
        provenance: { sourceCount: paper?.source_count ?? null, learningSourceCount: paper?.learning_source_count ?? null },
        recentJobs: jobs.results.map(job => {
          let work;
          try { work = JSON.parse(job.work_queue_json); } catch { work = null; }
          const includes = key => Array.isArray(work?.[key]) ? work[key].includes(canonicalId) : null;
          return { id: job.id, status: job.status, checkpoint: job.checkpoint, startedAt: job.started_at,
            candidate: includes('candidateIds'), selectedForDeepReview: includes('deepIds'),
            screened: Array.isArray(work?.screens) ? work.screens.some(screen => screen?.canonicalId === canonicalId) : null };
        }),
        // Do not infer final learning-stage eligibility from score or age.
        learningStageEligibility: 'not_evaluated_by_this_reader',
      };
    }),
  };
}
