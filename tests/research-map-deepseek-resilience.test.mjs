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
  const call = section(route, "async function callDeepSeek", "async function generateDirections");

  assert.match(parser, /normalizedFinishReason === "length"/);
  assert.match(parser, /new DeepSeekJsonResponseError\("truncated"/);
  assert.match(parser, /new DeepSeekJsonResponseError\("invalid_json"/);
  assert.match(parser, /return JSON\.parse\(candidate\) as T/);
  assert.match(parser, /isRetryableDeepSeekJsonError/);
  assert.match(call, /parseDeepSeekJsonPayload<T>/);
  assert.match(call, /AbortSignal\.timeout\(Math\.max\(8_000, Math\.min\(55_000/);
  assert.doesNotMatch(call, /return JSON\.parse\(content\)/);
});

test("first route generation and paper selection stay below the request boundary", async () => {
  const route = await readFile(routePath, "utf8");
  const directions = section(route, "async function generateDirections", "function roleDates");
  const selection = section(route, "async function selectPapers", "async function interpretDirection");

  assert.match(directions, /3200,[\s\S]*thinking: "disabled", timeoutMs: 28_000/);
  assert.match(selection, /7600,[\s\S]*thinking: "disabled", timeoutMs: 50_000/);
  assert.doesNotMatch(directions, /\n\s*8000,/);
  assert.doesNotMatch(selection, /\n\s*20000,/);
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

test("paper-network path hints are typed, acyclic, and optional", async () => {
  const route = await readFile(routePath, "utf8");
  const generator = section(route, "async function generatePaperNetworkEdges", "type PaperNetworkBuildPhase");

  assert.match(route, /const PAPER_PATH_RELATION_KINDS = new Set\(\["prepares", "advances"\]\)/);
  assert.match(generator, /PAPER_PATH_RELATION_KINDS\.has\(rawRelationKind\)/);
  assert.match(generator, /const canReach = \(start: string, target: string\)/);
  assert.match(generator, /if \(canReach\(edge\.targetPaperId, edge\.sourcePaperId\)\) continue/);
  assert.doesNotMatch(generator, /returned no defensible reading path/);
});

test("recommendation reconciliation consumes confirmed evidence without another LLM routing pass", async () => {
  const [route, evidence] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(new URL("../lib/research-map-evidence.ts", import.meta.url), "utf8"),
  ]);
  const reconcile = section(evidence, "export async function reconcileConfirmedResearchMapEvidence", "const decisionCtes");

  assert.match(route, /reconcileConfirmedResearchMapEvidence\(database, space\.id\)/);
  assert.match(reconcile, /ep\.status = 'confirmed'/);
  assert.match(reconcile, /research_track_papers/);
  assert.match(reconcile, /research_map_changes/);
  assert.doesNotMatch(reconcile, /llm_recommended|callDeepSeek|paper_insights[^]*analysis_source/);
});

test("targeted gap and research-action expansion queue reviewable evidence instead of writing formal route papers", async () => {
  const route = await readFile(routePath, "utf8");
  const targetedBranch = section(route, "if (targetedExpanding) {", "} else {");

  assert.match(targetedBranch, /queueResult\.queuedForReviewCount/);
  assert.match(route, /enqueueMonitorCandidates/);
  assert.match(targetedBranch, /addedCount = queueResult\.queuedForReviewCount/);
  assert.doesNotMatch(targetedBranch, /INSERT (?:OR IGNORE )?INTO research_track_papers/);
  assert.match(route, /if \(!targetedExpanding\) \{[\s\S]*saveDirectionIntelligence/);
  assert.match(route, /else if \(addedCount > 0\)[\s\S]*intelligence_status = 'pending'/);
});
