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
