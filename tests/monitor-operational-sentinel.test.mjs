import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  MONITOR_OPERATIONAL_ALERT_BUCKET_MS,
  MONITOR_OPERATIONAL_SENTINEL_TARGET_SQL,
  MONITOR_QUALITY_QUEUE_STALL_GRACE_MS,
  consecutiveMonitorFailureCount,
  evaluateMonitorOperationalSentinel,
  monitorQualityQueueHealth,
  monitorOperationalEventId,
  recordMonitorOperationalSentinel,
} from "../lib/monitor-operational-sentinel.ts";

const NOW = Date.parse("2026-08-27T08:00:00.000Z");

function snapshot(overrides = {}) {
  return {
    runStatus: "ready",
    runActiveJobId: null,
    lockExpiresAt: null,
    runUpdatedAt: "2026-08-27T07:59:00.000Z",
    schedulerGapMinutes: 0,
    schedulerHealthStatus: "healthy",
    activeJobCount: 0,
    activeJobIds: [],
    boundActiveJobCount: 0,
    oldestActiveUpdatedAt: null,
    retryOverdueCount: 0,
    latestRetryCount: 0,
    consecutiveFailureCount: 0,
    latestFailureKind: "",
    latestFailureSource: "",
    recentSourceFailureCount: 0,
    recentSourceCount: 0,
    recentFailedSources: [],
    pendingQualityQueueCount: 0,
    oldestPendingQualityAt: null,
    qualityNextRunAt: "2026-08-27T08:10:00.000Z",
    automationPauseReason: "",
    ...overrides,
  };
}

function d1Database(sqlite) {
  return {
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
    async batch(statements) {
      const results = [];
      sqlite.exec("BEGIN");
      try {
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

test("operational sentinel remains quiet for a healthy terminal run", () => {
  const result = evaluateMonitorOperationalSentinel(snapshot(), [], NOW);
  assert.equal(result.outcome, "success");
  assert.deepEqual(result.issues, []);
});

test("operational sentinel detects duplicate jobs, a mismatched lease, and a stalled scan", () => {
  const result = evaluateMonitorOperationalSentinel(snapshot({
    runStatus: "reviewing",
    runActiveJobId: "job-primary",
    lockExpiresAt: "2026-08-27T07:50:00.000Z",
    activeJobCount: 2,
    activeJobIds: ["job-primary", "job-duplicate"],
    boundActiveJobCount: 0,
    oldestActiveUpdatedAt: "2026-08-27T07:30:00.000Z",
  }), [], NOW);
  assert.equal(result.outcome, "failed");
  assert.deepEqual(result.issues, [
    "duplicate_active_jobs",
    "active_job_mismatch",
    "stalled_scan_lease",
  ]);
});

test("operational sentinel reports a recovered scheduler heartbeat gap", () => {
  const result = evaluateMonitorOperationalSentinel(snapshot({
    schedulerGapMinutes: 42,
    schedulerHealthStatus: "recovered_gap",
  }), [], NOW);
  assert.equal(result.outcome, "failed");
  assert.deepEqual(result.issues, ["scheduler_heartbeat_gap"]);
});

test("operational sentinel distinguishes source degradation from a legitimate zero yield", () => {
  const healthyZeroYield = evaluateMonitorOperationalSentinel(snapshot({
    recentSourceFailureCount: 0,
  }), [], NOW);
  assert.deepEqual(healthyZeroYield.issues, []);

  const degraded = evaluateMonitorOperationalSentinel(snapshot({
    recentSourceFailureCount: 3,
    recentSourceCount: 2,
    recentFailedSources: ["semantic-scholar", "openalex"],
  }), [], NOW);
  assert.equal(degraded.outcome, "degraded");
  assert.deepEqual(degraded.issues, ["source_health_degraded"]);
});

test("quality queue health exposes age and distinguishes scheduling, intentional pause, and a real stall", () => {
  assert.equal(MONITOR_QUALITY_QUEUE_STALL_GRACE_MS, 25 * 60 * 1000);
  const scheduled = monitorQualityQueueHealth(snapshot({
    pendingQualityQueueCount: 152,
    oldestPendingQualityAt: "2026-08-27T05:00:00.000Z",
    qualityNextRunAt: "2026-08-27T08:10:00.000Z",
  }), NOW);
  assert.deepEqual(scheduled, {
    status: "scheduled",
    pendingCount: 152,
    oldestAgeMinutes: 180,
    overdueMinutes: 0,
    stallReason: "awaiting_scheduler",
  });

  const paused = monitorQualityQueueHealth(snapshot({
    pendingQualityQueueCount: 152,
    oldestPendingQualityAt: "2026-08-27T05:00:00.000Z",
    automationPauseReason: "inactive",
  }), NOW);
  assert.equal(paused.status, "paused");
  assert.equal(paused.stallReason, "inactive");

  const stalledEvaluation = evaluateMonitorOperationalSentinel(snapshot({
    pendingQualityQueueCount: 152,
    oldestPendingQualityAt: "2026-08-27T05:00:00.000Z",
    qualityNextRunAt: "2026-08-27T07:30:00.000Z",
  }), [], NOW);
  assert.equal(stalledEvaluation.qualityQueue.oldestAgeMinutes, 180);
  assert.equal(stalledEvaluation.qualityQueue.overdueMinutes, 30);
  assert.equal(stalledEvaluation.qualityQueue.stallReason, "scheduler_overdue");
  assert.ok(stalledEvaluation.criticalIssues.includes("quality_queue_stalled"));
});

test("an active quality run is not stalled or capped by a large backlog", () => {
  const result = evaluateMonitorOperationalSentinel(snapshot({
    runStatus: "reviewing",
    runActiveJobId: "job-quality",
    activeJobCount: 1,
    activeJobIds: ["job-quality"],
    boundActiveJobCount: 1,
    oldestActiveUpdatedAt: "2026-08-27T07:59:00.000Z",
    pendingQualityQueueCount: 240,
    oldestPendingQualityAt: "2026-08-25T08:00:00.000Z",
    qualityNextRunAt: "2026-08-27T07:00:00.000Z",
  }), [], NOW);
  assert.equal(result.qualityQueue.status, "active");
  assert.equal(result.qualityQueue.pendingCount, 240);
  assert.doesNotMatch(result.issues.join(","), /quality_queue_stalled/);
});

test("operational sentinel escalates non-converging retry, queue gaps, and history regressions", () => {
  const result = evaluateMonitorOperationalSentinel(snapshot({
    runStatus: "error",
    latestRetryCount: 3,
    consecutiveFailureCount: 3,
    latestFailureKind: "rate_limited",
    latestFailureSource: "semantic-scholar",
  }), ["shared_queue_feed_gap", "history_count_regression"], NOW);
  assert.equal(result.outcome, "failed");
  assert.deepEqual(result.criticalIssues, [
    "retry_not_converging",
    "shared_queue_feed_gap",
    "history_count_regression",
  ]);
});

test("a resumed job that has crossed the failed checkpoint is not permanently critical", () => {
  const result = evaluateMonitorOperationalSentinel(snapshot({
    runStatus: "deep_reviewing",
    runActiveJobId: "job-recovered",
    activeJobCount: 1,
    activeJobIds: ["job-recovered"],
    boundActiveJobCount: 1,
    oldestActiveUpdatedAt: "2026-08-27T07:59:00.000Z",
    latestRetryCount: 9,
    consecutiveFailureCount: 4,
    latestFailureKind: "stage_failed",
    latestFailureSource: "saved-checkpoint",
  }), [], NOW);
  assert.equal(result.outcome, "success");
  assert.doesNotMatch(result.issues.join(","), /retry_not_converging/);
});

test("failure convergence counts only the latest identical stage and source signature", () => {
  assert.equal(consecutiveMonitorFailureCount([
    { failure_kind: "timeout", failure_source: "deep-review", retry_count: 3 },
    { failure_kind: "timeout", failure_source: "deep-review", retry_count: 2 },
    { failure_kind: "rate_limited", failure_source: "openalex", retry_count: 1 },
    { failure_kind: "timeout", failure_source: "deep-review", retry_count: 1 },
  ]), 2);
});

test("operational alert ids deduplicate cron, watchdog, and visit wakeups by hour", () => {
  assert.equal(MONITOR_OPERATIONAL_ALERT_BUCKET_MS, 60 * 60 * 1000);
  const first = monitorOperationalEventId("space-1", "alert:stalled_scan_lease", NOW);
  assert.equal(first, monitorOperationalEventId("space-1", "alert:stalled_scan_lease", NOW + 59 * 60 * 1000));
  assert.notEqual(first, monitorOperationalEventId("space-1", "alert:stalled_scan_lease", NOW + 60 * 60 * 1000));
});

test("operational review prioritizes the oldest unresolved critical space", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE monitor_reliability_events (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, kind TEXT NOT NULL,
        outcome TEXT NOT NULL, error_code TEXT NOT NULL, created_at TEXT NOT NULL
      );
      INSERT INTO monitor_reliability_events VALUES
        ('old-alert', 'space-old', 'monitor_operational_alert', 'failed', 'retry_not_converging', datetime('now', '-3 hours')),
        ('new-alert', 'space-new', 'monitor_operational_alert', 'failed', 'quality_queue_stalled', datetime('now', '-1 hour')),
        ('old-recovery', 'space-old', 'monitor_operational_recovery', 'success', 'retry_not_converging', datetime('now', '-2 hours'));
    `);
    assert.equal(sqlite.prepare(MONITOR_OPERATIONAL_SENTINEL_TARGET_SQL).get().space_id, "space-new");
    sqlite.prepare("DELETE FROM monitor_reliability_events WHERE id = 'old-recovery'").run();
    assert.equal(sqlite.prepare(MONITOR_OPERATIONAL_SENTINEL_TARGET_SQL).get().space_id, "space-old");
  } finally {
    sqlite.close();
  }
});

test("D1 sentinel persistence deduplicates active alerts and records later recovery", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE monitor_runs (
        space_id TEXT PRIMARY KEY, status TEXT NOT NULL, active_job_id TEXT,
        lock_expires_at TEXT, next_run_at TEXT, automation_pause_reason TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE monitor_scheduler_ticks (
        id TEXT PRIMARY KEY, started_at TEXT NOT NULL,
        gap_minutes INTEGER NOT NULL DEFAULT 0, health_status TEXT NOT NULL DEFAULT 'healthy'
      );
      CREATE TABLE monitor_scan_jobs (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, status TEXT NOT NULL,
        checkpoint TEXT NOT NULL DEFAULT 'queued', failure_kind TEXT NOT NULL DEFAULT '',
        failure_source TEXT NOT NULL DEFAULT '', retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE monitor_reliability_events (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, scan_job_id TEXT,
        kind TEXT NOT NULL, stage TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
        outcome TEXT NOT NULL DEFAULT 'info', duration_ms INTEGER NOT NULL DEFAULT 0,
        error_code TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE monitored_papers (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, canonical_id TEXT NOT NULL,
        horizon TEXT NOT NULL, discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE paper_insights (
        paper_id TEXT PRIMARY KEY, ever_recommended INTEGER NOT NULL DEFAULT 0,
        analysis_model TEXT NOT NULL DEFAULT '', analysis_source TEXT NOT NULL DEFAULT 'metadata',
        verification_status TEXT NOT NULL DEFAULT 'not_required', screening_reason TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE paper_feedback (
        space_id TEXT NOT NULL, paper_id TEXT NOT NULL, feedback TEXT
      );
      CREATE TABLE monitor_candidate_sources (
        space_id TEXT NOT NULL, paper_id TEXT NOT NULL, source_key TEXT NOT NULL, query_key TEXT NOT NULL
      );
      CREATE TABLE monitor_discovery_coverage (
        space_id TEXT NOT NULL, horizon TEXT NOT NULL, source_key TEXT NOT NULL,
        query_key TEXT NOT NULL, route_id TEXT
      );
      CREATE TABLE research_track_papers (
        space_id TEXT NOT NULL, canonical_id TEXT NOT NULL, track_id TEXT NOT NULL,
        curation_status TEXT NOT NULL DEFAULT 'active'
      );
      INSERT INTO monitor_runs (space_id, status) VALUES ('space-a', 'ready');
      INSERT INTO monitor_scheduler_ticks (id, started_at) VALUES ('tick-a', CURRENT_TIMESTAMP);
      INSERT INTO monitor_reliability_events
        (id, space_id, kind, source, outcome, created_at) VALUES
        ('source-1', 'space-a', 'source_degraded', 'semantic-scholar', 'degraded', CURRENT_TIMESTAMP),
        ('source-2', 'space-a', 'source_degraded', 'openalex', 'degraded', CURRENT_TIMESTAMP);
    `);
    const database = d1Database(sqlite);
    const routeSignal = { outcome: "degraded", issues: ["shared_queue_feed_gap"] };
    const first = await recordMonitorOperationalSentinel(database, "space-a", routeSignal, new Date(NOW));
    const duplicate = await recordMonitorOperationalSentinel(database, "space-a", routeSignal, new Date(NOW + 5 * 60 * 1000));
    assert.equal(first.emittedEventCount, 2);
    assert.equal(duplicate.emittedEventCount, 0);
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS count FROM monitor_reliability_events WHERE kind LIKE 'monitor_operational_%'",
    ).get().count, 3);

    sqlite.prepare(
      "UPDATE monitor_reliability_events SET created_at = datetime('now', '-7 hours') WHERE kind = 'source_degraded'",
    ).run();
    const recovered = await recordMonitorOperationalSentinel(
      database,
      "space-a",
      { outcome: "success", issues: [] },
      new Date(NOW + 60 * 60 * 1000),
    );
    assert.deepEqual(recovered.recoveredIssues, ["source_health_degraded", "shared_queue_feed_gap"]);
    assert.equal(recovered.emittedEventCount, 2);
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS count FROM monitor_reliability_events WHERE kind = 'monitor_operational_recovery'",
    ).get().count, 2);
  } finally {
    sqlite.close();
  }
});

test("worker persists internal alerts and recovery events without adding a user audit surface", async () => {
  const [worker, sentinel, app] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/monitor-operational-sentinel.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(worker, /recordMonitorOperationalSentinel/);
  assert.match(worker, /operationalSentinel/);
  assert.match(sentinel, /INSERT OR IGNORE INTO monitor_reliability_events/);
  assert.match(sentinel, /monitor_operational_alert/);
  assert.match(sentinel, /monitor_operational_recovery/);
  assert.match(sentinel, /ON CONFLICT\(id\) DO UPDATE/);
  assert.doesNotMatch(app, /monitor_operational_alert/);
});
