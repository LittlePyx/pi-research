/** Saved discoveries are leads, never promoted recommendations.
 * @template {{id:string,discoveredAt?:string,qualityStage?:string|null,discoverySources?:unknown[],userState?:string,feedback?:string|null,readingStatus?:string}} T
 * @param {T[]} papers
 * @param {string[]} excludedIds
 * @param {number} limit
 */
export function digestDiscoveries(papers, excludedIds = [], limit = 4) {
 const excluded = new Set(excludedIds);
 return [...papers].filter(p => {
  if (excluded.has(p.id) || !p.discoverySources?.length || !['discovered','queued','awaiting_evidence','reviewing','reviewed'].includes(p.qualityStage || '')
   || ['dismissed','snoozed'].includes(p.userState || '') || ['later','not_relevant'].includes(p.feedback || '')
   || ['read','mastered','cited'].includes(p.readingStatus || '')) return false;
  excluded.add(p.id); return true;
 }).sort((a,b)=>(b.discoveredAt || '').localeCompare(a.discoveredAt || '')).slice(0,limit);
}
