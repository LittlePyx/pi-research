/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  MONITOR_SCHEDULER_BUCKET_MS,
  monitorSchedulerBucketId,
  monitorSchedulerSecretMatches,
  shouldWakeMonitorScheduler,
} from "../lib/monitor-scheduler.mjs";
import { recordMonitorOperationalSentinel } from "../lib/monitor-operational-sentinel";
import { readMonitorReliabilityHealth } from "../lib/monitor-reliability-health";
import { recordResearchRouteSentinel } from "../lib/research-route-sentinel";
import { scheduledResearchRouteRetrySql } from "../lib/research-map-reliability";
import { SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL } from "../lib/research-map-intelligence";
import { SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL } from "../lib/research-route-evolution";
import { developmentUnboundedEnabled } from "../lib/development-policy.mjs";
import {
  claimResearchGapDiscovery,
  completeResearchGapDiscovery,
  materializeStoredDirectionGapDiscovery,
  supersedeResearchGapDiscovery,
} from "../lib/research-gap-discovery";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  PI_DEVELOPMENT_UNBOUNDED?: string;
  MONITOR_SCHEDULER_SECRET?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type SchedulerTrigger = "cloudflare_cron" | "external_watchdog" | "visit_backstop";

const SCHEDULED_SPACE_BATCH_SIZE = 1;
const SCHEDULED_ADVANCE_STEPS = 1;
const SCHEDULED_ROUTE_RETRY_BATCH_SIZE = 1;
const SCHEDULED_ROUTE_INTELLIGENCE_BATCH_SIZE = 1;
const SCHEDULED_ROUTE_EVOLUTION_BATCH_SIZE = 1;
const SCHEDULER_LEASE_MS = MONITOR_SCHEDULER_BUCKET_MS - 60_000;
const HARD_STALE_JOB_HOURS = 6;
const VISIT_BACKSTOP_GAP_MS = 25 * 60 * 1000;

async function reconcileExpiredSchedulerTicks(env: Env) {
  await env.DB.prepare(
    `UPDATE monitor_scheduler_ticks SET
      completed_at = COALESCE(lease_expires_at, started_at),
      lease_token = NULL,
      lease_expires_at = NULL,
      failed_count = CASE WHEN failed_count > 0 THEN failed_count ELSE 1 END,
      error = CASE WHEN error = '' THEN 'scheduler_lease_expired' ELSE error END,
      health_status = 'recovered_timeout'
     WHERE completed_at IS NULL
      AND lease_expires_at IS NOT NULL
      AND datetime(lease_expires_at) <= CURRENT_TIMESTAMP`,
  ).run();
}

async function visitBackstopIsDue(env: Env) {
  const last = await env.DB.prepare(
    `SELECT completed_at FROM monitor_scheduler_ticks
     WHERE completed_at IS NOT NULL ORDER BY datetime(completed_at) DESC LIMIT 1`,
  ).first<{ completed_at: string | null }>();
  const completedAt = last?.completed_at ? Date.parse(last.completed_at) : 0;
  return !completedAt || Date.now() - completedAt >= VISIT_BACKSTOP_GAP_MS;
}

async function acquireSchedulerLease(env: Env, trigger: SchedulerTrigger) {
  const now = new Date();
  const tickId = monitorSchedulerBucketId(now.getTime());
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + SCHEDULER_LEASE_MS).toISOString();
  const previousTick = await env.DB.prepare(
    `SELECT completed_at AS heartbeat_at FROM monitor_scheduler_ticks
     WHERE id != ? AND completed_at IS NOT NULL ORDER BY datetime(completed_at) DESC LIMIT 1`,
  ).bind(tickId).first<{ heartbeat_at: string | null }>();
  const previousHeartbeatAt = previousTick?.heartbeat_at || null;
  const previousHeartbeatMs = previousHeartbeatAt ? Date.parse(previousHeartbeatAt) : 0;
  const gapMinutes = previousHeartbeatMs ? Math.max(0, Math.floor((now.getTime() - previousHeartbeatMs) / 60_000)) : 0;
  const healthStatus = gapMinutes > 25 ? "recovered_gap" : "healthy";
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO monitor_scheduler_ticks
     (id, started_at, due_space_count, started_count, advanced_count, completed_count, paused_count,
      failed_count, trigger_source, lease_token, lease_expires_at, recovered_job_count,
      previous_tick_at, gap_minutes, health_status)
     VALUES (?, ?, 0, 0, 0, 0, 0, 0, ?, ?, ?, 0, ?, ?, ?)`,
  ).bind(tickId, now.toISOString(), trigger, leaseToken, leaseExpiresAt,
    previousHeartbeatAt, gapMinutes, healthStatus).run();
  if (Number(inserted.meta?.changes || 0)) return { acquired: true as const, tickId, leaseToken };

  const recovered = await env.DB.prepare(
    `UPDATE monitor_scheduler_ticks SET started_at = ?, completed_at = NULL, trigger_source = ?,
      lease_token = ?, lease_expires_at = ?, due_space_count = 0, started_count = 0, advanced_count = 0,
      completed_count = 0, paused_count = 0, failed_count = 0, recovered_job_count = 0,
      previous_tick_at = ?, gap_minutes = ?, health_status = ?, error = ''
     WHERE id = ? AND completed_at IS NULL
      AND (lease_token IS NULL OR lease_expires_at IS NULL OR datetime(lease_expires_at) <= CURRENT_TIMESTAMP)`,
  ).bind(now.toISOString(), trigger, leaseToken, leaseExpiresAt,
    previousHeartbeatAt, gapMinutes, healthStatus, tickId).run();
  return {
    acquired: Boolean(Number(recovered.meta?.changes || 0)),
    tickId,
    leaseToken,
  };
}

async function recoverStaleMonitorJobs(env: Env) {
  let recoveredJobCount = 0;
  const hardStale = await env.DB.prepare(
    `SELECT j.id AS job_id, j.space_id FROM monitor_scan_jobs j
     JOIN monitor_runs r ON r.space_id = j.space_id
     WHERE j.status NOT IN ('ready', 'error')
      AND (r.active_job_id IS NULL OR r.active_job_id = j.id)
      AND datetime(j.updated_at) <= datetime('now', ?)
      AND (r.lock_expires_at IS NULL OR datetime(r.lock_expires_at) <= CURRENT_TIMESTAMP)
     ORDER BY j.updated_at ASC LIMIT 8`,
  ).bind(`-${HARD_STALE_JOB_HOURS} hours`).all<{ job_id: string; space_id: string }>();

  for (const stale of hardStale.results) {
    const recoveredAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE monitor_scan_jobs SET status = 'error', checkpoint = 'retry_pending',
          current_source = '后台已回收长时间停滞任务，准备从保存点继续',
          failure_kind = 'stale_scheduler_recovery', failure_source = 'background-scheduler',
          retry_count = retry_count + 1, next_retry_at = CURRENT_TIMESTAMP,
          error = 'stale_scheduler_recovery', completed_at = COALESCE(completed_at, ?), updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status NOT IN ('ready', 'error')`,
      ).bind(recoveredAt, stale.job_id),
      env.DB.prepare(
        `UPDATE monitor_runs SET status = 'error', next_run_at = CURRENT_TIMESTAMP,
          lock_token = NULL, lock_expires_at = NULL, active_job_id = NULL,
          error = 'stale_scheduler_recovery', updated_at = CURRENT_TIMESTAMP
         WHERE space_id = ? AND (active_job_id IS NULL OR active_job_id = ?)`,
      ).bind(stale.space_id, stale.job_id),
    ]);
    recoveredJobCount += 1;
  }

  const releasedAdvances = await env.DB.prepare(
    `UPDATE monitor_scan_jobs SET advance_lock_token = NULL, advance_lock_expires_at = NULL
     WHERE advance_lock_token IS NOT NULL
      AND (advance_lock_expires_at IS NULL OR datetime(advance_lock_expires_at) <= CURRENT_TIMESTAMP)`,
  ).run();
  const resumedRuns = await env.DB.prepare(
    `UPDATE monitor_runs SET next_run_at = CURRENT_TIMESTAMP, lock_token = NULL, lock_expires_at = NULL,
      updated_at = CURRENT_TIMESTAMP
     WHERE status NOT IN ('ready', 'error', 'idle')
      AND datetime(updated_at) <= datetime('now', '-20 minutes')
      AND (lock_expires_at IS NULL OR datetime(lock_expires_at) <= CURRENT_TIMESTAMP)`,
  ).run();
  recoveredJobCount += Number(releasedAdvances.meta?.changes || 0) + Number(resumedRuns.meta?.changes || 0);
  return recoveredJobCount;
}

type ScheduledRouteRetryRow = {
  track_id: string;
  space_id: string;
  owner_user_id: string;
  build_attempt_count: number;
  recovery_from_shared_queue: number;
};

async function recordScheduledRouteRetryEvent(env: Env, row: ScheduledRouteRetryRow, outcome: "success" | "degraded" | "failed", metadata: Record<string, unknown>) {
  try {
    await env.DB.prepare(
      `INSERT INTO monitor_reliability_events
       (id, space_id, kind, stage, source, outcome, message, metadata_json)
       VALUES (?, ?, 'research_route_retry', 'scheduled', 'research-route', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), row.space_id, outcome, `Scheduled research route retry ${outcome}`,
      JSON.stringify({ trackId: row.track_id, attemptCountBefore: row.build_attempt_count, ...metadata }),
    ).run();
  } catch {
    // Retry telemetry must not prevent later scheduled work.
  }
}

async function runScheduledResearchRouteRetry(env: Env, ctx: ExecutionContext) {
  const due = await env.DB.prepare(scheduledResearchRouteRetrySql(developmentUnboundedEnabled(env.PI_DEVELOPMENT_UNBOUNDED)))
    .bind(SCHEDULED_ROUTE_RETRY_BATCH_SIZE).first<ScheduledRouteRetryRow>();
  if (!due) return { attempted: false as const, spaceId: null as string | null };

  const workspaceId = due.owner_user_id.startsWith("anonymous:") ? due.owner_user_id.slice("anonymous:".length) : "";
  if (!workspaceId) return { attempted: false as const, spaceId: due.space_id };
  const response = await handler.fetch(new Request("https://pi-research.internal/api/research-map", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `pi_anonymous_workspace=${workspaceId}`,
      "x-pi-scheduled-route-retry": "1",
    },
    body: JSON.stringify({
      spaceId: due.space_id,
      action: "hydrate",
      trackId: due.track_id,
      force: due.recovery_from_shared_queue === 1,
    }),
  }), env, ctx);
  const state = await response.json().catch(() => ({})) as {
    routeBuildStatus?: string | null;
    reviewQueuedCount?: number;
    discoveredRouteCandidateCount?: number;
    tracks?: Array<{ id?: string; buildStatus?: string; papers?: unknown[] }>;
  };
  const track = state.tracks?.find((item) => item.id === due.track_id);
  const buildStatus = state.routeBuildStatus || track?.buildStatus || "unknown";
  const outcome = response.ok && (buildStatus === "ready" || buildStatus === "partial") ? "success"
    : response.ok ? "degraded" : "failed";
  await recordScheduledRouteRetryEvent(env, due, outcome, {
    httpStatus: response.status,
    buildStatus,
    visiblePaperCount: track?.papers?.length || 0,
    discoveredCandidateCount: state.discoveredRouteCandidateCount || 0,
    queuedForReviewCount: state.reviewQueuedCount || 0,
    recoveryFromSharedQueue: due.recovery_from_shared_queue === 1,
  });
  return { attempted: true as const, spaceId: due.space_id, trackId: due.track_id, outcome, buildStatus };
}

type ScheduledRouteIntelligenceRow = {
  track_id: string;
  space_id: string;
  owner_user_id: string;
  intelligence_status: string;
  intelligence_attempt_count: number;
  refresh_requested: number;
};

async function recordScheduledRouteIntelligenceEvent(
  env: Env,
  row: ScheduledRouteIntelligenceRow,
  outcome: "success" | "degraded" | "failed" | "info",
  metadata: Record<string, unknown>,
) {
  try {
    await env.DB.prepare(
      `INSERT INTO monitor_reliability_events
       (id, space_id, kind, stage, source, outcome, message, metadata_json)
       VALUES (?, ?, 'research_route_intelligence', 'scheduled', 'research-route', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), row.space_id, outcome, `Scheduled research route intelligence ${outcome}`,
      JSON.stringify({
        trackId: row.track_id,
        statusBefore: row.intelligence_status,
        attemptCountBefore: row.intelligence_attempt_count,
        refreshRequested: row.refresh_requested === 1,
        ...metadata,
      }),
    ).run();
  } catch {
    // Intelligence telemetry must not prevent the durable job from retrying.
  }
}

async function runScheduledResearchRouteIntelligence(env: Env, ctx: ExecutionContext) {
  const due = await env.DB.prepare(SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL)
    .bind(SCHEDULED_ROUTE_INTELLIGENCE_BATCH_SIZE).first<ScheduledRouteIntelligenceRow>();
  if (!due) return { attempted: false as const, spaceId: null as string | null };

  const workspaceId = due.owner_user_id.startsWith("anonymous:") ? due.owner_user_id.slice("anonymous:".length) : "";
  if (!workspaceId) return { attempted: false as const, spaceId: due.space_id };
  const response = await handler.fetch(new Request("https://pi-research.internal/api/research-map", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `pi_anonymous_workspace=${workspaceId}`,
      "x-pi-scheduled-route-intelligence": "1",
    },
    body: JSON.stringify({
      spaceId: due.space_id,
      action: "advance-intelligence",
      trackId: due.track_id,
    }),
  }), env, ctx);
  const state = await response.json().catch(() => ({})) as {
    error?: string;
    intelligenceAdvance?: {
      status?: string;
      trackId?: string;
      retryAt?: string;
      errorCode?: string;
    };
  };
  const advance = state.intelligenceAdvance;
  const status = advance?.status || (response.ok ? "unknown" : "failed");
  const outcome = response.ok && status === "ready" ? "success"
    : response.ok && ["idle", "superseded"].includes(status) ? "info"
      : response.ok ? "degraded" : "failed";
  await recordScheduledRouteIntelligenceEvent(env, due, outcome, {
    httpStatus: response.status,
    status,
    retryAt: advance?.retryAt || null,
    errorCode: advance?.errorCode || state.error || null,
  });
  return {
    attempted: true as const,
    spaceId: due.space_id,
    trackId: due.track_id,
    outcome,
    status,
    retryAt: advance?.retryAt || null,
  };
}

type ScheduledRouteEvolutionRow = {
  track_id: string;
  space_id: string;
  owner_user_id: string;
  evidence_updated_at: string;
};

async function recordScheduledRouteEvolutionEvent(
  env: Env,
  row: ScheduledRouteEvolutionRow,
  outcome: "success" | "degraded" | "failed" | "info",
  metadata: Record<string, unknown>,
) {
  try {
    await env.DB.prepare(
      `INSERT INTO monitor_reliability_events
       (id, space_id, kind, stage, source, outcome, message, metadata_json)
       VALUES (?, ?, 'research_route_evolution', 'scheduled', 'research-route', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), row.space_id, outcome, `Scheduled research route evolution ${outcome}`,
      JSON.stringify({ trackId: row.track_id, evidenceUpdatedAt: row.evidence_updated_at, ...metadata }),
    ).run();
  } catch {
    // Proposal telemetry must not hide or mutate confirmed route evidence.
  }
}

async function runScheduledResearchRouteEvolution(env: Env, ctx: ExecutionContext) {
  const due = await env.DB.prepare(SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL)
    .bind(SCHEDULED_ROUTE_EVOLUTION_BATCH_SIZE).first<ScheduledRouteEvolutionRow>();
  if (!due) return { attempted: false as const, spaceId: null as string | null };

  const workspaceId = due.owner_user_id.startsWith("anonymous:") ? due.owner_user_id.slice("anonymous:".length) : "";
  if (!workspaceId) return { attempted: false as const, spaceId: due.space_id };
  const response = await handler.fetch(new Request("https://pi-research.internal/api/research-map", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `pi_anonymous_workspace=${workspaceId}`,
      "x-pi-scheduled-route-evolution": "1",
    },
    body: JSON.stringify({
      spaceId: due.space_id,
      action: "propose-evolution",
      trackId: due.track_id,
    }),
  }), env, ctx);
  const state = await response.json().catch(() => ({})) as {
    error?: string;
    routeEvolutionProposed?: boolean;
    routeEvolutionRevisionId?: string;
    cached?: boolean;
  };
  const noMaterialChange = response.status === 422;
  const outcome = response.ok && state.routeEvolutionProposed ? "success"
    : noMaterialChange ? "info" : response.ok ? "info" : "degraded";
  const status = response.ok && state.routeEvolutionProposed ? "proposed"
    : noMaterialChange ? "no_material_change" : "retryable";
  await recordScheduledRouteEvolutionEvent(env, due, outcome, {
    httpStatus: response.status,
    status,
    revisionId: state.routeEvolutionRevisionId || null,
    cached: state.cached === true,
    error: state.error || null,
  });
  return {
    attempted: true as const,
    spaceId: due.space_id,
    trackId: due.track_id,
    outcome,
    status,
    revisionId: state.routeEvolutionRevisionId || null,
  };
}

async function runScheduledResearchGapDiscovery(env: Env, ctx: ExecutionContext) {
  await materializeStoredDirectionGapDiscovery(env.DB);
  const unboundedRetries = developmentUnboundedEnabled(env.PI_DEVELOPMENT_UNBOUNDED);
  const claim = await claimResearchGapDiscovery(env.DB, new Date(), unboundedRetries);
  if (!claim) return { attempted: false as const, spaceId: null as string | null };
  const workspaceId = claim.ownerUserId.startsWith("anonymous:") ? claim.ownerUserId.slice("anonymous:".length) : "";
  if (!workspaceId) {
    const completion = await completeResearchGapDiscovery(env.DB, {
      id: claim.id,
      lockToken: claim.lockToken,
      degraded: true,
      queuedCount: 0,
      sourceStatuses: [],
      error: "workspace_identity_unavailable",
      unboundedRetries,
    });
    return { attempted: true as const, spaceId: claim.spaceId, trackId: claim.trackId, status: completion.status };
  }
  const response = await handler.fetch(new Request("https://pi-research.internal/api/research-map", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `pi_anonymous_workspace=${workspaceId}`,
      "x-pi-scheduled-gap-discovery": "1",
    },
    body: JSON.stringify({
      spaceId: claim.spaceId,
      trackId: claim.trackId,
      action: "expand-auto-gap",
      gapJobId: claim.id,
      gapJobToken: claim.lockToken,
    }),
  }), env, ctx);
  const state = await response.json().catch(() => ({})) as {
    error?: string;
    automaticGapSuperseded?: boolean;
    reviewQueuedCount?: number;
    discoveredRouteCandidateCount?: number;
    routeSourceStatuses?: Array<{ source?: string; status?: string; candidateCount?: number; error?: string }>;
  };
  if (state.automaticGapSuperseded) {
    await supersedeResearchGapDiscovery(env.DB, {
      id: claim.id,
      lockToken: claim.lockToken,
      error: state.error || "signal_superseded",
    });
    return {
      attempted: true as const,
      spaceId: claim.spaceId,
      trackId: claim.trackId,
      origin: claim.origin,
      status: "superseded" as const,
      queuedForReviewCount: 0,
      sourceDegraded: false,
    };
  }
  const sourceStatuses = state.routeSourceStatuses || [];
  const sourceDegraded = !response.ok || sourceStatuses.some((source) => source.status === "failed");
  const completion = await completeResearchGapDiscovery(env.DB, {
    id: claim.id,
    lockToken: claim.lockToken,
    degraded: sourceDegraded,
    queuedCount: state.reviewQueuedCount || 0,
    sourceStatuses,
    error: !response.ok ? state.error || `automatic_gap_http_${response.status}` : sourceDegraded ? "source_unavailable" : undefined,
    unboundedRetries,
  });
  try {
    await env.DB.prepare(
      `INSERT INTO monitor_reliability_events
       (id, space_id, kind, stage, source, outcome, message, metadata_json)
       VALUES (?, ?, 'research_gap_discovery', 'scheduled', ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), claim.spaceId, `research-route:${claim.origin}`,
      completion.status === "ready" ? "success" : completion.status === "retryable" ? "degraded" : "failed",
      `Automatic research gap discovery resolved ${completion.status}`,
      JSON.stringify({
        trackId: claim.trackId,
        origin: claim.origin,
        signalRevision: claim.signalRevision,
        attemptCount: claim.attemptCount,
        httpStatus: response.status,
        discoveredCandidateCount: state.discoveredRouteCandidateCount || 0,
        queuedForReviewCount: state.reviewQueuedCount || 0,
        sourceStatuses,
        retryAt: completion.retryAt,
      }),
    ).run();
  } catch {
    // Automatic gap telemetry must not prevent future scheduler work.
  }
  return {
    attempted: true as const,
    spaceId: claim.spaceId,
    trackId: claim.trackId,
    origin: claim.origin,
    status: completion.status,
    queuedForReviewCount: state.reviewQueuedCount || 0,
    sourceDegraded,
  };
}

async function runScheduledResearchRouteSentinel(env: Env, preferredSpaceId?: string | null) {
  const selected = preferredSpaceId ? { id: preferredSpaceId } : await env.DB.prepare(
    `SELECT space.id FROM research_spaces space
     JOIN monitor_runs run ON run.space_id = space.id
     WHERE space.owner_user_id LIKE 'anonymous:%' AND run.automation_paused_at IS NULL
      AND run.last_user_activity_at IS NOT NULL
      AND datetime(run.last_user_activity_at) > datetime('now', '-7 days')
     ORDER BY datetime(run.last_user_activity_at) DESC LIMIT 1`,
  ).first<{ id: string }>();
  if (!selected?.id) return null;
  try {
    return {
      spaceId: selected.id,
      ...await recordResearchRouteSentinel(env.DB, selected.id, developmentUnboundedEnabled(env.PI_DEVELOPMENT_UNBOUNDED)),
    };
  } catch {
    return { spaceId: selected.id, outcome: "failed" as const, issues: ["sentinel_query_failed"] };
  }
}

async function runScheduledMonitorOperationalSentinel(
  env: Env,
  spaceId: string | null | undefined,
  routeSentinel: Awaited<ReturnType<typeof runScheduledResearchRouteSentinel>>,
) {
  if (!spaceId) return null;
  try {
    const result = await recordMonitorOperationalSentinel(env.DB, spaceId, routeSentinel);
    if (result?.issues.length) {
      console.warn("Pi monitor operational sentinel", JSON.stringify({
        spaceId,
        outcome: result.outcome,
        issues: result.issues,
        recoveredIssues: result.recoveredIssues,
        emittedEventCount: result.emittedEventCount,
      }));
    } else if (result?.recoveredIssues.length) {
      console.info("Pi monitor operational sentinel recovered", JSON.stringify({
        spaceId,
        recoveredIssues: result.recoveredIssues,
        emittedEventCount: result.emittedEventCount,
      }));
    }
    return result ? {
      outcome: result.outcome,
      issues: result.issues,
      recoveredIssues: result.recoveredIssues,
      emittedEventCount: result.emittedEventCount,
    } : null;
  } catch (error) {
    console.error("Pi monitor operational sentinel failed", error);
    return { outcome: "failed" as const, issues: ["operational_sentinel_failed"], recoveredIssues: [], emittedEventCount: 0 };
  }
}

async function runScheduledMonitorSweep(env: Env, ctx: ExecutionContext, trigger: SchedulerTrigger) {
  await reconcileExpiredSchedulerTicks(env);
  const lease = await acquireSchedulerLease(env, trigger);
  if (!lease.acquired) return { acquired: false, trigger };
  const { tickId, leaseToken } = lease;
  let dueSpaceCount = 0;
  let startedCount = 0;
  let advancedCount = 0;
  let completedCount = 0;
  let pausedCount = 0;
  let failedCount = 0;
  let recoveredJobCount = 0;
  let routeRetry: Awaited<ReturnType<typeof runScheduledResearchRouteRetry>> | null = null;
  let routeIntelligence: Awaited<ReturnType<typeof runScheduledResearchRouteIntelligence>> | null = null;
  let routeEvolution: Awaited<ReturnType<typeof runScheduledResearchRouteEvolution>> | null = null;
  let gapDiscovery: Awaited<ReturnType<typeof runScheduledResearchGapDiscovery>> | null = null;
  let routeSentinel: Awaited<ReturnType<typeof runScheduledResearchRouteSentinel>> | null = null;
  let operationalSentinel: Awaited<ReturnType<typeof runScheduledMonitorOperationalSentinel>> | null = null;
  let tickError = "";

  try {
    recoveredJobCount = await recoverStaleMonitorJobs(env);
    const due = await env.DB.prepare(
      `SELECT s.id, s.owner_user_id FROM research_spaces s
       JOIN monitor_runs r ON r.space_id = s.id
       WHERE s.owner_user_id LIKE 'anonymous:%' AND r.automation_paused_at IS NULL AND (
         (r.status IN ('ready', 'error', 'idle') AND (r.next_run_at IS NULL OR datetime(r.next_run_at) <= CURRENT_TIMESTAMP))
         OR (r.status NOT IN ('ready', 'error', 'idle')
          AND (r.next_run_at IS NULL OR datetime(r.next_run_at) <= CURRENT_TIMESTAMP)
          AND (r.lock_expires_at IS NULL OR datetime(r.lock_expires_at) <= CURRENT_TIMESTAMP))
       )
       ORDER BY CASE WHEN r.last_user_activity_at IS NULL THEN 1 ELSE 0 END,
        datetime(r.last_user_activity_at) DESC,
        CASE WHEN r.status NOT IN ('ready', 'error', 'idle') THEN 0 ELSE 1 END,
        COALESCE(r.next_run_at, r.last_run_at, r.updated_at) ASC LIMIT ?`,
    ).bind(SCHEDULED_SPACE_BATCH_SIZE).all<{ id: string; owner_user_id: string }>();
    dueSpaceCount = due.results.length;
    const results = await Promise.allSettled(due.results.map(async (space) => {
      const workspaceId = space.owner_user_id.startsWith("anonymous:") ? space.owner_user_id.slice("anonymous:".length) : "";
      if (!workspaceId) throw new Error("Scheduled workspace identity is unavailable");
      const headers = { "Content-Type": "application/json", Cookie: `pi_anonymous_workspace=${workspaceId}` };
      let response = await handler.fetch(new Request("https://pi-research.internal/api/monitor", {
        method: "POST",
        headers,
        body: JSON.stringify({ spaceId: space.id, trigger: "scheduled", action: "start" }),
      }), env, ctx);
      let state = await response.json().catch(() => ({})) as {
        monitor?: {
          status?: string;
          automationDeferred?: boolean;
          alreadyRunning?: boolean;
          alreadyAdvancing?: boolean;
          leaseOwner?: boolean;
          leaseToken?: string | null;
          leaseGeneration?: number;
          automation?: { paused?: boolean };
          scanJob?: { id?: string; checkpoint?: string } | null;
        };
      };
      if (!state.monitor) throw new Error(`Scheduled monitor start returned ${response.status}`);
      if (state.monitor.automation?.paused || state.monitor.automationDeferred) {
        return { paused: Boolean(state.monitor.automation?.paused), deferred: Boolean(state.monitor.automationDeferred), advanced: 0, completed: false };
      }
      if (!response.ok) throw new Error(`Scheduled monitor start returned ${response.status}`);
      if (state.monitor.leaseOwner === false || state.monitor.alreadyRunning) {
        return { paused: false, deferred: false, advanced: 0, completed: false, following: true };
      }
      startedCount += 1;
      let advanced = 0;
      for (let step = 0; step < SCHEDULED_ADVANCE_STEPS && state.monitor && !["ready", "error"].includes(state.monitor.status || ""); step += 1) {
        response = await handler.fetch(new Request("https://pi-research.internal/api/monitor", {
          method: "POST",
          headers,
          body: JSON.stringify({
            spaceId: space.id,
            action: "advance",
            jobId: state.monitor.scanJob?.id,
            leaseToken: state.monitor.leaseToken,
            leaseGeneration: state.monitor.leaseGeneration,
          }),
        }), env, ctx);
        state = await response.json().catch(() => ({})) as typeof state;
        if (!response.ok || !state.monitor) throw new Error(`Scheduled monitor advance returned ${response.status}`);
        if (state.monitor.leaseOwner === false || state.monitor.alreadyAdvancing) {
          return { paused: false, deferred: false, advanced, completed: false, following: true };
        }
        advanced += 1;
      }
      if (state.monitor?.status === "ready" && state.monitor.scanJob?.checkpoint === "main_complete") {
        const enhanceResponse = await handler.fetch(new Request("https://pi-research.internal/api/monitor", {
          method: "POST",
          headers,
          body: JSON.stringify({ spaceId: space.id, action: "enhance", jobId: state.monitor.scanJob.id }),
        }), env, ctx);
        if (!enhanceResponse.ok) throw new Error(`Scheduled monitor enhancement returned ${enhanceResponse.status}`);
      }
      return { paused: false, deferred: false, advanced, completed: state.monitor?.status === "ready" };
    }));
    for (const result of results) {
      if (result.status === "rejected") {
        failedCount += 1;
        continue;
      }
      if (result.value.paused) pausedCount += 1;
      advancedCount += result.value.advanced;
      if (result.value.completed) completedCount += 1;
    }
    routeIntelligence = await runScheduledResearchRouteIntelligence(env, ctx);
    if (!routeIntelligence.attempted) routeEvolution = await runScheduledResearchRouteEvolution(env, ctx);
    if (!routeIntelligence.attempted && !routeEvolution?.attempted) {
      routeRetry = await runScheduledResearchRouteRetry(env, ctx);
    }
    if (!routeIntelligence.attempted && !routeEvolution?.attempted && !routeRetry?.attempted) {
      gapDiscovery = await runScheduledResearchGapDiscovery(env, ctx);
    }
    routeSentinel = await runScheduledResearchRouteSentinel(env, gapDiscovery?.spaceId || routeEvolution?.spaceId || routeIntelligence.spaceId || routeRetry?.spaceId || due.results[0]?.id || null);
    operationalSentinel = await runScheduledMonitorOperationalSentinel(
      env,
      routeSentinel?.spaceId || routeEvolution?.spaceId || routeIntelligence.spaceId || routeRetry?.spaceId || due.results[0]?.id || null,
      routeSentinel,
    );
  } catch (error) {
    tickError = error instanceof Error ? error.message.slice(0, 300) : "Scheduled monitor sweep failed";
    failedCount += 1;
  } finally {
    await env.DB.prepare(
      `UPDATE monitor_scheduler_ticks SET completed_at = ?, due_space_count = ?, started_count = ?, advanced_count = ?,
       completed_count = ?, paused_count = ?, failed_count = ?, recovered_job_count = ?, error = ?,
       lease_token = NULL, lease_expires_at = NULL WHERE id = ? AND lease_token = ?`,
    ).bind(new Date().toISOString(), dueSpaceCount, startedCount, advancedCount, completedCount, pausedCount,
      failedCount, recoveredJobCount, tickError, tickId, leaseToken).run().catch(() => undefined);
  }
  return { acquired: true, trigger, dueSpaceCount, startedCount, advancedCount, completedCount, pausedCount, failedCount, recoveredJobCount, routeRetry, routeIntelligence, routeEvolution, gapDiscovery, routeSentinel, operationalSentinel, tickError };
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/internal/scheduler" && request.method === "POST") {
      if (!env.MONITOR_SCHEDULER_SECRET) return Response.json({ error: "scheduler_not_configured" }, { status: 503 });
      if (!monitorSchedulerSecretMatches(request.headers.get("Authorization"), env.MONITOR_SCHEDULER_SECRET)) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const result = await runScheduledMonitorSweep(env, ctx, "external_watchdog");
      return Response.json(result);
    }

    if (url.pathname === "/api/internal/reliability" && request.method === "POST") {
      if (!env.MONITOR_SCHEDULER_SECRET) return Response.json({ error: "scheduler_not_configured" }, { status: 503 });
      if (!monitorSchedulerSecretMatches(request.headers.get("Authorization"), env.MONITOR_SCHEDULER_SECRET)) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      try {
        return Response.json(await readMonitorReliabilityHealth(env.DB), {
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        console.error("Pi monitor reliability health query failed", error);
        return Response.json({
          healthy: false,
          status: "critical",
          blockingReasons: ["reliability_health_query_failed"],
        }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
    }

    if (env.DB && shouldWakeMonitorScheduler(request.method, url.pathname)) {
      ctx.waitUntil((async () => {
        if (await visitBackstopIsDue(env)) await runScheduledMonitorSweep(env, ctx, "visit_backstop");
      })());
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledMonitorSweep(env, ctx, "cloudflare_cron"));
  },
};

export default worker;
