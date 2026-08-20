import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routePath = new URL("../app/api/research-map/route.ts", import.meta.url);

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `${startMarker} should remain inspectable`);
  return source.slice(start, end);
}

test("research-map classifies truncated and malformed DeepSeek JSON as retryable", async () => {
  const route = await readFile(routePath, "utf8");
  const parser = section(route, "function extractCompleteJsonObject", "function boundedScore");
  const call = section(route, "async function callDeepSeek", "async function reconcileRecentRecommendations");

  assert.match(parser, /normalizedFinishReason === "length"/);
  assert.match(parser, /new DeepSeekJsonResponseError\("truncated"/);
  assert.match(parser, /new DeepSeekJsonResponseError\("invalid_json"/);
  assert.match(parser, /return JSON\.parse\(candidate\) as T/);
  assert.match(parser, /isRetryableDeepSeekJsonError/);
  assert.match(call, /parseDeepSeekJsonPayload<T>/);
  assert.doesNotMatch(call, /return JSON\.parse\(content\)/);
});

test("paper-network Pi analysis retries a smaller balanced input and preserves untouched relations", async () => {
  const route = await readFile(routePath, "utf8");
  const generator = section(route, "async function generatePaperNetworkEdges", "type PaperNetworkBuildPhase");
  const rebuild = section(route, "async function rebuildPaperNetwork", "function heatEvidence");

  assert.match(generator, /isRetryableDeepSeekJsonError\(error\)/);
  assert.match(generator, /requestedInput = reduced/);
  assert.match(generator, /requestEdges\(compact, 6000, "medium"\)/);
  assert.match(generator, /requestEdges\(reduced, 4400, "low"\)/);
  assert.match(generator, /coveredPaperIds: requestedInput\.map/);
  assert.doesNotMatch(generator, /\/empty research map\/i/);
  assert.doesNotMatch(generator, /requestEdges\(compact, 10000/);

  assert.match(rebuild, /const refreshedIds = new Set\(generated\.coveredPaperIds\)/);
  assert.match(rebuild, /curatedEdges\.filter\(\(edge\) => !refreshedIds\.has\(edge\.sourcePaperId\) \|\| !refreshedIds\.has\(edge\.targetPaperId\)\)/);
  assert.match(rebuild, /replacePaperNetworkEdges\(database, space\.id, \["semantic", "path"\], freshEdges, generated\.coveredPaperIds\)/);
  assert.match(rebuild, /if \(curatedEdges\.length\) sources\.push\(`\$\{MODEL\}-cache`\)/);
});

test("recommendation reconciliation bounds each request and retries malformed JSON with a smaller batch", async () => {
  const route = await readFile(routePath, "utf8");
  const reconcile = section(route, "async function reconcileRecentRecommendations", "async function generateDirections");

  assert.match(reconcile, /primaryReconcileInput = unmatched\.slice\(0, 6\)/);
  assert.match(reconcile, /reducedReconcileInput = primaryReconcileInput\.slice/);
  assert.match(reconcile, /requestAssignments\(primaryReconcileInput, 3200, "medium"\)/);
  assert.match(reconcile, /isRetryableDeepSeekJsonError\(error\)/);
  assert.match(reconcile, /requestAssignments\(reducedReconcileInput, 2200, "low"\)/);
  assert.match(reconcile, /reconciledInputIds\.has\(canonicalId\)/);
  assert.doesNotMatch(reconcile, /\n\s*5000,\n\s*apiKey/);
});
