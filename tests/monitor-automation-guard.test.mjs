import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  MONITOR_AUTOMATION_LIMITS,
  MONITOR_VISIT_ACTIVITY_HEARTBEAT_MINUTES,
  monitorAutomationPauseCopy,
  monitorAutomationPauseReason,
  recordMonitorVisitActivity,
} from "../lib/monitor-automation.mjs";
import { shouldBlockManualMonitorStart } from "../lib/monitor-runtime-control.mjs";
import { SCHEDULED_MONITOR_SPACE_SQL } from "../lib/monitor-scheduler.mjs";

const now = Date.parse("2026-08-21T08:00:00.000Z");
const healthy = {
  now,
  pendingRecommendations: 3,
  scheduledRunsSinceActivity: 1,
  lastUserActivityAt: "2026-08-20T08:00:00.000Z",
  dailyRequests: 8,
  dailyTokens: 24_000,
};

test("active workspaces keep draining backlog while only inactive automation is capped", () => {
  assert.equal(monitorAutomationPauseReason(healthy), null);
  assert.equal(monitorAutomationPauseReason({ ...healthy, pendingRecommendations: 120 }), null);
  assert.equal(monitorAutomationPauseReason({ ...healthy, scheduledRunsSinceActivity: 120 }), null);
  assert.equal(monitorAutomationPauseReason({
    ...healthy,
    lastUserActivityAt: null,
    scheduledRunsSinceActivity: MONITOR_AUTOMATION_LIMITS.scheduledRunsWithoutActivity,
  }), "unattended_runs");
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

test("opening a research space resumes only absence pauses and wakes the bounded scheduler", async () => {
  assert.equal(MONITOR_VISIT_ACTIVITY_HEARTBEAT_MINUTES, 5);
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE monitor_runs (
        space_id TEXT PRIMARY KEY, status TEXT NOT NULL, last_run_at TEXT, next_run_at TEXT,
        active_job_id TEXT, last_user_activity_at TEXT, scheduled_runs_since_activity INTEGER NOT NULL DEFAULT 0,
        automation_paused_at TEXT, automation_pause_reason TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO monitor_runs VALUES
       ('inactive-space', 'ready', '2026-08-20 01:00:00', '2026-09-03 01:00:00', NULL,
        '2026-08-20 01:00:00', 3, '2026-08-27 01:00:00', 'inactive', '2026-08-27 01:00:00'),
       ('budget-space', 'ready', '2026-08-20 02:00:00', '2026-09-03 02:00:00', NULL,
        '2026-08-20 02:00:00', 2, '2026-08-27 02:00:00', 'daily_budget', '2026-08-27 02:00:00'),
       ('model-space', 'ready', '2026-08-20 03:00:00', '2026-09-03 03:00:00', NULL,
        '2026-08-20 03:00:00', 2, '2026-08-27 03:00:00', 'model_unavailable', '2026-08-27 03:00:00');
    `);
    const database = {
      prepare(sql) {
        let bindings = [];
        const statement = {
          bind(...values) { bindings = values; return statement; },
          async run() {
            const result = sqlite.prepare(sql).run(...bindings);
            return { meta: { changes: Number(result.changes) } };
          },
        };
        return statement;
      },
    };

    await recordMonitorVisitActivity(database, "inactive-space");
    await recordMonitorVisitActivity(database, "budget-space");
    await recordMonitorVisitActivity(database, "model-space");
    const resumed = sqlite.prepare("SELECT * FROM monitor_runs WHERE space_id = 'inactive-space'").get();
    assert.equal(resumed.automation_paused_at, null);
    assert.equal(resumed.automation_pause_reason, "");
    assert.equal(resumed.scheduled_runs_since_activity, 0);
    assert.equal(resumed.last_run_at, "2026-08-20 01:00:00", "a visit must not rewrite the source-discovery clock");
    assert.ok(Date.parse(`${resumed.next_run_at.replace(" ", "T")}Z`) <= Date.now());

    const protectedPause = sqlite.prepare("SELECT * FROM monitor_runs WHERE space_id = 'budget-space'").get();
    assert.equal(protectedPause.automation_pause_reason, "daily_budget");
    assert.equal(protectedPause.automation_paused_at, "2026-08-27 02:00:00");
    assert.equal(protectedPause.next_run_at, "2026-09-03 02:00:00");
    assert.equal(protectedPause.scheduled_runs_since_activity, 0, "the visit is still recorded as user activity");
    const unavailableModel = sqlite.prepare("SELECT * FROM monitor_runs WHERE space_id = 'model-space'").get();
    assert.equal(unavailableModel.automation_pause_reason, "model_unavailable");
    assert.equal(unavailableModel.automation_paused_at, "2026-08-27 03:00:00");
  } finally {
    sqlite.close();
  }
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
  assert.match(SCHEDULED_MONITOR_SPACE_SQL, /r\.automation_paused_at IS NULL/);
  assert.match(worker, /automationDeferred/);
  assert.match(route, /monitorAutomationPauseReason/);
  assert.match(route, /await recordMonitorVisitActivity\(context\.database, context\.space\.id\)/);
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
