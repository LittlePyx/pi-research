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
      // Observe redirects as HTTP failures without following them or forwarding credentials.
      redirect: "manual",
      signal: AbortSignal.timeout(240_000),
    });
  } catch (error) {
    // Never log server bodies, headers, credentials or upstream error strings.
    throw new Error(error?.name === "TimeoutError" ? "scheduler_request_timeout" : "scheduler_network_failed");
  }
  // Numeric HTTP status is safe; response bodies and headers remain private.
  if (!response.ok) {
    const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
      ? response.status : "unknown";
    throw new Error(`scheduler_http_${status}`);
  }
  try {
    payload = await response.json();
  } catch {
    throw new Error("scheduler_invalid_json");
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
