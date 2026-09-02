import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  claimResearchGapDiscovery,
  completeResearchGapDiscovery,
  enqueueResearchGapDiscovery,
  materializeStoredDirectionGapDiscovery,
  safeAutomaticResearchGapQuery,
  supersedeResearchGapDiscovery,
} from "../lib/research-gap-discovery.ts";
import { researchProblemInputRevision } from "../lib/research-problem.ts";

function d1Database(sqlite) {
  const database = {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...values) { bindings = values; return statement; },
        async run() {
          const result = sqlite.prepare(sql).run(...bindings);
          return { meta: { changes: Number(result.changes) } };
        },
        async first() { return sqlite.prepare(sql).get(...bindings) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...bindings) }; },
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
  return database;
}

async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE research_spaces (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL);
    CREATE TABLE research_tracks (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, build_status TEXT NOT NULL DEFAULT 'ready',
      monitoring_status TEXT NOT NULL DEFAULT 'active', intelligence_json TEXT NOT NULL DEFAULT '{}',
      intelligence_updated_at TEXT, intelligence_status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE monitor_runs (
      space_id TEXT PRIMARY KEY, automation_paused_at TEXT, last_user_activity_at TEXT
    );
    CREATE TABLE monitor_query_plans (space_id TEXT, plan_date TEXT);
    CREATE TABLE research_problems (
      id TEXT PRIMARY KEY, space_id TEXT, track_id TEXT, status TEXT, updated_at TEXT
    );
    CREATE TABLE research_problem_hypotheses (
      id TEXT PRIMARY KEY, problem_id TEXT, statement TEXT, status TEXT, updated_at TEXT, position INTEGER
    );
    CREATE TABLE research_problem_assessments (
      id TEXT PRIMARY KEY, problem_id TEXT, input_revision TEXT, next_search_query TEXT, created_at TEXT
    );
    CREATE TABLE research_syntheses (space_id TEXT, track_id TEXT, input_revision TEXT);
    INSERT INTO research_spaces VALUES ('space-a', 'anonymous:workspace-a');
    INSERT INTO research_tracks VALUES (
      'track-a', 'space-a', 'ready', 'active',
      '{"nextSearchQuery":"KLS conjecture stochastic localization Cheeger inequality","confidence":88}',
      datetime('now'), 'ready'
    );
    INSERT INTO monitor_runs VALUES ('space-a', NULL, datetime('now'));
    INSERT INTO monitor_query_plans VALUES ('space-a', date('now'));
  `);
  sqlite.exec((await readFile(new URL("../drizzle/0053_aberrant_sandman.sql", import.meta.url), "utf8"))
    .replaceAll("--> statement-breakpoint", ""));
  return { sqlite, database: d1Database(sqlite) };
}

test("automatic gap queries fail closed on unsafe syntax", () => {
  assert.equal(safeAutomaticResearchGapQuery("KLS conjecture stochastic localization"), "KLS conjecture stochastic localization");
  assert.equal(safeAutomaticResearchGapQuery("KLS AND Cheeger"), "");
  assert.equal(safeAutomaticResearchGapQuery("猜想"), "");
});

test("a new gap revision supersedes pending work without deleting history", async () => {
  const { sqlite, database } = await fixture();
  try {
    const first = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", origin: "direction", sourceRevision: "direction-v1",
      queryText: "KLS conjecture stochastic localization",
    });
    assert.equal(first.queued, true);
    assert.equal((await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", origin: "direction", sourceRevision: "direction-v1",
      queryText: "KLS conjecture stochastic localization",
    })).reason, "already_recorded");
    const second = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", origin: "synthesis", sourceRevision: "synthesis-v2",
      queryText: "KLS conjecture Cheeger inequality foundational work",
    });
    assert.equal(second.queued, true);
    assert.deepEqual(sqlite.prepare(
      "SELECT origin, status FROM research_gap_discovery_jobs ORDER BY created_at, rowid",
    ).all().map((row) => ({ ...row })), [
      { origin: "direction", status: "superseded" },
      { origin: "synthesis", status: "pending" },
    ]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_query_plans").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("automatic discovery is leased once, retries degradation, and preserves queued counts", async () => {
  const { sqlite, database } = await fixture();
  try {
    await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", origin: "problem", sourceRevision: "problem-v1",
      queryText: "KLS conjecture original formulation Cheeger inequality",
    });
    const claim = await claimResearchGapDiscovery(database);
    assert.ok(claim);
    assert.equal(claim.origin, "problem");
    assert.equal(await claimResearchGapDiscovery(database), null);
    const degraded = await completeResearchGapDiscovery(database, {
      id: claim.id, lockToken: claim.lockToken, degraded: true, queuedCount: 3,
      sourceStatuses: [{ source: "openalex", status: "failed" }, { source: "crossref", status: "ok" }],
      error: "source_unavailable",
    });
    assert.equal(degraded.status, "retryable");
    sqlite.prepare("UPDATE research_gap_discovery_jobs SET next_retry_at = datetime('now', '-1 minute') WHERE id = ?").run(claim.id);
    const retry = await claimResearchGapDiscovery(database);
    assert.ok(retry);
    const ready = await completeResearchGapDiscovery(database, {
      id: retry.id, lockToken: retry.lockToken, degraded: false, queuedCount: 2,
      sourceStatuses: [{ source: "crossref", status: "ok" }],
    });
    assert.equal(ready.status, "ready");
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT status, attempt_count, queued_count, error, next_retry_at, lock_token FROM research_gap_discovery_jobs WHERE id = ?",
    ).get(claim.id) }, {
      status: "ready", attempt_count: 2, queued_count: 5, error: null, next_retry_at: null, lock_token: null,
    });
  } finally {
    sqlite.close();
  }
});

test("paused or inactive routes do not consume automatic discovery", async () => {
  const { sqlite, database } = await fixture();
  try {
    await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", origin: "direction", sourceRevision: "direction-v1",
      queryText: "KLS conjecture stochastic localization",
    });
    sqlite.prepare("UPDATE research_tracks SET monitoring_status = 'paused'").run();
    assert.equal(await claimResearchGapDiscovery(database), null);
    sqlite.prepare("UPDATE research_tracks SET monitoring_status = 'active'").run();
    sqlite.prepare("UPDATE monitor_runs SET last_user_activity_at = datetime('now', '-8 days')").run();
    assert.equal(await claimResearchGapDiscovery(database), null);
    sqlite.prepare("UPDATE monitor_runs SET last_user_activity_at = datetime('now')").run();
    assert.ok(await claimResearchGapDiscovery(database));
  } finally {
    sqlite.close();
  }
});

test("a changed signal supersedes a claimed job without erasing its record", async () => {
  const { sqlite, database } = await fixture();
  try {
    await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", origin: "direction", sourceRevision: "direction-v1",
      queryText: "KLS conjecture stochastic localization",
    });
    const claim = await claimResearchGapDiscovery(database);
    assert.ok(claim);
    assert.equal(await supersedeResearchGapDiscovery(database, {
      id: claim.id, lockToken: claim.lockToken, error: "signal_changed",
    }), 1);
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT status, error, lock_token, completed_at IS NOT NULL AS completed FROM research_gap_discovery_jobs WHERE id = ?",
    ).get(claim.id) }, { status: "superseded", error: "signal_changed", lock_token: null, completed: 1 });
  } finally {
    sqlite.close();
  }
});

test("a fresh saved research problem is materialized before the broader direction gap", async () => {
  const { sqlite, database } = await fixture();
  try {
    const hypotheses = [{ id: "hypothesis-a", statement: "The classical KLS bound is the missing baseline.", status: "confirmed", updatedAt: "2026-09-01 10:00:00" }];
    const assessmentRevision = await researchProblemInputRevision({
      problemUpdatedAt: "2026-09-01 10:00:00", synthesisRevision: "synthesis-current", hypotheses,
    });
    sqlite.exec(`
      INSERT INTO research_problems VALUES ('problem-a', 'space-a', 'track-a', 'active', '2026-09-01 10:00:00');
      INSERT INTO research_problem_hypotheses VALUES ('hypothesis-a', 'problem-a', 'The classical KLS bound is the missing baseline.', 'confirmed', '2026-09-01 10:00:00', 0);
      INSERT INTO research_syntheses VALUES ('space-a', 'track-a', 'synthesis-current');
    `);
    sqlite.prepare("INSERT INTO research_problem_assessments VALUES ('assessment-a', 'problem-a', ?, 'KLS conjecture original paper Cheeger inequality', '2026-09-01 10:01:00')")
      .run(assessmentRevision);
    const result = await materializeStoredDirectionGapDiscovery(database);
    assert.equal(result.queued, true);
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT origin, query_text, status FROM research_gap_discovery_jobs",
    ).get() }, {
      origin: "problem", query_text: "KLS conjecture original paper Cheeger inequality", status: "pending",
    });
  } finally {
    sqlite.close();
  }
});

test("scheduler and API keep automatic gap discovery bounded and inside the shared quality queue", async () => {
  const [worker, map, synthesis, problem, repository, client] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-synthesis/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-problem/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(worker, /runScheduledResearchGapDiscovery/);
  assert.match(worker, /x-pi-scheduled-gap-discovery/);
  assert.match(worker, /sourceStatuses\.some\(\(source\) => source\.status === "failed"\)/);
  assert.match(map, /action === "expand-auto-gap"/);
  assert.match(map, /Automatic evidence-gap discovery is scheduler-only/);
  assert.match(map, /automaticGapSuperseded: true/);
  assert.match(map, /enqueueMonitorCandidates/);
  assert.match(map, /automaticGapExpanded/);
  assert.match(synthesis, /enqueueResearchGapDiscovery/);
  assert.match(problem, /origin: "problem"/);
  assert.match(repository, /researchGapDiscoveryBootstrapSql/);
  assert.match(client, /有上限的后台补证/);
  assert.match(client, /ResearchGapDiscoveryStatus/);
  assert.match(client, /篇候选已进入质量评估/);
});
