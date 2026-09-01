import type { ResearchRouteEffectiveness } from "./research-route-effectiveness";

export type ResearchTrackRole = "foundation" | "milestone" | "frontier";
export type ResearchDirectionRole = "core" | "support" | "explore";
export type ResearchHeatLevel = "hot" | "rising" | "steady" | "quiet";
export type ResearchTrackBuildStatus = "queued" | "retryable" | "partial" | "empty" | "failed" | "ready";
export type ResearchTrackSourceStatus = "ok" | "empty" | "failed" | "cached";
export type ResearchEvidenceProvenance = "system_curated" | "user_confirmed";
export type ResearchTrackPaperCurationStatus = "active" | "deactivated";
export type ResearchPaperEdgeKind = "citation" | "similarity" | "semantic" | "path";
export type ResearchPaperNetworkStatus = "idle" | "building" | "ready" | "partial" | "error";

export type ResearchPaperCoverageCandidate = {
  id: string;
  canonicalId: string;
  trackId: string;
  publishedAt: string | null;
  createdAt: string | null;
  citationCount: number;
  role: ResearchTrackRole;
};

export type ResearchPaperCoverageWindow = {
  paperIds: string[];
  corePaperIds: string[];
  latestPaperIds: string[];
  rotatingPaperIds: string[];
  nextCursor: number;
};

function stablePaperNetworkHash(values: string[]) {
  let first = 2166136261;
  let second = 2246822519;
  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second ^ code, 3266489917);
    }
    first = Math.imul(first ^ 31, 16777619);
    second = Math.imul(second ^ 127, 668265263);
  }
  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export function researchPaperCoverageHash(paperIds: string[]) {
  return stablePaperNetworkHash(Array.from(new Set(paperIds)).sort());
}

export function researchPaperSetRevision(papers: ResearchPaperCoverageCandidate[]) {
  const rows = papers.map((paper) => [
    paper.id,
    paper.canonicalId,
    paper.trackId,
    paper.publishedAt || "",
    paper.createdAt || "",
    String(paper.citationCount),
    paper.role,
  ].join("\u001f")).sort();
  return `${rows.length}:${stablePaperNetworkHash(rows)}`;
}

function paperTimestamp(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Selects a bounded, deterministic backend analysis window. Stable core and
 * latest slices retain continuity; a persisted cursor rotates the remaining
 * budget so repeated refreshes eventually cover large libraries.
 */
export function selectResearchPaperCoverage(
  papers: ResearchPaperCoverageCandidate[],
  cursor = 0,
  limit = 40,
): ResearchPaperCoverageWindow {
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (!boundedLimit || !papers.length) return { paperIds: [], corePaperIds: [], latestPaperIds: [], rotatingPaperIds: [], nextCursor: 0 };
  const unique = Array.from(new Map(papers.map((paper) => [paper.id, paper])).values());
  const selected: string[] = [];
  const selectedIds = new Set<string>();
  const add = (paper: ResearchPaperCoverageCandidate, bucket: string[]) => {
    if (selected.length >= boundedLimit || selectedIds.has(paper.id)) return false;
    selected.push(paper.id);
    selectedIds.add(paper.id);
    bucket.push(paper.id);
    return true;
  };
  const roleRank: Record<ResearchTrackRole, number> = { foundation: 3, milestone: 2, frontier: 1 };
  const corePaperIds: string[] = [];
  const latestPaperIds: string[] = [];
  const rotatingPaperIds: string[] = [];
  const coreLimit = Math.min(12, boundedLimit, unique.length);
  const queues = new Map<string, ResearchPaperCoverageCandidate[]>();
  for (const paper of unique) queues.set(paper.trackId, [...(queues.get(paper.trackId) || []), paper]);
  for (const queue of queues.values()) queue.sort((left, right) =>
    roleRank[right.role] - roleRank[left.role]
      || right.citationCount - left.citationCount
      || paperTimestamp(left.publishedAt) - paperTimestamp(right.publishedAt)
      || left.canonicalId.localeCompare(right.canonicalId));
  const trackIds = Array.from(queues.keys()).sort();
  const coreCursors = new Map(trackIds.map((trackId) => [trackId, 0]));
  while (corePaperIds.length < coreLimit) {
    let advanced = false;
    for (const trackId of trackIds) {
      const queue = queues.get(trackId) || [];
      const queueCursor = coreCursors.get(trackId) || 0;
      if (queueCursor >= queue.length) continue;
      coreCursors.set(trackId, queueCursor + 1);
      add(queue[queueCursor], corePaperIds);
      advanced = true;
      if (corePaperIds.length >= coreLimit) break;
    }
    if (!advanced) break;
  }

  const latestLimit = Math.min(12, boundedLimit - selected.length);
  const latest = [...unique].sort((left, right) =>
    paperTimestamp(right.createdAt) - paperTimestamp(left.createdAt)
      || paperTimestamp(right.publishedAt) - paperTimestamp(left.publishedAt)
      || right.citationCount - left.citationCount
      || left.canonicalId.localeCompare(right.canonicalId));
  for (const paper of latest) {
    if (latestPaperIds.length >= latestLimit) break;
    add(paper, latestPaperIds);
  }

  const rotatingPool = unique.filter((paper) => !selectedIds.has(paper.id))
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId) || left.id.localeCompare(right.id));
  const start = rotatingPool.length ? ((Math.floor(cursor) % rotatingPool.length) + rotatingPool.length) % rotatingPool.length : 0;
  const rotatingLimit = Math.min(boundedLimit - selected.length, rotatingPool.length);
  for (let offset = 0; offset < rotatingLimit; offset += 1) add(rotatingPool[(start + offset) % rotatingPool.length], rotatingPaperIds);
  const nextCursor = rotatingPool.length ? (start + rotatingPaperIds.length) % rotatingPool.length : 0;
  return { paperIds: selected, corePaperIds, latestPaperIds, rotatingPaperIds, nextCursor };
}

export type ResearchDirectionIntelligence = {
  assessmentZh: string;
  assessmentEn: string;
  opportunityZh: string;
  opportunityEn: string;
  watchSignalZh: string;
  watchSignalEn: string;
  evidenceGapZh: string;
  evidenceGapEn: string;
  nextSearchQuery: string;
  confidence: number;
  evidenceCanonicalIds: string[];
  model: string;
  updatedAt: string | null;
};

export type ResearchTrackPaper = {
  id: string;
  canonicalId: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  citationCount: number;
  role: ResearchTrackRole;
  summaryZh: string;
  summaryEn: string;
  rationaleZh: string;
  rationaleEn: string;
  position: number;
  provenance?: ResearchEvidenceProvenance;
  curationStatus: ResearchTrackPaperCurationStatus;
  curationReasonCode: string | null;
  curationReasonZh: string;
  curationReasonEn: string;
  curationSource: string;
  curationEvidence: Array<Record<string, unknown>>;
  curationUpdatedAt: string | null;
};

export type ResearchTrackLatestChange = {
  kind: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  confidence: number;
  createdAt: string;
};

export type ResearchRouteRevision = {
  id: string;
  version: number;
  status: "proposed" | "confirmed" | "dismissed" | "superseded";
  inputRevision: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  rationaleZh: string;
  rationaleEn: string;
  previousTitleZh: string;
  previousTitleEn: string;
  previousSummaryZh: string;
  previousSummaryEn: string;
  previousSearchQueries: string[];
  searchQueries: string[];
  sourcePaperIds: string[];
  sourceStatementIds: string[];
  sourcePapers: Array<{ paperId: string; title: string; authors: string; venue: string; publishedAt: string | null }>;
  sourceStatements: Array<{ statementId: string; kind: string; titleZh: string; titleEn: string; textZh: string; textEn: string; confidence: number; sourcePaperIds: string[] }>;
  confidence: number;
  model: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  effectiveness?: ResearchRouteEffectiveness;
};

export type ResearchRouteDiscoveryTask = {
  attempts: number;
  status: "planned" | "active";
};

export type ResearchRouteDiscoveryEffect = {
  attemptCount: number;
  discoveredCount: number;
  deepReviewedCount: number;
  recommendedCount: number;
  acceptedCount: number;
  deepReviewRate: number;
  recommendationRate: number;
  acceptanceRate: number;
  lastScannedAt: string | null;
  staleDays: number | null;
  tasks: {
    frontier: ResearchRouteDiscoveryTask;
    foundation: ResearchRouteDiscoveryTask;
    gap: ResearchRouteDiscoveryTask;
    network: ResearchRouteDiscoveryTask;
  };
};

export type ResearchRoutePortfolio = {
  formalEvidenceCount: number;
  structuralPaperCount: number;
  discoveredCount: number;
  queuedCount: number;
  reviewingCount: number;
  deepReviewedCount: number;
  recommendedCount: number;
  acceptedCount: number;
  pendingEvidenceCount: number;
  readyRouteCount: number;
  degradedRouteCount: number;
  pausedRouteCount: number;
};

export type ResearchRouteMonitoringStatus = "active" | "paused";
export type ResearchRouteOperationalStatus = "paused" | "retryable" | "degraded" | "learning" | "healthy" | "scheduled";
export type ResearchRouteLearningSignal = "paused" | "reinforcing" | "awaiting_feedback" | "rebalancing" | "observing" | "neutral";

export type ResearchRouteAttentionKind = "recover" | "today" | "quality_review" | "confirm_evidence" | "evidence_gap" | "maintain";

export type ResearchRouteAttention = {
  trackId: string;
  kind: ResearchRouteAttentionKind;
  count: number;
  priority: number;
};

export function researchRouteAttention(track: ResearchTrack): ResearchRouteAttention {
  if (track.monitoringStatus === "paused") return { trackId: track.id, kind: "maintain", count: 0, priority: -1 };
  const visibleEvidence = track.papers.length;
  const inQualityReview = Math.max(0, track.queuedForReviewCount) + Math.max(0, track.reviewingForReviewCount);
  const unhandledRecommendations = Math.max(0, track.recommendedCandidateCount - track.discoveryEffect.acceptedCount);
  if (!visibleEvidence || ["retryable", "empty", "failed"].includes(track.buildStatus)) {
    return { trackId: track.id, kind: "recover", count: visibleEvidence, priority: 600 + Number(!visibleEvidence) * 50 };
  }
  if (track.buildStatus === "partial") return { trackId: track.id, kind: "recover", count: visibleEvidence, priority: 560 };
  if (unhandledRecommendations > 0) return { trackId: track.id, kind: "today", count: unhandledRecommendations, priority: 500 };
  if (inQualityReview > 0) return { trackId: track.id, kind: "quality_review", count: inQualityReview, priority: 440 };
  if (track.pendingEvidenceCount > 0) return { trackId: track.id, kind: "confirm_evidence", count: track.pendingEvidenceCount, priority: 380 };
  if (track.intelligence?.evidenceGapZh || track.intelligence?.evidenceGapEn) {
    return { trackId: track.id, kind: "evidence_gap", count: 1, priority: 300 };
  }
  const staleBonus = track.discoveryEffect.staleDays !== null && track.discoveryEffect.staleDays >= 7 ? 80 : 0;
  return { trackId: track.id, kind: "maintain", count: 0, priority: 100 + staleBonus };
}

export function selectResearchRouteAttention(tracks: ResearchTrack[]) {
  return tracks.filter((track) => track.monitoringStatus !== "paused").map(researchRouteAttention).sort((left, right) => right.priority - left.priority
    || left.trackId.localeCompare(right.trackId))[0] || null;
}

export function researchRouteOperationalStatus(track: ResearchTrack): ResearchRouteOperationalStatus {
  if (track.monitoringStatus === "paused") return "paused";
  const visibleEvidence = track.papers?.length || 0;
  if (["retryable", "empty", "failed"].includes(track.buildStatus) || (track.buildStatus === "ready" && !visibleEvidence)) return "retryable";
  if (track.buildStatus === "partial" || track.intelligenceStatus === "retryable") return "degraded";
  if ((track.queuedForReviewCount || 0) + (track.reviewingForReviewCount || 0) > 0
    || track.intelligenceStatus === "pending" || track.intelligenceStatus === "running") return "learning";
  if (track.buildStatus === "ready") return "healthy";
  return "scheduled";
}

export type ResearchLeadGapOrigin = "problem" | "gap";

export function researchLeadActionableGap(input: {
  hasAssessment: boolean;
  assessmentStale: boolean;
  assessmentQuery?: string | null;
  synthesisQuery?: string | null;
  routeQuery?: string | null;
}): { origin: ResearchLeadGapOrigin; query: string } | null {
  if (input.hasAssessment) {
    const query = input.assessmentStale ? "" : input.assessmentQuery?.trim() || "";
    return query ? { origin: "problem", query } : null;
  }
  const query = input.synthesisQuery?.trim() || input.routeQuery?.trim() || "";
  return query ? { origin: "gap", query } : null;
}

export function researchRouteLearningSignal(track: ResearchTrack): ResearchRouteLearningSignal {
  if (track.monitoringStatus === "paused") return "paused";
  const effect = track.discoveryEffect;
  if ((effect?.acceptedCount || 0) > 0) return "reinforcing";
  if ((effect?.recommendedCount || 0) > (effect?.acceptedCount || 0)) return "awaiting_feedback";
  if ((effect?.deepReviewedCount || 0) >= 3 && !(effect?.recommendedCount || 0)) return "rebalancing";
  if ((effect?.discoveredCount || 0) > 0 || (track.queuedForReviewCount || 0) + (track.reviewingForReviewCount || 0) > 0) return "observing";
  return "neutral";
}

export type ResearchTrack = {
  id: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  expansionCount: number;
  userRole: ResearchDirectionRole;
  monitoringStatus: ResearchRouteMonitoringStatus;
  depthScore: number;
  supportScore: number;
  interactionScore: number;
  heatScore: number;
  heatLevel: ResearchHeatLevel;
  recentPaperCount: number;
  confirmedEvidenceCount: number;
  pendingEvidenceCount: number;
  queuedForReviewCount: number;
  reviewingForReviewCount: number;
  recommendedCandidateCount: number;
  lastQueuedAt: string | null;
  discoveryEffect: ResearchRouteDiscoveryEffect;
  latestChange: ResearchTrackLatestChange | null;
  routeRevisions?: ResearchRouteRevision[];
  buildStatus: ResearchTrackBuildStatus;
  buildAttemptCount: number;
  buildSourceStatuses: Array<{
    source: string;
    role: ResearchTrackRole | "baseline";
    status: ResearchTrackSourceStatus;
    candidateCount: number;
  }>;
  buildError: string | null;
  buildRetryAt: string | null;
  intelligence: ResearchDirectionIntelligence | null;
  intelligenceStatus: "pending" | "running" | "retryable" | "ready";
  intelligenceRetryAt: string | null;
  intelligenceRefreshRequestedAt: string | null;
  updatedAt: string;
  papers: ResearchTrackPaper[];
  deactivatedPapers?: ResearchTrackPaper[];
};

export type ResearchTrackEdge = {
  id: string;
  sourceTrackId: string;
  targetTrackId: string;
  kind: "builds_on" | "bridges" | "supports";
  relationshipZh: string;
  relationshipEn: string;
  strength: number;
};

export type ResearchPaperEdge = {
  id: string;
  sourcePaperId: string;
  targetPaperId: string;
  kind: ResearchPaperEdgeKind;
  relationKind: string;
  relationshipZh: string;
  relationshipEn: string;
  confidence: number;
  evidenceSource: string;
};

export type ResearchPaperNetworkState = {
  status: ResearchPaperNetworkStatus;
  paperCount: number;
  totalPaperCount: number;
  builtPaperCount: number;
  coveredPaperIds: string[];
  coveredPaperHash: string;
  coverageRevision: number;
  coverageCursor: number;
  paperRevision: string;
  builtPaperRevision: string;
  citationEdgeCount: number;
  similarityEdgeCount: number;
  semanticEdgeCount: number;
  /** Legacy response field. Reading order is sourced from LearningPathState. */
  pathEdgeCount: number;
  model: string;
  sources: string[];
  updatedAt: string | null;
  error: string | null;
};

export type ResearchMapState = {
  tracks: ResearchTrack[];
  routePortfolio: ResearchRoutePortfolio;
  edges: ResearchTrackEdge[];
  paperEdges: ResearchPaperEdge[];
  paperNetwork: ResearchPaperNetworkState;
  model: string;
  generated: boolean;
  needsStructure?: boolean;
  buildProgress?: {
    ready: number;
    total: number;
    pendingTrackIds: string[];
    retryableTrackIds?: string[];
    partialTrackIds?: string[];
    emptyTrackIds?: string[];
    failedTrackIds?: string[];
  };
  intelligenceProgress?: {
    ready: number;
    total: number;
    pendingTrackIds: string[];
    retryableTrackIds?: string[];
    runningTrackIds?: string[];
    staleTrackIds?: string[];
  };
  precisionAuditProgress?: {
    pending: number;
    shadow: number;
    highConfidenceOffTopic: number;
  };
};

export function emptyResearchMapState(): ResearchMapState {
  return {
    tracks: [],
    edges: [],
    paperEdges: [],
    routePortfolio: {
      formalEvidenceCount: 0,
      structuralPaperCount: 0,
      discoveredCount: 0,
      queuedCount: 0,
      reviewingCount: 0,
      deepReviewedCount: 0,
      recommendedCount: 0,
      acceptedCount: 0,
      pendingEvidenceCount: 0,
      readyRouteCount: 0,
      degradedRouteCount: 0,
      pausedRouteCount: 0,
    },
    paperNetwork: {
      status: "idle",
      paperCount: 0,
      totalPaperCount: 0,
      builtPaperCount: 0,
      coveredPaperIds: [],
      coveredPaperHash: "",
      coverageRevision: 0,
      coverageCursor: 0,
      paperRevision: "",
      builtPaperRevision: "",
      citationEdgeCount: 0,
      similarityEdgeCount: 0,
      semanticEdgeCount: 0,
      pathEdgeCount: 0,
      model: "",
      sources: [],
      updatedAt: null,
      error: null,
    },
    model: "deepseek-v4-pro",
    generated: false,
  };
}
