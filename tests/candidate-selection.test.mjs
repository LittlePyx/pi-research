import assert from "node:assert/strict";
import test from "node:test";
import {
  deepCandidateScore,
  formalRecommendationRescueSize,
  isContinuityDeepCandidate,
  isPrimaryDeepCandidate,
  isRescueDeepCandidate,
  selectBalancedByGroup,
  selectBudgetedDeepReviewCandidates,
  summarizeDeepSelectionOutcomes,
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

function allocationCandidate(canonicalId, overrides = {}) {
  return {
    canonicalId,
    score: 70,
    isCurrentDiscovery: false,
    isRouteOrigin: false,
    routeKey: "",
    directionKey: canonicalId,
    evidenceReady: true,
    ...overrides,
  };
}

test("fresh discoveries and research routes cannot be starved by a stronger backlog", () => {
  const backlog = Array.from({ length: 10 }, (_, index) => allocationCandidate(`backlog-${index}`, { score: 99 - index }));
  const fresh = Array.from({ length: 6 }, (_, index) => allocationCandidate(`fresh-${index}`, {
    score: 70 - index,
    isCurrentDiscovery: true,
    isRouteOrigin: index < 2,
    routeKey: index < 2 ? `route-${index}` : "",
  }));
  const selected = selectBudgetedDeepReviewCandidates([...backlog, ...fresh], { limit: 8 });
  assert.equal(selected.length, 8);
  assert.ok(selected.filter((item) => item.isCurrentDiscovery).length >= 5);
  assert.ok(selected.filter((item) => item.isRouteOrigin).length >= 2);
  assert.ok(selected.some((item) => !item.isCurrentDiscovery));
});

test("unused category budgets backfill and duplicate candidates consume one slot", () => {
  const selected = selectBudgetedDeepReviewCandidates([
    allocationCandidate("a", { score: 90 }),
    allocationCandidate("a", { score: 40, isCurrentDiscovery: true }),
    allocationCandidate("b", { score: 80 }),
    allocationCandidate("c", { score: 70 }),
  ], { limit: 3 });
  assert.deepEqual(selected.map((item) => item.canonicalId), ["a", "b", "c"]);
});

test("usable abstract evidence wins before an expensive deep-review call", () => {
  const selected = selectBudgetedDeepReviewCandidates([
    allocationCandidate("missing-evidence", { score: 99, isCurrentDiscovery: true, evidenceReady: false }),
    allocationCandidate("evidence-ready", { score: 60, isCurrentDiscovery: true, evidenceReady: true }),
  ], { limit: 1 });
  assert.equal(selected[0].canonicalId, "evidence-ready");
});

test("a resumed review wave preserves pinned papers while allocating fresh capacity", () => {
  const candidates = [
    allocationCandidate("old-selected", { score: 10 }),
    ...Array.from({ length: 5 }, (_, index) => allocationCandidate(`fresh-${index}`, { score: 80 - index, isCurrentDiscovery: true })),
    allocationCandidate("backlog", { score: 95 }),
  ];
  const selected = selectBudgetedDeepReviewCandidates(candidates, { limit: 6, pinnedIds: ["old-selected"] });
  assert.ok(selected.some((item) => item.canonicalId === "old-selected"));
  assert.equal(new Set(selected.map((item) => item.canonicalId)).size, selected.length);
});

test("internal selection attribution assigns one actionable reason per paper", () => {
  const outcomes = summarizeDeepSelectionOutcomes({
    candidates: [
      { canonicalId: "irrelevant", evidenceReady: true },
      { canonicalId: "weak", evidenceReady: true },
      { canonicalId: "missing-abstract", evidenceReady: false },
      { canonicalId: "budget", evidenceReady: true },
      { canonicalId: "selected", evidenceReady: true },
    ],
    screens: [
      { canonicalId: "irrelevant", isPaper: true, relevanceScore: 30, qualityScore: 80 },
      { canonicalId: "weak", isPaper: true, relevanceScore: 70, qualityScore: 30 },
      { canonicalId: "missing-abstract", isPaper: true, relevanceScore: 75, qualityScore: 70 },
      { canonicalId: "budget", isPaper: true, relevanceScore: 75, qualityScore: 70 },
      { canonicalId: "selected", isPaper: true, relevanceScore: 75, qualityScore: 70 },
    ],
    selectedIds: ["selected"],
    duplicateCount: 3,
  });
  assert.deepEqual(outcomes, {
    duplicate: 3,
    topic_mismatch: 1,
    low_quality: 1,
    insufficient_abstract_evidence: 1,
    review_budget_not_selected: 1,
  });
});
