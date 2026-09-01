export type ResearchRouteEffectivenessVerdict = "observing" | "retain" | "reconsider";

export type ResearchRouteEffectivenessMetrics = {
  revisionId: string;
  trackId: string;
  version: number;
  windowStartedAt: string;
  windowEndedAt: string | null;
  candidateCount: number;
  deepReviewedCount: number;
  recommendedCount: number;
  acceptedCount: number;
  readingStartedCount: number;
  readingCompletedCount: number;
  formalEvidenceCount: number;
  synthesisUpdateCount: number;
  problemAssessmentCount: number;
  sourceFailureCount: number;
};

export type ResearchRouteEffectiveness = ResearchRouteEffectivenessMetrics & {
  verdict: ResearchRouteEffectivenessVerdict;
  confidence: number;
  deepReviewRate: number;
  recommendationRate: number;
  acceptanceRate: number;
  recommendationRateDelta: number | null;
  summaryZh: string;
  summaryEn: string;
};

export type ResearchRouteEffectivenessRow = {
  revision_id: string;
  track_id: string;
  version: number;
  window_started_at: string;
  window_ended_at: string | null;
  candidate_count: number;
  deep_reviewed_count: number;
  recommended_count: number;
  accepted_count: number;
  reading_started_count: number;
  reading_completed_count: number;
  formal_evidence_count: number;
  synthesis_update_count: number;
  problem_assessment_count: number;
  source_failure_count: number;
};

/**
 * Every metric is attributed to the version that was formal when the durable
 * event happened. Delayed feedback, reading and evidence confirmation stay
 * attached to the recommendation that introduced the paper, even after a
 * later route version is confirmed.
 */
export const RESEARCH_ROUTE_VERSION_EFFECT_SQL = `WITH formal_versions AS (
  SELECT revision.id AS revision_id, revision.space_id, revision.track_id, revision.version,
   revision.decided_at AS window_started_at,
   (SELECT MIN(next_revision.decided_at) FROM research_route_revisions next_revision
    WHERE next_revision.space_id = revision.space_id AND next_revision.track_id = revision.track_id
     AND next_revision.version > revision.version
     AND next_revision.status IN ('confirmed', 'superseded') AND next_revision.decided_at IS NOT NULL) AS window_ended_at
  FROM research_route_revisions revision
  WHERE revision.space_id = ? AND revision.status IN ('confirmed', 'superseded')
   AND revision.decided_at IS NOT NULL
 ), ranked_versions AS (
  SELECT formal_versions.*,
   ROW_NUMBER() OVER (PARTITION BY track_id ORDER BY version DESC, revision_id DESC) AS version_rank
  FROM formal_versions
 ), version_windows AS (
  SELECT * FROM ranked_versions WHERE version_rank <= 8
 ), route_candidates AS (
  SELECT DISTINCT version.revision_id, candidate.paper_id
  FROM version_windows version
  JOIN monitor_discovery_coverage coverage ON coverage.space_id = version.space_id
   AND coverage.route_id = version.track_id
  JOIN monitor_candidate_sources candidate ON candidate.space_id = coverage.space_id
   AND candidate.source_key = coverage.source_key AND candidate.query_key = coverage.query_key
  JOIN monitored_papers paper ON paper.id = candidate.paper_id AND paper.space_id = candidate.space_id
   AND paper.horizon = coverage.horizon
  WHERE datetime(candidate.first_seen_at) >= datetime(version.window_started_at)
   AND (version.window_ended_at IS NULL OR datetime(candidate.first_seen_at) < datetime(version.window_ended_at))
 ), route_audits AS (
  SELECT DISTINCT version.revision_id, audit.paper_id, audit.reviewed_at, audit.recommended, audit.is_paper
  FROM version_windows version
  JOIN recommendation_audit_events audit ON audit.space_id = version.space_id
  JOIN json_each(audit.provenance_json) origin
  WHERE json_extract(origin.value, '$.routeId') = version.track_id
   AND datetime(audit.reviewed_at) >= datetime(version.window_started_at)
   AND (version.window_ended_at IS NULL OR datetime(audit.reviewed_at) < datetime(version.window_ended_at))
 ), recommended_papers AS (
  SELECT DISTINCT revision_id, paper_id FROM route_audits WHERE recommended = 1 AND is_paper = 1
 )
 SELECT version.revision_id, version.track_id, version.version,
  version.window_started_at, version.window_ended_at,
  (SELECT COUNT(*) FROM route_candidates candidate WHERE candidate.revision_id = version.revision_id) AS candidate_count,
  (SELECT COUNT(DISTINCT audit.paper_id) FROM route_audits audit
   WHERE audit.revision_id = version.revision_id AND audit.is_paper = 1) AS deep_reviewed_count,
  (SELECT COUNT(*) FROM recommended_papers recommendation
   WHERE recommendation.revision_id = version.revision_id) AS recommended_count,
  (SELECT COUNT(*) FROM recommended_papers recommendation
   WHERE recommendation.revision_id = version.revision_id AND EXISTS (
    SELECT 1 FROM paper_feedback feedback
    WHERE feedback.space_id = version.space_id AND feedback.paper_id = recommendation.paper_id
     AND (feedback.feedback = 'relevant' OR feedback.saved = 1)
   )) AS accepted_count,
  (SELECT COUNT(*) FROM recommended_papers recommendation
   WHERE recommendation.revision_id = version.revision_id AND EXISTS (
    SELECT 1 FROM paper_reading_progress reading
    WHERE reading.space_id = version.space_id AND reading.paper_id = recommendation.paper_id
     AND (reading.started_at IS NOT NULL OR reading.status IN ('reading', 'read', 'mastered', 'cited'))
   )) AS reading_started_count,
  (SELECT COUNT(*) FROM recommended_papers recommendation
   WHERE recommendation.revision_id = version.revision_id AND EXISTS (
    SELECT 1 FROM paper_reading_progress reading
    WHERE reading.space_id = version.space_id AND reading.paper_id = recommendation.paper_id
     AND (reading.completed_at IS NOT NULL OR reading.status IN ('read', 'mastered', 'cited'))
   )) AS reading_completed_count,
  (SELECT COUNT(*) FROM recommended_papers recommendation
   WHERE recommendation.revision_id = version.revision_id AND EXISTS (
    SELECT 1 FROM research_map_evidence_proposals proposal
    WHERE proposal.space_id = version.space_id AND proposal.track_id = version.track_id
     AND proposal.paper_id = recommendation.paper_id AND proposal.status = 'confirmed'
   )) AS formal_evidence_count,
  (SELECT COUNT(*) FROM research_synthesis_revisions synthesis
   WHERE synthesis.space_id = version.space_id AND synthesis.track_id = version.track_id
    AND datetime(synthesis.created_at) >= datetime(version.window_started_at)
    AND (version.window_ended_at IS NULL OR datetime(synthesis.created_at) < datetime(version.window_ended_at))) AS synthesis_update_count,
  (SELECT COUNT(*) FROM research_problem_assessments assessment
   WHERE assessment.space_id = version.space_id AND assessment.track_id = version.track_id
    AND datetime(assessment.created_at) >= datetime(version.window_started_at)
    AND (version.window_ended_at IS NULL OR datetime(assessment.created_at) < datetime(version.window_ended_at))) AS problem_assessment_count,
  (SELECT COUNT(*) FROM monitor_reliability_events failure
   WHERE failure.space_id = version.space_id AND failure.kind = 'source_degraded'
    AND json_extract(failure.metadata_json, '$.routeId') = version.track_id
    AND datetime(failure.created_at) >= datetime(version.window_started_at)
    AND (version.window_ended_at IS NULL OR datetime(failure.created_at) < datetime(version.window_ended_at))) AS source_failure_count
 FROM version_windows version ORDER BY version.track_id, version.version DESC`;

function count(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round(numerator / denominator * 100) : 0;
}

export function researchRouteEffectivenessMetrics(row: ResearchRouteEffectivenessRow): ResearchRouteEffectivenessMetrics {
  return {
    revisionId: row.revision_id,
    trackId: row.track_id,
    version: count(row.version),
    windowStartedAt: row.window_started_at,
    windowEndedAt: row.window_ended_at || null,
    candidateCount: count(row.candidate_count),
    deepReviewedCount: count(row.deep_reviewed_count),
    recommendedCount: count(row.recommended_count),
    acceptedCount: count(row.accepted_count),
    readingStartedCount: count(row.reading_started_count),
    readingCompletedCount: count(row.reading_completed_count),
    formalEvidenceCount: count(row.formal_evidence_count),
    synthesisUpdateCount: count(row.synthesis_update_count),
    problemAssessmentCount: count(row.problem_assessment_count),
    sourceFailureCount: count(row.source_failure_count),
  };
}

export function evaluateResearchRouteEffectiveness(
  metrics: ResearchRouteEffectivenessMetrics,
  previous: ResearchRouteEffectivenessMetrics | null = null,
): ResearchRouteEffectiveness {
  const deepReviewRate = rate(metrics.deepReviewedCount, metrics.candidateCount);
  const recommendationRate = rate(metrics.recommendedCount, metrics.deepReviewedCount);
  const acceptanceRate = rate(metrics.acceptedCount, metrics.recommendedCount);
  const previousRecommendationRate = previous && previous.deepReviewedCount >= 5 && previous.sourceFailureCount === 0
    ? rate(previous.recommendedCount, previous.deepReviewedCount)
    : null;
  const recommendationRateDelta = previousRecommendationRate === null || metrics.deepReviewedCount < 5
    ? null
    : recommendationRate - previousRecommendationRate;
  const positiveOutcome = metrics.acceptedCount > 0 || metrics.readingCompletedCount > 0 || metrics.formalEvidenceCount > 0;
  const degradedObservation = metrics.sourceFailureCount > 0 && !positiveOutcome;
  const materiallyWorse = recommendationRateDelta !== null && recommendationRateDelta <= -15;

  let verdict: ResearchRouteEffectivenessVerdict = "observing";
  let summaryZh = "样本仍在积累，暂不把短期波动解释为路线优劣。";
  let summaryEn = "The sample is still accumulating, so short-term variation is not yet treated as route quality.";
  if (degradedObservation) {
    summaryZh = "观察窗口包含上游来源降级；当前低产出不能归因于路线本身，继续观察且不建议回退。";
    summaryEn = "The window includes upstream source degradation. Low yield cannot be attributed to the route, so observation continues without a rollback recommendation.";
  } else if (metrics.sourceFailureCount === 0 && ((metrics.deepReviewedCount >= 8 && metrics.recommendedCount === 0) || (metrics.deepReviewedCount >= 5 && materiallyWorse && !positiveOutcome))) {
    verdict = "reconsider";
    summaryZh = materiallyWorse
      ? "在可比较样本中，正式推荐率明显低于上一版本且尚无下游正向结果；建议人工考虑恢复上一版检索重心。"
      : "已有足够深评样本但没有论文通过最终质量门槛；建议人工检查并考虑恢复上一版检索重心。";
    summaryEn = materiallyWorse
      ? "With a comparable sample, the formal recommendation rate is materially below the prior version and no downstream positive outcome exists. Consider manually restoring the prior search focus."
      : "Enough papers have been deeply reviewed without one passing the final quality gate. Manually inspect the route and consider restoring the prior search focus.";
  } else if (positiveOutcome) {
    verdict = "retain";
    summaryZh = "该版本已产生接受、完成阅读或正式路线证据，当前建议保留；后续仍持续比较质量而非追求数量。";
    summaryEn = "This version has produced an acceptance, completed reading, or formal route evidence. Retain it for now while continuing quality-focused comparison.";
  }

  const evidenceVolume = Math.min(55, metrics.deepReviewedCount * 5 + metrics.recommendedCount * 8);
  const outcomeVolume = Math.min(25, metrics.acceptedCount * 10 + metrics.readingCompletedCount * 8 + metrics.formalEvidenceCount * 7);
  const comparisonVolume = recommendationRateDelta === null ? 0 : 15;
  const confidence = Math.min(95, Math.max(20, 20 + evidenceVolume + outcomeVolume + comparisonVolume));
  return {
    ...metrics,
    verdict,
    confidence,
    deepReviewRate,
    recommendationRate,
    acceptanceRate,
    recommendationRateDelta,
    summaryZh,
    summaryEn,
  };
}
