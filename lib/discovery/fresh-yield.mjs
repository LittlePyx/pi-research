function uniqueSet(values) {
  return new Set((values || []).filter((value) => typeof value === "string" && value));
}

export function formalYieldBranchAdjustment(input) {
  const reviewed = Math.max(0, Number(input.deepReviewed || 0));
  if (!reviewed) return 0;
  const recommended = Math.min(reviewed, Math.max(0, Number(input.formalRecommended || 0)));
  const evidenceRejected = Math.min(reviewed, Math.max(0, Number(input.evidenceRejected || 0)));
  const confidence = Math.min(1, reviewed / 6);
  const formalHitRate = recommended / reviewed;
  const evidenceFailureRate = evidenceRejected / reviewed;
  return Math.round(((formalHitRate - 0.25) * 28 - evidenceFailureRate * 12) * confidence);
}

export function buildFreshYieldFunnel(input) {
  const current = uniqueSet(input.currentCandidateIds);
  const screened = uniqueSet((input.screens || []).map((screen) => screen.canonicalId));
  const deepScheduled = uniqueSet(input.deepIds);
  const deepCompleted = uniqueSet(input.deepCompletedIds);
  const deepDeferred = uniqueSet(input.deepDeferredIds);
  const reviews = input.reviews || [];
  const freshReviews = reviews.filter((review) => current.has(review.canonicalId));
  const freshRecommended = freshReviews.filter((review) => review.recommended
    && !review.verificationRetryable
    && (review.verificationStatus === "verified" || review.verificationStatus === "revised")).length;
  const freshVerificationPending = freshReviews.filter((review) => review.verificationRetryable).length;
  const freshEvidenceRejected = freshReviews.filter((review) => review.verificationStatus === "degraded").length;
  const freshDiscovered = current.size;
  const freshScreened = [...current].filter((id) => screened.has(id)).length;
  const freshDeepScheduled = [...current].filter((id) => deepScheduled.has(id)).length;
  const freshDeepCompleted = [...current].filter((id) => deepCompleted.has(id)
    || freshReviews.some((review) => review.canonicalId === id)).length;
  const freshDeepDeferred = [...current].filter((id) => deepDeferred.has(id)).length;

  let diagnosis = "healthy_fresh_yield";
  if (!freshRecommended) {
    if (!freshDiscovered) diagnosis = "no_new_candidates";
    else if (!freshScreened) diagnosis = "fresh_not_screened";
    else if (!freshDeepScheduled) diagnosis = "fresh_not_selected_for_deep_review";
    else if (freshDeepDeferred || !freshDeepCompleted) diagnosis = "fresh_deep_review_unavailable";
    else if (freshVerificationPending) diagnosis = "fresh_verification_pending";
    else if (freshEvidenceRejected) diagnosis = "fresh_evidence_audit_failed";
    else diagnosis = "fresh_model_quality_rejection";
  }

  return {
    freshDiscovered,
    freshScreened,
    freshDeepScheduled,
    freshDeepCompleted,
    freshDeepDeferred,
    freshVerificationPending,
    freshEvidenceRejected,
    freshRecommended,
    currentToFormalRate: freshDiscovered ? Math.round(freshRecommended / freshDiscovered * 100) : 0,
    deepToFormalRate: freshDeepCompleted ? Math.round(freshRecommended / freshDeepCompleted * 100) : 0,
    diagnosis,
  };
}

export function shouldRefreshFreshYieldPlan(funnel) {
  if (funnel.freshRecommended > 0 || funnel.freshVerificationPending > 0 || funnel.freshDeepDeferred > 0) return false;
  return [
    "no_new_candidates",
    "fresh_not_screened",
    "fresh_not_selected_for_deep_review",
    "fresh_evidence_audit_failed",
    "fresh_model_quality_rejection",
  ].includes(funnel.diagnosis);
}
