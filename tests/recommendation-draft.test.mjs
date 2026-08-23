import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  hasCompleteRecommendationDraft,
  isRetryableEmptyDraftDegradation,
  recommendationDraftMissingFields,
  verifierContradictsCompleteDraft,
} from "../lib/recommendation-draft.mjs";

const completeDraft = {
  recommended: true,
  summaryZh: "这篇论文研究熵正则最优传输成本的收敛速度，并从给定摘要中提取问题、方法和主要结论，形成可核验的保守介绍。",
  summaryEn: "This paper studies convergence rates for entropic optimal transport costs and states the problem, method, and contribution conservatively from the supplied abstract evidence.",
  whyReadZh: "它直接连接最优传输与正则化误差分析，适合用于判断收敛界的适用条件以及后续证明路线。",
  whyReadEn: "It connects optimal transport with regularization error analysis and helps assess the assumptions behind convergence bounds.",
  problemZh: "熵正则最优传输成本在正则参数趋于零时如何收敛。",
  problemEn: "How entropic optimal transport costs converge as regularization vanishes.",
  methodZh: "利用最优传输结构与渐近分析研究成本差异。",
  methodEn: "The work uses optimal-transport structure and asymptotic analysis of the cost gap.",
  contributionZh: "摘要支持其给出收敛速度及相应条件。",
  contributionEn: "The abstract supports a convergence-rate result under stated conditions.",
  limitationsZh: "当前仅依据摘要，常数依赖和证明细节仍需阅读全文确认。",
  limitationsEn: "Only the abstract is available, so constants and proof details still require full-text review.",
  readingFocusZh: "重点核对收敛界的假设、量级和可迁移性。",
  readingFocusEn: "Check the assumptions, order of the bound, and whether the argument transfers.",
  researchQuestionsZh: ["能否推广到非光滑成本？", "常数是否具有维数依赖？"],
  researchQuestionsEn: ["Can it extend to nonsmooth costs?", "How do the constants depend on dimension?"],
};

test("a recommendation draft must contain substantive bilingual reading intelligence", () => {
  assert.equal(hasCompleteRecommendationDraft(completeDraft), true);
  const incomplete = { ...completeDraft, methodZh: "", researchQuestionsEn: [] };
  assert.equal(hasCompleteRecommendationDraft(incomplete), false);
  assert.deepEqual(recommendationDraftMissingFields(incomplete), ["methodZh", "researchQuestionsEn"]);
});

test("a verifier cannot erase a complete draft by falsely claiming it is empty", () => {
  assert.equal(verifierContradictsCompleteDraft("The draft is empty, providing no claims to verify.", completeDraft), true);
  assert.equal(verifierContradictsCompleteDraft("The contribution overstates the supplied abstract.", completeDraft), false);
});

test("legacy empty-draft degradations are eligible for one clean re-draft", () => {
  assert.equal(isRetryableEmptyDraftDegradation({
    verificationStatus: "degraded",
    screeningReason: "Independent evidence gate withheld this recommendation: no populated substantive fields",
    verificationReport: {},
  }), true);
  assert.equal(isRetryableEmptyDraftDegradation({
    verificationStatus: "degraded",
    screeningReason: "The abstract does not support the claimed optimality result",
    verificationReport: {},
  }), false);
  assert.equal(isRetryableEmptyDraftDegradation({
    verificationStatus: "degraded",
    screeningReason: "Independent evidence gate withheld this recommendation",
    verificationReport: {
      coverageScore: 1,
      supportedFields: ["summary", "problem", "method", "contribution"],
      claimChecks: [{}, {}, {}, {}],
      unsupportedFields: [],
      overstatements: [],
      contradictionRisks: [],
    },
  }), true);
});

test("monitor preserves pending and failed verification counts during brief enhancement", async () => {
  const route = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(route, /verificationPending: reviews\.filter\(\(review\) => review\.verificationRetryable\)\.length/);
  assert.match(route, /verificationFailed: reviews\.filter\(\(review\) => review\.verificationStatus === "degraded"\)\.length/);
  assert.match(route, /incompleteDraftCarryover/);
  assert.match(route, /regeneratingIncompleteDraft/);
  assert.match(route, /本轮暂无正式推荐，\$\{verificationFailed\} 篇证据未通过/);
});
