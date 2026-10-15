import { workspaceFetch } from "./workspace-request";

type ModelSettings = { configured?: boolean; source?: "browser" | "server" | null; model?: string | null; error?: string };

/** Bound both response headers and body, so a stalled request cannot lock the dialog. */
export async function modelSettingsRequest(url: string, init?: RequestInit) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error("deepseek_timeout")); controller.abort(); }, 50_000);
  });
  try {
    return await Promise.race([(async () => {
      const response = await workspaceFetch(url, { ...init, cache: "no-store", signal: controller.signal });
      if (response.status === 401 || response.status === 403) throw new Error("workspace_session_required");
      const fallback = response.status === 504 ? "deepseek_timeout" : response.status === 429 ? "deepseek_rate_limited" : "deepseek_unavailable";
      const data = await response.json().catch(() => { throw new Error(response.ok ? "deepseek_invalid_response" : fallback); }) as ModelSettings | null;
      if (!data || typeof data !== "object" || response.ok && typeof data.configured !== "boolean") throw new Error("deepseek_invalid_response");
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : fallback);
      return { response, data };
    })(), deadline]);
  } finally { clearTimeout(timer); }
}
