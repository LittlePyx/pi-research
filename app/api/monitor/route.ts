import { ensureSchema, getApiUser, getDatabase, getRuntimeEnv } from "../../../db/repository";
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
type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

type SpaceRow = { id: string; name: string; description: string; memoryContext?: string };
type PreferenceRow = { profile_key: string; priority_venues: string; user_modified: number };
type RunRow = {
  status: string;
  last_run_at: string | null;
  next_run_at: string | null;
  new_count: number;
  scanned_count: number;
  discovery_round: number;
  error: string | null;
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
};
type DiscoveryQuery = { key: string; query: string; sort: "relevance" | "is-referenced-by-count" | "published"; rotating: boolean };
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
};
type MapTrackContext = { id: string; title_zh: string; title_en: string; summary_en: string; search_queries: string };

const CADENCE_MS = 24 * 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 60 * 1000;
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

function discoveryQueries(space: SpaceRow, horizon: typeof HORIZONS[number], profileKey: string, round: number, priorityVenues: string[]): DiscoveryQuery[] {
  const profile = getDomainProfile(profileKey);
  const description = cleanText(`${space.name} ${space.description}`).slice(0, 320);
  const profileTerms = profile.keywords.filter(asciiOnly);
  const memoryTerms = (space.memoryContext || "").split(";").map(cleanText).filter((term) => term.length >= 4 && asciiOnly(term));
  const cluster = round % 4;
  const profileWindow = rotatedSlice(profileTerms, round, 6);
  const memoryWindow = rotatedSlice(memoryTerms, round, 7);
  const venueWindow = rotatedSlice(priorityVenues.filter(asciiOnly), round, 2);
  const queries: DiscoveryQuery[] = [
    { key: "latest-anchor", query: `${description} ${profileTerms.slice(0, 3).join(" ")}`, sort: horizon.key === "days" ? "published" : horizon.sort, rotating: false },
    { key: `profile-cluster-${cluster}`, query: `${space.name} ${profileWindow.join(" ")}`, sort: "relevance", rotating: true },
  ];
  if (memoryWindow.length) {
    queries.push({ key: `memory-cluster-${cluster}`, query: `${space.name} ${memoryWindow.join(" ")}`, sort: horizon.key === "years" ? "is-referenced-by-count" : "relevance", rotating: true });
  }
  if (venueWindow.length) {
    queries.push({ key: `venue-cluster-${cluster}`, query: `${profileWindow.slice(0, 3).join(" ")} ${venueWindow.join(" ")}`, sort: horizon.key === "days" ? "published" : "relevance", rotating: true });
  }
  if (horizon.key === "years") {
    queries.push({
      key: `durable-cluster-${cluster}`,
      query: `${space.name} ${memoryWindow.join(" ") || profileWindow.join(" ")}`,
      sort: "is-referenced-by-count",
      rotating: true,
    });
  }
  return queries.map((item) => ({ ...item, query: cleanText(item.query).slice(0, 480) })).filter((item) => item.query.length >= 4);
}

async function discoveryOffset(database: D1Database, spaceId: string, horizon: Horizon, query: DiscoveryQuery) {
  if (!query.rotating) return 0;
  const row = await database.prepare(
    "SELECT next_offset FROM monitor_discovery_pages WHERE space_id = ? AND horizon = ? AND query_key = ? LIMIT 1",
  ).bind(spaceId, horizon, query.key).first<{ next_offset: number }>();
  return Math.max(0, row?.next_offset || 0);
}

async function advanceDiscoveryOffset(database: D1Database, spaceId: string, horizon: Horizon, query: DiscoveryQuery, offset: number, rows: number) {
  if (!query.rotating) return;
  const nextOffset = offset + rows >= 600 ? 0 : offset + rows;
  await database.prepare(
    `INSERT INTO monitor_discovery_pages (id, space_id, horizon, query_key, next_offset)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(space_id, horizon, query_key) DO UPDATE SET next_offset = excluded.next_offset, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), spaceId, horizon, query.key, nextOffset).run();
}

async function fetchHorizon(database: D1Database, space: SpaceRow, horizon: typeof HORIZONS[number], now: Date, priorityVenues: string[], profileKey: string, round: number) {
  const rows = horizon.key === "years" ? 36 : 30;
  const plans = discoveryQueries(space, horizon, profileKey, round, priorityVenues);
  const requestOptions: RequestInit = {
    headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
    signal: AbortSignal.timeout(20_000),
  };
  const fetched = await Promise.all(plans.map(async (plan) => {
    const offset = await discoveryOffset(database, space.id, horizon.key, plan);
  const endpoint = new URL("https://api.crossref.org/works");
    endpoint.searchParams.set("query.bibliographic", plan.query);
  endpoint.searchParams.set("filter", `from-pub-date:${isoDate(dateBefore(now, horizon.daysFrom))},until-pub-date:${isoDate(dateBefore(now, horizon.daysUntil))}`);
    endpoint.searchParams.set("rows", String(rows));
    endpoint.searchParams.set("offset", String(offset));
    endpoint.searchParams.set("sort", plan.sort);
  endpoint.searchParams.set("order", "desc");
  endpoint.searchParams.set("mailto", "pi-research@qiudao-pika.chatgpt.site");
  let response = await fetch(endpoint, requestOptions);
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    response = await fetch(endpoint, requestOptions);
  }
  if (!response.ok) throw new Error(`Crossref returned ${response.status}`);
  const data = await response.json() as CrossrefResponse;
    await advanceDiscoveryOffset(database, space.id, horizon.key, plan, offset, rows);
    return data.message?.items || [];
  }));
  const normalized = await Promise.all(fetched.flat().map((item) => normalizeItem(item, horizon.key)));
  const unique = new Map<string, Candidate>();
  for (const item of normalized
    .filter((item): item is Omit<Candidate, "qualityScore" | "priorityVenue"> => Boolean(item))
    .map((item) => ({ item, signals: relevanceSignals(item.title, space, profileKey) }))
    .map(({ item, signals }) => scoreCandidate({ ...item, relevanceScore: item.relevanceScore + signals.score * 20 }, priorityVenues, now))) {
    const previous = unique.get(item.canonicalId);
    if (!previous || item.qualityScore > previous.qualityScore) unique.set(item.canonicalId, item);
  }
  const limit = horizon.key === "years" ? 28 : horizon.key === "months" ? 16 : 12;
  return Array.from(unique.values()).sort((left, right) => right.qualityScore - left.qualityScore).slice(0, limit);
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
  let row = await database.prepare("SELECT profile_key, priority_venues, user_modified FROM monitor_preferences WHERE space_id = ? LIMIT 1")
    .bind(space.id).first<PreferenceRow>();
  if (!row) {
    const profile = inferDomainProfile(space.name, space.description);
    await database.prepare("INSERT OR IGNORE INTO monitor_preferences (id, space_id, profile_key, priority_venues) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), space.id, profile.key, JSON.stringify(profile.venues)).run();
    row = await database.prepare("SELECT profile_key, priority_venues, user_modified FROM monitor_preferences WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<PreferenceRow>();
  }
  const profile = getDomainProfile(row?.profile_key || "general_research");
  return {
    profileKey: profile.key,
    profileNameZh: profile.nameZh,
    profileNameEn: profile.nameEn,
    priorityVenues: parseVenues(row?.priority_venues || "[]"),
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

function boundedScore(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;
}

async function enrichSpaceWithImportedMemory(database: D1Database, space: SpaceRow): Promise<SpaceRow> {
  const [rows, tracks] = await Promise.all([
    database.prepare(
      "SELECT analysis_json FROM research_imports WHERE space_id = ? AND status = 'confirmed' ORDER BY confirmed_at DESC LIMIT 6",
    ).bind(space.id).all<{ analysis_json: string }>(),
    database.prepare(
      "SELECT title_en, summary_en, search_queries FROM research_tracks WHERE space_id = ? ORDER BY interaction_score DESC, depth_score DESC, position LIMIT 8",
    ).bind(space.id).all<{ title_en: string; summary_en: string; search_queries: string }>(),
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
  return { ...space, memoryContext: Array.from(new Set(context.map((item) => cleanText(item)).filter(Boolean))).join("; ").slice(0, 2600) };
}

async function reviewCandidates(database: D1Database, space: SpaceRow, userId: string, priorityVenues: string[], candidates: Candidate[]) {
  if (!candidates.length) return [] as PaperReview[];
  const runtime = getRuntimeEnv();
  if (!runtime.DEEPSEEK_API_KEY) throw new Error("DeepSeek Pro is required before papers can be recommended");
  const usageDate = new Date().toISOString().slice(0, 10);
  const workspaceScope = "monitor-workspace:" + userId.slice("anonymous:".length);
  const [globalCount, workspaceCount] = await Promise.all([
    usageCount(database, "monitor:global", usageDate),
    usageCount(database, workspaceScope, usageDate),
  ]);
  if (globalCount >= MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT || workspaceCount >= MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT) {
    throw new Error("DeepSeek Pro review budget reached; unreviewed papers were not published");
  }
  const mapTracks = await database.prepare(
    "SELECT id, title_zh, title_en, summary_en, search_queries FROM research_tracks WHERE space_id = ? ORDER BY position LIMIT 10",
  ).bind(space.id).all<MapTrackContext>();
  const validTrackIds = new Set(mapTracks.results.map((track) => track.id));

  const prompt = [
    "Return one JSON object only, with shape {\"reviews\":[...]}. Review every supplied record.",
    "Each review must contain: canonicalId, isPaper, recommended, relevanceScore, qualityScore, summaryZh, summaryEn, whyReadZh, whyReadEn, screeningReason, trackId, mapRole, mapRationaleZh, mapRationaleEn.",
    "Act as a strict academic editor, not a search-result summarizer. A real paper can still be irrelevant and must then be rejected.",
    "Set isPaper=false for mastheads, publication information, author instructions, contents, editorials without research content, corrections, calls for papers, or other non-paper records.",
    `Set recommended=true only when relevanceScore >= ${RECOMMENDATION_THRESHOLD}, the work directly advances the research-space scope, and it satisfies its horizon standard. Recency, citations, or a priority venue alone never justify recommendation.`,
    "Horizon standards: days = genuinely relevant new development; months = relevant, new, and high quality; years = highly relevant, durable, useful, and methodologically or strategically instructive.",
    "Use only supplied title, abstract, authors, venue, date, citation, and priority-venue evidence. Never invent a theorem, method, experiment, result, section, or conclusion.",
    "For recommended papers, summaryZh must be a concrete 100-180 Chinese-character introduction explaining the research question, approach, and evidence-backed contribution; summaryEn must convey the same substance in 55-95 words.",
    "For recommended papers, whyReadZh must be a specific 80-150 Chinese-character explanation of how the paper helps this exact research space and which idea, method, comparison, or decision the reader should extract; whyReadEn must convey the same substance in 45-80 words.",
    "Do not write generic phrases such as 'it is recent', 'it has a high score', or 'it comes from a priority venue' as the main reason to read.",
    "For rejected records, set all four summary/whyRead fields to empty strings and give a short screeningReason. Never put rejection language inside whyRead.",
    "When research-map directions are supplied, assign a recommended paper to the single best-fitting trackId only when the fit is direct. Otherwise use an empty trackId.",
    "For a track assignment, use mapRole=frontier for current active work or mapRole=milestone for a durable development, and write a concrete bilingual map rationale explaining how it extends that direction. For no assignment, keep both map rationales empty.",
    `Research space: ${space.name} — ${space.description}`,
    `User-confirmed imported research memory: ${space.memoryContext || "No confirmed imported profile yet"}`,
    `Priority venues: ${priorityVenues.join("; ")}`,
    `Existing research-map directions: ${JSON.stringify(mapTracks.results.map((track) => ({ id: track.id, titleZh: track.title_zh, titleEn: track.title_en, summaryEn: track.summary_en, searchQueries: parseVenues(track.search_queries) })))}`,
    "JSON records to review:",
    JSON.stringify(candidates.map((paper) => ({
      canonicalId: paper.canonicalId,
      title: paper.title,
      authors: paper.authors,
      venue: paper.venue,
      publishedAt: paper.publishedAt,
      horizon: paper.horizon,
      citations: paper.citationCount,
      priorityVenue: paper.priorityVenue,
      abstract: paper.abstractText.slice(0, 1400),
    }))),
  ].join("\n");

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
      // The review includes bilingual briefs for every accepted paper. DeepSeek's
      // JSON-mode guidance recommends leaving enough output room so the object is
      // not truncated after a long thinking trace.
      max_tokens: 24000,
      stream: false,
    }),
  });
  const data = await response.json() as DeepSeekResponse;
  if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro review failed");
  const content = data.choices?.[0]?.message?.content || "";
  if (!content.trim()) throw new Error("DeepSeek Pro returned an empty review");
  const parsed = JSON.parse(content) as { reviews?: Array<Partial<PaperReview>> };
  const byId = new Map((parsed.reviews || []).map((item) => [item.canonicalId, item]));
  const reviews = candidates.map((candidate) => {
    const item = byId.get(candidate.canonicalId);
    if (!item) throw new Error("DeepSeek Pro did not review every candidate");
    const relevanceScore = boundedScore(item.relevanceScore);
    const qualityScore = boundedScore(item.qualityScore);
    const summaryZh = cleanText(item.summaryZh || "").slice(0, 900);
    const summaryEn = cleanText(item.summaryEn || "").slice(0, 1200);
    const whyReadZh = cleanText(item.whyReadZh || "").slice(0, 800);
    const whyReadEn = cleanText(item.whyReadEn || "").slice(0, 1000);
    const hasBrief = Boolean(summaryZh && summaryEn && whyReadZh && whyReadEn);
    const recommended = item.isPaper === true && item.recommended === true && relevanceScore >= RECOMMENDATION_THRESHOLD && qualityScore >= 65 && hasBrief;
    const trackId = recommended && validTrackIds.has(cleanText(item.trackId || "")) ? cleanText(item.trackId || "") : "";
    const mapRationaleZh = trackId ? cleanText(item.mapRationaleZh || "").slice(0, 700) : "";
    const mapRationaleEn = trackId ? cleanText(item.mapRationaleEn || "").slice(0, 900) : "";
    return {
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
    } satisfies PaperReview;
  });
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  await Promise.all([
    recordUsage(database, "monitor:global", usageDate, inputTokens, outputTokens),
    recordUsage(database, workspaceScope, usageDate, inputTokens, outputTokens),
  ]);
  return reviews;
}

async function candidatesNeedingReview(database: D1Database, spaceId: string, candidates: Candidate[]) {
  if (!candidates.length) return [];
  const placeholders = candidates.map(() => "?").join(", ");
  const reviewed = await database.prepare(
    `SELECT p.canonical_id FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id
     WHERE p.space_id = ? AND p.canonical_id IN (${placeholders}) AND i.analysis_model = ?
     AND (i.analysis_source = 'deepseek' OR
       (i.analysis_source = 'deepseek_rejected' AND datetime(i.updated_at) >= datetime('now', '-90 days')))`,
  ).bind(spaceId, ...candidates.map((candidate) => candidate.canonicalId), MONITOR_MODEL).all<{ canonical_id: string }>();
  const reviewedIds = new Set(reviewed.results.map((row) => row.canonical_id));
  return candidates.filter((candidate) => !reviewedIds.has(candidate.canonicalId));
}

async function updateRunPhase(database: D1Database, spaceId: string, status: string, scannedCount: number, newCount = 0) {
  await database.prepare(
    "UPDATE monitor_runs SET status = ?, scanned_count = ?, new_count = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?",
  ).bind(status, scannedCount, newCount, spaceId).run();
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
  };
}

async function readState(database: D1Database, space: SpaceRow, extra: Record<string, unknown> = {}) {
  const preference = await ensurePreference(database, space);
  const [run, papers, known] = await Promise.all([
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
       COALESCE(d.show_count, 0) AS show_count, d.first_shown_at, d.last_shown_at, d.opened_at, d.snoozed_until,
       COALESCE(f.saved, 0) AS saved, f.feedback
       FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id
       LEFT JOIN paper_delivery_state d ON d.paper_id = p.id AND d.space_id = p.space_id
       LEFT JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
       WHERE p.space_id = ? AND i.llm_recommended = 1 AND i.analysis_source = 'deepseek' AND i.analysis_model = ?
       ORDER BY p.discovered_at DESC, i.quality_score DESC LIMIT 300`,
    ).bind(space.id, MONITOR_MODEL).all<PaperRow>(),
    database.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE space_id = ?").bind(space.id).first<{ count: number }>(),
  ]);
  const now = Date.now();
  const duePapers = papers.results
    .filter((paper) => isPaperDue(paper, now))
    .sort((left, right) => left.show_count - right.show_count || right.quality_score - left.quality_score || databaseTime(right.discovered_at) - databaseTime(left.discovered_at));
  const selected: PaperRow[] = [];
  for (const horizon of ["days", "months", "years"] as Horizon[]) {
    selected.push(...duePapers.filter((paper) => paper.horizon === horizon).slice(0, 2));
  }
  const historyPapers = papers.results.map((paper) => toPaper(paper, now));
  const pendingPapers = historyPapers.filter((paper) => paper.userState !== "accepted" && paper.userState !== "dismissed");
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
      source: "Crossref",
      horizons: ["days", "months", "years"],
      preferences: preference,
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
    const payload = await request.json() as { spaceId?: string; priorityVenues?: string[]; reset?: boolean };
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
      if (!venues.length) return Response.json({ error: "At least one priority venue is required" }, { status: 400 });
      const current = await ensurePreference(database, space);
      await database.prepare(
        `INSERT INTO monitor_preferences (id, space_id, profile_key, priority_venues, user_modified)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(space_id) DO UPDATE SET priority_venues = excluded.priority_venues,
         user_modified = 1, updated_at = CURRENT_TIMESTAMP`,
      ).bind(crypto.randomUUID(), space.id, current.profileKey, JSON.stringify(venues)).run();
    }
    await database.batch([
      database.prepare("UPDATE monitor_runs SET last_run_at = NULL, next_run_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?").bind(space.id),
      database.prepare("UPDATE paper_insights SET analysis_model = '', updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND analysis_source = 'deepseek_rejected'").bind(space.id),
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
    const previous = await database.prepare("SELECT last_run_at, discovery_round FROM monitor_runs WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<{ last_run_at: string | null; discovery_round: number }>();
    const previousTime = previous?.last_run_at ? Date.parse(previous.last_run_at) : 0;
    const now = new Date();
    const discoveryRound = Math.max(0, previous?.discovery_round || 0);
    const minimumAge = payload.force ? MANUAL_COOLDOWN_MS : CADENCE_MS;
    if (previousTime >= MONITOR_LLM_REVIEW_RELEASED_AT && now.getTime() - previousTime < minimumAge) {
      return Response.json(await readState(database, space, { cached: true, throttled: Boolean(payload.force) }));
    }

    await database.prepare(
      `INSERT INTO monitor_runs (id, space_id, status, error, updated_at)
       VALUES (?, ?, 'scanning', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id) DO UPDATE SET status = 'scanning', error = NULL, new_count = 0,
       scanned_count = 0, updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), space.id).run();

    try {
      const batches: Candidate[][] = [];
      let discoveredCount = 0;
      for (const horizon of HORIZONS) {
        await updateRunPhase(database, space.id, `discovering_${horizon.key}`, discoveredCount);
        const batch = await fetchHorizon(database, enrichedSpace, horizon, now, preference.priorityVenues, preference.profileKey, discoveryRound);
        batches.push(batch);
        discoveredCount += batch.length;
        await updateRunPhase(database, space.id, `discovering_${horizon.key}`, discoveredCount);
      }
      await updateRunPhase(database, space.id, "deduplicating", discoveredCount);
      const candidates = new Map<string, Candidate>();
      for (const candidate of batches.flat()) {
        const existing = candidates.get(candidate.canonicalId);
        if (!existing || candidate.qualityScore > existing.qualityScore) candidates.set(candidate.canonicalId, candidate);
      }
      const candidateList = Array.from(candidates.values());
      const scannedCount = candidateList.length;
      const pendingCandidates = await candidatesNeedingReview(database, space.id, candidateList);
      await updateRunPhase(database, space.id, "reviewing", scannedCount);
      const reviews = await reviewCandidates(database, enrichedSpace, user.userId, preference.priorityVenues, pendingCandidates);
      const reviewsById = new Map(reviews.map((review) => [review.canonicalId, review]));

      const newCount = reviews.filter((review) => review.recommended).length;
      await updateRunPhase(database, space.id, "saving", scannedCount, newCount);
      for (const candidate of candidateList) {
        const review = reviewsById.get(candidate.canonicalId);
        const generatedId = crypto.randomUUID();
        await database.prepare(
          `INSERT OR IGNORE INTO monitored_papers
           (id, space_id, canonical_id, doi, title, authors, venue, url, published_at, source, horizon, citation_count, relevance_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'crossref', ?, ?, ?)`,
        ).bind(generatedId, space.id, candidate.canonicalId, candidate.doi, candidate.title, candidate.authors, candidate.venue,
          candidate.url, candidate.publishedAt, candidate.horizon, candidate.citationCount, candidate.relevanceScore).run();
        const paper = await database.prepare("SELECT id FROM monitored_papers WHERE space_id = ? AND canonical_id = ? LIMIT 1")
          .bind(space.id, candidate.canonicalId).first<{ id: string }>();
        if (!paper) continue;
        await database.prepare(
          `UPDATE monitored_papers SET title = ?, authors = ?, venue = ?, url = ?, published_at = ?, horizon = ?,
           last_seen_at = CURRENT_TIMESTAMP, citation_count = MAX(citation_count, ?), relevance_score = MAX(relevance_score, ?)
           WHERE id = ?`,
        ).bind(candidate.title, candidate.authors, candidate.venue, candidate.url, candidate.publishedAt, candidate.horizon,
          candidate.citationCount, candidate.relevanceScore, paper.id).run();
        if (review) {
          await database.prepare(
            `INSERT INTO paper_insights
             (paper_id, space_id, abstract_text, summary_zh, summary_en, why_read_zh, why_read_en, quality_score,
              priority_venue, analysis_source, analysis_model, llm_recommended, llm_relevance_score, screening_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(paper_id) DO UPDATE SET abstract_text = excluded.abstract_text, summary_zh = excluded.summary_zh,
             summary_en = excluded.summary_en, why_read_zh = excluded.why_read_zh, why_read_en = excluded.why_read_en,
             quality_score = excluded.quality_score, priority_venue = excluded.priority_venue,
             analysis_source = excluded.analysis_source, analysis_model = excluded.analysis_model,
             llm_recommended = excluded.llm_recommended, llm_relevance_score = excluded.llm_relevance_score,
             screening_reason = excluded.screening_reason, updated_at = CURRENT_TIMESTAMP`,
          ).bind(paper.id, space.id, candidate.abstractText, review.summaryZh, review.summaryEn, review.whyReadZh, review.whyReadEn,
            review.qualityScore, candidate.priorityVenue ? 1 : 0, review.recommended ? "deepseek" : "deepseek_rejected",
            MONITOR_MODEL, review.recommended ? 1 : 0, review.relevanceScore, review.screeningReason).run();
        } else {
          await database.prepare("UPDATE paper_insights SET abstract_text = ?, priority_venue = ?, updated_at = CURRENT_TIMESTAMP WHERE paper_id = ?")
            .bind(candidate.abstractText, candidate.priorityVenue ? 1 : 0, paper.id).run();
        }
        if (review?.recommended && review.trackId) {
          await database.prepare(
            `INSERT OR IGNORE INTO research_track_papers
             (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role,
              summary_zh, summary_en, rationale_zh, rationale_en, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              (SELECT COALESCE(MAX(position) + 1, 0) FROM research_track_papers WHERE track_id = ?))`,
          ).bind(crypto.randomUUID(), review.trackId, space.id, candidate.canonicalId, candidate.doi, candidate.title,
            candidate.authors, candidate.venue, candidate.url, candidate.publishedAt, candidate.citationCount, review.mapRole,
            review.summaryZh, review.summaryEn, review.mapRationaleZh, review.mapRationaleEn, review.trackId).run();
          await database.prepare("UPDATE research_tracks SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
            .bind(review.trackId, space.id).run();
        }
      }

      const completedAt = new Date();
      await database.prepare(
        "UPDATE monitor_runs SET status = 'ready', last_run_at = ?, next_run_at = ?, new_count = ?, scanned_count = ?, discovery_round = discovery_round + 1, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?",
      ).bind(completedAt.toISOString(), new Date(completedAt.getTime() + CADENCE_MS).toISOString(), newCount, scannedCount, space.id).run();
      return Response.json(await readState(database, space, { cached: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Monitoring scan failed";
      const failedAt = new Date();
      await database.prepare("UPDATE monitor_runs SET status = 'error', last_run_at = ?, next_run_at = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?")
        .bind(failedAt.toISOString(), new Date(failedAt.getTime() + CADENCE_MS).toISOString(), message, space.id).run();
      return Response.json(await readState(database, space), { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to run monitoring" }, { status: 500 });
  }
}
