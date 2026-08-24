import assert from "node:assert/strict";
import test from "node:test";
import {
  deepCandidateScore,
  formalRecommendationRescueSize,
  isContinuityDeepCandidate,
  isPrimaryDeepCandidate,
  isRescueDeepCandidate,
  selectBalancedByGroup,
} from "../lib/discovery/candidate-selection.mjs";

test("direction balancing prevents one prolific route from starving the rest", () => {
  const ranked = [
    { id: "a1", route: "sampling" },
    { id: "a2", route: "sampling" },
    { id: "a3", route: "sampling" },
    { id: "b1", route: "transport" },
    { id: "c1", route: "pde" },
  ];
  const selected = selectBalancedByGroup(ranked, (item) => item.route, 4);
  assert.deepEqual(selected.map((item) => item.id), ["a1", "b1", "c1", "a2"]);
});

test("a zero-yield primary batch still exposes evidence-backed rescue candidates", () => {
  const screens = [
    { id: "primary", isPaper: true, relevanceScore: 72, qualityScore: 61 },
    { id: "near-miss", isPaper: true, relevanceScore: 64, qualityScore: 53 },
    { id: "weak", isPaper: true, relevanceScore: 42, qualityScore: 37 },
  ];
  assert.equal(isPrimaryDeepCandidate(screens[0]), true);
  assert.equal(isRescueDeepCandidate(screens[1]), true);
  assert.equal(isRescueDeepCandidate(screens[2]), false);
  assert.ok(deepCandidateScore(screens[0]) > deepCandidateScore(screens[1]));
});

test("rescue eligibility never bypasses the final recommendation decision", () => {
  const nearMiss = { isPaper: true, relevanceScore: 60, qualityScore: 50 };
  assert.equal(isRescueDeepCandidate(nearMiss), true);
  assert.equal(isPrimaryDeepCandidate(nearMiss), false);
});

test("long-term monitoring preserves credible lower-scoring papers for one evidence review", () => {
  const subtle = { isPaper: true, relevanceScore: 49, qualityScore: 58 };
  assert.equal(isContinuityDeepCandidate(subtle), true);
  assert.equal(isRescueDeepCandidate(subtle), false);
  assert.equal(isContinuityDeepCandidate({ ...subtle, isPaper: false }), false);
});

test("formal recommendation shortfalls trigger more review without lowering quality gates", () => {
  assert.equal(formalRecommendationRescueSize({ published: 1, reviewed: 8, maxReviews: 14, availableCandidates: 12 }), 4);
  assert.equal(formalRecommendationRescueSize({ published: 2, reviewed: 12, maxReviews: 14, availableCandidates: 12 }), 2);
  assert.equal(formalRecommendationRescueSize({ published: 3, reviewed: 8, maxReviews: 14, availableCandidates: 12 }), 0);
  assert.equal(formalRecommendationRescueSize({ published: 0, reviewed: 14, maxReviews: 14, availableCandidates: 12 }), 0);
});
