import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MONITOR_AUTOMATION_LIMITS,
  monitorAutomationPauseCopy,
  monitorAutomationPauseReason,
} from "../lib/monitor-automation.mjs";
import { shouldBlockManualMonitorStart } from "../lib/monitor-runtime-control.mjs";

const now = Date.parse("2026-08-21T08:00:00.000Z");
const healthy = {
  now,
  pendingRecommendations: 3,
  scheduledRunsSinceActivity: 1,
  lastUserActivityAt: "2026-08-20T08:00:00.000Z",
  dailyRequests: 8,
  dailyTokens: 24_000,
};

test("automatic monitoring pauses before unattended research spending can accumulate", () => {
  assert.equal(monitorAutomationPauseReason(healthy), null);
  assert.equal(monitorAutomationPauseReason({ ...healthy, pendingRecommendations: 120 }), null);
  assert.equal(monitorAutomationPauseReason({ ...healthy, scheduledRunsSinceActivity: MONITOR_AUTOMATION_LIMITS.scheduledRunsWithoutActivity }), "unattended_runs");
  assert.equal(monitorAutomationPauseReason({ ...healthy, lastUserActivityAt: "2026-08-13T08:00:00.000Z" }), "inactive");
  assert.equal(monitorAutomationPauseReason({ ...healthy, dailyTokens: MONITOR_AUTOMATION_LIMITS.dailyTokens }), "daily_budget");
  assert.match(monitorAutomationPauseCopy("unattended_runs").zh, /3 轮扫描/);
});

test("background budget deferral never blocks an active user's manual scan", () => {
  assert.equal(shouldBlockManualMonitorStart({ throttled: true, automationDeferred: true }), false);
  assert.equal(shouldBlockManualMonitorStart({ throttled: true }), false);
  assert.equal(shouldBlockManualMonitorStart({ throttled: true, retryAfterMinutes: 7 }), true);
  assert.equal(shouldBlockManualMonitorStart({
    throttled: true,
    retryAfterMinutes: 7,
    scanJob: { needsRefresh: true },
  }), false);
});

test("scheduled monitoring persists heartbeats and advances only a bounded checkpoint slice", async () => {
  const [worker, route, runtimeControl, schema, repository, client] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/monitor-runtime-control.mjs", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(worker, /SCHEDULED_ADVANCE_STEPS = 1/);
  assert.match(worker, /monitor_scheduler_ticks/);
  assert.match(worker, /r\.automation_paused_at IS NULL/);
  assert.match(worker, /automationDeferred/);
  assert.match(route, /monitorAutomationPauseReason/);
  assert.match(route, /deferMonitorAutomation/);
  assert.match(route, /budget\.resetsAt/);
  assert.match(runtimeControl, /scheduled_runs_since_activity = scheduled_runs_since_activity \+ \?/);
  assert.match(route, /trigger === "scheduled" \? 1 : 0/);
  assert.match(route, /automationPaused: true/);
  assert.match(schema, /monitorSchedulerTicks/);
  assert.match(repository, /idx_monitor_runs_automation_due/);
  assert.ok(
    repository.indexOf("ALTER TABLE monitor_runs ADD COLUMN automation_paused_at TEXT")
      < repository.indexOf("CREATE INDEX IF NOT EXISTS idx_monitor_runs_automation_due"),
    "legacy monitor_runs columns must be added before the automation index is created",
  );
  assert.ok(
    repository.indexOf("await ensureEvidenceVerificationColumns(database)")
      < repository.indexOf("await ensurePaperInsightReviewColumns(database)"),
    "legacy audit verification columns must exist before recommendation history is backfilled",
  );
  assert.match(client, /等待你处理后恢复/);
  assert.match(client, /shouldBlockManualMonitorStart\(monitor\)/);
  assert.match(client, /无人操作的后台扫描已待机以控制费用/);
});
