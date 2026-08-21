import assert from "node:assert/strict";
import test from "node:test";

import {
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
