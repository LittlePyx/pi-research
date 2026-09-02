import assert from "node:assert/strict";
import test from "node:test";

import { evaluateResearchRouteSentinel } from "../lib/research-route-sentinel.ts";

function snapshot(overrides = {}) {
  return {
    readyZeroCount: 0,
    partialZeroCount: 0,
    retryableCount: 1,
    retryableDueCount: 0,
    retryableExhaustedCount: 0,
    routeCandidateCount: 12,
    sharedQueueCount: 12,
    routeReviewedCount: 5,
    routeRecommendedCount: 2,
    monitoredPaperCount: 30,
    formalRoutePaperCount: 6,
    recommendationHistoryCount: 4,
    feedbackHistoryCount: 3,
    readingHistoryCount: 2,
    routeRetryEventCount: 2,
    routeRetrySuccessCount: 1,
    ...overrides,
  };
}

test("route sentinel reports healthy queue feed and retry convergence", () => {
  const result = evaluateResearchRouteSentinel(snapshot(), null);
  assert.equal(result.outcome, "success");
  assert.deepEqual(result.issues, []);
  assert.equal(result.retryConvergenceRate, 0.5);
});

test("development sentinel treats long-running retry counts as observable rather than exhausted", () => {
  const result = evaluateResearchRouteSentinel(snapshot({ retryableExhaustedCount: 9 }), null, true);
  assert.equal(result.outcome, "success");
  assert.doesNotMatch(result.issues.join(","), /attempt_cap/);
});

test("route sentinel detects dishonest states, queue gaps, and history regression", () => {
  const previous = snapshot({ monitoredPaperCount: 31, feedbackHistoryCount: 4 });
  const result = evaluateResearchRouteSentinel(snapshot({
    readyZeroCount: 1,
    retryableExhaustedCount: 1,
    sharedQueueCount: 10,
  }), previous);
  assert.equal(result.outcome, "failed");
  assert.deepEqual(result.historyRegressions, ["monitoredPaperCount", "feedbackHistoryCount"]);
  assert.deepEqual(result.issues, [
    "ready_without_visible_evidence",
    "retryable_past_attempt_cap",
    "shared_queue_feed_gap",
    "history_count_regression",
  ]);
});
