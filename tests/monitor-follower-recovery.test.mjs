import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  MONITOR_FOLLOWER_RECLAIM_RETRY_MS,
  shouldReclaimMonitorLease,
} from "../lib/monitor-follower-control.mjs";

test("an active follower reclaims only after the persisted owner lease expires", () => {
  const now = Date.parse("2026-08-28T04:21:24.000Z");
  assert.equal(shouldReclaimMonitorLease({
    status: "discovering_days",
    leaseExpiresAt: "2026-08-28T04:21:23.000Z",
  }, { now, lastAttemptAt: 0 }), true);
  assert.equal(shouldReclaimMonitorLease({
    status: "discovering_days",
    leaseExpiresAt: "2026-08-28T04:31:23.000Z",
  }, { now, lastAttemptAt: 0 }), false);
});

test("follower reclaim is bounded and never restarts terminal or unleased work", () => {
  const now = Date.parse("2026-08-28T04:21:24.000Z");
  const expired = "2026-08-28T04:21:23.000Z";
  assert.equal(shouldReclaimMonitorLease({ status: "ready", leaseExpiresAt: expired }, { now }), false);
  assert.equal(shouldReclaimMonitorLease({ status: "error", leaseExpiresAt: expired }, { now }), false);
  assert.equal(shouldReclaimMonitorLease({ status: "discovering_days", leaseExpiresAt: null }, { now }), false);
  assert.equal(shouldReclaimMonitorLease({
    status: "discovering_days",
    leaseExpiresAt: expired,
  }, { now, lastAttemptAt: now - MONITOR_FOLLOWER_RECLAIM_RETRY_MS + 1 }), false);
});

test("monitor state exposes the lease and the follower re-enters single-flight election", () => {
  const route = fs.readFileSync(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("../app/research-app.tsx", import.meta.url), "utf8");
  assert.match(route, /lock_expires_at[\s\S]*leaseExpiresAt: run\?\.lock_expires_at \|\| null/);
  assert.match(client, /shouldReclaimMonitorLease\(current,[\s\S]*trigger: "visit", action: "start"/);
  assert.match(client, /leaseOwner !== false[\s\S]*return advanceMonitorPipeline\(spaceId, data\.monitor/);
});
