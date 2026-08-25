import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecommendationQualitySnapshot,
  evaluateRecommendationAcceptanceGate,
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

test("the private production sentinel distinguishes a clean shortfall from a broken funnel", () => {
  assert.deepEqual(evaluateRecommendationAcceptanceGate({
    discovered: 312,
    newCandidates: 312,
    screened: 59,
    deepScheduled: 3,
    deepCompleted: 3,
    published: 3,
  }), {
    status: "pass",
    target: 3,
    targetReached: true,
    qualityGateUnchanged: true,
    reasons: [],
    invariantViolations: [],
    shouldReplan: false,
  });

  const shortfall = evaluateRecommendationAcceptanceGate({
    discovered: 200,
    newCandidates: 120,
    screened: 48,
    deepScheduled: 8,
    deepCompleted: 8,
    published: 1,
  });
  assert.equal(shortfall.status, "watch");
  assert.equal(shortfall.shouldReplan, true);
  assert.deepEqual(shortfall.invariantViolations, []);
  assert.ok(shortfall.reasons.includes("formal_target_shortfall"));

  const broken = evaluateRecommendationAcceptanceGate({
    discovered: 100,
    newCandidates: 130,
    screened: 40,
    deepScheduled: 2,
    deepCompleted: 3,
    published: 3,
  });
  assert.equal(broken.status, "fail");
  assert.equal(broken.shouldReplan, false);
  assert.ok(broken.invariantViolations.includes("new_candidates_exceed_discovered"));
  assert.ok(broken.invariantViolations.includes("deep_completed_exceeds_scheduled"));
});
