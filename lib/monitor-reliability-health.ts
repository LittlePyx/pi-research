export const RELIABILITY_LOOKBACK_HOURS = 24;
export const RELIABILITY_PERSISTENCE_MINUTES = 60;
export const RELIABILITY_ACTIVE_WINDOW_MINUTES = 90;
const SCHEDULER_COMPLETED_FRESH_MINUTES = 45;
const SCHEDULER_ACTIVE_FRESH_MINUTES = 15;

type IncidentRow = {
  error_code: string;
  outcome: string;
  active_space_count: number;
  persistent_space_count: number;
  first_seen_at: string;
  last_seen_at: string;
  alert_bucket_count: number;
};

type SchedulerRow = {
  tick_count: number;
  failed_tick_count: number;
  recovered_tick_count: number;
  max_gap_minutes: number;
  latest_started_at: string | null;
  latest_completed_at: string | null;
  latest_health_status: string | null;
  latest_failed_count: number;
  recovery_count_24h: number;
};

function count(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function databaseTimestamp(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return Date.parse(normalized);
}

function freshWithin(value: string | null | undefined, now: number, minutes: number) {
  const timestamp = databaseTimestamp(value);
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= minutes * 60 * 1000;
}

export function buildMonitorReliabilityHealth(
  incidentRows: IncidentRow[],
  schedulerRow: SchedulerRow | null,
  now = new Date(),
) {
  const incidents = incidentRows.map((row) => ({
    code: row.error_code || "unknown",
    severity: row.outcome === "failed" ? "critical" as const : "degraded" as const,
    affectedSpaceCount: count(row.active_space_count),
    persistentSpaceCount: count(row.persistent_space_count),
    firstSeenAt: row.first_seen_at || null,
    lastSeenAt: row.last_seen_at || null,
    alertBucketCount: count(row.alert_bucket_count),
  }));
  const currentCriticalCount = incidents
    .filter((incident) => incident.severity === "critical")
    .reduce((sum, incident) => sum + incident.affectedSpaceCount, 0);
  const persistentCriticalCount = incidents
    .filter((incident) => incident.severity === "critical")
    .reduce((sum, incident) => sum + incident.persistentSpaceCount, 0);
  const currentDegradedCount = incidents
    .filter((incident) => incident.severity === "degraded")
    .reduce((sum, incident) => sum + incident.affectedSpaceCount, 0);
  const nowMs = now.getTime();
  const latestCompletedFresh = freshWithin(
    schedulerRow?.latest_completed_at,
    nowMs,
    SCHEDULER_COMPLETED_FRESH_MINUTES,
  );
  const latestTickRunning = !schedulerRow?.latest_completed_at && freshWithin(
    schedulerRow?.latest_started_at,
    nowMs,
    SCHEDULER_ACTIVE_FRESH_MINUTES,
  );
  const schedulerFresh = latestCompletedFresh || latestTickRunning;
  const blockingReasons = [
    ...(!schedulerFresh ? ["scheduler_heartbeat_stale"] : []),
    ...(persistentCriticalCount > 0 ? ["persistent_critical_incident"] : []),
  ];
  const status = blockingReasons.length ? "critical"
    : currentCriticalCount > 0 ? "observing"
    : currentDegradedCount > 0 ? "degraded"
    : "healthy";

  return {
    healthy: blockingReasons.length === 0,
    status,
    generatedAt: now.toISOString(),
    thresholds: {
      lookbackHours: RELIABILITY_LOOKBACK_HOURS,
      persistenceMinutes: RELIABILITY_PERSISTENCE_MINUTES,
      activeWindowMinutes: RELIABILITY_ACTIVE_WINDOW_MINUTES,
      schedulerCompletedFreshMinutes: SCHEDULER_COMPLETED_FRESH_MINUTES,
      schedulerActiveFreshMinutes: SCHEDULER_ACTIVE_FRESH_MINUTES,
    },
    currentCriticalCount,
    persistentCriticalCount,
    currentDegradedCount,
    recoveredCount24h: count(schedulerRow?.recovery_count_24h),
    blockingReasons,
    incidents,
    scheduler: {
      fresh: schedulerFresh,
      tickCount24h: count(schedulerRow?.tick_count),
      failedTickCount24h: count(schedulerRow?.failed_tick_count),
      recoveredTickCount24h: count(schedulerRow?.recovered_tick_count),
      maxGapMinutes24h: count(schedulerRow?.max_gap_minutes),
      latestStartedAt: schedulerRow?.latest_started_at || null,
      latestCompletedAt: schedulerRow?.latest_completed_at || null,
      latestHealthStatus: schedulerRow?.latest_health_status || "missing",
      latestFailedCount: count(schedulerRow?.latest_failed_count),
    },
  };
}

export async function readMonitorReliabilityHealth(database: D1Database, now = new Date()) {
  const reference = now.toISOString();
  const [incidentRows, schedulerRow] = await Promise.all([
    database.prepare(
      `WITH params AS (SELECT datetime(?) AS now),
       latest_recoveries AS (
        SELECT recovery.space_id, recovery.error_code, MAX(datetime(recovery.created_at)) AS recovered_at
        FROM monitor_reliability_events recovery, params
        WHERE recovery.kind = 'monitor_operational_recovery'
         AND datetime(recovery.created_at) >= datetime(params.now, '-24 hours')
        GROUP BY recovery.space_id, recovery.error_code
       ), unresolved_alerts AS (
        SELECT alert.space_id, alert.error_code, alert.outcome, datetime(alert.created_at) AS created_at
        FROM monitor_reliability_events alert
        LEFT JOIN latest_recoveries recovery ON recovery.space_id = alert.space_id
         AND recovery.error_code = alert.error_code
        CROSS JOIN params
        WHERE alert.kind = 'monitor_operational_alert' AND alert.error_code <> ''
         AND datetime(alert.created_at) >= datetime(params.now, '-24 hours')
         AND (recovery.recovered_at IS NULL OR datetime(alert.created_at) > recovery.recovered_at)
       ), space_incidents AS (
        SELECT space_id, error_code, outcome, MIN(created_at) AS first_seen_at,
         MAX(created_at) AS last_seen_at,
         COUNT(DISTINCT strftime('%Y-%m-%dT%H', created_at)) AS alert_bucket_count
        FROM unresolved_alerts GROUP BY space_id, error_code, outcome
       )
       SELECT incident.error_code, incident.outcome,
        SUM(CASE WHEN datetime(incident.last_seen_at) >= datetime(params.now, '-90 minutes') THEN 1 ELSE 0 END) AS active_space_count,
        SUM(CASE WHEN datetime(incident.first_seen_at) <= datetime(params.now, '-60 minutes')
          AND datetime(incident.last_seen_at) >= datetime(params.now, '-90 minutes')
          AND incident.alert_bucket_count >= 2 THEN 1 ELSE 0 END) AS persistent_space_count,
        MIN(incident.first_seen_at) AS first_seen_at, MAX(incident.last_seen_at) AS last_seen_at,
        SUM(incident.alert_bucket_count) AS alert_bucket_count
       FROM space_incidents incident CROSS JOIN params
       GROUP BY incident.error_code, incident.outcome
       HAVING SUM(CASE WHEN datetime(incident.last_seen_at) >= datetime(params.now, '-90 minutes') THEN 1 ELSE 0 END) > 0
       ORDER BY persistent_space_count DESC,
        CASE WHEN incident.outcome = 'failed' THEN 0 ELSE 1 END,
        incident.error_code`,
    ).bind(reference).all<IncidentRow>(),
    database.prepare(
      `WITH params AS (SELECT datetime(?) AS now), recent_ticks AS (
        SELECT * FROM monitor_scheduler_ticks, params
        WHERE datetime(started_at) >= datetime(params.now, '-24 hours')
       )
       SELECT COUNT(*) AS tick_count,
        COALESCE(SUM(CASE WHEN failed_count > 0 THEN 1 ELSE 0 END), 0) AS failed_tick_count,
        COALESCE(SUM(CASE WHEN health_status LIKE 'recovered_%' THEN 1 ELSE 0 END), 0) AS recovered_tick_count,
        COALESCE(MAX(gap_minutes), 0) AS max_gap_minutes,
        (SELECT started_at FROM monitor_scheduler_ticks ORDER BY datetime(started_at) DESC, rowid DESC LIMIT 1) AS latest_started_at,
        (SELECT completed_at FROM monitor_scheduler_ticks ORDER BY datetime(started_at) DESC, rowid DESC LIMIT 1) AS latest_completed_at,
        (SELECT health_status FROM monitor_scheduler_ticks ORDER BY datetime(started_at) DESC, rowid DESC LIMIT 1) AS latest_health_status,
        COALESCE((SELECT failed_count FROM monitor_scheduler_ticks ORDER BY datetime(started_at) DESC, rowid DESC LIMIT 1), 0) AS latest_failed_count,
        (SELECT COUNT(*) FROM monitor_reliability_events recovery, params
         WHERE recovery.kind = 'monitor_operational_recovery'
          AND datetime(recovery.created_at) >= datetime(params.now, '-24 hours')) AS recovery_count_24h
       FROM recent_ticks`,
    ).bind(reference).first<SchedulerRow>(),
  ]);
  return buildMonitorReliabilityHealth(incidentRows.results || [], schedulerRow, now);
}
