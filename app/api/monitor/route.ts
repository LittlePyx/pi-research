import { ensureSchema, getApiUser, getDatabase, getRuntimeEnv } from "../../../db/repository";
import { arxivIdFromUrl, buildArxivSearchQuery, normalizeWorkTitle, parseArxivAtom } from "../../../lib/discovery/arxiv";
import { passesRecommendationGate } from "../../../lib/discovery/review-gate";
import { readPreferenceSignals, upsertPreferenceSignal } from "../../../lib/preference-memory";
import { getDomainProfile, inferDomainProfile } from "./domain-profiles";

type Horizon = "days" | "months" | "years";
type CrossrefDate = { "date-parts"?: number[][] };
type CrossrefItem = {
  DOI?: string;
  URL?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string; name?: string }>;
  "container-title"?: string[];
  published?: CrossrefDate;
  "published-online"?: CrossrefDate;
  "published-print"?: CrossrefDate;
  "is-referenced-by-count"?: number;
  score?: number;
  type?: string;
};
type CrossrefResponse = { message?: { items?: CrossrefItem[] } };
type SemanticScholarPaper = {
  paperId?: string;
  externalIds?: { DOI?: string; ArXiv?: string } | null;
  title?: string;
  abstract?: string | null;
  authors?: Array<{ name?: string }>;
  venue?: string | null;
  url?: string;
  publicationDate?: string | null;
  year?: number | null;
  citationCount?: number;
};
type SemanticScholarResponse = { data?: SemanticScholarPaper[] };
type SemanticScholarGraphResponse = { data?: Array<{ citingPaper?: SemanticScholarPaper | null; citedPaper?: SemanticScholarPaper | null }> };
type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  title?: string;
  display_name?: string;
  relevance_score?: number;
  publication_date?: string | null;
  cited_by_count?: number;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { landing_page_url?: string | null; source?: { display_name?: string } | null } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
};
type OpenAlexResponse = { results?: OpenAlexWork[] };
type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

type SpaceRow = {
  id: string;
  name: string;
  description: string;
  memoryContext?: string;
  positiveExamples?: string;
  negativeExamples?: string;
};
type ExplorationMode = "focused" | "balanced" | "open";
type PreferenceRow = { profile_key: string; priority_venues: string; tracked_authors: string; exploration_mode: string; user_modified: number };
type QueryPlan = {
  planDate: string;
  explorationMode: ExplorationMode;
  queries: Record<Horizon, string[]>;
  rationaleZh: string;
  rationaleEn: string;
  model: string;
  error: string | null;
};
type RunRow = {
  status: string;
  last_run_at: string | null;
  next_run_at: string | null;
  new_count: number;
  scanned_count: number;
  discovery_round: number;
  error: string | null;
};
type ScanJobRow = {
  id: string;
  status: string;
  current_horizon: string;
  current_source: string;
  progress: number;
  discovered_count: number;
  new_candidate_count: number;
  duplicate_count: number;
  reviewed_count: number;
  recommended_count: number;
  rejected_count: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
};
type CoverageRow = {
  source_key: string;
  channel: string;
  attempt_count: number;
  candidate_count: number;
  total_candidate_count: number;
  new_candidate_count: number;
  query_text: string;
  next_cursor: number;
  zero_yield_streak: number;
  branch_status: string;
  cooldown_until: string | null;
  first_scanned_at: string | null;
  last_scanned_at: string | null;
  last_error: string | null;
};
type PaperRow = {
  id: string;
  canonical_id: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  horizon: Horizon;
  citation_count: number;
  relevance_score: number;
  discovered_at: string;
  abstract_text: string;
  summary_zh: string;
  summary_en: string;
  why_read_zh: string;
  why_read_en: string;
  quality_score: number;
  priority_venue: number;
  analysis_source: string;
  analysis_model: string;
  llm_recommended: number;
  llm_relevance_score: number;
  show_count: number;
  first_shown_at: string | null;
  last_shown_at: string | null;
  opened_at: string | null;
  snoozed_until: string | null;
  saved: number;
  feedback: string | null;
  reading_status: string;
  reading_note: string;
  recommendation_tier: string;
  read_minutes: number;
  read_depth: string;
  problem_zh: string;
  problem_en: string;
  method_zh: string;
  method_en: string;
  contribution_zh: string;
  contribution_en: string;
  limitations_zh: string;
  limitations_en: string;
  reading_focus_zh: string;
  reading_focus_en: string;
  research_questions_zh: string;
  research_questions_en: string;
};
type Candidate = {
  canonicalId: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  abstractText: string;
  horizon: Horizon;
  citationCount: number;
  relevanceScore: number;
  qualityScore: number;
  priorityVenue: boolean;
  source: "crossref" | "semantic_scholar" | "openalex" | "arxiv";
  discoveryChannel: "topic" | "journal" | "author" | "semantic" | "preprint" | "citation";
  provenance: CandidateProvenance[];
};
type CandidateProvenance = {
  sourceKey: string;
  channel: Candidate["discoveryChannel"];
  queryKey: string;
};
type DiscoveryQuery = {
  key: string;
  query: string;
  sort: "relevance" | "is-referenced-by-count" | "published";
  rotating: boolean;
  channel: Candidate["discoveryChannel"];
  sourceKey: string;
  venue?: string;
  issn?: string;
  author?: string;
};
type PaperReview = {
  canonicalId: string;
  isPaper: boolean;
  recommended: boolean;
  relevanceScore: number;
  qualityScore: number;
  summaryZh: string;
  summaryEn: string;
  whyReadZh: string;
  whyReadEn: string;
  screeningReason: string;
  trackId: string;
  mapRole: "milestone" | "frontier";
  mapRationaleZh: string;
  mapRationaleEn: string;
  recommendationTier: "must_read" | "browse" | "reserve";
  readMinutes: number;
  readDepth: "overview" | "focused" | "deep";
  problemZh: string;
  problemEn: string;
  methodZh: string;
  methodEn: string;
  contributionZh: string;
  contributionEn: string;
  limitationsZh: string;
  limitationsEn: string;
  readingFocusZh: string;
  readingFocusEn: string;
  researchQuestionsZh: string[];
  researchQuestionsEn: string[];
};
type MapTrackContext = { id: string; title_zh: string; title_en: string; summary_en: string; search_queries: string };

const CADENCE_MS = 24 * 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 60 * 1000;
const ERROR_RETRY_MS = 15 * 60 * 1000;
const STALE_RUN_MS = 20 * 60 * 1000;
const DISCOVERY_OFFSET_LIMIT = 3000;
const REVIEW_BATCH_SIZE = 14;
const HORIZON_REVIEW_LIMITS: Record<Horizon, number> = { days: 12, months: 16, years: 28 };
const HORIZON_POOL_LIMITS: Record<Horizon, number> = { days: 80, months: 100, years: 140 };
const HORIZONS = [
  { key: "days" as const, daysFrom: 14, daysUntil: 0, sort: "relevance" },
  { key: "months" as const, daysFrom: 180, daysUntil: 15, sort: "relevance" },
  { key: "years" as const, daysFrom: 365 * 5, daysUntil: 181, sort: "is-referenced-by-count" },
] as const;
const MONITOR_LLM_REVIEW_RELEASED_AT = Date.parse("2026-08-18T09:03:00.000Z");
const MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT = 200;
const MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT = 20;
const MONITOR_MODEL = "deepseek-v4-pro";
const RECOMMENDATION_THRESHOLD = 75;
const PAPER_TYPES = new Set(["journal-article", "proceedings-article", "posted-content"]);
const GENERIC_TERMS = new Set([
  "about", "after", "against", "analysis", "and", "applied", "are", "based", "between", "current", "for", "from", "into", "its", "modern",
  "new", "paper", "research", "study", "theory", "through", "toward", "towards", "under", "using", "via", "with", "work", "方向", "研究", "理论", "问题",
]);
const NON_PAPER_TITLES = /^(introduction|editorial|preface|foreword|contents|index)$/i;
const NON_PAPER_PHRASES = /(publication information|information for authors|instructions for authors|author information|table of contents|editorial board|front matter|back matter|issue information|journal masthead)/i;
const PRIORITY_JOURNAL_ISSNS = new Map<string, string>([
  ["ieee transactions on information theory", "0018-9448"],
  ["journal of machine learning research", "1532-4435"],
  ["communications on pure and applied mathematics", "0010-3640"],
  ["archive for rational mechanics and analysis", "0003-9527"],
  ["journal of functional analysis", "0022-1236"],
  ["siam journal on mathematical analysis", "0036-1410"],
  ["calculus of variations and partial differential equations", "0944-2669"],
  ["annals of probability", "0091-1798"],
  ["inventiones mathematicae", "0020-9910"],
  ["annals of statistics", "0090-5364"],
  ["journal of the american statistical association", "0162-1459"],
  ["biometrika", "0006-3444"],
  ["journal of the royal statistical society series b", "1369-7412"],
  ["bernoulli", "1350-7265"],
  ["journal of the acm", "0004-5411"],
  ["siam journal on computing", "0097-5397"],
  ["transactions of the association for computational linguistics", "2307-387X"],
  ["physical review letters", "0031-9007"],
  ["nature physics", "1745-2473"],
  ["physical review x", "2160-3308"],
  ["reviews of modern physics", "0034-6861"],
  ["journal of high energy physics", "1029-8479"],
  ["nature communications", "2041-1723"],
]);

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function cleanText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function publicationDate(item: CrossrefItem) {
  const parts = item["published-online"]?.["date-parts"]?.[0]
    || item["published-print"]?.["date-parts"]?.[0]
    || item.published?.["date-parts"]?.[0];
  if (!parts?.[0]) return null;
  return `${String(parts[0]).padStart(4, "0")}-${String(parts[1] || 1).padStart(2, "0")}-${String(parts[2] || 1).padStart(2, "0")}`;
}

function parseVenues(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeVenue(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function focusTerms(space: SpaceRow) {
  return cleanText(`${space.description || space.name} ${space.memoryContext || ""}`)
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3 && !GENERIC_TERMS.has(term));
}

function normalizedResearchText(value: string) {
  return ` ${cleanText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
}

function termMatchCount(haystack: string, terms: string[]) {
  return new Set(terms.filter((term) => haystack.includes(` ${term} `))).size;
}

function relevanceSignals(title: string, space: SpaceRow, profileKey: string) {
  const haystack = normalizedResearchText(title);
  const focusedMatches = termMatchCount(haystack, focusTerms(space));
  const matchedKeywords = getDomainProfile(profileKey).keywords.filter((keyword) => {
    const normalized = normalizedResearchText(keyword).trim();
    return normalized.length >= 3 && haystack.includes(` ${normalized} `);
  });
  const strongProfileMatches = matchedKeywords.filter((keyword) => /[\s-]/.test(keyword.trim())).length;
  const singleProfileMatches = matchedKeywords.length - strongProfileMatches;
  return {
    focusedMatches,
    strongProfileMatches,
    singleProfileMatches,
    score: focusedMatches + strongProfileMatches * 3 + singleProfileMatches,
  };
}

function isResearchPaper(title: string) {
  const normalized = cleanText(title);
  return normalized.length >= 12 && !NON_PAPER_TITLES.test(normalized) && !NON_PAPER_PHRASES.test(normalized);
}

function isPriorityVenue(venue: string, priorityVenues: string[]) {
  const normalized = normalizeVenue(venue);
  if (!normalized) return false;
  return priorityVenues.some((priority) => {
    const target = normalizeVenue(priority);
    return target.length > 5 && (normalized.includes(target) || target.includes(normalized));
  });
}

function scoreCandidate(candidate: Omit<Candidate, "qualityScore" | "priorityVenue">, priorityVenues: string[], now: Date) {
  const priorityVenue = isPriorityVenue(candidate.venue, priorityVenues);
  const published = candidate.publishedAt ? Date.parse(candidate.publishedAt) : now.getTime();
  const ageDays = Math.max(0, Math.round((now.getTime() - published) / (24 * 60 * 60 * 1000)));
  const relevance = Math.min(40, Math.log1p(candidate.relevanceScore) * 9);
  const citations = Math.min(70, Math.log1p(candidate.citationCount) * 13);
  let qualityScore: number;
  if (candidate.horizon === "days") {
    qualityScore = 115 - Math.min(55, ageDays * 3.5) + relevance * 0.45 + citations * 0.2 + (priorityVenue ? 18 : 0);
  } else if (candidate.horizon === "months") {
    qualityScore = 38 + Math.max(0, 28 - ageDays * 0.12) + relevance * 0.8 + citations * 0.65 + (priorityVenue ? 42 : 0);
  } else {
    qualityScore = 30 + relevance * 0.35 + citations + (priorityVenue ? 48 : 0) + (candidate.abstractText ? 8 : 0);
  }
  return { ...candidate, priorityVenue, qualityScore: Math.max(0, Math.round(qualityScore)) };
}

async function titleFingerprint(title: string) {
  const normalized = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return "title:" + Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function normalizeItem(item: CrossrefItem, horizon: Horizon): Promise<Omit<Candidate, "qualityScore" | "priorityVenue"> | null> {
  const title = cleanText(item.title?.[0] || "");
  if (!title || !PAPER_TYPES.has(item.type || "") || !isResearchPaper(title)) return null;
  const doi = item.DOI?.trim().toLowerCase() || null;
  const authors = (item.author || []).slice(0, 8).map((author) => {
    return cleanText(author.name || [author.given, author.family].filter(Boolean).join(" "));
  }).filter(Boolean).join(", ");
  const venue = cleanText(item["container-title"]?.[0] || "");
  return {
    canonicalId: doi ? "doi:" + doi : await titleFingerprint(title),
    doi,
    title,
    authors,
    venue,
    url: item.URL || (doi ? "https://doi.org/" + doi : ""),
    publishedAt: publicationDate(item),
    abstractText: cleanText(item.abstract || "").slice(0, 2200),
    horizon,
    citationCount: Math.max(0, Math.round(item["is-referenced-by-count"] || 0)),
    relevanceScore: Math.max(0, Math.round(item.score || 0)),
    source: "crossref",
    discoveryChannel: "topic",
    provenance: [],
  };
}

async function normalizeSemanticScholarItem(item: SemanticScholarPaper, horizon: Horizon): Promise<Omit<Candidate, "qualityScore" | "priorityVenue"> | null> {
  const title = cleanText(item.title || "");
  if (!title || !isResearchPaper(title)) return null;
  const doi = item.externalIds?.DOI?.trim().toLocaleLowerCase() || null;
  const publishedAt = item.publicationDate || (item.year ? `${item.year}-01-01` : null);
  return {
    canonicalId: doi ? "doi:" + doi : await titleFingerprint(title),
    doi,
    title,
    authors: (item.authors || []).slice(0, 8).map((author) => cleanText(author.name || "")).filter(Boolean).join(", "),
    venue: cleanText(item.venue || ""),
    url: item.url || (doi ? "https://doi.org/" + doi : item.externalIds?.ArXiv ? "https://arxiv.org/abs/" + item.externalIds.ArXiv : ""),
    publishedAt,
    abstractText: cleanText(item.abstract || "").slice(0, 2200),
    horizon,
    citationCount: Math.max(0, Math.round(item.citationCount || 0)),
    relevanceScore: 0,
    source: "semantic_scholar",
    discoveryChannel: "semantic",
    provenance: [],
  };
}

function openAlexAbstract(index: Record<string, number[]> | null | undefined) {
  if (!index) return "";
  const words: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(index)) for (const position of positions) words.push([position, word]);
  return cleanText(words.sort((left, right) => left[0] - right[0]).map((entry) => entry[1]).join(" ")).slice(0, 2200);
}

async function normalizeOpenAlexItem(item: OpenAlexWork, horizon: Horizon): Promise<Omit<Candidate, "qualityScore" | "priorityVenue"> | null> {
  const title = cleanText(item.display_name || item.title || "");
  if (!title || !isResearchPaper(title)) return null;
  const doi = item.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim().toLocaleLowerCase() || null;
  return {
    canonicalId: doi ? "doi:" + doi : await titleFingerprint(title),
    doi,
    title,
    authors: (item.authorships || []).slice(0, 8).map((authorship) => cleanText(authorship.author?.display_name || "")).filter(Boolean).join(", "),
    venue: cleanText(item.primary_location?.source?.display_name || ""),
    url: item.primary_location?.landing_page_url || item.doi || item.id || "",
    publishedAt: item.publication_date || null,
    abstractText: openAlexAbstract(item.abstract_inverted_index),
    horizon,
    citationCount: Math.max(0, Math.round(item.cited_by_count || 0)),
    relevanceScore: Math.max(0, Math.round(item.relevance_score || 0)),
    source: "openalex",
    discoveryChannel: "semantic",
    provenance: [],
  };
}

async function normalizeArxivItem(item: ReturnType<typeof parseArxivAtom>[number], horizon: Horizon): Promise<Omit<Candidate, "qualityScore" | "priorityVenue"> | null> {
  const title = cleanText(item.title);
  if (!title || !isResearchPaper(title)) return null;
  const doi = item.doi?.trim().toLocaleLowerCase() || null;
  return {
    canonicalId: doi ? "doi:" + doi : "arxiv:" + item.arxivId.toLocaleLowerCase(),
    doi,
    title,
    authors: item.authors.slice(0, 8).map(cleanText).filter(Boolean).join(", "),
    venue: item.primaryCategory ? `arXiv · ${item.primaryCategory}` : "arXiv",
    url: item.url || `https://arxiv.org/abs/${item.arxivId}`,
    publishedAt: item.publishedAt,
    abstractText: cleanText(item.abstract).slice(0, 2200),
    horizon,
    citationCount: 0,
    relevanceScore: 0,
    source: "arxiv",
    discoveryChannel: "preprint",
    provenance: [],
  };
}

function asciiOnly(value: string) {
  return Array.from(value).every((character) => (character.codePointAt(0) || 0) <= 127);
}

function rotatedSlice(items: string[], round: number, size: number) {
  if (!items.length) return [];
  const start = (round * size) % items.length;
  return Array.from({ length: Math.min(size, items.length) }, (_, index) => items[(start + index) % items.length]);
}

function discoveryQueries(space: SpaceRow, horizon: typeof HORIZONS[number], profileKey: string, round: number, priorityVenues: string[], trackedAuthors: string[], queryPlan?: QueryPlan): DiscoveryQuery[] {
  const profile = getDomainProfile(profileKey);
  const description = cleanText(`${space.name} ${space.description}`).slice(0, 320);
  const profileTerms = profile.keywords.filter(asciiOnly);
  const memoryTerms = `${space.memoryContext || ""}; ${space.positiveExamples || ""}`.split(";").map(cleanText).filter((term) => term.length >= 4 && asciiOnly(term));
  const profileWindow = rotatedSlice(profileTerms, round, 3);
  const memoryWindow = rotatedSlice(memoryTerms, round, 3);
  const venueWindow = rotatedSlice(priorityVenues.filter(asciiOnly), round, horizon.key === "days" ? 4 : horizon.key === "months" ? 3 : 2);
  const authorWindow = rotatedSlice(trackedAuthors.filter(asciiOnly), round, horizon.key === "years" ? 2 : 3);
  const queries: DiscoveryQuery[] = [
    { key: "topic-anchor", sourceKey: "crossref:topic", query: description, sort: horizon.key === "days" ? "published" : horizon.sort, rotating: false, channel: "topic" },
    { key: "profile-cluster", sourceKey: "crossref:profile", query: `${space.description} ${profileWindow.join(" ")}`, sort: "relevance", rotating: true, channel: "topic" },
  ];
  for (const [index, query] of (queryPlan?.queries[horizon.key] || []).entries()) {
    queries.push({
      key: `ai-plan-${index + 1}`,
      sourceKey: `crossref:ai-plan:${index + 1}`,
      query,
      sort: horizon.key === "days" ? "published" : horizon.sort,
      rotating: true,
      channel: "topic",
    });
  }
  if (memoryWindow.length) {
    queries.push({ key: "memory-cluster", sourceKey: "crossref:memory", query: `${space.name} ${memoryWindow.join(" ")}`, sort: horizon.key === "years" ? "is-referenced-by-count" : "relevance", rotating: true, channel: "topic" });
  }
  for (const venue of venueWindow) {
    queries.push({
      key: "priority-journal",
      sourceKey: `crossref:journal:${PRIORITY_JOURNAL_ISSNS.get(normalizeVenue(venue)) || normalizeVenue(venue)}`,
      query: `${space.description} ${profileWindow.slice(0, 2).join(" ")}`,
      venue,
      sort: horizon.key === "years" ? "is-referenced-by-count" : horizon.key === "days" ? "published" : "relevance",
      rotating: horizon.key !== "days",
      channel: "journal",
      issn: PRIORITY_JOURNAL_ISSNS.get(normalizeVenue(venue)),
    });
  }
  for (const author of authorWindow) {
    queries.push({
      key: "tracked-author",
      sourceKey: `crossref:author:${normalizeVenue(author)}`,
      query: `${space.description} ${profileWindow.slice(0, 2).join(" ")}`,
      author,
      sort: horizon.key === "days" ? "published" : horizon.sort,
      rotating: horizon.key !== "days",
      channel: "author",
    });
  }
  if (horizon.key === "years") {
    queries.push({
      key: "durable-cluster",
      sourceKey: "crossref:durable",
      query: `${space.name} ${memoryWindow.join(" ") || profileWindow.join(" ")}`,
      sort: "is-referenced-by-count",
      rotating: true,
      channel: "topic",
    });
  }
  return queries.map((item) => ({ ...item, query: cleanText(item.query).slice(0, 480) })).filter((item) => item.query.length >= 4);
}

async function discoveryQueryKey(query: DiscoveryQuery) {
  const identity = [query.key, query.sourceKey, query.channel, query.query.toLocaleLowerCase(), query.venue?.toLocaleLowerCase() || "", query.issn || "", query.sort].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const suffix = Array.from(new Uint8Array(digest)).slice(0, 10).map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${query.key}:${suffix}`;
}

async function discoveryOffset(database: D1Database, spaceId: string, horizon: Horizon, query: DiscoveryQuery) {
  if (!query.rotating) return 0;
  const queryKey = await discoveryQueryKey(query);
  const row = await database.prepare(
    "SELECT next_offset FROM monitor_discovery_pages WHERE space_id = ? AND horizon = ? AND query_key = ? LIMIT 1",
  ).bind(spaceId, horizon, queryKey).first<{ next_offset: number }>();
  return Math.max(0, row?.next_offset || 0);
}

async function advanceDiscoveryOffset(database: D1Database, spaceId: string, horizon: Horizon, query: DiscoveryQuery, offset: number, rows: number) {
  if (!query.rotating) return 0;
  const queryKey = await discoveryQueryKey(query);
  const nextOffset = offset + rows >= DISCOVERY_OFFSET_LIMIT ? 0 : offset + rows;
  await database.prepare(
    `INSERT INTO monitor_discovery_pages (id, space_id, horizon, query_key, next_offset)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(space_id, horizon, query_key) DO UPDATE SET next_offset = excluded.next_offset, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), spaceId, horizon, queryKey, nextOffset).run();
  return nextOffset;
}

async function countNewCandidates(database: D1Database, spaceId: string, candidates: Array<{ canonicalId: string }>) {
  if (!candidates.length) return 0;
  const ids = Array.from(new Set(candidates.map((candidate) => candidate.canonicalId)));
  let known = 0;
  for (let start = 0; start < ids.length; start += 70) {
    const chunk = ids.slice(start, start + 70);
    const placeholders = chunk.map(() => "?").join(", ");
    const row = await database.prepare(`SELECT COUNT(*) AS count FROM monitored_papers WHERE space_id = ? AND canonical_id IN (${placeholders})`)
      .bind(spaceId, ...chunk).first<{ count: number }>();
    known += row?.count || 0;
  }
  return Math.max(0, ids.length - known);
}

async function shouldRunDiscoveryQuery(database: D1Database, spaceId: string, horizon: Horizon, plan: DiscoveryQuery) {
  if (!plan.rotating) return true;
  const queryKey = await discoveryQueryKey(plan);
  const row = await database.prepare(
    "SELECT cooldown_until FROM monitor_discovery_coverage WHERE space_id = ? AND horizon = ? AND source_key = ? AND query_key = ? LIMIT 1",
  ).bind(spaceId, horizon, plan.sourceKey, queryKey).first<{ cooldown_until: string | null }>();
  return !row?.cooldown_until || Date.parse(row.cooldown_until) <= Date.now();
}

async function recordDiscoveryCoverage(
  database: D1Database,
  spaceId: string,
  horizon: Horizon,
  plan: DiscoveryQuery,
  nextCursor: number,
  candidates: Array<{ canonicalId: string }>,
  error: string | null = null,
) {
  const queryKey = await discoveryQueryKey(plan);
  const newCount = error ? 0 : await countNewCandidates(database, spaceId, candidates);
  const previous = await database.prepare(
    "SELECT zero_yield_streak, cooldown_until FROM monitor_discovery_coverage WHERE space_id = ? AND horizon = ? AND source_key = ? AND query_key = ? LIMIT 1",
  ).bind(spaceId, horizon, plan.sourceKey, queryKey).first<{ zero_yield_streak: number; cooldown_until: string | null }>();
  const zeroYieldStreak = error ? previous?.zero_yield_streak || 0 : newCount > 0 ? 0 : (previous?.zero_yield_streak || 0) + 1;
  const cooldownDays = zeroYieldStreak >= 3 ? Math.min(14, 2 ** (zeroYieldStreak - 2)) : 0;
  const cooldownUntil = error ? previous?.cooldown_until || null : cooldownDays
    ? new Date(Date.now() + cooldownDays * 86_400_000).toISOString() : null;
  const branchStatus = error ? "error" : cooldownUntil ? "cooling" : nextCursor === 0 && plan.rotating ? "revisit" : "exploring";
  const queryText = cleanText(plan.author ? `Author: ${plan.author}` : plan.venue ? `Journal: ${plan.venue}` : plan.query).slice(0, 500);
  await database.prepare(
    `INSERT INTO monitor_discovery_coverage
     (id, space_id, horizon, source_key, channel, query_key, query_text, next_cursor, attempt_count, candidate_count,
      total_candidate_count, new_candidate_count, zero_yield_streak, branch_status, cooldown_until,
      first_scanned_at, last_scanned_at, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(space_id, horizon, source_key, query_key) DO UPDATE SET
       query_text = excluded.query_text, next_cursor = excluded.next_cursor,
       attempt_count = monitor_discovery_coverage.attempt_count + 1,
       candidate_count = excluded.candidate_count,
       total_candidate_count = monitor_discovery_coverage.total_candidate_count + excluded.total_candidate_count,
       new_candidate_count = monitor_discovery_coverage.new_candidate_count + excluded.new_candidate_count,
       zero_yield_streak = excluded.zero_yield_streak, branch_status = excluded.branch_status,
       cooldown_until = excluded.cooldown_until,
       first_scanned_at = COALESCE(monitor_discovery_coverage.first_scanned_at, CURRENT_TIMESTAMP),
       last_scanned_at = CURRENT_TIMESTAMP, last_error = excluded.last_error, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), spaceId, horizon, plan.sourceKey, plan.channel, queryKey, queryText, nextCursor,
    candidates.length, candidates.length, newCount, zeroYieldStreak, branchStatus, cooldownUntil, error).run();
}

async function setScanSource(database: D1Database, jobId: string, horizon: Horizon, source: string, progress: number, discoveredCount: number) {
  await database.prepare(
    "UPDATE monitor_scan_jobs SET current_horizon = ?, current_source = ?, progress = ?, discovered_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(horizon, source, progress, discoveredCount, jobId).run();
}

async function fetchHorizon(
  database: D1Database,
  space: SpaceRow,
  horizon: typeof HORIZONS[number],
  now: Date,
  priorityVenues: string[],
  trackedAuthors: string[],
  profileKey: string,
  round: number,
  jobId: string,
  discoveredBefore: number,
  queryPlan?: QueryPlan,
) {
  const rows = horizon.key === "years" ? 36 : 30;
  const plans = discoveryQueries(space, horizon, profileKey, round, priorityVenues, trackedAuthors, queryPlan);
  const eligiblePlans = (await Promise.all(plans.map(async (plan) => ({ plan, eligible: await shouldRunDiscoveryQuery(database, space.id, horizon.key, plan) }))))
    .filter((entry) => entry.eligible).map((entry) => entry.plan);
  const requestOptions: RequestInit = {
    headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
    signal: AbortSignal.timeout(20_000),
  };
  await setScanSource(database, jobId, horizon.key, "Crossref · priority journals", horizon.key === "days" ? 8 : horizon.key === "months" ? 24 : 40, discoveredBefore);
  const normalizedCrossref = (await Promise.all(eligiblePlans.map(async (plan) => {
    const offset = await discoveryOffset(database, space.id, horizon.key, plan);
    const endpoint = new URL(plan.channel === "journal" && plan.issn
      ? `https://api.crossref.org/journals/${encodeURIComponent(plan.issn)}/works`
      : "https://api.crossref.org/works");
    if (plan.channel === "journal" && plan.venue && !plan.issn) endpoint.searchParams.set("query.container-title", plan.venue);
    if (plan.channel === "author" && plan.author) endpoint.searchParams.set("query.author", plan.author);
    if (!(plan.channel === "journal" && horizon.key === "days") && plan.channel !== "author") endpoint.searchParams.set("query.bibliographic", plan.query);
    endpoint.searchParams.set("filter", `from-pub-date:${isoDate(dateBefore(now, horizon.daysFrom))},until-pub-date:${isoDate(dateBefore(now, horizon.daysUntil))}`);
    endpoint.searchParams.set("rows", String(rows));
    endpoint.searchParams.set("offset", String(offset));
    endpoint.searchParams.set("sort", plan.sort);
    endpoint.searchParams.set("order", "desc");
    endpoint.searchParams.set("mailto", "pi-research@qiudao-pika.chatgpt.site");
    try {
      let response = await fetch(endpoint, requestOptions);
      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        response = await fetch(endpoint, requestOptions);
      }
      if (!response.ok) throw new Error(`Crossref returned ${response.status}`);
      const data = await response.json() as CrossrefResponse;
      const queryKey = await discoveryQueryKey(plan);
      const normalized = (await Promise.all((data.message?.items || []).map(async (item) => {
        const candidate = await normalizeItem(item, horizon.key);
        return candidate ? {
          ...candidate,
          discoveryChannel: plan.channel,
          provenance: [{ sourceKey: plan.sourceKey, channel: plan.channel, queryKey }],
        } : null;
      }))).filter((candidate): candidate is Omit<Candidate, "qualityScore" | "priorityVenue"> => Boolean(candidate));
      const nextOffset = await advanceDiscoveryOffset(database, space.id, horizon.key, plan, offset, rows);
      await recordDiscoveryCoverage(database, space.id, horizon.key, plan, nextOffset, normalized);
      return normalized;
    } catch (error) {
      await recordDiscoveryCoverage(database, space.id, horizon.key, plan, offset, [], error instanceof Error ? error.message.slice(0, 180) : "Crossref request failed");
      return [] as Array<Omit<Candidate, "qualityScore" | "priorityVenue">>;
    }
  }))).flat();
  await setScanSource(database, jobId, horizon.key, "Semantic Scholar", horizon.key === "days" ? 12 : horizon.key === "months" ? 28 : 44, discoveredBefore + normalizedCrossref.length);
  const semantic = await fetchSemanticScholarHorizon(database, space, horizon, now, round, queryPlan);
  await setScanSource(database, jobId, horizon.key, "OpenAlex", horizon.key === "days" ? 15 : horizon.key === "months" ? 31 : 47, discoveredBefore + normalizedCrossref.length + semantic.length);
  const openAlex = await fetchOpenAlexHorizon(database, space, horizon, now, round, queryPlan);
  await setScanSource(database, jobId, horizon.key, "arXiv", horizon.key === "days" ? 18 : horizon.key === "months" ? 34 : 50, discoveredBefore + normalizedCrossref.length + semantic.length + openAlex.length);
  const arxiv = await fetchArxivHorizon(database, space, horizon, now, round, queryPlan);
  const citationFrontier = horizon.key === "years"
    ? await fetchCitationFrontier(database, space, horizon, now, round, jobId, discoveredBefore + normalizedCrossref.length + semantic.length + openAlex.length + arxiv.length)
    : [];
  const normalized = [...normalizedCrossref, ...semantic, ...openAlex, ...arxiv, ...citationFrontier];
  const unique = new Map<string, Candidate>();
  for (const item of normalized
    .filter((item): item is Omit<Candidate, "qualityScore" | "priorityVenue"> => Boolean(item))
    .map((item) => ({ item, signals: relevanceSignals(`${item.title} ${item.abstractText} ${item.venue}`, space, profileKey) }))
    .map(({ item, signals }) => scoreCandidate({ ...item, relevanceScore: item.relevanceScore + signals.score * 20 }, priorityVenues, now))) {
    const workKey = normalizeWorkTitle(item.title) || item.canonicalId;
    const previous = unique.get(workKey);
    if (!previous) {
      unique.set(workKey, item);
      continue;
    }
    const preferred = item.qualityScore > previous.qualityScore ? item : previous;
    const doiPreferred = item.doi ? item : previous.doi ? previous : preferred;
    unique.set(workKey, {
      ...preferred,
      canonicalId: doiPreferred.canonicalId,
      doi: doiPreferred.doi,
      url: doiPreferred.url || preferred.url,
      abstractText: item.abstractText.length > previous.abstractText.length ? item.abstractText : previous.abstractText,
      citationCount: Math.max(item.citationCount, previous.citationCount),
      relevanceScore: Math.max(item.relevanceScore, previous.relevanceScore),
      source: item.source !== "crossref" && item.abstractText ? item.source : previous.source,
      provenance: Array.from(new Map([...previous.provenance, ...item.provenance].map((entry) => [`${entry.sourceKey}|${entry.queryKey}`, entry])).values()),
    });
  }
  return {
    candidates: Array.from(unique.values()).sort((left, right) => right.qualityScore - left.qualityScore).slice(0, HORIZON_POOL_LIMITS[horizon.key]),
    rawCount: normalized.length,
  };
}

function sourceFocusQuery(space: SpaceRow, round: number, horizon: Horizon, queryPlan?: QueryPlan) {
  const planned = queryPlan?.queries[horizon] || [];
  if (planned.length) return planned[round % planned.length];
  const branches = [
    space.description,
    space.positiveExamples || "",
    ...(space.memoryContext || "").split(";").map(cleanText).filter((item) => item.length >= 4),
  ].filter(Boolean);
  return cleanText(`${space.description} ${rotatedSlice(branches, round, 2).join(" ")}`).slice(0, 260);
}

async function fetchSemanticScholarHorizon(database: D1Database, space: SpaceRow, horizon: typeof HORIZONS[number], now: Date, round: number, queryPlan?: QueryPlan) {
  const profileQuery = sourceFocusQuery(space, round, horizon.key, queryPlan);
  if (profileQuery.length < 4) return [] as Array<Omit<Candidate, "qualityScore" | "priorityVenue">>;
  const plan: DiscoveryQuery = { key: "semantic-topic", sourceKey: "semantic_scholar:topic", query: profileQuery, sort: "relevance", rotating: horizon.key !== "days", channel: "semantic" };
  if (!(await shouldRunDiscoveryQuery(database, space.id, horizon.key, plan))) return [];
  const limit = 40;
  const offset = await discoveryOffset(database, space.id, horizon.key, plan);
  const endpoint = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  endpoint.searchParams.set("query", profileQuery);
  endpoint.searchParams.set("offset", String(offset));
  endpoint.searchParams.set("limit", String(limit));
  endpoint.searchParams.set("publicationDateOrYear", `${isoDate(dateBefore(now, horizon.daysFrom))}:${isoDate(dateBefore(now, horizon.daysUntil))}`);
  endpoint.searchParams.set("fields", "paperId,externalIds,title,abstract,authors,venue,url,publicationDate,year,citationCount");
  const options: RequestInit = {
    headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
    signal: AbortSignal.timeout(20_000),
  };
  try {
    let response = await fetch(endpoint, options);
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      response = await fetch(endpoint, options);
    }
    if (!response.ok) throw new Error(`Semantic Scholar returned ${response.status}`);
    const data = await response.json() as SemanticScholarResponse;
    const queryKey = await discoveryQueryKey(plan);
    const normalized = (await Promise.all((data.data || []).map(async (item) => {
      const candidate = await normalizeSemanticScholarItem(item, horizon.key);
      return candidate ? { ...candidate, provenance: [{ sourceKey: plan.sourceKey, channel: plan.channel, queryKey }] } : null;
    }))).filter((item): item is Omit<Candidate, "qualityScore" | "priorityVenue"> => Boolean(item));
    const nextOffset = await advanceDiscoveryOffset(database, space.id, horizon.key, plan, offset, limit);
    await recordDiscoveryCoverage(database, space.id, horizon.key, plan, nextOffset, normalized);
    return normalized;
  } catch (error) {
    await recordDiscoveryCoverage(database, space.id, horizon.key, plan, offset, [], error instanceof Error ? error.message.slice(0, 180) : "Semantic Scholar request failed");
    // Crossref and journal discovery remain available when this enrichment source is temporarily unavailable.
    return [];
  }
}

async function fetchOpenAlexHorizon(database: D1Database, space: SpaceRow, horizon: typeof HORIZONS[number], now: Date, round: number, queryPlan?: QueryPlan) {
  const profileQuery = sourceFocusQuery(space, round, horizon.key, queryPlan);
  if (profileQuery.length < 4) return [] as Array<Omit<Candidate, "qualityScore" | "priorityVenue">>;
  const plan: DiscoveryQuery = { key: "openalex-topic", sourceKey: "openalex:topic", query: profileQuery, sort: "relevance", rotating: horizon.key !== "days", channel: "semantic" };
  if (!(await shouldRunDiscoveryQuery(database, space.id, horizon.key, plan))) return [];
  const limit = 40;
  const offset = await discoveryOffset(database, space.id, horizon.key, plan);
  const endpoint = new URL("https://api.openalex.org/works");
  endpoint.searchParams.set("search", profileQuery);
  endpoint.searchParams.set("filter", `from_publication_date:${isoDate(dateBefore(now, horizon.daysFrom))},to_publication_date:${isoDate(dateBefore(now, horizon.daysUntil))},is_paratext:false`);
  endpoint.searchParams.set("page", String(Math.floor(offset / limit) + 1));
  endpoint.searchParams.set("per-page", String(limit));
  endpoint.searchParams.set("sort", horizon.key === "days" ? "publication_date:desc" : horizon.key === "years" ? "cited_by_count:desc" : "relevance_score:desc");
  endpoint.searchParams.set("select", "id,doi,title,display_name,relevance_score,publication_date,cited_by_count,authorships,primary_location,abstract_inverted_index");
  endpoint.searchParams.set("mailto", "pi-research@qiudao-pika.chatgpt.site");
  const options: RequestInit = {
    headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
    signal: AbortSignal.timeout(20_000),
  };
  try {
    let response = await fetch(endpoint, options);
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      response = await fetch(endpoint, options);
    }
    if (!response.ok) throw new Error(`OpenAlex returned ${response.status}`);
    const data = await response.json() as OpenAlexResponse;
    const queryKey = await discoveryQueryKey(plan);
    const normalized = (await Promise.all((data.results || []).map(async (item) => {
      const candidate = await normalizeOpenAlexItem(item, horizon.key);
      return candidate ? { ...candidate, provenance: [{ sourceKey: plan.sourceKey, channel: plan.channel, queryKey }] } : null;
    }))).filter((item): item is Omit<Candidate, "qualityScore" | "priorityVenue"> => Boolean(item));
    const nextOffset = await advanceDiscoveryOffset(database, space.id, horizon.key, plan, offset, limit);
    await recordDiscoveryCoverage(database, space.id, horizon.key, plan, nextOffset, normalized);
    return normalized;
  } catch (error) {
    await recordDiscoveryCoverage(database, space.id, horizon.key, plan, offset, [], error instanceof Error ? error.message.slice(0, 180) : "OpenAlex request failed");
    return [];
  }
}

async function fetchArxivHorizon(database: D1Database, space: SpaceRow, horizon: typeof HORIZONS[number], now: Date, round: number, queryPlan?: QueryPlan) {
  const profileQuery = sourceFocusQuery(space, round, horizon.key, queryPlan);
  if (profileQuery.length < 4) return [] as Array<Omit<Candidate, "qualityScore" | "priorityVenue">>;
  const plan: DiscoveryQuery = { key: "arxiv-topic", sourceKey: "arxiv:topic", query: profileQuery, sort: "relevance", rotating: horizon.key !== "days", channel: "preprint" };
  if (!(await shouldRunDiscoveryQuery(database, space.id, horizon.key, plan))) return [];
  const limit = horizon.key === "years" ? 32 : 40;
  const offset = await discoveryOffset(database, space.id, horizon.key, plan);
  const endpoint = new URL("https://export.arxiv.org/api/query");
  endpoint.searchParams.set("search_query", buildArxivSearchQuery(profileQuery, dateBefore(now, horizon.daysFrom), dateBefore(now, horizon.daysUntil)));
  endpoint.searchParams.set("start", String(offset));
  endpoint.searchParams.set("max_results", String(limit));
  endpoint.searchParams.set("sortBy", horizon.key === "days" ? "submittedDate" : "relevance");
  endpoint.searchParams.set("sortOrder", "descending");
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/atom+xml", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`arXiv returned ${response.status}`);
    const records = parseArxivAtom(await response.text());
    const queryKey = await discoveryQueryKey(plan);
    const normalized = (await Promise.all(records.map(async (item) => {
      const candidate = await normalizeArxivItem(item, horizon.key);
      return candidate ? { ...candidate, provenance: [{ sourceKey: plan.sourceKey, channel: plan.channel, queryKey }] } : null;
    }))).filter((item): item is Omit<Candidate, "qualityScore" | "priorityVenue"> => Boolean(item));
    const nextOffset = await advanceDiscoveryOffset(database, space.id, horizon.key, plan, offset, limit);
    await recordDiscoveryCoverage(database, space.id, horizon.key, plan, nextOffset, normalized);
    return normalized;
  } catch (error) {
    await recordDiscoveryCoverage(database, space.id, horizon.key, plan, offset, [], error instanceof Error ? error.message.slice(0, 180) : "arXiv request failed");
    return [];
  }
}

function candidateWithinHorizon(candidate: { publishedAt: string | null }, horizon: typeof HORIZONS[number], now: Date) {
  if (!candidate.publishedAt) return false;
  const published = Date.parse(candidate.publishedAt);
  return published >= dateBefore(now, horizon.daysFrom).getTime() && published <= dateBefore(now, horizon.daysUntil).getTime() + 24 * 60 * 60 * 1000;
}

async function fetchCitationFrontier(
  database: D1Database,
  space: SpaceRow,
  horizon: typeof HORIZONS[number],
  now: Date,
  round: number,
  jobId: string,
  discoveredBefore: number,
) {
  const seeds = await database.prepare(
    `SELECT doi, url, title FROM research_track_papers
     WHERE space_id = ? AND (doi IS NOT NULL OR url LIKE '%arxiv.org/%')
     ORDER BY CASE role WHEN 'milestone' THEN 0 ELSE 1 END, citation_count DESC, created_at ASC LIMIT 24`,
  ).bind(space.id).all<{ doi: string | null; url: string; title: string }>();
  if (!seeds.results.length) return [] as Array<Omit<Candidate, "qualityScore" | "priorityVenue">>;
  const seed = seeds.results[round % seeds.results.length];
  const arxivId = arxivIdFromUrl(seed.url);
  const paperId = seed.doi ? `DOI:${seed.doi}` : arxivId ? `ARXIV:${arxivId}` : "";
  if (!paperId) return [];
  await setScanSource(database, jobId, horizon.key, `Citation frontier · ${cleanText(seed.title).slice(0, 70)}`, 53, discoveredBefore);
  const results: Array<Omit<Candidate, "qualityScore" | "priorityVenue">> = [];
  for (const relation of ["references", "citations"] as const) {
    const plan: DiscoveryQuery = {
      key: `citation-${relation}`,
      sourceKey: `semantic_scholar:${relation}`,
      query: paperId,
      sort: "relevance",
      rotating: true,
      channel: "citation",
    };
    if (!(await shouldRunDiscoveryQuery(database, space.id, horizon.key, plan))) continue;
    const limit = 40;
    const offset = await discoveryOffset(database, space.id, horizon.key, plan);
    const endpoint = new URL(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(paperId)}/${relation}`);
    endpoint.searchParams.set("offset", String(offset));
    endpoint.searchParams.set("limit", String(limit));
    endpoint.searchParams.set("fields", "externalIds,title,abstract,authors,venue,url,publicationDate,year,citationCount");
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Semantic Scholar ${relation} returned ${response.status}`);
      const data = await response.json() as SemanticScholarGraphResponse;
      const papers = (data.data || []).map((entry) => relation === "references" ? entry.citedPaper : entry.citingPaper).filter((item): item is SemanticScholarPaper => Boolean(item));
      const queryKey = await discoveryQueryKey(plan);
      const normalizedCandidates = await Promise.all(papers.map(async (item) => {
        const candidate = await normalizeSemanticScholarItem(item, horizon.key);
        return candidate && candidateWithinHorizon(candidate, horizon, now)
          ? { ...candidate, discoveryChannel: "citation" as const, provenance: [{ sourceKey: plan.sourceKey, channel: plan.channel, queryKey }] }
          : null;
      }));
      const normalized = normalizedCandidates.filter((item): item is NonNullable<typeof item> => item !== null);
      const nextOffset = await advanceDiscoveryOffset(database, space.id, horizon.key, plan, offset, limit);
      await recordDiscoveryCoverage(database, space.id, horizon.key, plan, nextOffset, normalized);
      results.push(...normalized);
    } catch (error) {
      await recordDiscoveryCoverage(database, space.id, horizon.key, plan, offset, [], error instanceof Error ? error.message.slice(0, 180) : `Semantic Scholar ${relation} failed`);
    }
  }
  return results;
}

async function ownedSpace(request: Request, spaceId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 }) };
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id, name, description FROM research_spaces WHERE id = ? AND owner_user_id = ?")
    .bind(spaceId, user.userId).first<SpaceRow>();
  if (!space) return { error: Response.json({ error: "Research space not found" }, { status: 404 }) };
  return { database, space, user };
}

async function ensurePreference(database: D1Database, space: SpaceRow) {
  let row = await database.prepare("SELECT profile_key, priority_venues, tracked_authors, exploration_mode, user_modified FROM monitor_preferences WHERE space_id = ? LIMIT 1")
    .bind(space.id).first<PreferenceRow>();
  if (!row) {
    const profile = inferDomainProfile(space.name, space.description);
    await database.prepare("INSERT OR IGNORE INTO monitor_preferences (id, space_id, profile_key, priority_venues) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), space.id, profile.key, JSON.stringify(profile.venues)).run();
    row = await database.prepare("SELECT profile_key, priority_venues, tracked_authors, exploration_mode, user_modified FROM monitor_preferences WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<PreferenceRow>();
  }
  const profile = getDomainProfile(row?.profile_key || "general_research");
  const explorationMode: ExplorationMode = ["focused", "balanced", "open"].includes(row?.exploration_mode || "")
    ? row!.exploration_mode as ExplorationMode : "balanced";
  await upsertPreferenceSignal(database, {
    spaceId: space.id,
    layer: "explicit",
    kind: "scope",
    labelZh: `${space.name}：${space.description || space.name}`,
    labelEn: `${space.name}: ${space.description || space.name}`,
    evidence: "The user created and described this isolated research space.",
    confidence: 100,
    weight: 100,
    sourceType: "research_space",
    sourceId: space.id,
  });
  return {
    profileKey: profile.key,
    profileNameZh: profile.nameZh,
    profileNameEn: profile.nameEn,
    priorityVenues: parseVenues(row?.priority_venues || "[]"),
    trackedAuthors: parseVenues(row?.tracked_authors || "[]"),
    explorationMode,
    userModified: Boolean(row?.user_modified),
  };
}

async function usageCount(database: D1Database, scope: string, date: string) {
  const row = await database.prepare("SELECT request_count FROM ai_usage_daily WHERE scope = ? AND usage_date = ? LIMIT 1")
    .bind(scope, date).first<{ request_count: number }>();
  return row?.request_count || 0;
}

async function recordUsage(database: D1Database, scope: string, date: string, inputTokens: number, outputTokens: number) {
  await database.prepare(
    `INSERT INTO ai_usage_daily (id, scope, usage_date, request_count, input_tokens, output_tokens)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(scope, usage_date) DO UPDATE SET request_count = request_count + 1,
     input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens,
     updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), scope, date, inputTokens, outputTokens).run();
}

function parseJsonObject(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("DeepSeek Pro returned malformed planning JSON");
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  }
}

function normalizePlannedQueries(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(String(item))).filter((item) => item.length >= 4 && item.length <= 220)))
    .slice(0, limit);
}

async function ensureDailyQueryPlan(
  database: D1Database,
  space: SpaceRow,
  userId: string,
  preference: Awaited<ReturnType<typeof ensurePreference>>,
): Promise<QueryPlan> {
  const planDate = new Date().toISOString().slice(0, 10);
  const existing = await database.prepare(
    "SELECT plan_date, exploration_mode, queries_json, rationale_zh, rationale_en, model, error FROM monitor_query_plans WHERE space_id = ? AND plan_date = ? LIMIT 1",
  ).bind(space.id, planDate).first<{
    plan_date: string; exploration_mode: string; queries_json: string; rationale_zh: string; rationale_en: string; model: string; error: string | null;
  }>();
  if (existing) {
    let parsed: Partial<Record<Horizon, string[]>> = {};
    try { parsed = JSON.parse(existing.queries_json) as Partial<Record<Horizon, string[]>>; } catch { parsed = {}; }
    return {
      planDate: existing.plan_date,
      explorationMode: preference.explorationMode,
      queries: {
        days: normalizePlannedQueries(parsed.days, 3),
        months: normalizePlannedQueries(parsed.months, 3),
        years: normalizePlannedQueries(parsed.years, 3),
      },
      rationaleZh: existing.rationale_zh,
      rationaleEn: existing.rationale_en,
      model: existing.model,
      error: existing.error,
    };
  }

  const queryLimit = preference.explorationMode === "focused" ? 1 : preference.explorationMode === "open" ? 3 : 2;
  const [signals, tracks, recentCoverage] = await Promise.all([
    readPreferenceSignals(database, space.id, 28),
    database.prepare(
      "SELECT title_en, summary_en, search_queries, user_role, depth_score, interaction_score FROM research_tracks WHERE space_id = ? ORDER BY CASE user_role WHEN 'core' THEN 0 WHEN 'support' THEN 1 ELSE 2 END, interaction_score DESC, depth_score DESC LIMIT 10",
    ).bind(space.id).all<{ title_en: string; summary_en: string; search_queries: string; user_role: string; depth_score: number; interaction_score: number }>(),
    database.prepare(
      "SELECT source_key, channel, SUM(attempt_count) AS attempts, SUM(new_candidate_count) AS new_candidates FROM monitor_discovery_coverage WHERE space_id = ? GROUP BY source_key, channel ORDER BY SUM(new_candidate_count) ASC, SUM(attempt_count) DESC LIMIT 12",
    ).bind(space.id).all<{ source_key: string; channel: string; attempts: number; new_candidates: number }>(),
  ]);
  const runtime = getRuntimeEnv();
  let queries: Record<Horizon, string[]> = { days: [], months: [], years: [] };
  let rationaleZh = "";
  let rationaleEn = "";
  let error: string | null = null;
  let model = MONITOR_MODEL;

  if (!runtime.DEEPSEEK_API_KEY) {
    error = "DeepSeek Pro is not configured; deterministic discovery remains active.";
    model = "deterministic-fallback";
  } else {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + runtime.DEEPSEEK_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MONITOR_MODEL,
          messages: [
            { role: "system", content: "You are Pi Research's daily academic discovery strategist. Return strict JSON and design retrieval queries, not paper recommendations." },
            { role: "user", content: [
              `Build today's query plan for ${space.name}: ${space.description}.`,
              `Exploration mode: ${preference.explorationMode}. Return exactly ${queryLimit} concise English bibliographic query strings per horizon.`,
              "The three horizons are simultaneous: days = newest 14 days; months = new and high-quality 6 months; years = durable, foundational, methodologically useful 5 years.",
              "Move beyond yesterday's obvious wording. Cover core depth, one adjacent bridge when mode allows, unresolved questions, under-covered subdirections, methods, and representative venues. Do not include dates, API syntax, Boolean operators, journal names alone, or generic words such as research/study/paper.",
              "Return {\"days\":[...],\"months\":[...],\"years\":[...],\"rationaleZh\":\"...\",\"rationaleEn\":\"...\"}.",
              `Explicit and inferred preference evidence: ${JSON.stringify(signals.map((item) => ({ layer: item.layer, kind: item.kind, label: item.labelEn, evidence: item.evidence, confidence: item.effectiveConfidence })))}`,
              `Existing directions and user depth: ${JSON.stringify(tracks.results.map((track) => ({ title: track.title_en, role: track.user_role, depth: track.depth_score, interaction: track.interaction_score, summary: track.summary_en, queries: parseVenues(track.search_queries).slice(0, 4) })))}`,
              `Priority venues: ${preference.priorityVenues.join("; ")}`,
              `Tracked authors and teams: ${preference.trackedAuthors.join("; ") || "none yet"}`,
              `Low-yield or repeatedly covered channels: ${JSON.stringify(recentCoverage.results)}`,
            ].join("\n") },
          ],
          thinking: { type: "enabled" },
          reasoning_effort: "high",
          response_format: { type: "json_object" },
          max_tokens: 5000,
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const data = await response.json() as DeepSeekResponse;
      if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro query planning failed");
      const parsed = parseJsonObject(data.choices?.[0]?.message?.content || "");
      queries = {
        days: normalizePlannedQueries(parsed.days, queryLimit),
        months: normalizePlannedQueries(parsed.months, queryLimit),
        years: normalizePlannedQueries(parsed.years, queryLimit),
      };
      if (Object.values(queries).some((items) => !items.length)) throw new Error("DeepSeek Pro query plan was incomplete");
      rationaleZh = cleanText(String(parsed.rationaleZh || "")).slice(0, 700);
      rationaleEn = cleanText(String(parsed.rationaleEn || "")).slice(0, 900);
      await Promise.all([
        recordUsage(database, "query-planner:global", planDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
        recordUsage(database, "query-planner-workspace:" + userId.replace(/^anonymous:/, ""), planDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
        recordUsage(database, "monitor-space:" + space.id, planDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      ]);
    } catch (caught) {
      error = caught instanceof Error ? caught.message.slice(0, 280) : "DeepSeek Pro query planning failed";
      model = "deterministic-fallback";
    }
  }
  await database.prepare(
    `INSERT OR IGNORE INTO monitor_query_plans
     (id, space_id, plan_date, exploration_mode, queries_json, rationale_zh, rationale_en, model, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), space.id, planDate, preference.explorationMode, JSON.stringify(queries), rationaleZh, rationaleEn, model, error).run();
  return { planDate, explorationMode: preference.explorationMode, queries, rationaleZh, rationaleEn, model, error };
}

function boundedScore(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;
}

async function enrichSpaceWithImportedMemory(database: D1Database, space: SpaceRow): Promise<SpaceRow> {
  const [rows, tracks, feedbackRows, readingRows] = await Promise.all([
    database.prepare(
      "SELECT analysis_json FROM research_imports WHERE space_id = ? AND status = 'confirmed' ORDER BY confirmed_at DESC LIMIT 6",
    ).bind(space.id).all<{ analysis_json: string }>(),
    database.prepare(
      "SELECT title_en, summary_en, search_queries FROM research_tracks WHERE space_id = ? ORDER BY interaction_score DESC, depth_score DESC, position LIMIT 8",
    ).bind(space.id).all<{ title_en: string; summary_en: string; search_queries: string }>(),
    database.prepare(
      `SELECT p.title, p.venue, f.feedback, f.saved FROM paper_feedback f
       JOIN monitored_papers p ON p.id = f.paper_id AND p.space_id = f.space_id
       WHERE f.space_id = ? AND (f.saved = 1 OR f.feedback IN ('relevant', 'not_relevant'))
       ORDER BY f.updated_at DESC LIMIT 30`,
    ).bind(space.id).all<{ title: string; venue: string; feedback: string | null; saved: number }>(),
    database.prepare(
      `SELECT takeaway_en, methods_en, questions_en, connections_en, topics_en
       FROM paper_reading_memories WHERE space_id = ? AND analysis_status = 'ready'
       ORDER BY updated_at DESC LIMIT 16`,
    ).bind(space.id).all<{ takeaway_en: string; methods_en: string; questions_en: string; connections_en: string; topics_en: string }>(),
  ]);
  const context: string[] = [];
  for (const row of rows.results) {
    try {
      const analysis = JSON.parse(row.analysis_json) as {
        summaryEn?: string;
        searchTerms?: string[];
        interests?: Array<{ labelEn?: string }>;
        openQuestions?: Array<{ labelEn?: string }>;
        researchOpportunities?: Array<{ titleEn?: string }>;
      };
      context.push(
        cleanText(analysis.summaryEn || "").slice(0, 360),
        ...(analysis.searchTerms || []).slice(0, 18),
        ...(analysis.interests || []).slice(0, 8).map((item) => item.labelEn || ""),
        ...(analysis.openQuestions || []).slice(0, 8).map((item) => item.labelEn || ""),
        ...(analysis.researchOpportunities || []).slice(0, 6).map((item) => item.titleEn || ""),
      );
    } catch {
      // Ignore a malformed historical profile without blocking monitoring.
    }
  }
  for (const track of tracks.results) {
    context.push(track.title_en, cleanText(track.summary_en).slice(0, 240), ...parseVenues(track.search_queries).slice(0, 4));
  }
  for (const memory of readingRows.results) {
    context.push(cleanText(memory.takeaway_en).slice(0, 320), ...parseVenues(memory.methods_en).slice(0, 4),
      ...parseVenues(memory.questions_en).slice(0, 4), ...parseVenues(memory.connections_en).slice(0, 4),
      ...parseVenues(memory.topics_en).slice(0, 5));
  }
  const positive = feedbackRows.results
    .filter((row) => row.saved || row.feedback === "relevant")
    .map((row) => cleanText(`${row.title}${row.venue ? ` — ${row.venue}` : ""}`));
  const negative = feedbackRows.results
    .filter((row) => row.feedback === "not_relevant")
    .map((row) => cleanText(`${row.title}${row.venue ? ` — ${row.venue}` : ""}`));
  return {
    ...space,
    memoryContext: Array.from(new Set(context.map((item) => cleanText(item)).filter(Boolean))).join("; ").slice(0, 2600),
    positiveExamples: Array.from(new Set(positive)).slice(0, 12).join("; ").slice(0, 1800),
    negativeExamples: Array.from(new Set(negative)).slice(0, 12).join("; ").slice(0, 1800),
  };
}

function parseReviewPayload(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as { reviews?: Array<Partial<PaperReview>> };
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("DeepSeek Pro returned malformed JSON");
    return JSON.parse(cleaned.slice(start, end + 1)) as { reviews?: Array<Partial<PaperReview>> };
  }
}

async function persistReviewBatch(database: D1Database, spaceId: string, candidates: Candidate[], reviews: PaperReview[]) {
  if (!reviews.length) return;
  const candidateByCanonical = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const placeholders = reviews.map(() => "?").join(", ");
  const paperRows = await database.prepare(
    `SELECT id, canonical_id FROM monitored_papers WHERE space_id = ? AND canonical_id IN (${placeholders})`,
  ).bind(spaceId, ...reviews.map((review) => review.canonicalId)).all<{ id: string; canonical_id: string }>();
  const paperIds = new Map(paperRows.results.map((row) => [row.canonical_id, row.id]));
  const insightStatements = reviews.flatMap((review) => {
    const candidate = candidateByCanonical.get(review.canonicalId);
    const paperId = paperIds.get(review.canonicalId);
    if (!candidate || !paperId) return [];
    return [database.prepare(
      `INSERT INTO paper_insights
       (paper_id, space_id, abstract_text, summary_zh, summary_en, why_read_zh, why_read_en, quality_score,
        priority_venue, analysis_source, analysis_model, llm_recommended, llm_relevance_score, screening_reason,
        recommendation_tier, read_minutes, read_depth, problem_zh, problem_en, method_zh, method_en,
        contribution_zh, contribution_en, limitations_zh, limitations_en, reading_focus_zh, reading_focus_en,
        research_questions_zh, research_questions_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(paper_id) DO UPDATE SET abstract_text = excluded.abstract_text, summary_zh = excluded.summary_zh,
       summary_en = excluded.summary_en, why_read_zh = excluded.why_read_zh, why_read_en = excluded.why_read_en,
       quality_score = excluded.quality_score, priority_venue = excluded.priority_venue,
       analysis_source = excluded.analysis_source, analysis_model = excluded.analysis_model,
       llm_recommended = excluded.llm_recommended, llm_relevance_score = excluded.llm_relevance_score,
       screening_reason = excluded.screening_reason, recommendation_tier = excluded.recommendation_tier,
       read_minutes = excluded.read_minutes, read_depth = excluded.read_depth,
       problem_zh = excluded.problem_zh, problem_en = excluded.problem_en, method_zh = excluded.method_zh,
       method_en = excluded.method_en, contribution_zh = excluded.contribution_zh, contribution_en = excluded.contribution_en,
       limitations_zh = excluded.limitations_zh, limitations_en = excluded.limitations_en,
       reading_focus_zh = excluded.reading_focus_zh, reading_focus_en = excluded.reading_focus_en,
       research_questions_zh = excluded.research_questions_zh, research_questions_en = excluded.research_questions_en,
       updated_at = CURRENT_TIMESTAMP`,
    ).bind(paperId, spaceId, candidate.abstractText, review.summaryZh, review.summaryEn, review.whyReadZh, review.whyReadEn,
      review.qualityScore, candidate.priorityVenue ? 1 : 0, review.recommended ? "deepseek" : "deepseek_rejected",
      MONITOR_MODEL, review.recommended ? 1 : 0, review.relevanceScore, review.screeningReason,
      review.recommendationTier, review.readMinutes, review.readDepth, review.problemZh, review.problemEn,
      review.methodZh, review.methodEn, review.contributionZh, review.contributionEn, review.limitationsZh,
      review.limitationsEn, review.readingFocusZh, review.readingFocusEn, JSON.stringify(review.researchQuestionsZh),
      JSON.stringify(review.researchQuestionsEn))];
  });
  if (insightStatements.length) await database.batch(insightStatements);

  const trackStatements = reviews.flatMap((review) => {
    if (!review.recommended || !review.trackId) return [];
    const candidate = candidateByCanonical.get(review.canonicalId);
    if (!candidate) return [];
    return [database.prepare(
      `INSERT OR IGNORE INTO research_track_papers
       (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role,
        summary_zh, summary_en, rationale_zh, rationale_en, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        (SELECT COALESCE(MAX(position) + 1, 0) FROM research_track_papers WHERE track_id = ?))`,
    ).bind(crypto.randomUUID(), review.trackId, spaceId, candidate.canonicalId, candidate.doi, candidate.title,
      candidate.authors, candidate.venue, candidate.url, candidate.publishedAt, candidate.citationCount, review.mapRole,
      review.summaryZh, review.summaryEn, review.mapRationaleZh, review.mapRationaleEn, review.trackId)];
  });
  if (trackStatements.length) await database.batch(trackStatements);
  const trackIds = Array.from(new Set(reviews.filter((review) => review.recommended && review.trackId).map((review) => review.trackId)));
  if (trackIds.length) {
    const placeholders = trackIds.map(() => "?").join(", ");
    const tracks = await database.prepare(`SELECT id, title_zh, title_en FROM research_tracks WHERE space_id = ? AND id IN (${placeholders})`)
      .bind(spaceId, ...trackIds).all<{ id: string; title_zh: string; title_en: string }>();
    const trackById = new Map(tracks.results.map((track) => [track.id, track]));
    const changeStatements = reviews.flatMap((review) => {
      if (!review.recommended || !review.trackId || !paperIds.has(review.canonicalId)) return [];
      const candidate = candidateByCanonical.get(review.canonicalId);
      const track = trackById.get(review.trackId);
      if (!candidate || !track || !review.mapRationaleZh || !review.mapRationaleEn) return [];
      return [database.prepare(
        `INSERT OR IGNORE INTO research_map_changes
         (id, space_id, track_id, paper_id, kind, title_zh, title_en, summary_zh, summary_en, confidence)
         VALUES (?, ?, ?, ?, 'new_evidence', ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), spaceId, review.trackId, paperIds.get(review.canonicalId),
        `${track.title_zh}新增证据：${candidate.title}`.slice(0, 420),
        `New evidence for ${track.title_en}: ${candidate.title}`.slice(0, 520),
        review.mapRationaleZh, review.mapRationaleEn, review.relevanceScore,
      )];
    });
    if (changeStatements.length) await database.batch(changeStatements);
    await database.batch(trackIds.map((trackId) => database.prepare(
      "UPDATE research_tracks SET intelligence_json = '{}', intelligence_model = '', intelligence_updated_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?",
    ).bind(trackId, spaceId)));
  }
}

async function reviewCandidates(database: D1Database, space: SpaceRow, userId: string, priorityVenues: string[], candidates: Candidate[], jobId: string) {
  if (!candidates.length) return [] as PaperReview[];
  const runtime = getRuntimeEnv();
  if (!runtime.DEEPSEEK_API_KEY) throw new Error("DeepSeek Pro is required before papers can be recommended");
  const usageDate = new Date().toISOString().slice(0, 10);
  const workspaceScope = "monitor-workspace:" + userId.slice("anonymous:".length);
  const expectedCalls = Math.ceil(candidates.length / REVIEW_BATCH_SIZE);
  const [globalCount, workspaceCount] = await Promise.all([
    usageCount(database, "monitor:global", usageDate),
    usageCount(database, workspaceScope, usageDate),
  ]);
  if (globalCount + expectedCalls > MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT || workspaceCount + expectedCalls > MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT) {
    throw new Error("DeepSeek Pro review budget reached; unreviewed papers were not published");
  }
  const mapTracks = await database.prepare(
    "SELECT id, title_zh, title_en, summary_en, search_queries FROM research_tracks WHERE space_id = ? ORDER BY position LIMIT 10",
  ).bind(space.id).all<MapTrackContext>();
  const validTrackIds = new Set(mapTracks.results.map((track) => track.id));
  const completed: PaperReview[] = [];

  for (let start = 0; start < candidates.length; start += REVIEW_BATCH_SIZE) {
    const batch = candidates.slice(start, start + REVIEW_BATCH_SIZE);
    const completedBefore = completed.length;
    const prompt = [
      "Return one JSON object only, with shape {\"reviews\":[...]}. Review every supplied record.",
      "Each review must contain: canonicalId, isPaper, recommended, relevanceScore, qualityScore, recommendationTier, readMinutes, readDepth, summaryZh, summaryEn, whyReadZh, whyReadEn, problemZh/En, methodZh/En, contributionZh/En, limitationsZh/En, readingFocusZh/En, researchQuestionsZh/En, screeningReason, trackId, mapRole, mapRationaleZh, mapRationaleEn.",
      "Act as a strict academic editor, not a search-result summarizer. A real paper can still be irrelevant and must then be rejected.",
      "Set isPaper=false for mastheads, publication information, author instructions, contents, editorials without research content, corrections, calls for papers, or other non-paper records.",
      `Set recommended=true only when relevanceScore >= ${RECOMMENDATION_THRESHOLD}, the work directly advances the research-space scope, and it satisfies its horizon standard. Recency, citations, or a priority venue alone never justify recommendation.`,
      "Horizon standards: days = genuinely relevant new development; months = relevant, new, and high quality; years = highly relevant, durable, useful, and methodologically or strategically instructive.",
      "Use only supplied title, abstract, authors, venue, date, citation, and priority-venue evidence. Never invent a theorem, method, experiment, result, section, or conclusion.",
      "For recommended papers, summaryZh must be a concrete 100-180 Chinese-character introduction explaining the research question, approach, and evidence-backed contribution; summaryEn must convey the same substance in 55-95 words.",
      "For recommended papers, whyReadZh must be a specific 80-150 Chinese-character explanation of how the paper helps this exact research space and which idea, method, comparison, or decision the reader should extract; whyReadEn must convey the same substance in 45-80 words.",
      "For recommended papers, write evidence-disciplined bilingual fields for the research problem, method, main contribution, limitations or uncertainty, and concrete reading focus. If the metadata cannot support a claim, state that the abstract/metadata is insufficient instead of inventing it.",
      "researchQuestionsZh and researchQuestionsEn must each contain 2-4 concise follow-up questions that a researcher could investigate after reading; align the two lists semantically.",
      "Choose recommendationTier=must_read only for a direct, high-consequence match; browse for a useful paper worth focused reading; reserve for a credible paper that should be kept as supporting material. Choose readDepth=deep|focused|overview and estimate readMinutes from 5 to 90.",
      "Do not write generic phrases such as 'it is recent', 'it has a high score', or 'it comes from a priority venue' as the main reason to read.",
      "For rejected records, set all summary, whyRead, problem, method, contribution, limitations, and readingFocus fields to empty strings, set both researchQuestions arrays to [], and give a short screeningReason. Never spend narrative tokens explaining a rejected record.",
      "When research-map directions are supplied, assign a recommended paper to the single best-fitting trackId only when the fit is direct. Otherwise use an empty trackId.",
      "For a track assignment, use mapRole=frontier for current active work or mapRole=milestone for a durable development, and write a concrete bilingual map rationale explaining how it extends that direction. For no assignment, keep both map rationales empty.",
      `Research space: ${space.name} — ${space.description}`,
      `User-confirmed imported research memory: ${space.memoryContext || "No confirmed imported profile yet"}`,
      `Papers the user explicitly valued or saved: ${space.positiveExamples || "No positive paper feedback yet"}`,
      `Papers the user explicitly marked not relevant: ${space.negativeExamples || "No negative paper feedback yet"}`,
      "Treat positive examples as preference evidence, not as permission to recommend loosely related papers. Use negative examples to recognize and reject recurring topic drift.",
      `Priority venues: ${priorityVenues.join("; ")}`,
      `Existing research-map directions: ${JSON.stringify(mapTracks.results.map((track) => ({ id: track.id, titleZh: track.title_zh, titleEn: track.title_en, summaryEn: track.summary_en, searchQueries: parseVenues(track.search_queries) })))}`,
      "JSON records to review:",
      JSON.stringify(batch.map((paper) => ({
        canonicalId: paper.canonicalId,
        title: paper.title,
        authors: paper.authors,
        venue: paper.venue,
        publishedAt: paper.publishedAt,
        horizon: paper.horizon,
        citations: paper.citationCount,
        priorityVenue: paper.priorityVenue,
        discoverySource: paper.source,
        discoveryChannel: paper.discoveryChannel,
        abstract: paper.abstractText.slice(0, 1400),
      }))),
    ].join("\n");

    let parsed: { reviews?: Array<Partial<PaperReview>> } | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt += 1) {
      try {
        const response = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: { Authorization: "Bearer " + runtime.DEEPSEEK_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MONITOR_MODEL,
            messages: [
              { role: "system", content: "You are Pi Research's evidence-disciplined paper screening and briefing editor. Produce strict JSON." },
              { role: "user", content: prompt },
            ],
            thinking: { type: "enabled" },
            reasoning_effort: "high",
            response_format: { type: "json_object" },
            max_tokens: 24000,
            stream: false,
          }),
          signal: AbortSignal.timeout(75_000),
        });
        const data = await response.json() as DeepSeekResponse;
        if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro review failed");
        await Promise.all([
          recordUsage(database, "monitor:global", usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
          recordUsage(database, workspaceScope, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
          recordUsage(database, "monitor-space:" + space.id, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
        ]);
        const content = data.choices?.[0]?.message?.content || "";
        if (!content.trim()) throw new Error("DeepSeek Pro returned an empty review");
        parsed = parseReviewPayload(content);
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    if (!parsed) throw lastError instanceof Error ? lastError : new Error("DeepSeek Pro review failed twice");
    const byId = new Map((parsed.reviews || []).map((item) => [item.canonicalId, item]));
    for (const candidate of batch) {
      const item = byId.get(candidate.canonicalId);
      if (!item) throw new Error("DeepSeek Pro did not review every candidate");
      const relevanceScore = boundedScore(item.relevanceScore);
      const qualityScore = boundedScore(item.qualityScore);
      const summaryZh = cleanText(item.summaryZh || "").slice(0, 900);
      const summaryEn = cleanText(item.summaryEn || "").slice(0, 1200);
      const whyReadZh = cleanText(item.whyReadZh || "").slice(0, 800);
      const whyReadEn = cleanText(item.whyReadEn || "").slice(0, 1000);
      const requestedTier = item.recommendationTier === "must_read" || item.recommendationTier === "reserve" ? item.recommendationTier : "browse";
      const recommendationTier: PaperReview["recommendationTier"] = requestedTier === "must_read" && (relevanceScore < 86 || qualityScore < 80) ? "browse" : requestedTier;
      const readDepth: PaperReview["readDepth"] = item.readDepth === "deep" || item.readDepth === "overview" ? item.readDepth : "focused";
      const readMinutes = Math.max(5, Math.min(90, Math.round(Number(item.readMinutes) || (readDepth === "deep" ? 40 : readDepth === "overview" ? 8 : 18))));
      const researchQuestionsZh = Array.isArray(item.researchQuestionsZh) ? item.researchQuestionsZh.map((question) => cleanText(String(question)).slice(0, 280)).filter(Boolean).slice(0, 4) : [];
      const researchQuestionsEn = Array.isArray(item.researchQuestionsEn) ? item.researchQuestionsEn.map((question) => cleanText(String(question)).slice(0, 360)).filter(Boolean).slice(0, 4) : [];
      const recommended = passesRecommendationGate({
        isPaper: item.isPaper === true,
        requestedRecommendation: item.recommended === true,
        relevanceScore,
        qualityScore,
        summaryZh,
        summaryEn,
        whyReadZh,
        whyReadEn,
      }, RECOMMENDATION_THRESHOLD);
      const trackId = recommended && validTrackIds.has(cleanText(item.trackId || "")) ? cleanText(item.trackId || "") : "";
      const mapRationaleZh = trackId ? cleanText(item.mapRationaleZh || "").slice(0, 700) : "";
      const mapRationaleEn = trackId ? cleanText(item.mapRationaleEn || "").slice(0, 900) : "";
      completed.push({
        canonicalId: candidate.canonicalId,
        isPaper: item.isPaper === true,
        recommended,
        relevanceScore,
        qualityScore,
        summaryZh: recommended ? summaryZh : "",
        summaryEn: recommended ? summaryEn : "",
        whyReadZh: recommended ? whyReadZh : "",
        whyReadEn: recommended ? whyReadEn : "",
        screeningReason: cleanText(item.screeningReason || (recommended ? "Recommended by DeepSeek Pro" : "Rejected by DeepSeek Pro")).slice(0, 500),
        trackId: mapRationaleZh && mapRationaleEn ? trackId : "",
        mapRole: item.mapRole === "milestone" ? "milestone" : "frontier",
        mapRationaleZh,
        mapRationaleEn,
        recommendationTier,
        readMinutes,
        readDepth,
        problemZh: cleanText(item.problemZh || "").slice(0, 800),
        problemEn: cleanText(item.problemEn || "").slice(0, 1050),
        methodZh: cleanText(item.methodZh || "").slice(0, 800),
        methodEn: cleanText(item.methodEn || "").slice(0, 1050),
        contributionZh: cleanText(item.contributionZh || "").slice(0, 850),
        contributionEn: cleanText(item.contributionEn || "").slice(0, 1100),
        limitationsZh: cleanText(item.limitationsZh || "").slice(0, 750),
        limitationsEn: cleanText(item.limitationsEn || "").slice(0, 1000),
        readingFocusZh: cleanText(item.readingFocusZh || "").slice(0, 750),
        readingFocusEn: cleanText(item.readingFocusEn || "").slice(0, 1000),
        researchQuestionsZh,
        researchQuestionsEn,
      });
    }
    await persistReviewBatch(database, space.id, batch, completed.slice(completedBefore));
    await database.prepare(
      "UPDATE monitor_scan_jobs SET reviewed_count = ?, recommended_count = ?, progress = MIN(87, 58 + CAST((? * 29.0) / MAX(1, ?) AS INTEGER)), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(completed.length, completed.filter((review) => review.recommended).length, completed.length, candidates.length, jobId).run();
  }
  return completed;
}

async function persistCandidatePool(database: D1Database, spaceId: string, candidates: Candidate[]) {
  const candidateByCanonical = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const paperIds = new Map<string, string>();
  for (let start = 0; start < candidates.length; start += 70) {
    const chunk = candidates.slice(start, start + 70);
    await database.batch(chunk.map((candidate) => database.prepare(
      `INSERT INTO monitored_papers
       (id, space_id, canonical_id, doi, title, authors, venue, url, published_at, source, horizon, citation_count, relevance_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(space_id, canonical_id) DO UPDATE SET title = excluded.title, authors = excluded.authors,
       venue = excluded.venue, url = excluded.url, published_at = excluded.published_at, source = excluded.source,
       horizon = excluded.horizon, last_seen_at = CURRENT_TIMESTAMP,
       citation_count = MAX(monitored_papers.citation_count, excluded.citation_count),
       relevance_score = MAX(monitored_papers.relevance_score, excluded.relevance_score)`,
    ).bind(crypto.randomUUID(), spaceId, candidate.canonicalId, candidate.doi, candidate.title, candidate.authors, candidate.venue,
      candidate.url, candidate.publishedAt, candidate.source, candidate.horizon, candidate.citationCount, candidate.relevanceScore)));
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await database.prepare(`SELECT id, canonical_id FROM monitored_papers WHERE space_id = ? AND canonical_id IN (${placeholders})`)
      .bind(spaceId, ...chunk.map((candidate) => candidate.canonicalId)).all<{ id: string; canonical_id: string }>();
    for (const row of rows.results) paperIds.set(row.canonical_id, row.id);
  }
  const metadataStatements = Array.from(paperIds.entries()).map(([canonicalId, paperId]) => {
    const candidate = candidateByCanonical.get(canonicalId)!;
    return database.prepare(
      `INSERT INTO paper_insights (paper_id, space_id, abstract_text, quality_score, priority_venue, analysis_source)
       VALUES (?, ?, ?, ?, ?, 'metadata')
       ON CONFLICT(paper_id) DO UPDATE SET
       abstract_text = CASE WHEN LENGTH(excluded.abstract_text) > LENGTH(paper_insights.abstract_text) THEN excluded.abstract_text ELSE paper_insights.abstract_text END,
       quality_score = MAX(paper_insights.quality_score, excluded.quality_score),
       priority_venue = MAX(paper_insights.priority_venue, excluded.priority_venue), updated_at = CURRENT_TIMESTAMP
       WHERE paper_insights.analysis_source = 'metadata'`,
    ).bind(paperId, spaceId, candidate.abstractText, candidate.qualityScore, candidate.priorityVenue ? 1 : 0);
  });
  for (let start = 0; start < metadataStatements.length; start += 70) {
    await database.batch(metadataStatements.slice(start, start + 70));
  }
  const provenanceStatements = Array.from(paperIds.entries()).flatMap(([canonicalId, paperId]) => {
    const candidate = candidateByCanonical.get(canonicalId)!;
    return candidate.provenance.map((entry) => database.prepare(
      `INSERT INTO monitor_candidate_sources (id, space_id, paper_id, source_key, channel, query_key)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(paper_id, source_key, query_key) DO UPDATE SET
         appearances = monitor_candidate_sources.appearances + 1, last_seen_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), spaceId, paperId, entry.sourceKey, entry.channel, entry.queryKey));
  });
  for (let start = 0; start < provenanceStatements.length; start += 70) {
    await database.batch(provenanceStatements.slice(start, start + 70));
  }
}

async function pendingCandidateQueue(database: D1Database, spaceId: string) {
  const rows = await database.prepare(
    `SELECT p.canonical_id, p.doi, p.title, p.authors, p.venue, p.url, p.published_at, p.source, p.horizon,
     p.citation_count, p.relevance_score, i.abstract_text, i.quality_score, i.priority_venue
     FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id
     WHERE p.space_id = ? AND (i.analysis_model = '' OR
       (i.analysis_source = 'deepseek_rejected' AND datetime(i.updated_at) < datetime('now', '-90 days')))
     ORDER BY i.quality_score DESC, p.citation_count DESC, p.discovered_at DESC LIMIT 360`,
  ).bind(spaceId).all<{
    canonical_id: string; doi: string | null; title: string; authors: string; venue: string; url: string;
    published_at: string | null; source: string; horizon: Horizon; citation_count: number; relevance_score: number;
    abstract_text: string; quality_score: number; priority_venue: number;
  }>();
  return rows.results.map((row) => ({
    canonicalId: row.canonical_id,
    doi: row.doi,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    url: row.url,
    publishedAt: row.published_at,
    abstractText: row.abstract_text,
    horizon: row.horizon,
    citationCount: row.citation_count,
    relevanceScore: row.relevance_score,
    qualityScore: row.quality_score,
    priorityVenue: Boolean(row.priority_venue),
    source: row.source === "semantic_scholar" ? "semantic_scholar" as const : row.source === "openalex" ? "openalex" as const : row.source === "arxiv" ? "arxiv" as const : "crossref" as const,
    discoveryChannel: row.source === "arxiv" ? "preprint" as const : row.source === "semantic_scholar" || row.source === "openalex" ? "semantic" as const : row.priority_venue ? "journal" as const : "topic" as const,
    provenance: [{
      sourceKey: `${row.source}:stored`,
      channel: row.source === "arxiv" ? "preprint" as const : row.source === "semantic_scholar" || row.source === "openalex" ? "semantic" as const : row.priority_venue ? "journal" as const : "topic" as const,
      queryKey: "stored-candidate",
    }],
  }));
}

function selectUnseenReviewBatch(candidates: Candidate[]) {
  const selected: Candidate[] = [];
  for (const horizon of ["days", "months", "years"] as Horizon[]) {
    selected.push(...candidates.filter((candidate) => candidate.horizon === horizon).slice(0, HORIZON_REVIEW_LIMITS[horizon]));
  }
  return selected;
}

async function updateRunPhase(database: D1Database, spaceId: string, jobId: string, status: string, scannedCount: number, newCount = 0) {
  const progress = status === "deduplicating" ? 54 : status === "reviewing" ? 58 : status === "saving" ? 90 : 4;
  await database.batch([
    database.prepare(
      "UPDATE monitor_runs SET status = ?, scanned_count = ?, new_count = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?",
    ).bind(status, scannedCount, newCount, spaceId),
    database.prepare(
      "UPDATE monitor_scan_jobs SET status = ?, progress = MAX(progress, ?), discovered_count = ?, recommended_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(status, progress, scannedCount, newCount, jobId),
  ]);
}

function paperUserState(paper: PaperRow, now: number) {
  if (paper.feedback === "not_relevant") return "dismissed" as const;
  if (paper.saved || paper.feedback === "relevant") return "accepted" as const;
  if (paper.snoozed_until && Date.parse(paper.snoozed_until) > now) return "snoozed" as const;
  if (paper.opened_at || paper.show_count > 0) return "seen" as const;
  return "unseen" as const;
}

function databaseTime(value: string) {
  return Date.parse(value.includes("T") ? value : value.replace(" ", "T") + "Z");
}

function isPaperDue(paper: PaperRow, now: number) {
  const state = paperUserState(paper, now);
  if (state === "accepted" || state === "dismissed" || state === "snoozed") return false;
  if (!paper.last_shown_at || paper.show_count <= 0) return true;
  const reminderDays = paper.show_count === 1 ? 1 : paper.show_count === 2 ? 3 : 14;
  return now - databaseTime(paper.last_shown_at) >= reminderDays * 24 * 60 * 60 * 1000;
}

function toPaper(paper: PaperRow, now: number) {
  return {
    id: paper.id,
    doi: paper.doi,
    title: paper.title,
    authors: paper.authors,
    venue: paper.venue,
    url: paper.url,
    publishedAt: paper.published_at,
    horizon: paper.horizon,
    citationCount: paper.citation_count,
    relevanceScore: paper.llm_relevance_score,
    discoveredAt: paper.discovered_at,
    summaryZh: paper.summary_zh,
    summaryEn: paper.summary_en,
    whyReadZh: paper.why_read_zh,
    whyReadEn: paper.why_read_en,
    qualityScore: paper.quality_score,
    priorityVenue: Boolean(paper.priority_venue),
    analysisSource: paper.analysis_source,
    userState: paperUserState(paper, now),
    showCount: paper.show_count,
    saved: Boolean(paper.saved),
    feedback: paper.feedback,
    firstShownAt: paper.first_shown_at,
    lastShownAt: paper.last_shown_at,
    openedAt: paper.opened_at,
    snoozedUntil: paper.snoozed_until,
    readingStatus: paper.reading_status,
    readingNote: paper.reading_note,
    recommendationTier: paper.recommendation_tier,
    readMinutes: paper.read_minutes,
    readDepth: paper.read_depth,
    problemZh: paper.problem_zh,
    problemEn: paper.problem_en,
    methodZh: paper.method_zh,
    methodEn: paper.method_en,
    contributionZh: paper.contribution_zh,
    contributionEn: paper.contribution_en,
    limitationsZh: paper.limitations_zh,
    limitationsEn: paper.limitations_en,
    readingFocusZh: paper.reading_focus_zh,
    readingFocusEn: paper.reading_focus_en,
    researchQuestionsZh: parseVenues(paper.research_questions_zh),
    researchQuestionsEn: parseVenues(paper.research_questions_en),
  };
}

async function readState(database: D1Database, space: SpaceRow, extra: Record<string, unknown> = {}) {
  const preference = await ensurePreference(database, space);
  const [run, papers, known, job, coverage, queryPlanRow, preferenceSignals, mapChanges, usageMetrics, scanMetrics, feedbackMetrics, sourcePerformance, trackPerformance, acceptedAuthorRows, readingCounts, dailyScanRows, dailyUsageRows, horizonRows, ledgerRows, readingMemoryRows, feedbackReasonRows, tierRows] = await Promise.all([
    database.prepare("SELECT status, last_run_at, next_run_at, new_count, scanned_count, discovery_round, error FROM monitor_runs WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<RunRow>(),
    database.prepare(
      `SELECT p.id, p.canonical_id, p.doi, p.title, p.authors, p.venue, p.url, p.published_at, p.horizon,
       p.citation_count, p.relevance_score, p.discovered_at, COALESCE(i.abstract_text, '') AS abstract_text,
       COALESCE(i.summary_zh, '') AS summary_zh, COALESCE(i.summary_en, '') AS summary_en,
       COALESCE(i.why_read_zh, '') AS why_read_zh, COALESCE(i.why_read_en, '') AS why_read_en,
       COALESCE(i.quality_score, 0) AS quality_score, COALESCE(i.priority_venue, 0) AS priority_venue,
       COALESCE(i.analysis_source, 'metadata') AS analysis_source, COALESCE(i.analysis_model, '') AS analysis_model,
       COALESCE(i.llm_recommended, 0) AS llm_recommended, COALESCE(i.llm_relevance_score, 0) AS llm_relevance_score,
       COALESCE(i.recommendation_tier, 'browse') AS recommendation_tier, COALESCE(i.read_minutes, 12) AS read_minutes,
       COALESCE(i.read_depth, 'focused') AS read_depth, COALESCE(i.problem_zh, '') AS problem_zh,
       COALESCE(i.problem_en, '') AS problem_en, COALESCE(i.method_zh, '') AS method_zh,
       COALESCE(i.method_en, '') AS method_en, COALESCE(i.contribution_zh, '') AS contribution_zh,
       COALESCE(i.contribution_en, '') AS contribution_en, COALESCE(i.limitations_zh, '') AS limitations_zh,
       COALESCE(i.limitations_en, '') AS limitations_en, COALESCE(i.reading_focus_zh, '') AS reading_focus_zh,
       COALESCE(i.reading_focus_en, '') AS reading_focus_en, COALESCE(i.research_questions_zh, '[]') AS research_questions_zh,
       COALESCE(i.research_questions_en, '[]') AS research_questions_en,
       COALESCE(d.show_count, 0) AS show_count, d.first_shown_at, d.last_shown_at, d.opened_at, d.snoozed_until,
       COALESCE(f.saved, 0) AS saved, f.feedback, COALESCE(r.status, 'unread') AS reading_status,
       COALESCE(r.note, '') AS reading_note
       FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id
       LEFT JOIN paper_delivery_state d ON d.paper_id = p.id AND d.space_id = p.space_id
       LEFT JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
       LEFT JOIN paper_reading_progress r ON r.paper_id = p.id AND r.space_id = p.space_id
        WHERE p.space_id = ? AND i.llm_recommended = 1 AND i.analysis_source = 'deepseek'
        ORDER BY p.discovered_at DESC, i.quality_score DESC LIMIT 300`,
    ).bind(space.id).all<PaperRow>(),
    database.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE space_id = ?").bind(space.id).first<{ count: number }>(),
    database.prepare(
      `SELECT id, status, current_horizon, current_source, progress, discovered_count, new_candidate_count,
       duplicate_count, reviewed_count, recommended_count, rejected_count, started_at, completed_at, error
       FROM monitor_scan_jobs WHERE space_id = ? ORDER BY started_at DESC LIMIT 1`,
    ).bind(space.id).first<ScanJobRow>(),
    database.prepare(
      `SELECT source_key, channel, SUM(attempt_count) AS attempt_count,
       SUM(CASE WHEN total_candidate_count = 0 THEN candidate_count ELSE total_candidate_count END) AS candidate_count,
       SUM(new_candidate_count) AS new_candidate_count, MAX(last_scanned_at) AS last_scanned_at,
       MAX(last_error) AS last_error
       FROM monitor_discovery_coverage WHERE space_id = ? GROUP BY source_key, channel
       ORDER BY MAX(last_scanned_at) DESC LIMIT 12`,
    ).bind(space.id).all<CoverageRow>(),
    database.prepare(
      "SELECT plan_date, exploration_mode, queries_json, rationale_zh, rationale_en, model, error FROM monitor_query_plans WHERE space_id = ? ORDER BY plan_date DESC LIMIT 1",
    ).bind(space.id).first<{ plan_date: string; exploration_mode: string; queries_json: string; rationale_zh: string; rationale_en: string; model: string; error: string | null }>(),
    readPreferenceSignals(database, space.id, 32),
    database.prepare(
      `SELECT c.id, c.kind, c.title_zh, c.title_en, c.summary_zh, c.summary_en, c.confidence, c.created_at,
       t.title_zh AS track_title_zh, t.title_en AS track_title_en, p.id AS paper_id, p.title AS paper_title
       FROM research_map_changes c
       JOIN research_tracks t ON t.id = c.track_id AND t.space_id = c.space_id
       JOIN monitored_papers p ON p.id = c.paper_id AND p.space_id = c.space_id
       WHERE c.space_id = ? AND c.created_at >= datetime('now', '-7 days')
       ORDER BY c.created_at DESC LIMIT 12`,
    ).bind(space.id).all<{
      id: string; kind: string; title_zh: string; title_en: string; summary_zh: string; summary_en: string;
      confidence: number; created_at: string; track_title_zh: string; track_title_en: string; paper_id: string; paper_title: string;
    }>(),
    database.prepare(
      `SELECT COALESCE(SUM(request_count), 0) AS requests, COALESCE(SUM(input_tokens), 0) AS input_tokens,
       COALESCE(SUM(output_tokens), 0) AS output_tokens FROM ai_usage_daily
       WHERE scope = ? AND usage_date >= date('now', '-6 days')`,
    ).bind("monitor-space:" + space.id).first<{ requests: number; input_tokens: number; output_tokens: number }>(),
    database.prepare(
      `SELECT COUNT(*) AS scans, COALESCE(SUM(discovered_count), 0) AS candidates,
       COALESCE(SUM(reviewed_count), 0) AS reviewed, COALESCE(SUM(recommended_count), 0) AS recommended
       FROM monitor_scan_jobs WHERE space_id = ? AND status = 'ready' AND completed_at >= datetime('now', '-7 days')`,
    ).bind(space.id).first<{ scans: number; candidates: number; reviewed: number; recommended: number }>(),
    database.prepare(
      `SELECT COUNT(*) AS decisions,
       SUM(CASE WHEN saved = 1 OR feedback = 'relevant' THEN 1 ELSE 0 END) AS accepted,
       SUM(CASE WHEN feedback = 'not_relevant' THEN 1 ELSE 0 END) AS dismissed
       FROM paper_feedback WHERE space_id = ? AND (saved = 1 OR feedback IS NOT NULL)`,
    ).bind(space.id).first<{ decisions: number; accepted: number; dismissed: number }>(),
    database.prepare(
      `SELECT cs.source_key, cs.channel, COUNT(DISTINCT cs.paper_id) AS papers,
       SUM(CASE WHEN f.saved = 1 OR f.feedback = 'relevant' THEN 1 ELSE 0 END) AS accepted,
       SUM(CASE WHEN f.feedback = 'not_relevant' THEN 1 ELSE 0 END) AS dismissed
       FROM monitor_candidate_sources cs
       LEFT JOIN paper_feedback f ON f.paper_id = cs.paper_id AND f.space_id = cs.space_id
       WHERE cs.space_id = ? GROUP BY cs.source_key, cs.channel
       ORDER BY accepted DESC, papers DESC LIMIT 12`,
    ).bind(space.id).all<{ source_key: string; channel: string; papers: number; accepted: number; dismissed: number }>(),
    database.prepare(
      `SELECT t.id, t.title_zh, t.title_en, COUNT(DISTINCT mp.id) AS papers,
       SUM(CASE WHEN f.saved = 1 OR f.feedback = 'relevant' THEN 1 ELSE 0 END) AS accepted
       FROM research_tracks t
       LEFT JOIN research_track_papers tp ON tp.track_id = t.id AND tp.space_id = t.space_id
       LEFT JOIN monitored_papers mp ON mp.space_id = t.space_id AND mp.canonical_id = tp.canonical_id
       LEFT JOIN paper_feedback f ON f.paper_id = mp.id AND f.space_id = mp.space_id
       WHERE t.space_id = ? GROUP BY t.id, t.title_zh, t.title_en
       ORDER BY accepted DESC, papers DESC LIMIT 10`,
    ).bind(space.id).all<{ id: string; title_zh: string; title_en: string; papers: number; accepted: number }>(),
    database.prepare(
      `SELECT p.authors FROM monitored_papers p JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
       WHERE p.space_id = ? AND (f.saved = 1 OR f.feedback = 'relevant') ORDER BY f.updated_at DESC LIMIT 30`,
    ).bind(space.id).all<{ authors: string }>(),
    database.prepare(
      "SELECT status, COUNT(*) AS count FROM paper_reading_progress WHERE space_id = ? GROUP BY status",
    ).bind(space.id).all<{ status: string; count: number }>(),
    database.prepare(
      `SELECT date(started_at) AS day, COUNT(*) AS scans, SUM(discovered_count) AS candidates,
       SUM(new_candidate_count) AS new_candidates, SUM(duplicate_count) AS duplicates,
       SUM(reviewed_count) AS reviewed, SUM(recommended_count) AS recommended, SUM(rejected_count) AS rejected
       FROM monitor_scan_jobs WHERE space_id = ? AND status = 'ready' AND started_at >= datetime('now', '-13 days')
       GROUP BY date(started_at) ORDER BY day`,
    ).bind(space.id).all<{ day: string; scans: number; candidates: number; new_candidates: number; duplicates: number; reviewed: number; recommended: number; rejected: number }>(),
    database.prepare(
      `SELECT usage_date, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
       FROM ai_usage_daily WHERE scope = ? AND usage_date >= date('now', '-13 days') GROUP BY usage_date ORDER BY usage_date`,
    ).bind("monitor-space:" + space.id).all<{ usage_date: string; input_tokens: number; output_tokens: number }>(),
    database.prepare(
      `SELECT horizon, COUNT(*) AS branches, SUM(attempt_count) AS attempts,
       SUM(CASE WHEN total_candidate_count = 0 THEN candidate_count ELSE total_candidate_count END) AS candidates,
       SUM(new_candidate_count) AS new_candidates,
       SUM(CASE WHEN branch_status = 'cooling' THEN 1 ELSE 0 END) AS cooling
       FROM monitor_discovery_coverage WHERE space_id = ? GROUP BY horizon`,
    ).bind(space.id).all<{ horizon: Horizon; branches: number; attempts: number; candidates: number; new_candidates: number; cooling: number }>(),
    database.prepare(
      `SELECT horizon, source_key, channel, query_key, query_text, next_cursor, attempt_count,
       CASE WHEN total_candidate_count = 0 THEN candidate_count ELSE total_candidate_count END AS total_candidate_count,
       new_candidate_count, zero_yield_streak, branch_status, cooldown_until, first_scanned_at, last_scanned_at, last_error
       FROM monitor_discovery_coverage WHERE space_id = ?
       ORDER BY CASE branch_status WHEN 'exploring' THEN 0 WHEN 'revisit' THEN 1 WHEN 'cooling' THEN 2 ELSE 3 END,
       last_scanned_at DESC LIMIT 30`,
    ).bind(space.id).all<{ horizon: Horizon; source_key: string; channel: string; query_key: string; query_text: string; next_cursor: number; attempt_count: number; total_candidate_count: number; new_candidate_count: number; zero_yield_streak: number; branch_status: string; cooldown_until: string | null; first_scanned_at: string | null; last_scanned_at: string | null; last_error: string | null }>(),
    database.prepare(
      `SELECT m.paper_id, m.analysis_status, m.takeaway_zh, m.takeaway_en, m.methods_zh, m.methods_en,
       m.questions_zh, m.questions_en, m.connections_zh, m.connections_en, m.topics_zh, m.topics_en,
       m.track_id, m.model, m.error, m.analyzed_at, m.updated_at, p.title, p.authors, p.venue,
       COALESCE(r.status, 'unread') AS reading_status, COALESCE(r.note, '') AS note
       FROM paper_reading_memories m JOIN monitored_papers p ON p.id = m.paper_id AND p.space_id = m.space_id
       LEFT JOIN paper_reading_progress r ON r.paper_id = m.paper_id AND r.space_id = m.space_id
       WHERE m.space_id = ? ORDER BY m.updated_at DESC LIMIT 24`,
    ).bind(space.id).all<{ paper_id: string; analysis_status: string; takeaway_zh: string; takeaway_en: string; methods_zh: string; methods_en: string; questions_zh: string; questions_en: string; connections_zh: string; connections_en: string; topics_zh: string; topics_en: string; track_id: string | null; model: string; error: string | null; analyzed_at: string | null; updated_at: string; title: string; authors: string; venue: string; reading_status: string; note: string }>(),
    database.prepare(
      `SELECT COALESCE(reason_code, 'unspecified') AS reason_code, feedback, COUNT(*) AS count
       FROM paper_feedback WHERE space_id = ? AND feedback IN ('relevant','not_relevant')
       GROUP BY reason_code, feedback ORDER BY count DESC LIMIT 12`,
    ).bind(space.id).all<{ reason_code: string; feedback: string; count: number }>(),
    database.prepare(
      `SELECT recommendation_tier, COUNT(*) AS count FROM paper_insights
       WHERE space_id = ? AND llm_recommended = 1 AND analysis_model = ? GROUP BY recommendation_tier`,
    ).bind(space.id, MONITOR_MODEL).all<{ recommendation_tier: string; count: number }>(),
  ]);
  const now = Date.now();
  const duePapers = papers.results
    .filter((paper) => paper.analysis_model === MONITOR_MODEL && isPaperDue(paper, now))
    .sort((left, right) => left.show_count - right.show_count || right.quality_score - left.quality_score || databaseTime(right.discovered_at) - databaseTime(left.discovered_at));
  const selected: PaperRow[] = [];
  for (const horizon of ["days", "months", "years"] as Horizon[]) {
    selected.push(...duePapers.filter((paper) => paper.horizon === horizon).slice(0, 2));
  }
  const historyPapers = papers.results
    .filter((paper) => paper.analysis_model === MONITOR_MODEL || Boolean(paper.saved || paper.feedback) || paper.reading_status !== "unread")
    .map((paper) => toPaper(paper, now));
  const pendingPapers = historyPapers.filter((paper) => paper.userState !== "accepted" && paper.userState !== "dismissed");
  let latestQueries: Partial<Record<Horizon, string[]>> = {};
  try { latestQueries = queryPlanRow ? JSON.parse(queryPlanRow.queries_json) as Partial<Record<Horizon, string[]>> : {}; } catch { latestQueries = {}; }
  const reviewed = scanMetrics?.reviewed || 0;
  const recommended = scanMetrics?.recommended || 0;
  const decisions = feedbackMetrics?.decisions || 0;
  const accepted = feedbackMetrics?.accepted || 0;
  const suggestedAuthors = Array.from(new Set(acceptedAuthorRows.results.flatMap((row) => row.authors.split(",").map((author) => cleanText(author)).filter((author) => author.length >= 4))))
    .filter((author) => !preference.trackedAuthors.some((tracked) => tracked.toLocaleLowerCase() === author.toLocaleLowerCase())).slice(0, 8);
  const dailyUsage = new Map(dailyUsageRows.results.map((row) => [row.usage_date, (row.input_tokens || 0) + (row.output_tokens || 0)]));
  const operationsDays = dailyScanRows.results.map((row) => ({
    date: row.day,
    scans: row.scans || 0,
    candidates: row.candidates || 0,
    newCandidates: row.new_candidates || 0,
    duplicatesAvoided: row.duplicates || 0,
    reviewed: row.reviewed || 0,
    recommended: row.recommended || 0,
    rejected: row.rejected || 0,
    tokens: dailyUsage.get(row.day) || 0,
  }));
  const operationsTotals = operationsDays.reduce((totals, day) => ({
    scans: totals.scans + day.scans,
    candidates: totals.candidates + day.candidates,
    newCandidates: totals.newCandidates + day.newCandidates,
    duplicatesAvoided: totals.duplicatesAvoided + day.duplicatesAvoided,
    reviewed: totals.reviewed + day.reviewed,
    recommended: totals.recommended + day.recommended,
    rejected: totals.rejected + day.rejected,
    tokens: totals.tokens + day.tokens,
  }), { scans: 0, candidates: 0, newCandidates: 0, duplicatesAvoided: 0, reviewed: 0, recommended: 0, rejected: 0, tokens: 0 });
  const readingMemories = readingMemoryRows.results.map((row) => ({
    paperId: row.paper_id,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    readingStatus: row.reading_status,
    noteExcerpt: cleanText(row.note).slice(0, 260),
    analysisStatus: row.analysis_status,
    takeawayZh: row.takeaway_zh,
    takeawayEn: row.takeaway_en,
    methodsZh: parseVenues(row.methods_zh),
    methodsEn: parseVenues(row.methods_en),
    questionsZh: parseVenues(row.questions_zh),
    questionsEn: parseVenues(row.questions_en),
    connectionsZh: parseVenues(row.connections_zh),
    connectionsEn: parseVenues(row.connections_en),
    topicsZh: parseVenues(row.topics_zh),
    topicsEn: parseVenues(row.topics_en),
    trackId: row.track_id,
    model: row.model,
    error: row.error,
    analyzedAt: row.analyzed_at,
    updatedAt: row.updated_at,
  }));
  return {
    monitor: {
      status: run?.status || "idle",
      lastRunAt: run?.last_run_at || null,
      nextRunAt: run?.next_run_at || null,
      newCount: run?.new_count || 0,
      scannedCount: run?.scanned_count || 0,
      explorationRound: run?.discovery_round || 0,
      knownCount: known?.count || 0,
      error: run?.error || null,
      cadenceHours: 24,
      source: "Crossref · priority journals · arXiv · OpenAlex · Semantic Scholar · citation frontier",
      horizons: ["days", "months", "years"],
      scanJob: job ? {
        id: job.id,
        status: job.status,
        currentHorizon: job.current_horizon,
        currentSource: job.current_source,
        progress: job.progress,
        discoveredCount: job.discovered_count,
        newCandidateCount: job.new_candidate_count,
        duplicateCount: job.duplicate_count,
        reviewedCount: job.reviewed_count,
        recommendedCount: job.recommended_count,
        rejectedCount: job.rejected_count,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        error: job.error,
      } : null,
      coverage: coverage.results.map((row) => ({
        sourceKey: row.source_key,
        channel: row.channel,
        attempts: row.attempt_count,
        candidates: row.candidate_count,
        newCandidates: row.new_candidate_count,
        lastScannedAt: row.last_scanned_at,
        healthy: !row.last_error,
      })),
      preferences: preference,
      queryPlan: queryPlanRow ? {
        planDate: queryPlanRow.plan_date,
        explorationMode: queryPlanRow.exploration_mode,
        queryCount: Object.values(latestQueries).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0),
        rationaleZh: queryPlanRow.rationale_zh,
        rationaleEn: queryPlanRow.rationale_en,
        model: queryPlanRow.model,
        degraded: Boolean(queryPlanRow.error),
      } : null,
      preferenceSignals,
      mapChanges: mapChanges.results.map((change) => ({
        id: change.id,
        kind: change.kind,
        titleZh: change.title_zh,
        titleEn: change.title_en,
        summaryZh: change.summary_zh,
        summaryEn: change.summary_en,
        confidence: change.confidence,
        createdAt: change.created_at,
        trackTitleZh: change.track_title_zh,
        trackTitleEn: change.track_title_en,
        paperId: change.paper_id,
        paperTitle: change.paper_title,
      })),
      qualityMetrics: {
        windowDays: 7,
        scans: scanMetrics?.scans || 0,
        candidates: scanMetrics?.candidates || 0,
        reviewed,
        recommended,
        recommendationYield: reviewed ? Math.round(recommended / reviewed * 100) : 0,
        decisions,
        accepted,
        dismissed: feedbackMetrics?.dismissed || 0,
        acceptanceRate: decisions ? Math.round(accepted / decisions * 100) : 0,
        requests: usageMetrics?.requests || 0,
        inputTokens: usageMetrics?.input_tokens || 0,
        outputTokens: usageMetrics?.output_tokens || 0,
      },
      discoveryPerformance: {
        sources: sourcePerformance.results.map((row) => ({
          sourceKey: row.source_key,
          channel: row.channel,
          papers: row.papers,
          accepted: row.accepted || 0,
          dismissed: row.dismissed || 0,
          acceptanceRate: row.papers ? Math.round((row.accepted || 0) / row.papers * 100) : 0,
        })),
        tracks: trackPerformance.results.map((row) => ({
          trackId: row.id,
          titleZh: row.title_zh,
          titleEn: row.title_en,
          papers: row.papers,
          accepted: row.accepted || 0,
          acceptanceRate: row.papers ? Math.round((row.accepted || 0) / row.papers * 100) : 0,
        })),
      },
      operationsDashboard: {
        periodDays: 14,
        totals: {
          ...operationsTotals,
          recommendationYield: operationsTotals.reviewed ? Math.round(operationsTotals.recommended / operationsTotals.reviewed * 100) : 0,
          duplicateAvoidanceRate: operationsTotals.newCandidates + operationsTotals.duplicatesAvoided
            ? Math.round(operationsTotals.duplicatesAvoided / (operationsTotals.newCandidates + operationsTotals.duplicatesAvoided) * 100) : 0,
          tokensPerRecommendation: operationsTotals.recommended ? Math.round(operationsTotals.tokens / operationsTotals.recommended) : 0,
          acceptanceRate: decisions ? Math.round(accepted / decisions * 100) : 0,
        },
        daily: operationsDays,
        horizons: (["days", "months", "years"] as Horizon[]).map((horizon) => {
          const row = horizonRows.results.find((item) => item.horizon === horizon);
          const candidates = row?.candidates || 0;
          const newCandidates = row?.new_candidates || 0;
          return { horizon, branches: row?.branches || 0, attempts: row?.attempts || 0, candidates, newCandidates,
            cooling: row?.cooling || 0, discoveryYield: candidates ? Math.round(newCandidates / candidates * 100) : 0 };
        }),
        tiers: Object.fromEntries(tierRows.results.map((row) => [row.recommendation_tier, row.count])),
        feedbackReasons: feedbackReasonRows.results.map((row) => ({ reasonCode: row.reason_code, decision: row.feedback, count: row.count })),
      },
      explorationLedger: ledgerRows.results.map((row) => ({
        id: row.query_key,
        horizon: row.horizon,
        sourceKey: row.source_key,
        channel: row.channel,
        queryText: row.query_text,
        nextCursor: row.next_cursor,
        attempts: row.attempt_count,
        candidates: row.total_candidate_count,
        newCandidates: row.new_candidate_count,
        discoveryYield: row.total_candidate_count ? Math.round(row.new_candidate_count / row.total_candidate_count * 100) : 0,
        zeroYieldStreak: row.zero_yield_streak,
        status: row.branch_status,
        cooldownUntil: row.cooldown_until,
        firstScannedAt: row.first_scanned_at,
        lastScannedAt: row.last_scanned_at,
        error: row.last_error,
      })),
      readingMemories,
      suggestedAuthors,
      papers: selected.map((paper) => toPaper(paper, now)),
      historyPapers,
      historyCounts: {
        all: historyPapers.length,
        inbox: pendingPapers.length,
        unseen: pendingPapers.filter((paper) => paper.userState === "unseen").length,
        seen: pendingPapers.filter((paper) => paper.userState === "seen").length,
        snoozed: pendingPapers.filter((paper) => paper.userState === "snoozed").length,
        accepted: historyPapers.filter((paper) => paper.userState === "accepted").length,
        saved: historyPapers.filter((paper) => paper.saved).length,
        dismissed: historyPapers.filter((paper) => paper.userState === "dismissed").length,
        reading: Object.fromEntries(readingCounts.results.map((row) => [row.status, row.count])),
      },
      ...extra,
    },
  };
}

export async function GET(request: Request) {
  const spaceId = new URL(request.url).searchParams.get("spaceId")?.trim() || "";
  if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
  try {
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    return Response.json(await readState(context.database, context.space));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load monitoring state" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { spaceId?: string; priorityVenues?: string[]; trackedAuthors?: string[]; explorationMode?: ExplorationMode; reset?: boolean };
    const spaceId = payload.spaceId?.trim() || "";
    if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    const { database, space } = context;
    if (payload.reset) {
      await database.prepare("DELETE FROM monitor_preferences WHERE space_id = ?").bind(space.id).run();
      await ensurePreference(database, space);
    } else {
      const venues = Array.from(new Set((payload.priorityVenues || []).map((venue) => cleanText(venue).slice(0, 120)).filter(Boolean))).slice(0, 30);
      const trackedAuthors = Array.from(new Set((payload.trackedAuthors || []).map((author) => cleanText(author).slice(0, 120)).filter(Boolean))).slice(0, 20);
      if (!venues.length) return Response.json({ error: "At least one priority venue is required" }, { status: 400 });
      const current = await ensurePreference(database, space);
      const explorationMode: ExplorationMode = ["focused", "balanced", "open"].includes(payload.explorationMode || "")
        ? payload.explorationMode as ExplorationMode : current.explorationMode;
      await database.prepare(
        `INSERT INTO monitor_preferences (id, space_id, profile_key, priority_venues, tracked_authors, exploration_mode, user_modified)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(space_id) DO UPDATE SET priority_venues = excluded.priority_venues,
         tracked_authors = excluded.tracked_authors, exploration_mode = excluded.exploration_mode,
         user_modified = 1, updated_at = CURRENT_TIMESTAMP`,
      ).bind(crypto.randomUUID(), space.id, current.profileKey, JSON.stringify(venues), JSON.stringify(trackedAuthors), explorationMode).run();
    }
    await database.batch([
      database.prepare("UPDATE monitor_runs SET last_run_at = NULL, next_run_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?").bind(space.id),
      database.prepare("UPDATE paper_insights SET analysis_model = '', updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND analysis_source = 'deepseek_rejected'").bind(space.id),
      database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date = date('now')").bind(space.id),
    ]);
    return Response.json(await readState(database, space, { preferencesSaved: true }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save monitoring preferences" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { spaceId?: string; force?: boolean };
    const spaceId = payload.spaceId?.trim() || "";
    if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    const { database, space, user } = context;
    const preference = await ensurePreference(database, space);
    const enrichedSpace = await enrichSpaceWithImportedMemory(database, space);
    const previous = await database.prepare("SELECT status, last_run_at, next_run_at, updated_at, discovery_round FROM monitor_runs WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<{ status: string; last_run_at: string | null; next_run_at: string | null; updated_at: string; discovery_round: number }>();
    const previousTime = previous?.last_run_at ? Date.parse(previous.last_run_at) : 0;
    const now = new Date();
    const discoveryRound = Math.max(0, previous?.discovery_round || 0);
    const runUpdatedAt = previous?.updated_at ? databaseTime(previous.updated_at) : 0;
    if (previous && !["idle", "ready", "error"].includes(previous.status) && now.getTime() - runUpdatedAt < STALE_RUN_MS) {
      return Response.json(await readState(database, space, { cached: true, alreadyRunning: true }));
    }
    const retryTime = previous?.next_run_at ? Date.parse(previous.next_run_at) : 0;
    if (!payload.force && previous?.status === "error" && retryTime > now.getTime()) {
      return Response.json(await readState(database, space, { cached: true, retryScheduled: true }));
    }
    const minimumAge = payload.force ? MANUAL_COOLDOWN_MS : CADENCE_MS;
    if (previousTime >= MONITOR_LLM_REVIEW_RELEASED_AT && now.getTime() - previousTime < minimumAge) {
      return Response.json(await readState(database, space, { cached: true, throttled: Boolean(payload.force) }));
    }

    const jobId = crypto.randomUUID();
    await database.batch([
      database.prepare(
        `INSERT INTO monitor_runs (id, space_id, status, error, updated_at)
         VALUES (?, ?, 'scanning', NULL, CURRENT_TIMESTAMP)
         ON CONFLICT(space_id) DO UPDATE SET status = 'scanning', error = NULL, new_count = 0,
         scanned_count = 0, updated_at = CURRENT_TIMESTAMP`,
      ).bind(crypto.randomUUID(), space.id),
      database.prepare(
        `INSERT INTO monitor_scan_jobs (id, space_id, status, progress, discovered_count, reviewed_count, recommended_count)
         VALUES (?, ?, 'scanning', 4, 0, 0, 0)`,
      ).bind(jobId, space.id),
    ]);

    try {
      await setScanSource(database, jobId, "days", "DeepSeek Pro · daily query plan", 6, 0);
      const queryPlan = await ensureDailyQueryPlan(database, enrichedSpace, user.userId, preference);
      const batches: Array<{ candidates: Candidate[]; rawCount: number }> = [];
      let discoveredCount = 0;
      for (const horizon of HORIZONS) {
        await updateRunPhase(database, space.id, jobId, `discovering_${horizon.key}`, discoveredCount);
        const batch = await fetchHorizon(database, enrichedSpace, horizon, now, preference.priorityVenues, preference.trackedAuthors, preference.profileKey, discoveryRound, jobId, discoveredCount, queryPlan);
        batches.push(batch);
        discoveredCount += batch.candidates.length;
        await updateRunPhase(database, space.id, jobId, `discovering_${horizon.key}`, discoveredCount);
      }
      await updateRunPhase(database, space.id, jobId, "deduplicating", discoveredCount);
      const candidates = new Map<string, Candidate>();
      for (const candidate of batches.flatMap((batch) => batch.candidates)) {
        const existing = candidates.get(candidate.canonicalId);
        if (!existing || candidate.qualityScore > existing.qualityScore) candidates.set(candidate.canonicalId, candidate);
      }
      const candidateList = Array.from(candidates.values());
      const scannedCount = candidateList.length;
      const rawCandidateCount = batches.reduce((sum, batch) => sum + batch.rawCount, 0);
      const newCandidateCount = await countNewCandidates(database, space.id, candidateList);
      const duplicateCount = Math.max(0, rawCandidateCount - newCandidateCount);
      await persistCandidatePool(database, space.id, candidateList);
      const pendingQueue = await pendingCandidateQueue(database, space.id);
      const pendingCandidates = selectUnseenReviewBatch(pendingQueue);
      await updateRunPhase(database, space.id, jobId, "reviewing", scannedCount);
      const reviews = await reviewCandidates(database, enrichedSpace, user.userId, preference.priorityVenues, pendingCandidates, jobId);

      const newCount = reviews.filter((review) => review.recommended).length;
      const rejectedCount = reviews.length - newCount;
      await updateRunPhase(database, space.id, jobId, "saving", scannedCount, newCount);

      const completedAt = new Date();
      await database.batch([
        database.prepare(
          "UPDATE monitor_runs SET status = 'ready', last_run_at = ?, next_run_at = ?, new_count = ?, scanned_count = ?, discovery_round = discovery_round + 1, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?",
        ).bind(completedAt.toISOString(), new Date(completedAt.getTime() + CADENCE_MS).toISOString(), newCount, scannedCount, space.id),
        database.prepare(
          "UPDATE monitor_scan_jobs SET status = 'ready', current_horizon = '', current_source = '', progress = 100, discovered_count = ?, new_candidate_count = ?, duplicate_count = ?, reviewed_count = ?, recommended_count = ?, rejected_count = ?, completed_at = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(scannedCount, newCandidateCount, duplicateCount, reviews.length, newCount, rejectedCount, completedAt.toISOString(), jobId),
      ]);
      return Response.json(await readState(database, space, { cached: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Monitoring scan failed";
      const failedAt = new Date();
      await database.batch([
        database.prepare("UPDATE monitor_runs SET status = 'error', next_run_at = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?")
          .bind(new Date(failedAt.getTime() + ERROR_RETRY_MS).toISOString(), message, space.id),
        database.prepare("UPDATE monitor_scan_jobs SET status = 'error', error = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(message, failedAt.toISOString(), jobId),
      ]);
      return Response.json(await readState(database, space), { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to run monitoring" }, { status: 500 });
  }
}
