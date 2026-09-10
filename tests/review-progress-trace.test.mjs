import assert from 'node:assert/strict';
import test from 'node:test';
import { traceReviewQueue, traceReviewOutcome } from '../lib/review-progress-trace.mjs';

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
