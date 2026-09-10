import { emptyResearchMapState } from "../../lib/research-map.ts";
export function routeReadingFixture() {
  const map = emptyResearchMapState(); map.generated = true;
  map.tracks = [
    ["kls", "KLS 猜想与等周常数", "KLS conjecture and isoperimetric constants", "比较不同测度条件下的常数界，区分结论、证明工具和仍缺少的条件。", "Compare bounds under different measure assumptions, separating results, proof tools, and missing conditions."],
    ["transport", "Monge–Ampère 与输运熵不等式", "Monge–Ampère and transport-entropy inequalities", "核对输运方法的适用假设及其与函数不等式的联系。", "Check the assumptions of transport methods and their connection to functional inequalities."],
    ["localization", "随机局部化方法", "Stochastic localization", "识别局部化步骤在证明中的作用与需要控制的量。", "Identify the role of localization and the quantities that need control."],
  ].map(([id, titleZh, titleEn, summaryZh, summaryEn], index) => ({ id, titleZh, titleEn, summaryZh, summaryEn,
    expansionCount: 0, userRole: index < 2 ? "core" : "support", monitoringStatus: "active", depthScore: 0, supportScore: 0, interactionScore: 0,
    heatScore: 0, heatLevel: "quiet", recentPaperCount: 0, confirmedEvidenceCount: 0, pendingEvidenceCount: 0, queuedForReviewCount: 0,
    reviewingForReviewCount: 0, recommendedCandidateCount: 0, lastQueuedAt: null, latestChange: null, gapDiscovery: null, routeRevisions: [],
    buildStatus: "empty", buildAttemptCount: 1, buildSourceStatuses: [], buildError: null, buildRetryAt: null, intelligence: null,
    intelligenceStatus: "ready", intelligenceRetryAt: null, intelligenceRefreshRequestedAt: null, updatedAt: "2026-09-10", papers: [],
    discoveryEffect: { attemptCount: 0, discoveredCount: 0, deepReviewedCount: 0, recommendedCount: 0, acceptedCount: 0,
      deepReviewRate: 0, recommendationRate: 0, acceptanceRate: 0, lastScannedAt: null, staleDays: null,
      tasks: Object.fromEntries(["frontier", "foundation", "gap", "network"].map(key => [key, { status: "idle", scannedCount: 0, queuedCount: 0, recommendedCount: 0 }])) },
  }));
  return map;
}
