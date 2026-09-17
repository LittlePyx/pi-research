export type GraphTaskPaper = { canonicalId: string; title: string };
export type GraphTaskContext = { spaceId: string; question: string; papers: GraphTaskPaper[]; readingTask?: {paperId:string;focusZh:string;focusEn:string} };
export type GraphRelevance = { canonicalId: string; relevance: 'direct' | 'partial' | 'unrelated' | 'insufficient'; reasonZh: string; reasonEn: string; quote: string; limitationZh: string; limitationEn: string };

/** Exact identities only; an unavailable selection must never turn into a different paper. */
export function graphSelection<T extends { id: string; canonicalId: string }>(candidates: T[], requested: string[]) {
  const normalized = (value: string) => value.trim().toLowerCase();
  const wanted = [...new Set(requested.map(normalized))].slice(0, 3);
  return { selected: wanted.flatMap(id => { const found = candidates.find(c => normalized(c.canonicalId) === id); return found ? [found.id] : []; }),
    missing: wanted.filter(id => !candidates.some(c => normalized(c.canonicalId) === id)) };
}

const prefix = 'PI_GRAPH_FOCUS_V1:';
export function storedWorkbookQuestion(base: string, focus: string) {
  return focus.trim() ? prefix + JSON.stringify({ base, focus: focus.trim().slice(0, 1000) }) : base;
}
export function workbookFocus(stored: string) {
  if (!stored.startsWith(prefix)) return '';
  try { const data = JSON.parse(stored.slice(prefix.length)); return typeof data.focus === 'string' ? data.focus.slice(0, 1000) : ''; } catch { return ''; }
}
export function focusedWorkbookQuestion(base: string, focus: string) { return focus ? `${base}\nResearcher's comparison question: ${focus}` : base; }

export function groundedGraphRelevance(raw: unknown, sources: { canonicalId: string; abstractText: string }[]): GraphRelevance[] {
  const rows = Array.isArray(raw) ? raw : [];
  return sources.map(source => {
    const matches = rows.filter(row => row && row.canonicalId === source.canonicalId);
    const item = matches.length === 1 ? matches[0] : undefined;
    const quote = typeof item?.quote === 'string' ? item.quote.trim() : '';
    const valid = ['direct', 'partial', 'unrelated'].includes(item?.relevance) && quote.length >= 35 && quote.length <= 900 && source.abstractText.includes(quote)
      && ['reasonZh','reasonEn','limitationZh','limitationEn'].every(key => typeof item?.[key] === 'string' && item[key].length <= 1000);
    return valid ? { canonicalId: source.canonicalId, relevance: item.relevance, quote, reasonZh:item.reasonZh, reasonEn:item.reasonEn, limitationZh:item.limitationZh, limitationEn:item.limitationEn }
      : { canonicalId:source.canonicalId,relevance:'insufficient',quote:'',reasonZh:'摘要不足或判断未通过出处核对。',reasonEn:'Insufficient abstract evidence or unverified assessment.',limitationZh:'请阅读原文后再判断。',limitationEn:'Check the original paper before judging relevance.' };
  });
}
