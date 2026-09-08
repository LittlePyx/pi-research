// Keep one measurement scope: a new job's zero is not yesterday's result.
export function scanFunnel(job, brief) {
  const metrics = brief?.metrics;
  return job ? {
    scanned: job.discoveredCount ?? null,
    screened: job.reviewedCount ?? null,
    deepReviewed: job.deepCompletedCount ?? null,
    recommended: job.recommendedCount ?? null,
  } : {
    scanned: metrics?.scanned ?? null,
    screened: metrics?.screened ?? metrics?.reviewed ?? null,
    deepReviewed: metrics?.deepReviewed ?? null,
    recommended: metrics?.recommended ?? null,
  };
}

/** @template {{id: string}} T
 * @param {string[]} ids
 * @param {T[]} papers
 */
export function briefPaperEntries(ids = [], papers = []) {
  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  const seen = new Set();
  return ids.flatMap((id, briefIndex) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const paper = byId.get(id);
    return paper ? [{ paper, briefIndex }] : [];
  });
}

export function scanDisplayProgress(active, ready, phaseProgress, savedProgress) {
  const value = Math.max(Number(phaseProgress) || 0, Number(savedProgress) || 0);
  return active ? Math.min(99, Math.max(0, value)) : ready ? 100 : 0;
}

export function coverageIdentity(source) {
  return JSON.stringify([source.sourceKey, source.channel]);
}

// Saved prose belongs to its brief date; never borrow a live job's counts.
export function datedBriefText(text, brief) {
  if (brief.isCurrent) return text || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(brief.date || '') ? brief.date : '该简报日期';
  return String(text || '').replace(/今天|今日/g, date)
    .replace(/\btoday['’]s\b/gi, `the ${date}`)
    .replace(/\btoday\b/gi, `on ${date}`);
}

// watchlist is a historical union of multiple runs; numbers there are not a
// coherent snapshot. Read the last saved run's structured metrics instead.
export function briefRunStatus(brief, locale) {
  const metrics = brief?.metrics || {};
  const messages = [];
  const items = [
    ['verificationPending', n => locale === 'zh' ? `${n} 篇待核对` : `${n} awaiting evidence checks`],
    ['verificationFailed', n => locale === 'zh' ? `${n} 篇证据未通过` : `${n} failed evidence checks`],
    ['deepDeferred', n => locale === 'zh' ? `${n} 篇延后重试` : `${n} deferred for retry`],
  ];
  for (const [key, label] of items) {
    const value = metrics[key];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) messages.push(label(value));
  }
  return messages;
}
