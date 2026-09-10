import assert from 'node:assert/strict';
import test from 'node:test';
import { traceReviewQueue, traceReviewOutcome, traceReviewEvent, traceVerificationResponse } from '../lib/review-progress-trace.mjs';

test('verification response metadata distinguishes token truncation without recording response text', () => {
  const entries = [];
  traceVerificationResponse({ scanJobId: 'job', canonicalIds: ['doi:known'], correctionMode: true,
    finishReason: 'length', outputTokens: 4200, contentCharacters: 9000, content: 'private raw response' }, entry => entries.push(entry));
  assert.equal(entries[0].finishReason, 'length');
  assert.equal(entries[0].phase, 'correction');
  assert.equal(entries[0].outputTokens, 4200);
  assert.doesNotMatch(JSON.stringify(entries), /private raw response/);
  assert.doesNotThrow(() => traceVerificationResponse({ canonicalIds: [] }, () => { throw new Error('logger unavailable'); }));
});

test('review diagnostics separate completion, deferral, verification and actual publication without raw content', () => {
  const entries = [];
  const emit = value => entries.push(value);
  const work = { deepIds: ['doi:pending', 'doi:deferred', 'doi:verified'], deepCompletedIds: ['doi:verified'],
    deepDeferredIds: ['doi:deferred'], verificationIds: ['doi:verified'], verificationCompletedIds: ['doi:verified'],
    verificationDeferredIds: [], apiKey: 'fixture-secret', rawOutput: 'private-raw-content' };
  traceReviewQueue('job', work, emit);
  assert.equal(entries[0].deepCompleted, false);
  assert.equal(entries[1].deepDeferred, true);
  assert.equal(entries[2].verificationCompleted, true);
  assert.equal('published' in entries[2], false);
  traceReviewOutcome({ scanJobId: 'job', spaceId: 'space', paperId: 'paper', published: false,
    candidate: { title: 'QA title', abstractText: 'Evidence', apiKey: 'fixture-secret' },
    review: { canonicalId: 'doi:pending', relevanceScore: 85, qualityScore: 90, verificationStatus: 'pending',
      verificationRetryable: true, verificationCoverageScore: 0, screeningReason: 'Awaiting evidence verification',
      summaryEn: 'private-raw-content' }, rawOutput: 'private-raw-content' }, emit);
  assert.equal(entries[3].published, false);
  assert.equal(entries[3].abstractCharacters, 8);
  assert.doesNotMatch(JSON.stringify(entries), /fixture-secret|private-raw-content|abstractText/);
  assert.doesNotThrow(() => traceReviewQueue('job', work, () => { throw new Error('logger unavailable'); }));
});

test('saved review diagnostics distinguish content correction from transport retries and exclude raw errors', () => {
  const entries = [];
  const emit = entry => entries.push(entry);
  traceReviewEvent({ stage: 'screening', kind: 'unrelated' }, emit);
  assert.equal(entries.length, 0);
  traceReviewEvent({ stage: 'verifying_recommendations', kind: 'verification_retry_scheduled', scanJobId: 'job',
    errorCode: 'timeout', message: 'fixture-secret raw upstream response', metadata: {
      canonicalId: 'doi:known', verificationAttempt: 2, retryScheduled: true, apiKey: 'fixture-secret',
    } }, emit);
  assert.equal(entries[0].errorCode, 'timeout');
  assert.equal(entries[0].verificationAttempt, 2);
  traceReviewOutcome({ scanJobId: 'job', candidate: { title: 'QA title', abstractText: 'Supplied abstract' },
    review: { canonicalId: 'doi:known', screeningReason: '', verificationStatus: 'pending', verificationRetryable: true,
      verificationReport: { correctionRequested: true, reason: 'Conservative correction queued', rawOutput: 'fixture-secret' } },
    published: false }, emit);
  assert.equal(entries[1].correctionRequested, true);
  assert.equal(entries[1].correctionCompleted, false);
  assert.equal(entries[1].published, false);
  assert.equal(entries[1].verificationReason, 'Conservative correction queued');
  assert.doesNotMatch(JSON.stringify(entries), /fixture-secret|raw upstream/);
  assert.doesNotThrow(() => traceReviewEvent({ stage: 'deep_reviewing' }, () => { throw new Error('logger failed'); }));
});

test('final correction diagnostics identify uncovered fields without exporting claims', () => {
  let entry;
  traceReviewOutcome({ candidate: { title: 'QA', abstractText: 'Evidence' }, review: {
    canonicalId: 'doi:known', screeningReason: '', verificationReport: { initial: { verdict: 'revise', coverageScore: 95 },
      revised: { verdict: 'revise', coverageScore: 82, supportedFields: ['summary'], unsupportedFields: ['method'],
        claimChecks: [{ field: 'summary', grounded: true, claimExcerpt: 'private raw claim' }], overstatements: [], contradictionRisks: [] } },
  } }, value => { entry = value; });
  assert.equal(entry.finalAuditCoverage, 82);
  assert.deepEqual(entry.uncoveredCoreFields, ['problem', 'method', 'contribution']);
  assert.deepEqual(entry.unsupportedCoreFields, ['method']);
  assert.equal(entry.finalAuditIssueCount, 1);
  assert.doesNotMatch(JSON.stringify(entry), /private raw claim/);
});
