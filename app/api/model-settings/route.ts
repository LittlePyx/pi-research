import { getApiUser } from "../../../db/repository";
import {
  clearModelKeyCookie,
  DeepSeekProbeError,
  MODEL_NAME,
  modelKeyCookie,
  normalizedDeepSeekProbeError,
  resolveDeepSeekCredential,
  validDeepSeekApiKey,
  verifyDeepSeekCredential,
} from "../../../lib/model-credentials";

function probeFailure(error: unknown) {
  const code = normalizedDeepSeekProbeError(error);
  const phase = error instanceof DeepSeekProbeError ? error.phase : undefined;
  const upstreamStatus = error instanceof DeepSeekProbeError ? error.upstreamStatus : undefined;
  console.warn("model_connection_probe_failed", { code, phase, upstreamStatus });
  return Response.json({ error: code, phase }, {
    status: code === "deepseek_timeout" ? 504 : code === "deepseek_rate_limited" ? 429 : 502,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function workspaceFailure() {
  return Response.json({ error: "workspace_session_required" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  if (!getApiUser(request)) return workspaceFailure();
  const credential = resolveDeepSeekCredential(request);
  if (new URL(request.url).searchParams.get("verify") === "1" && credential.apiKey) {
    try {
      await verifyDeepSeekCredential(credential.apiKey);
    } catch (error) {
      return probeFailure(error);
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
  if (!getApiUser(request)) return workspaceFailure();
  const body = await request.json().catch(() => null) as { apiKey?: string } | null;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!validDeepSeekApiKey(apiKey)) {
    return Response.json({ error: "请输入有效的 DeepSeek API Key" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
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
    return probeFailure(error);
  }
}

export async function DELETE(request: Request) {
  if (!getApiUser(request)) return workspaceFailure();
  return Response.json({ configured: false, source: null, browserStored: false }, {
    headers: { "Set-Cookie": clearModelKeyCookie(request), "Cache-Control": "private, no-store" },
  });
}
