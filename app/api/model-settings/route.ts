import { getApiUser } from "../../../db/repository";
import {
  clearModelKeyCookie,
  MODEL_NAME,
  modelKeyCookie,
  normalizedDeepSeekProbeError,
  resolveDeepSeekCredential,
  validDeepSeekApiKey,
  verifyDeepSeekCredential,
} from "../../../lib/model-credentials";

export async function GET(request: Request) {
  if (!getApiUser(request)) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  const credential = resolveDeepSeekCredential(request);
  if (new URL(request.url).searchParams.get("verify") === "1" && credential.apiKey) {
    try {
      await verifyDeepSeekCredential(credential.apiKey);
    } catch (error) {
      return Response.json({ error: normalizedDeepSeekProbeError(error) }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
    }
  }
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
    const availableModels = await verifyDeepSeekCredential(apiKey);
    return Response.json({
      configured: true,
      source: "browser",
      provider: "deepseek",
      model: MODEL_NAME,
      browserStored: true,
      availableModels,
    }, {
      headers: {
        "Set-Cookie": modelKeyCookie(apiKey, request),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: normalizedDeepSeekProbeError(error) }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  if (!getApiUser(request)) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  return Response.json({ configured: false, source: null, browserStored: false }, {
    headers: { "Set-Cookie": clearModelKeyCookie(request), "Cache-Control": "private, no-store" },
  });
}
