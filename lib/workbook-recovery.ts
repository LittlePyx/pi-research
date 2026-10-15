export type WorkbookFailureCode = 'timeout' | 'rate_limited' | 'model_auth' | 'model_unavailable' | 'output_truncated' | 'invalid_response' | 'invalid_evidence' | 'evidence_changed' | 'storage_unavailable';
const validationCodes = new Set(['incomplete_workbook','overlong_workbook_field','invalid_dimension_identity','unknown_workbook_source','unlocated_workbook_evidence','incomplete_comparison_coverage','invalid_comparison_dimensions','paper_without_evidence','untraceable_workbook_instruction','invalid_comparability','incomplete_workbook_task','incomplete_workbook_review','invalid_workbook_review','untraceable_workbook_review']);
export type WorkbookResponseDetail = 'invalid_json_response' | 'empty_model_response' | 'unexpected_finish_reason' | 'invalid_provider_response';
export function workbookResponseDetail(value: unknown): WorkbookResponseDetail | null {
  return typeof value === 'string' && ['invalid_json_response', 'empty_model_response', 'unexpected_finish_reason', 'invalid_provider_response'].includes(value) ? value as WorkbookResponseDetail : null;
}
export function workbookResponseDetailText(value: unknown, zh: boolean): string {
  const detail = workbookResponseDetail(value);
  const messages: Record<WorkbookResponseDetail, [string, string]> = {
    invalid_json_response: ['模型返回的 JSON 格式有误；继续时会提示正确转义数学符号与引文。', 'The model returned invalid JSON. Continuing requests correct escaping of mathematical text and quotations.'],
    empty_model_response: ['模型返回了空内容，请稍后继续。', 'The model returned empty content. Continue shortly.'],
    unexpected_finish_reason: ['模型没有正常完成本次输出，请继续当前步骤。', 'The model did not finish normally. Continue the current step.'],
    invalid_provider_response: ['模型服务返回格式异常，请稍后继续。', 'The provider returned an invalid response envelope. Continue shortly.'],
  };
  return detail ? messages[detail][zh ? 0 : 1] : '';
}
export function workbookValidationCode(value: unknown): string | null {
  const code = value instanceof Error ? value.message : value;
  return typeof code === 'string' && validationCodes.has(code) ? code : null;
}
export function workbookRecoveryHint(code: string): string {
  if (code === 'overlong_workbook_field') return 'The previous workbook exceeded the supplied characterLimits. Rewrite the overlong fields concisely within those limits in BOTH languages. Preserve mathematical qualifications and complete sentences; never truncate a sentence or a verbatim quotation to fit. Choose a shorter complete source passage if necessary. All evidence and review checks still apply.';
  if (code === 'invalid_response' || workbookResponseDetail(code)) return 'The previous response could not be used. Return one complete JSON object matching the supplied contract, with no Markdown fences or surrounding text. JSON-escape quotation marks, newlines and every literal backslash in mathematical text and verbatim quotes; escaping must preserve the original source text when decoded. Do not invent or change evidence to fix serialization.';
  if (!workbookValidationCode(code) && code !== 'invalid_evidence') return '';
  return `Previous output failed ${code}. Use only the exact JSON contract keys. paperId must equal source.id (never canonicalId). Every evidenceIds entry must be dimension.id + ':' + cell.paperId and point to a supported cell. Copy quotes verbatim from that source's abstractText, without ellipses or paraphrase. Mark unavailable facts missing. Preserve every bilingual required field and all required review check IDs. Do not bypass evidence checks.`;
}
export class WorkbookModelError extends Error {
  code: WorkbookFailureCode; providerStatus: number; finishReason: string; detail: WorkbookResponseDetail | null;
  constructor(code: WorkbookFailureCode, providerStatus = 0, finishReason = '', detail: WorkbookResponseDetail | null = null) { super(code); this.code=code; this.providerStatus=providerStatus; this.finishReason=finishReason; this.detail=detail; }
}
/** Only fixed codes leave the server; provider text and source content never do. */
export function workbookFailure(error: unknown): WorkbookFailureCode {
  if (error instanceof WorkbookModelError) return error.code;
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return 'timeout';
  const message = error instanceof Error ? error.message : '';
  if (['workbook_evidence_changed', 'workbook_context_changed'].includes(message)) return 'evidence_changed';
  if (workbookValidationCode(message)) return 'invalid_evidence';
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
