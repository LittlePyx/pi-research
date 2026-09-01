import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RESEARCH_ROUTE_BASELINE_MODEL, RESEARCH_ROUTE_BASELINE_SQL } from "../lib/research-route-baseline.ts";

const migrationUrl = new URL("../drizzle/0051_tricky_wither.sql", import.meta.url);
const baselineMigrationUrl = new URL("../drizzle/0052_route_version_baselines.sql", import.meta.url);
const apiUrl = new URL("../app/api/research-map/route.ts", import.meta.url);
const uiUrl = new URL("../app/research-app.tsx", import.meta.url);
const cssUrl = new URL("../app/globals.css", import.meta.url);

test("existing formal routes receive one exact, non-destructive v1 baseline", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY);
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
        title_zh TEXT NOT NULL,
        title_en TEXT NOT NULL,
        summary_zh TEXT NOT NULL,
        summary_en TEXT NOT NULL,
        search_queries TEXT NOT NULL
      );
      INSERT INTO research_spaces VALUES ('space-a');
      INSERT INTO research_tracks VALUES
       ('track-a', 'space-a', '信息瓶颈', 'Information bottleneck', '原有摘要', 'Existing summary', '["information bottleneck"]'),
       ('track-b', 'space-a', '已有历史', 'Existing history', '保持', 'Retain', '["existing history"]');
    `);
    sqlite.exec((await readFile(migrationUrl, "utf8")).replaceAll("--> statement-breakpoint", ""));
    sqlite.prepare(
      `INSERT INTO research_route_revisions
       (id, space_id, track_id, version, status, input_revision, title_zh, title_en, previous_title_zh, previous_title_en)
       VALUES ('existing-b', 'space-a', 'track-b', 1, 'confirmed', 'existing-input', '已有历史', 'Existing history', '已有历史', 'Existing history')`,
    ).run();

    sqlite.prepare(RESEARCH_ROUTE_BASELINE_SQL).run("space-a");
    sqlite.prepare(RESEARCH_ROUTE_BASELINE_SQL).run("space-a");

    const baseline = sqlite.prepare(
      "SELECT * FROM research_route_revisions WHERE track_id = 'track-a'",
    ).get();
    assert.equal(baseline.id, "route-baseline:track-a");
    assert.equal(baseline.version, 1);
    assert.equal(baseline.status, "confirmed");
    assert.equal(baseline.model, RESEARCH_ROUTE_BASELINE_MODEL);
    assert.equal(baseline.title_zh, "信息瓶颈");
    assert.equal(baseline.previous_title_zh, "信息瓶颈");
    assert.equal(baseline.summary_en, "Existing summary");
    assert.equal(baseline.search_queries_json, '["information bottleneck"]');
    assert.equal(baseline.previous_search_queries_json, '["information bottleneck"]');
    assert.equal(baseline.source_paper_ids_json, "[]");
    assert.equal(baseline.confidence, 0);
    assert.ok(baseline.decided_at);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_route_revisions WHERE track_id = 'track-a'").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_route_revisions WHERE track_id = 'track-b'").get().count, 1);
    assert.equal(sqlite.prepare("SELECT title_zh FROM research_tracks WHERE id = 'track-a'").get().title_zh, "信息瓶颈");
    assert.equal(sqlite.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM research_route_revisions WHERE track_id = 'track-a'").get().next_version, 2);
  } finally {
    sqlite.close();
  }
});

test("the deployment migration backfills every untouched route without rewriting history", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY);
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
        title_zh TEXT NOT NULL,
        title_en TEXT NOT NULL,
        summary_zh TEXT NOT NULL,
        summary_en TEXT NOT NULL,
        search_queries TEXT NOT NULL
      );
      INSERT INTO research_spaces VALUES ('space-a');
      INSERT INTO research_tracks VALUES
       ('track-a', 'space-a', '现有路线', 'Existing route', '原摘要', 'Original summary', '["original query"]'),
       ('track-b', 'space-a', '已有版本', 'Versioned route', '保留', 'Retained', '["retained query"]');
    `);
    sqlite.exec((await readFile(migrationUrl, "utf8")).replaceAll("--> statement-breakpoint", ""));
    sqlite.prepare(
      `INSERT INTO research_route_revisions
       (id, space_id, track_id, version, status, input_revision, title_zh, title_en, previous_title_zh, previous_title_en)
       VALUES ('existing-b', 'space-a', 'track-b', 1, 'confirmed', 'existing-input', '已有版本', 'Versioned route', '已有版本', 'Versioned route')`,
    ).run();
    const migration = await readFile(baselineMigrationUrl, "utf8");
    sqlite.exec(migration);
    sqlite.exec(migration);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_route_revisions").get().count, 2);
    assert.equal(sqlite.prepare("SELECT model FROM research_route_revisions WHERE track_id = 'track-a'").get().model, RESEARCH_ROUTE_BASELINE_MODEL);
    assert.equal(sqlite.prepare("SELECT id FROM research_route_revisions WHERE track_id = 'track-b'").get().id, "existing-b");
    assert.equal(sqlite.prepare("SELECT summary_zh FROM research_tracks WHERE id = 'track-a'").get().summary_zh, "原摘要");
    assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE)\b/i);
  } finally {
    sqlite.close();
  }
});

test("route reads and proposals establish baselines before version evaluation", async () => {
  const api = await readFile(apiUrl, "utf8");
  const proposer = api.slice(api.indexOf("async function proposeResearchRouteEvolution"), api.indexOf("async function decideResearchRouteEvolution"));
  const reader = api.slice(api.indexOf("async function readMap"), api.indexOf("export async function GET"));
  assert.ok(proposer.indexOf("await ensureResearchRouteBaselines(database, space.id)") < proposer.indexOf("routeEvolutionBasis(database, space.id, track)"));
  assert.ok(reader.indexOf("await ensureResearchRouteBaselines(database, spaceId)") < reader.indexOf("Promise.all"));
  assert.match(api, /INSERT INTO research_route_revisions[\s\S]*COALESCE\(MAX\(version\), 0\) \+ 1/);
});

test("research lead detail exposes one responsive decision panel backed by the shared route funnel", async () => {
  const [ui, css] = await Promise.all([readFile(uiUrl, "utf8"), readFile(cssUrl, "utf8")]);
  assert.match(ui, /function ResearchLeadDecisionPanel/);
  assert.match(ui, /当前要决定/);
  assert.match(ui, /证据发生了什么变化/);
  assert.match(ui, /下一步行动/);
  assert.match(ui, /track\.discoveryEffect\.discoveredCount/);
  assert.match(ui, /track\.discoveryEffect\.deepReviewedCount/);
  assert.match(ui, /track\.discoveryEffect\.recommendedCount/);
  assert.match(ui, /track\.discoveryEffect\.acceptedCount/);
  assert.match(ui, /只有通过共享质量评估的论文才会进入今日/);
  assert.match(ui, /ResearchLeadDecisionPanel track=\{selectedThread\}/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.v2-research-decision-grid \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(css, /\.v2-research-decision-(?:panel|funnel)[^\n]*display:\s*none/);
});
