/** Shared by production planning and offline ablations. No paper ranking or model calls. */
export const FEEDBACK_POLICY_VERSION = 'intent-channels-v1';
export const FEEDBACK_CHANNELS = Object.freeze({
  topic_fit:'interest', method_fit:'interest', solves_question:'interest', foundational:'interest', surprising:'interest',
  topic_drift:'scope', weak_evidence:'quality', too_shallow:'depth', duplicate_known:'mastery',
  wrong_type:'format', network_dismissed:'paper',
});
export function feedbackChannel(reasonCode) { return Object.hasOwn(FEEDBACK_CHANNELS,reasonCode) ? FEEDBACK_CHANNELS[reasonCode] : 'paper'; }
export function feedbackSignalKind(reasonCode, fallback = 'paper') {
  const channel = feedbackChannel(reasonCode);
  return ({scope:'exclusion',quality:'quality',depth:'depth',mastery:'mastery',format:'format',paper:'paper'})[channel] || fallback;
}
export function preferenceChannel(signal) {
  if (signal.reasonCode) return feedbackChannel(signal.reasonCode);
  if (signal.kind === 'exclusion') return 'scope';
  if (['quality','depth','mastery','format','paper'].includes(signal.kind)) return signal.kind;
  return 'interest';
}
export function buildPreferenceGuidance(signals, {mode = 'all', now = Date.now()} = {}) {
  if (!['none','explicit','all'].includes(mode)) throw new Error('Unknown memory ablation');
  const result = {version:FEEDBACK_POLICY_VERSION, interest:[], scope:[], quality:[], depth:[], mastery:[], format:[], paper:[]};
  if (mode === 'none') return result;
  for (const signal of signals) {
    if (signal.active === false || signal.active === 0 || (mode === 'explicit' && signal.layer !== 'explicit')) continue;
    if (signal.expiresAt && (!Number.isFinite(Date.parse(signal.expiresAt)) || Date.parse(signal.expiresAt) <= now)) continue;
    const channel = preferenceChannel(signal);
    if (channel === 'scope' && signal.layer !== 'explicit') continue;
    result[channel].push({id:signal.id,layer:signal.layer,kind:signal.kind,label:signal.labelEn,
      evidence:signal.evidence || '',confidence:signal.effectiveConfidence ?? signal.confidence ?? 0});
  }
  return result;
}
export const PREFERENCE_GUIDANCE_RULES = 'Interpret memory by channel: interest guides topics and methods; only explicit scope evidence suggests scope exclusions. Quality feedback concerns evidence reliability, not disinterest in a topic. Depth requests advanced treatment. Mastery requests less redundant introductory material, not exclusion of the field. Format concerns document type. Paper-only dismissal is not a topic exclusion. Saved papers are tentative interest, not mastery. Inferred behavior is revisable and cannot override explicit feedback. Never lower quality gates or treat user feedback as verified scientific evidence.';
export function feedbackExampleContext(rows) {
  const interest = [], scope = [], constraints = [];
  for (const row of rows) {
    const title = String(row.title || '').trim();
    if (!title) continue;
    if (row.feedback === 'relevant') interest.push(title + ' [explicit relevance]');
    else if (row.saved && row.feedback !== 'not_relevant') interest.push(title + ' [saved for later consideration; not proof of relevance or mastery]');
    if (row.feedback !== 'not_relevant') continue;
    const channel = feedbackChannel(row.reason_code);
    if (channel === 'scope') scope.push(title + ' [explicitly outside research scope]');
    else constraints.push(channel + ': ' + title + ' [' + (row.reason_code || 'unspecified paper dismissal') + ']');
  }
  return {interest,scope,constraints};
}
