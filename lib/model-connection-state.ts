/** Classify model probes without treating workspace/network failures as bad keys. */
export function modelConnectionFailureState(error: unknown): "invalid" | "balance" | "rate_limited" | "unavailable" {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/deepseek_insufficient_balance|insufficient\s+balance|balance\s+insufficient|余额不足/i.test(message)) return "balance";
  if (/deepseek_credential_invalid|invalid\s+(?:api\s*)?key|请输入有效的 DeepSeek API Key/i.test(message)) return "invalid";
  if (/429|rate[ _-]?limit|too many requests/i.test(message)) return "rate_limited";
  return "unavailable";
}

export function modelConnectionProblemCopy(state: string, locale: "zh" | "en") {
  const copy = {
    balance: { zh: ["模型账户余额不足", "充值后重新检测", "余额不足"], en: ["Model account balance insufficient", "Top up, then check again", "Insufficient balance"] },
    rate_limited: { zh: ["模型请求暂被限流", "稍后重新检测", "请求受限"], en: ["Model requests rate-limited", "Try checking again later", "Rate-limited"] },
    unavailable: { zh: ["暂时无法确认模型连接", "稍后重试，无需先更换 Key", "连接未确认"], en: ["Model connection unconfirmed", "Retry later; no key replacement needed", "Connection unconfirmed"] },
  };
  const entry = copy[state as keyof typeof copy];
  if (!entry) return null;
  const [title, detail, modal] = entry[locale];
  return { title, detail, modal };
}
