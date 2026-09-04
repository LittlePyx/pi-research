import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  MONITOR_SCHEDULER_BUCKET_MS,
  SCHEDULED_MONITOR_RECOVERY_SPACE_SQL,
  SCHEDULED_MONITOR_SPACE_SQL,
  mergeScheduledMonitorSpaces,
  monitorSchedulerBucketId,
  monitorSchedulerSecretMatches,
  shouldWakeMonitorScheduler,
} from "../lib/monitor-scheduler.mjs";
import { SCHEDULED_RESEARCH_ROUTE_RETRY_SQL } from "../lib/research-map-reliability.ts";
import { SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL } from "../lib/research-map-intelligence.ts";
import { SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL } from "../lib/research-route-evolution.ts";

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
  assert.match(worker, /VISIT_BACKSTOP_LEASE_MS = 35_000/);
  assert.match(worker, /trigger === "visit_backstop" \? VISIT_BACKSTOP_LEASE_MS : SCHEDULER_LEASE_MS/);
  assert.match(worker, /const result = await runScheduledMonitorSweep\(env, ctx, "external_watchdog"\)/);
  assert.match(worker, /INSERT OR IGNORE INTO monitor_scheduler_ticks/);
  assert.match(worker, /stale_scheduler_recovery/);
  assert.match(worker, /health_status = 'recovered_timeout'/);
  assert.match(worker, /scheduler_lease_expired/);
  assert.match(worker, /datetime\('now', '-20 minutes'\)/);
  assert.match(worker, /SCHEDULED_SPACE_BATCH_SIZE = 1/);
  assert.match(worker, /SCHEDULED_MONITOR_RECOVERY_SPACE_SQL/);
  assert.match(worker, /mergeScheduledMonitorSpaces\(due\.results, stalledRecoverySpace\)/);
  assert.match(worker, /SCHEDULED_ROUTE_RETRY_BATCH_SIZE = 1/);
  assert.match(worker, /SCHEDULED_ROUTE_INTELLIGENCE_BATCH_SIZE = 1/);
  assert.match(worker, /SCHEDULED_ROUTE_EVOLUTION_BATCH_SIZE = 1/);
  assert.match(worker, /scheduledResearchRouteRetrySql\(developmentUnboundedEnabled/);
  assert.match(worker, /recovery_from_shared_queue === 1/);
  assert.match(SCHEDULED_RESEARCH_ROUTE_RETRY_SQL, /datetime\(run\.last_user_activity_at\) > datetime\('now', '-7 days'\)/);
  assert.doesNotMatch(SCHEDULED_RESEARCH_ROUTE_RETRY_SQL, /scheduled_runs_since_activity < 3/);
  assert.match(worker, /x-pi-scheduled-route-retry/);
  assert.match(worker, /runScheduledResearchRouteIntelligence/);
  assert.match(worker, /x-pi-scheduled-route-intelligence/);
  assert.match(worker, /action: "advance-intelligence"/);
  assert.match(worker, /trackId: due\.track_id/);
  assert.match(worker, /research_route_intelligence/);
  assert.match(worker, /runScheduledResearchRouteEvolution/);
  assert.match(worker, /x-pi-scheduled-route-evolution/);
  assert.match(worker, /action: "propose-evolution"/);
  assert.match(worker, /research_route_evolution/);
  assert.match(worker, /if \(!routeIntelligence\.attempted\) routeEvolution/);
  assert.match(worker, /if \(attempted\) break/);
  const schedulerSweep = worker.slice(worker.indexOf("async function runScheduledMonitorSweep"));
  assert.match(schedulerSweep, /visitSchedulerTaskOrder\(ordinal\?\.count\)/);
  assert.match(worker, /trigger === "visit_backstop"[\s\S]*gapDiscovery = await runScheduledResearchGapDiscovery\(env, ctx, "due"\)/);
  assert.match(worker, /gapDiscovery = await runScheduledResearchGapDiscovery\(env, ctx, "due"\);[\s\S]*gapRecovery = await runScheduledResearchGapDiscovery\(env, ctx, "stalled"\)/);
  assert.match(worker, /gapRecovery\?\.spaceId \|\| gapDiscovery\?\.spaceId/);
  assert.match(worker, /let monitorSpaces = scheduledSpaces/);
  assert.match(SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL, /intelligence_refresh_requested_at IS NULL THEN 0 ELSE 1/);
  assert.match(SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL, /datetime\(run\.last_user_activity_at\) > datetime\('now', '-7 days'\)/);
  assert.doesNotMatch(SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL, /intelligence_attempt_count\s*</);
  assert.match(SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL, /insight\.ever_recommended = 1/);
  assert.match(SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL, /verification_coverage_score >= 70/);
  assert.match(SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL, /event\.outcome IN \('degraded', 'failed'\)/);
  assert.match(worker, /recordResearchRouteSentinel/);
  assert.match(worker, /recordMonitorOperationalSentinel/);
  assert.match(worker, /MONITOR_OPERATIONAL_SENTINEL_TARGET_SQL/);
  assert.match(worker, /unresolvedOperationalSpace\?\.space_id \|\| stalledRecoverySpace\?\.id \|\| due\.results\[0\]\?\.id/);
  assert.match(worker, /runScheduledMonitorOperationalSentinel\(\s*env,\s*sentinelSpaceId,/);
  assert.match(worker, /Pi monitor operational sentinel/);
  assert.match(worker, /readMonitorReliabilityHealth/);
  assert.match(worker, /api\/internal\/reliability/);
  assert.match(worker, /reliability_health_query_failed/);
  assert.match(SCHEDULED_MONITOR_SPACE_SQL, /datetime\(r\.last_user_activity_at\) DESC/);
  assert.match(
    SCHEDULED_MONITOR_SPACE_SQL,
    /ORDER BY CASE WHEN r\.status NOT IN[\s\S]+THEN COALESCE\(datetime\(r\.next_run_at\)/,
  );
  assert.match(worker, /WHERE id != \? AND completed_at IS NOT NULL ORDER BY datetime\(completed_at\) DESC/);
  assert.match(worker, /MONITOR_SCHEDULER_SECRET/);
  assert.match(schema, /leaseToken: text\("lease_token"\)/);
  assert.match(schema, /recoveredJobCount: integer\("recovered_job_count"\)/);
  assert.match(schema, /healthStatus: text\("health_status"\)/);
  assert.match(schema, /idx_monitor_reliability_kind_outcome_created/);
  assert.match(repository, /PRAGMA table_info\(monitor_scheduler_ticks\)/);
  assert.match(repository, /CREATE INDEX IF NOT EXISTS idx_monitor_reliability_kind_outcome_created/);
  assert.match(worker, /gapMinutes > 25 \? "recovered_gap" : "healthy"/);
  assert.match(workflow, /cron: "17,47 \* \* \* \*"/);
  assert.match(workflow, /--max-time 240/);
  assert.match(workflow, /jq -e '\(\.acquired == true\) or \(\.acquired == false\)'/);
  assert.match(workflow, /secrets\.PI_SCHEDULER_SECRET/);
  assert.match(workflow, /api\/internal\/scheduler/);
  assert.match(workflow, /api\/internal\/reliability/);
  assert.match(workflow, /persistentCriticalCount/);
  assert.match(workflow, /jq -e '\.healthy == true'/);
  assert.match(workflow, /production-reliability-health:/);
  assert.match(workflow, /needs: wake-background-research/);
});

test("a stale active checkpoint receives a recovery slot without replacing normal work", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL);
      CREATE TABLE monitor_runs (
        space_id TEXT PRIMARY KEY, status TEXT NOT NULL, next_run_at TEXT, last_run_at TEXT,
        updated_at TEXT NOT NULL, lock_expires_at TEXT, automation_paused_at TEXT,
        last_user_activity_at TEXT, active_job_id TEXT
      );
      CREATE TABLE monitor_scan_jobs (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, status TEXT NOT NULL,
        updated_at TEXT NOT NULL, advance_lock_expires_at TEXT
      );
      INSERT INTO research_spaces VALUES
        ('normal-space', 'anonymous:normal'),
        ('stalled-space', 'anonymous:stalled'),
        ('leased-space', 'anonymous:leased');
      INSERT INTO monitor_runs VALUES
        ('normal-space', 'ready', datetime('now', '-1 minute'), datetime('now', '-1 day'),
         datetime('now'), NULL, NULL, datetime('now'), NULL),
        ('stalled-space', 'deep_reviewing', datetime('now', '+1 hour'), datetime('now', '-1 day'),
         datetime('now'), NULL, NULL, datetime('now', '-1 hour'), 'job-stalled'),
        ('leased-space', 'deep_reviewing', datetime('now', '-1 hour'), datetime('now', '-1 day'),
         datetime('now'), datetime('now', '+1 hour'), NULL, datetime('now', '-1 hour'), 'job-leased');
      INSERT INTO monitor_scan_jobs VALUES
        ('job-stalled', 'stalled-space', 'deep_reviewing', datetime('now', '-30 minutes'), NULL),
        ('job-leased', 'leased-space', 'deep_reviewing', datetime('now', '-30 minutes'), datetime('now', '+1 hour'));
    `);
    const due = sqlite.prepare(SCHEDULED_MONITOR_SPACE_SQL).get(1);
    const recovery = sqlite.prepare(SCHEDULED_MONITOR_RECOVERY_SPACE_SQL).get();
    assert.equal(due.id, "normal-space");
    assert.equal(recovery.id, "stalled-space");
    assert.deepEqual(
      mergeScheduledMonitorSpaces([due], recovery).map((space) => space.id),
      ["stalled-space", "normal-space"],
    );
    assert.deepEqual(
      mergeScheduledMonitorSpaces([recovery], recovery).map((space) => space.id),
      ["stalled-space"],
    );
  } finally {
    sqlite.close();
  }
});

test("an older active checkpoint is not starved by a more recently visited active space", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL);
      CREATE TABLE monitor_runs (
        space_id TEXT PRIMARY KEY, status TEXT NOT NULL, next_run_at TEXT, last_run_at TEXT,
        updated_at TEXT NOT NULL, lock_expires_at TEXT, automation_paused_at TEXT,
        last_user_activity_at TEXT
      );
      INSERT INTO research_spaces VALUES
        ('recovering-space', 'anonymous:recovering'),
        ('recent-space', 'anonymous:recent');
      INSERT INTO monitor_runs VALUES
        ('recovering-space', 'deep_reviewing', datetime('now', '-30 minutes'), datetime('now', '-1 day'),
         datetime('now', '-30 minutes'), NULL, NULL, datetime('now', '-2 hours')),
        ('recent-space', 'screening', datetime('now', '-5 minutes'), datetime('now', '-1 day'),
         datetime('now', '-5 minutes'), NULL, NULL, datetime('now'));
    `);
    const selected = sqlite.prepare(SCHEDULED_MONITOR_SPACE_SQL).get(1);
    assert.equal(selected.id, "recovering-space");
  } finally {
    sqlite.close();
  }
});

test("scheduler reopens an exhausted route only after genuinely new route-attributed candidates arrive", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY, owner_user_id TEXT);
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY, space_id TEXT, build_status TEXT, build_attempt_count INTEGER,
        build_retry_at TEXT, updated_at TEXT
      );
      CREATE TABLE monitor_runs (
        space_id TEXT, automation_paused_at TEXT, scheduled_runs_since_activity INTEGER,
        last_user_activity_at TEXT
      );
      CREATE TABLE monitor_discovery_coverage (
        space_id TEXT, horizon TEXT, source_key TEXT, query_key TEXT, route_id TEXT
      );
      CREATE TABLE monitor_candidate_sources (
        space_id TEXT, paper_id TEXT, source_key TEXT, query_key TEXT, first_seen_at TEXT
      );
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, horizon TEXT);
      CREATE TABLE paper_insights (
        paper_id TEXT, space_id TEXT, analysis_source TEXT, analysis_model TEXT, updated_at TEXT
      );
      INSERT INTO research_spaces VALUES ('space-a', 'anonymous:workspace-a');
      INSERT INTO monitor_runs VALUES ('space-a', NULL, 0, datetime('now'));
      INSERT INTO research_tracks VALUES ('track-a', 'space-a', 'failed', 3, NULL, '2026-08-28 10:00:00');
      INSERT INTO monitor_discovery_coverage VALUES ('space-a', 'years', 'research-route:foundation', 'query-a', 'track-a');
      INSERT INTO monitored_papers VALUES ('old-paper', 'space-a', 'years');
      INSERT INTO monitor_candidate_sources VALUES ('space-a', 'old-paper', 'research-route:foundation', 'query-a', '2026-08-28 09:00:00');
    `);
    sqlite.exec(await readFile(new URL("../drizzle/0049_amusing_psynapse.sql", import.meta.url), "utf8"));
    assert.equal(sqlite.prepare(SCHEDULED_RESEARCH_ROUTE_RETRY_SQL).get(1), undefined);

    sqlite.exec(`INSERT INTO paper_insights VALUES
      ('old-paper', 'space-a', 'deepseek', 'deepseek-v4-pro', '2026-08-28 11:00:00');`);
    const qualityReviewed = sqlite.prepare(SCHEDULED_RESEARCH_ROUTE_RETRY_SQL).get(1);
    assert.equal(qualityReviewed.track_id, 'track-a');
    assert.equal(qualityReviewed.recovery_from_shared_queue, 1);

    sqlite.exec(`
      UPDATE research_tracks SET updated_at = '2026-08-28 12:00:00' WHERE id = 'track-a';
      INSERT INTO monitored_papers VALUES ('new-paper', 'space-a', 'years');
      INSERT INTO monitor_candidate_sources VALUES ('space-a', 'new-paper', 'research-route:foundation', 'query-a', '2026-08-28 13:00:00');
    `);
    const due = sqlite.prepare(SCHEDULED_RESEARCH_ROUTE_RETRY_SQL).get(1);
    assert.equal(due.track_id, 'track-a');
    assert.equal(due.recovery_from_shared_queue, 1);
    assert.match(
      sqlite.prepare(`EXPLAIN QUERY PLAN ${SCHEDULED_RESEARCH_ROUTE_RETRY_SQL}`).all(1).map((row) => row.detail).join("\n"),
      /idx_monitor_candidate_sources_route_recovery/,
    );
  } finally {
    sqlite.close();
  }
});
