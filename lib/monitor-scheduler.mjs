export const MONITOR_SCHEDULER_BUCKET_MS = 10 * 60 * 1000;

// Count acquired visits, not wall-clock buckets: irregular wakeups must not
// repeatedly pick the same lane. The current tick is already durable here.
export const VISIT_SCHEDULER_ORDINAL_SQL = `SELECT COUNT(*) AS count
 FROM monitor_scheduler_ticks WHERE trigger_source = 'visit_backstop'`;

export function visitSchedulerTaskOrder(acquiredVisitCount) {
  const lanes = ["gapDiscovery", "gapRecovery", "routeIntelligence", "routeEvolution", "routeRetry", "monitor"];
  const count = Number(acquiredVisitCount);
  const start = Number.isSafeInteger(count) && count > 0 ? (count - 1) % lanes.length : 0;
  return [...lanes.slice(start), ...lanes.slice(0, start)];
}

export const SCHEDULED_MONITOR_SPACE_SQL = `SELECT s.id, s.owner_user_id FROM research_spaces s
 JOIN monitor_runs r ON r.space_id = s.id
 WHERE s.owner_user_id LIKE 'anonymous:%' AND r.automation_paused_at IS NULL AND (
   (r.status IN ('ready', 'error', 'idle') AND (r.next_run_at IS NULL OR datetime(r.next_run_at) <= CURRENT_TIMESTAMP))
   OR (r.status NOT IN ('ready', 'error', 'idle')
    AND (r.next_run_at IS NULL OR datetime(r.next_run_at) <= CURRENT_TIMESTAMP)
    AND (r.lock_expires_at IS NULL OR datetime(r.lock_expires_at) <= CURRENT_TIMESTAMP))
 )
 ORDER BY CASE WHEN r.status NOT IN ('ready', 'error', 'idle') THEN 0 ELSE 1 END,
  CASE WHEN r.status NOT IN ('ready', 'error', 'idle')
   THEN COALESCE(datetime(r.next_run_at), datetime(r.last_run_at), datetime(r.updated_at)) END ASC,
  CASE WHEN r.last_user_activity_at IS NULL THEN 1 ELSE 0 END,
  datetime(r.last_user_activity_at) DESC,
  COALESCE(datetime(r.next_run_at), datetime(r.last_run_at), datetime(r.updated_at)) ASC LIMIT ?`;

export const SCHEDULED_MONITOR_RECOVERY_SPACE_SQL = `SELECT s.id, s.owner_user_id FROM research_spaces s
 JOIN monitor_runs r ON r.space_id = s.id
 JOIN monitor_scan_jobs j ON j.id = r.active_job_id AND j.space_id = s.id
 WHERE s.owner_user_id LIKE 'anonymous:%' AND r.automation_paused_at IS NULL
  AND r.status NOT IN ('ready', 'error', 'idle') AND j.status NOT IN ('ready', 'error')
  AND datetime(j.updated_at) <= datetime('now', '-20 minutes')
  AND (r.lock_expires_at IS NULL OR datetime(r.lock_expires_at) <= CURRENT_TIMESTAMP)
  AND (j.advance_lock_expires_at IS NULL OR datetime(j.advance_lock_expires_at) <= CURRENT_TIMESTAMP)
 ORDER BY datetime(j.updated_at) ASC, j.id ASC LIMIT 1`;

// An unresolved critical incident needs a repair slot of its own. Otherwise a
// healthy but more recently visited space can repeatedly win the normal due
// slot while the sentinel keeps reporting an older workspace that never gets
// a chance to recover.
export const SCHEDULED_MONITOR_INCIDENT_SPACE_SQL = `SELECT s.id, s.owner_user_id FROM research_spaces s
 JOIN monitor_runs r ON r.space_id = s.id
 JOIN monitor_reliability_events alert ON alert.space_id = s.id
 WHERE s.owner_user_id LIKE 'anonymous:%' AND r.automation_paused_at IS NULL
  AND alert.kind = 'monitor_operational_alert' AND alert.outcome = 'failed'
  AND alert.error_code <> '' AND datetime(alert.created_at) >= datetime('now', '-24 hours')
  AND NOT EXISTS (
   SELECT 1 FROM monitor_reliability_events recovery
   WHERE recovery.kind = 'monitor_operational_recovery'
    AND recovery.space_id = alert.space_id AND recovery.error_code = alert.error_code
    AND datetime(recovery.created_at) >= datetime(alert.created_at)
  )
  AND (
   (r.status IN ('ready', 'error', 'idle')
    AND (r.next_run_at IS NULL OR datetime(r.next_run_at) <= CURRENT_TIMESTAMP))
   OR (r.status NOT IN ('ready', 'error', 'idle')
    AND (r.next_run_at IS NULL OR datetime(r.next_run_at) <= CURRENT_TIMESTAMP)
    AND (r.lock_expires_at IS NULL OR datetime(r.lock_expires_at) <= CURRENT_TIMESTAMP))
  )
 GROUP BY s.id, s.owner_user_id
 ORDER BY MIN(datetime(alert.created_at)) ASC LIMIT 1`;

export function mergeScheduledMonitorSpaces(dueSpaces = [], recoverySpace = null) {
  const merged = [];
  const seen = new Set();
  for (const space of [recoverySpace, ...dueSpaces]) {
    if (!space?.id || seen.has(space.id)) continue;
    seen.add(space.id);
    merged.push(space);
  }
  return merged;
}

// A durable recoverable error must not age out with the 24-hour alert window.
// This uses the existing incident slot only when no recent incident owns it.
export const SCHEDULED_MONITOR_ERROR_SPACE_SQL = `SELECT s.id, s.owner_user_id
 FROM research_spaces s JOIN monitor_runs r ON r.space_id = s.id
 LEFT JOIN monitor_reliability_events attempt ON attempt.space_id = s.id
  AND attempt.kind = 'monitor_error_recovery_attempt'
 WHERE s.owner_user_id LIKE 'anonymous:%' AND r.automation_paused_at IS NULL
  AND r.status = 'error' AND r.error = 'stale_scheduler_recovery'
  AND r.active_job_id IS NULL
  AND datetime(r.last_user_activity_at) > datetime('now', '-7 days')
  AND (r.next_run_at IS NULL OR datetime(r.next_run_at) <= CURRENT_TIMESTAMP)
  AND (r.lock_expires_at IS NULL OR datetime(r.lock_expires_at) <= CURRENT_TIMESTAMP)
 GROUP BY s.id, s.owner_user_id
 ORDER BY MAX(datetime(attempt.created_at)) IS NOT NULL,
  MAX(datetime(attempt.created_at)) ASC, datetime(r.updated_at) ASC, s.id ASC LIMIT 1`;

export const RECORD_MONITOR_ERROR_ATTEMPT_SQL = `INSERT OR IGNORE INTO monitor_reliability_events
 (id, space_id, kind, stage, source, outcome, message)
 VALUES (?, ?, 'monitor_error_recovery_attempt', 'scheduled', 'background-scheduler', 'info',
  'Attempting saved-error recovery; this is not a recovery success')`;

// Allowlist telemetry rather than serializing a response containing lease data.
export function scheduledMonitorProgressSnapshot(job) {
  if (!job || typeof job.id !== 'string') return null;
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return {
    jobId: job.id,
    checkpoint: typeof job.checkpoint === 'string' ? job.checkpoint : null,
    discoveredCount: count(job.discoveredCount),
    reviewedCount: count(job.reviewedCount),
    recommendedCount: count(job.recommendedCount),
  };
}

export function monitorSchedulerBucketId(now = Date.now()) {
  const timestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return `monitor-scheduler:${Math.floor(timestamp / MONITOR_SCHEDULER_BUCKET_MS)}`;
}

export function shouldWakeMonitorScheduler(method, pathname) {
  return String(method || "GET").toUpperCase() === "GET"
    && ["/", "/api/spaces"].includes(String(pathname || ""));
}

export function monitorSchedulerSecretMatches(authorization, expectedSecret) {
  const expected = String(expectedSecret || "").trim();
  const supplied = String(authorization || "").startsWith("Bearer ")
    ? String(authorization).slice("Bearer ".length).trim()
    : "";
  if (!expected || !supplied) return false;
  const length = Math.max(expected.length, supplied.length);
  let mismatch = expected.length ^ supplied.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (expected.charCodeAt(index) || 0) ^ (supplied.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}
