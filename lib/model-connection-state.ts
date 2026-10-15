/** Classify model probes without treating workspace/network failures as bad keys. */
export function modelConnectionFailureState(error: unknown): "invalid" | "balance" | "rate_limited" | "timeout" | "network" | "workspace" | "access_denied" | "invalid_response" | "unavailable" {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/deepseek_insufficient_balance|insufficient\s+balance|balance\s+insufficient|余额不足/i.test(message)) return "balance";
  if (/deepseek_credential_invalid|invalid\s+(?:api\s*)?key|请输入有效的 DeepSeek API Key/i.test(message)) return "invalid";
  if (/429|rate[ _-]?limit|too many requests/i.test(message)) return "rate_limited";
  if (/workspace_session_required|unauthorized workspace|Anonymous workspace is not initialized/i.test(message)) return "workspace";
  if (/deepseek_access_denied/i.test(message)) return "access_denied";
  if (/deepseek_invalid_response/i.test(message)) return "invalid_response";
  if (/timeout|timed out|TimeoutError|AbortError/i.test(message) || error instanceof Error && /TimeoutError|AbortError/.test(error.name)) return "timeout";
  if (/deepseek_network_error|fetch failed|failed to fetch|network/i.test(message)) return "network";
  return "unavailable";
}

export function modelConnectionProblemCopy(state: string, locale: "zh" | "en") {
  const copy = {
    balance: { zh: ["模型账户余额不足", "充值后重新检测", "余额不足"], en: ["Model account balance insufficient", "Top up, then check again", "Insufficient balance"] },
    rate_limited: { zh: ["模型请求暂被限流", "稍后重新检测", "请求受限"], en: ["Model requests rate-limited", "Try checking again later", "Rate-limited"] },
    timeout: { zh: ["模型连接检测超时", "未能在等待时间内完成验证，请稍后重试；超时不代表 Key 无效。", "检测超时"], en: ["Model connection check timed out", "Verification took too long. Retry later; a timeout does not mean the key is invalid.", "Timed out"] },
    network: { zh: ["模型服务网络连接失败", "请检查网络后重试；无需先更换 Key。", "网络异常"], en: ["Could not reach the model service", "Check the network and retry; no key replacement needed.", "Network error"] },
    workspace: { zh: ["工作区会话不可用", "请刷新页面重新进入工作区，再检测连接。", "会话不可用"], en: ["Workspace session unavailable", "Refresh and reopen your workspace, then check again.", "Session unavailable"] },
    access_denied: { zh: ["模型服务拒绝访问", "请检查 DeepSeek 账户权限和访问限制后重试。", "访问受限"], en: ["Model service denied access", "Check your DeepSeek account permissions and access restrictions, then retry.", "Access denied"] },
    invalid_response: { zh: ["模型服务返回异常响应", "未确认模型可用，请稍后重新检测。", "响应异常"], en: ["Unexpected model service response", "Model availability is unconfirmed. Check again later.", "Unexpected response"] },
    unavailable: { zh: ["暂时无法确认模型连接", "稍后重试，无需先更换 Key", "连接未确认"], en: ["Model connection unconfirmed", "Retry later; no key replacement needed", "Connection unconfirmed"] },
  };
  const entry = copy[state as keyof typeof copy];
  if (!entry) return null;
  const [title, detail, modal] = entry[locale];
  return { title, detail, modal };
}
