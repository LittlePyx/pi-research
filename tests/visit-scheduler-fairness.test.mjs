import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  SCHEDULED_MONITOR_RECOVERY_SPACE_SQL,
  SCHEDULED_MONITOR_SPACE_SQL,
  VISIT_SCHEDULER_ORDINAL_SQL,
  mergeScheduledMonitorSpaces,
  visitSchedulerTaskOrder,
} from "../lib/monitor-scheduler.mjs";

const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const sweepSource = worker.slice(worker.indexOf("async function runScheduledMonitorSweep"), worker.indexOf("// Image security config."));
const compiled = ts.transpileModule(sweepSource, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;

// Execute the production sweep, replacing only external workers and D1 I/O.
function harness({ available = visitSchedulerTaskOrder(1), fail = null } = {}) {
  const calls = [], finalizations = [];
  const state = { ordinal: 0, acquired: true };
  const has = new Set(available);
  const task = async (lane) => {
    calls.push(lane);
    if (lane === fail) throw new Error("fixture worker unavailable");
    return { attempted: has.has(lane), spaceId: has.has(lane) ? "space-a" : null };
  };
  const database = { prepare(sql) {
    return {
      bind(...values) { this.values = values; return this; },
      async all() {
        assert.equal(sql, SCHEDULED_MONITOR_SPACE_SQL);
        return { results: has.has("monitor") ? [{ id: "space-a", owner_user_id: "anonymous:fixture" }] : [] };
      },
      async first() {
        if (sql === VISIT_SCHEDULER_ORDINAL_SQL) return { count: state.ordinal };
        if (sql === SCHEDULED_MONITOR_RECOVERY_SPACE_SQL || sql === "sentinel-target") return null;
        assert.fail(`Unexpected read: ${sql}`);
      },
      async run() {
        assert.match(sql, /UPDATE monitor_scheduler_ticks SET completed_at/);
        finalizations.push(this.values);
        return { meta: { changes: 1 } };
      },
    };
  } };
  const context = vm.createContext({
    Request, Response, Date, JSON, Promise,
    SCHEDULED_MONITOR_SPACE_SQL, SCHEDULED_MONITOR_RECOVERY_SPACE_SQL,
    VISIT_SCHEDULER_ORDINAL_SQL, visitSchedulerTaskOrder, mergeScheduledMonitorSpaces,
    SCHEDULED_SPACE_BATCH_SIZE: 1, SCHEDULED_ADVANCE_STEPS: 1,
    MONITOR_OPERATIONAL_SENTINEL_TARGET_SQL: "sentinel-target",
    reconcileExpiredSchedulerTicks: async () => {},
    acquireSchedulerLease: async (_env, trigger) => {
      if (!state.acquired) return { acquired: false };
      if (trigger === "visit_backstop") state.ordinal += 1;
      return { acquired: true, tickId: `fixture-${state.ordinal}`, leaseToken: "fixture-lease" };
    },
    recoverStaleMonitorJobs: async () => 0,
    runScheduledResearchRouteIntelligence: () => task("routeIntelligence"),
    runScheduledResearchRouteEvolution: () => task("routeEvolution"),
    runScheduledResearchRouteRetry: () => task("routeRetry"),
    runScheduledResearchGapDiscovery: (_env, _ctx, mode) => task(mode === "stalled" ? "gapRecovery" : "gapDiscovery"),
    runScheduledResearchRouteSentinel: async () => ({ status: "healthy" }),
    runScheduledMonitorOperationalSentinel: async () => ({ status: "healthy" }),
    handler: { async fetch(request) {
      assert.equal(new URL(request.url).pathname, "/api/monitor");
      assert.deepEqual(await request.json(), { spaceId: "space-a", trigger: "scheduled", action: "start" });
      calls.push("monitor");
      return Response.json({ monitor: { status: "ready", leaseOwner: true } });
    } },
  });
  vm.runInContext(compiled, context);
  return { calls, finalizations, state, run: (trigger = "visit_backstop") => context.runScheduledMonitorSweep({ DB: database }, {}, trigger) };
}

test("persisted visit ordinal ignores clock gaps and non-visit scheduler ticks", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE monitor_scheduler_ticks (id TEXT PRIMARY KEY, trigger_source TEXT, completed_at TEXT)");
    db.exec(`INSERT INTO monitor_scheduler_ticks VALUES
      ('visit-1', 'visit_backstop', '2026-09-01'),
      ('watchdog-1', 'external_watchdog', '2026-09-02'),
      ('cron-1', 'cloudflare_cron', '2026-09-04'),
      ('current-visit', 'visit_backstop', NULL)`);
    const { count } = db.prepare(VISIT_SCHEDULER_ORDINAL_SQL).get();
    assert.equal(count, 2);
    assert.equal(visitSchedulerTaskOrder(count)[0], "gapRecovery");
    assert.deepEqual(visitSchedulerTaskOrder(7), visitSchedulerTaskOrder(1));
  } finally { db.close(); }
});

test("six acquired visits give every busy task one turn, including gaps and Today", async () => {
  const fixture = harness();
  for (let index = 0; index < 6; index += 1) {
    const before = fixture.calls.length;
    const result = await fixture.run();
    assert.equal(result.tickError, "");
    assert.equal(result.failedCount, 0);
    assert.equal(fixture.calls.length - before, 1, "never stack heavy work in a visit");
    assert.equal(result.startedCount, index === 5 ? 1 : 0);
  }
  assert.deepEqual(fixture.calls, visitSchedulerTaskOrder(1));
  assert.equal(fixture.finalizations.length, 6);
});

test("empty lanes fall through while lease contention and failures preserve future turns", async () => {
  const onlyMonitor = harness({ available: ["monitor"] });
  assert.equal((await onlyMonitor.run()).startedCount, 1);
  assert.deepEqual(onlyMonitor.calls, visitSchedulerTaskOrder(1));
  const empty = harness({ available: [] });
  assert.equal((await empty.run()).startedCount, 0);
  assert.equal(empty.calls.includes("monitor"), false);

  const failed = harness({ fail: "gapDiscovery" });
  failed.state.acquired = false;
  assert.equal((await failed.run()).acquired, false);
  assert.equal(failed.state.ordinal, 0);
  assert.deepEqual(failed.calls, []);
  failed.state.acquired = true;
  assert.equal((await failed.run()).failedCount, 1);
  assert.deepEqual(failed.calls, ["gapDiscovery"], "do not stack work after an uncertain failure");
  assert.equal((await failed.run()).failedCount, 0);
  assert.deepEqual(failed.calls, ["gapDiscovery", "gapRecovery"]);
  assert.equal(failed.finalizations.length, 2);
});

test("cron and watchdog retain their existing bounded research and monitor batch", async () => {
  for (const trigger of ["cloudflare_cron", "external_watchdog"]) {
    const fixture = harness();
    const result = await fixture.run(trigger);
    assert.equal(result.tickError, "");
    assert.equal(result.startedCount, 1);
    assert.deepEqual(fixture.calls, ["routeIntelligence", "gapDiscovery", "gapRecovery", "monitor"]);
    assert.equal(fixture.state.ordinal, 0);
  }
});
