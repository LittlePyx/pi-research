import { getApiUser } from "../../../db/repository";
import {
  clearModelKeyCookie,
  MODEL_NAME,
  modelKeyCookie,
  resolveDeepSeekCredential,
  validDeepSeekApiKey,
} from "../../../lib/model-credentials";

type ModelsResponse = { data?: Array<{ id?: string }>; error?: { message?: string } };

export async function GET(request: Request) {
  if (!getApiUser(request)) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  const credential = resolveDeepSeekCredential(request);
  return Response.json({
    configured: Boolean(credential.apiKey),
    source: credential.source,
    provider: credential.apiKey ? "deepseek" : null,
    model: credential.apiKey ? credential.model : MODEL_NAME,
    browserStored: credential.source === "browser",
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!getApiUser(request)) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { apiKey?: string } | null;
  const apiKey = body?.apiKey?.trim() || "";
  if (!validDeepSeekApiKey(apiKey)) {
    return Response.json({ error: "请输入有效的 DeepSeek API Key" }, { status: 400 });
  }
  try {
    const response = await fetch("https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => ({})) as ModelsResponse;
    if (!response.ok) throw new Error(data.error?.message || `DeepSeek returned ${response.status}`);
    return Response.json({
      configured: true,
      source: "browser",
      provider: "deepseek",
      model: MODEL_NAME,
      browserStored: true,
      availableModels: (data.data || []).map((item) => item.id).filter(Boolean).slice(0, 20),
    }, {
      headers: {
        "Set-Cookie": modelKeyCookie(apiKey, request),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "DeepSeek connection failed" }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  if (!getApiUser(request)) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  return Response.json({ configured: false, source: null, browserStored: false }, {
    headers: { "Set-Cookie": clearModelKeyCookie(request), "Cache-Control": "private, no-store" },
  });
}
