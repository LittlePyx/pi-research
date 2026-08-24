/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  MONITOR_SCHEDULER_BUCKET_MS,
  monitorSchedulerBucketId,
  monitorSchedulerSecretMatches,
  shouldWakeMonitorScheduler,
} from "../lib/monitor-scheduler.mjs";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
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

const SCHEDULED_SPACE_BATCH_SIZE = 4;
const SCHEDULED_ADVANCE_STEPS = 1;
const SCHEDULER_LEASE_MS = MONITOR_SCHEDULER_BUCKET_MS - 60_000;
const HARD_STALE_JOB_HOURS = 6;

async function acquireSchedulerLease(env: Env, trigger: SchedulerTrigger) {
  const now = new Date();
  const tickId = monitorSchedulerBucketId(now.getTime());
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + SCHEDULER_LEASE_MS).toISOString();
  const previousTick = await env.DB.prepare(
    `SELECT COALESCE(completed_at, started_at) AS heartbeat_at FROM monitor_scheduler_ticks
     WHERE id != ? ORDER BY datetime(COALESCE(completed_at, started_at)) DESC LIMIT 1`,
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
          error = 'stale_scheduler_recovery', completed_at = COALESCE(completed_at, ?), updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status NOT IN ('ready', 'error')`,
      ).bind(recoveredAt, stale.job_id),
      env.DB.prepare(
        `UPDATE monitor_runs SET status = 'error', next_run_at = CURRENT_TIMESTAMP,
          lock_token = NULL, lock_expires_at = NULL, error = 'stale_scheduler_recovery', updated_at = CURRENT_TIMESTAMP
         WHERE space_id = ?`,
      ).bind(stale.space_id),
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

async function runScheduledMonitorSweep(env: Env, ctx: ExecutionContext, trigger: SchedulerTrigger) {
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
       ORDER BY CASE WHEN r.status NOT IN ('ready', 'error', 'idle') THEN 0 ELSE 1 END,
        CASE WHEN r.last_user_activity_at IS NULL THEN 1 ELSE 0 END,
        datetime(r.last_user_activity_at) DESC,
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
          automation?: { paused?: boolean };
          scanJob?: { id?: string; checkpoint?: string } | null;
        };
      };
      if (!state.monitor) throw new Error(`Scheduled monitor start returned ${response.status}`);
      if (state.monitor.automation?.paused || state.monitor.automationDeferred) {
        return { paused: Boolean(state.monitor.automation?.paused), deferred: Boolean(state.monitor.automationDeferred), advanced: 0, completed: false };
      }
      if (!response.ok) throw new Error(`Scheduled monitor start returned ${response.status}`);
      startedCount += 1;
      let advanced = 0;
      for (let step = 0; step < SCHEDULED_ADVANCE_STEPS && state.monitor && !["ready", "error"].includes(state.monitor.status || ""); step += 1) {
        response = await handler.fetch(new Request("https://pi-research.internal/api/monitor", {
          method: "POST",
          headers,
          body: JSON.stringify({ spaceId: space.id, action: "advance", jobId: state.monitor.scanJob?.id }),
        }), env, ctx);
        state = await response.json().catch(() => ({})) as typeof state;
        if (!response.ok || !state.monitor) throw new Error(`Scheduled monitor advance returned ${response.status}`);
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
  return { acquired: true, trigger, dueSpaceCount, startedCount, advancedCount, completedCount, pausedCount, failedCount, recoveredJobCount, tickError };
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
      ctx.waitUntil(runScheduledMonitorSweep(env, ctx, "external_watchdog"));
      return Response.json({ accepted: true }, { status: 202 });
    }

    if (env.DB && shouldWakeMonitorScheduler(request.method, url.pathname)) {
      ctx.waitUntil(runScheduledMonitorSweep(env, ctx, "visit_backstop"));
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
