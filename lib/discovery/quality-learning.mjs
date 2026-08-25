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
