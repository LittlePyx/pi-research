function nonNegativeInteger(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

/**
 * Keep one verifier request on a single content pass while allowing several
 * complete drafts to share that request. The first pending draft controls the
 * phase, so correction drafts can never be mixed with first-pass audits.
 */
export function selectVerificationPhaseBatch(entries, limit = 3) {
  const pending = Array.isArray(entries) ? entries : [];
  const boundedLimit = Math.max(1, nonNegativeInteger(limit));
  const first = pending.find((entry) => entry?.ready);
  if (!first) return [];
  const correctionMode = Boolean(first.correctionRequested);
  return pending
    .filter((entry) => entry?.ready && Boolean(entry.correctionRequested) === correctionMode)
    .slice(0, boundedLimit);
}

/**
 * Build a compact, internal-only outcome record for later query/source/route
 * calibration. It deliberately contains aggregate identifiers and counters,
 * never generated recommendation prose or user notes.
 */
export function buildRecommendationQualitySnapshot(input = {}) {
  const published = nonNegativeInteger(input.published);
  const totalTokens = [
    input.reviewInputTokens,
    input.reviewOutputTokens,
    input.verificationInputTokens,
    input.verificationOutputTokens,
  ].reduce((sum, value) => sum + nonNegativeInteger(value), 0);
  const horizons = { days: 0, months: 0, years: 0 };
  const directions = new Set();
  const routes = new Set();
  for (const paper of Array.isArray(input.publishedPapers) ? input.publishedPapers : []) {
    if (paper?.horizon in horizons) horizons[paper.horizon] += 1;
    if (paper?.directionKey) directions.add(String(paper.directionKey));
    for (const routeId of Array.isArray(paper?.routeIds) ? paper.routeIds : []) {
      if (routeId) routes.add(String(routeId));
    }
  }
  const firstRecommendationMs = Number.isFinite(Number(input.firstRecommendationMs))
    ? Math.max(0, Math.round(Number(input.firstRecommendationMs)))
    : null;
  return {
    qualityGateUnchanged: true,
    discovered: nonNegativeInteger(input.discovered),
    newCandidates: nonNegativeInteger(input.newCandidates),
    screened: nonNegativeInteger(input.screened),
    deepScheduled: nonNegativeInteger(input.deepScheduled),
    deepCompleted: nonNegativeInteger(input.deepCompleted),
    deepDeferred: nonNegativeInteger(input.deepDeferred),
    verificationPending: nonNegativeInteger(input.verificationPending),
    verificationFailed: nonNegativeInteger(input.verificationFailed),
    published,
    targetReached: published >= 3,
    horizonMix: horizons,
    uniqueDirections: directions.size,
    coveredRoutes: routes.size,
    firstRecommendationMs,
    modelTokens: totalTokens,
    tokensPerPublished: published ? Math.round(totalTokens / published) : null,
  };
}

/**
 * Internal production sentinel. A shortfall is a calibration signal, not
 * permission to weaken the recommendation gate. Structural counter or stage
 * contradictions are failures; a clean scan below target remains on watch.
 */
export function evaluateRecommendationAcceptanceGate(input = {}) {
  const discovered = nonNegativeInteger(input.discovered);
  const newCandidates = nonNegativeInteger(input.newCandidates);
  const screened = nonNegativeInteger(input.screened);
  const deepScheduled = nonNegativeInteger(input.deepScheduled);
  const deepCompleted = nonNegativeInteger(input.deepCompleted);
  const deepDeferred = nonNegativeInteger(input.deepDeferred);
  const verificationPending = nonNegativeInteger(input.verificationPending);
  const published = nonNegativeInteger(input.published);
  const target = Math.max(1, nonNegativeInteger(input.target) || 3);
  const invariantViolations = [];
  if (newCandidates > discovered) invariantViolations.push("new_candidates_exceed_discovered");
  if (screened > discovered) invariantViolations.push("screened_exceeds_discovered");
  if (deepCompleted > deepScheduled) invariantViolations.push("deep_completed_exceeds_scheduled");
  if (published > deepCompleted) invariantViolations.push("published_exceeds_deep_completed");
  if (discovered > 0 && screened === 0) invariantViolations.push("screening_stalled");
  if (screened > 0 && deepScheduled === 0) invariantViolations.push("deep_review_not_scheduled");
  if (deepScheduled > 0 && deepCompleted === 0 && deepDeferred === 0) invariantViolations.push("deep_review_stalled");

  const reasons = [...invariantViolations];
  if (published < target) reasons.push("formal_target_shortfall");
  if (verificationPending) reasons.push("verification_pending");
  if (deepDeferred) reasons.push("deep_review_deferred");
  const status = invariantViolations.length ? "fail" : published >= target ? "pass" : "watch";
  return {
    status,
    target,
    targetReached: published >= target,
    qualityGateUnchanged: true,
    reasons,
    invariantViolations,
    shouldReplan: status === "watch" && verificationPending === 0,
  };
}
