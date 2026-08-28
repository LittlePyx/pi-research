import { modelFailureCode } from "./monitor-fault-policy.mjs";

export const MONITOR_START_IDEMPOTENCY_BUCKET_MS = 10 * 60 * 1000;
export const MONITOR_RUN_LEASE_MS = 75_000;
export const MONITOR_ADVANCE_LEASE_MS = 75_000;
export const MONITOR_LEASE_HEARTBEAT_MS = 20_000;

export const MONITOR_RUN_HEARTBEAT_SQL = `
UPDATE monitor_runs SET lock_expires_at = ?
WHERE space_id = ? AND active_job_id = ? AND lock_token = ? AND lease_generation = ?
 AND status NOT IN ('ready', 'error', 'idle')`;

export const MONITOR_ADVANCE_HEARTBEAT_SQL = `
UPDATE monitor_scan_jobs SET advance_lock_expires_at = ?
WHERE id = ? AND space_id = ? AND advance_lock_token = ?
 AND status NOT IN ('ready', 'error')`;

export function monitorLeaseExpiry(now = Date.now(), leaseMs = MONITOR_RUN_LEASE_MS) {
  return new Date(now + leaseMs).toISOString();
}

export function monitorLeaseCredentialsMatch(run, input, now = Date.now()) {
  if (!run || !input?.jobId || !input?.leaseToken || !Number.isInteger(input?.leaseGeneration)) return false;
  const expiresAt = Date.parse(run.lock_expires_at || "");
  return run.active_job_id === input.jobId
    && run.lock_token === input.leaseToken
    && Number(run.lease_generation) === input.leaseGeneration
    && Number.isFinite(expiresAt)
    && expiresAt > now;
}

const DURABLE_DISCOVERY_CHECKPOINTS = new Set([
  "discovering_days",
  "discovering_months",
  "discovering_years",
]);

export function durableMonitorCheckpoint(status, checkpoint) {
  if (DURABLE_DISCOVERY_CHECKPOINTS.has(status) && !DURABLE_DISCOVERY_CHECKPOINTS.has(checkpoint)) return status;
  return checkpoint;
}

export const MONITOR_NEW_RUN_CLAIM_SQL = `
UPDATE monitor_runs SET status = ?, next_run_at = CURRENT_TIMESTAMP,
 lock_token = ?, lock_expires_at = ?, active_job_id = ?, lease_generation = lease_generation + 1,
 last_trigger = ?, error = NULL, new_count = ?, scanned_count = ?,
 scheduled_runs_since_activity = scheduled_runs_since_activity + ?,
 automation_paused_at = NULL, automation_pause_reason = '', updated_at = CURRENT_TIMESTAMP
WHERE space_id = ?
 AND (lock_token IS NULL OR lock_expires_at IS NULL OR datetime(lock_expires_at) <= CURRENT_TIMESTAMP)
 AND NOT EXISTS (
  SELECT 1 FROM monitor_scan_jobs active_job
  WHERE active_job.space_id = monitor_runs.space_id
   AND active_job.status NOT IN ('ready', 'error')
 )`;

export const MONITOR_RESUME_RUN_CLAIM_SQL = `
UPDATE monitor_runs SET lock_token = ?, lock_expires_at = ?, active_job_id = ?,
 status = COALESCE((SELECT status FROM monitor_scan_jobs WHERE id = ?), status),
 lease_generation = lease_generation + 1, error = NULL, updated_at = CURRENT_TIMESTAMP
WHERE space_id = ?
 AND (lock_token IS NULL OR lock_expires_at IS NULL OR datetime(lock_expires_at) <= CURRENT_TIMESTAMP)`;

export function monitorStartRequestKey({ spaceId, trigger, now = Date.now(), resumeOfJobId = "" }) {
  const scope = resumeOfJobId ? `resume:${resumeOfJobId}` : `bucket:${Math.floor(now / MONITOR_START_IDEMPOTENCY_BUCKET_MS)}`;
  return `monitor:${spaceId}:${trigger}:${scope}`;
}

/**
 * Background automation can be deferred to protect unattended spend without
 * preventing an active researcher from starting a manual scan. Only an
 * explicit, timed manual cooldown blocks that action.
 */
export function shouldBlockManualMonitorStart(monitor) {
  if (!monitor?.throttled || monitor?.automationDeferred || monitor?.scanJob?.needsRefresh) return false;
  return Number(monitor?.retryAfterMinutes) > 0;
}

const RETRY_POLICIES = {
  timeout: { baseMs: 10 * 60 * 1000, maxMs: 60 * 60 * 1000 },
  rate_limited: { baseMs: 30 * 60 * 1000, maxMs: 4 * 60 * 60 * 1000 },
  upstream_unavailable: { baseMs: 15 * 60 * 1000, maxMs: 2 * 60 * 60 * 1000 },
  invalid_model_output: { baseMs: 10 * 60 * 1000, maxMs: 60 * 60 * 1000 },
  stage_failed: { baseMs: 15 * 60 * 1000, maxMs: 2 * 60 * 60 * 1000 },
};

export function monitorRetryDecision(error, retryCount = 0, now = Date.now()) {
  const errorCode = modelFailureCode(error);
  if (["invalid_credential", "insufficient_balance"].includes(errorCode)) {
    return { errorCode, retryable: false, retryCount: Math.max(0, retryCount), delayMs: 0, nextRetryAt: null };
  }
  const policy = RETRY_POLICIES[errorCode] || RETRY_POLICIES.stage_failed;
  const nextRetryCount = Math.max(0, retryCount) + 1;
  const delayMs = Math.min(policy.maxMs, policy.baseMs * (2 ** Math.min(4, nextRetryCount - 1)));
  return {
    errorCode,
    retryable: true,
    retryCount: nextRetryCount,
    delayMs,
    nextRetryAt: new Date(now + delayMs).toISOString(),
  };
}
