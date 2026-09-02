import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  researchProblemDiscoveryQuery,
  researchProblemInputRevision,
  sanitizeResearchProblemAssessment,
  sanitizeResearchProblemDraft,
} from "../lib/research-problem.ts";

test("research problem drafts retain only traceable synthesis statement ids", () => {
  const result = sanitizeResearchProblemDraft({
    question: "  Which regularity assumptions make the inverse stable?  ",
    objective: "Identify the weakest usable conditions.",
    scope: "Variational inverse problems; exclude purely empirical heuristics.",
    successCriteria: "A theorem or counterexample separates the assumptions.",
    stage: "theory",
    hypotheses: [{
      statement: "Compactness is sufficient only with an identifiability condition.",
      rationale: "The synthesis exposes both conditions.",
      confidence: 73.6,
      sourceStatementIds: ["statement-1", "invented-source", "statement-1"],
    }],
  }, new Set(["statement-1"]));

  assert.equal(result.stage, "theory");
  assert.equal(result.question, "Which regularity assumptions make the inverse stable?");
  assert.deepEqual(result.hypotheses[0].sourceStatementIds, ["statement-1"]);
  assert.equal(result.hypotheses[0].confidence, 74);
});

test("evidence assessments cannot invent hypotheses or opaque search syntax", () => {
  const result = sanitizeResearchProblemAssessment({
    summaryZh: "新证据缩小了可行条件范围。",
    summaryEn: "New evidence narrows the feasible conditions.",
    changeZh: "一个充分条件被限定。",
    changeEn: "One sufficient condition is qualified.",
    uncertaintyZh: "必要性仍未确定。",
    uncertaintyEn: "Necessity remains unresolved.",
    nextDecisionZh: "判断是否需要构造反例。",
    nextDecisionEn: "Decide whether to construct a counterexample.",
    nextSearchQuery: "inverse problems AND compactness",
    confidence: 81,
    sourceStatementIds: ["statement-1", "fabricated"],
    hypothesisImpacts: [
      { hypothesisId: "hypothesis-1", relation: "qualifies", explanationZh: "适用范围更窄。", explanationEn: "The scope is narrower.", confidence: 82, sourceStatementIds: ["statement-1"] },
      { hypothesisId: "invented", relation: "supports", explanationZh: "无效。", explanationEn: "Invalid.", confidence: 99, sourceStatementIds: ["statement-1"] },
    ],
    actions: [{ kind: "compare", titleZh: "比较两个条件集", titleEn: "Compare the two condition sets" }],
  }, new Set(["statement-1"]), new Set(["hypothesis-1"]));

  assert.equal(result.nextSearchQuery, "");
  assert.deepEqual(result.sourceStatementIds, ["statement-1"]);
  assert.equal(result.hypothesisImpacts.length, 1);
  assert.equal(result.hypothesisImpacts[0].hypothesisId, "hypothesis-1");
  assert.equal(result.actions[0].kind, "compare");
});

test("Pi problem drafts and assessments fail closed without traceable synthesis statements", () => {
  assert.throws(() => sanitizeResearchProblemDraft({
    question: "Which condition is necessary?", objective: "Separate sufficient and necessary conditions.",
    scope: "One inverse problem family.", successCriteria: "A theorem or counterexample.", stage: "theory",
    hypotheses: [{ statement: "Compactness is necessary.", rationale: "Needs testing.", confidence: 70, sourceStatementIds: ["invented"] }],
  }, new Set(["statement-1"])), /no traceable research problem hypotheses/);

  assert.throws(() => sanitizeResearchProblemAssessment({
    summaryZh: "当前证据仍有限。", summaryEn: "Current evidence remains limited.",
    uncertaintyZh: "必要性未知。", uncertaintyEn: "Necessity is unknown.",
    nextDecisionZh: "寻找反例。", nextDecisionEn: "Look for a counterexample.",
    sourceStatementIds: ["invented"],
  }, new Set(["statement-1"]), new Set(["hypothesis-1"])), /untraceable research problem assessment/);
});

test("research problem evidence revisions are stable and change when confirmed inputs change", async () => {
  const base = {
    problemUpdatedAt: "2026-08-21 09:00:00",
    synthesisRevision: "synthesis-a",
    hypotheses: [{ id: "h-1", statement: "A", status: "confirmed", updatedAt: "2026-08-21 09:00:00" }],
  };
  const first = await researchProblemInputRevision(base);
  const reordered = await researchProblemInputRevision({ ...base, hypotheses: [...base.hypotheses].reverse() });
  const changed = await researchProblemInputRevision({ ...base, synthesisRevision: "synthesis-b" });

  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("research-problem discovery rejects stale assessments and unsafe queries", async () => {
  const input = {
    problemStatus: "active",
    problemUpdatedAt: "2026-08-21 09:00:00",
    synthesisRevision: "synthesis-a",
    hypotheses: [{ id: "h-1", statement: "A", status: "confirmed", updatedAt: "2026-08-21 09:00:00" }],
  };
  const assessmentInputRevision = await researchProblemInputRevision(input);
  assert.equal(await researchProblemDiscoveryQuery({ ...input, assessmentInputRevision, nextSearchQuery: "inverse stability compactness" }), "inverse stability compactness");
  assert.equal(await researchProblemDiscoveryQuery({ ...input, synthesisRevision: "synthesis-b", assessmentInputRevision, nextSearchQuery: "inverse stability compactness" }), "");
  assert.equal(await researchProblemDiscoveryQuery({ ...input, assessmentInputRevision, nextSearchQuery: "inverse stability AND compactness" }), "");
});

test("research-problem conclusions expose their evidence trail and discovery uses the shared queue", async () => {
  const [api, map, monitor, client, styles] = await Promise.all([
    readFile(new URL("../app/api/research-problem/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(api, /sanitizeResearchProblemAssessment\(llm\.parsed, statementIds, hypothesisIds\)/);
  assert.match(map, /const problemExpanding = payload\.action === "expand-problem"/);
  assert.match(map, /activeResearchProblemDiscoverySignal/);
  assert.match(map, /automaticGapExpanding \? automaticSourceKind : actionExpanding \? "action" : problemExpanding \? "problem"/);
  assert.match(map, /enqueueMonitorCandidates/);
  assert.match(map, /const needsProtectedBaseline = hydrating[\s\S]*targetedExpanding/);
  assert.match(map, /hydrating \? 12 : 6/);
  assert.match(monitor, /researchProblemDiscoveryQuery/);
  assert.match(monitor, /problem_assessment_input_revision/);
  assert.match(monitor, /sourceKey: "research-route:problem"/);
  assert.match(client, /function ResearchStatementTrace/);
  assert.match(client, /claim \{source\.claimId\}/);
  assert.match(client, /action: origin === "problem" \? "expand-problem" : "expand-gap"/);
  assert.match(client, /候选进入今日共用的质量评估队列/);
  assert.match(client, /routeBuildDegraded/);
  assert.match(client, /这不代表没有合适论文/);
  assert.match(styles, /\.v2-problem-statement-trace/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.v2-problem-next-search[^}]*flex-direction:\s*column/);
});
