function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "");
}

export function modelFailureCode(error) {
  const message = errorMessage(error).trim();
  if (/insufficient\s+balance|balance\s+insufficient|余额不足/i.test(message)) return "insufficient_balance";
  if (/invalid\s+(?:api\s*)?key|authentication|unauthorized|status\s*401|returned\s*401/i.test(message)) return "invalid_credential";
  if (/timeout|timed\s*out|aborted|aborterror/i.test(message)) return "timeout";
  if (/429|rate.?limit|throttl/i.test(message)) return "rate_limited";
  if (/status\s*5\d\d|returned\s*5\d\d|\b5\d\d\b|temporarily unavailable|service unavailable/i.test(message)) return "upstream_unavailable";
  if (/json|malformed|empty (?:review|screening|result)|did not (?:screen|review)/i.test(message)) return "invalid_model_output";
  return "stage_failed";
}

export function isFatalModelFailure(error) {
  return ["insufficient_balance", "invalid_credential"].includes(modelFailureCode(error));
}

export function shouldOpenDeepReviewCircuit(input) {
  const threshold = Math.max(2, Math.round(input.threshold || 2));
  return input.completedInBatch === 0
    && input.failedInBatch > 0
    && input.consecutiveFailures >= threshold;
}

export function deepReviewCompletion(input) {
  const scheduled = Math.max(0, Math.round(input.scheduled || 0));
  const completed = Math.max(0, Math.min(scheduled, Math.round(input.completed || 0)));
  const deferred = Math.max(0, Math.min(scheduled - completed, Math.round(input.deferred || 0)));
  const recommended = Math.max(0, Math.min(completed, Math.round(input.recommended || 0)));
  let state;
  if (scheduled > 0 && completed === 0 && deferred >= scheduled) state = "analysis_unavailable";
  else if (deferred > 0) state = "partial";
  else if (recommended > 0) state = "recommended";
  else state = "no_match";
  return { state, scheduled, completed, deferred, recommended };
}

/**
 * @template T, R
 * @param {T[]} items
 * @param {(item: T) => Promise<R>} worker
 * @param {(item: T, value: R) => Promise<void>} [onSuccess]
 */
export async function settleFaultTolerantBatch(items, worker, onSuccess) {
  const settled = await Promise.all(items.map(async (item) => {
    try {
      const value = await worker(item);
      if (onSuccess) await onSuccess(item, value);
      return { ok: true, item, value };
    } catch (error) {
      return { ok: false, item, error, code: modelFailureCode(error) };
    }
  }));
  return {
    successes: settled.filter((result) => result.ok),
    failures: settled.filter((result) => !result.ok),
  };
}
