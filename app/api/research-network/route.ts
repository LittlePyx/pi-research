import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import type {
  ResearchNetworkCandidate,
  ResearchNetworkCandidateRelation,
  ResearchNetworkCandidateStatus,
  ResearchNetworkExpandResponse,
  ResearchNetworkIssue,
  ResearchNetworkRelationDirection,
  ResearchNetworkRelationKind,
  ResearchNetworkSeed,
  ResearchNetworkSimilarityEdge,
  ResearchNetworkSourceStatus,
} from "../../../lib/research-network";
import {
  advanceOpenAlexSeedCursor,
  classifyCoverageStatuses,
  classifyNoNovelCoverage,
  discoveryStateForCoverage,
  isVerifiedBridge,
  fairRoundRobinRelations,
  isFreshDiscoveryCacheEntry,
  partitionExpansionSeeds,
  relationOffsetsForExpansion,
  shouldUseOpenAlexFallback,
  similarityStatusForEdgeCount,
  verifiedRelationFallbackEdge,
  verifiedSeedCoverage,
} from "../../../lib/research-network";
import {
  compatibleResearchWorkMetadata,
  enqueueMonitorCandidates,
  researchWorkIdentitySignature,
  type MonitorCandidateQueueResult,
} from "../../../lib/monitor-candidate-queue";
import { confirmedExternalResearchMapEvidenceStatements, researchEvidenceHorizon } from "../../../lib/research-map-evidence";
import { fetchSemanticScholar, SemanticScholarQuotaError, SemanticScholarRateLimitError } from "../../../lib/semantic-scholar";

type SpaceRow = { id: string };
type SeedRow = {
  id: string;
  track_id: string;
  canonical_id: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  citation_count: number;
  role: string;
  confirmed: number;
};
type CandidateRow = {
  id: string;
  canonical_id: string;
  s2_paper_id: string | null;
  openalex_id: string | null;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  citation_count: number;
  abstract_text: string;
  status: string;
  score: number;
  expires_at: string | null;
};
type CandidateEdgeRow = {
  candidate_id: string;
  seed_paper_id: string;
  seed_canonical_id: string;
  kind: string;
  direction: string;
  is_influential: number;
  evidence_source: string;
  expansion_key: string;
  seed_set_json: string;
  expires_at: string | null;
};
type SeedExpansionStateRow = {
  seed_paper_id: string;
  reference_offset: number;
  citation_offset: number;
  openalex_neighbor_offset: number;
  openalex_citation_page: number;
  status: string;
  last_expanded_at: string | null;
  expires_at: string | null;
};
type ExpansionStateRow = {
  expansion_key: string;
  recommendation_offset: number;
  status: string;
  expires_at: string | null;
  similarity_json: string;
  similarity_status: string;
  similarity_expires_at: string | null;
  lock_token: string | null;
  lock_expires_at: string | null;
  last_expanded_at: string | null;
};
type SemanticScholarPaper = {
  paperId?: string;
  externalIds?: { DOI?: string; ArXiv?: string } | null;
  title?: string;
  abstract?: string | null;
  authors?: Array<{ name?: string }> | null;
  venue?: string | null;
  url?: string | null;
  publicationDate?: string | null;
  year?: number | null;
  citationCount?: number | null;
  publicationTypes?: string[] | null;
  references?: Array<{ paperId?: string; externalIds?: { DOI?: string; ArXiv?: string } | null }> | null;
};
type SemanticScholarRelation = {
  citedPaper?: SemanticScholarPaper | null;
  citingPaper?: SemanticScholarPaper | null;
  contexts?: string[] | null;
  intents?: string[] | null;
  isInfluential?: boolean;
};
type SemanticScholarRelationResponse = { data?: SemanticScholarRelation[] | null; next?: number };
type SemanticScholarRecommendationResponse = { recommendedPapers?: SemanticScholarPaper[] };
type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  display_name?: string | null;
  title?: string | null;
  authorships?: Array<{ author?: { display_name?: string | null } | null }> | null;
  primary_location?: { landing_page_url?: string | null; source?: { display_name?: string | null } | null } | null;
  publication_date?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  referenced_works?: string[] | null;
  related_works?: string[] | null;
  is_retracted?: boolean;
  type?: string | null;
};
type OpenAlexListResponse = { results?: OpenAlexWork[] | null };
type InternalRelation = ResearchNetworkCandidateRelation & {
  seedPaperId: string;
  storageKind: string;
  expansionKey: string;
  intents: string[];
  contexts: string[];
  score: number;
};
type InternalCandidate = Omit<ResearchNetworkCandidate, "id" | "score" | "seedCoverage" | "verifiedSeedCoverage" | "bridge" | "status" | "relations"> & {
  s2PaperId?: string;
  openAlexId?: string;
  doi?: string;
  metadataSource: "semantic-scholar" | "openalex";
  relations: Map<string, InternalRelation>;
};

const CACHE_HOURS = 24;
const MAX_SEEDS = 3;
const MAX_CANDIDATES = 24;
const DEFAULT_CANDIDATES = 18;
const RELATION_PAGE_SIZE = 40;
const RECOMMENDATION_POOL_SIZE = 100;
const RECOMMENDATION_PAGE_SIZE = 20;
const NEGATIVE_CACHE_MS = 15 * 60_000;
const OPENALEX_CALL_LIMIT = 9;
const OPENALEX_CANDIDATE_LIMIT = 18;
const OPENALEX_PAGE_SIZE = 40;
const EXPANSION_LOCK_LEASE_MS = 120_000;
const NON_PAPER = /(publication information|information for authors|instructions for authors|table of contents|editorial board|front matter|back matter|issue information|journal masthead|correction|erratum)/i;
const RELATION_KINDS = new Set<ResearchNetworkRelationKind>(["reference", "citation", "recommendation"]);
const DIRECTIONS = new Set<ResearchNetworkRelationDirection>(["seed_cites_candidate", "candidate_cites_seed", "undirected"]);
const CANDIDATE_STATUSES = new Set<ResearchNetworkCandidateStatus>(["ghost", "accepted", "dismissed"]);
const TRACK_ROLES = new Set(["foundation", "milestone", "frontier"]);

type ExternalCallBudget = { database: D1Database; spaceId: string };
type OpenAlexCallBudget = { remaining: number };

function cleanText(value: unknown) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function isSemanticScholarCircuitError(error: unknown): error is SemanticScholarRateLimitError | SemanticScholarQuotaError {
  return error instanceof SemanticScholarRateLimitError || error instanceof SemanticScholarQuotaError;
}

function reportNetworkSourceError(error: unknown, kind: "rate" | "seed" | "relation" | "recommendation" | "similarity" | "upstream") {
  const correlationId = crypto.randomUUID();
  console.error(`[research-network:${correlationId}] ${kind}`, error);
  if (error instanceof SemanticScholarRateLimitError) {
    return `Academic graph requests are cooling down. Cached verified results are shown; retry in about ${error.retryAfterSeconds} seconds.`;
  }
  if (error instanceof SemanticScholarQuotaError) return "Today's academic-graph request budget is exhausted. Cached verified results remain available.";
  if (kind === "seed") return "One or more selected seed papers could not be matched in the academic graph.";
  if (kind === "similarity") return "Paper-similarity links could not be refreshed; verified citation links remain available.";
  if (kind === "recommendation") return "Related-paper recommendations could not be refreshed; verified citation results remain available.";
  if (kind === "relation") return "Some verified citation links could not be refreshed; cached links remain available.";
  return "Part of the academic graph could not be refreshed; cached verified results remain available.";
}

function reportOpenAlexSourceError(error: unknown) {
  const correlationId = crypto.randomUUID();
  console.error(`[research-network:${correlationId}] openalex`, error);
  return "OpenAlex fallback discovery could not be completed; any verified results already found remain available.";
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, Math.round(numeric))) : fallback;
}

function asCandidateStatus(value: string): ResearchNetworkCandidateStatus {
  return CANDIDATE_STATUSES.has(value as ResearchNetworkCandidateStatus) ? value as ResearchNetworkCandidateStatus : "ghost";
}

function storedRelationKind(value: string): ResearchNetworkRelationKind | null {
  if (value.startsWith("recommendation:")) return "recommendation";
  return RELATION_KINDS.has(value as ResearchNetworkRelationKind) ? value as ResearchNetworkRelationKind : null;
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(cleanText).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function semanticScholarIdentifier(seed: SeedRow) {
  if (seed.doi) return `DOI:${seed.doi}`;
  if (seed.canonical_id.startsWith("s2:")) return seed.canonical_id.slice(3);
  if (seed.canonical_id.startsWith("arxiv:")) return `ARXIV:${seed.canonical_id.slice(6)}`;
  const arxiv = seed.url.match(/arxiv\.org\/(?:abs|pdf)\/([^?#/.]+(?:\.\d+)?)/i)?.[1];
  return arxiv ? `ARXIV:${arxiv}` : "";
}

async function seedSetKey(canonicalIds: string[]) {
  const normalized = Array.from(new Set(canonicalIds)).sort().join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest)).slice(0, 12).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function canonicalId(paper: SemanticScholarPaper) {
  const doi = cleanText(paper.externalIds?.DOI).toLocaleLowerCase();
  if (doi) return `doi:${doi}`;
  const arxiv = cleanText(paper.externalIds?.ArXiv).toLocaleLowerCase();
  if (arxiv) return `arxiv:${arxiv}`;
  const s2 = cleanText(paper.paperId);
  return s2 ? `s2:${s2}` : "";
}

function normalizePaper(paper: SemanticScholarPaper): InternalCandidate | null {
  const title = cleanText(paper.title);
  const s2PaperId = cleanText(paper.paperId);
  const canonical = canonicalId(paper);
  if (!s2PaperId || !canonical || title.length < 8 || NON_PAPER.test(title)) return null;
  const doi = cleanText(paper.externalIds?.DOI).toLocaleLowerCase() || undefined;
  const publishedAt = cleanText(paper.publicationDate) || (paper.year ? `${paper.year}-01-01` : null);
  return {
    canonicalId: canonical,
    s2PaperId,
    doi,
    title,
    authors: (paper.authors || []).slice(0, 8).map((author) => cleanText(author.name)).filter(Boolean).join(", "),
    venue: cleanText(paper.venue),
    url: cleanText(paper.url) || (doi ? `https://doi.org/${doi}` : `https://www.semanticscholar.org/paper/${s2PaperId}`),
    publishedAt,
    citationCount: Math.max(0, Math.round(paper.citationCount || 0)),
    abstractText: cleanText(paper.abstract).slice(0, 3000),
    metadataSource: "semantic-scholar",
    relations: new Map(),
  };
}

function openAlexId(value: unknown) {
  const normalized = cleanText(value).replace(/^https?:\/\/openalex\.org\//i, "");
  return /^W\d+$/i.test(normalized) ? normalized.toUpperCase() : "";
}

function openAlexDoi(value: unknown) {
  return cleanText(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").toLocaleLowerCase();
}

function openAlexAbstract(index: OpenAlexWork["abstract_inverted_index"]) {
  if (!index) return "";
  const positioned: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions || []) if (Number.isFinite(position)) positioned.push([position, word]);
  }
  return positioned.sort((left, right) => left[0] - right[0]).map((entry) => entry[1]).join(" ").slice(0, 3000);
}

function normalizeOpenAlexWork(work: OpenAlexWork): InternalCandidate | null {
  const title = cleanText(work.display_name || work.title);
  const identifier = openAlexId(work.id);
  const doi = openAlexDoi(work.doi) || undefined;
  if (!identifier || title.length < 8 || NON_PAPER.test(title) || work.is_retracted) return null;
  const canonical = doi ? `doi:${doi}` : `openalex:${identifier.toLocaleLowerCase()}`;
  return {
    canonicalId: canonical,
    openAlexId: identifier,
    doi,
    title,
    authors: (work.authorships || []).slice(0, 8).map((authorship) => cleanText(authorship.author?.display_name)).filter(Boolean).join(", "),
    venue: cleanText(work.primary_location?.source?.display_name),
    url: cleanText(work.primary_location?.landing_page_url) || (doi ? `https://doi.org/${doi}` : `https://openalex.org/${identifier}`),
    publishedAt: cleanText(work.publication_date) || (work.publication_year ? `${work.publication_year}-01-01` : null),
    citationCount: Math.max(0, Math.round(work.cited_by_count || 0)),
    abstractText: openAlexAbstract(work.abstract_inverted_index),
    metadataSource: "openalex",
    relations: new Map(),
  };
}

async function openAlexFetch(endpoint: URL, budget: OpenAlexCallBudget) {
  if (budget.remaining <= 0) throw new Error("OpenAlex request limit reached for this expansion");
  budget.remaining -= 1;
  endpoint.searchParams.set("mailto", "pi-research@users.noreply.github.com");
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json", "User-Agent": "Pi-Research/1.0 (mailto:pi-research@users.noreply.github.com)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`OpenAlex returned ${response.status}`);
  return response;
}

const OPENALEX_SEED_FIELDS = "id,doi,display_name,title,authorships,primary_location,publication_date,publication_year,cited_by_count,referenced_works,related_works,is_retracted,type";
const OPENALEX_CANDIDATE_FIELDS = "id,doi,display_name,title,authorships,primary_location,publication_date,publication_year,cited_by_count,abstract_inverted_index,is_retracted,type";

async function resolveOpenAlexSeed(row: SeedRow, budget: OpenAlexCallBudget) {
  const canonicalOpenAlexId = row.canonical_id.startsWith("openalex:") ? openAlexId(row.canonical_id.slice(9)) : "";
  if (canonicalOpenAlexId) {
    const endpoint = new URL(`https://api.openalex.org/works/${canonicalOpenAlexId}`);
    endpoint.searchParams.set("select", OPENALEX_SEED_FIELDS);
    return await (await openAlexFetch(endpoint, budget)).json() as OpenAlexWork;
  }
  const doi = openAlexDoi(row.doi || (row.canonical_id.startsWith("doi:") ? row.canonical_id.slice(4) : ""));
  if (!doi) return null;
  const endpoint = new URL("https://api.openalex.org/works");
  endpoint.searchParams.set("filter", `doi:${doi}`);
  endpoint.searchParams.set("per_page", "1");
  endpoint.searchParams.set("select", OPENALEX_SEED_FIELDS);
  const data = await (await openAlexFetch(endpoint, budget)).json() as OpenAlexListResponse;
  return data.results?.[0] || null;
}

async function fetchOpenAlexWorkBatch(ids: string[], budget: OpenAlexCallBudget) {
  const normalized = Array.from(new Set(ids.map(openAlexId).filter(Boolean))).slice(0, 50);
  if (!normalized.length) return [] as OpenAlexWork[];
  const endpoint = new URL("https://api.openalex.org/works");
  endpoint.searchParams.set("filter", `openalex:${normalized.join("|")}`);
  endpoint.searchParams.set("per_page", String(normalized.length));
  endpoint.searchParams.set("select", OPENALEX_CANDIDATE_FIELDS);
  const data = await (await openAlexFetch(endpoint, budget)).json() as OpenAlexListResponse;
  return Array.isArray(data.results) ? data.results : [];
}

function openAlexRelation(
  seed: SeedRow,
  kind: ResearchNetworkRelationKind,
  direction: ResearchNetworkRelationDirection,
  expansionKey: string,
) : InternalRelation {
  return {
    seedPaperId: seed.id,
    seedCanonicalId: seed.canonical_id,
    seedCanonicalIds: [seed.canonical_id],
    joint: false,
    kind,
    storageKind: kind === "recommendation" ? `recommendation:openalex:${expansionKey}:${seed.id}` : kind,
    expansionKey: kind === "recommendation" ? expansionKey : "",
    direction,
    isInfluential: false,
    evidenceSource: "openalex",
    intents: [],
    contexts: [],
    score: kind === "recommendation" ? 64 : 86,
  };
}

function rotatedIds(ids: string[], offset: number, limit: number) {
  if (!ids.length) return [];
  const start = Math.max(0, offset) % ids.length;
  return [...ids.slice(start), ...ids.slice(0, start)].slice(0, limit);
}

async function fetchOpenAlexExpansion(
  seedRows: SeedRow[],
  expansionKey: string,
  seedStates: Map<string, SeedExpansionStateRow>,
  budget: OpenAlexCallBudget,
) {
  const rawResults: Array<{ candidate: InternalCandidate; relation: InternalRelation }> = [];
  const errors: string[] = [];
  const neighborErrors: string[] = [];
  const citationErrors: string[] = [];
  const seedErrors = new Map<string, string[]>();
  const cursorUpdates = new Map<string, { neighborOffset: number; citationPage: number }>();
  const resolvedSeeds: Array<{ row: SeedRow; work: OpenAlexWork }> = [];
  let successfulDiscoveryCalls = 0;
  const successfulNeighborSeedIds = new Set<string>();
  const successfulCitationSeedIds = new Set<string>();
  const rememberError = (row: SeedRow, message: string, streams: Array<"neighbor" | "citation">) => {
    errors.push(message);
    seedErrors.set(row.id, [...(seedErrors.get(row.id) || []), message]);
    if (streams.includes("neighbor")) neighborErrors.push(message);
    if (streams.includes("citation")) citationErrors.push(message);
  };
  for (const row of seedRows.slice(0, MAX_SEEDS)) {
    try {
      const work = await resolveOpenAlexSeed(row, budget);
      if (work && openAlexId(work.id)) resolvedSeeds.push({ row, work });
      else rememberError(row, "OpenAlex fallback could not match one selected seed paper.", ["neighbor", "citation"]);
    } catch (error) {
      rememberError(row, reportOpenAlexSourceError(error), ["neighbor", "citation"]);
    }
  }
  for (const { row, work } of resolvedSeeds) {
    const state = seedStates.get(row.id);
    const neighborOffset = Math.max(0, state?.openalex_neighbor_offset ?? 0);
    const citationPage = Math.max(1, state?.openalex_citation_page ?? 1);
    let neighborSucceeded = false;
    let citationSucceeded = false;
    let citationResultCount = 0;
    try {
      const referenceIds = rotatedIds((work.referenced_works || []).map(openAlexId).filter(Boolean), neighborOffset, 30);
      const relatedIds = rotatedIds((work.related_works || []).map(openAlexId).filter(Boolean), neighborOffset, 20);
      const relationById = new Map<string, { kind: ResearchNetworkRelationKind; direction: ResearchNetworkRelationDirection }>();
      for (const id of referenceIds) relationById.set(id, { kind: "reference", direction: "seed_cites_candidate" });
      for (const id of relatedIds) if (!relationById.has(id)) relationById.set(id, { kind: "recommendation", direction: "undirected" });
      const works = await fetchOpenAlexWorkBatch([...referenceIds, ...relatedIds], budget);
      successfulDiscoveryCalls += 1;
      successfulNeighborSeedIds.add(row.id);
      neighborSucceeded = true;
      for (const candidateWork of works) {
        const relationType = relationById.get(openAlexId(candidateWork.id));
        const candidate = normalizeOpenAlexWork(candidateWork);
        if (!candidate || !relationType) continue;
        rawResults.push({ candidate, relation: openAlexRelation(row, relationType.kind, relationType.direction, expansionKey) });
      }
    } catch (error) {
      rememberError(row, reportOpenAlexSourceError(error), ["neighbor"]);
    }
    try {
      const identifier = openAlexId(work.id);
      if (!identifier) continue;
      const endpoint = new URL("https://api.openalex.org/works");
      endpoint.searchParams.set("filter", `cites:${identifier}`);
      endpoint.searchParams.set("per_page", String(OPENALEX_PAGE_SIZE));
      endpoint.searchParams.set("page", String(citationPage));
      endpoint.searchParams.set("select", OPENALEX_CANDIDATE_FIELDS);
      const data = await (await openAlexFetch(endpoint, budget)).json() as OpenAlexListResponse;
      const items = Array.isArray(data.results) ? data.results : [];
      successfulDiscoveryCalls += 1;
      successfulCitationSeedIds.add(row.id);
      citationSucceeded = true;
      citationResultCount = items.length;
      for (const candidateWork of items) {
        const candidate = normalizeOpenAlexWork(candidateWork);
        if (!candidate) continue;
        rawResults.push({ candidate, relation: openAlexRelation(row, "citation", "candidate_cites_seed", expansionKey) });
      }
    } catch (error) {
      rememberError(row, reportOpenAlexSourceError(error), ["citation"]);
    }
    if (neighborSucceeded || citationSucceeded) {
      cursorUpdates.set(row.id, advanceOpenAlexSeedCursor(
        { neighborOffset, citationPage },
        { neighborSucceeded, citationSucceeded, citationResultCount },
        RECOMMENDATION_PAGE_SIZE,
        OPENALEX_PAGE_SIZE,
      ));
    }
  }
  const results = fairRoundRobinRelations(
    rawResults,
    seedRows.map((seed) => seed.id),
    (entry) => entry.candidate.canonicalId,
    (entry) => entry.relation.seedPaperId,
    OPENALEX_CANDIDATE_LIMIT,
  );
  const successfulSeedIds = seedRows
    .filter((seed) => successfulNeighborSeedIds.has(seed.id) && successfulCitationSeedIds.has(seed.id))
    .map((seed) => seed.id);
  const progressedSeedIds = seedRows
    .filter((seed) => successfulNeighborSeedIds.has(seed.id) || successfulCitationSeedIds.has(seed.id))
    .map((seed) => seed.id);
  const recommendationCoverageComplete = seedRows.length > 0
    && seedRows.every((seed) => successfulNeighborSeedIds.has(seed.id));
  return {
    results,
    errors,
    resolvedSeeds,
    attempted: true,
    succeeded: successfulDiscoveryCalls > 0,
    successfulSeedIds,
    progressedSeedIds,
    neighborErrors,
    citationErrors,
    seedErrors,
    cursorUpdates,
    empty: successfulDiscoveryCalls > 0 && !results.length,
    recommendationCoverageComplete,
  };
}

async function semanticScholarFetch(url: URL, init: RequestInit, budget: ExternalCallBudget, scopeKey: string) {
  return fetchSemanticScholar(url, init, {
    database: budget.database,
    spaceId: budget.spaceId,
    scopeKey,
    feature: "research-network",
    featureDailyLimit: 60,
    // A single 429 opens the route-level circuit. Do not spend more of the
    // provider quota retrying the same request during this expansion.
    maxRetries: 1,
  });
}

async function ownedSpace(request: Request, spaceId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 }) };
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1")
    .bind(spaceId, user.userId).first<SpaceRow>();
  if (!space) return { error: Response.json({ error: "Research space not found" }, { status: 404 }) };
  return { database, space };
}

async function resolveSeeds(database: D1Database, spaceId: string, originCanonicalIds: string[]) {
  const all = await database.prepare(
    `SELECT tp.id, tp.track_id, tp.canonical_id, tp.doi, tp.title, tp.authors, tp.venue, tp.url,
     tp.published_at, tp.citation_count, tp.role,
     CASE WHEN EXISTS (
      SELECT 1 FROM research_map_evidence_proposals ep
      JOIN monitored_papers mp ON mp.id = ep.paper_id AND mp.space_id = ep.space_id
      WHERE ep.space_id = tp.space_id AND ep.track_id = tp.track_id
       AND mp.canonical_id = tp.canonical_id AND ep.status = 'confirmed'
     ) THEN 1 ELSE 0 END AS confirmed
     FROM research_track_papers tp WHERE tp.space_id = ?
     ORDER BY confirmed DESC, CASE tp.role WHEN 'frontier' THEN 0 WHEN 'milestone' THEN 1 ELSE 2 END,
      tp.citation_count DESC, tp.created_at ASC`,
  ).bind(spaceId).all<SeedRow>();
  const byCanonical = new Map<string, SeedRow>();
  for (const row of all.results) if (!byCanonical.has(row.canonical_id)) byCanonical.set(row.canonical_id, row);
  return originCanonicalIds.map((canonical) => byCanonical.get(canonical)).filter((row): row is SeedRow => Boolean(row)).slice(0, MAX_SEEDS);
}

function networkCandidateIdentity(candidate: Pick<InternalCandidate, "canonicalId" | "doi" | "title" | "authors" | "publishedAt">) {
  if (candidate.doi) return `doi:${candidate.doi.toLocaleLowerCase()}`;
  const signature = researchWorkIdentitySignature(candidate);
  return cleanText(candidate.title) ? `work:${signature}` : candidate.canonicalId;
}

function primaryNetworkRoutes(candidate: ResearchNetworkCandidate, seedRows: SeedRow[]) {
  const seedByCanonicalId = new Map(seedRows.map((seed) => [seed.canonical_id, seed]));
  const stats = new Map<string, { trackId: string; seedIds: Set<string>; direct: number; confirmed: number; confirmedFrontier: number }>();
  for (const relation of candidate.relations) {
    const relatedCanonicalIds = relation.seedCanonicalIds.length ? relation.seedCanonicalIds : [relation.seedCanonicalId];
    for (const canonicalId of relatedCanonicalIds) {
      const seed = seedByCanonicalId.get(canonicalId);
      if (!seed) continue;
      const current = stats.get(seed.track_id) || {
        trackId: seed.track_id, seedIds: new Set<string>(), direct: 0, confirmed: 0, confirmedFrontier: 0,
      };
      if (!current.seedIds.has(seed.id)) {
        current.seedIds.add(seed.id);
        if (seed.confirmed) current.confirmed += 1;
        if (seed.confirmed && seed.role === "frontier") current.confirmedFrontier += 1;
      }
      if (relation.kind !== "recommendation") current.direct += 1;
      stats.set(seed.track_id, current);
    }
  }
  const ranked = Array.from(stats.values()).sort((left, right) =>
    right.seedIds.size - left.seedIds.size
      || right.direct - left.direct
      || right.confirmedFrontier - left.confirmedFrontier
      || right.confirmed - left.confirmed);
  if (!ranked.length) return [];
  const first = ranked[0];
  // A bridge can be equally supported by multiple routes. Preserve every
  // strongest route as provenance while still queueing one deduplicated paper.
  return ranked.filter((entry) => entry.seedIds.size === first.seedIds.size
    && entry.direct === first.direct
    && entry.confirmedFrontier === first.confirmedFrontier
    && entry.confirmed === first.confirmed).map((entry) => entry.trackId);
}

async function enqueueNetworkReviewCandidates(
  database: D1Database,
  spaceId: string,
  seedRows: SeedRow[],
  candidates: ResearchNetworkCandidate[],
  expansionKey: string,
): Promise<MonitorCandidateQueueResult> {
  const seedTitles = seedRows.map((seed) => seed.title).filter(Boolean).slice(0, 3).join(" | ");
  const routed = candidates.flatMap((candidate) => {
    const trackIds = primaryNetworkRoutes(candidate, seedRows);
    if (!trackIds.length) return [];
    const direct = candidate.relations.some((relation) => relation.kind !== "recommendation");
    return [{
      canonicalId: candidate.canonicalId,
      doi: candidate.doi || null,
      title: candidate.title,
      authors: candidate.authors,
      venue: candidate.venue,
      url: candidate.url,
      publishedAt: candidate.publishedAt,
      abstractText: candidate.abstractText,
      horizon: researchEvidenceHorizon(candidate.publishedAt),
      citationCount: candidate.citationCount,
      relevanceScore: Math.min(68, 46 + (direct ? 6 : 0) + (candidate.bridge ? 5 : 0)
        + Math.round(Math.log1p(Math.max(0, candidate.citationCount)) * 3)),
      qualityScore: Math.min(74, 48 + (direct ? 5 : 0)
        + Math.round(Math.log1p(Math.max(0, candidate.citationCount)) * 4)),
      priorityVenue: false,
      source: "research-network",
      provenance: trackIds.map((trackId) => ({
        sourceKey: "research-route:network",
        channel: direct ? "citation" as const : "semantic" as const,
        queryKey: `${trackId}:network:${expansionKey}`,
        queryText: seedTitles,
        routeId: trackId,
      })),
    }];
  });
  return enqueueMonitorCandidates(database, spaceId, routed, { recordDiscoveryCoverage: true });
}

async function resolveSemanticScholarSeeds(rows: SeedRow[], budget: ExternalCallBudget) {
  const identified = rows.map((row) => ({ row, identifier: semanticScholarIdentifier(row) })).filter((entry) => entry.identifier);
  if (!identified.length) return { seeds: [] as ResearchNetworkSeed[], resolved: [] as Array<{ row: SeedRow; paper: SemanticScholarPaper }>, errors: ["Selected papers do not have DOI, arXiv, or Semantic Scholar identifiers"] };
  const endpoint = new URL("https://api.semanticscholar.org/graph/v1/paper/batch");
  endpoint.searchParams.set("fields", "paperId,externalIds,title,authors,venue,url,publicationDate,year,citationCount");
  const response = await semanticScholarFetch(endpoint, { method: "POST", body: JSON.stringify({ ids: identified.map((entry) => entry.identifier) }) }, budget,
    `seed-lookup:${identified.map((entry) => entry.row.id).sort().join(",")}`);
  if (!response.ok) throw new Error(`Semantic Scholar seed lookup returned ${response.status}`);
  const records = await response.json() as Array<SemanticScholarPaper | null>;
  const resolved: Array<{ row: SeedRow; paper: SemanticScholarPaper }> = [];
  const errors: string[] = [];
  records.forEach((paper, index) => {
    const identifiedSeed = identified[index];
    if (paper?.paperId && identifiedSeed) resolved.push({ row: identifiedSeed.row, paper });
    else if (identifiedSeed) errors.push("One or more selected seed papers could not be matched in the academic graph.");
  });
  const seeds = resolved.map(({ row, paper }): ResearchNetworkSeed => ({
    paperId: row.id,
    canonicalId: row.canonical_id,
    s2PaperId: paper.paperId,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    url: row.url,
    publishedAt: row.published_at,
    citationCount: row.citation_count,
  }));
  return { seeds, resolved, errors };
}

function localSeeds(rows: SeedRow[]): ResearchNetworkSeed[] {
  return rows.map((row) => ({
    paperId: row.id,
    canonicalId: row.canonical_id,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    url: row.url,
    publishedAt: row.published_at,
    citationCount: row.citation_count,
  }));
}

async function fetchSeedRelations(
  seed: { row: SeedRow; paper: SemanticScholarPaper },
  state: SeedExpansionStateRow | undefined,
  budget: ExternalCallBudget,
  recheckCitations: boolean,
) {
  const results: Array<{ paper: SemanticScholarPaper; relation: InternalRelation }> = [];
  const errors: string[] = [];
  const emptyKinds: ResearchNetworkRelationKind[] = [];
  const exhaustedKinds: ResearchNetworkRelationKind[] = [];
  const attemptedKinds: ResearchNetworkRelationKind[] = [];
  const nextOffsets = relationOffsetsForExpansion(state ? {
    referenceOffset: state.reference_offset,
    citationOffset: state.citation_offset,
  } : null, recheckCitations);
  for (const relationKind of ["references", "citations"] as const) {
    const offsetKey = relationKind === "references" ? "reference" : "citation";
    const kind: ResearchNetworkRelationKind = relationKind === "references" ? "reference" : "citation";
    if (nextOffsets[offsetKey] < 0) {
      exhaustedKinds.push(kind);
      continue;
    }
    const endpoint = new URL(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(seed.paper.paperId!)}/${relationKind}`);
    endpoint.searchParams.set("offset", String(nextOffsets[offsetKey]));
    endpoint.searchParams.set("limit", String(RELATION_PAGE_SIZE));
    endpoint.searchParams.set("fields", "paperId,externalIds,title,abstract,authors,venue,url,publicationDate,year,citationCount,publicationTypes,contexts,intents,isInfluential");
    try {
      const response = await semanticScholarFetch(endpoint, {}, budget, `seed:${seed.row.id}`);
      if (!response.ok) throw new Error(`Semantic Scholar ${relationKind} returned ${response.status}`);
      const data = await response.json() as SemanticScholarRelationResponse;
      attemptedKinds.push(kind);
      nextOffsets[offsetKey] = typeof data.next === "number" ? data.next : -1;
      if (nextOffsets[offsetKey] < 0) exhaustedKinds.push(kind);
      const items = Array.isArray(data.data) ? data.data : [];
      let usableCount = 0;
      for (const item of items) {
        const paper = relationKind === "references" ? item.citedPaper : item.citingPaper;
        if (!paper || !normalizePaper(paper)) continue;
        usableCount += 1;
        const direction: ResearchNetworkRelationDirection = relationKind === "references" ? "seed_cites_candidate" : "candidate_cites_seed";
        results.push({
          paper,
          relation: {
            seedPaperId: seed.row.id,
            seedCanonicalId: seed.row.canonical_id,
            seedCanonicalIds: [seed.row.canonical_id],
            joint: false,
            kind,
            storageKind: kind,
            expansionKey: "",
            direction,
            isInfluential: Boolean(item.isInfluential),
            evidenceSource: "semantic-scholar",
            intents: (item.intents || []).map(cleanText).filter(Boolean).slice(0, 8),
            contexts: (item.contexts || []).map(cleanText).filter(Boolean).slice(0, 4),
            score: item.isInfluential ? 100 : 88,
          },
        });
      }
      if (!usableCount) {
        emptyKinds.push(kind);
      }
    } catch (error) {
      // Preserve any references already received when the following citations
      // request opens the circuit. The caller persists this partial page before
      // stopping all remaining Semantic Scholar work.
      if (isSemanticScholarCircuitError(error)) return { results, errors, emptyKinds, exhaustedKinds, attemptedKinds, nextOffsets, circuitError: error };
      errors.push(reportNetworkSourceError(error, "relation"));
    }
  }
  return { results, errors, emptyKinds, exhaustedKinds, attemptedKinds, nextOffsets, circuitError: null as SemanticScholarRateLimitError | SemanticScholarQuotaError | null };
}

function directSeedCoverageComplete(result: Awaited<ReturnType<typeof fetchSeedRelations>> | undefined) {
  if (!result || result.circuitError || result.errors.length) return false;
  const coveredKinds = new Set([...result.attemptedKinds, ...result.exhaustedKinds]);
  return coveredKinds.has("reference") && coveredKinds.has("citation");
}

function recommendationFields(endpoint: URL) {
  endpoint.searchParams.set("limit", String(RECOMMENDATION_POOL_SIZE));
  endpoint.searchParams.set("fields", "paperId,externalIds,title,abstract,authors,venue,url,publicationDate,year,citationCount,publicationTypes");
  return endpoint;
}

function recommendationRelation(seeds: Array<{ row: SeedRow }>, paper: SemanticScholarPaper, expansionKey: string, storageSuffix = "joint") {
  const anchor = seeds[0];
  const seedCanonicalIds = seeds.map((seed) => seed.row.canonical_id);
  return {
    paper,
    relation: {
      seedPaperId: anchor.row.id,
      seedCanonicalId: anchor.row.canonical_id,
      seedCanonicalIds,
      joint: seedCanonicalIds.length > 1,
      kind: "recommendation" as const,
      storageKind: `recommendation:${expansionKey}:${storageSuffix}`,
      expansionKey,
      direction: "undirected" as const,
      isInfluential: false,
      evidenceSource: "semantic-scholar" as const,
      intents: [],
      contexts: [],
      score: 68,
    },
  };
}

function rotatedRecommendationPage(papers: SemanticScholarPaper[], offset: number) {
  if (!papers.length) return { papers: [] as SemanticScholarPaper[], nextOffset: 0 };
  const start = offset % papers.length;
  const rotated = [...papers.slice(start), ...papers.slice(0, start)].slice(0, RECOMMENDATION_PAGE_SIZE);
  return { papers: rotated, nextOffset: (start + RECOMMENDATION_PAGE_SIZE) % papers.length };
}

async function fetchRecommendations(
  resolved: Array<{ row: SeedRow; paper: SemanticScholarPaper }>,
  expansionKey: string,
  offset: number,
  budget: ExternalCallBudget,
) {
  const results: Array<{ paper: SemanticScholarPaper; relation: InternalRelation }> = [];
  const errors: string[] = [];
  if (!resolved.length) return { results, errors, nextOffset: offset, attempted: false, succeeded: false, empty: false };
  if (resolved.length > 1) {
    try {
      const endpoint = recommendationFields(new URL("https://api.semanticscholar.org/recommendations/v1/papers"));
      const response = await semanticScholarFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ positivePaperIds: resolved.map((seed) => seed.paper.paperId), negativePaperIds: [] }),
      }, budget, `recommendation:${expansionKey}`);
      if (!response.ok) throw new Error(`Semantic Scholar recommendations returned ${response.status}`);
      const data = await response.json() as SemanticScholarRecommendationResponse;
      const page = rotatedRecommendationPage(data.recommendedPapers || [], offset);
      for (const paper of page.papers) results.push(recommendationRelation(resolved, paper, expansionKey));
      return { results, errors, nextOffset: page.nextOffset, attempted: true, succeeded: true, empty: !page.papers.length };
    } catch (error) {
      if (isSemanticScholarCircuitError(error)) throw error;
      errors.push(reportNetworkSourceError(error, "recommendation"));
      // Never turn one failed joint request into an N-request fan-out. A later
      // expansion can retry the joint endpoint after the cached cooldown.
      return { results, errors, nextOffset: offset, attempted: true, succeeded: false, empty: false };
    }
  }
  let nextOffset = offset;
  let succeededCalls = 0;
  for (const seed of resolved) {
    try {
      const endpoint = recommendationFields(new URL(`https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${encodeURIComponent(seed.paper.paperId!)}`));
      const response = await semanticScholarFetch(endpoint, {}, budget, `recommendation:${expansionKey}:${seed.row.id}`);
      if (!response.ok) throw new Error(`Semantic Scholar single-seed recommendations returned ${response.status}`);
      const data = await response.json() as SemanticScholarRecommendationResponse;
      succeededCalls += 1;
      const page = rotatedRecommendationPage(data.recommendedPapers || [], offset);
      nextOffset = page.nextOffset;
      for (const paper of page.papers) results.push(recommendationRelation([seed], paper, expansionKey, seed.row.id));
    } catch (error) {
      if (isSemanticScholarCircuitError(error)) throw error;
      errors.push(reportNetworkSourceError(error, "recommendation"));
    }
  }
  return { results, errors, nextOffset, attempted: true, succeeded: succeededCalls > 0, empty: succeededCalls > 0 && !results.length };
}

function scoreCandidate(candidate: InternalCandidate) {
  const relations = Array.from(candidate.relations.values());
  const directCoverage = new Set(relations.filter((relation) => relation.kind !== "recommendation").map((relation) => relation.seedCanonicalId)).size;
  const jointRecommendation = relations.some((relation) => relation.kind === "recommendation" && relation.joint);
  const influential = Array.from(candidate.relations.values()).some((relation) => relation.isInfluential);
  const currentYear = new Date().getUTCFullYear();
  const year = Number(candidate.publishedAt?.slice(0, 4) || 0);
  const recency = year ? Math.max(0, 8 - Math.min(8, currentYear - year)) : 0;
  return Math.min(100, Math.round(36 + directCoverage * 19 + (jointRecommendation ? 4 : 0) + (influential ? 9 : 0) + Math.min(16, Math.log10(candidate.citationCount + 1) * 6) + (candidate.abstractText ? 5 : 0) + recency));
}

async function persistCandidates(database: D1Database, spaceId: string, candidates: InternalCandidate[], expiresAt: string) {
  const existingRows = await database.prepare("SELECT id, canonical_id, status FROM research_network_candidates WHERE space_id = ?")
    .bind(spaceId).all<{ id: string; canonical_id: string; status: string }>();
  const existing = new Map(existingRows.results.map((row) => [row.canonical_id, row]));
  const ids = new Map<string, string>();
  const candidateStatements: D1PreparedStatement[] = [];
  for (const candidate of candidates) {
    const id = existing.get(candidate.canonicalId)?.id || crypto.randomUUID();
    ids.set(candidate.canonicalId, id);
    candidateStatements.push(database.prepare(
      `INSERT INTO research_network_candidates
       (id, space_id, canonical_id, s2_paper_id, openalex_id, doi, title, authors, venue, url, published_at, citation_count, abstract_text, status, metadata_source, score, discovered_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ghost', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(space_id, canonical_id) DO UPDATE SET s2_paper_id = COALESCE(excluded.s2_paper_id, s2_paper_id),
       openalex_id = COALESCE(excluded.openalex_id, openalex_id), doi = COALESCE(excluded.doi, doi),
       title = excluded.title, authors = excluded.authors, venue = excluded.venue, url = excluded.url, published_at = excluded.published_at,
       citation_count = MAX(citation_count, excluded.citation_count),
       abstract_text = CASE WHEN excluded.abstract_text <> '' THEN excluded.abstract_text ELSE abstract_text END,
       metadata_source = CASE WHEN s2_paper_id IS NOT NULL OR excluded.s2_paper_id IS NOT NULL THEN 'semantic-scholar' ELSE excluded.metadata_source END,
       score = excluded.score, last_seen_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at`,
    ).bind(id, spaceId, candidate.canonicalId, candidate.s2PaperId || null, candidate.openAlexId || null, candidate.doi || null,
      candidate.title, candidate.authors, candidate.venue, candidate.url, candidate.publishedAt, candidate.citationCount,
      candidate.abstractText, candidate.metadataSource, scoreCandidate(candidate), expiresAt));
  }
  if (candidateStatements.length) await database.batch(candidateStatements);
  const edgeStatements: D1PreparedStatement[] = [];
  for (const candidate of candidates) {
    const candidateId = ids.get(candidate.canonicalId)!;
    for (const relation of candidate.relations.values()) {
      edgeStatements.push(database.prepare(
        `INSERT INTO research_network_candidate_edges
         (id, space_id, seed_paper_id, candidate_id, kind, direction, is_influential, intents_json, contexts_json, expansion_key, seed_set_json, score, evidence_source, first_seen_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
         ON CONFLICT(seed_paper_id, candidate_id, kind) DO UPDATE SET direction = excluded.direction, is_influential = excluded.is_influential,
         intents_json = excluded.intents_json, contexts_json = excluded.contexts_json, expansion_key = excluded.expansion_key,
         seed_set_json = excluded.seed_set_json, score = excluded.score,
         evidence_source = excluded.evidence_source, last_seen_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at`,
      ).bind(crypto.randomUUID(), spaceId, relation.seedPaperId, candidateId, relation.storageKind, relation.direction, relation.isInfluential ? 1 : 0,
        JSON.stringify(relation.intents), JSON.stringify(relation.contexts), relation.expansionKey, JSON.stringify(relation.seedCanonicalIds),
        relation.score, relation.evidenceSource, expiresAt));
    }
  }
  if (edgeStatements.length) await database.batch(edgeStatements);
}

async function loadCandidates(database: D1Database, spaceId: string, seedRows: SeedRow[], expansionKey: string, includeStale: boolean, limit: number) {
  if (!seedRows.length) return [] as ResearchNetworkCandidate[];
  const placeholders = seedRows.map(() => "?").join(",");
  const freshness = includeStale ? "" : " AND datetime(c.expires_at) >= datetime('now') AND datetime(e.expires_at) >= datetime('now')";
  const candidates = await database.prepare(
    `SELECT DISTINCT c.id, c.canonical_id, c.s2_paper_id, c.openalex_id, c.doi, c.title, c.authors, c.venue, c.url, c.published_at,
     c.citation_count, c.abstract_text, c.status, c.score, c.expires_at
     FROM research_network_candidates c JOIN research_network_candidate_edges e ON e.candidate_id = c.id
     WHERE c.space_id = ? AND c.status = 'ghost'
     AND ((e.kind IN ('reference', 'citation') AND e.seed_paper_id IN (${placeholders}))
       OR (e.kind LIKE 'recommendation:%' AND e.expansion_key = ?))${freshness}
     ORDER BY c.score DESC, c.citation_count DESC LIMIT ?`,
  ).bind(spaceId, ...seedRows.map((row) => row.id), expansionKey, limit).all<CandidateRow>();
  if (!candidates.results.length) return [];
  const candidatePlaceholders = candidates.results.map(() => "?").join(",");
  const edges = await database.prepare(
    `SELECT e.candidate_id, e.seed_paper_id, p.canonical_id AS seed_canonical_id, e.kind, e.direction, e.is_influential, e.evidence_source,
     e.expansion_key, e.seed_set_json, e.expires_at
     FROM research_network_candidate_edges e JOIN research_track_papers p ON p.id = e.seed_paper_id
     WHERE e.space_id = ? AND e.candidate_id IN (${candidatePlaceholders})
     AND ((e.kind IN ('reference', 'citation') AND e.seed_paper_id IN (${placeholders}))
       OR (e.kind LIKE 'recommendation:%' AND e.expansion_key = ?))${includeStale ? "" : " AND datetime(e.expires_at) >= datetime('now')"}`,
  ).bind(spaceId, ...candidates.results.map((row) => row.id), ...seedRows.map((row) => row.id), expansionKey).all<CandidateEdgeRow>();
  const grouped = new Map<string, ResearchNetworkCandidateRelation[]>();
  for (const edge of edges.results) {
    const kind = storedRelationKind(edge.kind);
    if (!kind || !DIRECTIONS.has(edge.direction as ResearchNetworkRelationDirection)) continue;
    const seedCanonicalIds = kind === "recommendation" ? parseStringArray(edge.seed_set_json) : [edge.seed_canonical_id];
    const list = grouped.get(edge.candidate_id) || [];
    list.push({
      seedCanonicalId: edge.seed_canonical_id,
      seedCanonicalIds: seedCanonicalIds.length ? seedCanonicalIds : [edge.seed_canonical_id],
      joint: kind === "recommendation" && seedCanonicalIds.length > 1,
      kind,
      direction: edge.direction as ResearchNetworkRelationDirection,
      isInfluential: Boolean(edge.is_influential),
      evidenceSource: edge.evidence_source === "openalex" ? "openalex" : "semantic-scholar",
    });
    grouped.set(edge.candidate_id, list);
  }
  return candidates.results.map((row) => {
    const relations = grouped.get(row.id) || [];
    const seedCoverage = verifiedSeedCoverage(relations);
    return {
      id: row.id,
      canonicalId: row.canonical_id,
      ...(row.s2_paper_id ? { s2PaperId: row.s2_paper_id } : {}),
      ...(row.openalex_id ? { openAlexId: row.openalex_id } : {}),
      ...(row.doi ? { doi: row.doi } : {}),
      title: row.title,
      authors: row.authors,
      venue: row.venue,
      url: row.url,
      publishedAt: row.published_at,
      citationCount: row.citation_count,
      abstractText: row.abstract_text,
      score: row.score,
      seedCoverage,
      verifiedSeedCoverage: seedCoverage,
      bridge: isVerifiedBridge(relations),
      status: asCandidateStatus(row.status),
      relations,
    };
  });
}

function directRelationEdges(candidates: ResearchNetworkCandidate[]) {
  const unique = new Map<string, ResearchNetworkSimilarityEdge>();
  for (const candidate of candidates) for (const relation of candidate.relations) {
    const edge = verifiedRelationFallbackEdge(candidate.canonicalId, relation);
    if (!edge) continue;
    unique.set(`${edge.sourceCanonicalId}|${edge.targetCanonicalId}`, edge);
  }
  return Array.from(unique.values());
}

async function buildSimilarityEdges(seeds: ResearchNetworkSeed[], candidates: ResearchNetworkCandidate[], budget: ExternalCallBudget) {
  const seedIdentifier = (seed: ResearchNetworkSeed) => seed.s2PaperId
    || (seed.canonicalId.startsWith("doi:") ? `DOI:${seed.canonicalId.slice(4)}`
      : seed.canonicalId.startsWith("arxiv:") ? `ARXIV:${seed.canonicalId.slice(6)}`
        : seed.canonicalId.startsWith("s2:") ? seed.canonicalId.slice(3) : "");
  const nodes = [
    ...seeds.map((seed) => ({ canonicalId: seed.canonicalId, identifier: seedIdentifier(seed) })).filter((seed) => seed.identifier),
    ...candidates.filter((candidate) => candidate.s2PaperId).map((candidate) => ({ canonicalId: candidate.canonicalId, identifier: candidate.s2PaperId! })),
  ];
  const uniqueNodes = Array.from(new Map(nodes.map((node) => [node.canonicalId, node])).values());
  if (uniqueNodes.length < 2) return [] as ResearchNetworkSimilarityEdge[];
  const endpoint = new URL("https://api.semanticscholar.org/graph/v1/paper/batch");
  endpoint.searchParams.set("fields", "paperId,externalIds,references.paperId,references.externalIds");
  const response = await semanticScholarFetch(endpoint, { method: "POST", body: JSON.stringify({ ids: uniqueNodes.map((node) => node.identifier) }) }, budget,
    `similarity:${uniqueNodes.map((node) => node.canonicalId).sort().join(",")}`);
  if (!response.ok) throw new Error(`Semantic Scholar similarity lookup returned ${response.status}`);
  const records = await response.json() as Array<SemanticScholarPaper | null>;
  const references = new Map<string, Set<string>>();
  records.forEach((record, index) => {
    const node = uniqueNodes[index];
    if (!node) return;
    const keys = new Set<string>();
    for (const reference of record?.references || []) {
      const doi = cleanText(reference.externalIds?.DOI).toLocaleLowerCase();
      const key = doi ? `doi:${doi}` : reference.paperId ? `s2:${reference.paperId}` : "";
      if (key) keys.add(key);
    }
    references.set(node.canonicalId, keys);
  });
  const ranked: Array<ResearchNetworkSimilarityEdge & { rank: number }> = [];
  for (let left = 0; left < uniqueNodes.length; left += 1) for (let right = left + 1; right < uniqueNodes.length; right += 1) {
    const leftReferences = references.get(uniqueNodes[left].canonicalId) || new Set<string>();
    const rightReferences = references.get(uniqueNodes[right].canonicalId) || new Set<string>();
    if (!leftReferences.size || !rightReferences.size) continue;
    let shared = 0;
    for (const key of leftReferences) if (rightReferences.has(key)) shared += 1;
    if (!shared) continue;
    const coupling = shared / Math.sqrt(leftReferences.size * rightReferences.size);
    if (coupling < 0.02) continue;
    ranked.push({
      sourceCanonicalId: uniqueNodes[left].canonicalId,
      targetCanonicalId: uniqueNodes[right].canonicalId,
      weight: Math.max(18, Math.min(100, Math.round(coupling * 100))),
      sharedReferences: shared,
      kind: "bibliographic_coupling",
      renderAs: "similarity",
      fallback: false,
      evidenceSource: "semantic-scholar",
      rank: coupling + Math.min(0.2, shared * 0.015),
    });
  }
  const degree = new Map<string, number>();
  const selected: ResearchNetworkSimilarityEdge[] = [];
  for (const edge of ranked.sort((left, right) => right.rank - left.rank)) {
    if ((degree.get(edge.sourceCanonicalId) || 0) >= 5 || (degree.get(edge.targetCanonicalId) || 0) >= 5) continue;
    selected.push({
      sourceCanonicalId: edge.sourceCanonicalId,
      targetCanonicalId: edge.targetCanonicalId,
      weight: edge.weight,
      sharedReferences: edge.sharedReferences,
      kind: edge.kind,
      renderAs: edge.renderAs,
      fallback: edge.fallback,
      evidenceSource: edge.evidenceSource,
    });
    degree.set(edge.sourceCanonicalId, (degree.get(edge.sourceCanonicalId) || 0) + 1);
    degree.set(edge.targetCanonicalId, (degree.get(edge.targetCanonicalId) || 0) + 1);
    if (selected.length >= 48) break;
  }
  return selected;
}

function externalBudget(database: D1Database, spaceId: string): ExternalCallBudget {
  return { database, spaceId };
}

async function loadSeedExpansionStates(database: D1Database, spaceId: string, seeds: SeedRow[]) {
  if (!seeds.length) return new Map<string, SeedExpansionStateRow>();
  const placeholders = seeds.map(() => "?").join(",");
  const rows = await database.prepare(
    `SELECT seed_paper_id, reference_offset, citation_offset, openalex_neighbor_offset, openalex_citation_page, status, last_expanded_at, expires_at
     FROM research_network_seed_expansion_states WHERE space_id = ? AND seed_paper_id IN (${placeholders})`,
  ).bind(spaceId, ...seeds.map((seed) => seed.id)).all<SeedExpansionStateRow>();
  return new Map(rows.results.map((row) => [row.seed_paper_id, row]));
}

async function loadExpansionState(database: D1Database, spaceId: string, expansionKey: string) {
  return database.prepare(
    `SELECT expansion_key, recommendation_offset, status, expires_at, similarity_json, similarity_status,
     similarity_expires_at, lock_token, lock_expires_at, last_expanded_at
     FROM research_network_expansion_states WHERE space_id = ? AND expansion_key = ? LIMIT 1`,
  ).bind(spaceId, expansionKey).first<ExpansionStateRow>();
}

async function hasFreshRecommendationCandidates(database: D1Database, spaceId: string, expansionKey: string) {
  const row = await database.prepare(
    `SELECT 1 AS present FROM research_network_candidate_edges e
     JOIN research_network_candidates c ON c.id = e.candidate_id
     WHERE e.space_id = ? AND e.expansion_key = ? AND e.kind LIKE 'recommendation:%' AND c.status = 'ghost'
       AND datetime(e.expires_at) >= datetime('now') AND datetime(c.expires_at) >= datetime('now') LIMIT 1`,
  ).bind(spaceId, expansionKey).first<{ present: number }>();
  return Boolean(row?.present);
}

async function freshDirectEvidenceSeedIds(database: D1Database, spaceId: string, seedRows: SeedRow[]) {
  if (!seedRows.length) return new Set<string>();
  const placeholders = seedRows.map(() => "?").join(",");
  const rows = await database.prepare(
    `SELECT DISTINCT e.seed_paper_id FROM research_network_candidate_edges e
     JOIN research_network_candidates c ON c.id = e.candidate_id
     WHERE e.space_id = ? AND e.seed_paper_id IN (${placeholders}) AND e.kind IN ('reference', 'citation')
       AND c.status = 'ghost' AND datetime(e.expires_at) >= datetime('now') AND datetime(c.expires_at) >= datetime('now')`,
  ).bind(spaceId, ...seedRows.map((seed) => seed.id)).all<{ seed_paper_id: string }>();
  return new Set(rows.results.map((row) => row.seed_paper_id));
}

function cachedOpenAlexStatus(candidates: ResearchNetworkCandidate[]): ResearchNetworkSourceStatus["openAlex"] {
  return candidates.some((candidate) => candidate.relations.some((relation) => relation.evidenceSource === "openalex")) ? "cached" : "not_attempted";
}

function cachedSimilarityEdges(state: ExpansionStateRow | null) {
  if (!state?.similarity_expires_at || Date.parse(state.similarity_expires_at) <= Date.now()) return null;
  try {
    const parsed = JSON.parse(state.similarity_json || "[]");
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((edge): edge is ResearchNetworkSimilarityEdge => edge && typeof edge === "object"
      && typeof edge.sourceCanonicalId === "string" && typeof edge.targetCanonicalId === "string"
      && (edge.kind === "bibliographic_coupling" || edge.kind === "verified_citation"));
  } catch {
    return null;
  }
}

async function saveSimilarityState(
  database: D1Database,
  spaceId: string,
  expansionKey: string,
  edges: ResearchNetworkSimilarityEdge[],
  status: "ready" | "partial",
  ttlMilliseconds: number,
) {
  await database.prepare(
    `UPDATE research_network_expansion_states SET similarity_json = ?, similarity_status = ?, similarity_expires_at = ?
     WHERE space_id = ? AND expansion_key = ?`,
  ).bind(JSON.stringify(edges), status, new Date(Date.now() + ttlMilliseconds).toISOString(), spaceId, expansionKey).run();
}

async function tryAcquireExpansionLock(database: D1Database, spaceId: string, expansionKey: string, seedCanonicalIds: string[]) {
  const token = crypto.randomUUID();
  const lockExpiresAt = new Date(Date.now() + EXPANSION_LOCK_LEASE_MS).toISOString();
  const result = await database.prepare(
    `INSERT INTO research_network_expansion_states
     (id, space_id, expansion_key, seed_canonical_ids, status, lock_token, lock_expires_at)
     VALUES (?, ?, ?, ?, 'building', ?, ?)
     ON CONFLICT(space_id, expansion_key) DO UPDATE SET status = 'building', lock_token = excluded.lock_token,
     lock_expires_at = excluded.lock_expires_at
     WHERE research_network_expansion_states.lock_token IS NULL
       OR datetime(research_network_expansion_states.lock_expires_at) <= datetime('now')`,
  ).bind(crypto.randomUUID(), spaceId, expansionKey, JSON.stringify(seedCanonicalIds), token, lockExpiresAt).run();
  return (result.meta.changes || 0) === 1 ? token : null;
}

async function renewExpansionLock(database: D1Database, spaceId: string, expansionKey: string, token: string) {
  const lockExpiresAt = new Date(Date.now() + EXPANSION_LOCK_LEASE_MS).toISOString();
  const result = await database.prepare(
    `UPDATE research_network_expansion_states SET lock_expires_at = ?, status = 'building'
     WHERE space_id = ? AND expansion_key = ? AND lock_token = ?`,
  ).bind(lockExpiresAt, spaceId, expansionKey, token).run();
  if ((result.meta.changes || 0) !== 1) throw new Error("Research-network expansion lease was lost");
}

async function releaseExpansionLock(database: D1Database, spaceId: string, expansionKey: string, token: string, status?: "ready" | "no_matches" | "exhausted" | "partial" | "unavailable" | null) {
  await database.prepare(
    `UPDATE research_network_expansion_states SET lock_token = NULL, lock_expires_at = NULL,
     status = COALESCE(?, status) WHERE space_id = ? AND expansion_key = ? AND lock_token = ?`,
  ).bind(status || null, spaceId, expansionKey, token).run();
}

function isFreshDiscoveryState(
  state: { status: string; expires_at: string | null; last_expanded_at?: string | null } | null | undefined,
  hasVisibleEvidence: boolean,
) {
  return isFreshDiscoveryCacheEntry(state ? {
    status: state.status,
    expiresAt: state.expires_at,
    lastExpandedAt: state.last_expanded_at,
  } : null, hasVisibleEvidence);
}

async function saveSeedExpansionState(
  database: D1Database,
  spaceId: string,
  seedPaperId: string,
  nextOffsets: { reference: number; citation: number; openAlexNeighbor: number; openAlexCitationPage: number },
  status: "ready" | "no_matches" | "partial" | "unavailable" | "exhausted",
  error: string,
  expiresAt: string,
) {
  await database.prepare(
    `INSERT INTO research_network_seed_expansion_states
     (id, space_id, seed_paper_id, reference_offset, citation_offset, openalex_neighbor_offset, openalex_citation_page, status, error, last_expanded_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(space_id, seed_paper_id) DO UPDATE SET reference_offset = excluded.reference_offset,
     citation_offset = excluded.citation_offset, openalex_neighbor_offset = excluded.openalex_neighbor_offset,
     openalex_citation_page = excluded.openalex_citation_page, status = excluded.status, error = excluded.error,
     last_expanded_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at`,
  ).bind(crypto.randomUUID(), spaceId, seedPaperId, nextOffsets.reference, nextOffsets.citation,
    nextOffsets.openAlexNeighbor, nextOffsets.openAlexCitationPage, status, error || null, expiresAt).run();
}

async function saveExpansionState(
  database: D1Database,
  spaceId: string,
  expansionKey: string,
  seedCanonicalIds: string[],
  nextOffset: number,
  status: "ready" | "no_matches" | "partial" | "unavailable" | "exhausted",
  error: string,
  expiresAt: string,
) {
  await database.prepare(
    `INSERT INTO research_network_expansion_states
     (id, space_id, expansion_key, seed_canonical_ids, recommendation_offset, status, error, last_expanded_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(space_id, expansion_key) DO UPDATE SET seed_canonical_ids = excluded.seed_canonical_ids,
     recommendation_offset = excluded.recommendation_offset, status = excluded.status, error = excluded.error,
     last_expanded_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at`,
  ).bind(crypto.randomUUID(), spaceId, expansionKey, JSON.stringify(seedCanonicalIds), nextOffset, status, error || null, expiresAt).run();
}

function issuesFromErrors(errors: string[]): ResearchNetworkIssue[] {
  return errors.map((message) => ({
    source: /openalex/i.test(message) ? "openalex" as const
      : /budget|quota/i.test(message) ? "quota" as const : "semantic-scholar" as const,
    code: /cooling down|rate.limit|retry in/i.test(message) ? "rate_limited"
      : /budget|quota/i.test(message) ? "quota_exhausted"
        : /match|seed/i.test(message) ? "seed_unresolved"
          : /similarity/i.test(message) ? "similarity_partial" : "upstream_partial",
    message,
    retryable: !/budget|quota/i.test(message),
    ...(/retry in about (\d+) seconds/i.test(message) ? { retryAfterSeconds: Number(message.match(/retry in about (\d+) seconds/i)?.[1] || 1) } : {}),
  }));
}

function expandResponse(values: Partial<ResearchNetworkExpandResponse> & Pick<ResearchNetworkExpandResponse, "seeds" | "candidates">): ResearchNetworkExpandResponse {
  const sourceStatus = values.sourceStatus || { semanticScholar: "not_attempted", openAlex: "not_attempted", similarity: "not_attempted" };
  const errors = Array.from(new Set(values.errors || []));
  const status = values.status || (values.externalUnavailable ? "unavailable"
    : errors.length || sourceStatus.semanticScholar === "partial" || sourceStatus.openAlex === "partial" || sourceStatus.similarity === "partial" ? "partial" : "ok");
  return {
    status,
    seeds: values.seeds,
    candidates: values.candidates,
    similarityEdges: values.similarityEdges || [],
    cached: values.cached || false,
    stale: values.stale || false,
    externalUnavailable: values.externalUnavailable || false,
    sourceStatus,
    errors,
    issues: values.issues || issuesFromErrors(errors),
    cache: values.cache || { hitSeedCanonicalIds: [], expandedSeedCanonicalIds: [] },
    retryAfterSeconds: values.retryAfterSeconds ?? null,
    expiresAt: values.expiresAt || null,
  };
}

export async function POST(request: Request) {
  let body: { spaceId?: string; originCanonicalIds?: unknown; limit?: unknown; force?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const spaceId = cleanText(body.spaceId);
  const originCanonicalIds = Array.isArray(body.originCanonicalIds)
    ? Array.from(new Set(body.originCanonicalIds.map(cleanText).filter(Boolean))).slice(0, MAX_SEEDS)
    : [];
  const limit = boundedInteger(body.limit, 6, MAX_CANDIDATES, DEFAULT_CANDIDATES);
  const force = body.force === true;
  if (!spaceId || !originCanonicalIds.length) return Response.json({ error: "spaceId and 1-3 originCanonicalIds are required" }, { status: 400 });
  const access = await ownedSpace(request, spaceId);
  if ("error" in access) return access.error;
  const { database } = access;
  const seedRows = await resolveSeeds(database, spaceId, originCanonicalIds);
  if (seedRows.length !== originCanonicalIds.length) return Response.json({ error: "One or more selected seed papers are not in this research space" }, { status: 404 });

  const expansionKey = await seedSetKey(seedRows.map((seed) => seed.canonical_id));
  const budget = externalBudget(database, spaceId);
  const [seedStates, expansionState, hasRecommendationEvidence, directEvidenceSeedIds] = await Promise.all([
    loadSeedExpansionStates(database, spaceId, seedRows),
    loadExpansionState(database, spaceId, expansionKey),
    hasFreshRecommendationCandidates(database, spaceId, expansionKey),
    freshDirectEvidenceSeedIds(database, spaceId, seedRows),
  ]);
  // A legacy ready state without a live recommendation edge is not a cache hit.
  // This also ensures `force` and an old empty response both continue discovery.
  const recommendationFresh = isFreshDiscoveryState(expansionState, hasRecommendationEvidence);
  const partition = partitionExpansionSeeds(
    seedRows.map((seed) => ({ id: seed.id, canonicalId: seed.canonical_id, row: seed })),
    new Set(seedRows.filter((seed) => isFreshDiscoveryState(seedStates.get(seed.id), directEvidenceSeedIds.has(seed.id))).map((seed) => seed.id)),
    recommendationFresh,
    force,
  );
  const hitSeedRows = partition.hitSeeds.map((seed) => seed.row);
  const rowsToExpand = partition.expandSeeds.map((seed) => seed.row);
  const shouldExpandRecommendation = force || !recommendationFresh;
  const cached = await loadCandidates(database, spaceId, seedRows, expansionKey, false, limit);
  if (partition.fullyCached) {
    await enqueueNetworkReviewCandidates(database, spaceId, seedRows, cached, expansionKey);
    const storedSimilarity = cachedSimilarityEdges(expansionState);
    const cachedStatuses = [...seedRows.map((seed) => seedStates.get(seed.id)?.status), expansionState?.status].filter(Boolean);
    const cachedCoverageStatus = classifyCoverageStatuses(cachedStatuses);
    // A fresh negative cache prevents immediate upstream retry storms, but it
    // is still cached knowledge rather than proof that a provider is currently
    // unavailable. Keep this response structured and retryable instead of
    // presenting a cached failure as a new live 503.
    const cachedIncomplete = cachedCoverageStatus === "partial" || cachedCoverageStatus === "unavailable";
    const cachedResponseStatus: ResearchNetworkExpandResponse["status"] | undefined = cachedCoverageStatus === "ok" ? undefined
      : cachedCoverageStatus === "unavailable" ? "partial" : cachedCoverageStatus;
    const cachedPartial = cachedResponseStatus === "partial";
    const cachedExpiryValues = [...seedRows.map((seed) => seedStates.get(seed.id)?.expires_at), expansionState?.expires_at]
      .map((value) => value ? Date.parse(value) : Number.NaN).filter(Number.isFinite);
    const cachedExpiresAt = cachedExpiryValues.length ? new Date(Math.min(...cachedExpiryValues)).toISOString() : null;
    return Response.json(expandResponse({
      seeds: localSeeds(seedRows),
      candidates: cached,
      similarityEdges: storedSimilarity?.length ? storedSimilarity : directRelationEdges(cached),
      cached: true,
      stale: cachedPartial && Boolean(cached.length),
      sourceStatus: {
        semanticScholar: cachedCoverageStatus === "no_matches" ? "empty"
          : cachedIncomplete ? "partial" : "cached",
        openAlex: cachedOpenAlexStatus(cached),
        similarity: storedSimilarity?.length && expansionState?.similarity_status === "ready" ? "cached" : cached.length ? "partial" : "not_attempted",
      },
      cache: { hitSeedCanonicalIds: seedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds: [] },
      expiresAt: cachedExpiresAt,
      status: cachedResponseStatus,
      externalUnavailable: cachedIncomplete,
    }), { status: 200 });
  }

  const expansionLockToken = await tryAcquireExpansionLock(database, spaceId, expansionKey, seedRows.map((seed) => seed.canonical_id));
  if (!expansionLockToken) {
    const inProgress = await loadCandidates(database, spaceId, seedRows, expansionKey, true, limit);
    await enqueueNetworkReviewCandidates(database, spaceId, seedRows, inProgress, expansionKey);
    const message = "This academic-graph expansion is already running; current verified results are shown while it finishes.";
    return Response.json(expandResponse({
      seeds: localSeeds(seedRows), candidates: inProgress, similarityEdges: directRelationEdges(inProgress), cached: Boolean(inProgress.length), stale: true,
      sourceStatus: { semanticScholar: "cached", openAlex: "not_attempted", similarity: "partial" }, errors: [message], status: "partial",
      cache: { hitSeedCanonicalIds: hitSeedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds: [] },
    }), { status: 202 });
  }

  const errors: string[] = [];
  let expansionLockStatus: "ready" | "no_matches" | "exhausted" | "partial" | "unavailable" | null = "unavailable";
  try {
  let seedResult: Awaited<ReturnType<typeof resolveSemanticScholarSeeds>> = {
    seeds: localSeeds(seedRows),
    resolved: [],
    errors: [],
  };
  let circuitError: SemanticScholarRateLimitError | SemanticScholarQuotaError | null = null;
  try {
    seedResult = await resolveSemanticScholarSeeds(seedRows, budget);
    errors.push(...seedResult.errors);
    await renewExpansionLock(database, spaceId, expansionKey, expansionLockToken);
  } catch (error) {
    errors.push(reportNetworkSourceError(error, isSemanticScholarCircuitError(error) ? "rate" : "seed"));
    if (isSemanticScholarCircuitError(error)) circuitError = error;
  }

  const resolvedByPaperId = new Map(seedResult.resolved.map((seed) => [seed.row.id, seed]));
  const resolvedToExpand = rowsToExpand.map((seed) => resolvedByPaperId.get(seed.id)).filter((seed): seed is { row: SeedRow; paper: SemanticScholarPaper } => Boolean(seed));
  const recommendationOffset = Math.max(0, expansionState?.recommendation_offset || 0);
  const directRelationResults: Awaited<ReturnType<typeof fetchSeedRelations>>[] = [];
  let recommendationResult = {
    results: [] as Array<{ paper: SemanticScholarPaper; relation: InternalRelation }>,
    errors: [] as string[],
    nextOffset: recommendationOffset,
    attempted: false,
    succeeded: false,
    empty: false,
  };
  try {
    for (const seed of circuitError ? [] : resolvedToExpand) {
      const previousSeedState = seedStates.get(seed.row.id);
      const relationResult = await fetchSeedRelations(
        seed,
        previousSeedState,
        budget,
        force || (previousSeedState?.citation_offset ?? 0) < 0,
      );
      directRelationResults.push(relationResult);
      await renewExpansionLock(database, spaceId, expansionKey, expansionLockToken);
      if (relationResult.circuitError) {
        circuitError = relationResult.circuitError;
        errors.push(reportNetworkSourceError(relationResult.circuitError, "rate"));
        break;
      }
    }
    if (shouldExpandRecommendation && !circuitError) {
      recommendationResult = await fetchRecommendations(seedResult.resolved, expansionKey, recommendationOffset, budget);
      await renewExpansionLock(database, spaceId, expansionKey, expansionLockToken);
    }
  } catch (error) {
    if (!isSemanticScholarCircuitError(error)) throw error;
    circuitError = error;
    errors.push(reportNetworkSourceError(error, "rate"));
  }
  const relationResults = [...directRelationResults, recommendationResult];
  errors.push(...relationResults.flatMap((result) => result.errors));
  const semanticScholarErrorCount = errors.length;
  const semanticScholarDirectCount = directRelationResults.reduce((total, result) => total + result.results.length, 0);
  const semanticScholarEmptyRelationCount = directRelationResults.reduce((total, result) => total + result.emptyKinds.length, 0);
  const useOpenAlex = shouldUseOpenAlexFallback({
    seedCount: seedRows.length,
    semanticScholarResolvedSeedCount: seedResult.resolved.length,
    semanticScholarDirectCandidateCount: rowsToExpand.length ? semanticScholarDirectCount : 1,
    semanticScholarRecommendationCount: shouldExpandRecommendation ? recommendationResult.results.length : 1,
    semanticScholarErrorCount,
    semanticScholarEmptyRelationCount,
  });
  let openAlexResult: Awaited<ReturnType<typeof fetchOpenAlexExpansion>> = {
    results: [], errors: [], neighborErrors: [], citationErrors: [], seedErrors: new Map(), cursorUpdates: new Map(),
    resolvedSeeds: [], attempted: false, succeeded: false, successfulSeedIds: [], progressedSeedIds: [], empty: false,
    recommendationCoverageComplete: false,
  };
  let openAlexTargetRows: SeedRow[] = [];
  if (useOpenAlex) {
    const targetById = new Map((shouldExpandRecommendation ? seedRows : rowsToExpand).map((seed) => [seed.id, seed]));
    openAlexTargetRows = Array.from(targetById.values());
    if (openAlexTargetRows.length) {
      openAlexResult = await fetchOpenAlexExpansion(openAlexTargetRows, expansionKey, seedStates, { remaining: OPENALEX_CALL_LIMIT });
    }
    errors.push(...openAlexResult.errors);
    await renewExpansionLock(database, spaceId, expansionKey, expansionLockToken);
  }

  const expiresAt = new Date(Date.now() + CACHE_HOURS * 3600_000).toISOString();
  const negativeExpiresAt = new Date(Date.now() + NEGATIVE_CACHE_MS).toISOString();
  const directResultBySeed = new Map(directRelationResults.map((result, index) => [resolvedToExpand[index]?.row.id, result]));
  const openAlexDirectCounts = new Map<string, number>();
  for (const entry of openAlexResult.results) if (entry.relation.kind !== "recommendation") {
    openAlexDirectCounts.set(entry.relation.seedPaperId, (openAlexDirectCounts.get(entry.relation.seedPaperId) || 0) + 1);
  }
  const formalRows = await database.prepare("SELECT canonical_id FROM research_track_papers WHERE space_id = ?")
    .bind(spaceId).all<{ canonical_id: string }>();
  const excluded = new Set(formalRows.results.map((row) => row.canonical_id));
  const existingCandidateRows = await database.prepare("SELECT canonical_id, status FROM research_network_candidates WHERE space_id = ?")
    .bind(spaceId).all<{ canonical_id: string; status: string }>();
  const existingGhostCanonicalIds = new Set(existingCandidateRows.results.filter((row) => row.status === "ghost").map((row) => row.canonical_id));
  for (const row of existingCandidateRows.results) if (row.status === "dismissed" || row.status === "accepted") excluded.add(row.canonical_id);
  const aggregated = new Map<string, InternalCandidate>();
  const mergeCandidate = (normalized: InternalCandidate, relation: InternalRelation) => {
    if (excluded.has(normalized.canonicalId)) return;
    // Semantic Scholar and OpenAlex use different IDs for DOI-less works. Merge
    // only when title, non-conflicting year, and available author metadata are
    // compatible. Ambiguous same-title records remain separate.
    let identity = networkCandidateIdentity(normalized);
    if (!normalized.doi) {
      const compatibleKeys = Array.from(aggregated.entries())
        .filter(([, current]) => compatibleResearchWorkMetadata(normalized, current))
        .map(([key]) => key);
      if (compatibleKeys.length === 1) identity = compatibleKeys[0];
    }
    const current = aggregated.get(identity) || normalized;
    current.s2PaperId ||= normalized.s2PaperId;
    current.openAlexId ||= normalized.openAlexId;
    current.doi ||= normalized.doi;
    const relationKey = `${relation.seedPaperId}:${relation.storageKind}`;
    const existingRelation = current.relations.get(relationKey);
    if (!existingRelation || existingRelation.evidenceSource !== "semantic-scholar") current.relations.set(relationKey, relation);
    if (!current.abstractText && normalized.abstractText) current.abstractText = normalized.abstractText;
    current.citationCount = Math.max(current.citationCount, normalized.citationCount);
    aggregated.set(identity, current);
  };
  for (const entry of relationResults.flatMap((result) => result.results)) {
    const normalized = normalizePaper(entry.paper);
    if (normalized) mergeCandidate(normalized, entry.relation);
  }
  const allowedOpenAlexCanonicalIds = new Set<string>();
  for (const entry of openAlexResult.results) {
    if (!allowedOpenAlexCanonicalIds.has(entry.candidate.canonicalId) && allowedOpenAlexCanonicalIds.size >= OPENALEX_CANDIDATE_LIMIT) continue;
    allowedOpenAlexCanonicalIds.add(entry.candidate.canonicalId);
    mergeCandidate(entry.candidate, entry.relation);
  }
  const ranked = Array.from(aggregated.values()).sort((left, right) => {
    const leftCoverage = new Set(Array.from(left.relations.values()).filter((relation) => relation.kind !== "recommendation").map((relation) => relation.seedCanonicalId)).size;
    const rightCoverage = new Set(Array.from(right.relations.values()).filter((relation) => relation.kind !== "recommendation").map((relation) => relation.seedCanonicalId)).size;
    return rightCoverage - leftCoverage || scoreCandidate(right) - scoreCandidate(left) || right.citationCount - left.citationCount;
  });
  const direct = ranked.filter((candidate) => Array.from(candidate.relations.values()).some((relation) => relation.kind !== "recommendation"));
  const recommendationOnly = ranked.filter((candidate) => Array.from(candidate.relations.values()).every((relation) => relation.kind === "recommendation"));
  const directQuota = Math.min(direct.length, Math.ceil(limit * 2 / 3));
  const selected = [...direct.slice(0, directQuota), ...recommendationOnly.slice(0, limit - directQuota)];
  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((candidate) => candidate.canonicalId));
    selected.push(...ranked.filter((candidate) => !selectedIds.has(candidate.canonicalId)).slice(0, limit - selected.length));
  }
  if (selected.length) await persistCandidates(database, spaceId, selected, expiresAt);
  const candidates = await loadCandidates(database, spaceId, seedRows, expansionKey, false, limit);
  await enqueueNetworkReviewCandidates(database, spaceId, seedRows, candidates, expansionKey);
  const visibleCandidateIds = new Set(candidates.map((candidate) => candidate.canonicalId));
  const visibleSelected = selected.filter((candidate) => !existingGhostCanonicalIds.has(candidate.canonicalId) && visibleCandidateIds.has(candidate.canonicalId));
  const visibleDirectSeedIds = new Set<string>();
  let visibleRecommendation = false;
  for (const candidate of visibleSelected) for (const relation of candidate.relations.values()) {
    if (relation.kind === "recommendation") visibleRecommendation = true;
    else visibleDirectSeedIds.add(relation.seedPaperId);
  }
  const stateWrites: Promise<void>[] = [];
  let wroteExpansionDiscoveryState = false;
  for (const seed of rowsToExpand) {
    const result = directResultBySeed.get(seed.id);
    const previous = seedStates.get(seed.id);
    const s2CoverageComplete = directSeedCoverageComplete(result);
    const openAlexCoverageComplete = openAlexResult.successfulSeedIds.includes(seed.id);
    const directCoverageComplete = s2CoverageComplete || openAlexCoverageComplete;
    const partialAttempt = Boolean(result?.attemptedKinds.length) || openAlexResult.progressedSeedIds.includes(seed.id);
    const stateErrors = [...(result?.errors || []), ...(openAlexResult.seedErrors.get(seed.id) || [])];
    if (result?.circuitError) stateErrors.push("Some verified citation links could not be refreshed; cached links remain available.");
    if (!result && (circuitError || !resolvedByPaperId.has(seed.id))) {
      stateErrors.push("The selected seed could not be fully resolved in every academic graph used for this expansion.");
    }
    const s2Exhausted = s2CoverageComplete && result!.nextOffsets.reference < 0 && result!.nextOffsets.citation < 0;
    const status = discoveryStateForCoverage({
      visible: visibleDirectSeedIds.has(seed.id),
      coverageComplete: directCoverageComplete,
      issueCount: stateErrors.length,
      attempted: partialAttempt,
      exhausted: s2Exhausted,
    });
    const stateExpiresAt = status === "ready" ? expiresAt : negativeExpiresAt;
    const openAlexCursor = openAlexResult.cursorUpdates.get(seed.id);
    stateWrites.push(saveSeedExpansionState(database, spaceId, seed.id, {
      reference: result?.nextOffsets.reference ?? previous?.reference_offset ?? 0,
      citation: result?.nextOffsets.citation ?? previous?.citation_offset ?? 0,
      openAlexNeighbor: openAlexCursor?.neighborOffset ?? previous?.openalex_neighbor_offset ?? 0,
      openAlexCitationPage: openAlexCursor?.citationPage ?? previous?.openalex_citation_page ?? 1,
    }, status, stateErrors.join(" · "), stateExpiresAt));
  }
  const expandedSeedIds = new Set(rowsToExpand.map((seed) => seed.id));
  for (const seed of openAlexTargetRows) {
    if (expandedSeedIds.has(seed.id)) continue;
    const previous = seedStates.get(seed.id);
    const openAlexCursor = openAlexResult.cursorUpdates.get(seed.id);
    const stateErrors = openAlexResult.seedErrors.get(seed.id) || [];
    const previousCoverageComplete = previous?.status === "ready" || previous?.status === "no_matches" || previous?.status === "exhausted";
    const currentCoverageComplete = previousCoverageComplete || openAlexResult.successfulSeedIds.includes(seed.id);
    const status = discoveryStateForCoverage({
      visible: directEvidenceSeedIds.has(seed.id) || visibleDirectSeedIds.has(seed.id),
      coverageComplete: currentCoverageComplete,
      issueCount: stateErrors.length,
      attempted: openAlexResult.progressedSeedIds.includes(seed.id),
      exhausted: previous?.status === "exhausted",
    });
    stateWrites.push(saveSeedExpansionState(database, spaceId, seed.id, {
      reference: previous?.reference_offset ?? 0,
      citation: previous?.citation_offset ?? 0,
      openAlexNeighbor: openAlexCursor?.neighborOffset ?? previous?.openalex_neighbor_offset ?? 0,
      openAlexCitationPage: openAlexCursor?.citationPage ?? previous?.openalex_citation_page ?? 1,
    }, status, stateErrors.join(" · "), status === "ready" ? expiresAt : negativeExpiresAt));
  }
  if (shouldExpandRecommendation) {
    wroteExpansionDiscoveryState = true;
    const recommendationCovered = recommendationResult.succeeded || openAlexResult.recommendationCoverageComplete;
    const recommendationErrors = [...recommendationResult.errors, ...openAlexResult.neighborErrors];
    const recommendationProgress = recommendationResult.succeeded || openAlexResult.succeeded;
    const recommendationStatus = discoveryStateForCoverage({
      visible: visibleRecommendation,
      coverageComplete: recommendationCovered,
      issueCount: recommendationErrors.length,
      attempted: recommendationProgress || recommendationErrors.length > 0,
    });
    const nextRecommendationOffset = recommendationResult.succeeded ? recommendationResult.nextOffset : recommendationOffset;
    stateWrites.push(saveExpansionState(database, spaceId, expansionKey, seedRows.map((seed) => seed.canonical_id),
      nextRecommendationOffset, recommendationStatus, recommendationErrors.join(" · "),
      recommendationStatus === "ready" ? expiresAt : negativeExpiresAt));
  }
  await renewExpansionLock(database, spaceId, expansionKey, expansionLockToken);
  await Promise.all(stateWrites);
  // The discovery state (including no_matches/exhausted) is now authoritative;
  // lock release must not overwrite it with a generic ready/partial value.
  const previousExpansionStatus = expansionState?.status;
  expansionLockStatus = wroteExpansionDiscoveryState ? null
    : previousExpansionStatus === "ready" || previousExpansionStatus === "no_matches" || previousExpansionStatus === "exhausted"
      || previousExpansionStatus === "partial" || previousExpansionStatus === "unavailable" ? previousExpansionStatus : "partial";
  const s2SeedByPaperId = new Map(seedResult.seeds.map((seed) => [seed.paperId, seed]));
  const openAlexSeedByPaperId = new Map(openAlexResult.resolvedSeeds.map((seed) => [seed.row.id, openAlexId(seed.work.id)]));
  const responseSeeds = localSeeds(seedRows).map((seed) => ({
    ...seed,
    ...(s2SeedByPaperId.get(seed.paperId)?.s2PaperId ? { s2PaperId: s2SeedByPaperId.get(seed.paperId)!.s2PaperId } : {}),
    ...(openAlexSeedByPaperId.get(seed.paperId) ? { openAlexId: openAlexSeedByPaperId.get(seed.paperId)! } : {}),
  }));
  let similarityEdges: ResearchNetworkSimilarityEdge[] = [];
  let similarityStatus: ResearchNetworkSourceStatus["similarity"] = "not_attempted";
  let shouldPersistSimilarity = true;
  if (!visibleSelected.length) {
    const storedSimilarity = cachedSimilarityEdges(expansionState);
    similarityEdges = storedSimilarity?.length ? storedSimilarity : directRelationEdges(candidates);
    similarityStatus = storedSimilarity?.length ? "cached" : similarityEdges.length ? "partial" : "not_attempted";
    shouldPersistSimilarity = false;
  } else if (circuitError || !seedResult.resolved.length) {
    similarityEdges = directRelationEdges(candidates);
    similarityStatus = similarityEdges.length ? "partial" : "not_attempted";
  } else {
    try {
      const couplingEdges = await buildSimilarityEdges(responseSeeds, candidates, budget);
      similarityStatus = similarityStatusForEdgeCount(couplingEdges.length);
      similarityEdges = couplingEdges.length ? couplingEdges : directRelationEdges(candidates);
    } catch (error) {
      errors.push(reportNetworkSourceError(error, "similarity"));
      similarityEdges = directRelationEdges(candidates);
      similarityStatus = "partial";
      if (isSemanticScholarCircuitError(error)) circuitError = error;
    }
  }
  if (shouldPersistSimilarity) await saveSimilarityState(
    database,
    spaceId,
    expansionKey,
    similarityEdges,
    similarityStatus === "ok" ? "ready" : "partial",
    similarityStatus === "ok" ? CACHE_HOURS * 3600_000 : NEGATIVE_CACHE_MS,
  );
  const visibleSemanticScholarCandidates = visibleSelected.some((candidate) => Array.from(candidate.relations.values()).some((relation) => relation.evidenceSource === "semantic-scholar"));
  const visibleOpenAlexCandidates = visibleSelected.some((candidate) => Array.from(candidate.relations.values()).some((relation) => relation.evidenceSource === "openalex"));
  const semanticScholarSucceeded = directRelationResults.some((result) => result.attemptedKinds.length > 0) || recommendationResult.succeeded;
  const semanticScholarAttempted = directRelationResults.length > 0 || recommendationResult.attempted;
  const semanticStatus: ResearchNetworkSourceStatus["semanticScholar"] = visibleSemanticScholarCandidates
    ? semanticScholarErrorCount > 0 || circuitError ? "partial" : "ok"
    : semanticScholarSucceeded ? semanticScholarErrorCount > 0 ? "partial" : "empty"
      : semanticScholarAttempted || seedResult.resolved.length ? semanticScholarErrorCount > 0 || circuitError ? "unavailable" : "not_attempted"
        : "unavailable";
  const openAlexStatus: ResearchNetworkSourceStatus["openAlex"] = !openAlexResult.attempted ? "not_attempted"
    : visibleOpenAlexCandidates ? openAlexResult.errors.length ? "partial" : "ok"
      : openAlexResult.succeeded ? openAlexResult.errors.length ? "partial" : "empty" : "unavailable";
  const coveredState = (status: string | null | undefined) => status === "ready" || status === "no_matches" || status === "exhausted";
  const fullyCoveredExpandedSeedIds = new Set(rowsToExpand.filter((seed) => {
    const result = directResultBySeed.get(seed.id);
    return directSeedCoverageComplete(result) || openAlexResult.successfulSeedIds.includes(seed.id);
  }).map((seed) => seed.id));
  const allSeedTargetsCovered = seedRows.every((seed) => rowsToExpand.some((row) => row.id === seed.id)
    ? fullyCoveredExpandedSeedIds.has(seed.id)
    : coveredState(seedStates.get(seed.id)?.status));
  const anySeedTargetProgress = seedRows.some((seed) => coveredState(seedStates.get(seed.id)?.status)
    || Boolean(directResultBySeed.get(seed.id)?.attemptedKinds.length)
    || openAlexResult.progressedSeedIds.includes(seed.id));
  const recommendationTargetCovered = shouldExpandRecommendation
    ? recommendationResult.succeeded || openAlexResult.recommendationCoverageComplete
    : coveredState(expansionState?.status);
  const recommendationTargetProgress = shouldExpandRecommendation
    ? recommendationResult.succeeded || openAlexResult.succeeded
    : coveredState(expansionState?.status);
  const allTargetsCovered = allSeedTargetsCovered && recommendationTargetCovered;
  const anyTargetCovered = anySeedTargetProgress || recommendationTargetProgress;
  const expandedSeedCanonicalIds = rowsToExpand.filter((seed) => directResultBySeed.has(seed.id) || (openAlexDirectCounts.get(seed.id) || 0) > 0)
    .map((seed) => seed.canonical_id);
  if (!visibleSelected.length) {
    const classifiedStatus = classifyNoNovelCoverage({
      allTargetsCovered,
      anyTargetCovered,
      errorCount: errors.length,
      hasPartialSource: semanticStatus === "partial" || openAlexStatus === "partial" || similarityStatus === "partial",
      rateLimited: Boolean(circuitError),
    });
    const responseStatus: ResearchNetworkExpandResponse["status"] = candidates.length
      && (classifiedStatus === "unavailable" || classifiedStatus === "rate_limited") ? "partial" : classifiedStatus;
    const responseHttpStatus = responseStatus === "rate_limited" ? 429 : responseStatus === "unavailable" ? 503 : 200;
    return Response.json(expandResponse({
      seeds: responseSeeds, candidates, similarityEdges, cached: Boolean(candidates.length),
      stale: Boolean(candidates.length) && responseStatus !== "no_matches",
      externalUnavailable: responseStatus !== "no_matches",
      sourceStatus: { semanticScholar: semanticStatus, openAlex: openAlexStatus, similarity: similarityStatus }, errors,
      expiresAt: negativeExpiresAt,
      status: responseStatus,
      retryAfterSeconds: circuitError instanceof SemanticScholarRateLimitError ? circuitError.retryAfterSeconds : null,
      cache: { hitSeedCanonicalIds: hitSeedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds },
    }), { status: responseHttpStatus });
  }
  return Response.json(expandResponse({
    seeds: responseSeeds, candidates, similarityEdges,
    sourceStatus: { semanticScholar: semanticStatus, openAlex: openAlexStatus, similarity: similarityStatus }, errors, expiresAt,
    status: undefined,
    retryAfterSeconds: circuitError instanceof SemanticScholarRateLimitError ? circuitError.retryAfterSeconds : null,
    cache: { hitSeedCanonicalIds: hitSeedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds },
  }));
  } catch (error) {
    expansionLockStatus = "unavailable";
    const safeError = reportNetworkSourceError(error, "upstream");
    let stale: ResearchNetworkCandidate[] = [];
    try {
      stale = await loadCandidates(database, spaceId, seedRows, expansionKey, true, limit);
      if (stale.length) await enqueueNetworkReviewCandidates(database, spaceId, seedRows, stale, expansionKey);
    } catch (cacheError) {
      const correlationId = crypto.randomUUID();
      console.error(`[research-network:${correlationId}] recovery-cache`, cacheError);
    }
    if (stale.length) expansionLockStatus = "partial";
    return Response.json(expandResponse({
      seeds: localSeeds(seedRows),
      candidates: stale,
      similarityEdges: directRelationEdges(stale),
      cached: Boolean(stale.length),
      stale: Boolean(stale.length),
      externalUnavailable: true,
      sourceStatus: { semanticScholar: "unavailable", openAlex: "not_attempted", similarity: stale.length ? "partial" : "unavailable" },
      errors: [safeError],
      status: stale.length ? "partial" : "unavailable",
      cache: { hitSeedCanonicalIds: hitSeedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds: [] },
    }), { status: stale.length ? 200 : 503 });
  } finally {
    try {
      await releaseExpansionLock(database, spaceId, expansionKey, expansionLockToken, expansionLockStatus);
    } catch (releaseError) {
      const correlationId = crypto.randomUUID();
      console.error(`[research-network:${correlationId}] release-lock`, releaseError);
    }
  }
}

async function candidateWithRelations(database: D1Database, spaceId: string, candidateId: string) {
  const candidate = await database.prepare(
    `SELECT id, canonical_id, s2_paper_id, openalex_id, doi, title, authors, venue, url, published_at, citation_count, abstract_text, status, score, expires_at
     FROM research_network_candidates WHERE id = ? AND space_id = ? LIMIT 1`,
  ).bind(candidateId, spaceId).first<CandidateRow>();
  if (!candidate) return null;
  const edges = await database.prepare(
    `SELECT e.candidate_id, e.seed_paper_id, p.canonical_id AS seed_canonical_id, e.kind, e.direction, e.is_influential, e.evidence_source,
     e.expansion_key, e.seed_set_json, e.expires_at
     FROM research_network_candidate_edges e JOIN research_track_papers p ON p.id = e.seed_paper_id WHERE e.candidate_id = ? AND e.space_id = ?`,
  ).bind(candidateId, spaceId).all<CandidateEdgeRow>();
  const relations = edges.results.flatMap((edge) => {
    const kind = storedRelationKind(edge.kind);
    if (!kind || !DIRECTIONS.has(edge.direction as ResearchNetworkRelationDirection)) return [];
    const storedSeeds = kind === "recommendation" ? parseStringArray(edge.seed_set_json) : [edge.seed_canonical_id];
    const seedCanonicalIds = storedSeeds.length ? storedSeeds : [edge.seed_canonical_id];
    return [{
      seedCanonicalId: edge.seed_canonical_id,
      seedCanonicalIds,
      joint: kind === "recommendation" && seedCanonicalIds.length > 1,
      kind,
      direction: edge.direction as ResearchNetworkRelationDirection,
      isInfluential: Boolean(edge.is_influential),
      evidenceSource: edge.evidence_source === "openalex" ? "openalex" as const : "semantic-scholar" as const,
    }];
  });
  const seedCoverage = verifiedSeedCoverage(relations);
  return {
    id: candidate.id, canonicalId: candidate.canonical_id,
    ...(candidate.s2_paper_id ? { s2PaperId: candidate.s2_paper_id } : {}),
    ...(candidate.openalex_id ? { openAlexId: candidate.openalex_id } : {}), ...(candidate.doi ? { doi: candidate.doi } : {}),
    title: candidate.title, authors: candidate.authors, venue: candidate.venue, url: candidate.url, publishedAt: candidate.published_at,
    citationCount: candidate.citation_count, abstractText: candidate.abstract_text, score: candidate.score,
    seedCoverage, verifiedSeedCoverage: seedCoverage, bridge: isVerifiedBridge(relations),
    status: asCandidateStatus(candidate.status), relations,
  } satisfies ResearchNetworkCandidate;
}

export async function PATCH(request: Request) {
  let body: { spaceId?: string; candidateId?: string; action?: string; trackId?: string; role?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const spaceId = cleanText(body.spaceId);
  const candidateId = cleanText(body.candidateId);
  const action = cleanText(body.action);
  if (!spaceId || !candidateId || !["accept", "dismiss"].includes(action)) return Response.json({ error: "spaceId, candidateId, and action are required" }, { status: 400 });
  const access = await ownedSpace(request, spaceId);
  if ("error" in access) return access.error;
  const { database } = access;
  const candidate = await candidateWithRelations(database, spaceId, candidateId);
  if (!candidate) return Response.json({ error: "Network candidate not found" }, { status: 404 });
  if (action === "dismiss") {
    if (candidate.status === "accepted") return Response.json({ error: "An accepted paper cannot be dismissed from the candidate queue" }, { status: 409 });
    await database.prepare("UPDATE research_network_candidates SET status = 'dismissed', last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
      .bind(candidateId, spaceId).run();
    return Response.json({ action: "dismiss", candidate: await candidateWithRelations(database, spaceId, candidateId) });
  }

  let trackId = cleanText(body.trackId);
  if (!trackId) {
    const fallback = await database.prepare(
      "SELECT p.track_id FROM research_network_candidate_edges e JOIN research_track_papers p ON p.id = e.seed_paper_id WHERE e.candidate_id = ? AND e.space_id = ? ORDER BY e.score DESC LIMIT 1",
    ).bind(candidateId, spaceId).first<{ track_id: string }>();
    trackId = fallback?.track_id || "";
  }
  const track = trackId ? await database.prepare("SELECT id, title_zh, title_en FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1")
    .bind(trackId, spaceId).first<{ id: string; title_zh: string; title_en: string }>() : null;
  if (!track) return Response.json({ error: "A valid target track is required to accept this candidate" }, { status: 400 });
  const role = TRACK_ROLES.has(cleanText(body.role)) ? cleanText(body.role) : "frontier";
  const stableFormalId = `network-paper:${trackId}:${candidateId}`;
  const relationKinds = Array.from(new Set(candidate.relations.map((relation) => relation.kind)));
  const verifiedDirect = relationKinds.some((kind) => kind === "reference" || kind === "citation");
  const directSources = new Set(candidate.relations.filter((relation) => relation.kind !== "recommendation").map((relation) => relation.evidenceSource));
  const relationSourceZh = directSources.size > 1 ? "Semantic Scholar 与 OpenAlex"
    : directSources.has("openalex") ? "OpenAlex" : "Semantic Scholar";
  const relationSourceEn = relationSourceZh;
  const rationaleZh = verifiedDirect
    ? `该论文通过 ${relationSourceZh} 核验的真实引用或被引关系从当前研究种子扩展，并由用户确认收录。`
    : "该论文由外部学术图谱基于当前研究种子推荐，并由用户确认收录；其引用关系仍待后续核验。";
  const rationaleEn = verifiedDirect
    ? `The paper was expanded from the current seeds through a citation relation verified by ${relationSourceEn} and then accepted by the user.`
    : "The paper was recommended by an external academic graph from the current seeds and accepted by the user; direct citation evidence remains to be verified.";
  const acceptanceQueue = await enqueueMonitorCandidates(database, spaceId, [{
    canonicalId: candidate.canonicalId,
    doi: candidate.doi || null,
    title: candidate.title,
    authors: candidate.authors,
    venue: candidate.venue,
    url: candidate.url,
    publishedAt: candidate.publishedAt,
    abstractText: candidate.abstractText,
    horizon: researchEvidenceHorizon(candidate.publishedAt),
    citationCount: candidate.citationCount,
    relevanceScore: Math.min(68, 48 + (verifiedDirect ? 7 : 0)
      + Math.round(Math.log1p(Math.max(0, candidate.citationCount)) * 3)),
    qualityScore: Math.min(74, 50 + (verifiedDirect ? 5 : 0)
      + Math.round(Math.log1p(Math.max(0, candidate.citationCount)) * 4)),
    priorityVenue: false,
    source: "research-network",
    provenance: [{
      sourceKey: "research-route:network",
      channel: verifiedDirect ? "citation" : "semantic",
      queryKey: `${trackId}:network:accepted`,
      queryText: candidate.title,
      routeId: trackId,
    }],
  }], { recordDiscoveryCoverage: true });
  const queuedPaper = await database.prepare(
    `SELECT p.id, i.analysis_source, i.llm_recommended FROM monitored_papers p
     JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
     WHERE p.space_id = ? AND p.canonical_id = ? LIMIT 1`,
  ).bind(spaceId, acceptanceQueue.canonicalIds[0] || candidate.canonicalId)
    .first<{ id: string; analysis_source: string; llm_recommended: number }>();
  if (!queuedPaper) return Response.json({ error: "Accepted paper could not be queued for quality review" }, { status: 500 });
  const acceptedCanonicalId = acceptanceQueue.canonicalIds[0] || candidate.canonicalId;
  const monitoredPaperId = queuedPaper.id;
  const statements: D1PreparedStatement[] = [];
  statements.push(database.prepare(
    `INSERT INTO research_track_papers
     (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role,
      summary_zh, summary_en, rationale_zh, rationale_en, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      (SELECT COALESCE(MAX(position), -1) + 1 FROM research_track_papers WHERE track_id = ?))
     ON CONFLICT DO UPDATE SET doi = COALESCE(excluded.doi, research_track_papers.doi), title = excluded.title,
      authors = excluded.authors, venue = excluded.venue, url = excluded.url, published_at = excluded.published_at,
      citation_count = MAX(research_track_papers.citation_count, excluded.citation_count), role = excluded.role,
      summary_zh = CASE WHEN excluded.summary_zh <> '' THEN excluded.summary_zh ELSE research_track_papers.summary_zh END,
      summary_en = CASE WHEN excluded.summary_en <> '' THEN excluded.summary_en ELSE research_track_papers.summary_en END,
      rationale_zh = excluded.rationale_zh, rationale_en = excluded.rationale_en`,
  ).bind(stableFormalId, trackId, spaceId, acceptedCanonicalId, candidate.doi || null, candidate.title, candidate.authors,
    candidate.venue, candidate.url, candidate.publishedAt, candidate.citationCount, role, candidate.abstractText,
    candidate.abstractText, rationaleZh, rationaleEn, trackId));
  const verifiedEdges = await database.prepare(
    "SELECT seed_paper_id, kind, direction, evidence_source FROM research_network_candidate_edges WHERE candidate_id = ? AND space_id = ? AND kind IN ('reference', 'citation')",
  ).bind(candidateId, spaceId).all<{ seed_paper_id: string; kind: string; direction: string; evidence_source: string }>();
  for (const edge of verifiedEdges.results) {
    const verifiedByOpenAlex = edge.evidence_source === "openalex";
    const candidateIsSource = edge.direction === "candidate_cites_seed";
    const sourceExpression = candidateIsSource
      ? "candidate_paper.id"
      : "?";
    const targetExpression = candidateIsSource
      ? "?"
      : "candidate_paper.id";
    statements.push(database.prepare(
      `INSERT INTO research_paper_edges
        (id, space_id, source_paper_id, target_paper_id, kind, relation_kind, relationship_zh, relationship_en, confidence, evidence_source)
        SELECT ?, ?, ${sourceExpression}, ${targetExpression}, 'citation', 'cites', ?, ?, 100, ?
        FROM research_track_papers candidate_paper
        WHERE candidate_paper.track_id = ? AND candidate_paper.canonical_id = ? AND candidate_paper.id <> ?
        ON CONFLICT DO UPDATE SET confidence = 100,
        evidence_source = excluded.evidence_source, relationship_zh = excluded.relationship_zh, relationship_en = excluded.relationship_en`,
    ).bind(`network-edge:${candidateId}:${edge.seed_paper_id}:${edge.direction}`, spaceId, edge.seed_paper_id,
      verifiedByOpenAlex ? "OpenAlex 已核验的直接引用关系。" : "Semantic Scholar 已核验的直接引用关系。",
      verifiedByOpenAlex ? "Direct citation verified by OpenAlex." : "Direct citation verified by Semantic Scholar.",
      verifiedByOpenAlex ? "openalex" : "semantic-scholar", trackId, acceptedCanonicalId, edge.seed_paper_id));
  }
  statements.push(
    database.prepare("UPDATE research_network_candidates SET status = 'accepted', last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?").bind(candidateId, spaceId),
    ...confirmedExternalResearchMapEvidenceStatements(database, {
      id: `network-accept:${trackId}:${candidateId}`,
      spaceId, trackId, paperId: monitoredPaperId, paperCanonicalId: acceptedCanonicalId,
      mapRole: role, rationaleZh, rationaleEn,
      confidence: verifiedDirect ? 100 : Math.max(65, candidate.score), paperTitle: candidate.title,
      trackTitleZh: track.title_zh, trackTitleEn: track.title_en,
    }),
  );
  await database.batch(statements);
  const acceptedPaper = await database.prepare(
    "SELECT id FROM research_track_papers WHERE track_id = ? AND canonical_id = ? LIMIT 1",
  ).bind(trackId, acceptedCanonicalId).first<{ id: string }>();
  const qualityStage = queuedPaper.analysis_source === "deepseek" && Boolean(queuedPaper.llm_recommended)
    ? "recommended"
    : queuedPaper.analysis_source === "deepseek_screened"
      ? "reviewing"
      : queuedPaper.analysis_source === "deepseek_rejected"
        ? "rejected"
        : "queued";
  return Response.json({
    action: "accept",
    paperId: acceptedPaper?.id || stableFormalId,
    trackId,
    formalized: true,
    qualityStage,
    reviewQueued: qualityStage === "queued" || qualityStage === "reviewing",
    queue: acceptanceQueue,
    candidate: await candidateWithRelations(database, spaceId, candidateId),
  });
}
