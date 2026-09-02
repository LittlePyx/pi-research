import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { learningEvidenceStatus, learningPathProgressState } from "../lib/learning-path.ts";

function discovery(status, overrides = {}) {
  return {
    id: "job-a", status, attemptCount: 1, queuedCount: 0, reviewPendingCount: 0,
    reviewedCount: 0, nextRetryAt: null, updatedAt: "2026-09-02 00:00:00", ...overrides,
  };
}

test("a stage with zero visible evidence is never ready or completable", async () => {
  assert.equal(learningEvidenceStatus({ resourceCount: 0, discovery: null }), "missing");
  assert.equal(learningEvidenceStatus({ resourceCount: 0, discovery: discovery("pending") }), "searching");
  assert.equal(learningEvidenceStatus({ resourceCount: 0, discovery: discovery("retryable") }), "retryable");
  assert.equal(learningEvidenceStatus({ resourceCount: 0, discovery: discovery("degraded") }), "degraded");
  assert.equal(learningEvidenceStatus({ resourceCount: 0, discovery: discovery("empty") }), "insufficient");
  assert.equal(learningEvidenceStatus({ resourceCount: 0, discovery: discovery("ready", { queuedCount: 4, reviewPendingCount: 2 }) }), "awaiting_quality");
  assert.equal(learningEvidenceStatus({ resourceCount: 0, discovery: discovery("ready", { queuedCount: 4, reviewedCount: 4 }) }), "insufficient");
  assert.equal(learningEvidenceStatus({ resourceCount: 1, discovery: discovery("degraded") }), "ready");

  const route = await readFile(new URL("../app/api/learning-path/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(completing && visibleStep\.resources\.length === 0\)/);
  assert.match(route, /不能标记完成/);
});

test("sequential progress waits at the first evidence gap and resumes without skipping it", () => {
  assert.deepEqual(learningPathProgressState([
    { status: "pending", resources: [] },
    { status: "pending", resources: [{ id: "later" }] },
  ]), { pathStatus: "waiting_evidence", activeIndex: -1 });
  assert.deepEqual(learningPathProgressState([
    { status: "pending", resources: [{ id: "foundation" }] },
    { status: "pending", resources: [] },
  ]), { pathStatus: "active", activeIndex: 0 });
  assert.deepEqual(learningPathProgressState([
    { status: "completed", resources: [{ id: "foundation" }] },
    { status: "pending", resources: [] },
  ]), { pathStatus: "waiting_evidence", activeIndex: -1 });
});

test("mastered evidence advances automatically without creating revision churn", async () => {
  const route = await readFile(new URL("../app/api/learning-path/route.ts", import.meta.url), "utf8");
  assert.match(route, /step\.resources\.every\(\(resource\) => resource\.readingStatus === "mastered" \|\| resource\.readingStatus === "cited"\)/);
  assert.match(route, /completed_at = COALESCE\(completed_at, CURRENT_TIMESTAMP\)/);
  const revisionBlock = route.match(/async function sourceRevisionFor[\s\S]*?\n}\n/)?.[0] || "";
  assert.doesNotMatch(revisionBlock, /updated_at/);
  assert.match(revisionBlock, /quality_score/);
  assert.match(revisionBlock, /reading_status/);
});

test("0054 preserves learning history while adding revision and evidence state", async () => {
  const migration = (await readFile(new URL("../drizzle/0054_cold_sleepwalker.sql", import.meta.url), "utf8"))
    .replaceAll("--> statement-breakpoint", "");
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_gap_discovery_jobs (
        id TEXT PRIMARY KEY, space_id TEXT, track_id TEXT, signal_revision TEXT, query_text TEXT
      );
      CREATE UNIQUE INDEX idx_research_gap_discovery_signal
        ON research_gap_discovery_jobs(space_id, track_id, signal_revision);
      CREATE TABLE learning_paths (
        id TEXT PRIMARY KEY, space_id TEXT, target TEXT, target_track_id TEXT, title_zh TEXT, title_en TEXT,
        rationale_zh TEXT DEFAULT '', rationale_en TEXT DEFAULT '', status TEXT DEFAULT 'active',
        analysis_model TEXT DEFAULT '', estimated_minutes INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE learning_path_steps (
        id TEXT PRIMARY KEY, path_id TEXT, space_id TEXT, kind TEXT, title_zh TEXT, title_en TEXT,
        goal_zh TEXT DEFAULT '', goal_en TEXT DEFAULT '', why_zh TEXT DEFAULT '', why_en TEXT DEFAULT '',
        read_focus_zh TEXT DEFAULT '', read_focus_en TEXT DEFAULT '', checkpoint_zh TEXT DEFAULT '', checkpoint_en TEXT DEFAULT '',
        estimated_minutes INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', position INTEGER DEFAULT 0,
        resources_json TEXT DEFAULT '[]', completed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO learning_paths (id, space_id, target, title_zh, title_en) VALUES ('path-old', 'space-a', 'KLS', '旧路径', 'Old path');
      INSERT INTO learning_path_steps (id, path_id, space_id, kind, title_zh, title_en, resources_json)
        VALUES ('step-old', 'path-old', 'space-a', 'foundation', '基础', 'Foundation', '[{"id":"paper-old","title":"Classic"}]');
      INSERT INTO research_gap_discovery_jobs VALUES ('job-old', 'space-a', 'track-a', 'signal-a', 'KLS classic');
    `);
    sqlite.exec(migration);
    assert.deepEqual({ ...sqlite.prepare("SELECT parent_path_id, revision, source_revision FROM learning_paths WHERE id = 'path-old'").get() }, {
      parent_path_id: null, revision: 1, source_revision: "",
    });
    assert.deepEqual({ ...sqlite.prepare("SELECT evidence_query, discovery_job_id, resources_json FROM learning_path_steps WHERE id = 'step-old'").get() }, {
      evidence_query: "", discovery_job_id: null, resources_json: '[{"id":"paper-old","title":"Classic"}]',
    });
    assert.equal(sqlite.prepare("SELECT purpose FROM research_gap_discovery_jobs WHERE id = 'job-old'").get().purpose, "route");
  } finally {
    sqlite.close();
  }
});

test("learning evidence reuses the shared quality queue and keeps one count source across layouts", async () => {
  const [route, monitorPlanning, client, css] = await Promise.all([
    readFile(new URL("../app/api/learning-path/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/monitor-route-planning.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(route, /enqueueMonitorCandidates\(database, spaceId, inputs, \{ recordDiscoveryCoverage: true \}\)/);
  assert.match(route, /sourceKey: "research-route:learning"/);
  assert.match(route, /i\.ever_recommended = 1/);
  assert.match(route, /qualification: "quality_approved"/);
  assert.match(route, /purpose: "learning"/);
  assert.match(route, /continueResearchGapDiscoveryAfterQualityShortfall/);
  assert.match(route, /sourceRevision: `\$\{path\.id\}:\$\{path\.revision\}:\$\{path\.sourceRevision\}:\$\{firstBlocked\.kind\}`/);
  assert.match(route, /continuation\.refined/);
  assert.match(monitorPlanning, /sourceKey === "research-route:learning"/);
  assert.match(client, /path\.steps\.reduce\(\(sum, step\) => sum \+ step\.resources\.length, 0\)/);
  assert.match(client, /activeLearningState\.path\.steps\.reduce\(\(sum, step\) => sum \+ step\.resources\.length, 0\)/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.v2-learning-roadmap > article/);
});
