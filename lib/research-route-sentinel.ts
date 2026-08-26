export type ResearchRouteSentinelSnapshot = {
  readyZeroCount: number;
  partialZeroCount: number;
  retryableCount: number;
  retryableDueCount: number;
  retryableExhaustedCount: number;
  routeCandidateCount: number;
  sharedQueueCount: number;
  routeReviewedCount: number;
  routeRecommendedCount: number;
  monitoredPaperCount: number;
  formalRoutePaperCount: number;
  recommendationHistoryCount: number;
  feedbackHistoryCount: number;
  readingHistoryCount: number;
  routeRetryEventCount: number;
  routeRetrySuccessCount: number;
};

export type ResearchRouteSentinelEvaluation = {
  outcome: "success" | "degraded" | "failed";
  issues: string[];
  historyRegressions: string[];
  retryConvergenceRate: number | null;
};

const HISTORY_FIELDS = [
  "monitoredPaperCount",
  "formalRoutePaperCount",
  "recommendationHistoryCount",
  "feedbackHistoryCount",
  "readingHistoryCount",
] as const;

function count(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function evaluateResearchRouteSentinel(
  current: ResearchRouteSentinelSnapshot,
  previous: ResearchRouteSentinelSnapshot | null,
): ResearchRouteSentinelEvaluation {
  const issues: string[] = [];
  if (current.readyZeroCount > 0) issues.push("ready_without_visible_evidence");
  if (current.partialZeroCount > 0) issues.push("partial_without_visible_evidence");
  if (current.retryableExhaustedCount > 0) issues.push("retryable_past_attempt_cap");
  if (current.sharedQueueCount < current.routeCandidateCount) issues.push("shared_queue_feed_gap");
  const historyRegressions = previous ? HISTORY_FIELDS
    .filter((field) => current[field] < previous[field]) : [];
  if (historyRegressions.length) issues.push("history_count_regression");
  const retryConvergenceRate = current.routeRetryEventCount > 0
    ? Math.round((current.routeRetrySuccessCount / current.routeRetryEventCount) * 1000) / 1000
    : null;
  return {
    outcome: historyRegressions.length ? "failed" : issues.length ? "degraded" : "success",
    issues,
    historyRegressions: [...historyRegressions],
    retryConvergenceRate,
  };
}

function parsePreviousSnapshot(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { snapshot?: Partial<ResearchRouteSentinelSnapshot> };
    if (!parsed.snapshot) return null;
    return Object.fromEntries(Object.keys(parsed.snapshot).map((key) => [key, count(parsed.snapshot?.[key as keyof ResearchRouteSentinelSnapshot])])) as unknown as ResearchRouteSentinelSnapshot;
  } catch {
    return null;
  }
}

export async function recordResearchRouteSentinel(database: D1Database, spaceId: string) {
  const [row, previousRow] = await Promise.all([
    database.prepare(
      `WITH route_candidates AS (
        SELECT DISTINCT candidate.paper_id
        FROM monitor_candidate_sources candidate
        JOIN monitored_papers paper ON paper.id = candidate.paper_id AND paper.space_id = candidate.space_id
        JOIN monitor_discovery_coverage coverage ON coverage.space_id = candidate.space_id
         AND coverage.horizon = paper.horizon AND coverage.source_key = candidate.source_key
         AND coverage.query_key = candidate.query_key
        WHERE candidate.space_id = ? AND COALESCE(coverage.route_id, '') <> ''
       )
       SELECT
        (SELECT COUNT(*) FROM research_tracks track WHERE track.space_id = ? AND track.build_status = 'ready'
         AND NOT EXISTS (SELECT 1 FROM research_track_papers paper WHERE paper.space_id = track.space_id AND paper.track_id = track.id)) AS ready_zero_count,
        (SELECT COUNT(*) FROM research_tracks track WHERE track.space_id = ? AND track.build_status = 'partial'
         AND NOT EXISTS (SELECT 1 FROM research_track_papers paper WHERE paper.space_id = track.space_id AND paper.track_id = track.id)) AS partial_zero_count,
        (SELECT COUNT(*) FROM research_tracks WHERE space_id = ? AND build_status = 'retryable') AS retryable_count,
        (SELECT COUNT(*) FROM research_tracks WHERE space_id = ? AND build_status = 'retryable'
         AND (build_retry_at IS NULL OR datetime(build_retry_at) <= CURRENT_TIMESTAMP)) AS retryable_due_count,
        (SELECT COUNT(*) FROM research_tracks WHERE space_id = ? AND build_status = 'retryable' AND build_attempt_count >= 3) AS retryable_exhausted_count,
        (SELECT COUNT(*) FROM route_candidates) AS route_candidate_count,
        (SELECT COUNT(*) FROM route_candidates candidate JOIN paper_insights insight ON insight.paper_id = candidate.paper_id AND insight.space_id = ?) AS shared_queue_count,
        (SELECT COUNT(*) FROM route_candidates candidate JOIN paper_insights insight ON insight.paper_id = candidate.paper_id AND insight.space_id = ?
         WHERE insight.analysis_source <> 'metadata' OR insight.analysis_model <> '') AS route_reviewed_count,
        (SELECT COUNT(*) FROM route_candidates candidate JOIN paper_insights insight ON insight.paper_id = candidate.paper_id AND insight.space_id = ?
         WHERE insight.ever_recommended = 1) AS route_recommended_count,
        (SELECT COUNT(*) FROM monitored_papers WHERE space_id = ?) AS monitored_paper_count,
        (SELECT COUNT(*) FROM research_track_papers WHERE space_id = ?) AS formal_route_paper_count,
        (SELECT COUNT(*) FROM paper_insights WHERE space_id = ? AND ever_recommended = 1) AS recommendation_history_count,
        (SELECT COUNT(*) FROM paper_feedback WHERE space_id = ?) AS feedback_history_count,
        (SELECT COUNT(*) FROM paper_reading_progress WHERE space_id = ?) AS reading_history_count,
        (SELECT COUNT(*) FROM monitor_reliability_events WHERE space_id = ? AND kind = 'research_route_retry') AS route_retry_event_count,
        (SELECT COUNT(*) FROM monitor_reliability_events WHERE space_id = ? AND kind = 'research_route_retry' AND outcome = 'success') AS route_retry_success_count`,
    ).bind(spaceId, spaceId, spaceId, spaceId, spaceId, spaceId, spaceId, spaceId, spaceId,
      spaceId, spaceId, spaceId, spaceId, spaceId, spaceId, spaceId).first<Record<string, unknown>>(),
    database.prepare(
      `SELECT metadata_json FROM monitor_reliability_events
       WHERE space_id = ? AND kind = 'research_route_sentinel'
       ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 1`,
    ).bind(spaceId).first<{ metadata_json: string }>(),
  ]);

  const snapshot: ResearchRouteSentinelSnapshot = {
    readyZeroCount: count(row?.ready_zero_count),
    partialZeroCount: count(row?.partial_zero_count),
    retryableCount: count(row?.retryable_count),
    retryableDueCount: count(row?.retryable_due_count),
    retryableExhaustedCount: count(row?.retryable_exhausted_count),
    routeCandidateCount: count(row?.route_candidate_count),
    sharedQueueCount: count(row?.shared_queue_count),
    routeReviewedCount: count(row?.route_reviewed_count),
    routeRecommendedCount: count(row?.route_recommended_count),
    monitoredPaperCount: count(row?.monitored_paper_count),
    formalRoutePaperCount: count(row?.formal_route_paper_count),
    recommendationHistoryCount: count(row?.recommendation_history_count),
    feedbackHistoryCount: count(row?.feedback_history_count),
    readingHistoryCount: count(row?.reading_history_count),
    routeRetryEventCount: count(row?.route_retry_event_count),
    routeRetrySuccessCount: count(row?.route_retry_success_count),
  };
  const evaluation = evaluateResearchRouteSentinel(snapshot, parsePreviousSnapshot(previousRow?.metadata_json));
  await database.prepare(
    `INSERT INTO monitor_reliability_events
     (id, space_id, kind, stage, source, outcome, error_code, message, metadata_json)
     VALUES (?, ?, 'research_route_sentinel', 'scheduled', 'research-route', ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), spaceId, evaluation.outcome,
    evaluation.issues.join(","),
    evaluation.issues.length ? `Research route sentinel: ${evaluation.issues.join(",")}` : "Research route sentinel healthy",
    JSON.stringify({ snapshot, ...evaluation }),
  ).run();
  return { snapshot, ...evaluation };
}
