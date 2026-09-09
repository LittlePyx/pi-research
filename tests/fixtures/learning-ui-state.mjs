// UI fixtures only: these are not production recommendations or quality results.
export const spaces = [
  { id: 'qa-information', name: 'QA 信息论', memberName: 'Fixture', description: 'Information theory UI fixture', accent: 'blue' },
  { id: 'qa-mathematics', name: 'QA 应用数学', memberName: 'Fixture', description: 'Applied mathematics UI fixture', accent: 'sage' },
];

export function learningFixture(spaceId = spaces[0].id) {
  const space = spaces.find((item) => item.id === spaceId);
  if (!space) return null;
  const titles = spaceId === spaces[0].id
    ? ['QA — A Mathematical Theory of Communication', 'QA — On Information and Sufficiency']
    : ['QA — Isoperimetric inequalities and convex bodies', 'QA — Stochastic localization and the KLS conjecture'];
  const papers = titles.map((title, index) => ({
    id: `${spaceId}-paper-${index}`, title, doi: null, authors: 'UI fixture — not a live evaluation',
    venue: 'Isolated browser acceptance', url: 'https://example.org/fixture', publishedAt: '2000-01-01',
    horizon: 'years', citationCount: 0, relevanceScore: 90, qualityScore: 90, discoveredAt: '2026-09-01T00:00:00Z',
    summaryZh: '仅用于页面验收，不代表真实论文质量结论。', summaryEn: 'UI fixture, not a real quality assessment.',
    whyReadZh: '测试材料呈现', whyReadEn: 'Test material presentation', priorityVenue: false,
    analysisSource: 'fixture', screeningReason: '', userState: 'seen', showCount: 0, saved: false, feedback: null,
    firstShownAt: null, lastShownAt: null, openedAt: null, snoozedUntil: null, readingStatus: 'unread', readingNote: '',
    proposedRecommendationTier: 'browse', recommendationTier: 'browse', readMinutes: 30, readDepth: 'focused',
    problemZh: '', problemEn: '', methodZh: '', methodEn: '', contributionZh: '', contributionEn: '',
    limitationsZh: '', limitationsEn: '', readingFocusZh: '', readingFocusEn: '', researchQuestionsZh: [], researchQuestionsEn: [],
    researchProblemId: '', problemFitScore: 0, uncertaintyReductionScore: 0, actionabilityScore: 0,
    researchProblemImpactZh: '', researchProblemImpactEn: '', researchDecisionZh: '', researchDecisionEn: '',
    verificationStatus: 'not_required', verificationCoverageScore: 0, qualityStage: 'recommended',
  }));
  const kinds = ['foundation', 'method', 'milestone', 'frontier', 'project'];
  const labels = ['基础文献', '核心方法', '里程碑', '研究前沿', '研究实践'];
  const steps = kinds.map((kind, index) => ({
    id: `${spaceId}-${kind}`, kind, titleZh: labels[index], titleEn: kind,
    goalZh: 'QA 阶段目标', goalEn: 'QA stage goal',
    whyZh: 'QA 具体材料作用', whyEn: 'QA specific contribution', readFocusZh: 'QA 具体假设', readFocusEn: 'QA specific assumptions',
    checkpointZh: 'QA 具体判断', checkpointEn: 'QA specific decision',
    estimatedMinutes: 30, status: index === 0 ? 'active' : 'pending', position: index,
    resources: index < 2 ? [{ ...papers[index], id: `monitor:${papers[index].id}`, canonicalId: papers[index].id,
      trackId: null, source: 'daily-scan', qualification: 'quality_approved', suggestedMinutes: 30 }] : [],
    guidanceStatus: index === 0 ? 'reading-task' : 'grounded',
    evidenceStatus: index < 2 ? 'ready' : 'retryable', evidenceQuery: '', completedAt: null,
    discovery: index < 2 ? null : { id: `${spaceId}-gap-${index}`, status: 'retryable', attemptCount: 1,
      queuedCount: 1, reviewPendingCount: 1, reviewedCount: 0, nextRetryAt: '2099-01-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
  }));
  return {
    learning: { suggestedTarget: space.description, availablePaperCount: 2, waitingQualityCount: 3, model: 'fixture',
      path: { id: `${spaceId}-path`, target: space.description, targetTrackId: null, titleZh: `${space.name} 学习路径`, titleEn: `${space.name} learning path`,
        rationaleZh: '', rationaleEn: '', status: 'active', model: 'fixture', parentPathId: null, revision: 1, sourceRevision: 'fixture',
        estimatedMinutes: 150, completedSteps: 0, createdAt: '2026-09-01', updatedAt: '2026-09-01', steps } },
    monitor: { status: 'ready', lastRunAt: null, nextRunAt: null, newCount: 0, scannedCount: 2, knownCount: 2, error: null,
      cadenceHours: 24, source: 'UI fixture', horizons: ['years'], papers: [], historyPapers: papers, throttled: true },
  };
}

/** All API traffic terminates here; unsupported calls never reach the real backend. */
export function fixtureResponse(url, method = 'GET', spaceId) {
  const path = new URL(url, 'http://localhost').pathname;
  if (path === '/api/spaces' && method === 'GET') return { status: 200, body: { spaces, modelConfigured: false } };
  const data = learningFixture(spaceId);
  if (!data) return { status: 404, body: { error: 'Unknown fixture space' } };
  if (path === '/api/learning-path' && method === 'GET') return { status: 200, body: data.learning };
  if (path === '/api/monitor' && ['GET', 'POST'].includes(method)) return { status: 200, body: { monitor: data.monitor } };
  if (path === '/api/feedback' && method === 'POST') return { status: 200, body: { fixtureOnly: true } };
  return { status: 403, body: { error: 'Operation disabled in isolated UI fixture' } };
}
