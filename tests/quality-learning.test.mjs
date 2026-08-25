import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecommendationQualitySnapshot,
  selectVerificationPhaseBatch,
} from "../lib/discovery/quality-learning.mjs";

test("verification batching keeps audit and correction content passes separate", () => {
  const entries = [
    { id: "audit-a", ready: true, correctionRequested: false },
    { id: "correction-a", ready: true, correctionRequested: true },
    { id: "audit-b", ready: true, correctionRequested: false },
    { id: "audit-incomplete", ready: false, correctionRequested: false },
    { id: "audit-c", ready: true, correctionRequested: false },
    { id: "audit-d", ready: true, correctionRequested: false },
  ];
  assert.deepEqual(selectVerificationPhaseBatch(entries, 3).map((entry) => entry.id), ["audit-a", "audit-b", "audit-c"]);
  assert.deepEqual(selectVerificationPhaseBatch(entries.slice(1), 3).map((entry) => entry.id), ["correction-a"]);
});

test("quality snapshot measures yield, mix, latency, and token cost without recommendation prose", () => {
  assert.deepEqual(buildRecommendationQualitySnapshot({
    discovered: 240,
    newCandidates: 80,
    screened: 52,
    deepScheduled: 8,
    deepCompleted: 6,
    deepDeferred: 1,
    verificationPending: 0,
    verificationFailed: 1,
    published: 3,
    firstRecommendationMs: 91_200,
    reviewInputTokens: 12_000,
    reviewOutputTokens: 3_000,
    verificationInputTokens: 6_000,
    verificationOutputTokens: 1_500,
    publishedPapers: [
      { horizon: "days", directionKey: "route:r1", routeIds: ["r1"] },
      { horizon: "months", directionKey: "route:r2", routeIds: ["r2"] },
      { horizon: "days", directionKey: "topic:bridge", routeIds: ["r1"] },
    ],
  }), {
    qualityGateUnchanged: true,
    discovered: 240,
    newCandidates: 80,
    screened: 52,
    deepScheduled: 8,
    deepCompleted: 6,
    deepDeferred: 1,
    verificationPending: 0,
    verificationFailed: 1,
    published: 3,
    targetReached: true,
    horizonMix: { days: 2, months: 1, years: 0 },
    uniqueDirections: 3,
    coveredRoutes: 2,
    firstRecommendationMs: 91_200,
    modelTokens: 22_500,
    tokensPerPublished: 7_500,
  });
});
