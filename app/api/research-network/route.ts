import { ensureSchema, getApiUser, getDatabase, getRuntimeEnv } from "../../../db/repository";
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
import { isVerifiedBridge, partitionExpansionSeeds, verifiedRelationFallbackEdge, verifiedSeedCoverage } from "../../../lib/research-network";

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
};
type CandidateRow = {
  id: string;
  canonical_id: string;
  s2_paper_id: string | null;
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
  status: string;
  expires_at: string | null;
};
type ExpansionStateRow = {
  expansion_key: string;
  recommendation_offset: number;
  status: string;
  expires_at: string | null;
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
  isRetracted?: boolean;
  references?: Array<{ paperId?: string; externalIds?: { DOI?: string; ArXiv?: string } | null }> | null;
};
type SemanticScholarRelation = {
  citedPaper?: SemanticScholarPaper | null;
  citingPaper?: SemanticScholarPaper | null;
  contexts?: string[] | null;
  intents?: string[] | null;
  isInfluential?: boolean;
};
type SemanticScholarRelationResponse = { data?: SemanticScholarRelation[]; next?: number };
type SemanticScholarRecommendationResponse = { recommendedPapers?: SemanticScholarPaper[] };
type InternalRelation = ResearchNetworkCandidateRelation & {
  seedPaperId: string;
  storageKind: string;
  expansionKey: string;
  intents: string[];
  contexts: string[];
  score: number;
};
type InternalCandidate = Omit<ResearchNetworkCandidate, "id" | "score" | "seedCoverage" | "verifiedSeedCoverage" | "bridge" | "status" | "relations"> & {
  s2PaperId: string;
  doi?: string;
  relations: Map<string, InternalRelation>;
};

const CACHE_HOURS = 24;
const MAX_SEEDS = 3;
const MAX_CANDIDATES = 24;
const DEFAULT_CANDIDATES = 18;
const DAILY_EXTERNAL_CALL_LIMIT = 60;
const RELATION_PAGE_SIZE = 40;
const RECOMMENDATION_POOL_SIZE = 100;
const RECOMMENDATION_PAGE_SIZE = 20;
const NON_PAPER = /(publication information|information for authors|instructions for authors|table of contents|editorial board|front matter|back matter|issue information|journal masthead|correction|erratum)/i;
const RELATION_KINDS = new Set<ResearchNetworkRelationKind>(["reference", "citation", "recommendation"]);
const DIRECTIONS = new Set<ResearchNetworkRelationDirection>(["seed_cites_candidate", "candidate_cites_seed", "undirected"]);
const CANDIDATE_STATUSES = new Set<ResearchNetworkCandidateStatus>(["ghost", "accepted", "dismissed"]);
const TRACK_ROLES = new Set(["foundation", "milestone", "frontier"]);

type ExternalCallBudget = { database: D1Database; scope: string; date: string };

class ExternalCallLimitError extends Error {
  constructor() {
    super("Daily external research-network call limit reached");
    this.name = "ExternalCallLimitError";
  }
}

function cleanText(value: unknown) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
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
  if (!s2PaperId || !canonical || title.length < 8 || NON_PAPER.test(title) || paper.isRetracted) return null;
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
    relations: new Map(),
  };
}

function semanticScholarHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)",
  };
  const key = cleanText(getRuntimeEnv().SEMANTIC_SCHOLAR_API_KEY);
  if (key) headers["x-api-key"] = key;
  return headers;
}

async function consumeExternalCall(budget: ExternalCallBudget) {
  const row = await budget.database.prepare("SELECT request_count FROM ai_usage_daily WHERE scope = ? AND usage_date = ? LIMIT 1")
    .bind(budget.scope, budget.date).first<{ request_count: number }>();
  if ((row?.request_count || 0) >= DAILY_EXTERNAL_CALL_LIMIT) throw new ExternalCallLimitError();
  await budget.database.prepare(
    `INSERT INTO ai_usage_daily (id, scope, usage_date, request_count, input_tokens, output_tokens)
     VALUES (?, ?, ?, 1, 0, 0) ON CONFLICT(scope, usage_date) DO UPDATE SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), budget.scope, budget.date).run();
}

async function semanticScholarFetch(url: URL, init: RequestInit, budget: ExternalCallBudget) {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await consumeExternalCall(budget);
    const response = await fetch(url, {
      ...init,
      headers: { ...semanticScholarHeaders(), ...(init.headers || {}) },
      signal: AbortSignal.timeout(22_000),
    });
    lastResponse = response;
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, response.status === 429 ? 900 : 350));
  }
  return lastResponse!;
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
    "SELECT id, track_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count FROM research_track_papers WHERE space_id = ? ORDER BY citation_count DESC, created_at ASC",
  ).bind(spaceId).all<SeedRow>();
  const byCanonical = new Map<string, SeedRow>();
  for (const row of all.results) if (!byCanonical.has(row.canonical_id)) byCanonical.set(row.canonical_id, row);
  return originCanonicalIds.map((canonical) => byCanonical.get(canonical)).filter((row): row is SeedRow => Boolean(row)).slice(0, MAX_SEEDS);
}

async function resolveSemanticScholarSeeds(rows: SeedRow[], budget: ExternalCallBudget) {
  const identified = rows.map((row) => ({ row, identifier: semanticScholarIdentifier(row) })).filter((entry) => entry.identifier);
  if (!identified.length) return { seeds: [] as ResearchNetworkSeed[], resolved: [] as Array<{ row: SeedRow; paper: SemanticScholarPaper }>, errors: ["Selected papers do not have DOI, arXiv, or Semantic Scholar identifiers"] };
  const endpoint = new URL("https://api.semanticscholar.org/graph/v1/paper/batch");
  endpoint.searchParams.set("fields", "paperId,externalIds,title,authors,venue,url,publicationDate,year,citationCount");
  const response = await semanticScholarFetch(endpoint, { method: "POST", body: JSON.stringify({ ids: identified.map((entry) => entry.identifier) }) }, budget);
  if (!response.ok) throw new Error(`Semantic Scholar seed lookup returned ${response.status}`);
  const records = await response.json() as Array<SemanticScholarPaper | null>;
  const resolved: Array<{ row: SeedRow; paper: SemanticScholarPaper }> = [];
  const errors: string[] = [];
  records.forEach((paper, index) => {
    const identifiedSeed = identified[index];
    if (paper?.paperId && identifiedSeed) resolved.push({ row: identifiedSeed.row, paper });
    else if (identifiedSeed) errors.push(`Semantic Scholar could not resolve ${identifiedSeed.row.title}`);
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

async function fetchSeedRelations(seed: { row: SeedRow; paper: SemanticScholarPaper }, state: SeedExpansionStateRow | undefined, budget: ExternalCallBudget) {
  const results: Array<{ paper: SemanticScholarPaper; relation: InternalRelation }> = [];
  const errors: string[] = [];
  const nextOffsets = { reference: state?.reference_offset || 0, citation: state?.citation_offset || 0 };
  for (const relationKind of ["references", "citations"] as const) {
    const endpoint = new URL(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(seed.paper.paperId!)}/${relationKind}`);
    const offsetKey = relationKind === "references" ? "reference" : "citation";
    endpoint.searchParams.set("offset", String(nextOffsets[offsetKey]));
    endpoint.searchParams.set("limit", String(RELATION_PAGE_SIZE));
    endpoint.searchParams.set("fields", "paperId,externalIds,title,abstract,authors,venue,url,publicationDate,year,citationCount,publicationTypes,isRetracted,contexts,intents,isInfluential");
    try {
      const response = await semanticScholarFetch(endpoint, {}, budget);
      if (!response.ok) throw new Error(`Semantic Scholar ${relationKind} returned ${response.status}`);
      const data = await response.json() as SemanticScholarRelationResponse;
      nextOffsets[offsetKey] = typeof data.next === "number" ? data.next : 0;
      for (const item of data.data || []) {
        const paper = relationKind === "references" ? item.citedPaper : item.citingPaper;
        if (!paper) continue;
        const kind: ResearchNetworkRelationKind = relationKind === "references" ? "reference" : "citation";
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
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Semantic Scholar ${relationKind} failed`);
    }
  }
  return { results, errors, nextOffsets };
}

function recommendationFields(endpoint: URL) {
  endpoint.searchParams.set("limit", String(RECOMMENDATION_POOL_SIZE));
  endpoint.searchParams.set("fields", "paperId,externalIds,title,abstract,authors,venue,url,publicationDate,year,citationCount,publicationTypes,isRetracted");
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
  if (!resolved.length) return { results, errors, nextOffset: offset };
  if (resolved.length > 1) {
    try {
      const endpoint = recommendationFields(new URL("https://api.semanticscholar.org/recommendations/v1/papers"));
      const response = await semanticScholarFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ positivePaperIds: resolved.map((seed) => seed.paper.paperId), negativePaperIds: [] }),
      }, budget);
      if (!response.ok) throw new Error(`Semantic Scholar recommendations returned ${response.status}`);
      const data = await response.json() as SemanticScholarRecommendationResponse;
      const page = rotatedRecommendationPage(data.recommendedPapers || [], offset);
      for (const paper of page.papers) results.push(recommendationRelation(resolved, paper, expansionKey));
      return { results, errors, nextOffset: page.nextOffset };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Semantic Scholar multi-seed recommendations failed");
    }
  }
  let nextOffset = offset;
  for (const seed of resolved) {
    try {
      const endpoint = recommendationFields(new URL(`https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${encodeURIComponent(seed.paper.paperId!)}`));
      const response = await semanticScholarFetch(endpoint, {}, budget);
      if (!response.ok) throw new Error(`Semantic Scholar single-seed recommendations returned ${response.status}`);
      const data = await response.json() as SemanticScholarRecommendationResponse;
      const page = rotatedRecommendationPage(data.recommendedPapers || [], offset);
      nextOffset = page.nextOffset;
      for (const paper of page.papers) results.push(recommendationRelation([seed], paper, expansionKey, seed.row.id));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Semantic Scholar single-seed recommendations failed");
    }
  }
  return { results, errors, nextOffset };
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
       (id, space_id, canonical_id, s2_paper_id, doi, title, authors, venue, url, published_at, citation_count, abstract_text, status, metadata_source, score, discovered_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ghost', 'semantic-scholar', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(space_id, canonical_id) DO UPDATE SET s2_paper_id = excluded.s2_paper_id, doi = COALESCE(excluded.doi, doi),
       title = excluded.title, authors = excluded.authors, venue = excluded.venue, url = excluded.url, published_at = excluded.published_at,
       citation_count = excluded.citation_count, abstract_text = excluded.abstract_text, score = excluded.score, last_seen_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at`,
    ).bind(id, spaceId, candidate.canonicalId, candidate.s2PaperId, candidate.doi || null, candidate.title, candidate.authors, candidate.venue,
      candidate.url, candidate.publishedAt, candidate.citationCount, candidate.abstractText, scoreCandidate(candidate), expiresAt));
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
    `SELECT DISTINCT c.id, c.canonical_id, c.s2_paper_id, c.doi, c.title, c.authors, c.venue, c.url, c.published_at,
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
  const nodes = [
    ...seeds.filter((seed) => seed.s2PaperId).map((seed) => ({ canonicalId: seed.canonicalId, identifier: seed.s2PaperId! })),
    ...candidates.filter((candidate) => candidate.s2PaperId).map((candidate) => ({ canonicalId: candidate.canonicalId, identifier: candidate.s2PaperId! })),
  ];
  const uniqueNodes = Array.from(new Map(nodes.map((node) => [node.canonicalId, node])).values());
  if (uniqueNodes.length < 2) return [] as ResearchNetworkSimilarityEdge[];
  const endpoint = new URL("https://api.semanticscholar.org/graph/v1/paper/batch");
  endpoint.searchParams.set("fields", "paperId,externalIds,references.paperId,references.externalIds");
  const response = await semanticScholarFetch(endpoint, { method: "POST", body: JSON.stringify({ ids: uniqueNodes.map((node) => node.identifier) }) }, budget);
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
  return { database, scope: `research-network-external:${spaceId}`, date: new Date().toISOString().slice(0, 10) };
}

async function loadSeedExpansionStates(database: D1Database, spaceId: string, seeds: SeedRow[]) {
  if (!seeds.length) return new Map<string, SeedExpansionStateRow>();
  const placeholders = seeds.map(() => "?").join(",");
  const rows = await database.prepare(
    `SELECT seed_paper_id, reference_offset, citation_offset, status, expires_at
     FROM research_network_seed_expansion_states WHERE space_id = ? AND seed_paper_id IN (${placeholders})`,
  ).bind(spaceId, ...seeds.map((seed) => seed.id)).all<SeedExpansionStateRow>();
  return new Map(rows.results.map((row) => [row.seed_paper_id, row]));
}

async function loadExpansionState(database: D1Database, spaceId: string, expansionKey: string) {
  return database.prepare(
    "SELECT expansion_key, recommendation_offset, status, expires_at FROM research_network_expansion_states WHERE space_id = ? AND expansion_key = ? LIMIT 1",
  ).bind(spaceId, expansionKey).first<ExpansionStateRow>();
}

function isFreshState(state: { status: string; expires_at: string | null } | null | undefined) {
  return Boolean(state?.status === "ready" && state.expires_at && Date.parse(state.expires_at) > Date.now());
}

async function saveSeedExpansionState(
  database: D1Database,
  spaceId: string,
  seedPaperId: string,
  nextOffsets: { reference: number; citation: number },
  status: "ready" | "partial" | "unavailable",
  error: string,
  expiresAt: string,
) {
  await database.prepare(
    `INSERT INTO research_network_seed_expansion_states
     (id, space_id, seed_paper_id, reference_offset, citation_offset, status, error, last_expanded_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(space_id, seed_paper_id) DO UPDATE SET reference_offset = excluded.reference_offset,
     citation_offset = excluded.citation_offset, status = excluded.status, error = excluded.error,
     last_expanded_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at`,
  ).bind(crypto.randomUUID(), spaceId, seedPaperId, nextOffsets.reference, nextOffsets.citation, status, error || null, expiresAt).run();
}

async function saveExpansionState(
  database: D1Database,
  spaceId: string,
  expansionKey: string,
  seedCanonicalIds: string[],
  nextOffset: number,
  status: "ready" | "partial" | "unavailable",
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
    source: /limit|quota/i.test(message) ? "quota" as const : "semantic-scholar" as const,
    code: /429|limit|quota/i.test(message) ? "rate_limited" : /resolve/i.test(message) ? "seed_unresolved" : "upstream_partial",
    message,
    retryable: /429|limit|quota|returned 5|failed|unavailable/i.test(message),
  }));
}

function expandResponse(values: Partial<ResearchNetworkExpandResponse> & Pick<ResearchNetworkExpandResponse, "seeds" | "candidates">): ResearchNetworkExpandResponse {
  const sourceStatus = values.sourceStatus || { semanticScholar: "not_attempted", openAlex: "not_attempted", similarity: "not_attempted" };
  const errors = values.errors || [];
  const status = values.status || (values.externalUnavailable ? "unavailable"
    : errors.length || sourceStatus.semanticScholar === "partial" || sourceStatus.similarity === "partial" ? "partial" : "ok");
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
  const [seedStates, expansionState] = await Promise.all([
    loadSeedExpansionStates(database, spaceId, seedRows),
    loadExpansionState(database, spaceId, expansionKey),
  ]);
  const recommendationFresh = isFreshState(expansionState);
  const partition = partitionExpansionSeeds(
    seedRows.map((seed) => ({ id: seed.id, canonicalId: seed.canonical_id, row: seed })),
    new Set(seedRows.filter((seed) => isFreshState(seedStates.get(seed.id))).map((seed) => seed.id)),
    recommendationFresh,
    force,
  );
  const hitSeedRows = partition.hitSeeds.map((seed) => seed.row);
  const rowsToExpand = partition.expandSeeds.map((seed) => seed.row);
  const shouldExpandRecommendation = force || !recommendationFresh;
  const cached = await loadCandidates(database, spaceId, seedRows, expansionKey, false, limit);
  if (partition.fullyCached) {
    return Response.json(expandResponse({
      seeds: localSeeds(seedRows),
      candidates: cached,
      similarityEdges: directRelationEdges(cached),
      cached: true,
      sourceStatus: { semanticScholar: "cached", openAlex: "not_attempted", similarity: cached.length ? "partial" : "not_attempted" },
      cache: { hitSeedCanonicalIds: seedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds: [] },
      expiresAt: new Date(Date.now() + CACHE_HOURS * 3600_000).toISOString(),
    }));
  }

  const errors: string[] = [];
  let seedResult: Awaited<ReturnType<typeof resolveSemanticScholarSeeds>>;
  try {
    seedResult = await resolveSemanticScholarSeeds(seedRows, budget);
    errors.push(...seedResult.errors);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Semantic Scholar seed lookup failed");
    const stale = await loadCandidates(database, spaceId, seedRows, expansionKey, true, limit);
    if (stale.length) return Response.json(expandResponse({
      seeds: localSeeds(seedRows),
      candidates: stale, similarityEdges: directRelationEdges(stale), cached: true, stale: true, externalUnavailable: true,
      sourceStatus: { semanticScholar: "unavailable", openAlex: "not_attempted", similarity: "partial" }, errors,
      status: error instanceof ExternalCallLimitError ? "rate_limited" : "partial",
      cache: { hitSeedCanonicalIds: hitSeedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds: [] }, expiresAt: null,
    }));
    return Response.json(expandResponse({
      seeds: localSeeds(seedRows), candidates: [], externalUnavailable: true,
      sourceStatus: { semanticScholar: "unavailable", openAlex: "not_attempted", similarity: "unavailable" }, errors,
      status: error instanceof ExternalCallLimitError ? "rate_limited" : "unavailable",
      cache: { hitSeedCanonicalIds: hitSeedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds: [] },
    }), { status: error instanceof ExternalCallLimitError ? 429 : 503 });
  }

  if (!seedResult.resolved.length) {
    const unresolvedError = "Semantic Scholar could not resolve any selected seed paper";
    errors.push(unresolvedError);
    const stale = await loadCandidates(database, spaceId, seedRows, expansionKey, true, limit);
    return Response.json(expandResponse({
      seeds: localSeeds(seedRows), candidates: stale, similarityEdges: directRelationEdges(stale), cached: Boolean(stale.length), stale: Boolean(stale.length), externalUnavailable: true,
      sourceStatus: { semanticScholar: "unavailable", openAlex: "not_attempted", similarity: stale.length ? "partial" : "unavailable" }, errors,
      status: stale.length ? "partial" : "unavailable",
      cache: { hitSeedCanonicalIds: hitSeedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds: [] },
    }), { status: stale.length ? 200 : 503 });
  }

  const resolvedByPaperId = new Map(seedResult.resolved.map((seed) => [seed.row.id, seed]));
  const resolvedToExpand = rowsToExpand.map((seed) => resolvedByPaperId.get(seed.id)).filter((seed): seed is { row: SeedRow; paper: SemanticScholarPaper } => Boolean(seed));
  const expansionOffset = expansionState?.recommendation_offset || 0;
  const [directRelationResults, recommendationResult] = await Promise.all([
    Promise.all(resolvedToExpand.map((seed) => fetchSeedRelations(seed, seedStates.get(seed.row.id), budget))),
    shouldExpandRecommendation
      ? fetchRecommendations(seedResult.resolved, expansionKey, expansionOffset, budget)
      : Promise.resolve({ results: [] as Array<{ paper: SemanticScholarPaper; relation: InternalRelation }>, errors: [] as string[], nextOffset: expansionOffset }),
  ]);
  const relationResults = [...directRelationResults, recommendationResult];
  errors.push(...relationResults.flatMap((result) => result.errors));
  const expiresAt = new Date(Date.now() + CACHE_HOURS * 3600_000).toISOString();
  const stateWrites: Promise<void>[] = directRelationResults.map((result, index) => {
    const seed = resolvedToExpand[index];
    const status = result.errors.length ? "partial" as const : "ready" as const;
    return saveSeedExpansionState(database, spaceId, seed.row.id, result.nextOffsets, status, result.errors.join(" · "), expiresAt);
  });
  for (const seed of rowsToExpand) {
    if (resolvedByPaperId.has(seed.id)) continue;
    const previous = seedStates.get(seed.id);
    stateWrites.push(saveSeedExpansionState(database, spaceId, seed.id, {
      reference: previous?.reference_offset || 0,
      citation: previous?.citation_offset || 0,
    }, "unavailable", "Semantic Scholar could not resolve this seed", expiresAt));
  }
  if (shouldExpandRecommendation) {
    const recommendationStatus = recommendationResult.results.length || !recommendationResult.errors.length ? "ready" as const : "partial" as const;
    stateWrites.push(saveExpansionState(database, spaceId, expansionKey, seedRows.map((seed) => seed.canonical_id),
      recommendationResult.nextOffset, recommendationStatus, recommendationResult.errors.join(" · "), expiresAt));
  }
  await Promise.all(stateWrites);
  const formalRows = await database.prepare("SELECT canonical_id FROM research_track_papers WHERE space_id = ?")
    .bind(spaceId).all<{ canonical_id: string }>();
  const excluded = new Set(formalRows.results.map((row) => row.canonical_id));
  const hiddenRows = await database.prepare("SELECT canonical_id FROM research_network_candidates WHERE space_id = ? AND status IN ('dismissed', 'accepted')")
    .bind(spaceId).all<{ canonical_id: string }>();
  for (const row of hiddenRows.results) excluded.add(row.canonical_id);
  const aggregated = new Map<string, InternalCandidate>();
  for (const entry of relationResults.flatMap((result) => result.results)) {
    const normalized = normalizePaper(entry.paper);
    if (!normalized || excluded.has(normalized.canonicalId)) continue;
    const current = aggregated.get(normalized.canonicalId) || normalized;
    const relationKey = `${entry.relation.seedPaperId}:${entry.relation.storageKind}`;
    current.relations.set(relationKey, entry.relation);
    if (!current.abstractText && normalized.abstractText) current.abstractText = normalized.abstractText;
    current.citationCount = Math.max(current.citationCount, normalized.citationCount);
    aggregated.set(normalized.canonicalId, current);
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
  let similarityEdges: ResearchNetworkSimilarityEdge[] = [];
  let similarityStatus: ResearchNetworkSourceStatus["similarity"] = "not_attempted";
  try {
    similarityEdges = await buildSimilarityEdges(seedResult.seeds, candidates, budget);
    similarityStatus = "ok";
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Semantic Scholar similarity lookup failed");
    similarityEdges = directRelationEdges(candidates);
    similarityStatus = "partial";
  }
  const semanticStatus: ResearchNetworkSourceStatus["semanticScholar"] = seedResult.resolved.length < seedRows.length
    || errors.some((message) => /references|citations|recommend|resolve|limit|quota/i.test(message)) ? "partial" : "ok";
  if (!candidates.length && errors.length) {
    return Response.json(expandResponse({
      seeds: seedResult.seeds, candidates: [], similarityEdges: [], externalUnavailable: semanticStatus !== "ok",
      sourceStatus: { semanticScholar: semanticStatus, openAlex: "not_attempted", similarity: similarityStatus }, errors, expiresAt,
      cache: { hitSeedCanonicalIds: hitSeedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds: rowsToExpand.map((seed) => seed.canonical_id) },
    }), { status: semanticStatus === "partial" ? 200 : 503 });
  }
  return Response.json(expandResponse({
    seeds: seedResult.seeds, candidates, similarityEdges,
    sourceStatus: { semanticScholar: semanticStatus, openAlex: "not_attempted", similarity: similarityStatus }, errors, expiresAt,
    cache: { hitSeedCanonicalIds: hitSeedRows.map((seed) => seed.canonical_id), expandedSeedCanonicalIds: rowsToExpand.map((seed) => seed.canonical_id) },
  }));
}

async function candidateWithRelations(database: D1Database, spaceId: string, candidateId: string) {
  const candidate = await database.prepare(
    `SELECT id, canonical_id, s2_paper_id, doi, title, authors, venue, url, published_at, citation_count, abstract_text, status, score, expires_at
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
    ...(candidate.s2_paper_id ? { s2PaperId: candidate.s2_paper_id } : {}), ...(candidate.doi ? { doi: candidate.doi } : {}),
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
  const track = trackId ? await database.prepare("SELECT id FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1").bind(trackId, spaceId).first<{ id: string }>() : null;
  if (!track) return Response.json({ error: "A valid target track is required to accept this candidate" }, { status: 400 });
  const role = TRACK_ROLES.has(cleanText(body.role)) ? cleanText(body.role) : "frontier";
  const existingFormal = await database.prepare("SELECT id FROM research_track_papers WHERE track_id = ? AND canonical_id = ? LIMIT 1")
    .bind(trackId, candidate.canonicalId).first<{ id: string }>();
  const formalId = existingFormal?.id || crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  if (!existingFormal) {
    const position = await database.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM research_track_papers WHERE track_id = ?")
      .bind(trackId).first<{ position: number }>();
    const relationKinds = Array.from(new Set(candidate.relations.map((relation) => relation.kind)));
    const verifiedDirect = relationKinds.some((kind) => kind === "reference" || kind === "citation");
    const rationaleZh = verifiedDirect
      ? "该论文通过 Semantic Scholar 的真实引用或被引关系从当前研究种子扩展，并由用户确认收录。"
      : "该论文由 Semantic Scholar 基于当前研究种子推荐，并由用户确认收录；其引用关系仍待后续核验。";
    const rationaleEn = verifiedDirect
      ? "The paper was expanded from the current seeds through a citation relation verified by Semantic Scholar and then accepted by the user."
      : "The paper was recommended by Semantic Scholar from the current seeds and accepted by the user; direct citation evidence remains to be verified.";
    statements.push(database.prepare(
      `INSERT INTO research_track_papers
       (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role, summary_zh, summary_en, rationale_zh, rationale_en, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(formalId, trackId, spaceId, candidate.canonicalId, candidate.doi || null, candidate.title, candidate.authors, candidate.venue,
      candidate.url, candidate.publishedAt, candidate.citationCount, role, candidate.abstractText, candidate.abstractText,
      rationaleZh, rationaleEn, position?.position || 0));
  }
  const verifiedEdges = await database.prepare(
    "SELECT seed_paper_id, kind, direction FROM research_network_candidate_edges WHERE candidate_id = ? AND space_id = ? AND kind IN ('reference', 'citation')",
  ).bind(candidateId, spaceId).all<{ seed_paper_id: string; kind: string; direction: string }>();
  for (const edge of verifiedEdges.results) {
    const sourceId = edge.direction === "candidate_cites_seed" ? formalId : edge.seed_paper_id;
    const targetId = edge.direction === "candidate_cites_seed" ? edge.seed_paper_id : formalId;
    if (sourceId === targetId) continue;
    statements.push(database.prepare(
      `INSERT INTO research_paper_edges
       (id, space_id, source_paper_id, target_paper_id, kind, relation_kind, relationship_zh, relationship_en, confidence, evidence_source)
       VALUES (?, ?, ?, ?, 'citation', 'cites', 'Semantic Scholar 已核验的直接引用关系。', 'Direct citation verified by Semantic Scholar.', 100, 'semantic-scholar')
       ON CONFLICT(source_paper_id, target_paper_id, kind, relation_kind) DO UPDATE SET confidence = 100, evidence_source = 'semantic-scholar'`,
    ).bind(crypto.randomUUID(), spaceId, sourceId, targetId));
  }
  statements.push(
    database.prepare("UPDATE research_network_candidates SET status = 'accepted', last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?").bind(candidateId, spaceId),
    database.prepare(
      `INSERT INTO research_paper_network_states (space_id, status, built_paper_count, model, sources_json, error, updated_at)
       VALUES (?, 'idle', 0, '', '[]', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id) DO UPDATE SET status = 'idle', error = NULL, updated_at = CURRENT_TIMESTAMP`,
    ).bind(spaceId),
  );
  await database.batch(statements);
  return Response.json({ action: "accept", paperId: formalId, trackId, candidate: await candidateWithRelations(database, spaceId, candidateId) });
}
