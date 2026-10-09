/** Reuse only published, unread recommendations; never promote candidates. */
export function supplementaryReading(papers, excludedIds = [], limit = 6) {
  const seen = new Set(excludedIds);
  return papers.filter(paper => {
    if (seen.has(paper.id) || paper.qualityStage !== 'recommended'
      || !['unread', 'queued'].includes(paper.readingStatus || 'unread')
      || ['dismissed', 'snoozed'].includes(paper.userState)
      || ['not_relevant', 'later'].includes(paper.feedback)) return false;
    seen.add(paper.id);
    return true;
  }).slice(0, limit);
}

/** The field brief reuses published reading, never completed or unreviewed papers.
 * @template {{id:string,qualityStage?:string|null,readingStatus?:string|null,userState?:string|null,feedback?:string|null}} T
 * @param {T[]} papers
 * @param {string[]} excludedIds
 * @param {number} limit
 */
export function fieldBriefReading(papers, excludedIds = [], limit = 8) {
  const seen = new Set(excludedIds);
  return papers.filter(paper => {
    if (seen.has(paper.id) || paper.qualityStage !== 'recommended'
      || !['unread', 'queued', 'reading'].includes(paper.readingStatus || 'unread')
      || ['dismissed', 'snoozed'].includes(paper.userState)
      || ['not_relevant', 'later'].includes(paper.feedback)) return false;
    seen.add(paper.id);
    return true;
  }).slice(0, limit);
}
