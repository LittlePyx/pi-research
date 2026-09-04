import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { LEARNING_STAGE_ORDER } from "../lib/learning-path.ts";
import { groundedStageEvidence, learningStageAccepts, learningStageSearchQuery } from "../lib/learning-stage-match.ts";

const stage = (kind, titleEn) => ({ kind, titleEn, titleZh: titleEn, goalZh: "", goalEn: titleEn, readFocusZh: "", readFocusEn: titleEn });
const milestone = stage("milestone", "Eldan stochastic localization and KLS bounds");
const paper = { title: "Eldan stochastic localization and KLS bounds", authors: "Author", abstractText: "" };
const primary = (target, source = paper) => groundedStageEvidence(target, source, { role: "primary", quote: source.title, reason: "This primary result directly establishes the stage's named method and bound." });

test("a high-quality paper does not fill an unrelated named milestone", () => {
  // Observed production titles; no invented abstract is used to judge the real paper.
  const unrelated = { title: "On some Sobolev and Pólya-Szegö type inequalities with weights and applications", authors: "", abstractText: "", routeRole: "milestone", qualityScore: 100 };
  assert.equal(learningStageAccepts(milestone, unrelated), false);
  assert.equal(learningStageAccepts(milestone, unrelated, primary(milestone, unrelated)), false);
});

test("time-window and score alone cannot declare foundational or milestone status", () => {
  for (const kind of ["foundation", "milestone"]) {
    const target = stage(kind, "Gaussian rate distortion limits");
    const source = { title: "Gaussian rate distortion limits for vector sources", authors: "", abstractText: "", publishedAt: "1960-01-01" };
    assert.equal(learningStageAccepts(target, source), false);
    assert.equal(learningStageAccepts(target, { ...source, routeRole: kind }), true);
    assert.equal(learningStageAccepts(target, source, primary(target, source)), true);
  }
});

test("model assignments need grounded primary evidence, and stale evidence is invalidated", () => {
  assert.equal(groundedStageEvidence(milestone, paper, { role: "primary", quote: "This quotation is not present in the supplied title or abstract", reason: "Claims a relevant breakthrough without supporting evidence" }), null);
  assert.equal(groundedStageEvidence(milestone, paper, { role: "background", quote: paper.title, reason: "A background mention does not establish the milestone itself" }), null);
  const evidence = primary(milestone);
  assert.ok(evidence);
  assert.equal(learningStageAccepts(milestone, paper, evidence), true);
  assert.equal(learningStageAccepts({ ...milestone, goalEn: "A different required result" }, paper, evidence), false);
  assert.equal(learningStageAccepts(milestone, { ...paper, abstractText: "Changed source evidence" }, evidence), false);
});

test("surveys can be supplementary but cannot substitute for named original breakthroughs", () => {
  const survey = { ...paper, title: `${paper.title}: a survey` };
  assert.equal(learningStageAccepts(milestone, survey, primary(milestone, survey)), false);
  assert.equal(learningStageAccepts(stage("method", milestone.titleEn), survey), true);
});

test("follow-up queries retain named subjects and preserve more precise author/year queries", () => {
  const query = learningStageSearchQuery(milestone, "functional inequalities milestone breakthrough");
  assert.match(query, /Eldan stochastic localization/);
  assert.match(query, /KLS bounds original paper/);
  const precise = "Eldan stochastic localization KLS bounds 2013 original paper";
  assert.equal(learningStageSearchQuery(milestone, precise), precise);
  assert.equal(learningStageSearchQuery(stage("foundation", "Foundations"), "Shannon information theory original paper"), "Shannon information theory original paper");
});

test("the real model-output parser keeps unsupported stages empty and does not force route quotas", async () => {
  const source = await readFile(new URL("../app/api/learning-path/route.ts", import.meta.url), "utf8");
  const section = source.slice(source.indexOf("function stageEvidenceQuery"), source.indexOf("async function queueRouteLearningCandidates"));
  const candidate = { resource_id: "monitor:valid", canonical_id: "valid", source: "daily-scan", selection_role: "target-direction", title: paper.title, authors: paper.authors, abstract_text: "", paper_role: "unclassified", quality_score: 90, track_id: "track", summary_zh: "", summary_en: "", rationale_zh: "", rationale_en: "", reading_focus_zh: "", reading_focus_en: "" };
  const wrong = { ...candidate, resource_id: "monitor:wrong", canonical_id: "wrong", title: "On some Sobolev and Pólya-Szegö type inequalities with weights and applications", paper_role: "milestone" };
  const modelStep = (id, quote) => ({ ...milestone, resourceIds: [id], resourceEvidence: { [id]: { role: "primary", quote, reason: "A primary contribution directly proving the stage's named breakthrough." } } });
  let response = { steps: [modelStep(wrong.resource_id, wrong.title)] };
  const dependencies = {
    LEARNING_STAGE_ORDER, groundedStageEvidence, learningStageAccepts, learningStageSearchQuery,
    safeAutomaticResearchGapQuery: (value) => typeof value === "string" ? value : "", baseLearningQuery: () => "Eldan stochastic localization KLS bounds",
    cleanText: (value, max = 900) => String(value || "").trim().slice(0, max), boundedMinutes: () => 90,
    unboundedDevelopmentRetries: () => true, MODEL: "test-model", GLOBAL_DAILY_LIMIT: 120, WORKSPACE_DAILY_LIMIT: 8,
    fetch: async () => Response.json({ choices: [{ message: { content: JSON.stringify(response) } }] }),
  };
  const compiled = ts.transpileModule(section, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const build = new Function(...Object.keys(dependencies), compiled + "\nreturn buildDraft;")(...Object.values(dependencies));
  const database = { prepare: () => ({ bind: () => ({ first: async () => ({ request_count: 999 }), run: async () => ({}) }) }) };
  const context = { candidates: [candidate, wrong], tracks: [], targetTrack: { id: "track" } };
  let result = await build(database, "fixture", { name: "Fixture" }, "KLS", context, "mock-only");
  assert.ok(result.steps.every((step) => step.resourceIds.length === 0), "even two target-route papers cannot override gaps");
  assert.match(result.steps[2].evidenceQuery, /Eldan/);
  response = { steps: [modelStep(candidate.resource_id, candidate.title)] };
  result = await build(database, "fixture", { name: "Fixture" }, "KLS", context, "mock-only");
  assert.deepEqual(result.steps[2].resourceIds, [candidate.resource_id]);
  assert.ok(result.steps[2].resourceEvidence[candidate.resource_id].stageKey);
  assert.equal(result.steps[0].resourceIds.length, 0);
});
