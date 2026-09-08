// Separate deployment: no D1, model access, public trigger, or research logic.
export const TARGET = "https://pi-research-agent.qiudao-pika.chatgpt.site/api/internal/scheduler";

export async function wakeResearch(env, fetcher = fetch) {
  if (typeof env.MONITOR_SCHEDULER_SECRET !== "string" || !env.MONITOR_SCHEDULER_SECRET.trim()) {
    throw new Error("scheduler_secret_missing");
  }
  let response;
  let payload;
  try {
    response = await fetcher(TARGET, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.MONITOR_SCHEDULER_SECRET}` },
      redirect: "error",
      signal: AbortSignal.timeout(240_000),
    });
    if (!response.ok) throw new Error("http_failure");
    payload = await response.json();
  } catch {
    // Never log server bodies, headers, credentials or upstream error strings.
    throw new Error("scheduler_request_failed");
  }
  if (!payload || typeof payload.acquired !== "boolean") throw new Error("scheduler_invalid_response");
  if (!payload.acquired) return { outcome: "lease_not_acquired" };
  const fields = ["startedCount", "advancedCount", "completedCount", "failedCount"];
  if (fields.some((key) => !Number.isSafeInteger(payload[key]) || payload[key] < 0)) {
    throw new Error("scheduler_invalid_counts");
  }
  if (payload.tickError || payload.failedCount > 0) throw new Error("scheduler_sweep_failed");
  return {
    outcome: "sweep_finished",
    startedCount: payload.startedCount,
    advancedCount: payload.advancedCount,
    completedCount: payload.completedCount,
  };
}

export default {
  async scheduled(_controller, env) {
    const result = await wakeResearch(env);
    console.log(JSON.stringify(result));
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
};
