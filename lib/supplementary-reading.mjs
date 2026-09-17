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
