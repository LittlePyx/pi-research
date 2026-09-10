import assert from "node:assert/strict";
import test from "node:test";
import { routeMaterialState, currentRouteStatements } from "../lib/route-material-state.ts";

const track = papers => ({ papers, pendingEvidenceCount: 12, queuedForReviewCount: 20, reviewingForReviewCount: 3 });
const paper = (id, role = "foundation") => ({ id, canonicalId: id, title: id, role, curationStatus: "active" });
test("queued and pending material never establishes readiness or an academic research gap", () => {
  const result = routeMaterialState(track([]));
  assert.equal(result.status, "exploring"); assert.equal(result.inReviewCount, 23);
  assert.equal(result.pendingConfirmationCount, 12); assert.equal(result.researchGapStatus, "not_established");
  assert.deepEqual(result.missingCollectionRoles, ["foundation", "milestone", "frontier"]);
});
test("material coverage deduplicates real active papers without requiring every template category", () => {
  const result = routeMaterialState(track([paper("a", "milestone"), paper("a"), { ...paper("b"), curationStatus: "deactivated" }]));
  assert.equal(result.status, "materials_available"); assert.deepEqual(result.paperIds, ["a"]);
  assert.deepEqual(result.missingCollectionRoles, ["foundation", "frontier"]);
});
test("current findings require all declared paper sources and exclude stale or incomplete synthesis", () => {
  const statement = { kind: "evidence_gap", sourcePaperIds: ["a"], sources: [{ paperId: "a", evidenceLevel: "abstract", evidenceQuote: "Exact supplied evidence" }] };
  const synthesis = { status: "ready", stale: false, statements: [statement] };
  assert.equal(currentRouteStatements(synthesis).length, 1);
  assert.deepEqual(currentRouteStatements({ ...synthesis, stale: true }), []);
  assert.deepEqual(currentRouteStatements({ ...synthesis, status: "partial" }), []);
  assert.deepEqual(currentRouteStatements({ ...synthesis, statements: [{ ...statement, sourcePaperIds: ["a", "missing"] }] }), []);
  assert.deepEqual(currentRouteStatements({ ...synthesis, statements: [{ ...statement, sources: [{ paperId: "a", evidenceLevel: "metadata", evidenceQuote: "Title only" }] }] }), []);
});
