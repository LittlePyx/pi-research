import { getApiUser } from "../../../db/repository";
import {
  clearModelKeyCookie,
  MODEL_NAME,
  modelKeyCookie,
  resolveDeepSeekCredential,
  validDeepSeekApiKey,
} from "../../../lib/model-credentials";

type ModelsResponse = { data?: Array<{ id?: string }>; error?: { message?: string } };
type ChatProbeResponse = { error?: { message?: string } };

function normalizedProbeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/insufficient\s+balance|balance\s+insufficient|余额不足/i.test(message)) return "deepseek_insufficient_balance";
  if (/invalid\s+(?:api\s*)?key|authentication|unauthorized|returned\s+401/i.test(message)) return "deepseek_credential_invalid";
  return message || "DeepSeek connection failed";
}

async function verifyDeepSeekCredential(credentialValue: string) {
  const modelsResponse = await fetch("https://api.deepseek.com/models", {
    headers: { Authorization: `Bearer ${credentialValue}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const models = await modelsResponse.json().catch(() => ({})) as ModelsResponse;
  if (!modelsResponse.ok) throw new Error(models.error?.message || `DeepSeek returned ${modelsResponse.status}`);
  const probeResponse = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${credentialValue}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ model: MODEL_NAME, messages: [{ role: "user", content: "Reply OK." }], max_tokens: 4, temperature: 0, stream: false }),
    signal: AbortSignal.timeout(25_000),
  });
  const probe = await probeResponse.json().catch(() => ({})) as ChatProbeResponse;
  if (!probeResponse.ok) throw new Error(probe.error?.message || `DeepSeek returned ${probeResponse.status}`);
  return (models.data || []).map((item) => item.id).filter(Boolean).slice(0, 20);
}

export async function GET(request: Request) {
  if (!getApiUser(request)) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  const credential = resolveDeepSeekCredential(request);
  if (new URL(request.url).searchParams.get("verify") === "1" && credential.apiKey) {
    try {
      await verifyDeepSeekCredential(credential.apiKey);
    } catch (error) {
      return Response.json({ error: normalizedProbeError(error) }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
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
    return Response.json({ error: normalizedProbeError(error) }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  if (!getApiUser(request)) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  return Response.json({ configured: false, source: null, browserStored: false }, {
    headers: { "Set-Cookie": clearModelKeyCookie(request), "Cache-Control": "private, no-store" },
  });
}
