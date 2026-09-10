// Persisted progress only; no credentials, prompts, user memory or raw model output.
const emitDefault = entry => console.info('Pi review progress', JSON.stringify(entry));
function safeEmit(emit, entry) { try { emit(entry); } catch { /* Diagnostics cannot interrupt review. */ } }
export function traceReviewQueue(scanJobId, work, emit = emitDefault) {
  for (const canonicalId of work.deepIds) safeEmit(emit, {
    kind: 'review_queue_saved', scanJobId, canonicalId,
    deepCompleted: work.deepCompletedIds.includes(canonicalId),
    deepDeferred: work.deepDeferredIds.includes(canonicalId),
    verificationQueued: work.verificationIds.includes(canonicalId),
    verificationCompleted: work.verificationCompletedIds.includes(canonicalId),
    verificationDeferred: work.verificationDeferredIds.includes(canonicalId),
  });
}
export function traceReviewOutcome(input, emit = emitDefault) {
  const { review, candidate } = input;
  safeEmit(emit, {
    kind: 'review_result_saved', scanJobId: input.scanJobId, spaceId: input.spaceId,
    paperId: input.paperId, canonicalId: review.canonicalId,
    title: candidate.title.slice(0, 500), abstractCharacters: candidate.abstractText.length,
    relevanceScore: review.relevanceScore, qualityScore: review.qualityScore,
    verificationStatus: review.verificationStatus, verificationRetryable: review.verificationRetryable,
    verificationCoverageScore: review.verificationCoverageScore,
    published: input.published,
    reason: review.screeningReason.slice(0, 500),
  });
}
