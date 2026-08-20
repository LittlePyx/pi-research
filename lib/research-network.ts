export type ResearchNetworkCandidateStatus = "ghost" | "accepted" | "dismissed";
export type ResearchNetworkRelationKind = "reference" | "citation" | "recommendation";
export type ResearchNetworkRelationDirection = "seed_cites_candidate" | "candidate_cites_seed" | "undirected";

export type ResearchNetworkSeed = {
  paperId: string;
  canonicalId: string;
  s2PaperId?: string;
  openAlexId?: string;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  citationCount: number;
};

export type ResearchNetworkCandidateRelation = {
  seedCanonicalId: string;
  seedCanonicalIds: string[];
  joint: boolean;
  kind: ResearchNetworkRelationKind;
  direction: ResearchNetworkRelationDirection;
  isInfluential: boolean;
  evidenceSource: "semantic-scholar" | "openalex";
};

export type ResearchNetworkCandidate = {
  id: string;
  canonicalId: string;
  s2PaperId?: string;
  openAlexId?: string;
  doi?: string;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  citationCount: number;
  abstractText: string;
  score: number;
  seedCoverage: number;
  verifiedSeedCoverage: number;
  bridge: boolean;
  status: ResearchNetworkCandidateStatus;
  relations: ResearchNetworkCandidateRelation[];
};

export type ResearchNetworkSimilarityEdge = {
  sourceCanonicalId: string;
  targetCanonicalId: string;
  weight: number;
  sharedReferences: number;
  kind: "bibliographic_coupling" | "verified_citation";
  renderAs: "similarity" | "directed_citation";
  fallback: boolean;
  direction?: "source_cites_target";
  evidenceSource: "semantic-scholar" | "openalex";
};

export type ResearchNetworkIssue = {
  source: "semantic-scholar" | "openalex" | "cache" | "quota";
  code: string;
  message: string;
  retryable: boolean;
  seedCanonicalId?: string;
  retryAfterSeconds?: number;
};

export type ResearchNetworkSourceStatus = {
  semanticScholar: "ok" | "empty" | "partial" | "unavailable" | "cached" | "not_attempted";
  openAlex: "ok" | "empty" | "partial" | "unavailable" | "cached" | "not_attempted";
  similarity: "ok" | "partial" | "unavailable" | "cached" | "not_attempted";
};

export type ResearchNetworkExpandResponse = {
  status: "ok" | "no_matches" | "partial" | "unavailable" | "rate_limited";
  seeds: ResearchNetworkSeed[];
  candidates: ResearchNetworkCandidate[];
  similarityEdges: ResearchNetworkSimilarityEdge[];
  cached: boolean;
  stale: boolean;
  externalUnavailable: boolean;
  sourceStatus: ResearchNetworkSourceStatus;
  errors: string[];
  issues: ResearchNetworkIssue[];
  cache: {
    hitSeedCanonicalIds: string[];
    expandedSeedCanonicalIds: string[];
  };
  retryAfterSeconds: number | null;
  expiresAt: string | null;
};

export function verifiedSeedCoverage(relations: ResearchNetworkCandidateRelation[]) {
  return new Set(relations.filter((relation) => relation.kind !== "recommendation").map((relation) => relation.seedCanonicalId)).size;
}

export function isVerifiedBridge(relations: ResearchNetworkCandidateRelation[]) {
  return verifiedSeedCoverage(relations) >= 2;
}

export function verifiedRelationFallbackEdge(candidateCanonicalId: string, relation: ResearchNetworkCandidateRelation): ResearchNetworkSimilarityEdge | null {
  if (relation.kind === "recommendation") return null;
  const sourceCanonicalId = relation.direction === "candidate_cites_seed" ? candidateCanonicalId : relation.seedCanonicalId;
  const targetCanonicalId = relation.direction === "candidate_cites_seed" ? relation.seedCanonicalId : candidateCanonicalId;
  return {
    sourceCanonicalId,
    targetCanonicalId,
    weight: relation.isInfluential ? 100 : 88,
    sharedReferences: 0,
    kind: "verified_citation",
    renderAs: "directed_citation",
    fallback: true,
    direction: "source_cites_target",
    evidenceSource: relation.evidenceSource,
  };
}

export function partitionExpansionSeeds<T extends { id: string; canonicalId: string }>(
  seeds: T[],
  freshSeedIds: Set<string>,
  recommendationFresh: boolean,
  force: boolean,
) {
  const hitSeeds = force ? [] : seeds.filter((seed) => freshSeedIds.has(seed.id));
  const expandSeeds = force ? seeds : seeds.filter((seed) => !freshSeedIds.has(seed.id));
  return { hitSeeds, expandSeeds, fullyCached: !force && !expandSeeds.length && recommendationFresh };
}

export function isPositiveExpansionResult(
  resultCount: number,
  errorCount: number,
  emptyRelationCount = 0,
  circuitOpen = false,
) {
  return resultCount > 0 && errorCount === 0 && emptyRelationCount === 0 && !circuitOpen;
}

export function shouldUseOpenAlexFallback(values: {
  seedCount: number;
  semanticScholarResolvedSeedCount: number;
  semanticScholarDirectCandidateCount: number;
  semanticScholarRecommendationCount: number;
  semanticScholarErrorCount: number;
  semanticScholarEmptyRelationCount: number;
}) {
  if (values.seedCount <= 0) return false;
  return values.semanticScholarResolvedSeedCount < values.seedCount
    || values.semanticScholarDirectCandidateCount === 0
    || values.semanticScholarRecommendationCount === 0
    || values.semanticScholarErrorCount > 0
    || values.semanticScholarEmptyRelationCount > 0;
}

export function similarityStatusForEdgeCount(edgeCount: number): "ok" | "not_attempted" {
  return edgeCount > 0 ? "ok" : "not_attempted";
}

export function isFreshDiscoveryCacheEntry(
  state: { status: string; expiresAt: string | null; lastExpandedAt?: string | null } | null | undefined,
  hasVisibleEvidence: boolean,
  now = Date.now(),
) {
  const parseTimestamp = (value: string | null | undefined) => {
    if (!value) return Number.NaN;
    // SQLite CURRENT_TIMESTAMP is stored as `YYYY-MM-DD HH:mm:ss` without an
    // explicit zone. D1 timestamps are UTC, so normalize that legacy shape
    // before comparing it with ISO expiry values.
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
    return Date.parse(normalized);
  };
  if (!state) return false;
  const expiresAt = parseTimestamp(state.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  if (state.status === "ready") return hasVisibleEvidence;
  if (!["no_matches", "partial", "unavailable", "exhausted"].includes(state.status)) return false;
  const lastExpandedAt = parseTimestamp(state.lastExpandedAt);
  if (!Number.isFinite(lastExpandedAt)) return false;
  const negativeCacheExpiresAt = Math.min(expiresAt, lastExpandedAt + 15 * 60_000);
  return negativeCacheExpiresAt > now;
}

export function relationOffsetsForExpansion(
  state: { referenceOffset: number; citationOffset: number } | null | undefined,
  recheckCitations: boolean,
) {
  const reference = state?.referenceOffset ?? 0;
  const storedCitation = state?.citationOffset ?? 0;
  return {
    reference,
    citation: recheckCitations && storedCitation < 0 ? 0 : storedCitation,
  };
}

export function advanceOpenAlexSeedCursor(
  current: { neighborOffset: number; citationPage: number },
  outcome: { neighborSucceeded: boolean; citationSucceeded: boolean; citationResultCount: number },
  neighborStep = 20,
  citationPageSize = 40,
) {
  return {
    neighborOffset: outcome.neighborSucceeded ? Math.max(0, current.neighborOffset) + neighborStep : Math.max(0, current.neighborOffset),
    citationPage: outcome.citationSucceeded
      ? outcome.citationResultCount >= citationPageSize ? Math.max(1, current.citationPage) + 1 : 1
      : Math.max(1, current.citationPage),
  };
}

export function discoveryStateForCoverage(values: {
  visible: boolean;
  coverageComplete: boolean;
  issueCount: number;
  attempted: boolean;
  exhausted?: boolean;
}): "ready" | "no_matches" | "partial" | "unavailable" | "exhausted" {
  const cleanCoverage = values.coverageComplete && values.issueCount === 0;
  if (values.visible && cleanCoverage) return "ready";
  if (values.visible) return "partial";
  if (values.exhausted && cleanCoverage) return "exhausted";
  if (cleanCoverage) return "no_matches";
  return values.attempted || values.coverageComplete ? "partial" : "unavailable";
}

export function classifyCoverageStatuses(statuses: Array<string | null | undefined>): "ok" | "no_matches" | "partial" | "unavailable" {
  const covered = (status: string | null | undefined) => status === "ready" || status === "no_matches" || status === "exhausted";
  if (statuses.length && statuses.every(covered)) {
    return statuses.some((status) => status === "ready") ? "ok" : "no_matches";
  }
  return statuses.some(covered) ? "partial" : "unavailable";
}

export function classifyNoNovelCoverage(values: {
  allTargetsCovered: boolean;
  anyTargetCovered: boolean;
  errorCount: number;
  hasPartialSource: boolean;
  rateLimited: boolean;
}): "no_matches" | "partial" | "unavailable" | "rate_limited" {
  if (values.allTargetsCovered && values.errorCount === 0 && !values.hasPartialSource) return "no_matches";
  if (values.anyTargetCovered) return "partial";
  return values.rateLimited ? "rate_limited" : "unavailable";
}

export function fairRoundRobinRelations<T>(
  entries: T[],
  seedOrder: string[],
  candidateId: (entry: T) => string,
  seedId: (entry: T) => string,
  limit: number,
) {
  const queues = new Map(seedOrder.map((seed) => [seed, entries.filter((entry) => seedId(entry) === seed)]));
  const cursors = new Map(seedOrder.map((seed) => [seed, 0]));
  const selected = new Set<string>();
  let progressed = true;
  while (selected.size < limit && progressed) {
    progressed = false;
    for (const seed of seedOrder) {
      const queue = queues.get(seed) || [];
      let cursor = cursors.get(seed) || 0;
      while (cursor < queue.length && selected.has(candidateId(queue[cursor]))) cursor += 1;
      cursors.set(seed, cursor);
      if (cursor >= queue.length) continue;
      selected.add(candidateId(queue[cursor]));
      cursors.set(seed, cursor + 1);
      progressed = true;
      if (selected.size >= limit) break;
    }
  }
  return entries.filter((entry) => selected.has(candidateId(entry)));
}
