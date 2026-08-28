export const MONITOR_FOLLOWER_RECLAIM_RETRY_MS = 15_000;

/**
 * A follower may safely ask the server to elect a new pipeline owner only
 * after the persisted run lease has expired. The server-side claim remains
 * authoritative, so concurrent tabs still converge on one owner.
 *
 * @param {{ status?: string, leaseExpiresAt?: string | null } | null | undefined} monitor
 * @param {{ now?: number, lastAttemptAt?: number, retryIntervalMs?: number }} [options]
 */
export function shouldReclaimMonitorLease(monitor, options = {}) {
  if (!monitor || ["ready", "error", "idle"].includes(monitor.status || "")) return false;
  const expiresAt = Date.parse(monitor.leaseExpiresAt || "");
  if (!Number.isFinite(expiresAt)) return false;
  const now = options.now ?? Date.now();
  const lastAttemptAt = options.lastAttemptAt ?? 0;
  const retryIntervalMs = options.retryIntervalMs ?? MONITOR_FOLLOWER_RECLAIM_RETRY_MS;
  return expiresAt <= now && now - lastAttemptAt >= retryIntervalMs;
}
