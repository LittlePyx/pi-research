// Internal request diagnostics. Never accepts headers, credentials, user memory,
// raw model output, or error messages. Paper records are the exact supplied
// bibliographic/abstract records, emitted only after a failed request.
export function createScreeningRequestTrace(input, options = {}) {
  const now = options.now || Date.now;
  const emit = options.emit || (entry => console.info('Pi screening trace', JSON.stringify(entry)));
  const started = now();
  const base = {
    traceId: crypto.randomUUID(), spaceId: input.spaceId, scanJobId: input.scanJobId || null,
    model: input.model, mode: input.mode, attempt: input.attempt,
    timeoutMs: input.timeoutMs, maxTokens: input.maxTokens,
    promptCharacters: input.promptCharacters, recordCount: input.records.length,
    startedAt: new Date(started).toISOString(),
  };
  let phase = 'headers';
  let headersMs = null;
  let bodyMs = null;
  let httpStatus = null;
  let finishReason = null;
  let contentCharacters = null;
  let reasoningCharacters = null;
  let inputTokens = null;
  let outputTokens = null;
  const safeEmit = entry => { try { emit(entry); } catch { /* Logging cannot break screening. */ } };
  safeEmit({ kind: 'screening_request_started', ...base });
  return {
    headers(status) { headersMs = now() - started; httpStatus = status ?? null; phase = 'body'; },
    body(data) {
      bodyMs = now() - started - (headersMs || 0);
      const choice = data?.choices?.[0];
      finishReason = ['stop', 'length', 'content_filter', 'tool_calls', 'insufficient_system_resource']
        .includes(choice?.finish_reason) ? choice.finish_reason : null;
      contentCharacters = typeof choice?.message?.content === 'string' ? choice.message.content.length : null;
      reasoningCharacters = typeof choice?.message?.reasoning_content === 'string' ? choice.message.reasoning_content.length : null;
      inputTokens = Number.isFinite(data?.usage?.prompt_tokens) ? data.usage.prompt_tokens : null;
      outputTokens = Number.isFinite(data?.usage?.completion_tokens) ? data.usage.completion_tokens : null;
      phase = 'parse';
    },
    phase(value) { phase = value; },
    finish(outcome, errorCode, completed = 0) {
      const entry = {
        kind: 'screening_request_finished', ...base, outcome, errorCode, phase,
        durationMs: now() - started, headersMs, bodyMs, httpStatus, finishReason,
        contentCharacters, reasoningCharacters, inputTokens, outputTokens, completed,
      };
      safeEmit(entry);
      if (outcome === 'failed') {
        input.records.forEach((record, recordIndex) => {
          const serialized = JSON.stringify(record);
          // Explicitly report oversized records; never claim a capped snapshot is complete.
          const parts = Math.min(16, Math.ceil(serialized.length / 1200));
          for (let part = 0; part < parts; part++) safeEmit({
            kind: 'screening_request_input', traceId: base.traceId, scanJobId: base.scanJobId,
            recordIndex, part, parts, characters: serialized.length, truncated: serialized.length > 19200,
            value: serialized.slice(part * 1200, (part + 1) * 1200),
          });
        });
      }
      return entry;
    },
  };
}
