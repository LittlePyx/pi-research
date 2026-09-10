// Persisted progress and bounded response metadata; no credentials, prompts,
// user memory or raw model output.
const emitDefault = entry => console.info('Pi review progress', JSON.stringify(entry));
function safeEmit(emit, entry) { try { emit(entry); } catch { /* Diagnostics cannot interrupt review. */ } }
export function traceVerificationResponse(input, emit = emitDefault) {
  const reason = input.finishReason;
  safeEmit(emit, {
    kind: 'verification_response_received', scanJobId: input.scanJobId || null,
    canonicalIds: input.canonicalIds.slice(0, 3), phase: input.correctionMode ? 'correction' : 'audit',
    finishReason: ['stop', 'length', 'content_filter', 'tool_calls'].includes(reason) ? reason : 'unknown',
    outputTokens: Math.max(0, Number(input.outputTokens) || 0),
    contentCharacters: Math.max(0, Number(input.contentCharacters) || 0),
  });
}
export function traceReviewQueue(scanJobId, work, emit = emitDefault) {
  for (const canonicalId of work.deepIds) safeEmit(emit, {
    kind: 'review_queue_saved', scanJobId, canonicalId,
    deepCompleted: work.deepCompletedIds.includes(canonicalId),
    deepDeferred: work.deepDeferredIds.includes(canonicalId),
    verificationQueued: work.verificationIds.includes(canonicalId),
    verificationCompleted: work.verificationCompletedIds.includes(canonicalId),
    verificationDeferred: work.verificationDeferredIds.includes(canonicalId),
    verificationAttempt: work.verificationAttempts?.[canonicalId] || 0,
  });
}
export function traceReviewOutcome(input, emit = emitDefault) {
  const { review, candidate } = input;
  const report = review.verificationReport || {};
  const reason = typeof report.reason === 'string' ? report.reason : '';
  safeEmit(emit, {
    kind: 'review_result_saved', scanJobId: input.scanJobId, spaceId: input.spaceId,
    paperId: input.paperId, canonicalId: review.canonicalId,
    title: candidate.title.slice(0, 500), abstractCharacters: candidate.abstractText.length,
    relevanceScore: review.relevanceScore, qualityScore: review.qualityScore,
    verificationStatus: review.verificationStatus, verificationRetryable: review.verificationRetryable,
    verificationCoverageScore: review.verificationCoverageScore,
    correctionRequested: report.correctionRequested === true,
    correctionCompleted: report.correctionCompleted === true,
    verificationReason: reason.slice(0, 500),
    published: input.published,
    reason: review.screeningReason.slice(0, 500),
  });
}

export function traceReviewEvent(input, emit = emitDefault) {
  if (!['deep_reviewing', 'verifying_recommendations'].includes(input.stage)) return;
  const metadata = input.metadata || {};
  const codes = ['timeout', 'invalid_model_output', 'stage_failed', 'rate_limited', 'upstream_unavailable',
    'invalid_credential', 'insufficient_balance', 'incomplete_recommendation_draft'];
  safeEmit(emit, {
    kind: 'review_event_saved', eventKind: input.kind, scanJobId: input.scanJobId || null,
    spaceId: input.spaceId, stage: input.stage, outcome: input.outcome || 'info',
    errorCode: codes.includes(input.errorCode) ? input.errorCode : input.errorCode ? 'other' : '',
    canonicalId: typeof metadata.canonicalId === 'string' ? metadata.canonicalId.slice(0, 500) : null,
    verificationAttempt: Number.isFinite(metadata.verificationAttempt) ? metadata.verificationAttempt : null,
    retryScheduled: typeof metadata.retryScheduled === 'boolean' ? metadata.retryScheduled : null,
    correctionRequested: metadata.correctionRequested === true,
  });
}
