import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { readMonitorReliabilityHealth } from "../lib/monitor-reliability-health.ts";

const NOW = new Date("2026-08-27T10:00:00.000Z");

function d1Database(sqlite) {
  return {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...values) { bindings = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...bindings) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...bindings) }; },
      };
      return statement;
    },
  };
}

function reliabilityDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE monitor_scheduler_ticks (
      id TEXT PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT,
      failed_count INTEGER NOT NULL DEFAULT 0, gap_minutes INTEGER NOT NULL DEFAULT 0,
      health_status TEXT NOT NULL DEFAULT 'healthy'
    );
    CREATE TABLE monitor_reliability_events (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, kind TEXT NOT NULL,
      outcome TEXT NOT NULL, error_code TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX idx_monitor_reliability_kind_outcome_created
      ON monitor_reliability_events(kind, outcome, created_at);
    INSERT INTO monitor_scheduler_ticks VALUES
      ('tick-1', '2026-08-27T09:56:00.000Z', '2026-08-27T09:57:00.000Z', 0, 0, 'healthy');
    INSERT INTO monitor_reliability_events VALUES
      ('duplicate-1', 'space-a', 'monitor_operational_alert', 'failed', 'duplicate_active_jobs', '2026-08-27T08:40:00.000Z'),
      ('duplicate-2', 'space-a', 'monitor_operational_alert', 'failed', 'duplicate_active_jobs', '2026-08-27T09:50:00.000Z'),
      ('mismatch-1', 'space-b', 'monitor_operational_alert', 'failed', 'active_job_mismatch', '2026-08-27T09:55:00.000Z'),
      ('source-1', 'space-a', 'monitor_operational_alert', 'degraded', 'source_health_degraded', '2026-08-27T09:45:00.000Z');
  `);
  return sqlite;
}

test("health aggregation notifies only after a critical incident persists", async () => {
  const sqlite = reliabilityDatabase();
  try {
    const health = await readMonitorReliabilityHealth(d1Database(sqlite), NOW);
    assert.equal(health.healthy, false);
    assert.equal(health.status, "critical");
    assert.equal(health.currentCriticalCount, 2);
    assert.equal(health.persistentCriticalCount, 1);
    assert.equal(health.currentDegradedCount, 1);
    assert.deepEqual(health.blockingReasons, ["persistent_critical_incident"]);
    assert.equal(health.scheduler.fresh, true);
    assert.deepEqual(health.incidents.map((incident) => ({
      code: incident.code,
      affected: incident.affectedSpaceCount,
      persistent: incident.persistentSpaceCount,
    })), [
      { code: "duplicate_active_jobs", affected: 1, persistent: 1 },
      { code: "active_job_mismatch", affected: 1, persistent: 0 },
      { code: "source_health_degraded", affected: 1, persistent: 0 },
    ]);
  } finally {
    sqlite.close();
  }
});

test("a recovery clears the persistent incident while one new critical remains under observation", async () => {
  const sqlite = reliabilityDatabase();
  try {
    sqlite.prepare(
      `INSERT INTO monitor_reliability_events VALUES
       ('duplicate-recovered', 'space-a', 'monitor_operational_recovery', 'success', 'duplicate_active_jobs', ?)`,
    ).run("2026-08-27T09:58:00.000Z");
    const health = await readMonitorReliabilityHealth(d1Database(sqlite), NOW);
    assert.equal(health.healthy, true);
    assert.equal(health.status, "observing");
    assert.equal(health.currentCriticalCount, 1);
    assert.equal(health.persistentCriticalCount, 0);
    assert.equal(health.recoveredCount24h, 1);
    assert.deepEqual(health.blockingReasons, []);
    assert.deepEqual(health.incidents.map((incident) => incident.code), [
      "active_job_mismatch",
      "source_health_degraded",
    ]);
  } finally {
    sqlite.close();
  }
});

test("a stale scheduler heartbeat fails the maintenance gate independently", async () => {
  const sqlite = reliabilityDatabase();
  try {
    sqlite.prepare(
      "UPDATE monitor_scheduler_ticks SET started_at = ?, completed_at = ? WHERE id = 'tick-1'",
    ).run("2026-08-27T08:00:00.000Z", "2026-08-27T08:01:00.000Z");
    sqlite.prepare(
      `INSERT INTO monitor_reliability_events VALUES
       ('duplicate-recovered', 'space-a', 'monitor_operational_recovery', 'success', 'duplicate_active_jobs', ?)`,
    ).run("2026-08-27T09:58:00.000Z");
    const health = await readMonitorReliabilityHealth(d1Database(sqlite), NOW);
    assert.equal(health.healthy, false);
    assert.equal(health.status, "critical");
    assert.equal(health.persistentCriticalCount, 0);
    assert.equal(health.scheduler.fresh, false);
    assert.deepEqual(health.blockingReasons, ["scheduler_heartbeat_stale"]);
  } finally {
    sqlite.close();
  }
});

test("the reliability health migration adds the index used by alert lookups", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE monitor_reliability_events (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, outcome TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
    sqlite.exec(await readFile(new URL("../drizzle/0047_striped_cyclops.sql", import.meta.url), "utf8"));
    const index = sqlite.prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?",
    ).get("idx_monitor_reliability_kind_outcome_created");
    assert.match(index.sql, /\(`kind`,`outcome`,`created_at`\)/);
    const plan = sqlite.prepare(
      "EXPLAIN QUERY PLAN SELECT created_at FROM monitor_reliability_events WHERE kind = ? AND outcome = ?",
    ).all("monitor_operational_alert", "failed");
    assert.match(plan.map((row) => row.detail).join("\n"), /idx_monitor_reliability_kind_outcome_created/);
  } finally {
    sqlite.close();
  }
});
