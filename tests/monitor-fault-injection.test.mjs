import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deepReviewCompletion,
  isFatalModelFailure,
  modelFailureCode,
  settleFaultTolerantBatch,
  shouldOpenDeepReviewCircuit,
} from "../lib/monitor-fault-policy.mjs";

test("fault policy classifies the production failure modes", () => {
  assert.equal(modelFailureCode(new DOMException("The operation timed out", "TimeoutError")), "timeout");
  assert.equal(modelFailureCode(new Error("DeepSeek returned 429 rate limit")), "rate_limited");
  assert.equal(modelFailureCode(new Error("DeepSeek returned 503")), "upstream_unavailable");
  assert.equal(modelFailureCode(new Error("DeepSeek Pro returned malformed JSON")), "invalid_model_output");
  assert.equal(modelFailureCode(new Error("invalid API key")), "invalid_credential");
  assert.equal(modelFailureCode(new Error("Insufficient balance")), "insufficient_balance");
  assert.equal(isFatalModelFailure(new Error("invalid API key")), true);
  assert.equal(isFatalModelFailure(new Error("request timeout")), false);
});

test("a slow or broken paper cannot discard successful sibling reviews", async () => {
  const saved = [];
  const result = await settleFaultTolerantBatch(
    ["paper-ok-1", "paper-timeout", "paper-ok-2", "paper-malformed"],
    async (paper) => {
      if (paper === "paper-timeout") throw new DOMException("aborted", "AbortError");
      if (paper === "paper-malformed") throw new Error("malformed review JSON");
      return { canonicalId: paper, recommended: paper.endsWith("2") };
    },
    async (_paper, review) => { saved.push(review.canonicalId); },
  );

  assert.deepEqual(result.successes.map((item) => item.item), ["paper-ok-1", "paper-ok-2"]);
  assert.deepEqual(result.failures.map((item) => item.code), ["timeout", "invalid_model_output"]);
  assert.deepEqual(saved.sort(), ["paper-ok-1", "paper-ok-2"]);
});

test("two consecutive transient failures open a short circuit without treating credentials as transient", () => {
  assert.equal(shouldOpenDeepReviewCircuit({ consecutiveFailures: 1, completedInBatch: 0, failedInBatch: 1 }), false);
  assert.equal(shouldOpenDeepReviewCircuit({ consecutiveFailures: 2, completedInBatch: 0, failedInBatch: 1 }), true);
  assert.equal(shouldOpenDeepReviewCircuit({ consecutiveFailures: 3, completedInBatch: 1, failedInBatch: 1 }), false);
});

test("completion semantics distinguish zero quality yield from unavailable analysis", () => {
  assert.equal(deepReviewCompletion({ scheduled: 8, completed: 8, deferred: 0, recommended: 0 }).state, "no_match");
  assert.equal(deepReviewCompletion({ scheduled: 8, completed: 6, deferred: 2, recommended: 1 }).state, "partial");
  assert.equal(deepReviewCompletion({ scheduled: 8, completed: 8, deferred: 0, recommended: 2 }).state, "recommended");
  assert.equal(deepReviewCompletion({ scheduled: 8, completed: 0, deferred: 8, recommended: 0 }).state, "analysis_unavailable");
});

test("monitor uses the tested fault policy and preserves truthful degraded copy", async () => {
  const route = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(route, /settleFaultTolerantBatch/);
  assert.match(route, /shouldOpenDeepReviewCircuit/);
  assert.match(route, /kind: "llm_circuit_opened"/);
  assert.match(route, /kind: "zero_recommendation_audit"/);
  assert.match(route, /候选已保存，AI 解读暂未完成/);
  assert.match(route, /这不是“没有论文达标”的质量结论/);
  assert.match(route, /completionState: completion\.state/);
});
