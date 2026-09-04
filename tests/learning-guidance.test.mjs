import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { groundedGuidanceReview, guidanceReviewIsCurrent, learningGuidanceText, presentLearningGuidance } from "../lib/learning-guidance.ts";
import { groundedStageEvidence, learningStageAccepts, learningStageSearchQuery } from "../lib/learning-stage-match.ts";
import { LEARNING_STAGE_ORDER } from "../lib/learning-path.ts";

// Public metadata and one short abstract excerpt: https://arxiv.org/abs/2011.13661
const source = { canonicalId: "arxiv:2011.13661", title: "An Almost Constant Lower Bound of the Isoperimetric Coefficient in the KLS Conjecture", authors: "Yuansi Chen", abstractText: "We prove an almost constant lower bound of the isoperimetric coefficient in the KLS conjecture." };
const step = {
  id: "step", kind: "milestone", titleZh: "Chen 的 KLS 界", titleEn: "Chen KLS isoperimetric coefficient lower bound",
  goalZh: "核对几乎常数下界。", goalEn: "Check the almost constant lower bound.",
  whyZh: "比较下界的改进。", whyEn: "Compare the lower bound improvement.",
  readFocusZh: "核对维数依赖。", readFocusEn: "Check dimension dependence.",
  checkpointZh: "列出假设与结论。", checkpointEn: "List assumptions and conclusions.",
  resources: [], supplementaryResources: [], evidenceQuery: "Chen KLS isoperimetric coefficient 2021",
  discovery: { id: "existing-job" }, status: "pending", completedAt: null,
};
const review = (verdict = "supported") => ({ verdict, citations: [{ canonicalId: source.canonicalId, quote: source.abstractText }] });

test("guidance approval requires an independent supported verdict and a real abstract quotation", () => {
  assert.equal(groundedGuidanceReview(step, [], review()), null);
  for (const verdict of ["unsupported", "insufficient", true, undefined]) assert.equal(groundedGuidanceReview(step, [source], { ...review(), verdict }), null);
  assert.equal(groundedGuidanceReview(step, [{ ...source, abstractText: "" }], review()), null);
  assert.equal(groundedGuidanceReview(step, [source], { ...review(), citations: [{ canonicalId: "foreign", quote: source.abstractText }] }), null);
  assert.equal(groundedGuidanceReview(step, [source], { ...review(), citations: [{ canonicalId: source.canonicalId, quote: source.abstractText.replace("lower", "upper") }] }), null);
  assert.ok(groundedGuidanceReview(step, [source], review()));
});

test("review binds every prose field and source metadata, not merely stage kind", () => {
  const certificate = groundedGuidanceReview(step, [source], review());
  assert.equal(guidanceReviewIsCurrent(step, [source], certificate), true);
  for (const key of Object.keys(learningGuidanceText(step))) assert.equal(guidanceReviewIsCurrent({ ...step, [key]: `${step[key]} changed` }, [source], certificate), false, key);
  for (const key of Object.keys(source)) assert.equal(guidanceReviewIsCurrent(step, [{ ...source, [key]: `${source[key]} changed` }], certificate), false, key);
  assert.equal(guidanceReviewIsCurrent(step, [], certificate), false);
});

test("empty historical stages expose reading tasks without rewriting discovery or completion history", () => {
  const wrong = "从次多项式提升至多项式";
  const path = { target: "KLS", titleZh: wrong, rationaleZh: wrong, steps: [{ ...step, titleZh: wrong, goalZh: wrong, whyZh: wrong, readFocusZh: wrong, checkpointZh: wrong, status: "completed", completedAt: "2026-09-01", supplementaryResources: [{ id: "old-paper" }] }] };
  const before = structuredClone(path);
  const shown = presentLearningGuidance(path);
  assert.doesNotMatch(JSON.stringify(shown), new RegExp(wrong));
  assert.equal(shown.steps[0].guidanceStatus, "reading-task");
  assert.equal(shown.steps[0].evidenceQuery, step.evidenceQuery);
  assert.deepEqual(shown.steps[0].discovery, step.discovery);
  assert.deepEqual(shown.steps[0].supplementaryResources, [{ id: "old-paper" }]);
  assert.equal(shown.steps[0].status, "completed");
  assert.equal(shown.steps[0].completedAt, "2026-09-01");
  assert.deepEqual(path, before);
});

test("auto-filled materials alone cannot reactivate unreviewed explanations", () => {
  const filled = { ...step, whyZh: "An unreviewed claim", resources: [{ id: "new-paper" }] };
  assert.notEqual(presentLearningGuidance({ target: "KLS", steps: [filled] }).steps[0].whyZh, filled.whyZh);
  assert.equal(presentLearningGuidance({ target: "KLS", steps: [{ ...filled, guidanceStatus: "grounded" }] }).steps[0].whyZh, filled.whyZh);
  assert.equal(presentLearningGuidance({ target: "KLS", steps: [{ ...filled, resources: [], guidanceStatus: "grounded" }] }).steps[0].guidanceStatus, "reading-task");
});

test("real generation parser reviews accepted materials independently and fails closed on reviewer failures", async () => {
  const api = await readFile(new URL("../app/api/learning-path/route.ts", import.meta.url), "utf8");
  const code = api.slice(api.indexOf("function stageEvidenceQuery"), api.indexOf("async function queueRouteLearningCandidates"));
  const candidate = { resource_id: "monitor:chen", canonical_id: source.canonicalId, source: "daily-scan", selection_role: "target-direction", title: source.title, authors: source.authors, abstract_text: source.abstractText, paper_role: "unclassified", quality_score: 90 };
  let verdict = "unsupported", failure = false, draftEmpty = false;
  const calls = [];
  const dependencies = {
    LEARNING_STAGE_ORDER, groundedStageEvidence, learningStageAccepts, learningStageSearchQuery, groundedGuidanceReview, learningGuidanceText,
    safeAutomaticResearchGapQuery: (value) => typeof value === "string" ? value : "", baseLearningQuery: () => step.evidenceQuery,
    cleanText: (value, max = 900) => String(value || "").trim().slice(0, max), boundedMinutes: () => 90,
    unboundedDevelopmentRetries: () => true, MODEL: "fixture-model", GLOBAL_DAILY_LIMIT: 120, WORKSPACE_DAILY_LIMIT: 8,
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ body, signal: options.signal });
      if (body.messages[0].content.startsWith("Independently")) {
        if (failure) throw new Error("Fixture network failure");
        return Response.json({ choices: [{ message: { content: JSON.stringify({ reviews: [{ kind: "milestone", ...review(verdict) }] }) } }] });
      }
      return Response.json({ choices: [{ message: { content: JSON.stringify({ steps: [{ ...step, resourceIds: draftEmpty ? [] : [candidate.resource_id], resourceEvidence: { [candidate.resource_id]: { role: "primary", quote: source.abstractText, reason: "The supplied original paper establishes the named isoperimetric lower bound." } }, guidanceReview: review() }] }) } }] });
    },
  };
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const build = new Function(...Object.keys(dependencies), compiled + "\nreturn buildDraft;")(...Object.values(dependencies));
  const database = { prepare: () => ({ bind: () => ({ first: async () => ({ request_count: 999 }), run: async () => ({}) }) }) };
  const run = () => build(database, "fixture", { name: "Fixture" }, "KLS", { candidates: [candidate], tracks: [] }, "mock-only");
  let result = await run();
  assert.deepEqual(result.steps[2].resourceIds, [candidate.resource_id]);
  assert.equal(result.steps[2].guidanceReview, undefined, "author's self-approval and a rejected second review cannot authorize prose");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal, calls[1].signal, "one shared planning deadline");
  const reviewerInput = JSON.parse(calls[1].body.messages[1].content);
  assert.deepEqual(reviewerInput.stages[0].sources, [source]);
  assert.ok(!JSON.stringify(reviewerInput).includes("qualityScore"));
  verdict = "supported";
  result = await run();
  assert.ok(guidanceReviewIsCurrent(result.steps[2], [source], result.steps[2].guidanceReview));
  failure = true;
  result = await run();
  assert.deepEqual(result.steps[2].resourceIds, [candidate.resource_id]);
  assert.equal(result.steps[2].guidanceReview, undefined);
  failure = false; draftEmpty = true; calls.length = 0;
  result = await run();
  assert.equal(calls.length, 1, "no review calls for empty stages");
  assert.ok(result.steps.every((stage) => !stage.guidanceReview));
});
