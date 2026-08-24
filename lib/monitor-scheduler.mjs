export const MONITOR_SCHEDULER_BUCKET_MS = 10 * 60 * 1000;

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
