import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const routePath = new URL("../app/api/learning-path/route.ts", import.meta.url);

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `${startMarker} should remain inspectable`);
  return source.slice(start, end);
}

function sqlConstant(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const template = source.match(new RegExp("const " + escaped + " = `([\\s\\S]*?)`;"));
  if (template) return template[1];
  const quoted = source.match(new RegExp(`const ${escaped} = "([^"]+)";`));
  assert.ok(quoted, `${name} should remain inspectable`);
  return quoted[1];
}

async function loadTargetDirectionCoverage(source) {
  const functionSource = section(source, "function targetDirectionResourceCoverage", "function parseResources");
  const output = ts.transpileModule(`export ${functionSource}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function loadLearningResourceHelpers(source) {
  const functionSource = section(source, "export function learningResourceHref", "export type LearningPathStep");
  const output = ts.transpileModule(functionSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("direction-scoped learning paths validate and persist their target track", async () => {
  const [route, types, schema, repository, migration] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(new URL("../lib/learning-path.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0027_regular_amphibian.sql", import.meta.url), "utf8"),
  ]);
  const post = section(route, "export async function POST", "export async function PATCH");

  assert.match(types, /targetTrackId: string \| null/);
  assert.match(schema, /targetTrackId: text\("target_track_id"\).*onDelete: "set null"/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS learning_paths [^\n]*target_track_id TEXT REFERENCES research_tracks\(id\) ON DELETE SET NULL/);
  assert.match(repository, /ALTER TABLE learning_paths ADD COLUMN target_track_id TEXT REFERENCES research_tracks\(id\) ON DELETE SET NULL/);
  assert.ok(
    repository.indexOf("ALTER TABLE learning_paths ADD COLUMN target_track_id")
      < repository.indexOf("CREATE INDEX IF NOT EXISTS idx_learning_paths_space_target_updated"),
    "legacy learning-path columns must be added before their index is created",
  );
  assert.match(migration, /ADD `target_track_id` text REFERENCES research_tracks\(id\) ON DELETE SET NULL/);
  assert.match(post, /trackId\?: string \| null/);
  assert.match(post, /WHERE id = \? AND space_id = \? LIMIT 1/);
  assert.match(post, /Research direction not found in this workspace/);
  assert.match(post, /contextForSpace\(owned\.database, owned\.space, targetTrackId\)/);
  assert.match(post, /INSERT INTO learning_paths \(id, space_id, target, target_track_id/);
});

test("direction learning-path generation persists one bounded route signal in the creation batch", async () => {
  const route = await readFile(routePath, "utf8");
  const post = section(route, "export async function POST", "export async function PATCH");
  const signalSql = sqlConstant(route, "LEARNING_PATH_GENERATION_ROUTE_SIGNAL_SQL");
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY NOT NULL,
        space_id TEXT NOT NULL,
        interaction_score INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO research_tracks (id, space_id, interaction_score) VALUES
       ('track-a', 'space-a', 0), ('track-b', 'space-a', 34);
    `);
    sqlite.prepare(signalSql).run("track-a", "space-a");
    sqlite.prepare(signalSql).run("track-b", "space-a");
    assert.equal(sqlite.prepare("SELECT interaction_score FROM research_tracks WHERE id = 'track-a'").get().interaction_score, 3);
    assert.equal(sqlite.prepare("SELECT interaction_score FROM research_tracks WHERE id = 'track-b'").get().interaction_score, 35);

    assert.match(post, /\.\.\.\(targetTrackId \? \[owned\.database\.prepare\(LEARNING_PATH_GENERATION_ROUTE_SIGNAL_SQL\)\.bind\(targetTrackId, spaceId\)\] : \[\]\)/);
    assert.ok(post.indexOf("LEARNING_PATH_GENERATION_ROUTE_SIGNAL_SQL") < post.indexOf("owned.database.batch(statements)"));
  } finally {
    sqlite.close();
  }
});

test("first stage completion signals only the path target route and repeated PATCH cannot add twice", async () => {
  const route = await readFile(routePath, "utf8");
  const patch = route.slice(route.indexOf("export async function PATCH"));
  const signalSql = sqlConstant(route, "LEARNING_PATH_STAGE_ROUTE_SIGNAL_SQL");
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY NOT NULL,
        space_id TEXT NOT NULL,
        interaction_score INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE learning_paths (
        id TEXT PRIMARY KEY NOT NULL,
        space_id TEXT NOT NULL,
        target_track_id TEXT,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE TABLE learning_path_steps (
        id TEXT PRIMARY KEY NOT NULL,
        path_id TEXT NOT NULL,
        space_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        completed_at TEXT
      );
      INSERT INTO research_tracks (id, space_id) VALUES ('track-a', 'space-a'), ('track-b', 'space-a');
      INSERT INTO learning_paths (id, space_id, target_track_id) VALUES ('path-a', 'space-a', 'track-a');
      INSERT INTO learning_path_steps (id, path_id, space_id) VALUES ('step-a', 'path-a', 'space-a');
    `);
    const signal = sqlite.prepare(signalSql);
    signal.run("track-a", "space-a", "step-a", "path-a", "space-a");
    sqlite.prepare("UPDATE learning_path_steps SET status = 'completed', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE id = 'step-a'").run();
    signal.run("track-a", "space-a", "step-a", "path-a", "space-a");
    sqlite.prepare("UPDATE learning_path_steps SET status = 'pending' WHERE id = 'step-a'").run();
    signal.run("track-a", "space-a", "step-a", "path-a", "space-a");
    signal.run("track-b", "space-a", "step-a", "path-a", "space-a");
    assert.equal(sqlite.prepare("SELECT interaction_score FROM research_tracks WHERE id = 'track-a'").get().interaction_score, 2);
    assert.equal(sqlite.prepare("SELECT interaction_score FROM research_tracks WHERE id = 'track-b'").get().interaction_score, 0);

    assert.match(patch, /if \(completing && step\.target_track_id\)/);
    assert.match(patch, /progressStatements\.push\(owned\.database\.prepare\(LEARNING_PATH_STAGE_ROUTE_SIGNAL_SQL\)/);
    assert.match(patch, /completed_at = CASE WHEN \? = 1 THEN COALESCE\(completed_at, \?\) ELSE completed_at END/);
    assert.ok(patch.indexOf("LEARNING_PATH_STAGE_ROUTE_SIGNAL_SQL") < patch.indexOf("progressStatements.push(owned.database.prepare(\"UPDATE learning_path_steps"));
    assert.doesNotMatch(patch, /paper_reading_progress|UPDATE monitored_papers/);
  } finally {
    sqlite.close();
  }
});

test("workspace-wide learning paths do not write an unrelated route signal", async () => {
  const route = await readFile(routePath, "utf8");
  const post = section(route, "export async function POST", "export async function PATCH");
  const patch = route.slice(route.indexOf("export async function PATCH"));

  assert.match(post, /targetTrackId \? \[owned\.database\.prepare\(LEARNING_PATH_GENERATION_ROUTE_SIGNAL_SQL\)/);
  assert.match(patch, /if \(completing && step\.target_track_id\)/);
  assert.doesNotMatch(patch, /parseResources\(step\.resources_json\)/);
});

test("0027 runs before runtime bootstrap without a duplicate-column path", async () => {
  const [migration, repository] = await Promise.all([
    readFile(new URL("../drizzle/0027_regular_amphibian.sql", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
  ]);
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE research_tracks (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE learning_paths (
        id TEXT PRIMARY KEY NOT NULL,
        space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
        target TEXT NOT NULL,
        title_zh TEXT NOT NULL,
        title_en TEXT NOT NULL,
        rationale_zh TEXT NOT NULL DEFAULT '',
        rationale_en TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        analysis_model TEXT NOT NULL DEFAULT '',
        estimated_minutes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO research_spaces (id) VALUES ('space-a');
      INSERT INTO research_tracks (id) VALUES ('track-a');
      INSERT INTO learning_paths (id, space_id, target, title_zh, title_en) VALUES ('path-a', 'space-a', 'target', '路径', 'Path');
    `);
    sqlite.exec(migration.replaceAll("--> statement-breakpoint", ""));

    const bootstrapStatements = Array.from(repository.matchAll(/database\.prepare\("(CREATE (?:TABLE|INDEX) IF NOT EXISTS (?:learning_paths|idx_learning_paths_[^ ]+)[^"]*)"\)/g), (match) => match[1]);
    assert.ok(bootstrapStatements.length >= 3);
    for (const statement of bootstrapStatements) sqlite.exec(statement);

    assert.equal(sqlite.prepare("SELECT target_track_id FROM learning_paths WHERE id = 'path-a'").get().target_track_id, null);
    assert.ok(sqlite.prepare("PRAGMA index_list(learning_paths)").all().some((row) => row.name === "idx_learning_paths_space_target_updated"));
    const targetFk = sqlite.prepare("PRAGMA foreign_key_list(learning_paths)").all().find((row) => row.from === "target_track_id");
    assert.equal(targetFk?.on_delete, "SET NULL");
  } finally {
    sqlite.close();
  }
});

test("direction-scoped candidate context uses a target backbone and bounded bridges", async () => {
  const route = await readFile(routePath, "utf8");
  const context = section(route, "async function contextForSpace", "async function usageCount");
  const draft = section(route, "async function buildDraft", "async function queueRouteLearningCandidates");

  assert.match(route, /TARGET_DIRECTION_RESOURCE_LIMIT = 36/);
  assert.match(route, /CROSS_DIRECTION_RESOURCE_LIMIT = 12/);
  assert.match(route, /TARGET_DAILY_BRIDGE_LIMIT = 12/);
  assert.match(context, /p\.track_id = \?/);
  assert.match(context, /p\.track_id != \?/);
  assert.match(context, /'target-direction' AS selection_role/);
  assert.match(context, /'cross-direction-bridge' AS selection_role/);
  assert.match(context, /daily-scan-bridge/);
  assert.match(draft, /targetDirection: context\.targetTrack/);
  assert.match(draft, /candidatePolicy: context\.candidatePolicy/);
  assert.match(draft, /target-direction/);
  assert.match(context, /i\.ever_recommended = 1/);
});

test("direction-scoped drafts enforce real target-paper coverage after model output", async () => {
  const route = await readFile(routePath, "utf8");
  const draft = section(route, "async function buildDraft", "async function queueRouteLearningCandidates");
  const { targetDirectionResourceCoverage } = await loadTargetDirectionCoverage(route);
  const candidates = [
    { resource_id: "target-a", track_id: "track-a", selection_role: "target-direction" },
    { resource_id: "target-b", track_id: "track-a", selection_role: "target-direction" },
    { resource_id: "bridge", track_id: "track-b", selection_role: "cross-direction-bridge" },
    { resource_id: "spoof", track_id: "track-b", selection_role: "target-direction" },
  ];

  assert.deepEqual(targetDirectionResourceCoverage(candidates, null, ["bridge"]), { available: 0, required: 0, used: 0, valid: true });
  assert.deepEqual(targetDirectionResourceCoverage(candidates, "track-a", ["bridge", "spoof"]), { available: 2, required: 2, used: 0, valid: false });
  assert.deepEqual(targetDirectionResourceCoverage(candidates, "track-a", ["target-a"]), { available: 2, required: 2, used: 1, valid: false });
  assert.deepEqual(targetDirectionResourceCoverage(candidates, "track-a", ["target-a", "target-b"]), { available: 2, required: 2, used: 2, valid: true });
  assert.deepEqual(targetDirectionResourceCoverage(candidates.slice(0, 1), "track-a", ["target-a"]), { available: 1, required: 1, used: 1, valid: true });

  assert.match(draft, /targetDirectionResourceCoverage\(context\.candidates, context\.targetTrack\?\.id \|\| null, usedResourceIds\)/);
  assert.match(draft, /missingTargetIds/);
  assert.match(draft, /step\.resourceIds\.push\(candidate\.resource_id\)/);
  assert.match(draft, /step\.evidenceQuery = ""/);
});

test("learning resources preserve provenance, quality and reading state with legacy compatibility", async () => {
  const [route, types] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(new URL("../lib/learning-path.ts", import.meta.url), "utf8"),
  ]);
  const parser = section(route, "function parseResources", "async function ownedSpace");

  assert.match(types, /canonicalId\?: string/);
  assert.match(types, /source\?: LearningResourceSource/);
  assert.match(types, /qualityScore\?: number \| null/);
  assert.match(types, /readingStatus\?: LearningReadingStatus/);
  assert.match(types, /suggestedMinutes\?: number \| null/);
  assert.match(types, /qualification\?: "quality_approved"/);
  assert.match(parser, /typeof item\.canonicalId === "string"/);
  assert.match(parser, /item\.source === "research-map"/);
  assert.match(route, /canonicalId: item\.canonical_id/);
  assert.match(route, /source: item\.source/);
  assert.match(route, /qualityScore: item\.quality_score/);
  assert.match(route, /readingStatus: readingStatus\(item\.reading_status\)/);
  assert.match(route, /suggestedMinutes: item\.read_minutes/);
  assert.match(route, /qualification: "quality_approved"/);
  assert.match(route, /candidate\.reading_status !== "mastered" && candidate\.reading_status !== "cited"/);
});

test("legacy learning resources expose only safe original-paper links", async () => {
  const types = await readFile(new URL("../lib/learning-path.ts", import.meta.url), "utf8");
  const { learningResourceHref, learningResourceTitleKey } = await loadLearningResourceHelpers(types);

  assert.equal(learningResourceHref({ url: "https://example.org/paper", canonicalId: undefined }), "https://example.org/paper");
  assert.equal(learningResourceHref({ url: "", canonicalId: "doi:10.1000/example paper" }), "https://doi.org/10.1000/example%20paper");
  assert.equal(learningResourceHref({ url: "javascript:alert(1)", canonicalId: undefined }), null);
  assert.equal(learningResourceHref({ url: "", canonicalId: undefined }), null);
  assert.equal(learningResourceTitleKey("  Rate–Distortion:  Theory  "), "rate distortion theory");
});

test("draft validation de-duplicates papers and leaves honest evidence queries for missing stages", async () => {
  const route = await readFile(routePath, "utf8");
  const draft = section(route, "async function buildDraft", "async function queueRouteLearningCandidates");

  assert.match(draft, /const usedResourceIds = new Set<string>\(\)/);
  assert.match(draft, /!usedResourceIds\.has\(id\)/);
  assert.match(draft, /for \(const id of resourceIds\) usedResourceIds\.add\(id\)/);
  assert.match(draft, /LEARNING_STAGE_ORDER\.map/);
  assert.match(draft, /safeAutomaticResearchGapQuery\(raw\?\.evidenceQuery\) \|\| fallback\.evidenceQuery/);
  assert.match(draft, /resourceIds\.length \? ""/);
});

test("progress updates cannot revive a superseded path", async () => {
  const route = await readFile(routePath, "utf8");
  const patchStart = route.indexOf("export async function PATCH");
  assert.ok(patchStart >= 0);
  const patch = route.slice(patchStart);

  assert.match(patch, /p\.status AS path_status/);
  assert.match(patch, /step\.path_status === "superseded"/);
  assert.match(patch, /status: 409/);
  assert.match(patch, /EXISTS \(SELECT 1 FROM learning_paths p WHERE p\.id = \? AND p\.space_id = \? AND p\.status != 'superseded'\)/);
  assert.match(patch, /stepUpdate\.meta\.changes/);
  assert.match(patch, /p\.status != 'superseded'/);
  assert.match(patch, /visibleStep\.resources\.length === 0/);
});
