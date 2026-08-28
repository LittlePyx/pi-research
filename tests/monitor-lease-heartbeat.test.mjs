import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { MONITOR_FOLLOWER_RECLAIM_RETRY_MS } from "../lib/monitor-follower-control.mjs";
import {
  MONITOR_ADVANCE_HEARTBEAT_SQL,
  MONITOR_ADVANCE_LEASE_MS,
  MONITOR_LEASE_HEARTBEAT_MS,
  MONITOR_RESUME_RUN_CLAIM_SQL,
  MONITOR_RUN_HEARTBEAT_SQL,
  MONITOR_RUN_LEASE_MS,
  monitorLeaseCredentialsMatch,
  monitorLeaseExpiry,
} from "../lib/monitor-runtime-control.mjs";

function heartbeatDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE monitor_runs (
      space_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      lock_token TEXT,
      lock_expires_at TEXT,
      active_job_id TEXT,
      lease_generation INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monitor_scan_jobs (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      status TEXT NOT NULL,
      advance_lock_token TEXT,
      advance_lock_expires_at TEXT
    );
    INSERT INTO monitor_runs VALUES (
      'space-a', 'deep_reviewing', 'owner-1', '2026-08-28T00:01:15.000Z',
      'job-a', 1, NULL, CURRENT_TIMESTAMP
    );
    INSERT INTO monitor_scan_jobs VALUES ('job-a', 'space-a', 'deep_reviewing', 'advance-1', '2026-08-28T00:01:15.000Z');
  `);
  return sqlite;
}

test("heartbeat keeps a legitimate long stage alive while crash recovery stays bounded", () => {
  assert.equal(MONITOR_RUN_LEASE_MS, 75_000);
  assert.equal(MONITOR_ADVANCE_LEASE_MS, 75_000);
  assert.ok(MONITOR_LEASE_HEARTBEAT_MS < MONITOR_RUN_LEASE_MS / 2);
  assert.ok(MONITOR_RUN_LEASE_MS + MONITOR_FOLLOWER_RECLAIM_RETRY_MS <= 90_000);

  const startedAt = Date.parse("2026-08-28T00:00:00.000Z");
  const run = {
    active_job_id: "job-a",
    lock_token: "owner-1",
    lease_generation: 1,
    lock_expires_at: monitorLeaseExpiry(startedAt + MONITOR_LEASE_HEARTBEAT_MS),
  };
  assert.equal(monitorLeaseCredentialsMatch(run, {
    jobId: "job-a", leaseToken: "owner-1", leaseGeneration: 1,
  }, startedAt + 80_000), true);
});

test("lease credentials reject expired, stale-generation, wrong-owner, and wrong-job callers", () => {
  const now = Date.parse("2026-08-28T00:00:00.000Z");
  const run = {
    active_job_id: "job-a",
    lock_token: "owner-2",
    lease_generation: 2,
    lock_expires_at: monitorLeaseExpiry(now),
  };
  assert.equal(monitorLeaseCredentialsMatch(run, {
    jobId: "job-a", leaseToken: "owner-2", leaseGeneration: 2,
  }, now + 1), true);
  assert.equal(monitorLeaseCredentialsMatch(run, {
    jobId: "job-a", leaseToken: "owner-1", leaseGeneration: 2,
  }, now + 1), false);
  assert.equal(monitorLeaseCredentialsMatch(run, {
    jobId: "job-a", leaseToken: "owner-2", leaseGeneration: 1,
  }, now + 1), false);
  assert.equal(monitorLeaseCredentialsMatch(run, {
    jobId: "job-b", leaseToken: "owner-2", leaseGeneration: 2,
  }, now + 1), false);
  assert.equal(monitorLeaseCredentialsMatch(run, {
    jobId: "job-a", leaseToken: "owner-2", leaseGeneration: 2,
  }, now + MONITOR_RUN_LEASE_MS + 1), false);
});

test("run and advance heartbeats renew only the currently fenced owner", () => {
  const sqlite = heartbeatDatabase();
  const renewedUntil = "2026-08-28T00:02:00.000Z";
  assert.equal(sqlite.prepare(MONITOR_RUN_HEARTBEAT_SQL).run(
    renewedUntil, "space-a", "job-a", "owner-1", 1,
  ).changes, 1);
  assert.equal(sqlite.prepare(MONITOR_RUN_HEARTBEAT_SQL).run(
    "2099-01-01T00:00:00.000Z", "space-a", "job-a", "owner-1", 2,
  ).changes, 0);
  assert.equal(sqlite.prepare(MONITOR_ADVANCE_HEARTBEAT_SQL).run(
    renewedUntil, "job-a", "space-a", "advance-1",
  ).changes, 1);
  assert.equal(sqlite.prepare(MONITOR_ADVANCE_HEARTBEAT_SQL).run(
    "2099-01-01T00:00:00.000Z", "job-a", "space-a", "advance-stale",
  ).changes, 0);
});

test("takeover increments the generation and permanently fences the crashed owner", () => {
  const sqlite = heartbeatDatabase();
  sqlite.prepare("UPDATE monitor_runs SET lock_expires_at = '2020-01-01T00:00:00.000Z'").run();
  const takeover = sqlite.prepare(MONITOR_RESUME_RUN_CLAIM_SQL).run(
    "owner-2", "2099-01-01T00:00:00.000Z", "job-a", "job-a", "space-a",
  );
  assert.equal(takeover.changes, 1);
  assert.deepEqual({ ...sqlite.prepare(
    "SELECT lock_token, active_job_id, lease_generation FROM monitor_runs WHERE space_id = 'space-a'",
  ).get() }, { lock_token: "owner-2", active_job_id: "job-a", lease_generation: 2 });
  assert.equal(sqlite.prepare(MONITOR_RUN_HEARTBEAT_SQL).run(
    "2099-01-02T00:00:00.000Z", "space-a", "job-a", "owner-1", 1,
  ).changes, 0);
  assert.equal(sqlite.prepare(MONITOR_RUN_HEARTBEAT_SQL).run(
    "2099-01-02T00:00:00.000Z", "space-a", "job-a", "owner-2", 2,
  ).changes, 1);
});

test("route, browser, and scheduler carry and enforce the private lease generation", async () => {
  const [route, client, worker] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /startMonitorLeaseHeartbeat\(database/);
  assert.match(route, /monitorLeaseCredentialsMatch\(validatedRun, requestedLease\)/);
  assert.match(route, /staleLease: true, leaseOwner: false/);
  assert.match(route, /lease_generation = \?/);
  assert.match(route, /leaseToken: lockToken/);
  assert.doesNotMatch(route, /const RUN_LOCK_LEASE_MS\s*=\s*10 \* 60 \* 1000/);
  assert.match(client, /leaseToken: current\.leaseToken/);
  assert.match(client, /leaseGeneration: current\.leaseGeneration/);
  assert.match(worker, /leaseToken: state\.monitor\.leaseToken/);
  assert.match(worker, /leaseGeneration: state\.monitor\.leaseGeneration/);
  assert.match(worker, /state\.monitor\.leaseOwner === false \|\| state\.monitor\.alreadyAdvancing/);
});
