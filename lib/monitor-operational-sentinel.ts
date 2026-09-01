import { activeResearchRouteSupplyPredicate } from "./research-map-curation.ts";

const ACTIVE_JOB_STALE_MS = 20 * 60 * 1000;
export const MONITOR_QUALITY_QUEUE_STALL_GRACE_MS = 25 * 60 * 1000;
export const MONITOR_OPERATIONAL_ALERT_BUCKET_MS = 60 * 60 * 1000;

const TERMINAL_RUN_STATUSES = new Set(["idle", "ready", "error"]);
const CRITICAL_ISSUES = new Set([
  "duplicate_active_jobs",
  "active_job_mismatch",
  "active_run_without_job",
  "scheduler_heartbeat_gap",
  "retry_not_converging",
  "quality_queue_stalled",
  "ready_without_visible_evidence",
  "retryable_past_attempt_cap",
  "shared_queue_feed_gap",
  "history_count_regression",
  "sentinel_query_failed",
]);

export type MonitorOperationalSnapshot = {
  runStatus: string;
  runActiveJobId: string | null;
  lockExpiresAt: string | null;
  runUpdatedAt: string | null;
  schedulerGapMinutes: number;
  schedulerHealthStatus: string;
  activeJobCount: number;
  activeJobIds: string[];
  boundActiveJobCount: number;
  oldestActiveUpdatedAt: string | null;
  retryOverdueCount: number;
  latestRetryCount: number;
  consecutiveFailureCount: number;
  latestFailureKind: string;
  latestFailureSource: string;
  recentSourceFailureCount: number;
  recentSourceCount: number;
  recentFailedSources: string[];
  pendingQualityQueueCount: number;
  oldestPendingQualityAt: string | null;
  qualityNextRunAt: string | null;
  automationPauseReason: string;
};

export type MonitorQualityQueueHealth = {
  status: "empty" | "active" | "paused" | "scheduled" | "stalled";
  pendingCount: number;
  oldestAgeMinutes: number;
  overdueMinutes: number;
  stallReason: string;
};

export type MonitorOperationalEvaluation = {
  outcome: "success" | "degraded" | "failed";
  issues: string[];
  criticalIssues: string[];
  qualityQueue: MonitorQualityQueueHealth;
};

type RouteSentinelSignal = {
  outcome?: string;
  issues?: string[];
  historyRegressions?: string[];
  snapshot?: unknown;
};

type OperationalRow = {
  run_status: string;
  active_job_id: string | null;
  lock_expires_at: string | null;
  run_updated_at: string | null;
  scheduler_gap_minutes: number;
  scheduler_health_status: string | null;
  active_job_count: number;
  active_job_ids: string | null;
  bound_active_job_count: number;
  oldest_active_updated_at: string | null;
  retry_overdue_count: number;
  latest_retry_count: number;
  pending_quality_queue_count: number;
  oldest_pending_quality_at: string | null;
  quality_next_run_at: string | null;
  automation_pause_reason: string;
};

type FailureRow = {
  failure_kind: string;
  failure_source: string;
  retry_count: number;
};

function count(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function databaseTimestamp(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return Date.parse(normalized);
}

function uniqueIssues(issues: Array<string | null | undefined>) {
  return Array.from(new Set(issues.filter((issue): issue is string => Boolean(issue))));
}

function failureSignature(row: FailureRow | undefined) {
  if (!row) return "";
  return `${row.failure_kind || "unknown"}:${row.failure_source || "unknown"}`;
}

export function consecutiveMonitorFailureCount(rows: FailureRow[]) {
  const signature = failureSignature(rows[0]);
  if (!signature) return 0;
  let consecutive = 0;
  for (const row of rows) {
    if (failureSignature(row) !== signature) break;
    consecutive += 1;
  }
  return consecutive;
}

export function monitorOperationalEventId(
  spaceId: string,
  issue: string,
  now = Date.now(),
  bucketMs = MONITOR_OPERATIONAL_ALERT_BUCKET_MS,
) {
  return `monitor-operational:${spaceId}:${issue}:${Math.floor(now / bucketMs)}`;
}

export function monitorQualityQueueHealth(
  snapshot: MonitorOperationalSnapshot,
  now = Date.now(),
): MonitorQualityQueueHealth {
  const pendingCount = count(snapshot.pendingQualityQueueCount);
  const oldestAt = databaseTimestamp(snapshot.oldestPendingQualityAt);
  const oldestAgeMinutes = Number.isFinite(oldestAt) ? Math.max(0, Math.floor((now - oldestAt) / 60_000)) : 0;
  if (!pendingCount) return { status: "empty", pendingCount: 0, oldestAgeMinutes: 0, overdueMinutes: 0, stallReason: "" };
  if (!TERMINAL_RUN_STATUSES.has(snapshot.runStatus)) {
    return { status: "active", pendingCount, oldestAgeMinutes, overdueMinutes: 0, stallReason: "active_quality_run" };
  }
  if (snapshot.automationPauseReason) {
    return { status: "paused", pendingCount, oldestAgeMinutes, overdueMinutes: 0, stallReason: snapshot.automationPauseReason };
  }
  const nextRunAt = databaseTimestamp(snapshot.qualityNextRunAt);
  const fallbackDueAt = databaseTimestamp(snapshot.runUpdatedAt);
  const dueAt = Number.isFinite(nextRunAt) ? nextRunAt : fallbackDueAt;
  const overdueMs = Number.isFinite(dueAt) ? now - dueAt : MONITOR_QUALITY_QUEUE_STALL_GRACE_MS + 1;
  const overdueMinutes = Math.max(0, Math.floor(overdueMs / 60_000));
  if (overdueMs > MONITOR_QUALITY_QUEUE_STALL_GRACE_MS) {
    return { status: "stalled", pendingCount, oldestAgeMinutes, overdueMinutes, stallReason: "scheduler_overdue" };
  }
  return { status: "scheduled", pendingCount, oldestAgeMinutes, overdueMinutes, stallReason: "awaiting_scheduler" };
}

export function evaluateMonitorOperationalSentinel(
  snapshot: MonitorOperationalSnapshot,
  routeIssues: string[] = [],
  now = Date.now(),
): MonitorOperationalEvaluation {
  const issues: string[] = [];
  const runIsActive = !TERMINAL_RUN_STATUSES.has(snapshot.runStatus);
  const lockExpiresAt = databaseTimestamp(snapshot.lockExpiresAt);
  const oldestActiveUpdatedAt = databaseTimestamp(snapshot.oldestActiveUpdatedAt);
  const qualityQueue = monitorQualityQueueHealth(snapshot, now);

  if (snapshot.schedulerGapMinutes > 25 || snapshot.schedulerHealthStatus.startsWith("recovered_")) {
    issues.push("scheduler_heartbeat_gap");
  }
  if (snapshot.activeJobCount > 1) issues.push("duplicate_active_jobs");
  if (
    (snapshot.runActiveJobId && snapshot.boundActiveJobCount === 0)
    || (!snapshot.runActiveJobId && snapshot.activeJobCount > 0)
  ) issues.push("active_job_mismatch");
  if (runIsActive && snapshot.activeJobCount === 0) issues.push("active_run_without_job");
  if (snapshot.activeJobCount > 0 && (
    (Number.isFinite(lockExpiresAt) && lockExpiresAt <= now)
    || (Number.isFinite(oldestActiveUpdatedAt) && now - oldestActiveUpdatedAt > ACTIVE_JOB_STALE_MS)
  )) issues.push("stalled_scan_lease");
  if ((runIsActive || snapshot.runStatus === "error")
    && (snapshot.latestRetryCount >= 3 || snapshot.consecutiveFailureCount >= 3)) {
    issues.push("retry_not_converging");
  }
  if (snapshot.recentSourceFailureCount >= 2) issues.push("source_health_degraded");
  if (qualityQueue.status === "stalled") issues.push("quality_queue_stalled");
  issues.push(...routeIssues);

  const deduplicated = uniqueIssues(issues);
  const criticalIssues = deduplicated.filter((issue) => CRITICAL_ISSUES.has(issue));
  return {
    outcome: criticalIssues.length ? "failed" : deduplicated.length ? "degraded" : "success",
    issues: deduplicated,
    criticalIssues,
    qualityQueue,
  };
}

function previousIssues(metadataJson: string | null | undefined) {
  if (!metadataJson) return [];
  try {
    const metadata = JSON.parse(metadataJson) as { issues?: unknown };
    return Array.isArray(metadata.issues)
      ? metadata.issues.filter((issue): issue is string => typeof issue === "string")
      : [];
  } catch {
    return [];
  }
}

export async function recordMonitorOperationalSentinel(
  database: D1Database,
  spaceId: string,
  routeSentinel: RouteSentinelSignal | null,
  now = new Date(),
) {
  const activeQualitySupply = activeResearchRouteSupplyPredicate("quality_paper");
  const [row, recentFailures, sourceHealth, previous] = await Promise.all([
    database.prepare(
      `WITH pending_quality AS (
       SELECT quality_paper.space_id, COUNT(*) AS pending_count,
        MIN(quality_paper.discovered_at) AS oldest_pending_at
       FROM monitored_papers quality_paper
       JOIN paper_insights quality_insight ON quality_insight.paper_id = quality_paper.id
       WHERE quality_paper.space_id = ? AND COALESCE(quality_insight.ever_recommended, 0) = 0
        AND (quality_insight.analysis_model = ''
         OR quality_insight.analysis_source IN ('deepseek_screened', 'deepseek_verification_pending')
         OR (quality_insight.analysis_source = 'deepseek_rejected' AND quality_insight.verification_status = 'degraded'
          AND (lower(quality_insight.screening_reason) LIKE '%timeout%'
           OR lower(quality_insight.screening_reason) LIKE '%aborted%'
           OR lower(quality_insight.screening_reason) LIKE '%temporarily unavailable%')))
        AND NOT EXISTS (
         SELECT 1 FROM paper_feedback suppressed
         WHERE suppressed.space_id = quality_paper.space_id AND suppressed.paper_id = quality_paper.id
          AND suppressed.feedback = 'not_relevant'
        )
        AND ${activeQualitySupply}
       GROUP BY quality_paper.space_id
      )
       SELECT run.status AS run_status, run.active_job_id, run.lock_expires_at,
       run.updated_at AS run_updated_at,
       run.next_run_at AS quality_next_run_at, run.automation_pause_reason,
       COALESCE(pending_quality.pending_count, 0) AS pending_quality_queue_count,
       pending_quality.oldest_pending_at AS oldest_pending_quality_at,
       (SELECT tick.gap_minutes FROM monitor_scheduler_ticks tick
        ORDER BY datetime(tick.started_at) DESC, rowid DESC LIMIT 1) AS scheduler_gap_minutes,
       (SELECT tick.health_status FROM monitor_scheduler_ticks tick
        ORDER BY datetime(tick.started_at) DESC, rowid DESC LIMIT 1) AS scheduler_health_status,
       (SELECT COUNT(*) FROM monitor_scan_jobs job WHERE job.space_id = run.space_id
        AND job.status NOT IN ('ready', 'error')) AS active_job_count,
       (SELECT GROUP_CONCAT(job.id) FROM monitor_scan_jobs job WHERE job.space_id = run.space_id
        AND job.status NOT IN ('ready', 'error')) AS active_job_ids,
       (SELECT COUNT(*) FROM monitor_scan_jobs job WHERE job.space_id = run.space_id
        AND job.id = run.active_job_id AND job.status NOT IN ('ready', 'error')) AS bound_active_job_count,
       (SELECT MIN(job.updated_at) FROM monitor_scan_jobs job WHERE job.space_id = run.space_id
        AND job.status NOT IN ('ready', 'error')) AS oldest_active_updated_at,
       (SELECT COUNT(*) FROM monitor_scan_jobs job WHERE job.space_id = run.space_id
        AND job.status = 'error' AND job.checkpoint = 'retry_pending'
        AND job.next_retry_at IS NOT NULL AND datetime(job.next_retry_at) <= CURRENT_TIMESTAMP) AS retry_overdue_count,
       COALESCE((SELECT job.retry_count FROM monitor_scan_jobs job WHERE job.space_id = run.space_id
        AND job.status = 'error' AND job.checkpoint = 'retry_pending'
        AND datetime(job.updated_at) >= datetime('now', '-24 hours')
        ORDER BY datetime(job.updated_at) DESC, job.id DESC LIMIT 1), 0) AS latest_retry_count
       FROM monitor_runs run LEFT JOIN pending_quality ON pending_quality.space_id = run.space_id
       WHERE run.space_id = ? LIMIT 1`,
    ).bind(spaceId, spaceId).first<OperationalRow>(),
    database.prepare(
      `SELECT failure_kind, failure_source, retry_count FROM monitor_scan_jobs
       WHERE space_id = ? AND status = 'error' AND checkpoint = 'retry_pending' AND failure_kind <> ''
        AND datetime(updated_at) >= datetime('now', '-24 hours')
       ORDER BY datetime(updated_at) DESC, id DESC LIMIT 4`,
    ).bind(spaceId).all<FailureRow>(),
    database.prepare(
      `SELECT COUNT(*) AS failure_count, COUNT(DISTINCT source) AS source_count,
       GROUP_CONCAT(DISTINCT source) AS failed_sources
       FROM monitor_reliability_events WHERE space_id = ? AND kind = 'source_degraded'
        AND datetime(created_at) >= datetime('now', '-6 hours')`,
    ).bind(spaceId).first<{ failure_count: number; source_count: number; failed_sources: string | null }>(),
    database.prepare(
      `SELECT metadata_json FROM monitor_reliability_events
       WHERE space_id = ? AND kind = 'monitor_operational_sentinel'
       ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 1`,
    ).bind(spaceId).first<{ metadata_json: string }>(),
  ]);
  if (!row) return null;

  const failureRows = recentFailures.results || [];
  const latestFailure = failureRows[0];
  const snapshot: MonitorOperationalSnapshot = {
    runStatus: row.run_status || "idle",
    runActiveJobId: row.active_job_id || null,
    lockExpiresAt: row.lock_expires_at || null,
    runUpdatedAt: row.run_updated_at || null,
    schedulerGapMinutes: count(row.scheduler_gap_minutes),
    schedulerHealthStatus: row.scheduler_health_status || "healthy",
    activeJobCount: count(row.active_job_count),
    activeJobIds: (row.active_job_ids || "").split(",").filter(Boolean),
    boundActiveJobCount: count(row.bound_active_job_count),
    oldestActiveUpdatedAt: row.oldest_active_updated_at || null,
    retryOverdueCount: count(row.retry_overdue_count),
    latestRetryCount: count(row.latest_retry_count),
    consecutiveFailureCount: consecutiveMonitorFailureCount(failureRows),
    latestFailureKind: latestFailure?.failure_kind || "",
    latestFailureSource: latestFailure?.failure_source || "",
    recentSourceFailureCount: count(sourceHealth?.failure_count),
    recentSourceCount: count(sourceHealth?.source_count),
    recentFailedSources: (sourceHealth?.failed_sources || "").split(",").filter(Boolean),
    pendingQualityQueueCount: count(row.pending_quality_queue_count),
    oldestPendingQualityAt: row.oldest_pending_quality_at || null,
    qualityNextRunAt: row.quality_next_run_at || null,
    automationPauseReason: row.automation_pause_reason || "",
  };
  const routeIssues = routeSentinel?.issues || [];
  const evaluation = evaluateMonitorOperationalSentinel(snapshot, routeIssues, now.getTime());
  const priorIssues = previousIssues(previous?.metadata_json);
  const recoveredIssues = priorIssues.filter((issue) => !evaluation.issues.includes(issue));
  const bucket = now.getTime();
  const metadata = {
    snapshot,
    ...evaluation,
    recoveredIssues,
    routeSentinel: routeSentinel ? {
      outcome: routeSentinel.outcome || "unknown",
      issues: routeIssues,
      historyRegressions: routeSentinel.historyRegressions || [],
      snapshot: routeSentinel.snapshot || null,
    } : null,
  };
  const statements = evaluation.issues.map((issue) => database.prepare(
    `INSERT OR IGNORE INTO monitor_reliability_events
     (id, space_id, kind, stage, source, outcome, error_code, message, metadata_json, created_at)
     VALUES (?, ?, 'monitor_operational_alert', 'internal_sentinel', 'background-scheduler', ?, ?, ?, ?, ?)`,
  ).bind(
    monitorOperationalEventId(spaceId, `alert:${issue}`, bucket),
    spaceId,
    CRITICAL_ISSUES.has(issue) ? "failed" : "degraded",
    issue,
    `Monitor operational sentinel: ${issue}`,
    JSON.stringify({ issue, snapshot, routeIssues }),
    now.toISOString(),
  ));
  statements.push(...recoveredIssues.map((issue) => database.prepare(
    `INSERT OR IGNORE INTO monitor_reliability_events
     (id, space_id, kind, stage, source, outcome, error_code, message, metadata_json, created_at)
     VALUES (?, ?, 'monitor_operational_recovery', 'internal_sentinel', 'background-scheduler', 'success', ?, ?, ?, ?)`,
  ).bind(
    monitorOperationalEventId(spaceId, `recovery:${issue}`, bucket),
    spaceId,
    issue,
    `Monitor operational sentinel recovered: ${issue}`,
    JSON.stringify({ issue, snapshot }),
    now.toISOString(),
  )));
  statements.push(database.prepare(
    `INSERT INTO monitor_reliability_events
     (id, space_id, kind, stage, source, outcome, error_code, message, metadata_json, created_at)
     VALUES (?, ?, 'monitor_operational_sentinel', 'internal_sentinel', 'background-scheduler', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET outcome = excluded.outcome, error_code = excluded.error_code,
      message = excluded.message, metadata_json = excluded.metadata_json, created_at = excluded.created_at`,
  ).bind(
    monitorOperationalEventId(spaceId, "snapshot", bucket),
    spaceId,
    evaluation.outcome,
    evaluation.issues.join(","),
    evaluation.issues.length
      ? `Monitor operational sentinel: ${evaluation.issues.join(",")}`
      : "Monitor operational sentinel healthy",
    JSON.stringify(metadata),
    now.toISOString(),
  ));
  const results = await database.batch(statements);
  const alertResultCount = evaluation.issues.length + recoveredIssues.length;
  const emittedEventCount = results.slice(0, alertResultCount)
    .reduce((sum, result) => sum + count(result.meta?.changes), 0);
  return { snapshot, ...evaluation, recoveredIssues, emittedEventCount };
}
