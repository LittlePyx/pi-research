import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  researchRouteEvolutionDecisionAllowed,
  researchRouteEvolutionInputRevision,
  safeResearchRouteQuery,
  SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL,
  sanitizeResearchRouteEvolution,
} from "../lib/research-route-evolution.ts";
import { researchRouteRevisionBootstrapSql } from "../db/schema.ts";

const migrationUrl = new URL("../drizzle/0051_tricky_wither.sql", import.meta.url);
const apiUrl = new URL("../app/api/research-map/route.ts", import.meta.url);
const uiUrl = new URL("../app/research-app.tsx", import.meta.url);
const cssUrl = new URL("../app/globals.css", import.meta.url);

function basis() {
  return {
    trackId: "track-a",
    titleZh: "信息论中的表示学习",
    titleEn: "Representation learning in information theory",
    summaryZh: "研究压缩、泛化和信息瓶颈之间的结构关系。",
    summaryEn: "Studies structural relations among compression, generalization, and the information bottleneck.",
    searchQueries: ["information bottleneck representation learning"],
    evidence: [{
      paperId: "paper-a",
      decidedAt: "2026-09-01 01:00:00",
      updatedAt: "2026-09-01 01:00:00",
      readingStatus: "read",
      readingUpdatedAt: "2026-09-01 01:10:00",
      memoryUpdatedAt: "2026-09-01 01:12:00",
    }],
    synthesisRevision: "synthesis-a",
    statementIds: ["statement-a"],
  };
}

test("route evolution revision changes only when formal evidence, reading, or synthesis changes", () => {
  const current = basis();
  assert.equal(researchRouteEvolutionInputRevision(current), researchRouteEvolutionInputRevision({ ...current }));
  assert.notEqual(researchRouteEvolutionInputRevision(current), researchRouteEvolutionInputRevision({
    ...current,
    evidence: [...current.evidence, {
      paperId: "paper-b", decidedAt: "2026-09-01 02:00:00", updatedAt: "2026-09-01 02:00:00",
      readingStatus: "unread", readingUpdatedAt: null, memoryUpdatedAt: null,
    }],
  }));
  assert.notEqual(researchRouteEvolutionInputRevision(current), researchRouteEvolutionInputRevision({ ...current, synthesisRevision: "synthesis-b" }));
  assert.notEqual(researchRouteEvolutionInputRevision(current), researchRouteEvolutionInputRevision({
    ...current,
    evidence: current.evidence.map((item) => ({ ...item, readingStatus: "mastered", readingUpdatedAt: "2026-09-01 02:30:00" })),
  }));
  assert.equal(researchRouteEvolutionInputRevision(current), researchRouteEvolutionInputRevision({ ...current, summaryEn: `${current.summaryEn} New scope.` }));
});

test("route evolution accepts only traceable evidence and safe future queries", () => {
  const current = basis();
  const draft = sanitizeResearchRouteEvolution({
    titleZh: "信息瓶颈与可泛化表示",
    titleEn: "Information bottlenecks and generalizable representations",
    summaryZh: "把路线收窄到可核验的压缩目标、泛化边界与表示充分性，并继续观察理论条件。",
    summaryEn: "Narrows the route to verifiable compression objectives, generalization boundaries, and representation sufficiency while tracking theoretical conditions.",
    rationaleZh: "已确认论文把关键问题从宽泛表示学习推进到压缩约束下的泛化条件。",
    rationaleEn: "Confirmed papers move the key question from broad representation learning to generalization conditions under compression constraints.",
    searchQueries: ["information bottleneck generalization bounds", "site:example.com unsafe query"],
    confidence: 99,
    sourcePaperIds: ["paper-a", "invented-paper"],
    sourceStatementIds: ["statement-a", "invented-statement"],
  }, current, new Set(["paper-a"]), new Set(["statement-a"]));
  assert.ok(draft);
  assert.deepEqual(draft.sourcePaperIds, ["paper-a"]);
  assert.deepEqual(draft.sourceStatementIds, ["statement-a"]);
  assert.deepEqual(draft.searchQueries, ["information bottleneck generalization bounds"]);
  assert.equal(draft.confidence, 72);
  assert.equal(safeResearchRouteQuery("site:example.com information bottleneck"), "");
  assert.equal(safeResearchRouteQuery("information bottleneck generalization bounds"), "information bottleneck generalization bounds");
});

test("a proposal cannot silently update a stale or already decided route", () => {
  assert.equal(researchRouteEvolutionDecisionAllowed("proposed", "revision-a", "revision-a"), true);
  assert.equal(researchRouteEvolutionDecisionAllowed("proposed", "revision-a", "revision-b"), false);
  assert.equal(researchRouteEvolutionDecisionAllowed("confirmed", "revision-a", "revision-a"), false);
  assert.equal(researchRouteEvolutionDecisionAllowed("dismissed", "revision-a", "revision-a"), false);
});

test("confirmed evidence schedules one provisional route assessment after intelligence catches up", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL);
      CREATE TABLE monitor_runs (space_id TEXT PRIMARY KEY, automation_paused_at TEXT, last_user_activity_at TEXT);
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, build_status TEXT NOT NULL,
        monitoring_status TEXT NOT NULL, intelligence_status TEXT NOT NULL,
        intelligence_updated_at TEXT
      );
      CREATE TABLE research_map_evidence_proposals (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, track_id TEXT NOT NULL, paper_id TEXT NOT NULL,
        status TEXT NOT NULL, decided_at TEXT, updated_at TEXT NOT NULL
      );
      CREATE TABLE paper_insights (
        paper_id TEXT NOT NULL, space_id TEXT NOT NULL, ever_recommended INTEGER NOT NULL,
        verification_status TEXT NOT NULL, verification_coverage_score INTEGER NOT NULL
      );
      CREATE TABLE research_route_revisions (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, track_id TEXT NOT NULL,
        model TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE monitor_reliability_events (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, kind TEXT NOT NULL, stage TEXT NOT NULL,
        outcome TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO research_spaces VALUES ('space-a', 'anonymous:workspace-a');
      INSERT INTO monitor_runs VALUES ('space-a', NULL, datetime('now'));
      INSERT INTO research_tracks VALUES
        ('track-a', 'space-a', 'ready', 'active', 'ready', datetime('now'));
      INSERT INTO research_map_evidence_proposals VALUES
        ('proposal-a', 'space-a', 'track-a', 'paper-a', 'confirmed', datetime('now', '-1 hour'), datetime('now', '-1 hour'));
      INSERT INTO paper_insights VALUES ('paper-a', 'space-a', 1, 'verified', 84);
      INSERT INTO research_route_revisions VALUES
        ('baseline-a', 'space-a', 'track-a', 'system-baseline', datetime('now'));
    `);
    assert.equal(sqlite.prepare(SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL).get(1).track_id, "track-a");

    sqlite.prepare(
      `INSERT INTO monitor_reliability_events VALUES
       ('failure-a', 'space-a', 'research_route_evolution', 'scheduled', 'degraded', '{"trackId":"track-a"}', datetime('now'))`,
    ).run();
    assert.equal(sqlite.prepare(SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL).get(1), undefined);

    sqlite.prepare("UPDATE monitor_reliability_events SET created_at = datetime('now', '-31 minutes') WHERE id = 'failure-a'").run();
    assert.equal(sqlite.prepare(SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL).get(1).track_id, "track-a");

    sqlite.prepare(
      `INSERT INTO research_route_revisions VALUES
       ('proposal-version-a', 'space-a', 'track-a', 'deepseek-v4-pro', datetime('now'))`,
    ).run();
    assert.equal(sqlite.prepare(SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL).get(1), undefined);
  } finally {
    sqlite.close();
  }
});

test("the additive route revision migration preserves historical research state", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY);
      CREATE TABLE research_tracks (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE);
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE);
      CREATE TABLE paper_feedback (id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT, feedback TEXT);
      INSERT INTO research_spaces VALUES ('space-a');
      INSERT INTO research_tracks VALUES ('track-a', 'space-a');
      INSERT INTO monitored_papers VALUES ('paper-a', 'space-a');
      INSERT INTO paper_feedback VALUES ('feedback-a', 'space-a', 'paper-a', 'relevant');
    `);
    const migration = (await readFile(migrationUrl, "utf8")).replaceAll("--> statement-breakpoint", "");
    sqlite.exec(migration);
    sqlite.prepare(
      `INSERT INTO research_route_revisions
       (id, space_id, track_id, version, status, input_revision, title_zh, title_en, previous_title_zh, previous_title_en)
       VALUES ('revision-a', 'space-a', 'track-a', 1, 'proposed', 'input-a', '新路线', 'New route', '旧路线', 'Old route')`,
    ).run();
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitored_papers").get().count, 1);
    assert.equal(sqlite.prepare("SELECT feedback FROM paper_feedback WHERE id = 'feedback-a'").get().feedback, "relevant");
    assert.equal(sqlite.prepare("SELECT status FROM research_route_revisions WHERE id = 'revision-a'").get().status, "proposed");
    assert.throws(() => sqlite.prepare("UPDATE research_route_revisions SET status = 'ready' WHERE id = 'revision-a'").run());
  } finally {
    sqlite.close();
  }
});

test("runtime bootstrap and the route revision migration are safe in either order", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec("CREATE TABLE research_spaces (id TEXT PRIMARY KEY); CREATE TABLE research_tracks (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE)");
    for (const statement of researchRouteRevisionBootstrapSql) sqlite.prepare(statement).run();
    sqlite.exec((await readFile(migrationUrl, "utf8")).replaceAll("--> statement-breakpoint", ""));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('research_route_revisions')").get().count, 27);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'index' AND name LIKE 'idx_research_route_revisions_%'").get().count, 4);
  } finally {
    sqlite.close();
  }
});

test("the route workbench keeps proposals provisional and labels inference separately", async () => {
  const [api, ui, css] = await Promise.all([readFile(apiUrl, "utf8"), readFile(uiUrl, "utf8"), readFile(cssUrl, "utf8")]);
  assert.match(api, /insight\.ever_recommended = 1/);
  assert.match(api, /insight\.verification_status IN \('verified', 'revised'\)/);
  assert.match(api, /action === "propose-evolution"/);
  assert.match(api, /researchRouteEvolutionDecisionAllowed/);
  assert.match(api, /UPDATE research_tracks SET title_zh = \?, title_en = \?, summary_zh = \?, summary_en = \?, search_queries = \?/);
  assert.match(api, /status = 'dismissed'.*updated_at = CURRENT_TIMESTAMP/s);
  assert.match(ui, /确认前不会改变正式路线/);
  assert.match(ui, /Pi 跨论文综合（推断）/);
  assert.match(ui, /驳回并保留记录/);
  assert.match(ui, /RouteEvolutionWorkbench track=\{selectedThread\}/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.v2-route-evolution-diff \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(css, /\.v2-route-evolution[^\n]*display:\s*none/);
});
