import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";
import { enqueueMonitorCandidates } from "../../../lib/monitor-candidate-queue";
import { readPreferenceSignals } from "../../../lib/preference-memory";
import { researchPaperCoverageHash, researchPaperSetRevision, selectResearchPaperCoverage, type ResearchDirectionIntelligence, type ResearchDirectionRole, type ResearchHeatLevel, type ResearchMapState, type ResearchPaperCoverageCandidate, type ResearchPaperEdge, type ResearchPaperEdgeKind, type ResearchTrack, type ResearchTrackEdge, type ResearchTrackPaper, type ResearchTrackRole } from "../../../lib/research-map";
import { reconcileConfirmedResearchMapEvidence, researchEvidenceHorizon } from "../../../lib/research-map-evidence";
import { fetchSemanticScholar } from "../../../lib/semantic-scholar";

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
  created_at?: string;
  provenance: "system_curated" | "user_confirmed";
};
type PaperEdgeRow = {
  id: string;
  source_paper_id: string;
  target_paper_id: string;
  kind: ResearchPaperEdgeKind;
  relation_kind: string;
  relationship_zh: string;
  relationship_en: string;
  confidence: number;
  evidence_source: string;
};
type PaperNetworkStateRow = {
  status: "idle" | "building" | "ready" | "partial" | "error";
  built_paper_count: number;
  model: string;
  sources_json: string;
  error: string | null;
  updated_at: string;
};
type StoredPaperNetworkCoverage = {
  totalPaperCount: number;
  paperRevision: string;
  coveredPaperIds: string[];
  coveredPaperHash: string;
  coverageRevision: number;
  cursor: number;
  nextCursor: number;
};
type StoredPaperNetworkState = {
  sources: string[];
  coverage: StoredPaperNetworkCoverage | null;
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
  provenance: "system_curated" | "user_confirmed";
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
type TrackEvidenceCountRow = { track_id: string; confirmed_count: number; pending_count: number };
type TrackReviewQueueCountRow = {
  track_id: string;
  queued_count: number;
  reviewing_count: number;
  recommended_count: number;
  last_queued_at: string | null;
};
type TrackLatestChangeRow = {
  track_id: string;
  kind: string;
  title_zh: string;
  title_en: string;
  summary_zh: string;
  summary_en: string;
  confidence: number;
  created_at: string;
};
type DirectionIntelligenceDraft = {
  directionKey: string;
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
};
type PaperNetworkEdgeDraft = {
  sourcePaperId: string;
  targetPaperId: string;
  kind: "semantic" | "path";
  relationKind: string;
  relationshipZh: string;
  relationshipEn: string;
  confidence: number;
};
type SemanticScholarPaper = {
  paperId?: string;
  externalIds?: { DOI?: string } | null;
  references?: Array<{ paperId?: string; externalIds?: { DOI?: string } | null }> | null;
};
type DeepSeekResponse = {
  choices?: Array<{ finish_reason?: string | null; message?: { content?: string | null; reasoning_content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};
type DeepSeekJsonFailureKind = "empty" | "truncated" | "invalid_json";
type DeepSeekCallOptions = { reasoningEffort?: "low" | "medium" | "high" };

class DeepSeekJsonResponseError extends Error {
  readonly kind: DeepSeekJsonFailureKind;
  readonly finishReason: string;

  constructor(kind: DeepSeekJsonFailureKind, finishReason: string, cause?: unknown) {
    const detail = kind === "empty" ? "an empty JSON response" : kind === "truncated" ? "truncated JSON" : "invalid JSON";
    super(`DeepSeek Pro returned ${detail} (finish: ${finishReason})`, cause === undefined ? undefined : { cause });
    this.name = "DeepSeekJsonResponseError";
    this.kind = kind;
    this.finishReason = finishReason;
  }
}

const MODEL = "deepseek-v4-pro";
const NETWORK_MODEL = "deepseek-v4-pro+coupling-v2";
const PAPER_TYPES = new Set(["journal-article", "proceedings-article", "posted-content"]);
const NON_PAPER_PHRASES = /(publication information|information for authors|instructions for authors|table of contents|editorial board|front matter|back matter|issue information|journal masthead|correction|erratum)/i;
const ROLES = new Set<ResearchTrackRole>(["foundation", "milestone", "frontier"]);
const DIRECTION_ROLES = new Set<ResearchDirectionRole>(["core", "support", "explore"]);
const EDGE_KINDS = new Set(["builds_on", "bridges", "supports"]);
const PAPER_RELATION_KINDS = new Set(["extends", "challenges", "applies", "unifies", "bridges", "reframes", "prepares", "advances"]);
const NETWORK_PAPER_LIMIT = 40;
const GLOBAL_DAILY_LIMIT = 240;
const WORKSPACE_DAILY_LIMIT = 32;

function cleanText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function extractCompleteJsonObject(value: string) {
  const unfenced = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = unfenced.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < unfenced.length; index += 1) {
    const character = unfenced[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return unfenced.slice(start, index + 1);
    }
  }
  return "";
}

function parseDeepSeekJsonPayload<T>(content: string, finishReason: string) {
  const normalizedFinishReason = cleanText(finishReason || "unknown").toLowerCase() || "unknown";
  if (!content.trim()) throw new DeepSeekJsonResponseError(normalizedFinishReason === "length" ? "truncated" : "empty", normalizedFinishReason);
  if (normalizedFinishReason === "length") throw new DeepSeekJsonResponseError("truncated", normalizedFinishReason);
  const candidate = extractCompleteJsonObject(content);
  if (!candidate) throw new DeepSeekJsonResponseError("invalid_json", normalizedFinishReason);
  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    throw new DeepSeekJsonResponseError("invalid_json", normalizedFinishReason, error);
  }
}

function isRetryableDeepSeekJsonError(error: unknown): error is DeepSeekJsonResponseError {
  return error instanceof DeepSeekJsonResponseError
    && (error.kind === "empty" || error.kind === "truncated" || error.kind === "invalid_json");
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

function parseStoredPaperNetworkState(value: string): StoredPaperNetworkState {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return { sources: parsed.filter((item): item is string => typeof item === "string"), coverage: null };
    if (!parsed || typeof parsed !== "object") return { sources: [], coverage: null };
    const record = parsed as Record<string, unknown>;
    const rawCoverage = record.coverage && typeof record.coverage === "object" ? record.coverage as Record<string, unknown> : null;
    const coveredPaperIds = rawCoverage && Array.isArray(rawCoverage.coveredPaperIds)
      ? rawCoverage.coveredPaperIds.filter((item): item is string => typeof item === "string").slice(0, NETWORK_PAPER_LIMIT)
      : [];
    const paperRevision = rawCoverage && typeof rawCoverage.paperRevision === "string" ? rawCoverage.paperRevision : "";
    const coverage: StoredPaperNetworkCoverage | null = rawCoverage ? {
      totalPaperCount: Math.max(0, Number(rawCoverage.totalPaperCount) || 0),
      paperRevision,
      coveredPaperIds,
      coveredPaperHash: typeof rawCoverage.coveredPaperHash === "string" ? rawCoverage.coveredPaperHash : researchPaperCoverageHash(coveredPaperIds),
      coverageRevision: Math.max(0, Number(rawCoverage.coverageRevision) || 0),
      cursor: Math.max(0, Number(rawCoverage.cursor) || 0),
      nextCursor: Math.max(0, Number(rawCoverage.nextCursor) || 0),
    } : null;
    return {
      sources: Array.isArray(record.sources) ? record.sources.filter((item): item is string => typeof item === "string") : [],
      coverage: coverage?.paperRevision ? coverage : null,
    };
  } catch {
    return { sources: [], coverage: null };
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
    evidenceGapZh: cleanText(item.evidenceGapZh || "").slice(0, 650),
    evidenceGapEn: cleanText(item.evidenceGapEn || "").slice(0, 900),
    nextSearchQuery: cleanText(item.nextSearchQuery || "").slice(0, 300),
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
      evidenceGapZh: cleanText(parsed.evidenceGapZh || "").slice(0, 650), evidenceGapEn: cleanText(parsed.evidenceGapEn || "").slice(0, 900),
      nextSearchQuery: cleanText(parsed.nextSearchQuery || "").slice(0, 300),
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
  const [rows, preferenceSignals] = await Promise.all([
    database.prepare("SELECT analysis_json FROM research_imports WHERE space_id = ? AND status = 'confirmed' ORDER BY confirmed_at DESC LIMIT 5")
      .bind(spaceId).all<{ analysis_json: string }>(),
    readPreferenceSignals(database, spaceId, 24),
  ]);
  const memory: string[] = [];
  for (const row of rows.results) {
    try {
      const item = JSON.parse(row.analysis_json) as { summaryEn?: string; searchTerms?: string[]; interests?: Array<{ labelEn?: string }>; openQuestions?: Array<{ labelEn?: string }> };
      memory.push(item.summaryEn || "", ...(item.searchTerms || []), ...(item.interests || []).map((entry) => entry.labelEn || ""), ...(item.openQuestions || []).map((entry) => entry.labelEn || ""));
    } catch {
      // A malformed historical profile should not prevent a map refresh.
    }
  }
  memory.push(...preferenceSignals.map((signal) => `${signal.layer} ${signal.kind}: ${signal.labelEn}${signal.evidence ? ` — ${signal.evidence}` : ""}`));
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

async function callDeepSeek<T>(database: D1Database, workspaceId: string, system: string, prompt: string, maxTokens: number, apiKey: string, options: DeepSeekCallOptions = {}) {
  if (!apiKey) throw new Error("DeepSeek Pro is required to build the research map");
  const date = new Date().toISOString().slice(0, 10);
  const workspaceScope = "research-map-workspace:" + workspaceId;
  const [globalCount, workspaceCount] = await Promise.all([
    usageCount(database, "research-map:global", date),
    usageCount(database, workspaceScope, date),
  ]);
  if (globalCount >= GLOBAL_DAILY_LIMIT || workspaceCount >= WORKSPACE_DAILY_LIMIT) throw new Error("Research-map analysis budget reached for today");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      thinking: { type: "enabled" },
      reasoning_effort: options.reasoningEffort || "high",
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  const data = await response.json() as DeepSeekResponse;
  if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro research-map analysis failed");
  await Promise.all([
    recordUsage(database, "research-map:global", date, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
    recordUsage(database, workspaceScope, date, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
  ]);
  const choice = data.choices?.[0];
  return parseDeepSeekJsonPayload<T>(choice?.message?.content || "", choice?.finish_reason || "unknown");
}

async function generateDirections(database: D1Database, workspaceId: string, space: SpaceRow, memory: string, apiKey: string) {
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
      `Research memory and preference evidence: ${memory || "none"}`,
    ].join("\n"),
    8000,
    apiKey,
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
  apiKey: string,
  existingEvidence: Array<{ canonicalId: string; title: string; publishedAt: string | null; role: ResearchTrackRole; summaryEn: string; rationaleEn: string; provenance: "system_curated" | "user_confirmed" }> = [],
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
      "Each directionIntelligence item needs directionKey, assessmentZh/En, opportunityZh/En, watchSignalZh/En, evidenceGapZh/En, nextSearchQuery, confidence (0-100), and evidenceCanonicalIds (1-6 exact IDs from supplied candidates or existing accepted papers).",
      "Assessment must synthesize the direction's current intellectual state or unresolved tension. Opportunity must propose one concrete high-value research move for this user. Watch signal must name an observable result, method, benchmark, theorem, or shift that would change the assessment.",
      "Evidence gap must identify what the current route cannot yet establish, and nextSearchQuery must be one concise English scholarly query designed to close that exact gap.",
      "Ground every intelligence statement in the supplied evidence. If metadata is incomplete, say what is uncertain and lower confidence. Do not present inference as a paper's stated result.",
      mode === "initialize" ? "Choose 5-8 papers per direction with coverage across all three roles." : "Choose 3-6 genuinely additive papers for this direction; do not fill a quota with weak records.",
      "Foundation = field-defining concepts or methods; milestone = a decisive development or branch point; frontier = a recent representative work that shows the current direction.",
      "Reject publication information, mastheads, editorials, corrections, calls for papers, vague matches, and records whose title/abstract do not establish a substantive research paper.",
      "Citation count is a noisy signal, not proof. Prefer intellectual representativeness and direct fit. A famous paper outside the exact direction must be rejected.",
      "Summary must explain the paper's question, approach, and evidenced contribution. Rationale must explain why it occupies this exact position in the development route. Never invent results not supported by metadata.",
      `Research space: ${space.name} — ${space.description}`,
      `Research memory and preference evidence: ${memory || "none"}`,
      `Directions: ${JSON.stringify(directions)}`,
      "Existing route papers include provenance. system_curated means Pi selected the paper as useful context; user_confirmed alone means the user accepted it as formal evidence.",
      `Existing route papers: ${JSON.stringify(existingEvidence)}`,
      `Candidate records: ${JSON.stringify(compact)}`,
    ].join("\n"),
    20000,
    apiKey,
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
  evidence: Array<{ canonicalId: string; title: string; authors: string; venue: string; publishedAt: string | null; citations: number; role: ResearchTrackRole; summaryZh: string; summaryEn: string; rationaleZh: string; rationaleEn: string; provenance: "system_curated" | "user_confirmed" }>,
  apiKey: string,
) {
  if (!evidence.length) return null;
  const parsed = await callDeepSeek<{ directionIntelligence?: Partial<DirectionIntelligenceDraft> }>(
    database,
    workspaceId,
    "You are Pi Research's senior research-strategy analyst. Produce a rigorous, evidence-grounded bilingual direction assessment and return strict JSON.",
    [
      "Return {\"directionIntelligence\":{directionKey, assessmentZh, assessmentEn, opportunityZh, opportunityEn, watchSignalZh, watchSignalEn, evidenceGapZh, evidenceGapEn, nextSearchQuery, confidence, evidenceCanonicalIds}}.",
      "Assessment: synthesize the direction's current intellectual state and the most important unresolved tension; do not merely summarize titles.",
      "Opportunity: give one concrete, high-value next research move tailored to the user's confirmed memory, depth, and open questions.",
      "Watch signal: name a specific observable theorem, method, empirical result, benchmark shift, or new connection that would materially change the assessment.",
      "Evidence gap: identify the most consequential claim or branch that the available route papers still cannot support. nextSearchQuery: provide one concise English scholarly query that targets the missing evidence.",
      "Use 2-6 exact evidenceCanonicalIds from supplied route papers. Treat system_curated papers as provisional context and user_confirmed papers as formal user evidence. Never describe system-curated material as user accepted. Distinguish metadata-supported statements from your synthesis, state uncertainty, and lower confidence when abstracts or evidence are sparse.",
      `Research space: ${space.name} — ${space.description}`,
      `Research memory and preference evidence: ${memory || "none"}`,
      `Direction: ${JSON.stringify({ id: track.id, titleZh: track.title_zh, titleEn: track.title_en, summaryZh: track.summary_zh, summaryEn: track.summary_en, userRole: track.user_role, depthScore: track.depth_score + track.interaction_score, supportScore: track.support_score })}`,
      `Route evidence papers: ${JSON.stringify(evidence)}`,
    ].join("\n"),
    7000,
    apiKey,
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
    provenance: row.provenance,
  };
}

function toPaperEdge(row: PaperEdgeRow): ResearchPaperEdge {
  return {
    id: row.id,
    sourcePaperId: row.source_paper_id,
    targetPaperId: row.target_paper_id,
    kind: row.kind,
    relationKind: row.relation_kind,
    relationshipZh: row.relationship_zh,
    relationshipEn: row.relationship_en,
    confidence: row.confidence,
    evidenceSource: row.evidence_source,
  };
}

function uniqueNetworkPapers(rows: TrackPaperRow[]) {
  const unique = new Map<string, TrackPaperRow>();
  for (const row of rows) {
    const previous = unique.get(row.canonical_id);
    if (!previous || (!previous.doi && row.doi) || row.citation_count > previous.citation_count) unique.set(row.canonical_id, row);
  }
  return Array.from(unique.values());
}

function toCoverageCandidate(row: TrackPaperRow): ResearchPaperCoverageCandidate {
  return {
    id: row.id,
    canonicalId: row.canonical_id,
    trackId: row.track_id,
    publishedAt: row.published_at,
    createdAt: row.created_at || null,
    citationCount: row.citation_count,
    role: row.role,
  };
}

async function fetchScholarlyEdges(database: D1Database, spaceId: string, papers: TrackPaperRow[]) {
  const eligible = papers.filter((paper) => paper.doi).slice(0, NETWORK_PAPER_LIMIT);
  if (eligible.length < 2) return { edges: [] as Array<Omit<ResearchPaperEdge, "id">>, coveredPaperIds: [] as string[] };
  const endpoint = new URL("https://api.semanticscholar.org/graph/v1/paper/batch");
  endpoint.searchParams.set("fields", "paperId,externalIds,references.paperId,references.externalIds");
  const options: RequestInit = {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
    body: JSON.stringify({ ids: eligible.map((paper) => "DOI:" + paper.doi) }),
    signal: AbortSignal.timeout(24_000),
  };
  const response = await fetchSemanticScholar(endpoint, options, {
    database,
    spaceId,
    scopeKey: `research-map:verified:${researchPaperCoverageHash(eligible.map((paper) => paper.id))}`,
    feature: "research-map",
    featureDailyLimit: 48,
  });
  if (!response.ok) throw new Error(`Semantic Scholar returned ${response.status}`);
  const results = await response.json() as Array<SemanticScholarPaper | null>;
  const doiToPaperId = new Map(eligible.map((paper) => [paper.doi!.toLocaleLowerCase(), paper.id]));
  const referencesByPaper = new Map<string, Set<string>>();
  const coveredPaperIds: string[] = [];
  const unique = new Map<string, Omit<ResearchPaperEdge, "id">>();
  results.forEach((result, index) => {
    const source = eligible[index];
    if (!source || !result?.references) return;
    coveredPaperIds.push(source.id);
    const referenceKeys = new Set<string>();
    for (const reference of result.references) {
      const doi = reference.externalIds?.DOI?.trim().toLocaleLowerCase();
      const referenceKey = doi ? `doi:${doi}` : reference.paperId ? `s2:${reference.paperId}` : "";
      if (referenceKey) referenceKeys.add(referenceKey);
      const targetPaperId = doi ? doiToPaperId.get(doi) : null;
      if (!targetPaperId || targetPaperId === source.id) continue;
      const key = source.id + ":" + targetPaperId;
      unique.set(key, {
        sourcePaperId: source.id,
        targetPaperId,
        kind: "citation",
        relationKind: "cites",
        relationshipZh: "该论文的参考文献中包含目标论文。",
        relationshipEn: "The source paper includes the target paper in its references.",
        confidence: 100,
        evidenceSource: "semantic-scholar",
      });
      if (unique.size >= 60) break;
    }
    referencesByPaper.set(source.id, referenceKeys);
  });
  const similarityCandidates: Array<{ edge: Omit<ResearchPaperEdge, "id">; score: number }> = [];
  for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
    const left = eligible[leftIndex];
    const leftReferences = referencesByPaper.get(left.id) || new Set<string>();
    if (leftReferences.size < 2) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < eligible.length; rightIndex += 1) {
      const right = eligible[rightIndex];
      const rightReferences = referencesByPaper.get(right.id) || new Set<string>();
      if (rightReferences.size < 2) continue;
      let shared = 0;
      for (const key of leftReferences) if (rightReferences.has(key)) shared += 1;
      if (shared < 2) continue;
      const coupling = shared / Math.sqrt(leftReferences.size * rightReferences.size);
      if (coupling < 0.055) continue;
      const confidence = Math.min(98, Math.max(42, Math.round(coupling * 100 + Math.min(18, shared * 2))));
      similarityCandidates.push({
        score: coupling,
        edge: {
          sourcePaperId: left.id,
          targetPaperId: right.id,
          kind: "similarity",
          relationKind: "bibliographic_coupling",
          relationshipZh: `两篇论文共享 ${shared} 篇可核验参考文献，呈现较强的文献耦合关系。`,
          relationshipEn: `The papers share ${shared} verifiable references, indicating a meaningful bibliographic-coupling relationship.`,
          confidence,
          evidenceSource: "semantic-scholar",
        },
      });
    }
  }
  const similarityDegree = new Map<string, number>();
  for (const candidate of similarityCandidates.sort((left, right) => right.score - left.score)) {
    const sourceDegree = similarityDegree.get(candidate.edge.sourcePaperId) || 0;
    const targetDegree = similarityDegree.get(candidate.edge.targetPaperId) || 0;
    if (sourceDegree >= 5 || targetDegree >= 5) continue;
    unique.set(`${candidate.edge.sourcePaperId}:${candidate.edge.targetPaperId}:similarity`, candidate.edge);
    similarityDegree.set(candidate.edge.sourcePaperId, sourceDegree + 1);
    similarityDegree.set(candidate.edge.targetPaperId, targetDegree + 1);
    if (similarityDegree.size && Array.from(unique.values()).filter((edge) => edge.kind === "similarity").length >= 42) break;
  }
  return { edges: Array.from(unique.values()), coveredPaperIds };
}

async function generatePaperNetworkEdges(
  database: D1Database,
  workspaceId: string,
  space: SpaceRow,
  memory: string,
  papers: TrackPaperRow[],
  citationEdges: Array<Omit<ResearchPaperEdge, "id">>,
  apiKey: string,
) {
  if (papers.length < 2) return { edges: [] as Array<Omit<ResearchPaperEdge, "id">>, coveredPaperIds: papers.map((paper) => paper.id) };
  const compact = papers.map((paper) => ({
    id: paper.id,
    trackId: paper.track_id,
    title: paper.title,
    year: paper.published_at?.slice(0, 4) || null,
    role: paper.role,
    citations: paper.citation_count,
    summary: cleanText(paper.summary_en).slice(0, 220),
    routeRationale: cleanText(paper.rationale_en).slice(0, 160),
  }));
  const requestEdges = (input: typeof compact, maxTokens: number, reasoningEffort: "low" | "medium") => {
    const inputIds = new Set(input.map((paper) => paper.id));
    return callDeepSeek<{ edges?: Array<Partial<PaperNetworkEdgeDraft>> }>(
      database,
      workspaceId,
      "You are Pi Research's evidence-disciplined scholarly network editor. Return strict JSON and never invent citation claims.",
      [
      "Return {\"edges\":[...]} using only supplied paper ids.",
      "Create up to 14 semantic edges and 4-8 path edges. Every edge needs sourcePaperId, targetPaperId, kind (semantic|path), relationKind, relationshipZh, relationshipEn, confidence (0-100).",
      "Semantic relationKind must be extends, challenges, applies, unifies, bridges, or reframes. It describes an evidence-grounded intellectual relationship, not a factual citation unless it appears in actualCitationPairs.",
      "Path relationKind must be prepares or advances. Direct path edges from earlier foundations or milestones toward the later work a researcher should read next. Build one readable backbone and only a few meaningful branches.",
      "Use the supplied summaries and route rationales. Omit uncertain relationships, avoid generic 'related work' wording, and explain the precise conceptual or methodological connection in one concise sentence per language.",
      "Do not duplicate an actual citation as a semantic edge. Do not connect papers merely because they share a direction label.",
      `Research space: ${space.name} — ${space.description}`,
      `Research memory and preference evidence: ${memory || "none"}`,
      `Papers: ${JSON.stringify(input)}`,
      `Actual citation pairs (source cites target): ${JSON.stringify(citationEdges.filter((edge) => inputIds.has(edge.sourcePaperId) && inputIds.has(edge.targetPaperId)).map((edge) => [edge.sourcePaperId, edge.targetPaperId]))}`,
      ].join("\n"),
      maxTokens,
      apiKey,
      { reasoningEffort },
    );
  };
  const reducedInput = () => {
    const buckets = new Map<string, typeof compact>();
    for (const paper of compact) buckets.set(paper.trackId, [...(buckets.get(paper.trackId) || []), paper]);
    const reduced: typeof compact = [];
    while (reduced.length < 18 && Array.from(buckets.values()).some((bucket) => bucket.length)) {
      for (const bucket of buckets.values()) {
        const paper = bucket.shift();
        if (paper) reduced.push(paper);
        if (reduced.length >= 18) break;
      }
    }
    return reduced;
  };
  const reduced = reducedInput();
  let requestedInput = compact;
  let retriedWithReducedInput = false;
  let parsed: { edges?: Array<Partial<PaperNetworkEdgeDraft>> };
  try {
    parsed = await requestEdges(compact, 6000, "medium");
  } catch (error) {
    if (!isRetryableDeepSeekJsonError(error)) throw error;
    requestedInput = reduced;
    retriedWithReducedInput = true;
    parsed = await requestEdges(reduced, 4400, "low");
  }
  if ((!(parsed.edges || []).length || !(parsed.edges || []).some((edge) => edge.kind === "path")) && !retriedWithReducedInput) {
    requestedInput = reduced;
    parsed = await requestEdges(reduced, 4400, "low");
  }
  const validIds = new Set(requestedInput.map((paper) => paper.id));
  const citationPairs = new Set(citationEdges.map((edge) => edge.sourcePaperId + ":" + edge.targetPaperId));
  const counts = { semantic: 0, path: 0 };
  const unique = new Map<string, Omit<ResearchPaperEdge, "id">>();
  for (const item of parsed.edges || []) {
    const sourcePaperId = cleanText(item.sourcePaperId || "");
    const targetPaperId = cleanText(item.targetPaperId || "");
    const kind = item.kind === "path" ? "path" : "semantic";
    if (!validIds.has(sourcePaperId) || !validIds.has(targetPaperId) || sourcePaperId === targetPaperId) continue;
    if (kind === "semantic" && citationPairs.has(sourcePaperId + ":" + targetPaperId)) continue;
    const relationKind = PAPER_RELATION_KINDS.has(String(item.relationKind)) ? String(item.relationKind) : kind === "path" ? "advances" : "extends";
    const relationshipZh = cleanText(item.relationshipZh || "").slice(0, 320);
    const relationshipEn = cleanText(item.relationshipEn || "").slice(0, 440);
    if (!relationshipZh || !relationshipEn || counts[kind] >= (kind === "semantic" ? 14 : 8)) continue;
    counts[kind] += 1;
    unique.set(`${sourcePaperId}:${targetPaperId}:${kind}:${relationKind}`, {
      sourcePaperId,
      targetPaperId,
      kind,
      relationKind,
      relationshipZh,
      relationshipEn,
      confidence: boundedScore(item.confidence, 60),
      evidenceSource: MODEL,
    });
  }
  return { edges: Array.from(unique.values()), coveredPaperIds: requestedInput.map((paper) => paper.id) };
}

type PaperNetworkBuildPhase = "all" | "verified" | "pi";

async function replacePaperNetworkEdges(
  database: D1Database,
  spaceId: string,
  kinds: ResearchPaperEdgeKind[],
  edges: Array<Omit<ResearchPaperEdge, "id">>,
  coveredPaperIds: string[],
) {
  const coveredIds = Array.from(new Set(coveredPaperIds)).slice(0, NETWORK_PAPER_LIMIT);
  const statements: D1PreparedStatement[] = [];
  if (coveredIds.length) {
    const placeholders = coveredIds.map(() => "?").join(", ");
    for (const kind of kinds) {
      statements.push(database.prepare(
        `DELETE FROM research_paper_edges
         WHERE space_id = ? AND kind = ?
           AND source_paper_id IN (${placeholders})
           AND target_paper_id IN (${placeholders})`,
      ).bind(spaceId, kind, ...coveredIds, ...coveredIds));
    }
  }
  for (const edge of edges) {
    statements.push(database.prepare(
      `INSERT INTO research_paper_edges
       (id, space_id, source_paper_id, target_paper_id, kind, relation_kind, relationship_zh, relationship_en, confidence, evidence_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_paper_id, target_paper_id, kind, relation_kind) DO UPDATE SET
         relationship_zh = excluded.relationship_zh, relationship_en = excluded.relationship_en,
         confidence = excluded.confidence, evidence_source = excluded.evidence_source`,
    ).bind(crypto.randomUUID(), spaceId, edge.sourcePaperId, edge.targetPaperId, edge.kind, edge.relationKind,
      edge.relationshipZh, edge.relationshipEn, edge.confidence, edge.evidenceSource));
  }
  if (statements.length) await database.batch(statements);
}

async function writePaperNetworkState(
  database: D1Database,
  spaceId: string,
  status: "building" | "ready" | "partial" | "error",
  paperCount: number,
  sources: string[],
  error: string | null,
  coverage: StoredPaperNetworkCoverage,
) {
  await database.prepare(
    `INSERT INTO research_paper_network_states (space_id, status, built_paper_count, model, sources_json, error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(space_id) DO UPDATE SET status = excluded.status, built_paper_count = excluded.built_paper_count,
     model = excluded.model, sources_json = excluded.sources_json, error = excluded.error, updated_at = CURRENT_TIMESTAMP`,
  ).bind(spaceId, status, paperCount, NETWORK_MODEL, JSON.stringify({
    version: 1,
    sources: Array.from(new Set(sources)),
    coverage,
  }), error).run();
}

async function rebuildPaperNetwork(
  database: D1Database,
  workspaceId: string,
  space: SpaceRow,
  memory: string,
  apiKey: string,
  force = false,
  phase: PaperNetworkBuildPhase = "all",
) {
  const [allPapers, state] = await Promise.all([
    database.prepare(
      "SELECT id, track_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role, summary_zh, summary_en, rationale_zh, rationale_en, position, created_at FROM research_track_papers WHERE space_id = ? ORDER BY (SELECT position FROM research_tracks WHERE id = research_track_papers.track_id), position, created_at",
    ).bind(space.id).all<TrackPaperRow>(),
    database.prepare("SELECT status, built_paper_count, model, sources_json, error, updated_at FROM research_paper_network_states WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<PaperNetworkStateRow>(),
  ]);
  const allUniquePapers = uniqueNetworkPapers(allPapers.results);
  const totalPaperCount = allUniquePapers.length;
  const paperRevision = researchPaperSetRevision(allPapers.results.map(toCoverageCandidate));
  const stored = state ? parseStoredPaperNetworkState(state.sources_json) : { sources: [], coverage: null };
  if (!force && phase === "all" && state?.status === "ready" && stored.coverage?.paperRevision === paperRevision && state.model === NETWORK_MODEL) return;

  const uniquePaperById = new Map(allUniquePapers.map((paper) => [paper.id, paper]));
  const resumedPaperIds = phase === "pi" && stored.coverage?.paperRevision === paperRevision
    ? stored.coverage.coveredPaperIds.filter((id) => uniquePaperById.has(id)) : [];
  const canResumeCoverage = phase === "pi" && Boolean(stored.coverage?.coveredPaperIds.length)
    && resumedPaperIds.length === stored.coverage?.coveredPaperIds.length;
  const effectivePhase: PaperNetworkBuildPhase = phase === "pi" && !canResumeCoverage ? "all" : phase;
  let coverage: StoredPaperNetworkCoverage;
  let papers: TrackPaperRow[];
  if (canResumeCoverage && stored.coverage) {
    coverage = stored.coverage;
    papers = resumedPaperIds.map((id) => uniquePaperById.get(id)).filter((paper): paper is TrackPaperRow => Boolean(paper));
  } else {
    const cursor = stored.coverage?.nextCursor || 0;
    const selection = selectResearchPaperCoverage(allUniquePapers.map(toCoverageCandidate), cursor, NETWORK_PAPER_LIMIT);
    papers = selection.paperIds.map((id) => uniquePaperById.get(id)).filter((paper): paper is TrackPaperRow => Boolean(paper));
    coverage = {
      totalPaperCount,
      paperRevision,
      coveredPaperIds: papers.map((paper) => paper.id),
      coveredPaperHash: researchPaperCoverageHash(papers.map((paper) => paper.id)),
      coverageRevision: (stored.coverage?.coverageRevision || 0) + 1,
      cursor,
      nextCursor: selection.nextCursor,
    };
  }
  const existingRows = await database.prepare(
    "SELECT id, source_paper_id, target_paper_id, kind, relation_kind, relationship_zh, relationship_en, confidence, evidence_source FROM research_paper_edges WHERE space_id = ?",
  ).bind(space.id).all<PaperEdgeRow>();
  const availablePaperIds = new Set(papers.map((paper) => paper.id));
  const cachedEdges = existingRows.results
    .filter((edge) => availablePaperIds.has(edge.source_paper_id) && availablePaperIds.has(edge.target_paper_id))
    .map((row) => {
      const edge = toPaperEdge(row);
      return {
        sourcePaperId: edge.sourcePaperId,
        targetPaperId: edge.targetPaperId,
        kind: edge.kind,
        relationKind: edge.relationKind,
        relationshipZh: edge.relationshipZh,
        relationshipEn: edge.relationshipEn,
        confidence: edge.confidence,
        evidenceSource: edge.evidenceSource,
      } satisfies Omit<ResearchPaperEdge, "id">;
    });
  const previousSources = stored.sources;
  if (effectivePhase !== "pi") await writePaperNetworkState(database, space.id, "building", totalPaperCount, previousSources, null, coverage);
  if (papers.length < 2) {
    await writePaperNetworkState(database, space.id, "ready", totalPaperCount, [], null, coverage);
    return;
  }
  let scholarlyEdges = cachedEdges.filter((edge) => edge.kind === "citation" || edge.kind === "similarity");
  let curatedEdges = cachedEdges.filter((edge) => edge.kind === "semantic" || edge.kind === "path");
  let sources = [...previousSources];
  const errors: string[] = [];

  if (effectivePhase === "all" || effectivePhase === "verified") {
    sources = sources.filter((source) => !source.startsWith("semantic-scholar"));
    try {
      const fresh = await fetchScholarlyEdges(database, space.id, papers);
      const freshEdges = fresh.edges;
      const refreshedPaperIds = fresh.coveredPaperIds;
      const refreshedIds = new Set(refreshedPaperIds);
      const cachedWithinCoverage = scholarlyEdges.filter((edge) => refreshedIds.has(edge.sourcePaperId) && refreshedIds.has(edge.targetPaperId));
      if (!freshEdges.length && cachedWithinCoverage.length) throw new Error("Semantic Scholar returned no usable paper links");
      scholarlyEdges = [
        ...scholarlyEdges.filter((edge) => !refreshedIds.has(edge.sourcePaperId) || !refreshedIds.has(edge.targetPaperId)),
        ...freshEdges,
      ];
      sources.push("semantic-scholar");
      await replacePaperNetworkEdges(database, space.id, ["citation", "similarity"], freshEdges, refreshedPaperIds);
    } catch (error) {
      errors.push(`citation: ${error instanceof Error ? error.message : "Citation lookup failed"}`);
      if (scholarlyEdges.length) sources.push("semantic-scholar-cache");
    }
    await writePaperNetworkState(database, space.id, "building", totalPaperCount, sources, errors.join("; ").slice(0, 800) || null, coverage);
    if (effectivePhase === "verified") return;
  } else if (state?.error && /citation:|semantic scholar|citation lookup/i.test(state.error)) {
    errors.push(state.error);
  }

  if (effectivePhase === "all" || effectivePhase === "pi") {
    sources = sources.filter((source) => !source.startsWith(MODEL));
    try {
      const generated = await generatePaperNetworkEdges(database, workspaceId, space, memory, papers,
        scholarlyEdges.filter((edge) => edge.kind === "citation"), apiKey);
      const freshEdges = generated.edges;
      if (!freshEdges.length) throw new Error("DeepSeek Pro returned no defensible paper relations");
      if (!freshEdges.some((edge) => edge.kind === "path")) throw new Error("DeepSeek Pro returned no defensible reading path");
      const refreshedIds = new Set(generated.coveredPaperIds);
      curatedEdges = [
        ...curatedEdges.filter((edge) => !refreshedIds.has(edge.sourcePaperId) || !refreshedIds.has(edge.targetPaperId)),
        ...freshEdges,
      ];
      sources.push(MODEL);
      await replacePaperNetworkEdges(database, space.id, ["semantic", "path"], freshEdges, generated.coveredPaperIds);
    } catch (error) {
      errors.push(`pi: ${error instanceof Error ? error.message : "Pi path analysis failed"}`);
      if (curatedEdges.length) sources.push(`${MODEL}-cache`);
    }
  }
  const allEdges = [...scholarlyEdges, ...curatedEdges];
  const status = errors.length ? (allEdges.length ? "partial" : "error") : "ready";
  await writePaperNetworkState(database, space.id, status, totalPaperCount, sources, errors.join("; ").slice(0, 800) || null, coverage);
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

async function structureExistingTracks(database: D1Database, workspaceId: string, space: SpaceRow, memory: string, apiKey: string) {
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
    `Research memory and preference evidence: ${memory || "none"}`,
    `Existing directions: ${JSON.stringify(tracks.results.map((track) => ({ id: track.id, titleZh: track.title_zh, titleEn: track.title_en, summaryZh: track.summary_zh, summaryEn: track.summary_en, paperCountHint: track.expansion_count, searchQueries: parseJsonArray(track.search_queries) })))}`,
  ].join("\n"), 10000, apiKey);
  const validIds = new Set(tracks.results.map((track) => track.id));
  for (const profile of parsed.profiles || []) {
    const trackId = cleanText(profile.trackId || "");
    if (!validIds.has(trackId)) continue;
    const userRole = DIRECTION_ROLES.has(profile.userRole as ResearchDirectionRole) ? profile.userRole as ResearchDirectionRole : "explore";
    await database.prepare("UPDATE research_tracks SET user_role = ?, depth_score = ?, support_score = ?, intelligence_json = '{}', intelligence_model = '', intelligence_updated_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
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
  const [tracksResult, papersResult, edgesResult, paperEdgesResult, paperNetworkState, evidenceCountsResult, latestChangesResult, reviewQueueCountsResult] = await Promise.all([
    database.prepare("SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, user_role, depth_score, support_score, interaction_score, intelligence_json, intelligence_model, intelligence_updated_at, updated_at FROM research_tracks WHERE space_id = ? ORDER BY position, created_at")
      .bind(spaceId).all<TrackRow>(),
    database.prepare(
      `SELECT tp.id, tp.track_id, tp.canonical_id, tp.doi, tp.title, tp.authors, tp.venue, tp.url,
       tp.published_at, tp.citation_count, tp.role, tp.summary_zh, tp.summary_en, tp.rationale_zh,
       tp.rationale_en, tp.position, tp.created_at,
       CASE WHEN EXISTS (
        SELECT 1 FROM research_map_evidence_proposals ep
        JOIN monitored_papers mp ON mp.id = ep.paper_id AND mp.space_id = ep.space_id
        WHERE ep.space_id = tp.space_id AND ep.track_id = tp.track_id
         AND mp.canonical_id = tp.canonical_id AND ep.status = 'confirmed'
       ) THEN 'user_confirmed' ELSE 'system_curated' END AS provenance
       FROM research_track_papers tp WHERE tp.space_id = ? ORDER BY tp.position, tp.created_at`,
    )
      .bind(spaceId).all<TrackPaperRow>(),
    database.prepare("SELECT id, source_track_id, target_track_id, kind, relationship_zh, relationship_en, strength FROM research_track_edges WHERE space_id = ? ORDER BY strength DESC, created_at")
      .bind(spaceId).all<TrackEdgeRow>(),
    database.prepare("SELECT id, source_paper_id, target_paper_id, kind, relation_kind, relationship_zh, relationship_en, confidence, evidence_source FROM research_paper_edges WHERE space_id = ? ORDER BY kind, confidence DESC, created_at")
      .bind(spaceId).all<PaperEdgeRow>(),
    database.prepare("SELECT status, built_paper_count, model, sources_json, error, updated_at FROM research_paper_network_states WHERE space_id = ? LIMIT 1")
      .bind(spaceId).first<PaperNetworkStateRow>(),
    database.prepare(
      `SELECT track_id,
       SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count
       FROM research_map_evidence_proposals
       WHERE space_id = ? AND status IN ('confirmed', 'pending') GROUP BY track_id`,
    ).bind(spaceId).all<TrackEvidenceCountRow>(),
    database.prepare(
      `SELECT track_id, kind, title_zh, title_en, summary_zh, summary_en, confidence, created_at
       FROM (
        SELECT track_id, kind, title_zh, title_en, summary_zh, summary_en, confidence, created_at,
         ROW_NUMBER() OVER (PARTITION BY track_id ORDER BY created_at DESC, rowid DESC) AS change_rank
        FROM research_map_changes WHERE space_id = ?
       ) WHERE change_rank = 1`,
    ).bind(spaceId).all<TrackLatestChangeRow>(),
    database.prepare(
      `WITH queue_counts AS (
        SELECT coverage.route_id AS track_id,
         COUNT(DISTINCT CASE WHEN i.analysis_source = 'metadata' OR i.analysis_model = '' THEN cs.paper_id END) AS queued_count,
         COUNT(DISTINCT CASE WHEN i.analysis_source = 'deepseek_screened' THEN cs.paper_id END) AS reviewing_count,
         MAX(cs.last_seen_at) AS last_queued_at
        FROM monitor_candidate_sources cs
        JOIN monitored_papers p ON p.id = cs.paper_id AND p.space_id = cs.space_id
        JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
        JOIN monitor_discovery_coverage coverage ON coverage.space_id = cs.space_id AND coverage.horizon = p.horizon
         AND coverage.source_key = cs.source_key AND coverage.query_key = cs.query_key
        WHERE cs.space_id = ? AND coverage.route_id IS NOT NULL AND cs.source_key LIKE 'research-route:%'
        GROUP BY coverage.route_id
       ), latest_recommended AS (
        SELECT * FROM (
         SELECT audit.*,
          ROW_NUMBER() OVER (PARTITION BY audit.space_id, audit.paper_id ORDER BY audit.reviewed_at DESC, audit.rowid DESC) AS audit_rank
         FROM recommendation_audit_events audit
         WHERE audit.space_id = ?
        ) WHERE audit_rank = 1 AND recommended = 1
       ), recommended_counts AS (
        SELECT json_extract(origin.value, '$.routeId') AS track_id,
         COUNT(DISTINCT audit.paper_id) AS recommended_count
        FROM latest_recommended audit
        JOIN json_each(audit.provenance_json) origin
        WHERE json_extract(origin.value, '$.routeId') IS NOT NULL
         AND json_extract(origin.value, '$.originKind') IN
          ('route_foundation', 'route_milestone', 'route_frontier', 'route_gap', 'route_network')
        GROUP BY json_extract(origin.value, '$.routeId')
       ), track_ids AS (
        SELECT track_id FROM queue_counts UNION SELECT track_id FROM recommended_counts
       )
       SELECT track_ids.track_id,
        COALESCE(queue_counts.queued_count, 0) AS queued_count,
        COALESCE(queue_counts.reviewing_count, 0) AS reviewing_count,
        COALESCE(recommended_counts.recommended_count, 0) AS recommended_count,
        queue_counts.last_queued_at
       FROM track_ids
       LEFT JOIN queue_counts ON queue_counts.track_id = track_ids.track_id
       LEFT JOIN recommended_counts ON recommended_counts.track_id = track_ids.track_id`,
    ).bind(spaceId, spaceId).all<TrackReviewQueueCountRow>(),
  ]);
  const evidenceCountsByTrack = new Map(evidenceCountsResult.results.map((row) => [row.track_id, row]));
  const reviewQueueCountsByTrack = new Map(reviewQueueCountsResult.results.map((row) => [row.track_id, row]));
  const latestChangeByTrack = new Map(latestChangesResult.results.map((row) => [row.track_id, row]));
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
    confirmedEvidenceCount: Number(evidenceCountsByTrack.get(row.id)?.confirmed_count || 0),
    pendingEvidenceCount: Number(evidenceCountsByTrack.get(row.id)?.pending_count || 0),
    queuedForReviewCount: Number(reviewQueueCountsByTrack.get(row.id)?.queued_count || 0),
    reviewingForReviewCount: Number(reviewQueueCountsByTrack.get(row.id)?.reviewing_count || 0),
    recommendedCandidateCount: Number(reviewQueueCountsByTrack.get(row.id)?.recommended_count || 0),
    lastQueuedAt: reviewQueueCountsByTrack.get(row.id)?.last_queued_at || null,
    latestChange: (() => {
      const change = latestChangeByTrack.get(row.id);
      return change ? {
        kind: change.kind,
        titleZh: change.title_zh,
        titleEn: change.title_en,
        summaryZh: change.summary_zh,
        summaryEn: change.summary_en,
        confidence: change.confidence,
        createdAt: change.created_at,
      } : null;
    })(),
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
  const paperEdges = paperEdgesResult.results.map(toPaperEdge);
  const uniquePaperCount = new Set(papersResult.results.map((paper) => paper.canonical_id)).size;
  const storedNetworkState = paperNetworkState ? parseStoredPaperNetworkState(paperNetworkState.sources_json) : { sources: [], coverage: null };
  const currentPaperRevision = researchPaperSetRevision(papersResult.results.map(toCoverageCandidate));
  const storedCoverage = storedNetworkState.coverage;
  const needsStructure = tracks.length > 1 && !edges.length;
  const pendingTrackIds = tracks.filter((track) => track.buildStatus === "queued").map((track) => track.id);
  const intelligenceEligibleTracks = tracks.filter((track) => track.buildStatus === "ready" && track.papers.length > 0);
  const pendingIntelligenceTrackIds = intelligenceEligibleTracks.filter((track) => !track.intelligence).map((track) => track.id);
  return {
    tracks,
    edges,
    paperEdges,
    paperNetwork: {
      status: paperNetworkState?.status || "idle",
      paperCount: uniquePaperCount,
      totalPaperCount: uniquePaperCount,
      builtPaperCount: paperNetworkState?.built_paper_count || 0,
      coveredPaperIds: storedCoverage?.coveredPaperIds || [],
      coveredPaperHash: storedCoverage?.coveredPaperHash || "",
      coverageRevision: storedCoverage?.coverageRevision || 0,
      coverageCursor: storedCoverage?.nextCursor || 0,
      paperRevision: currentPaperRevision,
      builtPaperRevision: storedCoverage?.paperRevision || "",
      citationEdgeCount: paperEdges.filter((edge) => edge.kind === "citation").length,
      similarityEdgeCount: paperEdges.filter((edge) => edge.kind === "similarity").length,
      semanticEdgeCount: paperEdges.filter((edge) => edge.kind === "semantic").length,
      pathEdgeCount: paperEdges.filter((edge) => edge.kind === "path").length,
      model: paperNetworkState?.model || "",
      sources: storedNetworkState.sources,
      updatedAt: paperNetworkState?.updated_at || null,
      error: paperNetworkState?.error || null,
    },
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
    const payload = await request.json() as { spaceId?: string; action?: "initialize" | "hydrate" | "expand" | "expand-gap" | "interpret" | "structure" | "activity" | "network" | "reconcile"; trackId?: string; activityKind?: "paper_opened" | "track_opened"; force?: boolean; networkPhase?: PaperNetworkBuildPhase };
    const spaceId = payload.spaceId?.trim() || "";
    if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    const { database, space, user } = context;
    const workspaceId = user.userId.replace(/^anonymous:/, "");
    const apiKey = resolveDeepSeekCredential(request).apiKey;
    const memory = await importedMemory(database, space.id);

    if (payload.action === "network") {
      const networkPhase: PaperNetworkBuildPhase = payload.networkPhase === "verified" || payload.networkPhase === "pi" ? payload.networkPhase : "all";
      await rebuildPaperNetwork(database, workspaceId, space, memory, apiKey, payload.force === true, networkPhase);
      return Response.json(await readMap(database, space.id, { networkRefreshed: true }));
    }

    if (payload.action === "reconcile") {
      const reconciled = await reconcileConfirmedResearchMapEvidence(database, space.id);
      return Response.json(await readMap(database, space.id, { reconciledCount: reconciled.changed }));
    }

    if (payload.action === "activity") {
      const weight = payload.activityKind === "paper_opened" ? 2 : 1;
      await database.prepare("UPDATE research_tracks SET interaction_score = MIN(35, interaction_score + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
        .bind(weight, payload.trackId?.trim() || "", space.id).run();
      return Response.json(await readMap(database, space.id));
    }

    if (payload.action === "structure") {
      await structureExistingTracks(database, workspaceId, space, memory, apiKey);
      return Response.json(await readMap(database, space.id, { structured: true }));
    }

    if ((payload.action || "initialize") === "initialize") {
      const existing = await database.prepare("SELECT COUNT(*) AS count FROM research_tracks WHERE space_id = ?").bind(space.id).first<{ count: number }>();
      if ((existing?.count || 0) > 0) return Response.json(await readMap(database, space.id, { cached: true, addedCount: 0 }));
      const generated = await generateDirections(database, workspaceId, space, memory, apiKey);
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
    const gapExpanding = payload.action === "expand-gap";
    const trackId = payload.trackId?.trim() || "";
    const track = await database.prepare(
      "SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, user_role, depth_score, support_score, interaction_score, intelligence_json, intelligence_model, intelligence_updated_at, updated_at FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1",
    ).bind(trackId, space.id).first<TrackRow>();
    if (!track) return Response.json({ error: "Research direction not found" }, { status: 404 });
    if (hydrating && track.expansion_count >= 0) return Response.json(await readMap(database, space.id, { cached: true, addedCount: 0 }));
    const queries = parseJsonArray(track.search_queries);
    if (!queries.length) throw new Error("This direction has no usable discovery queries");
    const gapQuery = gapExpanding ? parseStoredIntelligence(track)?.nextSearchQuery.trim() || "" : "";
    if (gapExpanding && !gapQuery) {
      return Response.json({ error: "Refresh Pi's direction assessment before scanning this evidence gap" }, { status: 422 });
    }
    const direction: DirectionDraft = {
      key: track.id,
      titleZh: track.title_zh,
      titleEn: track.title_en,
      summaryZh: track.summary_zh,
      summaryEn: track.summary_en,
      searchQueries: gapExpanding ? [gapQuery] : queries,
      userRole: track.user_role,
      depthScore: track.depth_score,
      supportScore: track.support_score,
    };
    const existing = await database.prepare(
      `SELECT tp.canonical_id, tp.title, tp.authors, tp.venue, tp.published_at, tp.citation_count, tp.role,
       tp.summary_zh, tp.summary_en, tp.rationale_zh, tp.rationale_en,
       CASE WHEN EXISTS (
        SELECT 1 FROM research_map_evidence_proposals ep
        JOIN monitored_papers mp ON mp.id = ep.paper_id AND mp.space_id = ep.space_id
        WHERE ep.space_id = tp.space_id AND ep.track_id = tp.track_id
         AND mp.canonical_id = tp.canonical_id AND ep.status = 'confirmed'
       ) THEN 'user_confirmed' ELSE 'system_curated' END AS provenance
       FROM research_track_papers tp WHERE tp.track_id = ? ORDER BY tp.position`,
    )
      .bind(track.id).all<ExistingPaperEvidence>();
    const existingEvidence = existing.results.map((item) => ({
      canonicalId: item.canonical_id, title: item.title, authors: item.authors, venue: item.venue, publishedAt: item.published_at,
      citations: item.citation_count, role: item.role, summaryZh: item.summary_zh, summaryEn: item.summary_en, rationaleZh: item.rationale_zh, rationaleEn: item.rationale_en,
      provenance: item.provenance,
    }));
    if (payload.action === "interpret") {
      const intelligence = await interpretDirection(database, workspaceId, space, memory, track, existingEvidence, apiKey);
      if (!intelligence) return Response.json({ error: "This direction does not yet have enough grounded evidence for an assessment" }, { status: 422 });
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
      apiKey,
      existingEvidence.map((item) => ({ canonicalId: item.canonicalId, title: item.title, publishedAt: item.publishedAt, role: item.role, summaryEn: item.summaryEn, rationaleEn: item.rationaleEn, provenance: item.provenance })),
    ) : { selections: [], intelligence: [] };
    const selections = reviewed.selections;
    const candidateById = new Map(candidates.map((item) => [item.canonicalId, item]));
    const inserted = new Set<string>();
    let position = existing.results.length;
    let addedCount = 0;
    const queueCandidates = selections.flatMap((selection) => {
      const candidate = candidateById.get(selection.canonicalId);
      if (!candidate || inserted.has(selection.canonicalId)) return [];
      inserted.add(selection.canonicalId);
      const sourceKind = gapExpanding ? "gap" : selection.role;
      return [{
        canonicalId: candidate.canonicalId,
        doi: candidate.doi,
        title: candidate.title,
        authors: candidate.authors,
        venue: candidate.venue,
        url: candidate.url,
        publishedAt: candidate.publishedAt,
        abstractText: candidate.abstractText,
        horizon: researchEvidenceHorizon(candidate.publishedAt),
        citationCount: candidate.citationCount,
        relevanceScore: Math.min(68, 42 + Math.round(Math.log1p(Math.max(0, candidate.citationCount)) * 4)
          + (candidate.abstractText.length >= 180 ? 5 : 0)),
        qualityScore: Math.min(72, 46 + Math.round(Math.log1p(Math.max(0, candidate.citationCount)) * 5)
          + (candidate.abstractText.length >= 180 ? 5 : 0)),
        priorityVenue: false,
        source: "research-route",
        provenance: [{
          sourceKey: `research-route:${sourceKind}`,
          channel: "topic" as const,
          queryKey: `${track.id}:${gapExpanding ? `gap:${track.expansion_count + 1}` : `route:${track.expansion_count + 1}`}`,
          queryText: gapExpanding ? gapQuery : queries.join(" | "),
          routeId: track.id,
        }],
      }];
    });
    const queueResult = await enqueueMonitorCandidates(database, space.id, queueCandidates, { recordDiscoveryCoverage: true });
    if (gapExpanding) {
      // Gap discovery is only a review candidate. Deep review creates the
      // pending evidence proposal if and only if it passes the quality gate.
      addedCount = queueResult.queuedForReviewCount;
    } else {
      inserted.clear();
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
    }
    if (hydrating) {
      await database.prepare("UPDATE research_tracks SET expansion_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?").bind(track.id, space.id).run();
    } else {
      await database.prepare("UPDATE research_tracks SET expansion_count = expansion_count + 1, interaction_score = MIN(35, interaction_score + 5), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
        .bind(track.id, space.id).run();
    }
    if (!gapExpanding) await saveDirectionIntelligence(database, space.id, track.id, reviewed.intelligence[0] || null);
    return Response.json(await readMap(database, space.id, {
      cached: false,
      addedCount,
      reviewQueuedCount: queueResult.queuedForReviewCount,
      reviewInProgressCount: queueResult.reviewingCount,
      alreadyReviewedCount: queueResult.alreadyReviewedCount,
      hydratedTrackId: hydrating ? track.id : null,
      gapExpanded: gapExpanding,
      gapQuery: gapExpanding ? gapQuery : undefined,
    }));
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
    await context.database.prepare("UPDATE research_tracks SET user_role = ?, interaction_score = MIN(35, interaction_score + 3), intelligence_json = '{}', intelligence_model = '', intelligence_updated_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
      .bind(payload.userRole, trackId, context.space.id).run();
    return Response.json(await readMap(context.database, context.space.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update the research direction" }, { status: 500 });
  }
}
