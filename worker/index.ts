/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
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

const SCHEDULED_SPACE_BATCH_SIZE = 2;
const SCHEDULED_ADVANCE_STEPS = 3;

async function runScheduledMonitorSweep(env: Env, ctx: ExecutionContext) {
  const tickId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  let dueSpaceCount = 0;
  let startedCount = 0;
  let advancedCount = 0;
  let completedCount = 0;
  let pausedCount = 0;
  let failedCount = 0;
  let tickError = "";
  await env.DB.prepare(
    `INSERT INTO monitor_scheduler_ticks
     (id, started_at, due_space_count, started_count, advanced_count, completed_count, paused_count, failed_count)
     VALUES (?, ?, 0, 0, 0, 0, 0, 0)`,
  ).bind(tickId, startedAt).run().catch(() => undefined);

  try {
    const due = await env.DB.prepare(
      `SELECT s.id, s.owner_user_id FROM research_spaces s
       JOIN monitor_runs r ON r.space_id = s.id
       WHERE s.owner_user_id LIKE 'anonymous:%' AND r.automation_paused_at IS NULL AND (
         (r.status IN ('ready', 'error', 'idle') AND (r.next_run_at IS NULL OR datetime(r.next_run_at) <= CURRENT_TIMESTAMP))
         OR (r.status NOT IN ('ready', 'error', 'idle') AND (r.lock_expires_at IS NULL OR datetime(r.lock_expires_at) <= CURRENT_TIMESTAMP))
       )
       ORDER BY COALESCE(r.next_run_at, r.last_run_at, r.updated_at) ASC LIMIT ?`,
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
          automation?: { paused?: boolean };
          scanJob?: { id?: string; checkpoint?: string } | null;
        };
      };
      if (!response.ok || !state.monitor) throw new Error(`Scheduled monitor start returned ${response.status}`);
      if (state.monitor.automation?.paused) return { paused: true, advanced: 0, completed: false };
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
      return { paused: false, advanced, completed: state.monitor?.status === "ready" };
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
       completed_count = ?, paused_count = ?, failed_count = ?, error = ? WHERE id = ?`,
    ).bind(new Date().toISOString(), dueSpaceCount, startedCount, advancedCount, completedCount, pausedCount, failedCount, tickError, tickId).run().catch(() => undefined);
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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
    ctx.waitUntil(runScheduledMonitorSweep(env, ctx));
  },
};

export default worker;
