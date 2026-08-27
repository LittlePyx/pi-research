import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const routePath = new URL("../app/api/research-map/route.ts", import.meta.url);

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `${startMarker} should remain inspectable`);
  return source.slice(start, end);
}

async function loadReplacePaperNetworkEdges(source) {
  const functionSource = section(source, "async function replacePaperNetworkEdges", "async function writePaperNetworkState");
  const output = ts.transpileModule(`const NETWORK_PAPER_LIMIT = 40; export ${functionSource}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
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

test("paper-network Pi analysis retries a smaller balanced input and preserves untouched semantic relations", async () => {
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
  assert.match(rebuild, /let curatedEdges = cachedEdges\.filter\(\(edge\) => edge\.kind === "semantic"\)/);
  assert.match(rebuild, /replacePaperNetworkEdges\(database, space\.id, \["semantic"\], freshEdges, generated\.coveredPaperIds\)/);
  assert.doesNotMatch(rebuild, /replacePaperNetworkEdges\([^;]*\["semantic", "path"\]/);
  assert.match(rebuild, /if \(curatedEdges\.length\) sources\.push\(`\$\{MODEL\}-cache`\)/);
});

test("paper-network no longer generates or returns a second reading-path graph", async () => {
  const route = await readFile(routePath, "utf8");
  const generator = section(route, "async function generatePaperNetworkEdges", "type PaperNetworkBuildPhase");
  const reader = section(route, "async function readMap", "export async function POST");

  assert.match(route, /kind: "semantic";/);
  assert.match(generator, /Create up to 14 semantic edges/);
  assert.match(generator, /if \(item\.kind !== "semantic"\) continue/);
  assert.match(generator, /kind: "semantic"/);
  assert.doesNotMatch(generator, /path edges|PAPER_PATH_RELATION_KINDS|acceptedPathEdges|pathAdjacency|canReach/);
  assert.match(reader, /\.filter\(\(edge\) => edge\.kind !== "path"\)/);
  assert.match(reader, /pathEdgeCount: 0/);
});

test("semantic refresh keeps legacy path rows and relations outside its coverage", async () => {
  const route = await readFile(routePath, "utf8");
  const { replacePaperNetworkEdges } = await loadReplacePaperNetworkEdges(route);
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_paper_edges (
        id TEXT PRIMARY KEY NOT NULL,
        space_id TEXT NOT NULL,
        source_paper_id TEXT NOT NULL,
        target_paper_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        relation_kind TEXT NOT NULL,
        relationship_zh TEXT NOT NULL,
        relationship_en TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        evidence_source TEXT NOT NULL,
        UNIQUE(source_paper_id, target_paper_id, kind, relation_kind)
      );
      INSERT INTO research_paper_edges VALUES
        ('path-old', 'space-a', 'paper-a', 'paper-b', 'path', 'advances', '旧路径', 'Old path', 72, 'deepseek-chat'),
        ('semantic-old', 'space-a', 'paper-a', 'paper-b', 'semantic', 'extends', '旧语义', 'Old semantic', 65, 'deepseek-chat'),
        ('semantic-outside', 'space-a', 'paper-c', 'paper-d', 'semantic', 'bridges', '覆盖外', 'Outside coverage', 68, 'deepseek-chat');
    `);
    const database = {
      prepare(sql) {
        return { bind: (...params) => ({ sql, params }) };
      },
      async batch(statements) {
        for (const statement of statements) sqlite.prepare(statement.sql).run(...statement.params);
      },
    };

    await replacePaperNetworkEdges(database, "space-a", ["semantic"], [{
      sourcePaperId: "paper-a",
      targetPaperId: "paper-b",
      kind: "semantic",
      relationKind: "extends",
      relationshipZh: "新语义",
      relationshipEn: "New semantic",
      confidence: 81,
      evidenceSource: "deepseek-chat",
    }], ["paper-a", "paper-b"]);

    assert.equal(sqlite.prepare("SELECT relationship_en FROM research_paper_edges WHERE id = 'path-old'").get().relationship_en, "Old path");
    assert.equal(sqlite.prepare("SELECT relationship_en FROM research_paper_edges WHERE source_paper_id = 'paper-a' AND kind = 'semantic'").get().relationship_en, "New semantic");
    assert.equal(sqlite.prepare("SELECT relationship_en FROM research_paper_edges WHERE id = 'semantic-outside'").get().relationship_en, "Outside coverage");
  } finally {
    sqlite.close();
  }
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
