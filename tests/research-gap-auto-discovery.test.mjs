import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  claimResearchGapDiscovery,
  completeResearchGapDiscovery,
  continueResearchGapDiscoveryAfterQualityShortfall,
  enqueueResearchGapDiscovery,
  learningGapQualityRefinementQuery,
  materializeStoredDirectionGapDiscovery,
  readLearningGapDiscovery,
  safeAutomaticResearchGapQuery,
  supersedeResearchGapDiscovery,
} from "../lib/research-gap-discovery.ts";
import { researchProblemInputRevision } from "../lib/research-problem.ts";
import { advanceLearningDiscovery } from "../lib/learning-discovery.ts";
import { learningDiscoveryDelay } from "../lib/learning-path.ts";

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
    CREATE TABLE monitor_candidate_sources (
      id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT, source_key TEXT, channel TEXT,
      query_key TEXT, appearances INTEGER, first_seen_at TEXT, last_seen_at TEXT
    );
    CREATE TABLE monitored_papers (
      id TEXT PRIMARY KEY, space_id TEXT, canonical_id TEXT, doi TEXT, title TEXT,
      authors TEXT DEFAULT '', published_at TEXT
    );
    CREATE TABLE paper_insights (
      paper_id TEXT, space_id TEXT, ever_recommended INTEGER, analysis_source TEXT,
      screening_reason TEXT DEFAULT '', updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
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
  sqlite.exec(`
    DROP INDEX idx_research_gap_discovery_signal;
    ALTER TABLE research_gap_discovery_jobs ADD purpose TEXT NOT NULL DEFAULT 'route';
    CREATE UNIQUE INDEX idx_research_gap_discovery_signal
      ON research_gap_discovery_jobs(space_id, track_id, purpose, signal_revision);
  `);
  sqlite.exec((await readFile(new URL("../drizzle/0055_round_amphibian.sql", import.meta.url), "utf8"))
    .replaceAll("--> statement-breakpoint", ""));
  return { sqlite, database: d1Database(sqlite) };
}

test("automatic gap queries fail closed on unsafe syntax", () => {
  assert.equal(safeAutomaticResearchGapQuery("KLS conjecture stochastic localization"), "KLS conjecture stochastic localization");
  assert.equal(safeAutomaticResearchGapQuery("KLS AND Cheeger"), "");
  assert.equal(safeAutomaticResearchGapQuery("猜想"), "");
});

test("current learning work bypasses unrelated backlog but shares scheduler leases and quality boundaries", async () => {
  const { sqlite, database } = await fixture();
  try {
    sqlite.exec(`CREATE TABLE learning_paths (id TEXT PRIMARY KEY, space_id TEXT, status TEXT);
      CREATE TABLE learning_path_steps (path_id TEXT, space_id TEXT, discovery_job_id TEXT, status TEXT);`);
    const older = await enqueueResearchGapDiscovery(database, { spaceId: "space-a", trackId: "track-a", origin: "direction", sourceRevision: "older", queryText: "KLS stochastic localization" });
    const current = await enqueueResearchGapDiscovery(database, { spaceId: "space-a", trackId: "track-a", purpose: "learning", origin: "direction", sourceRevision: "current", queryText: "KLS foundational original paper" });
    sqlite.prepare("INSERT INTO learning_paths VALUES ('path-a', 'space-a', 'waiting_evidence')").run();
    sqlite.prepare("INSERT INTO learning_path_steps VALUES ('path-a', 'space-a', ?, 'pending')").run(current.id);
    const path = { id: "path-a", status: "waiting_evidence", steps: [{ status: "pending", resources: [], discovery: { id: current.id, status: "pending" } }] };
    const input = { database, spaceId: "space-a", path, unboundedRetries: true };
    let dispatches = 0, release;
    const gate = new Promise((resolve) => { release = resolve; });
    const dispatch = async (body) => {
      dispatches++;
      assert.equal(body.gapJobId, current.id);
      assert.equal(body.action, "expand-auto-gap");
      await gate;
      return Response.json({ reviewQueuedCount: 2, discoveredRouteCandidateCount: 3, routeSourceStatuses: [{ status: "ok" }, { status: "failed" }] });
    };
    const first = advanceLearningDiscovery({ ...input, dispatch });
    // Both callers can observe pending, but only one wins the durable claim.
    const second = await advanceLearningDiscovery({ ...input, dispatch });
    assert.equal(second.attempted, false);
    assert.equal(dispatches, 1);
    release();
    assert.equal((await first).status, "retryable");
    assert.equal(sqlite.prepare("SELECT attempt_count FROM research_gap_discovery_jobs WHERE id = ?").get(older.id).attempt_count, 0);
    let job = sqlite.prepare("SELECT * FROM research_gap_discovery_jobs WHERE id = ?").get(current.id);
    assert.equal(job.attempt_count, 1);
    assert.equal(job.queued_count, 2, "partial source failure retains queued candidates");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM paper_insights").get().n, 0, "dispatch cannot approve papers");
    path.steps[0].discovery.status = "retryable";
    assert.equal((await advanceLearningDiscovery({ ...input, dispatch })).attempted, false, "backoff is respected");
    sqlite.prepare("UPDATE research_gap_discovery_jobs SET next_retry_at = NULL WHERE id = ?").run(current.id);
    sqlite.exec("UPDATE learning_paths SET status = 'superseded'");
    assert.equal((await advanceLearningDiscovery({ ...input, dispatch })).attempted, false, "old path cannot start work");
    sqlite.exec("UPDATE learning_paths SET status = 'waiting_evidence'");
    assert.equal((await advanceLearningDiscovery({ ...input, spaceId: "foreign-space", dispatch })).attempted, false);
    sqlite.exec("UPDATE research_tracks SET monitoring_status = 'paused'");
    assert.equal((await advanceLearningDiscovery({ ...input, dispatch })).attempted, false);
    sqlite.exec("UPDATE research_tracks SET monitoring_status = 'active'");
    await advanceLearningDiscovery({ ...input, dispatch: async () => { throw new Error("transport unavailable"); } });
    job = sqlite.prepare("SELECT * FROM research_gap_discovery_jobs WHERE id = ?").get(current.id);
    assert.equal(job.status, "retryable");
    assert.equal(job.queued_count, 2, "failed retries never erase prior progress");
    assert.equal(job.error, "learning_discovery_unavailable");
    sqlite.prepare("UPDATE research_gap_discovery_jobs SET status = 'running', lock_expires_at = datetime('now','-1 minute') WHERE id = ?").run(current.id);
    path.steps[0].discovery.status = "running";
    assert.equal((await advanceLearningDiscovery({ ...input, dispatch: async () => Response.json({ discoveredRouteCandidateCount: 1, reviewQueuedCount: 1 }) })).status, "ready");
    assert.equal(sqlite.prepare("SELECT queued_count FROM research_gap_discovery_jobs WHERE id = ?").get(current.id).queued_count, 3);
    path.steps[0].resources = [{ id: "approved-paper" }];
    assert.equal((await advanceLearningDiscovery({ ...input, dispatch })).attempted, false, "filled stages need no retrieval");
  } finally { sqlite.close(); }
});

test("learning continuation polling stops for completed work and respects retry dates", () => {
  const now = Date.parse("2026-09-04T07:00:00Z");
  const job = { status: "pending", updatedAt: "2026-09-04T07:00:00Z", nextRetryAt: null };
  const path = { status: "waiting_evidence", steps: [{ status: "pending", resources: [], discovery: job }] };
  assert.equal(learningDiscoveryDelay(path, now), 30000);
  job.status = "retryable"; job.nextRetryAt = "2026-09-04T09:00:00Z";
  assert.equal(learningDiscoveryDelay(path, now), 7200000);
  job.status = "running";
  assert.equal(learningDiscoveryDelay(path, now), 125000);
  job.updatedAt = "2026-09-04 07:00:00";
  assert.equal(learningDiscoveryDelay(path, now), 125000, "D1 timestamps are UTC, not browser local time");
  job.status = "ready";
  assert.equal(learningDiscoveryDelay(path, now), 30000);
  job.status = "degraded";
  assert.equal(learningDiscoveryDelay(path, now), null);
  job.status = "pending"; path.steps[0].status = "completed";
  assert.equal(learningDiscoveryDelay(path, now), null);
  path.steps[0].status = "pending"; path.status = "superseded";
  assert.equal(learningDiscoveryDelay(path, now), null);
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

test("learning evidence work does not supersede route-gap work", async () => {
  const { sqlite, database } = await fixture();
  try {
    const routeJob = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", origin: "direction", sourceRevision: "route-v1",
      queryText: "KLS conjecture stochastic localization",
    });
    const learningJob = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", purpose: "learning", origin: "direction", sourceRevision: "learning-v1",
      queryText: "KLS conjecture foundational theory seminal work",
    });
    assert.equal(routeJob.queued, true);
    assert.equal(learningJob.queued, true);
    assert.deepEqual(sqlite.prepare("SELECT purpose, status FROM research_gap_discovery_jobs ORDER BY rowid").all().map((row) => ({ ...row })), [
      { purpose: "route", status: "pending" },
      { purpose: "learning", status: "pending" },
    ]);
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
      discoveredCount: 4,
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

test("due work and stalled recovery use independent fair slots without deleting history", async () => {
  const { sqlite, database } = await fixture();
  try {
    sqlite.exec(`
      INSERT INTO research_tracks VALUES ('track-b', 'space-a', 'ready', 'active', '{}', NULL, 'pending');
      INSERT INTO research_tracks VALUES ('track-c', 'space-a', 'ready', 'active', '{}', NULL, 'pending');
    `);
    const oldest = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", purpose: "learning", origin: "direction", sourceRevision: "learning-oldest-v1",
      queryText: "KLS conjecture original formulation foundational paper",
    });
    sqlite.prepare("UPDATE research_gap_discovery_jobs SET created_at = datetime('now', '-3 hours') WHERE id = ?").run(oldest.id);
    const newer = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-b", origin: "problem", sourceRevision: "problem-newer-v1",
      queryText: "KLS conjecture stochastic localization milestone result",
    });
    sqlite.prepare("UPDATE research_gap_discovery_jobs SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(newer.id);
    const stalled = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-c", purpose: "learning", origin: "direction", sourceRevision: "learning-stalled-v1",
      queryText: "KLS conjecture classical Cheeger inequality work",
    });
    sqlite.prepare(`UPDATE research_gap_discovery_jobs SET status = 'running', attempt_count = 3,
      lock_token = 'expired-token', lock_expires_at = datetime('now', '-30 minutes'), created_at = datetime('now', '-4 hours') WHERE id = ?`).run(stalled.id);

    const dueClaim = await claimResearchGapDiscovery(database, new Date(), false, "due");
    assert.equal(dueClaim.id, oldest.id);
    assert.equal(dueClaim.purpose, "learning");
    const recoveryClaim = await claimResearchGapDiscovery(database, new Date(), false, "stalled");
    assert.equal(recoveryClaim.id, stalled.id);
    assert.equal(recoveryClaim.attemptCount, 4);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_gap_discovery_jobs").get().count, 3);
    assert.equal(sqlite.prepare("SELECT status FROM research_gap_discovery_jobs WHERE id = ?").get(newer.id).status, "pending");
  } finally {
    sqlite.close();
  }
});

test("learning evidence can repair a retryable zero-node route without opening route-gap work", async () => {
  const { sqlite, database } = await fixture();
  try {
    const routeJob = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", origin: "direction", sourceRevision: "route-retryable-v1",
      queryText: "KLS conjecture stochastic localization",
    });
    const learningJob = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", purpose: "learning", origin: "direction", sourceRevision: "learning-retryable-v1",
      queryText: "KLS conjecture original formulation foundational paper",
    });
    sqlite.prepare("UPDATE research_tracks SET build_status = 'retryable' WHERE id = 'track-a'").run();

    const claim = await claimResearchGapDiscovery(database, new Date(), false, "due");
    assert.equal(claim.id, learningJob.id);
    assert.equal(claim.purpose, "learning");
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT status, attempt_count FROM research_gap_discovery_jobs WHERE id = ?",
    ).get(routeJob.id) }, { status: "pending", attempt_count: 0 });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_gap_discovery_jobs").get().count, 2);
  } finally {
    sqlite.close();
  }
});

test("learning discovery counts its shared-queue candidates without a fragile coverage aggregate", async () => {
  const { sqlite, database } = await fixture();
  try {
    const job = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", purpose: "learning", origin: "direction", sourceRevision: "learning-counts-v1",
      queryText: "KLS conjecture original formulation foundational paper",
    });
    sqlite.prepare("UPDATE research_gap_discovery_jobs SET status = 'ready', attempt_count = 1, queued_count = 3 WHERE id = ?").run(job.id);
    sqlite.prepare("INSERT INTO monitor_candidate_sources VALUES (?, 'space-a', ?, 'research-route:learning', 'topic', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
      .run("source-pending", "paper-pending", `track-a:crossref:auto:${job.signalRevision}`);
    sqlite.prepare("INSERT INTO monitor_candidate_sources VALUES (?, 'space-a', ?, 'research-route:learning', 'topic', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
      .run("source-recommended", "paper-recommended", `track-a:crossref:auto:${job.signalRevision}`);
    sqlite.prepare("INSERT INTO monitor_candidate_sources VALUES (?, 'space-a', ?, 'research-route:learning', 'topic', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
      .run("source-rejected", "paper-rejected", `track-a:crossref:auto:${job.signalRevision}`);
    sqlite.prepare("INSERT INTO monitor_candidate_sources VALUES (?, 'space-a', ?, 'research-route:learning', 'topic', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
      .run("source-unrelated", "paper-unrelated", "track-a:crossref:auto:another-signal");
    sqlite.exec(`
      INSERT INTO paper_insights (paper_id, space_id, ever_recommended, analysis_source) VALUES ('paper-recommended', 'space-a', 1, 'deepseek');
      INSERT INTO paper_insights (paper_id, space_id, ever_recommended, analysis_source) VALUES ('paper-rejected', 'space-a', 0, 'deepseek_rejected');
    `);

    const discovery = await readLearningGapDiscovery(database, job.id);
    assert.deepEqual(discovery && {
      status: discovery.status,
      queuedCount: discovery.queuedCount,
      reviewPendingCount: discovery.reviewPendingCount,
      reviewedCount: discovery.reviewedCount,
    }, { status: "ready", queuedCount: 3, reviewPendingCount: 1, reviewedCount: 2 });
  } finally {
    sqlite.close();
  }
});

test("healthy zero-candidate attempts rotate before ending honestly as empty", async () => {
  const { sqlite, database } = await fixture();
  try {
    await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", purpose: "learning", origin: "direction", sourceRevision: "learning-empty-v1",
      queryText: "KLS conjecture original formulation foundational paper",
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const claim = await claimResearchGapDiscovery(database);
      assert.ok(claim);
      const completion = await completeResearchGapDiscovery(database, {
        id: claim.id, lockToken: claim.lockToken, degraded: false, discoveredCount: 0, queuedCount: 0,
        sourceStatuses: [{ source: "crossref", status: "empty" }],
      });
      assert.equal(completion.status, attempt < 3 ? "retryable" : "empty");
      if (attempt < 3) sqlite.prepare("UPDATE research_gap_discovery_jobs SET next_retry_at = datetime('now', '-1 minute') WHERE id = ?").run(claim.id);
    }
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT status, attempt_count, queued_count, error, completed_at IS NOT NULL AS completed FROM research_gap_discovery_jobs",
    ).get() }, { status: "empty", attempt_count: 3, queued_count: 0, error: "no_candidates", completed: 1 });
  } finally {
    sqlite.close();
  }
});

test("development keeps a healthy empty search retryable while a discovered duplicate can finish ready", async () => {
  const { sqlite, database } = await fixture();
  try {
    const emptyJob = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", purpose: "learning", origin: "direction", sourceRevision: "learning-dev-v1",
      queryText: "KLS conjecture classical baseline original work",
    });
    sqlite.prepare("UPDATE research_gap_discovery_jobs SET attempt_count = 8 WHERE id = ?").run(emptyJob.id);
    const emptyClaim = await claimResearchGapDiscovery(database, new Date(), true);
    const empty = await completeResearchGapDiscovery(database, {
      id: emptyClaim.id, lockToken: emptyClaim.lockToken, degraded: false, discoveredCount: 0, queuedCount: 0,
      sourceStatuses: [{ source: "openalex", status: "empty" }], unboundedRetries: true,
    });
    assert.equal(empty.status, "retryable");
    sqlite.prepare("UPDATE research_gap_discovery_jobs SET status = 'superseded', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(emptyJob.id);

    const duplicateJob = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", purpose: "learning", origin: "direction", sourceRevision: "learning-duplicate-v2",
      queryText: "KLS conjecture Cheeger inequality seminal result",
    });
    const duplicateClaim = await claimResearchGapDiscovery(database, new Date(), true);
    assert.equal(duplicateClaim.id, duplicateJob.id);
    const ready = await completeResearchGapDiscovery(database, {
      id: duplicateClaim.id, lockToken: duplicateClaim.lockToken, degraded: false, discoveredCount: 3, queuedCount: 0,
      sourceStatuses: [{ source: "shared-monitor-baseline", status: "cached" }], unboundedRetries: true,
    });
    assert.equal(ready.status, "ready");
  } finally {
    sqlite.close();
  }
});

test("a learning search reopens after every candidate fails quality without erasing its audit", async () => {
  const { sqlite, database } = await fixture();
  try {
    const job = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", purpose: "learning", origin: "direction", sourceRevision: "learning-quality-v1",
      queryText: "KLS conjecture stochastic localization milestone paper",
    });
    sqlite.prepare("UPDATE research_gap_discovery_jobs SET status = 'ready', attempt_count = 1, queued_count = 4, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);
    const continuation = await continueResearchGapDiscoveryAfterQualityShortfall(database, { id: job.id });
    assert.equal(continuation.status, "retryable");
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT status, queued_count, error, completed_at FROM research_gap_discovery_jobs WHERE id = ?",
    ).get(job.id) }, { status: "retryable", queued_count: 4, error: "quality_gate_no_match", completed_at: null });
  } finally {
    sqlite.close();
  }
});

test("quality feedback creates a narrower learning search and preserves the rejected job audit", async () => {
  const { sqlite, database } = await fixture();
  try {
    const job = await enqueueResearchGapDiscovery(database, {
      spaceId: "space-a", trackId: "track-a", purpose: "learning", origin: "direction", sourceRevision: "learning-quality-v2",
      queryText: "KLS conjecture stochastic localization milestone paper",
    });
    sqlite.prepare("UPDATE research_gap_discovery_jobs SET status = 'ready', attempt_count = 1, queued_count = 2, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);
    sqlite.exec(`
      INSERT INTO monitored_papers VALUES ('paper-off-topic', 'space-a', 'doi:10.1000/off-topic', '10.1000/off-topic', 'A transport inequality with a different scope', 'Ada Researcher', '2025-01-01');
      INSERT INTO paper_insights (paper_id, space_id, ever_recommended, analysis_source, screening_reason)
        VALUES ('paper-off-topic', 'space-a', 0, 'deepseek_rejected', 'Off-topic scope mismatch for the exact conjecture');
    `);
    sqlite.prepare("INSERT INTO monitor_candidate_sources VALUES (?, 'space-a', ?, 'research-route:learning', 'topic', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
      .run("source-off-topic", "paper-off-topic", `track-a:crossref:auto:${job.signalRevision}`);

    const continuation = await continueResearchGapDiscoveryAfterQualityShortfall(database, {
      id: job.id,
      sourceRevision: "path-a:2:source-a:foundation",
      stageKind: "foundation",
    });
    assert.equal(continuation.refined, true);
    assert.equal(continuation.status, "pending");
    assert.notEqual(continuation.id, job.id);
    assert.match(continuation.queryText, /seminal primary source exact theorem$/);
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT status, queued_count, error, completed_at IS NOT NULL AS completed FROM research_gap_discovery_jobs WHERE id = ?",
    ).get(job.id) }, { status: "superseded", queued_count: 2, error: "quality_gate_no_match", completed: 1 });
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT status, query_text FROM research_gap_discovery_jobs WHERE id = ?",
    ).get(continuation.id) }, { status: "pending", query_text: continuation.queryText });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_gap_discovery_jobs").get().count, 2);
  } finally {
    sqlite.close();
  }
});

test("temporary model failures do not rewrite a learning query as quality feedback", () => {
  assert.equal(learningGapQualityRefinementQuery({
    queryText: "KLS conjecture foundational paper",
    stageKind: "foundation",
    feedback: [{ title: "A candidate", analysisSource: "deepseek_rejected", screeningReason: "Model temporarily unavailable after timeout" }],
  }), "");
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
  assert.match(worker, /discoveredCount: state\.discoveredRouteCandidateCount/);
  assert.match(map, /action === "expand-auto-gap"/);
  assert.match(map, /Automatic evidence-gap discovery is scheduler-only/);
  assert.match(map, /automaticGapSuperseded: true/);
  assert.match(map, /enqueueMonitorCandidates/);
  assert.match(map, /automaticGapExpanded/);
  assert.match(map, /automaticAttemptIndex \* 16/);
  assert.match(map, /priorRejectedLearningWorks/);
  assert.match(map, /likelySameResearchWork/);
  assert.match(synthesis, /enqueueResearchGapDiscovery/);
  assert.match(problem, /origin: "problem"/);
  assert.match(repository, /researchGapDiscoveryBootstrapSql/);
  assert.match(client, /检索结果先进入质量评估/);
  assert.match(client, /ResearchGapDiscoveryStatus/);
  assert.match(client, /篇候选已进入质量评估/);
});
