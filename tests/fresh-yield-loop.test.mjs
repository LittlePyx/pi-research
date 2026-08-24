import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFreshYieldFunnel,
  formalYieldBranchAdjustment,
  shouldRefreshFreshYieldPlan,
} from "../lib/discovery/fresh-yield.mjs";

test("formal recommendations teach retrieval branches beyond raw candidate volume", () => {
  const strong = formalYieldBranchAdjustment({ deepReviewed: 6, formalRecommended: 4, evidenceRejected: 0 });
  const weak = formalYieldBranchAdjustment({ deepReviewed: 6, formalRecommended: 0, evidenceRejected: 0 });
  const weakEvidence = formalYieldBranchAdjustment({ deepReviewed: 6, formalRecommended: 0, evidenceRejected: 4 });
  assert.ok(strong > weak);
  assert.ok(weak > weakEvidence);
});

test("small formal-review samples are damped instead of dominating discovery", () => {
  const oneSuccess = formalYieldBranchAdjustment({ deepReviewed: 1, formalRecommended: 1, evidenceRejected: 0 });
  const sixSuccesses = formalYieldBranchAdjustment({ deepReviewed: 6, formalRecommended: 6, evidenceRejected: 0 });
  assert.ok(oneSuccess > 0);
  assert.ok(oneSuccess < sixSuccesses);
});

function funnel(overrides = {}) {
  return buildFreshYieldFunnel({
    currentCandidateIds: ["fresh-a"],
    screens: [{ canonicalId: "fresh-a" }],
    deepIds: ["fresh-a"],
    deepCompletedIds: ["fresh-a"],
    deepDeferredIds: [],
    reviews: [{
      canonicalId: "fresh-a",
      recommended: false,
      verificationRetryable: false,
      verificationStatus: "verified",
    }],
    ...overrides,
  });
}

test("the fresh funnel diagnoses the first stage that lost new papers", () => {
  assert.equal(funnel({ currentCandidateIds: [] }).diagnosis, "no_new_candidates");
  assert.equal(funnel({ screens: [], deepIds: [], deepCompletedIds: [], reviews: [] }).diagnosis, "fresh_not_screened");
  assert.equal(funnel({ deepIds: [], deepCompletedIds: [], reviews: [] }).diagnosis, "fresh_not_selected_for_deep_review");
  assert.equal(funnel({ deepCompletedIds: [], deepDeferredIds: ["fresh-a"], reviews: [] }).diagnosis, "fresh_deep_review_unavailable");
  assert.equal(funnel({ reviews: [{ canonicalId: "fresh-a", recommended: true, verificationRetryable: true, verificationStatus: "pending" }] }).diagnosis, "fresh_verification_pending");
  assert.equal(funnel({ reviews: [{ canonicalId: "fresh-a", recommended: false, verificationRetryable: false, verificationStatus: "degraded" }] }).diagnosis, "fresh_evidence_audit_failed");
  assert.equal(funnel().diagnosis, "fresh_model_quality_rejection");
});

test("verified fresh recommendations close the funnel and preserve exact rates", () => {
  const result = funnel({
    reviews: [{ canonicalId: "fresh-a", recommended: true, verificationRetryable: false, verificationStatus: "revised" }],
  });
  assert.equal(result.diagnosis, "healthy_fresh_yield");
  assert.equal(result.freshRecommended, 1);
  assert.equal(result.currentToFormalRate, 100);
  assert.equal(result.deepToFormalRate, 100);
  assert.equal(shouldRefreshFreshYieldPlan(result), false);
});

test("query plans refresh only after a conclusive zero-fresh result", () => {
  assert.equal(shouldRefreshFreshYieldPlan(funnel()), true);
  assert.equal(shouldRefreshFreshYieldPlan(funnel({
    reviews: [{ canonicalId: "fresh-a", recommended: true, verificationRetryable: true, verificationStatus: "pending" }],
  })), false);
  assert.equal(shouldRefreshFreshYieldPlan(funnel({
    deepCompletedIds: [], deepDeferredIds: ["fresh-a"], reviews: [],
  })), false);
});
