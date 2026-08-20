export type ResearchTrackRole = "foundation" | "milestone" | "frontier";
export type ResearchDirectionRole = "core" | "support" | "explore";
export type ResearchHeatLevel = "hot" | "rising" | "steady" | "quiet";
export type ResearchTrackBuildStatus = "queued" | "ready";
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
};

export type ResearchTrack = {
  id: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  expansionCount: number;
  userRole: ResearchDirectionRole;
  depthScore: number;
  supportScore: number;
  interactionScore: number;
  heatScore: number;
  heatLevel: ResearchHeatLevel;
  recentPaperCount: number;
  buildStatus: ResearchTrackBuildStatus;
  intelligence: ResearchDirectionIntelligence | null;
  updatedAt: string;
  papers: ResearchTrackPaper[];
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
  pathEdgeCount: number;
  model: string;
  sources: string[];
  updatedAt: string | null;
  error: string | null;
};

export type ResearchMapState = {
  tracks: ResearchTrack[];
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
  };
  intelligenceProgress?: {
    ready: number;
    total: number;
    pendingTrackIds: string[];
  };
};
