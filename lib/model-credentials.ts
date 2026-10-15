import { getRuntimeEnv } from "../db/repository";

export const MODEL_KEY_COOKIE = "pi_deepseek_api_key";
export const MODEL_NAME = "deepseek-flash";

type ProbePhase = "models" | "chat";
export class DeepSeekProbeError extends Error {
  constructor(public code: string, public phase: ProbePhase, public upstreamStatus?: number) { super(code); }
}

export function normalizedDeepSeekProbeError(error: unknown) {
  if (error instanceof DeepSeekProbeError) return error.code;
  const message = error instanceof Error ? error.message : String(error || "");
  if (/insufficient\s+balance|balance\s+insufficient|余额不足/i.test(message)) return "deepseek_insufficient_balance";
  if (/invalid\s+(?:api\s*)?key|authentication|unauthorized|returned\s+401/i.test(message)) return "deepseek_credential_invalid";
  if (/429|rate[ _-]?limit|too many requests/i.test(message)) return "deepseek_rate_limited";
  if ((error instanceof Error && /TimeoutError|AbortError/.test(error.name)) || /timeout|timed out/i.test(message)) return "deepseek_timeout";
  if (/fetch failed|network|failed to fetch/i.test(message)) return "deepseek_network_error";
  return "deepseek_unavailable";
}

async function probeJson(phase: ProbePhase, url: string, init: RequestInit, timeout: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new DeepSeekProbeError("deepseek_timeout", phase)); controller.abort(); }, timeout);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        const code = response.status === 401 ? "deepseek_credential_invalid"
          : response.status === 402 ? "deepseek_insufficient_balance"
          : response.status === 429 ? "deepseek_rate_limited"
          : response.status === 403 ? "deepseek_access_denied" : "deepseek_unavailable";
        throw new DeepSeekProbeError(code, phase, response.status);
      }
      try { return await response.json(); }
      catch { throw new DeepSeekProbeError("deepseek_invalid_response", phase); }
    })(), deadline]);
  } catch (error) {
    if (error instanceof DeepSeekProbeError) throw error;
    throw new DeepSeekProbeError(normalizedDeepSeekProbeError(error), phase);
  } finally { clearTimeout(timer); }
}

export async function verifyDeepSeekCredential(credentialValue: string) {
  const headers = { Authorization: `Bearer ${credentialValue}`, Accept: "application/json" };
  const models = await probeJson("models", "https://api.deepseek.com/models", { headers }, 20_000) as { data?: Array<{ id?: unknown } | null> } | null;
  if (!models || !Array.isArray(models.data) || !models.data.every((item: { id?: unknown } | null) => item && typeof item.id === "string")) {
    throw new DeepSeekProbeError("deepseek_invalid_response", "models");
  }
  const probe = await probeJson("chat", "https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL_NAME, messages: [{ role: "user", content: "Reply OK." }], thinking: { type: "disabled" }, max_tokens: 4, temperature: 0, stream: false }),
  }, 25_000) as { choices?: Array<{ message?: { content?: string } }> } | null;
  if (typeof probe?.choices?.[0]?.message?.content !== "string" || !probe.choices[0].message.content.trim()) {
    throw new DeepSeekProbeError("deepseek_invalid_response", "chat");
  }
  return models.data.map((item) => typeof item?.id === "string" ? item.id : "").filter(Boolean).slice(0, 20);
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== name) continue;
    try { return decodeURIComponent(value.join("=")); } catch { return ""; }
  }
  return "";
}

export function validDeepSeekApiKey(value: string) {
  const key = value.trim();
  return key.startsWith("sk-") && key.length >= 24 && key.length <= 300 && !/\s/.test(key);
}

export function resolveDeepSeekCredential(request: Request) {
  const browserKey = cookieValue(request, MODEL_KEY_COOKIE).trim();
  if (validDeepSeekApiKey(browserKey)) return { apiKey: browserKey, source: "browser" as const, model: MODEL_NAME };
  const serverKey = getRuntimeEnv().DEEPSEEK_API_KEY?.trim() || "";
  if (validDeepSeekApiKey(serverKey)) return { apiKey: serverKey, source: "server" as const, model: MODEL_NAME };
  return { apiKey: "", source: null, model: MODEL_NAME };
}

export function modelKeyCookie(apiKey: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${MODEL_KEY_COOKIE}=${encodeURIComponent(apiKey)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}${secure}`;
}

export function clearModelKeyCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${MODEL_KEY_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
