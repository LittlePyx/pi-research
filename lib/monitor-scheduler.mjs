export const MONITOR_SCHEDULER_BUCKET_MS = 10 * 60 * 1000;

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
