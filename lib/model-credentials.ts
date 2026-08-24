import { getRuntimeEnv } from "../db/repository";

export const MODEL_KEY_COOKIE = "pi_deepseek_api_key";
export const MODEL_NAME = "deepseek-v4-pro";

type DeepSeekModelsResponse = { data?: Array<{ id?: string }>; error?: { message?: string } };
type DeepSeekChatProbeResponse = { error?: { message?: string } };

export function normalizedDeepSeekProbeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/insufficient\s+balance|balance\s+insufficient|余额不足/i.test(message)) return "deepseek_insufficient_balance";
  if (/invalid\s+(?:api\s*)?key|authentication|unauthorized|returned\s+401/i.test(message)) return "deepseek_credential_invalid";
  return message || "DeepSeek connection failed";
}

export async function verifyDeepSeekCredential(credentialValue: string) {
  const modelsResponse = await fetch("https://api.deepseek.com/models", {
    headers: { Authorization: `Bearer ${credentialValue}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const models = await modelsResponse.json().catch(() => ({})) as DeepSeekModelsResponse;
  if (!modelsResponse.ok) throw new Error(models.error?.message || `DeepSeek returned ${modelsResponse.status}`);
  const probeResponse = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${credentialValue}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ model: MODEL_NAME, messages: [{ role: "user", content: "Reply OK." }], max_tokens: 4, temperature: 0, stream: false }),
    signal: AbortSignal.timeout(25_000),
  });
  const probe = await probeResponse.json().catch(() => ({})) as DeepSeekChatProbeResponse;
  if (!probeResponse.ok) throw new Error(probe.error?.message || `DeepSeek returned ${probeResponse.status}`);
  return (models.data || []).map((item) => item.id).filter(Boolean).slice(0, 20);
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
