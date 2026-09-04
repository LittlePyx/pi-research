import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { learningPathResultMessage } from "../lib/learning-path.ts";

test("generation messages count attached unique papers, not considered or supplementary candidates", () => {
  const path = { model: "deepseek-v4-pro", steps: [{ resources: [{ id: "a", canonicalId: "doi:a" }], supplementaryResources: [{ id: "b" }] }, { resources: [{ id: "a2", canonicalId: "doi:a" }] }] };
  assert.match(learningPathResultMessage(path, "zh"), /1 篇/);
  assert.match(learningPathResultMessage(path, "en"), /1 reading papers/);
  assert.match(learningPathResultMessage({ ...path, steps: [] }, "zh"), /待补齐/);
  assert.match(learningPathResultMessage({ ...path, model: "evidence-structure-v1" }, "zh"), /模型规划尚未完成/);
});

test("model planning sets a finite request deadline even during unbounded development", async () => {
  const source = await readFile(new URL("../app/api/learning-path/route.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function buildDraft");
  const code = ts.transpileModule(source.slice(start, source.indexOf("async function queueRouteLearningCandidates", start)), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const controller = new AbortController();
  let requestedTimeout = 0;
  const build = new Function("usageCount", "unboundedDevelopmentRetries", "MODEL", "AbortSignal", "fetch", code + "\nreturn buildDraft;")(
    async () => 999, () => true, "fixture-model",
    { timeout: (ms) => { requestedTimeout = ms; return controller.signal; } },
    async (_url, options) => {
      assert.equal(options.signal, controller.signal);
      controller.abort(new DOMException("Fixture deadline", "TimeoutError"));
      options.signal.throwIfAborted();
    },
  );
  await assert.rejects(build({}, "fixture", {}, "KLS", { candidates: [] }, "mock-only"), { name: "TimeoutError" });
  assert.equal(requestedTimeout, 240_000);
});
