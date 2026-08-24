import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MONITOR_SCHEDULER_BUCKET_MS,
  monitorSchedulerBucketId,
  monitorSchedulerSecretMatches,
  shouldWakeMonitorScheduler,
} from "../lib/monitor-scheduler.mjs";

test("scheduler buckets deduplicate cron, watchdog, and visit wakeups", () => {
  assert.equal(MONITOR_SCHEDULER_BUCKET_MS, 10 * 60 * 1000);
  assert.equal(monitorSchedulerBucketId(0), "monitor-scheduler:0");
  assert.equal(monitorSchedulerBucketId(599_999), "monitor-scheduler:0");
  assert.equal(monitorSchedulerBucketId(600_000), "monitor-scheduler:1");
  assert.equal(shouldWakeMonitorScheduler("GET", "/"), true);
  assert.equal(shouldWakeMonitorScheduler("GET", "/api/spaces"), true);
  assert.equal(shouldWakeMonitorScheduler("POST", "/api/monitor"), false);
});

test("external scheduler authorization fails closed", () => {
  assert.equal(monitorSchedulerSecretMatches("Bearer correct", "correct"), true);
  assert.equal(monitorSchedulerSecretMatches("Bearer incorrect", "correct"), false);
  assert.equal(monitorSchedulerSecretMatches("correct", "correct"), false);
  assert.equal(monitorSchedulerSecretMatches("Bearer correct", ""), false);
});

test("production scheduler has three triggers, a lease, and stale-job recovery", async () => {
  const [worker, schema, repository, workflow] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pi-background-scheduler.yml", import.meta.url), "utf8"),
  ]);
  assert.match(worker, /cloudflare_cron/);
  assert.match(worker, /external_watchdog/);
  assert.match(worker, /visit_backstop/);
  assert.match(worker, /VISIT_BACKSTOP_GAP_MS = 25 \* 60 \* 1000/);
  assert.match(worker, /const result = await runScheduledMonitorSweep\(env, ctx, "external_watchdog"\)/);
  assert.match(worker, /INSERT OR IGNORE INTO monitor_scheduler_ticks/);
  assert.match(worker, /stale_scheduler_recovery/);
  assert.match(worker, /health_status = 'recovered_timeout'/);
  assert.match(worker, /scheduler_lease_expired/);
  assert.match(worker, /datetime\('now', '-20 minutes'\)/);
  assert.match(worker, /SCHEDULED_SPACE_BATCH_SIZE = 1/);
  assert.match(worker, /datetime\(r\.last_user_activity_at\) DESC/);
  assert.match(
    worker,
    /ORDER BY CASE WHEN r\.last_user_activity_at IS NULL THEN 1 ELSE 0 END,\s*datetime\(r\.last_user_activity_at\) DESC,\s*CASE WHEN r\.status NOT IN/,
  );
  assert.match(worker, /WHERE id != \? AND completed_at IS NOT NULL ORDER BY datetime\(completed_at\) DESC/);
  assert.match(worker, /MONITOR_SCHEDULER_SECRET/);
  assert.match(schema, /leaseToken: text\("lease_token"\)/);
  assert.match(schema, /recoveredJobCount: integer\("recovered_job_count"\)/);
  assert.match(schema, /healthStatus: text\("health_status"\)/);
  assert.match(repository, /PRAGMA table_info\(monitor_scheduler_ticks\)/);
  assert.match(worker, /gapMinutes > 25 \? "recovered_gap" : "healthy"/);
  assert.match(workflow, /cron: "17,47 \* \* \* \*"/);
  assert.match(workflow, /--max-time 240/);
  assert.match(workflow, /jq -e '\(\.acquired == true\) or \(\.acquired == false\)'/);
  assert.match(workflow, /secrets\.PI_SCHEDULER_SECRET/);
  assert.match(workflow, /api\/internal\/scheduler/);
});
