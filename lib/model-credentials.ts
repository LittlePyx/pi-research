import { getRuntimeEnv } from "../db/repository";

export const MODEL_KEY_COOKIE = "pi_deepseek_api_key";
export const MODEL_NAME = "deepseek-v4-pro";

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
