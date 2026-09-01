import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  MONITOR_NEW_RUN_CLAIM_SQL,
  MONITOR_RESUME_RUN_CLAIM_SQL,
  durableMonitorCheckpoint,
  monitorRetryDecision,
  monitorStartRequestKey,
} from "../lib/monitor-runtime-control.mjs";

function leaseDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE monitor_runs (
      space_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'ready',
      next_run_at TEXT,
      lock_token TEXT,
      lock_expires_at TEXT,
      active_job_id TEXT,
      lease_generation INTEGER NOT NULL DEFAULT 0,
      last_trigger TEXT NOT NULL DEFAULT 'visit',
      error TEXT,
      new_count INTEGER NOT NULL DEFAULT 0,
      scanned_count INTEGER NOT NULL DEFAULT 0,
      scheduled_runs_since_activity INTEGER NOT NULL DEFAULT 0,
      automation_paused_at TEXT,
      automation_pause_reason TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monitor_scan_jobs (id TEXT PRIMARY KEY, space_id TEXT NOT NULL, status TEXT NOT NULL);
    INSERT INTO monitor_runs (space_id) VALUES ('space-a');
  `);
  return sqlite;
}

test("twenty concurrent-style starts elect one durable scan owner", () => {
  const sqlite = leaseDatabase();
  const leaseExpiry = "2099-01-01T00:00:00.000Z";
  const winners = [];
  for (let index = 0; index < 20; index += 1) {
    const result = sqlite.prepare(MONITOR_NEW_RUN_CLAIM_SQL).run(
      "scanning", `token-${index}`, leaseExpiry, `job-${index}`, "visit", 0, 0, 0, "space-a",
    );
    if (result.changes) winners.push(index);
  }
  assert.deepEqual(winners, [0]);
  assert.deepEqual({ ...sqlite.prepare(
    "SELECT active_job_id, lock_token, lease_generation FROM monitor_runs WHERE space_id = 'space-a'",
  ).get() }, { active_job_id: "job-0", lock_token: "token-0", lease_generation: 1 });
});

test("an expired active job can be resumed by exactly one caller and blocks a second job", () => {
  const sqlite = leaseDatabase();
  sqlite.prepare(MONITOR_NEW_RUN_CLAIM_SQL).run(
    "screening", "start-token", "2026-08-27T00:00:00.000Z", "job-active", "visit", 12, 30, 0, "space-a",
  );
  sqlite.prepare("INSERT INTO monitor_scan_jobs VALUES ('job-active', 'space-a', 'screening')").run();

  const resumeWinners = [];
  for (let index = 0; index < 20; index += 1) {
    const result = sqlite.prepare(MONITOR_RESUME_RUN_CLAIM_SQL).run(
      `resume-${index}`, "2099-01-01T00:00:00.000Z", "job-active", "job-active", "space-a",
    );
    if (result.changes) resumeWinners.push(index);
  }
  assert.deepEqual(resumeWinners, [0]);
  assert.equal(sqlite.prepare("SELECT lease_generation FROM monitor_runs WHERE space_id = 'space-a'").get().lease_generation, 2);

  sqlite.prepare("UPDATE monitor_runs SET lock_expires_at = '2026-08-27T00:00:00.000Z'").run();
  const competing = sqlite.prepare(MONITOR_NEW_RUN_CLAIM_SQL).run(
    "scanning", "other-token", "2099-01-01T00:00:00.000Z", "job-other", "visit", 0, 0, 0, "space-a",
  );
  assert.equal(competing.changes, 0);
  assert.equal(sqlite.prepare("SELECT active_job_id FROM monitor_runs WHERE space_id = 'space-a'").get().active_job_id, "job-active");
});

test("start request keys are stable per bucket and distinct for checkpoint resumes", () => {
  const base = { spaceId: "space-a", trigger: "visit", now: 1_000_000 };
  assert.equal(monitorStartRequestKey(base), monitorStartRequestKey({ ...base, now: 1_000_500 }));
  assert.notEqual(monitorStartRequestKey(base), monitorStartRequestKey({ ...base, resumeOfJobId: "job-old" }));
  assert.notEqual(
    monitorStartRequestKey(base),
    monitorStartRequestKey({ ...base, now: 1_000_000 + 10 * 60 * 1000 }),
  );
});

test("source progress cannot replace the durable discovery checkpoint", () => {
  assert.equal(
    durableMonitorCheckpoint("discovering_days", "days:Semantic Scholar · OpenAlex · arXiv · DataCite 并行检索"),
    "discovering_days",
  );
  assert.equal(durableMonitorCheckpoint("discovering_months", "discovering_months"), "discovering_months");
  assert.equal(durableMonitorCheckpoint("screening", "screening"), "screening");
});

test("retry policy classifies transient failures and stops credential retries", () => {
  const now = Date.parse("2026-08-27T00:00:00.000Z");
  assert.deepEqual(monitorRetryDecision(new Error("request timeout"), 0, now), {
    errorCode: "timeout",
    retryable: true,
    retryCount: 1,
    delayMs: 10 * 60 * 1000,
    nextRetryAt: "2026-08-27T00:10:00.000Z",
  });
  assert.equal(monitorRetryDecision(new Error("DeepSeek returned 429"), 2, now).delayMs, 2 * 60 * 60 * 1000);
  assert.deepEqual(monitorRetryDecision(new Error("invalid API key"), 4, now), {
    errorCode: "invalid_credential",
    retryable: false,
    retryCount: 4,
    delayMs: 0,
    nextRetryAt: null,
  });
});

test("route, worker, and browser driver all honor the elected owner", async () => {
  const [route, worker, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /MONITOR_NEW_RUN_CLAIM_SQL/);
  assert.match(route, /monitorLeaseCredentialsMatch\(run, requestedLease\)/);
  assert.match(route, /idempotentReplay: true/);
  assert.match(route, /leaseOwner: true/);
  assert.match(worker, /state\.monitor\.leaseOwner === false \|\| state\.monitor\.alreadyRunning/);
  assert.match(client, /async function followMonitorPipeline/);
  assert.match(client, /fetch\("\/api\/monitor\?spaceId=" \+ encodeURIComponent\(spaceId\), \{ cache: "no-store" \}\)/);
  assert.match(client, /if \(data\.monitor\.alreadyAdvancing \|\| data\.monitor\.leaseOwner === false\) \{[\s\S]*return followMonitorPipeline/);
  assert.match(client, /stopPolling\(\);[\s\S]*await followMonitorPipeline/);
  assert.doesNotMatch(client, /if \(data\.monitor\.alreadyAdvancing\) return current/);
  assert.match(client, /data\.monitor\.leaseOwner !== false/);
  assert.match(route, /durableMonitorCheckpoint\(activeJob\.status, activeJob\.checkpoint\)/);
  assert.match(route, /durableMonitorCheckpoint\(job\.status, job\.checkpoint\)/);
  assert.match(route, /UPDATE monitor_scan_jobs SET current_horizon = \?, current_source = \?, progress = MAX\(progress, \?\)/);
  assert.doesNotMatch(route, /UPDATE monitor_scan_jobs SET current_horizon = \?, current_source = \?, checkpoint = \?/);
});

test("single-flight migration preserves jobs while fencing legacy duplicates", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE monitor_runs (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, status TEXT NOT NULL,
      lock_token TEXT, lock_expires_at TEXT
    );
    CREATE TABLE monitor_scan_jobs (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, status TEXT NOT NULL,
      checkpoint TEXT NOT NULL, error TEXT, started_at TEXT NOT NULL,
      completed_at TEXT, updated_at TEXT NOT NULL
    );
    INSERT INTO monitor_runs VALUES ('run-a', 'space-a', 'screening', NULL, NULL);
    INSERT INTO monitor_scan_jobs VALUES
      ('job-old', 'space-a', 'screening', 'screening', NULL, '2026-08-27T00:00:00.000Z', NULL, '2026-08-27T00:01:00.000Z'),
      ('job-new', 'space-a', 'deep_reviewing', 'deep_reviewing', NULL, '2026-08-27T00:02:00.000Z', NULL, '2026-08-27T00:03:00.000Z');
  `);
  const migration = await readFile(new URL("../drizzle/0046_sweet_switch.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
    sqlite.exec(statement);
  }
  assert.equal(sqlite.prepare("SELECT active_job_id FROM monitor_runs WHERE space_id = 'space-a'").get().active_job_id, "job-new");
  assert.deepEqual(sqlite.prepare(
    "SELECT id, status, failure_kind FROM monitor_scan_jobs ORDER BY id",
  ).all().map((row) => ({ ...row })), [
    { id: "job-new", status: "deep_reviewing", failure_kind: "" },
    { id: "job-old", status: "error", failure_kind: "superseded" },
  ]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_scan_jobs").get().count, 2);
});
