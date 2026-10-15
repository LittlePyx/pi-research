export type WorkbookFailureCode = 'timeout' | 'rate_limited' | 'model_auth' | 'model_unavailable' | 'output_truncated' | 'invalid_response' | 'invalid_evidence' | 'evidence_changed' | 'storage_unavailable';
export class WorkbookModelError extends Error {
  code: WorkbookFailureCode; providerStatus: number; finishReason: string;
  constructor(code: WorkbookFailureCode, providerStatus = 0, finishReason = '') { super(code); this.code=code; this.providerStatus=providerStatus; this.finishReason=finishReason; }
}
/** Only fixed codes leave the server; provider text and source content never do. */
export function workbookFailure(error: unknown): WorkbookFailureCode {
  if (error instanceof WorkbookModelError) return error.code;
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return 'timeout';
  const message = error instanceof Error ? error.message : '';
  if (['workbook_evidence_changed', 'workbook_context_changed'].includes(message)) return 'evidence_changed';
  if (/^(incomplete_workbook|invalid_dimension_identity|unknown_workbook_source|unlocated_workbook_evidence|incomplete_comparison_coverage|invalid_comparison_dimensions|paper_without_evidence|untraceable_workbook_instruction|invalid_comparability|invalid_workbook_review|untraceable_workbook_review)/.test(message)) return 'invalid_evidence';
  return 'storage_unavailable';
}
export function workbookRetryDelay(code: WorkbookFailureCode) {
  return code === 'model_auth' || code === 'evidence_changed' ? 0 : code === 'rate_limited' ? 60_000 : 15_000;
}
export function workbookFailureText(code: WorkbookFailureCode, zh: boolean) {
  const text: Record<WorkbookFailureCode, [string,string]> = {
    timeout:['模型响应超时，已保存的生成进度会保留。','The model timed out. Saved progress is preserved.'],
    rate_limited:['模型请求较多，请稍后继续。','The model is rate limited. Continue shortly.'],
    model_auth:['模型认证未通过，请检查模型连接后继续。','Model authentication failed. Check the model connection before continuing.'],
    model_unavailable:['模型服务暂时不可用，请稍后继续。','The model is temporarily unavailable. Continue shortly.'],
    output_truncated:['模型输出未完成，尚未作为研究结论发布。请继续当前步骤。','The model output was incomplete and was not published. Continue the current step.'],
    invalid_response:['模型返回内容无法读取，请继续当前步骤。','The model response could not be read. Continue the current step.'],
    invalid_evidence:['生成内容未通过格式或出处核对，请继续当前步骤。','The output did not pass structure or source checks. Continue the current step.'],
    evidence_changed:['材料或研究问题已变化，请用当前材料重新准备。','The sources or question changed. Prepare again with current evidence.'],
    storage_unavailable:['进度暂时未能保存，请刷新进度后继续。','Progress could not be saved. Refresh progress before continuing.'],
  };
  return text[code]?.[zh ? 0 : 1] || text.model_unavailable[zh ? 0 : 1];
}
