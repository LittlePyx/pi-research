import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkbook, validateWorkbookReview, workbookReviewFields, workbookRevision, rankWorkbookSources, validateWorkbookArtifact } from "../lib/research-workbook.ts";
import { workbookSample, workbookSources } from "./fixtures/research-workbook.mjs";

test("KLS content sample distinguishes methods, quantities and unavailable conditions", () => {
  const content = validateWorkbook(workbookSample(), workbookSources);
  assert.equal(content.comparison.status, "insufficient");
  assert.equal(content.dimensions[2].cells.every(c => c.status === "missing"), true);
  assert.match(content.learning.exerciseZh, /Poincaré.*Log-Sobolev.*随机局部化.*Lichnerowicz/);
  const altered = workbookSample(); altered.dimensions[0].cells[0].quote = "Invented source evidence that is not in this abstract";
  assert.throws(() => validateWorkbook(altered, workbookSources), /unlocated/);
  const wrongPaper = workbookSample(); wrongPaper.dimensions[0].cells[0].paperId = "other-space-paper";
  assert.throws(() => validateWorkbook(wrongPaper, workbookSources), /unknown_workbook_source/);
});

test("review must cover every bilingual field, including missing cells and learning instructions", () => {
  const content = validateWorkbook(workbookSample(), workbookSources);
  const checks = workbookReviewFields(content).map(id => ({ id, verdict: "supported", paperIds: workbookSources.map(s => s.id), reason: "Deterministic fixture review, not a live academic assessment." }));
  assert.equal(validateWorkbookReview({ verdict: "supported", checks }, content, workbookSources).supported, true);
  assert.throws(() => validateWorkbookReview({ verdict: "supported", checks: checks.slice(1) }, content, workbookSources), /incomplete/);
  checks[0].verdict = "unsupported";
  assert.equal(validateWorkbookReview({ verdict: "supported", checks }, content, workbookSources).supported, false);
});

test("evidence identity and question changes invalidate a workbook independently of paper order", async () => {
  const first = await workbookRevision("question", workbookSources);
  assert.equal(first, await workbookRevision("question", [...workbookSources].reverse()));
  assert.notEqual(first, await workbookRevision("changed question", workbookSources));
  assert.notEqual(first, await workbookRevision("question", workbookSources.map((s, i) => i ? s : { ...s, abstractText: s.abstractText + " Revised." })));
});

test("target retrieval retains route context and deduplicates canonical identity without citation-count sorting", () => {
  const unrelated = { ...workbookSources[0], id: "other", canonicalId: "other", title: "Fluid simulation", routeMember: false };
  assert.equal(rankWorkbookSources("KLS", [unrelated, ...workbookSources])[0].routeMember, true);
  assert.equal(rankWorkbookSources("KLS", [...workbookSources, { ...workbookSources[0], id: "duplicate" }]).length, 2);
});

test("user artifacts retain notes on missing conditions but reject unknown targets", () => {
  const content = validateWorkbook(workbookSample(), workbookSources);
  assert.deepEqual(validateWorkbookArtifact({ observations: { "conditions:sample-klartag": "Need to locate assumptions" }, decision: "Insufficient", unresolved: "Definitions" }, content).observations, { "conditions:sample-klartag": "Need to locate assumptions" });
  assert.throws(() => validateWorkbookArtifact({ observations: { "other-space:paper": "bad" } }, content), /unknown_observation/);
});
