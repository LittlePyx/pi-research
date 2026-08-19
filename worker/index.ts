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

async function runScheduledMonitorSweep(env: Env, ctx: ExecutionContext) {
  const due = await env.DB.prepare(
    `SELECT s.id, s.owner_user_id FROM research_spaces s
     JOIN monitor_runs r ON r.space_id = s.id
     WHERE s.owner_user_id LIKE 'anonymous:%' AND (
       (r.status IN ('ready', 'error', 'idle') AND (r.next_run_at IS NULL OR datetime(r.next_run_at) <= CURRENT_TIMESTAMP))
       OR (r.status NOT IN ('ready', 'error', 'idle') AND datetime(r.updated_at) <= datetime('now', '-20 minutes'))
     )
     ORDER BY COALESCE(r.next_run_at, r.last_run_at, r.updated_at) ASC LIMIT 2`,
  ).all<{ id: string; owner_user_id: string }>();
  await Promise.allSettled(due.results.map(async (space) => {
    const workspaceId = space.owner_user_id.startsWith("anonymous:") ? space.owner_user_id.slice("anonymous:".length) : "";
    if (!workspaceId) return;
    const headers = { "Content-Type": "application/json", Cookie: `pi_anonymous_workspace=${workspaceId}` };
    const request = new Request("https://pi-research.internal/api/monitor", {
      method: "POST",
      headers,
      body: JSON.stringify({ spaceId: space.id, trigger: "scheduled", action: "start" }),
    });
    let response = await handler.fetch(request, env, ctx);
    let state = await response.json().catch(() => ({})) as { monitor?: { status?: string; scanJob?: { id?: string; checkpoint?: string } | null } };
    for (let step = 0; step < 14 && state.monitor && !["ready", "error"].includes(state.monitor.status || ""); step += 1) {
      response = await handler.fetch(new Request("https://pi-research.internal/api/monitor", {
        method: "POST",
        headers,
        body: JSON.stringify({ spaceId: space.id, action: "advance", jobId: state.monitor.scanJob?.id }),
      }), env, ctx);
      state = await response.json().catch(() => ({})) as typeof state;
    }
    if (state.monitor?.status === "ready" && state.monitor.scanJob?.checkpoint === "main_complete") {
      await handler.fetch(new Request("https://pi-research.internal/api/monitor", {
        method: "POST",
        headers,
        body: JSON.stringify({ spaceId: space.id, action: "enhance", jobId: state.monitor.scanJob.id }),
      }), env, ctx);
    }
  }));
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
