const DEFAULT_NEUTRAL_SCORE = 55;
const DEFAULT_FULL_CONFIDENCE_OUTCOMES = 8;

export const ROUTE_BRANCH_OUTCOMES_SQL = `SELECT json_extract(origin.value, '$.routeId') AS route_id,
 COUNT(DISTINCT latest.paper_id) AS papers,
 COUNT(DISTINCT CASE WHEN feedback.saved = 1 OR feedback.feedback = 'relevant'
  OR reading.status IN ('read','mastered','cited') THEN latest.paper_id END) AS accepted,
 COUNT(DISTINCT CASE WHEN feedback.feedback = 'not_relevant'
  AND COALESCE(feedback.reason_code, '') <> 'duplicate_known' THEN latest.paper_id END) AS dismissed,
 COUNT(DISTINCT CASE WHEN feedback.feedback = 'not_relevant'
  AND feedback.reason_code = 'wrong_type' THEN latest.paper_id END) AS wrong_type,
 COUNT(DISTINCT CASE WHEN feedback.reason_code = 'duplicate_known'
  OR reading.status = 'mastered' THEN latest.paper_id END) AS known,
 COUNT(DISTINCT CASE WHEN latest.decision <> 'verification_pending' THEN latest.paper_id END) AS deep_reviewed,
 COUNT(DISTINCT CASE WHEN latest.recommended = 1
  AND latest.verification_status IN ('verified', 'revised') THEN latest.paper_id END) AS formal_recommended,
 COUNT(DISTINCT CASE WHEN latest.verification_status = 'degraded' THEN latest.paper_id END) AS evidence_rejected
 FROM (
  SELECT ranked.* FROM (
   SELECT audit.*, ROW_NUMBER() OVER (
    PARTITION BY audit.space_id, audit.paper_id ORDER BY audit.reviewed_at DESC, audit.rowid DESC
   ) AS audit_rank
   FROM recommendation_audit_events audit WHERE audit.space_id = ?
  ) ranked WHERE ranked.audit_rank = 1
 ) latest
 JOIN json_each(CASE WHEN json_valid(latest.provenance_json) THEN latest.provenance_json ELSE '[]' END) origin
 LEFT JOIN paper_feedback feedback ON feedback.paper_id = latest.paper_id AND feedback.space_id = latest.space_id
 LEFT JOIN paper_reading_progress reading ON reading.paper_id = latest.paper_id AND reading.space_id = latest.space_id
 WHERE COALESCE(json_extract(origin.value, '$.routeId'), '') <> ''
 GROUP BY json_extract(origin.value, '$.routeId')`;

function boundedScore(value) {
  return Math.max(5, Math.min(95, Math.round(Number(value) || DEFAULT_NEUTRAL_SCORE)));
}

/**
 * Carries quality learning across regenerated queries that belong to the same
 * research route. A route needs real review or explicit-feedback outcomes
 * before it can override the source-wide fallback, and small samples are
 * shrunk toward the neutral score so one paper cannot dominate future scans.
 */
export function aggregateRouteBranchScores(branches, options = {}) {
  const neutralScore = boundedScore(options.neutralScore ?? DEFAULT_NEUTRAL_SCORE);
  const fullConfidenceOutcomes = Math.max(1, Math.round(
    Number(options.fullConfidenceOutcomes) || DEFAULT_FULL_CONFIDENCE_OUTCOMES,
  ));
  const buckets = new Map();

  for (const branch of branches || []) {
    const routeId = typeof branch?.routeId === "string" ? branch.routeId.trim() : "";
    const explicitDecisions = Math.max(0, Number(branch?.explicitDecisions) || 0);
    const deepReviewed = Math.max(0, Number(branch?.deepReviewed) || 0);
    const outcomeCount = Math.max(explicitDecisions, deepReviewed);
    if (!routeId || !outcomeCount) continue;

    const weight = Math.min(fullConfidenceOutcomes, outcomeCount);
    const bucket = buckets.get(routeId) || { routeId, weightedScore: 0, weight: 0, outcomes: 0 };
    bucket.weightedScore += boundedScore(branch.score) * weight;
    bucket.weight += weight;
    bucket.outcomes += outcomeCount;
    buckets.set(routeId, bucket);
  }

  return [...buckets.values()].map((bucket) => {
    const rawScore = bucket.weightedScore / Math.max(1, bucket.weight);
    const confidence = Math.min(1, bucket.outcomes / fullConfidenceOutcomes);
    return {
      routeId: bucket.routeId,
      score: boundedScore(neutralScore + (rawScore - neutralScore) * confidence),
      rawScore: boundedScore(rawScore),
      outcomes: bucket.outcomes,
      confidence,
    };
  });
}
