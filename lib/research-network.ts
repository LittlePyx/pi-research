export type ResearchNetworkCandidateStatus = "ghost" | "accepted" | "dismissed";
export type ResearchNetworkRelationKind = "reference" | "citation" | "recommendation";
export type ResearchNetworkRelationDirection = "seed_cites_candidate" | "candidate_cites_seed" | "undirected";

export type ResearchNetworkSeed = {
  paperId: string;
  canonicalId: string;
  s2PaperId?: string;
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
  evidenceSource: "semantic-scholar";
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
  semanticScholar: "ok" | "partial" | "unavailable" | "cached" | "not_attempted";
  openAlex: "not_attempted" | "unavailable";
  similarity: "ok" | "partial" | "unavailable" | "cached" | "not_attempted";
};

export type ResearchNetworkExpandResponse = {
  status: "ok" | "partial" | "unavailable" | "rate_limited";
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
    evidenceSource: "semantic-scholar",
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
