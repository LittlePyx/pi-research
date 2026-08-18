import { ensureSchema, getApiUser, getDatabase, getRuntimeEnv } from "../../../db/repository";
import type { ResearchDirectionIntelligence, ResearchDirectionRole, ResearchHeatLevel, ResearchMapState, ResearchTrack, ResearchTrackEdge, ResearchTrackPaper, ResearchTrackRole } from "../../../lib/research-map";

type SpaceRow = { id: string; name: string; description: string; owner_user_id: string };
type TrackRow = {
  id: string;
  title_zh: string;
  title_en: string;
  summary_zh: string;
  summary_en: string;
  search_queries: string;
  expansion_count: number;
  user_role: ResearchDirectionRole;
  depth_score: number;
  support_score: number;
  interaction_score: number;
  intelligence_json: string;
  intelligence_model: string;
  intelligence_updated_at: string | null;
  updated_at: string;
};
type TrackEdgeRow = {
  id: string;
  source_track_id: string;
  target_track_id: string;
  kind: "builds_on" | "bridges" | "supports";
  relationship_zh: string;
  relationship_en: string;
  strength: number;
};
type TrackPaperRow = {
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
  role: ResearchTrackRole;
  summary_zh: string;
  summary_en: string;
  rationale_zh: string;
  rationale_en: string;
  position: number;
};
type ExistingPaperEvidence = {
  canonical_id: string;
  title: string;
  authors: string;
  venue: string;
  published_at: string | null;
  citation_count: number;
  role: ResearchTrackRole;
  summary_zh: string;
  summary_en: string;
  rationale_zh: string;
  rationale_en: string;
};
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
  type?: string;
};
type CrossrefResponse = { message?: { items?: CrossrefItem[] } };
type DirectionDraft = {
  key: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  searchQueries: string[];
  userRole: ResearchDirectionRole;
  depthScore: number;
  supportScore: number;
};
type DirectionRelationship = { sourceIndex: number; targetIndex: number; kind: "builds_on" | "bridges" | "supports"; relationshipZh: string; relationshipEn: string; strength: number };
type MapCandidate = {
  directionKey: string;
  canonicalId: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  citationCount: number;
  abstractText: string;
  proposedRole: ResearchTrackRole;
};
type Selection = {
  directionKey: string;
  canonicalId: string;
  role: ResearchTrackRole;
  summaryZh: string;
  summaryEn: string;
  rationaleZh: string;
  rationaleEn: string;
};
type DirectionIntelligenceDraft = {
  directionKey: string;
  assessmentZh: string;
  assessmentEn: string;
  opportunityZh: string;
  opportunityEn: string;
  watchSignalZh: string;
  watchSignalEn: string;
  confidence: number;
  evidenceCanonicalIds: string[];
};
type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

const MODEL = "deepseek-v4-pro";
const PAPER_TYPES = new Set(["journal-article", "proceedings-article", "posted-content"]);
const NON_PAPER_PHRASES = /(publication information|information for authors|instructions for authors|table of contents|editorial board|front matter|back matter|issue information|journal masthead|correction|erratum)/i;
const ROLES = new Set<ResearchTrackRole>(["foundation", "milestone", "frontier"]);
const DIRECTION_ROLES = new Set<ResearchDirectionRole>(["core", "support", "explore"]);
const EDGE_KINDS = new Set(["builds_on", "bridges", "supports"]);
const GLOBAL_DAILY_LIMIT = 120;
const WORKSPACE_DAILY_LIMIT = 16;

function cleanText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function boundedScore(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback;
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function sanitizeIntelligence(item: Partial<DirectionIntelligenceDraft> | undefined, directionKey: string, allowedCanonicalIds: Set<string>) {
  if (!item || cleanText(item.directionKey || "") !== directionKey) return null;
  const evidenceCanonicalIds = Array.from(new Set((item.evidenceCanonicalIds || []).map((id) => cleanText(String(id))).filter((id) => allowedCanonicalIds.has(id)))).slice(0, 6);
  const intelligence = {
    assessmentZh: cleanText(item.assessmentZh || "").slice(0, 900),
    assessmentEn: cleanText(item.assessmentEn || "").slice(0, 1200),
    opportunityZh: cleanText(item.opportunityZh || "").slice(0, 800),
    opportunityEn: cleanText(item.opportunityEn || "").slice(0, 1100),
    watchSignalZh: cleanText(item.watchSignalZh || "").slice(0, 650),
    watchSignalEn: cleanText(item.watchSignalEn || "").slice(0, 900),
    confidence: boundedScore(item.confidence, 50),
    evidenceCanonicalIds,
  };
  return intelligence.assessmentZh && intelligence.assessmentEn && intelligence.opportunityZh && intelligence.opportunityEn
    && intelligence.watchSignalZh && intelligence.watchSignalEn && intelligence.evidenceCanonicalIds.length ? intelligence : null;
}

function parseStoredIntelligence(row: TrackRow): ResearchDirectionIntelligence | null {
  try {
    const parsed = JSON.parse(row.intelligence_json || "{}") as Partial<DirectionIntelligenceDraft>;
    const evidenceCanonicalIds = Array.isArray(parsed.evidenceCanonicalIds) ? parsed.evidenceCanonicalIds.filter((id): id is string => typeof id === "string").slice(0, 6) : [];
    if (!parsed.assessmentZh || !parsed.assessmentEn || !parsed.opportunityZh || !parsed.opportunityEn || !parsed.watchSignalZh || !parsed.watchSignalEn || !evidenceCanonicalIds.length) return null;
    return {
      assessmentZh: cleanText(parsed.assessmentZh).slice(0, 900), assessmentEn: cleanText(parsed.assessmentEn).slice(0, 1200),
      opportunityZh: cleanText(parsed.opportunityZh).slice(0, 800), opportunityEn: cleanText(parsed.opportunityEn).slice(0, 1100),
      watchSignalZh: cleanText(parsed.watchSignalZh).slice(0, 650), watchSignalEn: cleanText(parsed.watchSignalEn).slice(0, 900),
      confidence: boundedScore(parsed.confidence, 50), evidenceCanonicalIds, model: row.intelligence_model || MODEL, updatedAt: row.intelligence_updated_at,
    };
  } catch {
    return null;
  }
}

function publicationDate(item: CrossrefItem) {
  const parts = item["published-online"]?.["date-parts"]?.[0]
    || item["published-print"]?.["date-parts"]?.[0]
    || item.published?.["date-parts"]?.[0];
  if (!parts?.[0]) return null;
  return `${String(parts[0]).padStart(4, "0")}-${String(parts[1] || 1).padStart(2, "0")}-${String(parts[2] || 1).padStart(2, "0")}`;
}

async function titleFingerprint(title: string) {
  const normalized = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return "title:" + Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function normalizeItem(item: CrossrefItem, directionKey: string, proposedRole: ResearchTrackRole): Promise<MapCandidate | null> {
  const title = cleanText(item.title?.[0] || "");
  if (title.length < 12 || !PAPER_TYPES.has(item.type || "") || NON_PAPER_PHRASES.test(title)) return null;
  const doi = item.DOI?.trim().toLocaleLowerCase() || null;
  const authors = (item.author || []).slice(0, 8).map((author) => cleanText(author.name || [author.given, author.family].filter(Boolean).join(" "))).filter(Boolean).join(", ");
  const venue = cleanText(item["container-title"]?.[0] || "");
  return {
    directionKey,
    canonicalId: doi ? "doi:" + doi : await titleFingerprint(title),
    doi,
    title,
    authors,
    venue,
    url: item.URL || (doi ? "https://doi.org/" + doi : ""),
    publishedAt: publicationDate(item),
    citationCount: Math.max(0, Math.round(item["is-referenced-by-count"] || 0)),
    abstractText: cleanText(item.abstract || "").slice(0, 700),
    proposedRole,
  };
}

async function ownedSpace(request: Request, spaceId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 }) };
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id, name, description, owner_user_id FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1")
    .bind(spaceId, user.userId).first<SpaceRow>();
  if (!space) return { error: Response.json({ error: "Research space not found" }, { status: 404 }) };
  return { database, space, user };
}

async function importedMemory(database: D1Database, spaceId: string) {
  const rows = await database.prepare("SELECT analysis_json FROM research_imports WHERE space_id = ? AND status = 'confirmed' ORDER BY confirmed_at DESC LIMIT 5")
    .bind(spaceId).all<{ analysis_json: string }>();
  const memory: string[] = [];
  for (const row of rows.results) {
    try {
      const item = JSON.parse(row.analysis_json) as { summaryEn?: string; searchTerms?: string[]; interests?: Array<{ labelEn?: string }>; openQuestions?: Array<{ labelEn?: string }> };
      memory.push(item.summaryEn || "", ...(item.searchTerms || []), ...(item.interests || []).map((entry) => entry.labelEn || ""), ...(item.openQuestions || []).map((entry) => entry.labelEn || ""));
    } catch {
      // A malformed historical profile should not prevent a map refresh.
    }
  }
  return Array.from(new Set(memory.map(cleanText).filter(Boolean))).join("; ").slice(0, 2600);
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

async function callDeepSeek<T>(database: D1Database, workspaceId: string, system: string, prompt: string, maxTokens = 12000) {
  const runtime = getRuntimeEnv();
  if (!runtime.DEEPSEEK_API_KEY) throw new Error("DeepSeek Pro is required to build the research map");
  const date = new Date().toISOString().slice(0, 10);
  const workspaceScope = "research-map-workspace:" + workspaceId;
  const [globalCount, workspaceCount] = await Promise.all([
    usageCount(database, "research-map:global", date),
    usageCount(database, workspaceScope, date),
  ]);
  if (globalCount >= GLOBAL_DAILY_LIMIT || workspaceCount >= WORKSPACE_DAILY_LIMIT) throw new Error("Research-map analysis budget reached for today");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + runtime.DEEPSEEK_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  const data = await response.json() as DeepSeekResponse;
  if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro research-map analysis failed");
  const content = data.choices?.[0]?.message?.content || "";
  if (!content.trim()) throw new Error("DeepSeek Pro returned an empty research map");
  await Promise.all([
    recordUsage(database, "research-map:global", date, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
    recordUsage(database, workspaceScope, date, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
  ]);
  return JSON.parse(content) as T;
}

async function generateDirections(database: D1Database, workspaceId: string, space: SpaceRow, memory: string) {
  const parsed = await callDeepSeek<{ directions?: Array<Partial<DirectionDraft>>; relationships?: Array<Partial<DirectionRelationship>> }>(
    database,
    workspaceId,
    "You are Pi Research's academic field cartographer. Return strict JSON grounded in the supplied research scope.",
    [
      "Return {\"directions\":[...],\"relationships\":[...]} with 3-5 distinct research directions that together form a useful map of this exact field.",
      "Every direction needs key, titleZh, titleEn, summaryZh, summaryEn, 2-3 concise English scholarly searchQueries, userRole (core|support|explore), depthScore, and supportScore.",
      "depthScore estimates how deeply the supplied user evidence demonstrates work in this direction. supportScore estimates how useful the direction is as theory, method, evidence, or a bridge for the user's core work. Do not equate popularity with user depth.",
      "Every relationship needs zero-based sourceIndex, zero-based targetIndex, kind (builds_on|bridges|supports), relationshipZh, relationshipEn, and strength. Create a connected, acyclic main backbone first, then add only useful bridge edges.",
      "Directions must be intellectually meaningful branches, not generic labels such as background, methods, or applications.",
      "The summaries should state the central question and how this branch relates to the user's scope. Do not claim any specific paper or result yet.",
      `Research space: ${space.name} — ${space.description}`,
      `User-confirmed research memory: ${memory || "none"}`,
    ].join("\n"),
    8000,
  );
  const directions = (parsed.directions || []).map((item, index) => ({
    key: `${cleanText(item.key || "direction").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 52)}-${index + 1}`,
    titleZh: cleanText(item.titleZh || "").slice(0, 160),
    titleEn: cleanText(item.titleEn || "").slice(0, 200),
    summaryZh: cleanText(item.summaryZh || "").slice(0, 500),
    summaryEn: cleanText(item.summaryEn || "").slice(0, 700),
    searchQueries: Array.from(new Set((item.searchQueries || []).map((query) => cleanText(String(query))).filter((query) => query.length >= 4))).slice(0, 3),
    userRole: DIRECTION_ROLES.has(item.userRole as ResearchDirectionRole) ? item.userRole as ResearchDirectionRole : "explore",
    depthScore: boundedScore(item.depthScore),
    supportScore: boundedScore(item.supportScore),
  })).filter((item) => item.titleZh && item.titleEn && item.summaryZh && item.summaryEn && item.searchQueries.length).slice(0, 5);
  const relationships = (parsed.relationships || []).map((item) => ({
    sourceIndex: Math.round(Number(item.sourceIndex)),
    targetIndex: Math.round(Number(item.targetIndex)),
    kind: EDGE_KINDS.has(String(item.kind)) ? item.kind as DirectionRelationship["kind"] : "builds_on",
    relationshipZh: cleanText(item.relationshipZh || "").slice(0, 260),
    relationshipEn: cleanText(item.relationshipEn || "").slice(0, 360),
    strength: boundedScore(item.strength, 50),
  })).filter((item) => Number.isInteger(item.sourceIndex) && Number.isInteger(item.targetIndex)
    && item.sourceIndex >= 0 && item.targetIndex >= 0 && item.sourceIndex < directions.length && item.targetIndex < directions.length
    && item.sourceIndex !== item.targetIndex && item.relationshipZh && item.relationshipEn);
  return { directions, relationships };
}

function roleDates(role: ResearchTrackRole) {
  const year = new Date().getUTCFullYear();
  if (role === "foundation") return { from: "1950-01-01", until: `${year - 10}-12-31` };
  if (role === "milestone") return { from: `${year - 15}-01-01`, until: `${year - 5}-12-31` };
  return { from: `${year - 5}-01-01`, until: new Date().toISOString().slice(0, 10) };
}

async function fetchCrossref(query: string, role: ResearchTrackRole, offset: number, rows: number) {
  const dates = roleDates(role);
  const endpoint = new URL("https://api.crossref.org/works");
  endpoint.searchParams.set("query.bibliographic", cleanText(query).slice(0, 420));
  endpoint.searchParams.set("filter", `from-pub-date:${dates.from},until-pub-date:${dates.until}`);
  endpoint.searchParams.set("rows", String(rows));
  endpoint.searchParams.set("offset", String(offset));
  endpoint.searchParams.set("sort", role === "frontier" ? "relevance" : "is-referenced-by-count");
  endpoint.searchParams.set("order", "desc");
  endpoint.searchParams.set("mailto", "pi-research@qiudao-pika.chatgpt.site");
  const options: RequestInit = {
    headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
    signal: AbortSignal.timeout(20_000),
  };
  let response = await fetch(endpoint, options);
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 950));
    response = await fetch(endpoint, options);
  }
  if (!response.ok) throw new Error(`Crossref returned ${response.status}`);
  return (await response.json() as CrossrefResponse).message?.items || [];
}

async function discoverCandidates(directions: DirectionDraft[], offset: number, rows: number) {
  const discovered: MapCandidate[] = [];
  for (const direction of directions) {
    const batches = await Promise.all((["foundation", "milestone", "frontier"] as ResearchTrackRole[]).map(async (role) => {
      const query = direction.searchQueries[(role === "foundation" ? 0 : role === "milestone" ? 1 : 2) % direction.searchQueries.length];
      const items = await fetchCrossref(query, role, offset, rows);
      const normalized = await Promise.all(items.map((item) => normalizeItem(item, direction.key, role)));
      return normalized.filter((item): item is MapCandidate => Boolean(item));
    }));
    discovered.push(...batches.flat());
    if (directions.length > 1) await new Promise((resolve) => setTimeout(resolve, 180));
  }
  const unique = new Map<string, MapCandidate>();
  for (const candidate of discovered) {
    const key = candidate.directionKey + ":" + candidate.canonicalId;
    const previous = unique.get(key);
    if (!previous || candidate.abstractText.length > previous.abstractText.length || candidate.citationCount > previous.citationCount) unique.set(key, candidate);
  }
  const values = Array.from(unique.values());
  const capped: MapCandidate[] = [];
  for (const direction of directions) {
    for (const role of ["foundation", "milestone", "frontier"] as ResearchTrackRole[]) {
      capped.push(...values.filter((item) => item.directionKey === direction.key && item.proposedRole === role).slice(0, 8));
    }
  }
  return capped;
}

async function selectPapers(
  database: D1Database,
  workspaceId: string,
  space: SpaceRow,
  memory: string,
  directions: DirectionDraft[],
  candidates: MapCandidate[],
  mode: "initialize" | "expand",
  existingEvidence: Array<{ canonicalId: string; title: string; publishedAt: string | null; role: ResearchTrackRole; summaryEn: string; rationaleEn: string }> = [],
) {
  const compact = candidates.map((item) => ({
    directionKey: item.directionKey,
    canonicalId: item.canonicalId,
    proposedRole: item.proposedRole,
    title: item.title,
    authors: item.authors,
    venue: item.venue,
    publishedAt: item.publishedAt,
    citations: item.citationCount,
    abstract: item.abstractText,
  }));
  const parsed = await callDeepSeek<{ selections?: Array<Partial<Selection>>; directionIntelligence?: Array<Partial<DirectionIntelligenceDraft>> }>(
    database,
    workspaceId,
    "You are Pi Research's evidence-disciplined academic map editor. Select only real, representative papers and return strict JSON.",
    [
      "Return {\"selections\":[...],\"directionIntelligence\":[...]} using only supplied canonicalId and directionKey values.",
      "Each selection needs directionKey, canonicalId, role (foundation|milestone|frontier), summaryZh, summaryEn, rationaleZh, rationaleEn.",
      "Each directionIntelligence item needs directionKey, assessmentZh/En, opportunityZh/En, watchSignalZh/En, confidence (0-100), and evidenceCanonicalIds (1-6 exact IDs from supplied candidates or existing accepted papers).",
      "Assessment must synthesize the direction's current intellectual state or unresolved tension. Opportunity must propose one concrete high-value research move for this user. Watch signal must name an observable result, method, benchmark, theorem, or shift that would change the assessment.",
      "Ground every intelligence statement in the supplied evidence. If metadata is incomplete, say what is uncertain and lower confidence. Do not present inference as a paper's stated result.",
      mode === "initialize" ? "Choose 5-8 papers per direction with coverage across all three roles." : "Choose 3-6 genuinely additive papers for this direction; do not fill a quota with weak records.",
      "Foundation = field-defining concepts or methods; milestone = a decisive development or branch point; frontier = a recent representative work that shows the current direction.",
      "Reject publication information, mastheads, editorials, corrections, calls for papers, vague matches, and records whose title/abstract do not establish a substantive research paper.",
      "Citation count is a noisy signal, not proof. Prefer intellectual representativeness and direct fit. A famous paper outside the exact direction must be rejected.",
      "Summary must explain the paper's question, approach, and evidenced contribution. Rationale must explain why it occupies this exact position in the development route. Never invent results not supported by metadata.",
      `Research space: ${space.name} — ${space.description}`,
      `User-confirmed research memory: ${memory || "none"}`,
      `Directions: ${JSON.stringify(directions)}`,
      `Existing accepted route papers: ${JSON.stringify(existingEvidence)}`,
      `Candidate records: ${JSON.stringify(compact)}`,
    ].join("\n"),
    20000,
  );
  const allowed = new Set(candidates.map((item) => item.directionKey + ":" + item.canonicalId));
  const selections = (parsed.selections || []).map((item) => ({
    directionKey: cleanText(item.directionKey || ""),
    canonicalId: cleanText(item.canonicalId || ""),
    role: ROLES.has(item.role as ResearchTrackRole) ? item.role as ResearchTrackRole : "milestone",
    summaryZh: cleanText(item.summaryZh || "").slice(0, 800),
    summaryEn: cleanText(item.summaryEn || "").slice(0, 1100),
    rationaleZh: cleanText(item.rationaleZh || "").slice(0, 700),
    rationaleEn: cleanText(item.rationaleEn || "").slice(0, 950),
  })).filter((item) => allowed.has(item.directionKey + ":" + item.canonicalId) && item.summaryZh && item.summaryEn && item.rationaleZh && item.rationaleEn);
  const allowedEvidence = new Set([...selections.map((item) => item.canonicalId), ...existingEvidence.map((item) => item.canonicalId)]);
  const intelligence = directions.map((direction) => sanitizeIntelligence(
    (parsed.directionIntelligence || []).find((item) => cleanText(item.directionKey || "") === direction.key),
    direction.key,
    allowedEvidence,
  )).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return { selections, intelligence };
}

async function interpretDirection(
  database: D1Database,
  workspaceId: string,
  space: SpaceRow,
  memory: string,
  track: TrackRow,
  evidence: Array<{ canonicalId: string; title: string; authors: string; venue: string; publishedAt: string | null; citations: number; role: ResearchTrackRole; summaryZh: string; summaryEn: string; rationaleZh: string; rationaleEn: string }>,
) {
  if (!evidence.length) return null;
  const parsed = await callDeepSeek<{ directionIntelligence?: Partial<DirectionIntelligenceDraft> }>(
    database,
    workspaceId,
    "You are Pi Research's senior research-strategy analyst. Produce a rigorous, evidence-grounded bilingual direction assessment and return strict JSON.",
    [
      "Return {\"directionIntelligence\":{directionKey, assessmentZh, assessmentEn, opportunityZh, opportunityEn, watchSignalZh, watchSignalEn, confidence, evidenceCanonicalIds}}.",
      "Assessment: synthesize the direction's current intellectual state and the most important unresolved tension; do not merely summarize titles.",
      "Opportunity: give one concrete, high-value next research move tailored to the user's confirmed memory, depth, and open questions.",
      "Watch signal: name a specific observable theorem, method, empirical result, benchmark shift, or new connection that would materially change the assessment.",
      "Use 2-6 exact evidenceCanonicalIds from supplied accepted papers. Distinguish metadata-supported statements from your synthesis, state uncertainty, and lower confidence when abstracts or evidence are sparse.",
      `Research space: ${space.name} — ${space.description}`,
      `User-confirmed research memory: ${memory || "none"}`,
      `Direction: ${JSON.stringify({ id: track.id, titleZh: track.title_zh, titleEn: track.title_en, summaryZh: track.summary_zh, summaryEn: track.summary_en, userRole: track.user_role, depthScore: track.depth_score + track.interaction_score, supportScore: track.support_score })}`,
      `Accepted evidence papers: ${JSON.stringify(evidence)}`,
    ].join("\n"),
    7000,
  );
  return sanitizeIntelligence(parsed.directionIntelligence, track.id, new Set(evidence.map((item) => item.canonicalId)));
}

async function saveDirectionIntelligence(database: D1Database, spaceId: string, trackId: string, intelligence: ReturnType<typeof sanitizeIntelligence>) {
  if (!intelligence) return;
  await database.prepare("UPDATE research_tracks SET intelligence_json = ?, intelligence_model = ?, intelligence_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
    .bind(JSON.stringify(intelligence), MODEL, trackId, spaceId).run();
}

function toPaper(row: TrackPaperRow): ResearchTrackPaper {
  return {
    id: row.id,
    canonicalId: row.canonical_id,
    doi: row.doi,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    url: row.url,
    publishedAt: row.published_at,
    citationCount: row.citation_count,
    role: row.role,
    summaryZh: row.summary_zh,
    summaryEn: row.summary_en,
    rationaleZh: row.rationale_zh,
    rationaleEn: row.rationale_en,
    position: row.position,
  };
}

function heatEvidence(papers: ResearchTrackPaper[]) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const ages = papers.map((paper) => paper.publishedAt ? Math.max(0, (now - Date.parse(paper.publishedAt)) / day) : Number.POSITIVE_INFINITY);
  const last14Days = ages.filter((age) => age <= 14).length;
  const last6Months = ages.filter((age) => age > 14 && age <= 183).length;
  const recentFrontier = papers.filter((paper, index) => paper.role === "frontier" && ages[index] <= 365).length;
  const newestAge = Math.min(...ages);
  const recencyBonus = newestAge <= 14 ? 18 : newestAge <= 60 ? 12 : newestAge <= 183 ? 7 : newestAge <= 365 ? 3 : 0;
  const raw = last14Days * 30 + last6Months * 10 + recentFrontier * 5 + recencyBonus;
  const absolute = Math.min(100, raw);
  return { raw, absolute, recentPaperCount: last14Days + last6Months };
}

function heatLevel(score: number, recentPaperCount: number): ResearchHeatLevel {
  if (!recentPaperCount) return "quiet";
  if (score >= 75) return "hot";
  if (score >= 50) return "rising";
  if (score >= 25) return "steady";
  return "quiet";
}

async function structureExistingTracks(database: D1Database, workspaceId: string, space: SpaceRow, memory: string) {
  const tracks = await database.prepare(
    "SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, user_role, depth_score, support_score, interaction_score, intelligence_json, intelligence_model, intelligence_updated_at, updated_at FROM research_tracks WHERE space_id = ? ORDER BY position",
  ).bind(space.id).all<TrackRow>();
  if (tracks.results.length < 2) return;
  const parsed = await callDeepSeek<{
    profiles?: Array<{ trackId?: string; userRole?: ResearchDirectionRole; depthScore?: number; supportScore?: number }>;
    edges?: Array<{ sourceTrackId?: string; targetTrackId?: string; kind?: string; relationshipZh?: string; relationshipEn?: string; strength?: number }>;
  }>(database, workspaceId, "You are Pi Research's evidence-disciplined field-structure editor. Return strict JSON.", [
    "Return {\"profiles\":[...],\"edges\":[...]} for the supplied existing research directions.",
    "Each profile needs trackId, userRole (core|support|explore), depthScore, supportScore. User depth must come from supplied user evidence, not the direction's general prestige.",
    "Each edge needs sourceTrackId, targetTrackId, kind (builds_on|bridges|supports), relationshipZh, relationshipEn, strength.",
    "Build a connected main backbone that gives a clear learning/development path, then add only meaningful cross-direction bridge edges. Never create self-edges.",
    `Research space: ${space.name} — ${space.description}`,
    `User-confirmed memory: ${memory || "none"}`,
    `Existing directions: ${JSON.stringify(tracks.results.map((track) => ({ id: track.id, titleZh: track.title_zh, titleEn: track.title_en, summaryZh: track.summary_zh, summaryEn: track.summary_en, paperCountHint: track.expansion_count, searchQueries: parseJsonArray(track.search_queries) })))}`,
  ].join("\n"), 10000);
  const validIds = new Set(tracks.results.map((track) => track.id));
  for (const profile of parsed.profiles || []) {
    const trackId = cleanText(profile.trackId || "");
    if (!validIds.has(trackId)) continue;
    const userRole = DIRECTION_ROLES.has(profile.userRole as ResearchDirectionRole) ? profile.userRole as ResearchDirectionRole : "explore";
    await database.prepare("UPDATE research_tracks SET user_role = ?, depth_score = ?, support_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
      .bind(userRole, boundedScore(profile.depthScore), boundedScore(profile.supportScore), trackId, space.id).run();
  }
  await database.prepare("DELETE FROM research_track_edges WHERE space_id = ?").bind(space.id).run();
  for (const edge of parsed.edges || []) {
    const sourceId = cleanText(edge.sourceTrackId || "");
    const targetId = cleanText(edge.targetTrackId || "");
    if (!validIds.has(sourceId) || !validIds.has(targetId) || sourceId === targetId) continue;
    const relationshipZh = cleanText(edge.relationshipZh || "").slice(0, 260);
    const relationshipEn = cleanText(edge.relationshipEn || "").slice(0, 360);
    if (!relationshipZh || !relationshipEn) continue;
    const kind = EDGE_KINDS.has(String(edge.kind)) ? String(edge.kind) : "builds_on";
    await database.prepare(
      "INSERT OR IGNORE INTO research_track_edges (id, space_id, source_track_id, target_track_id, kind, relationship_zh, relationship_en, strength) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), space.id, sourceId, targetId, kind, relationshipZh, relationshipEn, boundedScore(edge.strength, 50)).run();
  }
}

async function readMap(database: D1Database, spaceId: string, extra: Record<string, unknown> = {}) {
  const [tracksResult, papersResult, edgesResult] = await Promise.all([
    database.prepare("SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, user_role, depth_score, support_score, interaction_score, intelligence_json, intelligence_model, intelligence_updated_at, updated_at FROM research_tracks WHERE space_id = ? ORDER BY position, created_at")
      .bind(spaceId).all<TrackRow>(),
    database.prepare("SELECT id, track_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role, summary_zh, summary_en, rationale_zh, rationale_en, position FROM research_track_papers WHERE space_id = ? ORDER BY position, created_at")
      .bind(spaceId).all<TrackPaperRow>(),
    database.prepare("SELECT id, source_track_id, target_track_id, kind, relationship_zh, relationship_en, strength FROM research_track_edges WHERE space_id = ? ORDER BY strength DESC, created_at")
      .bind(spaceId).all<TrackEdgeRow>(),
  ]);
  const papersByTrack = new Map<string, ResearchTrackPaper[]>();
  for (const row of papersResult.results) papersByTrack.set(row.track_id, [...(papersByTrack.get(row.track_id) || []), toPaper(row)]);
  const heatByTrack = new Map(tracksResult.results.map((row) => [row.id, heatEvidence(papersByTrack.get(row.id) || [])]));
  const maxHeatRaw = Math.max(0, ...Array.from(heatByTrack.values()).map((item) => item.raw));
  const tracks: ResearchTrack[] = tracksResult.results.map((row) => ({
    id: row.id,
    titleZh: row.title_zh,
    titleEn: row.title_en,
    summaryZh: row.summary_zh,
    summaryEn: row.summary_en,
    expansionCount: row.expansion_count,
    userRole: DIRECTION_ROLES.has(row.user_role) ? row.user_role : "explore",
    depthScore: Math.min(100, row.depth_score + row.interaction_score),
    supportScore: row.support_score,
    interactionScore: row.interaction_score,
    heatScore: (() => {
      const evidence = heatByTrack.get(row.id) || { raw: 0, absolute: 0, recentPaperCount: 0 };
      return evidence.raw ? Math.min(100, Math.round(evidence.absolute * 0.65 + (maxHeatRaw ? evidence.raw / maxHeatRaw * 100 : 0) * 0.35)) : 0;
    })(),
    heatLevel: (() => {
      const evidence = heatByTrack.get(row.id) || { raw: 0, absolute: 0, recentPaperCount: 0 };
      const score = evidence.raw ? Math.min(100, Math.round(evidence.absolute * 0.65 + (maxHeatRaw ? evidence.raw / maxHeatRaw * 100 : 0) * 0.35)) : 0;
      return heatLevel(score, evidence.recentPaperCount);
    })(),
    recentPaperCount: heatByTrack.get(row.id)?.recentPaperCount || 0,
    buildStatus: row.expansion_count < 0 ? "queued" : "ready",
    intelligence: parseStoredIntelligence(row),
    updatedAt: row.updated_at,
    papers: papersByTrack.get(row.id) || [],
  }));
  const edges: ResearchTrackEdge[] = edgesResult.results.map((row) => ({
    id: row.id,
    sourceTrackId: row.source_track_id,
    targetTrackId: row.target_track_id,
    kind: row.kind,
    relationshipZh: row.relationship_zh,
    relationshipEn: row.relationship_en,
    strength: row.strength,
  }));
  const needsStructure = tracks.length > 1 && !edges.length;
  const pendingTrackIds = tracks.filter((track) => track.buildStatus === "queued").map((track) => track.id);
  const intelligenceEligibleTracks = tracks.filter((track) => track.buildStatus === "ready" && track.papers.length > 0);
  const pendingIntelligenceTrackIds = intelligenceEligibleTracks.filter((track) => !track.intelligence).map((track) => track.id);
  return {
    tracks,
    edges,
    model: MODEL,
    generated: tracks.length > 0,
    needsStructure,
    buildProgress: { ready: tracks.length - pendingTrackIds.length, total: tracks.length, pendingTrackIds },
    intelligenceProgress: { ready: intelligenceEligibleTracks.length - pendingIntelligenceTrackIds.length, total: intelligenceEligibleTracks.length, pendingTrackIds: pendingIntelligenceTrackIds },
    ...extra,
  } satisfies ResearchMapState & Record<string, unknown>;
}

export async function GET(request: Request) {
  const spaceId = new URL(request.url).searchParams.get("spaceId")?.trim() || "";
  if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
  try {
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    return Response.json(await readMap(context.database, context.space.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load the research map" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { spaceId?: string; action?: "initialize" | "hydrate" | "expand" | "interpret" | "structure" | "activity"; trackId?: string; activityKind?: "paper_opened" | "track_opened" };
    const spaceId = payload.spaceId?.trim() || "";
    if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    const { database, space, user } = context;
    const workspaceId = user.userId.replace(/^anonymous:/, "");
    const memory = await importedMemory(database, space.id);

    if (payload.action === "activity") {
      const weight = payload.activityKind === "paper_opened" ? 2 : 1;
      await database.prepare("UPDATE research_tracks SET interaction_score = MIN(35, interaction_score + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
        .bind(weight, payload.trackId?.trim() || "", space.id).run();
      return Response.json(await readMap(database, space.id));
    }

    if (payload.action === "structure") {
      await structureExistingTracks(database, workspaceId, space, memory);
      return Response.json(await readMap(database, space.id, { structured: true }));
    }

    if ((payload.action || "initialize") === "initialize") {
      const existing = await database.prepare("SELECT COUNT(*) AS count FROM research_tracks WHERE space_id = ?").bind(space.id).first<{ count: number }>();
      if ((existing?.count || 0) > 0) return Response.json(await readMap(database, space.id, { cached: true, addedCount: 0 }));
      const generated = await generateDirections(database, workspaceId, space, memory);
      const directions = generated.directions;
      if (directions.length < 3) throw new Error("DeepSeek Pro did not return enough distinct research directions");
      const trackIdByKey = new Map<string, string>();
      for (const direction of directions) trackIdByKey.set(direction.key, crypto.randomUUID());
      const outlineStatements = directions.map((direction, position) => database.prepare(
          "INSERT INTO research_tracks (id, space_id, title_zh, title_en, summary_zh, summary_en, search_queries, position, expansion_count, user_role, depth_score, support_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, -1, ?, ?, ?)",
        ).bind(trackIdByKey.get(direction.key), space.id, direction.titleZh, direction.titleEn, direction.summaryZh, direction.summaryEn, JSON.stringify(direction.searchQueries), position,
          direction.userRole, direction.depthScore, direction.supportScore));
      for (const relationship of generated.relationships) {
        const sourceId = trackIdByKey.get(directions[relationship.sourceIndex]?.key || "");
        const targetId = trackIdByKey.get(directions[relationship.targetIndex]?.key || "");
        if (!sourceId || !targetId) continue;
        outlineStatements.push(database.prepare(
          "INSERT OR IGNORE INTO research_track_edges (id, space_id, source_track_id, target_track_id, kind, relationship_zh, relationship_en, strength) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), space.id, sourceId, targetId, relationship.kind, relationship.relationshipZh, relationship.relationshipEn, relationship.strength));
      }
      await database.batch(outlineStatements);
      return Response.json(await readMap(database, space.id, { cached: false, addedCount: 0, outlineReady: true }));
    }

    const hydrating = payload.action === "hydrate";
    const trackId = payload.trackId?.trim() || "";
    const track = await database.prepare(
      "SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, user_role, depth_score, support_score, interaction_score, intelligence_json, intelligence_model, intelligence_updated_at, updated_at FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1",
    ).bind(trackId, space.id).first<TrackRow>();
    if (!track) return Response.json({ error: "Research direction not found" }, { status: 404 });
    if (hydrating && track.expansion_count >= 0) return Response.json(await readMap(database, space.id, { cached: true, addedCount: 0 }));
    const queries = parseJsonArray(track.search_queries);
    if (!queries.length) throw new Error("This direction has no usable discovery queries");
    const direction: DirectionDraft = {
      key: track.id,
      titleZh: track.title_zh,
      titleEn: track.title_en,
      summaryZh: track.summary_zh,
      summaryEn: track.summary_en,
      searchQueries: queries,
      userRole: track.user_role,
      depthScore: track.depth_score,
      supportScore: track.support_score,
    };
    const existing = await database.prepare("SELECT canonical_id, title, authors, venue, published_at, citation_count, role, summary_zh, summary_en, rationale_zh, rationale_en FROM research_track_papers WHERE track_id = ? ORDER BY position")
      .bind(track.id).all<ExistingPaperEvidence>();
    const existingEvidence = existing.results.map((item) => ({
      canonicalId: item.canonical_id, title: item.title, authors: item.authors, venue: item.venue, publishedAt: item.published_at,
      citations: item.citation_count, role: item.role, summaryZh: item.summary_zh, summaryEn: item.summary_en, rationaleZh: item.rationale_zh, rationaleEn: item.rationale_en,
    }));
    if (payload.action === "interpret") {
      const intelligence = await interpretDirection(database, workspaceId, space, memory, track, existingEvidence);
      if (!intelligence) return Response.json({ error: "This direction does not yet have enough accepted evidence for a grounded assessment" }, { status: 422 });
      await saveDirectionIntelligence(database, space.id, track.id, intelligence);
      return Response.json(await readMap(database, space.id, { interpretedTrackId: track.id }));
    }
    const offset = hydrating ? 0 : ((track.expansion_count + 1) * 16) % 608;
    let candidates = await discoverCandidates([direction], offset, hydrating ? 14 : 16);
    const existingIds = new Set(existing.results.map((row) => row.canonical_id));
    candidates = candidates.filter((item) => !existingIds.has(item.canonicalId));
    const reviewed = candidates.length ? await selectPapers(
      database,
      workspaceId,
      space,
      memory,
      [direction],
      candidates,
      hydrating ? "initialize" : "expand",
      existingEvidence.map((item) => ({ canonicalId: item.canonicalId, title: item.title, publishedAt: item.publishedAt, role: item.role, summaryEn: item.summaryEn, rationaleEn: item.rationaleEn })),
    ) : { selections: [], intelligence: [] };
    const selections = reviewed.selections;
    const candidateById = new Map(candidates.map((item) => [item.canonicalId, item]));
    const inserted = new Set<string>();
    let position = existing.results.length;
    let addedCount = 0;
    for (const selection of selections) {
      const candidate = candidateById.get(selection.canonicalId);
      if (!candidate || inserted.has(selection.canonicalId)) continue;
      inserted.add(selection.canonicalId);
      await database.prepare(
        `INSERT OR IGNORE INTO research_track_papers
         (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role, summary_zh, summary_en, rationale_zh, rationale_en, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), track.id, space.id, candidate.canonicalId, candidate.doi, candidate.title, candidate.authors, candidate.venue,
        candidate.url, candidate.publishedAt, candidate.citationCount, selection.role, selection.summaryZh, selection.summaryEn,
        selection.rationaleZh, selection.rationaleEn, position++).run();
      addedCount += 1;
    }
    if (hydrating) {
      await database.prepare("UPDATE research_tracks SET expansion_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?").bind(track.id, space.id).run();
    } else {
      await database.prepare("UPDATE research_tracks SET expansion_count = expansion_count + 1, interaction_score = MIN(35, interaction_score + 5), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
        .bind(track.id, space.id).run();
    }
    await saveDirectionIntelligence(database, space.id, track.id, reviewed.intelligence[0] || null);
    return Response.json(await readMap(database, space.id, { cached: false, addedCount, hydratedTrackId: hydrating ? track.id : null }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to build the research map" }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { spaceId?: string; trackId?: string; userRole?: ResearchDirectionRole };
    const spaceId = payload.spaceId?.trim() || "";
    const trackId = payload.trackId?.trim() || "";
    if (!spaceId || !trackId || !DIRECTION_ROLES.has(payload.userRole as ResearchDirectionRole)) {
      return Response.json({ error: "spaceId, trackId, and a valid userRole are required" }, { status: 400 });
    }
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    await context.database.prepare("UPDATE research_tracks SET user_role = ?, interaction_score = MIN(35, interaction_score + 3), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
      .bind(payload.userRole, trackId, context.space.id).run();
    return Response.json(await readMap(context.database, context.space.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update the research direction" }, { status: 500 });
  }
}
