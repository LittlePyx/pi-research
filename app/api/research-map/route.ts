import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { buildArxivSearchQuery, parseArxivAtom } from "../../../lib/discovery/arxiv";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";
import { fetchExternalSource } from "../../../lib/external-source-throttle";
import { enqueueMonitorCandidates, RESEARCH_ROUTE_DISCOVERY_EFFECT_SQL, RESEARCH_ROUTE_PORTFOLIO_COUNTS_SQL, RESEARCH_ROUTE_REVIEW_QUEUE_COUNTS_SQL } from "../../../lib/monitor-candidate-queue";
import { readPreferenceSignals } from "../../../lib/preference-memory";
import { isDatabaseVerifiedCitationEdge } from "../../../lib/paper-network";
import { researchPaperCoverageHash, researchPaperSetRevision, selectResearchPaperCoverage, type ResearchDirectionIntelligence, type ResearchDirectionRole, type ResearchHeatLevel, type ResearchMapState, type ResearchPaperCoverageCandidate, type ResearchPaperEdge, type ResearchPaperEdgeKind, type ResearchRouteRevision, type ResearchTrack, type ResearchTrackEdge, type ResearchTrackPaper, type ResearchTrackRole } from "../../../lib/research-map";
import { defensiveResearchTrackBuildStatus, MAX_RESEARCH_TRACK_BUILD_ATTEMPTS, mergeResearchTrackSourceBatches, nextResearchTrackBuildAttemptCount, researchTrackRetryAt, researchTrackSourcePlan, researchTrackTitleTopicalFit, researchTrackTopicalFit, resolveResearchTrackBuildStatus, type ResearchTrackDiscoveryProvider, type ResearchTrackSourceReport } from "../../../lib/research-map-reliability";
import { formalResearchMapEvidencePredicate, reconcileConfirmedResearchMapEvidence, researchEvidenceHorizon } from "../../../lib/research-map-evidence";
import { curateResearchTrackPaper, ResearchTrackPaperCurationError, routePaperSelectionContradiction, type ResearchTrackPaperCurationReasonCode, type ResearchTrackPaperCurationStatus } from "../../../lib/research-map-curation";
import { claimResearchTrackIntelligence, completeResearchTrackIntelligence, defensiveResearchTrackIntelligenceStatus, deferResearchTrackIntelligence, requestResearchTrackIntelligenceRefresh } from "../../../lib/research-map-intelligence";
import { applyStoredResearchRoutePrecisionAudits, RESEARCH_ROUTE_PRECISION_GATE_VERSION, researchRoutePrecisionAuditProgress, routePrecisionAcceptedForActiveNode, routePrecisionAutoDeactivates, routePrecisionJudgmentIdentity, sanitizeResearchRoutePrecisionJudgments } from "../../../lib/research-map-precision";
import { researchProblemDiscoveryQuery } from "../../../lib/research-problem";
import { enqueueResearchGapDiscovery, settleMatchingResearchGapDiscoveries } from "../../../lib/research-gap-discovery";
import {
  evaluateResearchRouteEffectiveness,
  evaluateResearchRouteShadowExperiment,
  researchRouteEffectivenessMetrics,
  researchRouteExperimentMetrics,
  RESEARCH_ROUTE_SHADOW_EXPERIMENT_SQL,
  RESEARCH_ROUTE_VERSION_EFFECT_SQL,
  type ResearchRouteEffectivenessRow,
  type ResearchRouteExperimentRow,
} from "../../../lib/research-route-effectiveness";
import { researchRouteEvolutionDecisionAllowed, researchRouteEvolutionInputRevision, sanitizeResearchRouteEvolution, type ResearchRouteEvolutionBasis, type ResearchRouteEvolutionDraft, type ResearchRouteEvolutionStatus } from "../../../lib/research-route-evolution";
import { ensureResearchRouteBaselines } from "../../../lib/research-route-baseline";
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
  build_status: string;
  build_attempt_count: number;
  build_source_status_json: string;
  build_error: string | null;
  build_retry_at: string | null;
  user_role: ResearchDirectionRole;
  monitoring_status: string;
  depth_score: number;
  support_score: number;
  interaction_score: number;
  intelligence_json: string;
  intelligence_model: string;
  intelligence_updated_at: string | null;
  intelligence_status: string;
  intelligence_attempt_count: number;
  intelligence_error: string | null;
  intelligence_retry_at: string | null;
  intelligence_lock_token: string | null;
  intelligence_lock_expires_at: string | null;
  intelligence_refresh_requested_at: string | null;
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
  curation_status: ResearchTrackPaperCurationStatus;
  curation_reason_code: string | null;
  curation_reason_zh: string;
  curation_reason_en: string;
  curation_source: string;
  curation_evidence_json: string;
  curation_updated_at: string | null;
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
type ProtectedBaselineRow = {
  canonical_id: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  citation_count: number;
  abstract_text: string;
  relevance_score: number;
  quality_score: number;
  source: string;
  route_candidate: number;
};
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
  source: ResearchTrackDiscoveryProvider | "shared-monitor-baseline";
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
type ExistingPrecisionPaperRow = {
  id: string;
  track_id: string;
  canonical_id: string;
  title: string;
  authors: string;
  venue: string;
  published_at: string | null;
  abstract_text: string;
  role: ResearchTrackRole;
  summary_en: string;
  rationale_en: string;
  track_title_zh: string;
  track_title_en: string;
  track_summary_zh: string;
  track_summary_en: string;
  search_queries: string;
};
type TrackEvidenceCountRow = { track_id: string; confirmed_count: number; pending_count: number };
type TrackReviewQueueCountRow = {
  track_id: string;
  queued_count: number;
  reviewing_count: number;
  recommended_count: number;
  last_queued_at: string | null;
};
type RoutePortfolioCountRow = {
  discovered_count: number;
  queued_count: number;
  reviewing_count: number;
  deep_reviewed_count: number;
  recommended_count: number;
  accepted_count: number;
  confirmed_evidence_count: number;
  pending_evidence_count: number;
};
type TrackDiscoveryEffectRow = {
  track_id: string;
  attempt_count: number;
  frontier_attempts: number;
  foundation_attempts: number;
  gap_attempts: number;
  network_attempts: number;
  discovered_count: number;
  deep_reviewed_count: number;
  recommended_count: number;
  accepted_count: number;
  last_scanned_at: string | null;
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
type RouteEvolutionEvidenceRow = {
  paper_id: string;
  title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  summary_zh: string;
  summary_en: string;
  rationale_zh: string;
  rationale_en: string;
  reading_status: string;
  reading_note: string;
  takeaway_zh: string;
  takeaway_en: string;
  decided_at: string | null;
  updated_at: string | null;
  reading_updated_at: string | null;
  memory_updated_at: string | null;
};
type RouteEvolutionSynthesisRow = {
  id: string;
  input_revision: string;
  overview_zh: string;
  overview_en: string;
  change_summary_zh: string;
  change_summary_en: string;
  next_search_query: string;
  confidence: number;
};
type RouteEvolutionStatementRow = {
  id: string;
  kind: string;
  title_zh: string;
  title_en: string;
  text_zh: string;
  text_en: string;
  confidence: number;
  source_paper_ids: string;
};
type RouteEvolutionRevisionRow = {
  id: string;
  track_id: string;
  version: number;
  status: ResearchRouteEvolutionStatus;
  input_revision: string;
  title_zh: string;
  title_en: string;
  summary_zh: string;
  summary_en: string;
  rationale_zh: string;
  rationale_en: string;
  previous_title_zh: string;
  previous_title_en: string;
  previous_summary_zh: string;
  previous_summary_en: string;
  previous_search_queries_json: string;
  search_queries_json: string;
  source_paper_ids_json: string;
  source_statement_ids_json: string;
  source_papers_json: string;
  source_statements_json: string;
  confidence: number;
  model: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
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
  kind: "semantic";
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
type DeepSeekCallOptions = {
  reasoningEffort?: "low" | "medium" | "high";
  thinking?: "enabled" | "disabled";
  timeoutMs?: number;
};

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
const PAPER_RELATION_KINDS = new Set(["extends", "challenges", "applies", "unifies", "bridges", "reframes"]);
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

async function activeResearchProblemDiscoverySignal(database: D1Database, spaceId: string, trackId: string) {
  const problem = await database.prepare(
    `SELECT problem.id, problem.status, problem.updated_at,
      COALESCE(synthesis.input_revision, '') AS synthesis_revision,
      COALESCE((SELECT assessment.input_revision FROM research_problem_assessments assessment
       WHERE assessment.problem_id = problem.id ORDER BY assessment.created_at DESC, assessment.rowid DESC LIMIT 1), '') AS assessment_input_revision,
      COALESCE((SELECT assessment.next_search_query FROM research_problem_assessments assessment
       WHERE assessment.problem_id = problem.id ORDER BY assessment.created_at DESC, assessment.rowid DESC LIMIT 1), '') AS next_search_query
     FROM research_problems problem
     LEFT JOIN research_syntheses synthesis ON synthesis.space_id = problem.space_id AND synthesis.track_id = problem.track_id
      AND synthesis.status IN ('ready', 'partial')
     WHERE problem.space_id = ? AND problem.track_id = ? AND problem.status = 'active' LIMIT 1`,
  ).bind(spaceId, trackId).first<{
    id: string; status: string; updated_at: string; synthesis_revision: string;
    assessment_input_revision: string; next_search_query: string;
  }>();
  if (!problem) return null;
  const hypotheses = await database.prepare(
    `SELECT id, statement, status, updated_at FROM research_problem_hypotheses
     WHERE problem_id = ? ORDER BY id`,
  ).bind(problem.id).all<{ id: string; statement: string; status: string; updated_at: string }>();
  const query = await researchProblemDiscoveryQuery({
    problemStatus: problem.status,
    problemUpdatedAt: problem.updated_at,
    synthesisRevision: problem.synthesis_revision,
    hypotheses: hypotheses.results.map((item) => ({ id: item.id, statement: item.statement, status: item.status, updatedAt: item.updated_at })),
    assessmentInputRevision: problem.assessment_input_revision,
    nextSearchQuery: problem.next_search_query,
  });
  return query ? { query, problemId: problem.id, assessmentRevision: problem.assessment_input_revision } : null;
}

function parseTrackSourceStatuses(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): ResearchTrackSourceReport[] => {
      if (!item || typeof item !== "object") return [];
      const row = item as Partial<ResearchTrackSourceReport>;
      if (typeof row.source !== "string" || !["foundation", "milestone", "frontier", "baseline"].includes(String(row.role))
        || !["ok", "empty", "failed", "cached"].includes(String(row.status))) return [];
      return [{
        source: cleanText(row.source).slice(0, 80),
        role: row.role as ResearchTrackSourceReport["role"],
        status: row.status as ResearchTrackSourceReport["status"],
        candidateCount: Math.max(0, Math.round(Number(row.candidateCount) || 0)),
      }];
    }).slice(0, 12);
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
    source: "crossref",
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

async function recordResearchRouteReliabilityEvent(database: D1Database, spaceId: string, input: {
  trackId: string;
  outcome: "success" | "degraded" | "failed" | "info";
  message: string;
  metadata: Record<string, unknown>;
  stage?: "cold_start" | "direction_intelligence";
}) {
  try {
    await database.prepare(
      `INSERT INTO monitor_reliability_events
       (id, space_id, kind, stage, source, outcome, message, metadata_json)
       VALUES (?, ?, 'research_route_build', ?, 'research-route', ?, ?, ?)`,
    ).bind(crypto.randomUUID(), spaceId, input.stage || "cold_start", input.outcome, input.message.slice(0, 500), JSON.stringify({
      trackId: input.trackId,
      ...input.metadata,
    })).run();
  } catch {
    // Internal telemetry must never become a new route-build failure mode.
  }
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
      thinking: { type: options.thinking || "enabled" },
      reasoning_effort: options.reasoningEffort || "high",
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(Math.max(8_000, Math.min(55_000, options.timeoutMs || 52_000))),
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
    3200,
    apiKey,
    { reasoningEffort: "low", thinking: "disabled", timeoutMs: 28_000 },
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

function openAlexAbstract(index: Record<string, number[]> | null | undefined) {
  if (!index) return "";
  const words: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(index)) for (const position of positions) words.push([position, word]);
  return cleanText(words.sort((left, right) => left[0] - right[0]).map((entry) => entry[1]).join(" ")).slice(0, 1200);
}

async function fetchOpenAlex(database: D1Database, query: string, role: ResearchTrackRole, offset: number, rows: number) {
  const dates = roleDates(role);
  const endpoint = new URL("https://api.openalex.org/works");
  endpoint.searchParams.set("search", cleanText(query).slice(0, 420));
  endpoint.searchParams.set("filter", `from_publication_date:${dates.from},to_publication_date:${dates.until},is_paratext:false`);
  endpoint.searchParams.set("page", String(Math.floor(offset / rows) + 1));
  endpoint.searchParams.set("per-page", String(rows));
  endpoint.searchParams.set("sort", role === "frontier" ? "relevance_score:desc" : "cited_by_count:desc");
  endpoint.searchParams.set("select", "id,doi,title,display_name,relevance_score,publication_date,cited_by_count,authorships,primary_location,abstract_inverted_index");
  endpoint.searchParams.set("mailto", "pi-research@qiudao-pika.chatgpt.site");
  const options: RequestInit = {
    headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
    signal: AbortSignal.timeout(20_000),
  };
  const response = await fetchExternalSource(endpoint, options, { database, sourceKey: "openalex" });
  if (!response.ok) throw new Error(`OpenAlex returned ${response.status}`);
  return (await response.json() as OpenAlexResponse).results || [];
}

async function normalizeOpenAlexItem(item: OpenAlexWork, directionKey: string, proposedRole: ResearchTrackRole): Promise<MapCandidate | null> {
  const title = cleanText(item.display_name || item.title || "");
  if (title.length < 12 || NON_PAPER_PHRASES.test(title)) return null;
  const doi = item.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim().toLocaleLowerCase() || null;
  return {
    directionKey,
    canonicalId: doi ? "doi:" + doi : await titleFingerprint(title),
    doi,
    title,
    authors: (item.authorships || []).slice(0, 8).map((entry) => cleanText(entry.author?.display_name || "")).filter(Boolean).join(", "),
    venue: cleanText(item.primary_location?.source?.display_name || ""),
    url: item.primary_location?.landing_page_url || item.doi || item.id || "",
    publishedAt: item.publication_date || null,
    citationCount: Math.max(0, Math.round(item.cited_by_count || 0)),
    abstractText: openAlexAbstract(item.abstract_inverted_index),
    proposedRole,
    source: "openalex",
  };
}

async function fetchArxiv(query: string, role: ResearchTrackRole, offset: number, rows: number) {
  const dates = roleDates(role);
  const endpoint = new URL("https://export.arxiv.org/api/query");
  endpoint.searchParams.set("search_query", buildArxivSearchQuery(query, new Date(`${dates.from}T00:00:00Z`), new Date(`${dates.until}T23:59:59Z`)));
  endpoint.searchParams.set("start", String(offset));
  endpoint.searchParams.set("max_results", String(rows));
  endpoint.searchParams.set("sortBy", role === "frontier" ? "submittedDate" : "relevance");
  endpoint.searchParams.set("sortOrder", "descending");
  const response = await fetch(endpoint, {
    headers: { Accept: "application/atom+xml", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`arXiv returned ${response.status}`);
  return parseArxivAtom(await response.text());
}

async function normalizeArxivItem(item: ReturnType<typeof parseArxivAtom>[number], directionKey: string, proposedRole: ResearchTrackRole): Promise<MapCandidate | null> {
  const title = cleanText(item.title || "");
  if (title.length < 12 || NON_PAPER_PHRASES.test(title)) return null;
  const doi = item.doi?.trim().toLocaleLowerCase() || null;
  return {
    directionKey,
    canonicalId: doi ? "doi:" + doi : `arxiv:${item.arxivId.toLocaleLowerCase()}`,
    doi,
    title,
    authors: item.authors.slice(0, 8).map(cleanText).filter(Boolean).join(", "),
    venue: item.primaryCategory ? `arXiv · ${item.primaryCategory}` : "arXiv",
    url: item.url || `https://arxiv.org/abs/${item.arxivId}`,
    publishedAt: item.publishedAt,
    citationCount: 0,
    abstractText: cleanText(item.abstract || "").slice(0, 1200),
    proposedRole,
    source: "arxiv",
  };
}

async function discoverCandidates(database: D1Database, directions: DirectionDraft[], offset: number, rows: number, attemptCount: number) {
  const discovered: MapCandidate[] = [];
  const sources: ResearchTrackSourceReport[] = [];
  let topicalRejectedCount = 0;
  for (const direction of directions) {
    const plan = researchTrackSourcePlan(attemptCount);
    const settled = await Promise.allSettled(plan.map(async ({ provider, role }) => {
      const query = direction.searchQueries[(role === "foundation" ? 0 : role === "milestone" ? 1 : 2) % direction.searchQueries.length];
      const normalized = provider === "crossref"
        ? await Promise.all((await fetchCrossref(query, role, offset, rows)).map((item) => normalizeItem(item, direction.key, role)))
        : provider === "openalex"
          ? await Promise.all((await fetchOpenAlex(database, query, role, offset, rows)).map((item) => normalizeOpenAlexItem(item, direction.key, role)))
          : await Promise.all((await fetchArxiv(query, role, offset, rows)).map((item) => normalizeArxivItem(item, direction.key, role)));
      const paperCandidates = normalized.filter((item): item is MapCandidate => Boolean(item));
      const accepted = paperCandidates.filter((item) => researchTrackTopicalFit(direction, item).accepted);
      topicalRejectedCount += paperCandidates.length - accepted.length;
      return accepted;
    }));
    const merged = mergeResearchTrackSourceBatches(plan.map(({ provider, role }, index) => ({ source: provider, role, result: settled[index] })));
    discovered.push(...merged.candidates);
    sources.push(...merged.sources);
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
  return { candidates: capped, sources, errors: sources.flatMap((source) => source.error ? [source.error] : []), topicalRejectedCount };
}

function baselineRole(publishedAt: string | null): ResearchTrackRole {
  const year = Number(publishedAt?.slice(0, 4) || 0);
  const current = new Date().getUTCFullYear();
  if (!year || year <= current - 10) return "foundation";
  if (year <= current - 5) return "milestone";
  return "frontier";
}

async function protectedBaselineCandidates(
  database: D1Database,
  spaceId: string,
  direction: DirectionDraft,
  excludedCanonicalIds: Set<string>,
  limit = 12,
) {
  const rows = await database.prepare(
    `SELECT p.canonical_id, p.doi, p.title, p.authors, p.venue, p.url, p.published_at, p.citation_count,
     p.relevance_score, p.source, COALESCE(i.abstract_text, '') AS abstract_text, COALESCE(i.quality_score, 0) AS quality_score,
     CASE WHEN EXISTS (
      SELECT 1 FROM monitor_candidate_sources candidate
      JOIN monitor_discovery_coverage coverage ON coverage.space_id = candidate.space_id
       AND coverage.horizon = p.horizon AND coverage.source_key = candidate.source_key AND coverage.query_key = candidate.query_key
      WHERE candidate.space_id = p.space_id AND candidate.paper_id = p.id AND coverage.route_id = ?
     ) THEN 1 ELSE 0 END AS route_candidate
     FROM monitored_papers p LEFT JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
     WHERE p.space_id = ? ORDER BY route_candidate DESC, p.relevance_score DESC,
      COALESCE(i.quality_score, 0) DESC, p.last_seen_at DESC LIMIT 240`,
  ).bind(direction.key, spaceId).all<ProtectedBaselineRow>();
  return rows.results.map((row) => {
    const fit = researchTrackTitleTopicalFit(direction.titleEn, { title: row.title, abstractText: row.abstract_text, venue: row.venue });
    return { row, fit };
  }).filter(({ row, fit }) => !excludedCanonicalIds.has(row.canonical_id) && fit.accepted)
    .sort((left, right) => right.row.route_candidate - left.row.route_candidate
      || right.fit.totalMatchCount - left.fit.totalMatchCount || right.row.relevance_score - left.row.relevance_score
      || right.row.quality_score - left.row.quality_score || right.row.citation_count - left.row.citation_count)
    .slice(0, Math.max(0, limit)).map(({ row }) => ({
      directionKey: direction.key,
      canonicalId: row.canonical_id,
      doi: row.doi,
      title: row.title,
      authors: row.authors,
      venue: row.venue,
      url: row.url,
      publishedAt: row.published_at,
      citationCount: row.citation_count,
      abstractText: row.abstract_text,
      proposedRole: baselineRole(row.published_at),
      source: row.source === "crossref" || row.source === "openalex" || row.source === "arxiv" ? row.source : "shared-monitor-baseline",
    } satisfies MapCandidate));
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
  const selectionPrompt = [
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
    ].join("\n");
  const precisionPrompt = [
    "Return {\"judgments\":[...]} with exactly one judgment for every supplied candidate.",
    "Each judgment needs directionKey, canonicalId, verdict (direct|borderline|off_topic), confidence (0-100), reasonZh, reasonEn, and evidenceTerms (0-8 short title/abstract terms).",
    "This is an independent semantic precision gate, not a quality ranking. direct means the paper's central question, theorem, method, or result belongs to the exact route and it can represent that route. borderline means a useful bridge or background connection exists but the paper should remain a review candidate rather than an active representative route node. off_topic means the connection depends on metaphor, a generic word, a broad methodological analogy, or a different research field.",
    "Judge only title, abstract, venue, and supplied route definition. Missing abstracts increase uncertainty; never infer results from titles alone. Famous or highly cited work outside the exact route is off_topic. Do not use the first editor's selection or rationale as evidence.",
    `Research space: ${space.name} — ${space.description}`,
    `Directions: ${JSON.stringify(directions)}`,
  ];
  const precisionBatches = Array.from({ length: Math.ceil(compact.length / 18) }, (_, index) => compact.slice(index * 18, index * 18 + 18));
  const [parsed, precisionResponses] = await Promise.all([
    callDeepSeek<{ selections?: Array<Partial<Selection>>; directionIntelligence?: Array<Partial<DirectionIntelligenceDraft>> }>(
      database,
      workspaceId,
      "You are Pi Research's evidence-disciplined academic map editor. Select only real, representative papers and return strict JSON.",
      selectionPrompt,
      7600,
      apiKey,
      { reasoningEffort: "medium", thinking: "disabled", timeoutMs: 50_000 },
    ),
    Promise.all(precisionBatches.map((batch) => callDeepSeek<{ judgments?: unknown }>(
        database,
        workspaceId,
        "You are Pi Research's independent route-paper semantic precision auditor. Return strict JSON without chain-of-thought.",
        [...precisionPrompt, `Candidate records: ${JSON.stringify(batch)}`].join("\n"),
        Math.min(3300, 900 + batch.length * 120),
        apiKey,
        { reasoningEffort: "medium", thinking: "disabled", timeoutMs: 44_000 },
      ))),
  ]);
  const allowed = new Set(candidates.map((item) => item.directionKey + ":" + item.canonicalId));
  const precisionJudgments = sanitizeResearchRoutePrecisionJudgments(
    precisionResponses.flatMap((response) => Array.isArray(response.judgments) ? response.judgments : []),
    allowed,
  );
  if (precisionJudgments.length !== allowed.size) throw new Error("Route semantic precision audit returned incomplete coverage");
  const precisionByIdentity = new Map(precisionJudgments.map((judgment) => [routePrecisionJudgmentIdentity(judgment), judgment]));
  const selections = (parsed.selections || []).map((item) => ({
    directionKey: cleanText(item.directionKey || ""),
    canonicalId: cleanText(item.canonicalId || ""),
    role: ROLES.has(item.role as ResearchTrackRole) ? item.role as ResearchTrackRole : "milestone",
    summaryZh: cleanText(item.summaryZh || "").slice(0, 800),
    summaryEn: cleanText(item.summaryEn || "").slice(0, 1100),
    rationaleZh: cleanText(item.rationaleZh || "").slice(0, 700),
    rationaleEn: cleanText(item.rationaleEn || "").slice(0, 950),
  })).filter((item) => allowed.has(item.directionKey + ":" + item.canonicalId) && item.summaryZh && item.summaryEn
    && item.rationaleZh && item.rationaleEn && !routePaperSelectionContradiction(item)
    && routePrecisionAcceptedForActiveNode(precisionByIdentity.get(item.directionKey + ":" + item.canonicalId)));
  const allowedEvidence = new Set([...selections.map((item) => item.canonicalId), ...existingEvidence.map((item) => item.canonicalId)]);
  const intelligence = directions.map((direction) => sanitizeIntelligence(
    (parsed.directionIntelligence || []).find((item) => cleanText(item.directionKey || "") === direction.key),
    direction.key,
    allowedEvidence,
  )).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return { selections, intelligence, precisionJudgments };
}

async function auditExistingResearchRoutePrecision(
  database: D1Database,
  workspaceId: string,
  space: SpaceRow,
  apiKey: string,
) {
  // Applying only a previously persisted shadow keeps automated curation
  // two-phase: one visit records the report, a later visit may act on it.
  const appliedCount = await applyStoredResearchRoutePrecisionAudits(database, space.id);
  const rows = await database.prepare(
    `SELECT paper.id, paper.track_id, paper.canonical_id, paper.title, paper.authors, paper.venue, paper.published_at,
     COALESCE((SELECT insight.abstract_text FROM monitored_papers monitored
      JOIN paper_insights insight ON insight.paper_id = monitored.id AND insight.space_id = monitored.space_id
      WHERE monitored.space_id = paper.space_id AND monitored.canonical_id = paper.canonical_id
      ORDER BY length(insight.abstract_text) DESC LIMIT 1), '') AS abstract_text,
     paper.role, paper.summary_en, paper.rationale_en, track.title_zh AS track_title_zh, track.title_en AS track_title_en,
     track.summary_zh AS track_summary_zh, track.summary_en AS track_summary_en, track.search_queries
     FROM research_track_papers paper JOIN research_tracks track ON track.id = paper.track_id AND track.space_id = paper.space_id
     WHERE paper.space_id = ? AND paper.curation_status = 'active'
      AND NOT EXISTS (
       SELECT 1 FROM research_map_evidence_proposals proposal
       JOIN monitored_papers monitored ON monitored.id = proposal.paper_id AND monitored.space_id = proposal.space_id
       WHERE proposal.space_id = paper.space_id AND proposal.track_id = paper.track_id
        AND monitored.canonical_id = paper.canonical_id AND proposal.status = 'confirmed'
      ) AND NOT EXISTS (
       SELECT 1 FROM research_track_paper_precision_audits audit
       WHERE audit.track_paper_id = paper.id AND audit.gate_version = ?
        AND datetime(audit.created_at) >= datetime(COALESCE(paper.curation_updated_at, paper.created_at))
      ) ORDER BY track.position, paper.position, paper.created_at LIMIT 32`,
  ).bind(space.id, RESEARCH_ROUTE_PRECISION_GATE_VERSION).all<ExistingPrecisionPaperRow>();
  let shadowedCount = 0;
  let directCount = 0;
  let borderlineCount = 0;
  let offTopicCount = 0;
  let auditDegraded = false;
  if (rows.results.length) {
    try {
      const routes = Array.from(new Map(rows.results.map((row) => [row.track_id, {
        directionKey: row.track_id,
        titleZh: row.track_title_zh,
        titleEn: row.track_title_en,
        summaryZh: row.track_summary_zh,
        summaryEn: row.track_summary_en,
        searchQueries: parseJsonArray(row.search_queries),
      }])).values());
      const papers = rows.results.map((row) => ({
        directionKey: row.track_id,
        canonicalId: row.canonical_id,
        title: row.title,
        authors: row.authors,
        venue: row.venue,
        publishedAt: row.published_at,
        abstract: row.abstract_text,
        assignedRole: row.role,
        storedSummary: row.summary_en,
        storedRationale: row.rationale_en,
      }));
      const auditPrompt = [
          "Return {\"judgments\":[...]} with exactly one judgment for every supplied paper.",
          "Each judgment needs directionKey, canonicalId, verdict (direct|borderline|off_topic), confidence (0-100), reasonZh, reasonEn, and evidenceTerms (0-8 short title/abstract terms).",
          "direct means the paper's central question, theorem, method, or result belongs to the exact route and can represent it. borderline means a useful bridge or background connection exists but it is not clearly representative. off_topic means the claimed connection relies on metaphor, generic terminology, a loose methodological analogy, or a different field.",
          "Use only route definitions and bibliographic/abstract evidence. Stored summaries and rationales are untrusted hypotheses, not evidence. Missing abstracts require conservative confidence. Famous or highly cited work outside the exact route is off_topic.",
          `Research space: ${space.name} — ${space.description}`,
          `Routes: ${JSON.stringify(routes)}`,
        ];
      const paperBatches = Array.from({ length: Math.ceil(papers.length / 8) }, (_, index) => papers.slice(index * 8, index * 8 + 8));
      const auditResponses = await Promise.allSettled(paperBatches.map((batch) => callDeepSeek<{ judgments?: unknown }>(
          database,
          workspaceId,
          "You are Pi Research's independent route-paper semantic precision auditor. Return strict JSON without chain-of-thought.",
          [...auditPrompt, `Papers: ${JSON.stringify(batch)}`].join("\n"),
          Math.min(2200, 800 + batch.length * 150),
          apiKey,
          { reasoningEffort: "medium", thinking: "disabled", timeoutMs: 44_000 },
        )));
      const allowed = new Set(rows.results.map((row) => `${row.track_id}:${row.canonical_id}`));
      const judgments = sanitizeResearchRoutePrecisionJudgments(
        auditResponses.flatMap((response) => response.status === "fulfilled" && Array.isArray(response.value.judgments)
          ? response.value.judgments
          : []),
        allowed,
      );
      const auditedIdentities = new Set(judgments.map(routePrecisionJudgmentIdentity));
      auditDegraded = auditResponses.some((response) => response.status === "rejected")
        || auditedIdentities.size < rows.results.length;
      const paperByIdentity = new Map(rows.results.map((row) => [`${row.track_id}:${row.canonical_id}`, row]));
      const statements: D1PreparedStatement[] = [];
      const affectedTracks = new Map<string, "precision_audit_pending" | "precision_boundary_pending">();
      for (const judgment of judgments) {
        const paper = paperByIdentity.get(routePrecisionJudgmentIdentity(judgment));
        if (!paper) continue;
        statements.push(database.prepare(
          `INSERT INTO research_track_paper_precision_audits
           (id, space_id, track_id, track_paper_id, gate_version, verdict, confidence, reason_zh, reason_en, evidence_json, model, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'shadow')`,
        ).bind(crypto.randomUUID(), space.id, paper.track_id, paper.id, RESEARCH_ROUTE_PRECISION_GATE_VERSION,
          judgment.verdict, judgment.confidence, judgment.reasonZh, judgment.reasonEn,
          JSON.stringify(judgment.evidenceTerms), MODEL));
        shadowedCount += 1;
        if (judgment.verdict === "direct") directCount += 1;
        if (judgment.verdict === "borderline") {
          borderlineCount += 1;
          affectedTracks.set(paper.track_id, "precision_boundary_pending");
        }
        if (judgment.verdict === "off_topic") {
          offTopicCount += 1;
          if (routePrecisionAutoDeactivates(judgment)) affectedTracks.set(paper.track_id, "precision_audit_pending");
        }
      }
      for (const [trackId, issue] of affectedTracks) statements.push(database.prepare(
        "UPDATE research_tracks SET build_status = 'partial', build_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ? AND build_status = 'ready'",
      ).bind(issue, trackId, space.id));
      if (statements.length) await database.batch(statements);
    } catch {
      auditDegraded = true;
    }
  }
  return {
    appliedCount,
    shadowedCount,
    directCount,
    borderlineCount,
    offTopicCount,
    auditDegraded,
    progress: await researchRoutePrecisionAuditProgress(database, space.id),
  };
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
    3400,
    apiKey,
    { reasoningEffort: "low", thinking: "disabled", timeoutMs: 36_000 },
  );
  return sanitizeIntelligence(parsed.directionIntelligence, track.id, new Set(evidence.map((item) => item.canonicalId)));
}

async function saveDirectionIntelligence(database: D1Database, spaceId: string, trackId: string, intelligence: ReturnType<typeof sanitizeIntelligence>) {
  if (!intelligence) return;
  await database.prepare("UPDATE research_tracks SET intelligence_json = ?, intelligence_model = ?, intelligence_updated_at = CURRENT_TIMESTAMP, intelligence_status = 'ready', intelligence_attempt_count = 0, intelligence_error = NULL, intelligence_retry_at = NULL, intelligence_lock_token = NULL, intelligence_lock_expires_at = NULL, intelligence_refresh_requested_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
    .bind(JSON.stringify(intelligence), MODEL, trackId, spaceId).run();
  await enqueueResearchGapDiscovery(database, {
    spaceId,
    trackId,
    origin: "direction",
    sourceRevision: JSON.stringify({ evidenceCanonicalIds: intelligence.evidenceCanonicalIds, nextSearchQuery: intelligence.nextSearchQuery }),
    queryText: intelligence.nextSearchQuery,
  });
}

function directionIntelligenceErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  if (name.includes("timeout") || name.includes("abort") || message.includes("timeout") || message.includes("timed out")) return "intelligence_timeout";
  if (message.includes("budget reached")) return "budget_reached";
  if (message.includes("required") || message.includes("401") || message.includes("403") || message.includes("429") || message.includes("unavailable")) return "model_unavailable";
  if (error instanceof DeepSeekJsonResponseError || message.includes("json")) return "invalid_output";
  return "analysis_failed";
}

async function advanceDirectionIntelligence(
  database: D1Database,
  workspaceId: string,
  space: SpaceRow,
  memory: string,
  apiKey: string,
  preferredTrackId?: string,
) {
  const claim = await claimResearchTrackIntelligence(database, space.id, { preferredTrackId });
  if (!claim) return { status: "idle" as const };

  const track = await database.prepare(
    "SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, build_status, build_attempt_count, build_source_status_json, build_error, build_retry_at, user_role, monitoring_status, depth_score, support_score, interaction_score, intelligence_json, intelligence_model, intelligence_updated_at, intelligence_status, intelligence_attempt_count, intelligence_error, intelligence_retry_at, intelligence_lock_token, intelligence_lock_expires_at, intelligence_refresh_requested_at, updated_at FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1",
  ).bind(claim.trackId, space.id).first<TrackRow>();
  if (!track) {
    const deferred = await deferResearchTrackIntelligence(database, {
      spaceId: space.id, trackId: claim.trackId, lockToken: claim.lockToken,
      attemptCount: claim.attemptCount, errorCode: "track_unavailable",
    });
    return { status: "retryable" as const, trackId: claim.trackId, retryAt: deferred.retryAt, errorCode: "track_unavailable" };
  }

  const existing = await database.prepare(
    `SELECT tp.canonical_id, tp.title, tp.authors, tp.venue, tp.published_at, tp.citation_count,
     tp.role, tp.summary_zh, tp.summary_en, tp.rationale_zh, tp.rationale_en,
     CASE WHEN EXISTS (
      SELECT 1 FROM research_map_evidence_proposals ep
      JOIN monitored_papers mp ON mp.id = ep.paper_id AND mp.space_id = ep.space_id
      WHERE ep.space_id = tp.space_id AND ep.track_id = tp.track_id
       AND mp.canonical_id = tp.canonical_id AND ep.status = 'confirmed'
     ) THEN 'user_confirmed' ELSE 'system_curated' END AS provenance
     FROM research_track_papers tp
     WHERE tp.track_id = ? AND tp.space_id = ? AND tp.curation_status = 'active'
     ORDER BY tp.position`,
  ).bind(track.id, space.id).all<ExistingPaperEvidence>();
  const evidence = existing.results.map((item) => ({
    canonicalId: item.canonical_id, title: item.title, authors: item.authors, venue: item.venue,
    publishedAt: item.published_at, citations: item.citation_count, role: item.role,
    summaryZh: item.summary_zh, summaryEn: item.summary_en,
    rationaleZh: item.rationale_zh, rationaleEn: item.rationale_en, provenance: item.provenance,
  }));

  try {
    const intelligence = await interpretDirection(database, workspaceId, space, memory, track, evidence, apiKey);
    if (!intelligence) throw new Error("No grounded direction intelligence was returned");
    const changed = await completeResearchTrackIntelligence(database, {
      spaceId: space.id, trackId: track.id, lockToken: claim.lockToken,
      intelligenceJson: JSON.stringify(intelligence), model: MODEL,
    });
    if (changed > 0) await enqueueResearchGapDiscovery(database, {
      spaceId: space.id,
      trackId: track.id,
      origin: "direction",
      sourceRevision: JSON.stringify({ evidenceCanonicalIds: intelligence.evidenceCanonicalIds, nextSearchQuery: intelligence.nextSearchQuery }),
      queryText: intelligence.nextSearchQuery,
    });
    return changed > 0 ? { status: "ready" as const, trackId: track.id } : { status: "superseded" as const, trackId: track.id };
  } catch (error) {
    const errorCode = directionIntelligenceErrorCode(error);
    const deferred = await deferResearchTrackIntelligence(database, {
      spaceId: space.id, trackId: track.id, lockToken: claim.lockToken,
      attemptCount: claim.attemptCount, errorCode,
    });
    await recordResearchRouteReliabilityEvent(database, space.id, {
      trackId: track.id,
      outcome: "degraded",
      stage: "direction_intelligence",
      message: "Direction intelligence was deferred without removing the saved assessment",
      metadata: { errorCode, retryAt: deferred.retryAt, attemptCount: claim.attemptCount },
    });
    return { status: "retryable" as const, trackId: track.id, retryAt: deferred.retryAt, errorCode };
  }
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
    curationStatus: row.curation_status === "deactivated" ? "deactivated" : "active",
    curationReasonCode: row.curation_reason_code,
    curationReasonZh: row.curation_reason_zh,
    curationReasonEn: row.curation_reason_en,
    curationSource: row.curation_source,
    curationEvidence: parseJsonRecords(row.curation_evidence_json),
    curationUpdatedAt: row.curation_updated_at,
  };
}

function parseJsonRecords(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  } catch {
    return [];
  }
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
      "Create up to 14 semantic edges. Every edge needs sourcePaperId, targetPaperId, kind (semantic), relationKind, relationshipZh, relationshipEn, confidence (0-100).",
      "Semantic relationKind must be extends, challenges, applies, unifies, bridges, or reframes. It describes an evidence-grounded intellectual relationship, not a factual citation unless it appears in actualCitationPairs.",
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
  if (!(parsed.edges || []).length && !retriedWithReducedInput) {
    requestedInput = reduced;
    parsed = await requestEdges(reduced, 4400, "low");
  }
  const validIds = new Set(requestedInput.map((paper) => paper.id));
  const citationPairs = new Set(citationEdges.map((edge) => edge.sourcePaperId + ":" + edge.targetPaperId));
  let semanticCount = 0;
  const unique = new Map<string, Omit<ResearchPaperEdge, "id">>();
  for (const item of parsed.edges || []) {
    const sourcePaperId = cleanText(item.sourcePaperId || "");
    const targetPaperId = cleanText(item.targetPaperId || "");
    if (item.kind !== "semantic") continue;
    if (!validIds.has(sourcePaperId) || !validIds.has(targetPaperId) || sourcePaperId === targetPaperId) continue;
    if (citationPairs.has(sourcePaperId + ":" + targetPaperId)) continue;
    const rawRelationKind = String(item.relationKind || "");
    const relationKind = PAPER_RELATION_KINDS.has(rawRelationKind) ? rawRelationKind : "extends";
    const relationshipZh = cleanText(item.relationshipZh || "").slice(0, 320);
    const relationshipEn = cleanText(item.relationshipEn || "").slice(0, 440);
    if (!relationshipZh || !relationshipEn || semanticCount >= 14) continue;
    semanticCount += 1;
    unique.set(`${sourcePaperId}:${targetPaperId}:semantic:${relationKind}`, {
      sourcePaperId,
      targetPaperId,
      kind: "semantic",
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
      "SELECT id, track_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role, summary_zh, summary_en, rationale_zh, rationale_en, curation_status, curation_reason_code, curation_reason_zh, curation_reason_en, curation_source, curation_evidence_json, curation_updated_at, position, created_at FROM research_track_papers WHERE space_id = ? AND curation_status = 'active' ORDER BY (SELECT position FROM research_tracks WHERE id = research_track_papers.track_id), position, created_at",
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
  let scholarlyEdges = cachedEdges.filter((edge) => edge.kind === "similarity" || isDatabaseVerifiedCitationEdge(edge));
  let curatedEdges = cachedEdges.filter((edge) => edge.kind === "semantic");
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
      const refreshedIds = new Set(generated.coveredPaperIds);
      curatedEdges = [
        ...curatedEdges.filter((edge) => !refreshedIds.has(edge.sourcePaperId) || !refreshedIds.has(edge.targetPaperId)),
        ...freshEdges,
      ];
      sources.push(MODEL);
      await replacePaperNetworkEdges(database, space.id, ["semantic"], freshEdges, generated.coveredPaperIds);
    } catch (error) {
      errors.push(`pi: ${error instanceof Error ? error.message : "Pi relation analysis failed"}`);
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
    "SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, build_status, build_attempt_count, build_source_status_json, build_error, build_retry_at, user_role, monitoring_status, depth_score, support_score, interaction_score, intelligence_json, intelligence_model, intelligence_updated_at, intelligence_status, intelligence_attempt_count, intelligence_error, intelligence_retry_at, intelligence_lock_token, intelligence_lock_expires_at, intelligence_refresh_requested_at, updated_at FROM research_tracks WHERE space_id = ? ORDER BY position",
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
  ].join("\n"), 5600, apiKey, { reasoningEffort: "medium", thinking: "disabled", timeoutMs: 42_000 });
  const validIds = new Set(tracks.results.map((track) => track.id));
  for (const profile of parsed.profiles || []) {
    const trackId = cleanText(profile.trackId || "");
    if (!validIds.has(trackId)) continue;
    const userRole = DIRECTION_ROLES.has(profile.userRole as ResearchDirectionRole) ? profile.userRole as ResearchDirectionRole : "explore";
    await database.prepare("UPDATE research_tracks SET user_role = ?, depth_score = ?, support_score = ?, intelligence_status = 'pending', intelligence_attempt_count = 0, intelligence_error = NULL, intelligence_retry_at = NULL, intelligence_lock_token = NULL, intelligence_lock_expires_at = NULL, intelligence_refresh_requested_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
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

async function routeEvolutionBasis(database: D1Database, spaceId: string, track: TrackRow) {
  const [evidenceResult, synthesis] = await Promise.all([
    database.prepare(
      `SELECT proposal.paper_id, paper.title, paper.authors, paper.venue, paper.url, paper.published_at,
       insight.summary_zh, insight.summary_en, proposal.rationale_zh, proposal.rationale_en,
       COALESCE(reading.status, 'unread') AS reading_status, COALESCE(reading.note, '') AS reading_note,
       COALESCE(memory.takeaway_zh, '') AS takeaway_zh, COALESCE(memory.takeaway_en, '') AS takeaway_en,
       proposal.decided_at, proposal.updated_at, reading.updated_at AS reading_updated_at,
       memory.updated_at AS memory_updated_at
       FROM research_map_evidence_proposals proposal
       JOIN monitored_papers paper ON paper.id = proposal.paper_id AND paper.space_id = proposal.space_id
       JOIN paper_insights insight ON insight.paper_id = proposal.paper_id AND insight.space_id = proposal.space_id
       LEFT JOIN paper_reading_progress reading ON reading.paper_id = proposal.paper_id AND reading.space_id = proposal.space_id
       LEFT JOIN paper_reading_memories memory ON memory.paper_id = proposal.paper_id AND memory.space_id = proposal.space_id
       WHERE proposal.space_id = ? AND proposal.track_id = ? AND proposal.status = 'confirmed'
        AND insight.ever_recommended = 1 AND insight.verification_status IN ('verified', 'revised')
        AND insight.verification_coverage_score >= 70
       ORDER BY COALESCE(proposal.decided_at, proposal.updated_at) DESC, proposal.rowid DESC LIMIT 12`,
    ).bind(spaceId, track.id).all<RouteEvolutionEvidenceRow>(),
    database.prepare(
      `SELECT id, input_revision, overview_zh, overview_en, change_summary_zh, change_summary_en,
       next_search_query, confidence FROM research_syntheses
       WHERE space_id = ? AND track_id = ? AND status IN ('ready', 'partial') LIMIT 1`,
    ).bind(spaceId, track.id).first<RouteEvolutionSynthesisRow>(),
  ]);
  const allowedPaperIds = new Set(evidenceResult.results.map((row) => row.paper_id));
  const statementResult = synthesis ? await database.prepare(
    `SELECT id, kind, title_zh, title_en, text_zh, text_en, confidence, source_paper_ids
     FROM research_synthesis_statements WHERE synthesis_id = ? ORDER BY position LIMIT 16`,
  ).bind(synthesis.id).all<RouteEvolutionStatementRow>() : { results: [] as RouteEvolutionStatementRow[] };
  const statements = statementResult.results.filter((statement) => parseJsonArray(statement.source_paper_ids).some((paperId) => allowedPaperIds.has(paperId)));
  const basis: ResearchRouteEvolutionBasis = {
    trackId: track.id,
    titleZh: track.title_zh,
    titleEn: track.title_en,
    summaryZh: track.summary_zh,
    summaryEn: track.summary_en,
    searchQueries: parseJsonArray(track.search_queries),
    evidence: evidenceResult.results.map((row) => ({
      paperId: row.paper_id,
      decidedAt: row.decided_at,
      updatedAt: row.updated_at,
      readingStatus: row.reading_status,
      readingUpdatedAt: row.reading_updated_at,
      memoryUpdatedAt: row.memory_updated_at,
    })),
    synthesisRevision: synthesis?.input_revision || "",
    statementIds: statements.map((statement) => statement.id),
  };
  return {
    basis,
    inputRevision: researchRouteEvolutionInputRevision(basis),
    evidence: evidenceResult.results,
    synthesis,
    statements,
  };
}

async function proposeResearchRouteEvolution(
  database: D1Database,
  workspaceId: string,
  space: SpaceRow,
  track: TrackRow,
  memory: string,
  apiKey: string,
) {
  await ensureResearchRouteBaselines(database, space.id);
  const source = await routeEvolutionBasis(database, space.id, track);
  if (!source.evidence.length) return { error: "Confirm at least one independently verified recommendation before evolving this route", status: 422 as const };
  const existing = await database.prepare(
    "SELECT id, status FROM research_route_revisions WHERE space_id = ? AND track_id = ? AND input_revision = ? LIMIT 1",
  ).bind(space.id, track.id, source.inputRevision).first<{ id: string; status: ResearchRouteEvolutionStatus }>();
  if (existing?.status === "proposed") return { revisionId: existing.id, cached: true };
  if (existing) return { error: "No new confirmed evidence, reading outcome, or synthesis revision is available for another route version", status: 422 as const };
  const evidence = source.evidence.map((row) => ({
    paperId: row.paper_id,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    publishedAt: row.published_at,
    summaryZh: row.summary_zh,
    summaryEn: row.summary_en,
    routeRationaleZh: row.rationale_zh,
    routeRationaleEn: row.rationale_en,
    readingStatus: row.reading_status,
    readingNote: cleanText(row.reading_note).slice(0, 500),
    takeawayZh: cleanText(row.takeaway_zh).slice(0, 500),
    takeawayEn: cleanText(row.takeaway_en).slice(0, 700),
  }));
  const statements = source.statements.map((row) => ({
    statementId: row.id,
    kind: row.kind,
    titleZh: row.title_zh,
    titleEn: row.title_en,
    textZh: row.text_zh,
    textEn: row.text_en,
    confidence: row.confidence,
    sourcePaperIds: parseJsonArray(row.source_paper_ids).filter((paperId) => source.basis.evidence.some((item) => item.paperId === paperId)),
  }));
  const parsed = await callDeepSeek<{ routeEvolution?: ResearchRouteEvolutionDraft }>(
    database,
    workspaceId,
    "You are Pi Research's evidence-disciplined research-route editor. Return strict JSON without chain-of-thought.",
    [
      "Return {\"routeEvolution\":{titleZh,titleEn,summaryZh,summaryEn,rationaleZh,rationaleEn,searchQueries,confidence,sourcePaperIds,sourceStatementIds}}.",
      "Propose one conservative next version of the route. Preserve its identity unless the supplied confirmed evidence clearly supports a narrower or shifted formulation.",
      "Explain what changed and why in rationaleZh/En. Use 2-4 concise English scholarly queries that operationalize the proposed route for future discovery.",
      "Use only exact supplied paperId and statementId values. Confirmed papers passed the independent recommendation evidence gate; synthesis statements remain Pi's cross-paper interpretation and must not be described as database-confirmed facts.",
      "If evidence is limited or mixed, make a smaller change and lower confidence. Do not invent findings, papers, citations, or full-text evidence.",
      `Research space: ${space.name} — ${space.description}`,
      `Current route: ${JSON.stringify({ titleZh: track.title_zh, titleEn: track.title_en, summaryZh: track.summary_zh, summaryEn: track.summary_en, searchQueries: source.basis.searchQueries })}`,
      `Confirmed recommendation evidence: ${JSON.stringify(evidence)}`,
      `Current route synthesis: ${JSON.stringify(source.synthesis || null)}`,
      `Traceable synthesis statements: ${JSON.stringify(statements)}`,
      `Research memory: ${memory || "none"}`,
    ].join("\n"),
    3600,
    apiKey,
    { reasoningEffort: "medium", thinking: "disabled", timeoutMs: 45_000 },
  );
  const draft = sanitizeResearchRouteEvolution(
    parsed.routeEvolution || {},
    source.basis,
    new Set(source.evidence.map((row) => row.paper_id)),
    new Set(source.statements.map((row) => row.id)),
  );
  if (!draft) return { error: "Pi could not form a traceable material route change from the current confirmed evidence", status: 422 as const };
  const revisionId = crypto.randomUUID();
  const sourcePapers = evidence.filter((row) => draft.sourcePaperIds.includes(row.paperId));
  const sourceStatements = statements.filter((row) => draft.sourceStatementIds.includes(row.statementId));
  await database.batch([
    database.prepare(
      `INSERT INTO research_route_revisions
       (id, space_id, track_id, version, status, input_revision, title_zh, title_en, summary_zh, summary_en,
        rationale_zh, rationale_en, previous_title_zh, previous_title_en, previous_summary_zh, previous_summary_en,
        previous_search_queries_json, search_queries_json, source_paper_ids_json, source_statement_ids_json,
        source_papers_json, source_statements_json, confidence, model)
       SELECT ?, ?, ?, COALESCE(MAX(version), 0) + 1, 'proposed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM research_route_revisions WHERE track_id = ?`,
    ).bind(
      revisionId, space.id, track.id, source.inputRevision, draft.titleZh, draft.titleEn, draft.summaryZh, draft.summaryEn,
      draft.rationaleZh, draft.rationaleEn, track.title_zh, track.title_en, track.summary_zh, track.summary_en,
      JSON.stringify(source.basis.searchQueries), JSON.stringify(draft.searchQueries), JSON.stringify(draft.sourcePaperIds),
      JSON.stringify(draft.sourceStatementIds), JSON.stringify(sourcePapers), JSON.stringify(sourceStatements), draft.confidence, MODEL, track.id,
    ),
    database.prepare(
      `UPDATE research_route_revisions SET status = 'superseded', decided_at = COALESCE(decided_at, CURRENT_TIMESTAMP),
       updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND track_id = ? AND status = 'proposed' AND id <> ?`,
    ).bind(space.id, track.id, revisionId),
  ]);
  return { revisionId, cached: false };
}

async function decideResearchRouteEvolution(
  database: D1Database,
  spaceId: string,
  revisionId: string,
  decision: "confirm" | "dismiss",
) {
  const revision = await database.prepare(
    `SELECT revision.*, track.title_zh AS current_title_zh, track.title_en AS current_title_en,
     track.summary_zh AS current_summary_zh, track.summary_en AS current_summary_en,
     track.search_queries AS current_search_queries, track.monitoring_status
     FROM research_route_revisions revision JOIN research_tracks track
      ON track.id = revision.track_id AND track.space_id = revision.space_id
     WHERE revision.id = ? AND revision.space_id = ? LIMIT 1`,
  ).bind(revisionId, spaceId).first<RouteEvolutionRevisionRow & {
    current_title_zh: string; current_title_en: string; current_summary_zh: string; current_summary_en: string;
    current_search_queries: string; monitoring_status: string;
  }>();
  if (!revision) return { error: "Route revision not found", status: 404 as const };
  if (decision === "dismiss") {
    if (revision.status === "proposed") await database.prepare(
      "UPDATE research_route_revisions SET status = 'dismissed', decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ? AND status = 'proposed'",
    ).bind(revisionId, spaceId).run();
    return { changed: revision.status === "proposed" ? 1 : 0 };
  }
  const currentSource = await routeEvolutionBasis(database, spaceId, {
    id: revision.track_id,
    title_zh: revision.current_title_zh,
    title_en: revision.current_title_en,
    summary_zh: revision.current_summary_zh,
    summary_en: revision.current_summary_en,
    search_queries: revision.current_search_queries,
  } as TrackRow);
  if (!researchRouteEvolutionDecisionAllowed(revision.status, revision.input_revision, currentSource.inputRevision)) {
    return { error: "This proposal is stale because the route evidence changed. Generate a new proposal before confirming.", status: 409 as const };
  }
  await database.batch([
    database.prepare(
      `UPDATE research_route_revisions SET status = 'superseded', decided_at = COALESCE(decided_at, CURRENT_TIMESTAMP),
       updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND track_id = ? AND status = 'confirmed' AND id <> ?`,
    ).bind(spaceId, revision.track_id, revision.id),
    database.prepare(
      `UPDATE research_route_revisions SET status = 'confirmed', decided_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ? AND status = 'proposed'`,
    ).bind(revision.id, spaceId),
    database.prepare(
      `UPDATE research_tracks SET title_zh = ?, title_en = ?, summary_zh = ?, summary_en = ?, search_queries = ?,
       interaction_score = MIN(35, interaction_score + 4), intelligence_status = 'pending', intelligence_attempt_count = 0,
       intelligence_error = NULL, intelligence_retry_at = NULL, intelligence_lock_token = NULL,
       intelligence_lock_expires_at = NULL, intelligence_refresh_requested_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
    ).bind(revision.title_zh, revision.title_en, revision.summary_zh, revision.summary_en, revision.search_queries_json, revision.track_id, spaceId),
    database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date >= date('now')").bind(spaceId),
    database.prepare(
      `INSERT INTO research_paper_network_states (space_id, status, built_paper_count, model, sources_json, error, updated_at)
       VALUES (?, 'idle', 0, '', '[]', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id) DO UPDATE SET status = 'idle', error = NULL, updated_at = CURRENT_TIMESTAMP`,
    ).bind(spaceId),
  ]);
  return { changed: 1 };
}

async function readMap(database: D1Database, spaceId: string, extra: Record<string, unknown> = {}) {
  await ensureResearchRouteBaselines(database, spaceId);
  const [tracksResult, papersResult, edgesResult, paperEdgesResult, paperNetworkState, evidenceCountsResult, latestChangesResult, reviewQueueCountsResult, discoveryEffectsResult, routePortfolioCounts, routeRevisionsResult, routeEffectivenessResult, routeExperimentResult] = await Promise.all([
    database.prepare("SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, build_status, build_attempt_count, build_source_status_json, build_error, build_retry_at, user_role, monitoring_status, depth_score, support_score, interaction_score, intelligence_json, intelligence_model, intelligence_updated_at, intelligence_status, intelligence_attempt_count, intelligence_error, intelligence_retry_at, intelligence_lock_token, intelligence_lock_expires_at, intelligence_refresh_requested_at, updated_at FROM research_tracks WHERE space_id = ? ORDER BY position, created_at")
      .bind(spaceId).all<TrackRow>(),
    database.prepare(
      `SELECT tp.id, tp.track_id, tp.canonical_id, tp.doi, tp.title, tp.authors, tp.venue, tp.url,
       tp.published_at, tp.citation_count, tp.role, tp.summary_zh, tp.summary_en, tp.rationale_zh,
       tp.rationale_en, tp.curation_status, tp.curation_reason_code, tp.curation_reason_zh, tp.curation_reason_en,
       tp.curation_source, tp.curation_evidence_json, tp.curation_updated_at, tp.position, tp.created_at,
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
        FROM research_map_changes c WHERE c.space_id = ? AND ${formalResearchMapEvidencePredicate("c")}
       ) WHERE change_rank = 1`,
    ).bind(spaceId).all<TrackLatestChangeRow>(),
    database.prepare(RESEARCH_ROUTE_REVIEW_QUEUE_COUNTS_SQL)
      .bind(spaceId, spaceId).all<TrackReviewQueueCountRow>(),
    database.prepare(RESEARCH_ROUTE_DISCOVERY_EFFECT_SQL)
      .bind(spaceId, spaceId).all<TrackDiscoveryEffectRow>(),
    database.prepare(RESEARCH_ROUTE_PORTFOLIO_COUNTS_SQL)
      .bind(spaceId, spaceId, spaceId, spaceId).first<RoutePortfolioCountRow>(),
    database.prepare(
      `SELECT id, track_id, version, status, input_revision, title_zh, title_en, summary_zh, summary_en,
       rationale_zh, rationale_en, previous_title_zh, previous_title_en, previous_summary_zh, previous_summary_en,
       previous_search_queries_json, search_queries_json, source_paper_ids_json, source_statement_ids_json,
       source_papers_json, source_statements_json, confidence, model, decided_at, created_at, updated_at
       FROM (
        SELECT revision.*, ROW_NUMBER() OVER (PARTITION BY track_id ORDER BY version DESC, rowid DESC) AS revision_rank
        FROM research_route_revisions revision WHERE space_id = ?
       ) WHERE revision_rank <= 8 ORDER BY track_id, version DESC`,
    ).bind(spaceId).all<RouteEvolutionRevisionRow>(),
    database.prepare(RESEARCH_ROUTE_VERSION_EFFECT_SQL).bind(spaceId).all<ResearchRouteEffectivenessRow>(),
    database.prepare(RESEARCH_ROUTE_SHADOW_EXPERIMENT_SQL).bind(spaceId).all<ResearchRouteExperimentRow>(),
  ]);
  const evidenceCountsByTrack = new Map(evidenceCountsResult.results.map((row) => [row.track_id, row]));
  const reviewQueueCountsByTrack = new Map(reviewQueueCountsResult.results.map((row) => [row.track_id, row]));
  const discoveryEffectsByTrack = new Map(discoveryEffectsResult.results.map((row) => [row.track_id, row]));
  const latestChangeByTrack = new Map(latestChangesResult.results.map((row) => [row.track_id, row]));
  const effectivenessMetricsByTrack = new Map<string, ReturnType<typeof researchRouteEffectivenessMetrics>[]>();
  for (const row of routeEffectivenessResult.results) {
    const metrics = researchRouteEffectivenessMetrics(row);
    effectivenessMetricsByTrack.set(row.track_id, [...(effectivenessMetricsByTrack.get(row.track_id) || []), metrics]);
  }
  const routeExperimentArmsByTrack = new Map<string, ReturnType<typeof researchRouteExperimentMetrics>[]>()
  for (const row of routeExperimentResult.results) {
    routeExperimentArmsByTrack.set(row.track_id, [
      ...(routeExperimentArmsByTrack.get(row.track_id) || []),
      researchRouteExperimentMetrics(row),
    ]);
  }
  const routeExperimentByCurrentRevision = new Map<string, ReturnType<typeof evaluateResearchRouteShadowExperiment>>();
  for (const arms of routeExperimentArmsByTrack.values()) {
    const current = arms.find((arm) => arm.experimentArm === "current");
    const shadow = arms.find((arm) => arm.experimentArm === "shadow");
    if (current && shadow) routeExperimentByCurrentRevision.set(
      current.revisionId,
      evaluateResearchRouteShadowExperiment(current, shadow),
    );
  }
  const routeEffectivenessByRevision = new Map<string, ReturnType<typeof evaluateResearchRouteEffectiveness>>();
  for (const metrics of effectivenessMetricsByTrack.values()) {
    const ordered = [...metrics].sort((left, right) => left.version - right.version);
    ordered.forEach((item, index) => routeEffectivenessByRevision.set(item.revisionId, {
      ...evaluateResearchRouteEffectiveness(item, index > 0 ? ordered[index - 1] : null),
      ...(routeExperimentByCurrentRevision.has(item.revisionId)
        ? { shadowExperiment: routeExperimentByCurrentRevision.get(item.revisionId) }
        : {}),
    }));
  }
  const routeRevisionsByTrack = new Map<string, ResearchRouteRevision[]>();
  for (const row of routeRevisionsResult.results) {
    const revision: ResearchRouteRevision = {
      id: row.id,
      version: row.version,
      status: row.status,
      inputRevision: row.input_revision,
      titleZh: row.title_zh,
      titleEn: row.title_en,
      summaryZh: row.summary_zh,
      summaryEn: row.summary_en,
      rationaleZh: row.rationale_zh,
      rationaleEn: row.rationale_en,
      previousTitleZh: row.previous_title_zh,
      previousTitleEn: row.previous_title_en,
      previousSummaryZh: row.previous_summary_zh,
      previousSummaryEn: row.previous_summary_en,
      previousSearchQueries: parseJsonArray(row.previous_search_queries_json),
      searchQueries: parseJsonArray(row.search_queries_json),
      sourcePaperIds: parseJsonArray(row.source_paper_ids_json),
      sourceStatementIds: parseJsonArray(row.source_statement_ids_json),
      sourcePapers: parseJsonRecords(row.source_papers_json).flatMap((item) => {
        const paperId = cleanText(String(item.paperId || ""));
        const title = cleanText(String(item.title || ""));
        return paperId && title ? [{
          paperId,
          title,
          authors: cleanText(String(item.authors || "")),
          venue: cleanText(String(item.venue || "")),
          publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null,
        }] : [];
      }),
      sourceStatements: parseJsonRecords(row.source_statements_json).flatMap((item) => {
        const statementId = cleanText(String(item.statementId || ""));
        if (!statementId) return [];
        return [{
          statementId,
          kind: cleanText(String(item.kind || "")),
          titleZh: cleanText(String(item.titleZh || "")),
          titleEn: cleanText(String(item.titleEn || "")),
          textZh: cleanText(String(item.textZh || "")),
          textEn: cleanText(String(item.textEn || "")),
          confidence: boundedScore(item.confidence),
          sourcePaperIds: Array.isArray(item.sourcePaperIds) ? item.sourcePaperIds.filter((value): value is string => typeof value === "string") : [],
        }];
      }),
      confidence: row.confidence,
      model: row.model,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      effectiveness: routeEffectivenessByRevision.get(row.id),
    };
    routeRevisionsByTrack.set(row.track_id, [...(routeRevisionsByTrack.get(row.track_id) || []), revision]);
  }
  const papersByTrack = new Map<string, ResearchTrackPaper[]>();
  const deactivatedPapersByTrack = new Map<string, ResearchTrackPaper[]>();
  for (const row of papersResult.results) {
    const destination = row.curation_status === "deactivated" ? deactivatedPapersByTrack : papersByTrack;
    destination.set(row.track_id, [...(destination.get(row.track_id) || []), toPaper(row)]);
  }
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
    monitoringStatus: row.monitoring_status === "paused" ? "paused" : "active",
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
    discoveryEffect: (() => {
      const effect = discoveryEffectsByTrack.get(row.id);
      const discovered = Number(effect?.discovered_count || 0);
      const deepReviewed = Number(effect?.deep_reviewed_count || 0);
      const recommended = Number(effect?.recommended_count || 0);
      const accepted = Number(effect?.accepted_count || 0);
      const lastScannedAt = effect?.last_scanned_at || null;
      const task = (attempts: number) => ({ attempts, status: attempts > 0 ? "active" as const : "planned" as const });
      return {
        attemptCount: Number(effect?.attempt_count || 0),
        discoveredCount: discovered,
        deepReviewedCount: deepReviewed,
        recommendedCount: recommended,
        acceptedCount: accepted,
        deepReviewRate: discovered ? Math.round(deepReviewed / discovered * 100) : 0,
        recommendationRate: deepReviewed ? Math.round(recommended / deepReviewed * 100) : 0,
        acceptanceRate: recommended ? Math.round(accepted / recommended * 100) : 0,
        lastScannedAt,
        staleDays: lastScannedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(lastScannedAt)) / 86_400_000)) : null,
        tasks: {
          frontier: task(Number(effect?.frontier_attempts || 0)),
          foundation: task(Number(effect?.foundation_attempts || 0)),
          gap: task(Number(effect?.gap_attempts || 0)),
          network: task(Number(effect?.network_attempts || 0)),
        },
      };
    })(),
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
    routeRevisions: routeRevisionsByTrack.get(row.id) || [],
    buildStatus: defensiveResearchTrackBuildStatus(row.build_status, row.expansion_count, papersByTrack.get(row.id)?.length || 0),
    buildAttemptCount: Math.max(0, row.build_attempt_count || 0),
    buildSourceStatuses: parseTrackSourceStatuses(row.build_source_status_json),
    buildError: row.build_error,
    buildRetryAt: row.build_retry_at,
    intelligence: parseStoredIntelligence(row),
    intelligenceStatus: defensiveResearchTrackIntelligenceStatus(row.intelligence_status, Boolean(parseStoredIntelligence(row))),
    intelligenceRetryAt: row.intelligence_retry_at,
    intelligenceRefreshRequestedAt: row.intelligence_refresh_requested_at,
    updatedAt: row.updated_at,
    papers: papersByTrack.get(row.id) || [],
    deactivatedPapers: deactivatedPapersByTrack.get(row.id) || [],
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
  const activePaperIds = new Set(papersResult.results.filter((paper) => paper.curation_status !== "deactivated").map((paper) => paper.id));
  const activePaperRows = papersResult.results.filter((paper) => paper.curation_status !== "deactivated");
  const paperEdges = paperEdgesResult.results
    .filter((edge) => activePaperIds.has(edge.source_paper_id) && activePaperIds.has(edge.target_paper_id))
    .map(toPaperEdge)
    .filter((edge) => edge.kind !== "path")
    .filter((edge) => edge.kind !== "citation" || isDatabaseVerifiedCitationEdge(edge));
  const uniquePaperCount = new Set(activePaperRows.map((paper) => paper.canonical_id)).size;
  const storedNetworkState = paperNetworkState ? parseStoredPaperNetworkState(paperNetworkState.sources_json) : { sources: [], coverage: null };
  const currentPaperRevision = researchPaperSetRevision(activePaperRows.map(toCoverageCandidate));
  const storedCoverage = storedNetworkState.coverage;
  const needsStructure = tracks.length > 1 && !edges.length;
  const activeTracks = tracks.filter((track) => track.monitoringStatus === "active");
  const retryableTrackIds = activeTracks.filter((track) => track.buildStatus === "retryable" && track.buildAttemptCount < MAX_RESEARCH_TRACK_BUILD_ATTEMPTS).map((track) => track.id);
  const pendingTrackIds = activeTracks.filter((track) => track.buildStatus === "queued").map((track) => track.id).concat(retryableTrackIds);
  const partialTrackIds = activeTracks.filter((track) => track.buildStatus === "partial").map((track) => track.id);
  const emptyTrackIds = activeTracks.filter((track) => track.buildStatus === "empty").map((track) => track.id);
  const failedTrackIds = activeTracks.filter((track) => track.buildStatus === "failed").map((track) => track.id);
  const intelligenceEligibleTracks = activeTracks.filter((track) => ["ready", "partial"].includes(track.buildStatus) && track.papers.length > 0);
  const intelligenceNow = new Date().toISOString();
  const readyIntelligenceTracks = intelligenceEligibleTracks.filter((track) => track.intelligenceStatus === "ready" && track.intelligence);
  const pendingIntelligenceTrackIds = intelligenceEligibleTracks.filter((track) => track.intelligenceStatus === "pending"
    || (track.intelligenceStatus === "retryable" && (!track.intelligenceRetryAt || track.intelligenceRetryAt <= intelligenceNow))).map((track) => track.id);
  const retryableIntelligenceTrackIds = intelligenceEligibleTracks.filter((track) => track.intelligenceStatus === "retryable").map((track) => track.id);
  const runningIntelligenceTrackIds = intelligenceEligibleTracks.filter((track) => track.intelligenceStatus === "running").map((track) => track.id);
  const staleIntelligenceTrackIds = intelligenceEligibleTracks.filter((track) => track.intelligenceStatus !== "ready" && track.intelligence).map((track) => track.id);
  const precisionAuditProgress = await researchRoutePrecisionAuditProgress(database, spaceId);
  const routeCount = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));
  return {
    tracks,
    routePortfolio: {
      formalEvidenceCount: routeCount(routePortfolioCounts?.confirmed_evidence_count),
      structuralPaperCount: uniquePaperCount,
      discoveredCount: routeCount(routePortfolioCounts?.discovered_count),
      queuedCount: routeCount(routePortfolioCounts?.queued_count),
      reviewingCount: routeCount(routePortfolioCounts?.reviewing_count),
      deepReviewedCount: routeCount(routePortfolioCounts?.deep_reviewed_count),
      recommendedCount: routeCount(routePortfolioCounts?.recommended_count),
      acceptedCount: routeCount(routePortfolioCounts?.accepted_count),
      pendingEvidenceCount: routeCount(routePortfolioCounts?.pending_evidence_count),
      readyRouteCount: activeTracks.filter((track) => track.buildStatus === "ready").length,
      degradedRouteCount: activeTracks.filter((track) => ["partial", "retryable", "empty", "failed"].includes(track.buildStatus)).length,
      pausedRouteCount: tracks.filter((track) => track.monitoringStatus === "paused").length,
    },
    edges,
    paperEdges,
    paperNetwork: {
      status: paperNetworkState?.status || "idle",
      paperCount: uniquePaperCount,
      totalPaperCount: uniquePaperCount,
      builtPaperCount: paperNetworkState?.built_paper_count || 0,
      coveredPaperIds: (storedCoverage?.coveredPaperIds || []).filter((paperId) => activePaperIds.has(paperId)),
      coveredPaperHash: storedCoverage?.coveredPaperHash || "",
      coverageRevision: storedCoverage?.coverageRevision || 0,
      coverageCursor: storedCoverage?.nextCursor || 0,
      paperRevision: currentPaperRevision,
      builtPaperRevision: storedCoverage?.paperRevision || "",
      citationEdgeCount: paperEdges.filter(isDatabaseVerifiedCitationEdge).length,
      similarityEdgeCount: paperEdges.filter((edge) => edge.kind === "similarity").length,
      semanticEdgeCount: paperEdges.filter((edge) => edge.kind === "semantic").length,
      pathEdgeCount: 0,
      model: paperNetworkState?.model || "",
      sources: storedNetworkState.sources,
      updatedAt: paperNetworkState?.updated_at || null,
      error: paperNetworkState?.error || null,
    },
    model: MODEL,
    generated: tracks.length > 0,
    needsStructure,
    buildProgress: {
      ready: activeTracks.filter((track) => track.papers.length > 0).length,
      total: activeTracks.length,
      pendingTrackIds,
      retryableTrackIds,
      partialTrackIds,
      emptyTrackIds,
      failedTrackIds,
    },
    intelligenceProgress: {
      ready: readyIntelligenceTracks.length,
      total: intelligenceEligibleTracks.length,
      pendingTrackIds: pendingIntelligenceTrackIds,
      retryableTrackIds: retryableIntelligenceTrackIds,
      runningTrackIds: runningIntelligenceTrackIds,
      staleTrackIds: staleIntelligenceTrackIds,
    },
    precisionAuditProgress,
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
    const payload = await request.json() as { spaceId?: string; action?: "read" | "initialize" | "hydrate" | "expand" | "expand-gap" | "expand-problem" | "expand-action" | "expand-auto-gap" | "interpret" | "advance-intelligence" | "structure" | "activity" | "network" | "reconcile" | "curate-paper" | "audit-precision" | "propose-evolution"; trackId?: string; paperId?: string; curationStatus?: ResearchTrackPaperCurationStatus; curationReasonCode?: ResearchTrackPaperCurationReasonCode; actionRunId?: string; gapJobId?: string; gapJobToken?: string; activityKind?: "paper_opened" | "track_opened"; force?: boolean; networkPhase?: PaperNetworkBuildPhase };
    const spaceId = payload.spaceId?.trim() || "";
    if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    const { database, space, user } = context;
    if (payload.action === "read") return Response.json(await readMap(database, space.id, { cached: true }));
    if (payload.action === "curate-paper") {
      const trackId = payload.trackId?.trim() || "";
      const paperId = payload.paperId?.trim() || "";
      if (!trackId || !paperId || !["active", "deactivated"].includes(payload.curationStatus || "")) {
        return Response.json({ error: "trackId, paperId, and curationStatus are required" }, { status: 400 });
      }
      const result = await curateResearchTrackPaper(database, {
        spaceId: space.id,
        trackId,
        paperId,
        status: payload.curationStatus as ResearchTrackPaperCurationStatus,
        reasonCode: payload.curationReasonCode,
      });
      return Response.json(await readMap(database, space.id, { curationChanged: result.changed, curatedPaperId: paperId }));
    }
    const workspaceId = user.userId.replace(/^anonymous:/, "");
    const apiKey = resolveDeepSeekCredential(request).apiKey;
    const scheduledRetry = request.headers.get("x-pi-scheduled-route-retry") === "1";
    const memory = await importedMemory(database, space.id);

    if (payload.action === "propose-evolution") {
      const trackId = payload.trackId?.trim() || "";
      if (!trackId) return Response.json({ error: "trackId is required" }, { status: 400 });
      const track = await database.prepare(
        "SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, build_status, build_attempt_count, build_source_status_json, build_error, build_retry_at, user_role, monitoring_status, depth_score, support_score, interaction_score, intelligence_json, intelligence_model, intelligence_updated_at, intelligence_status, intelligence_attempt_count, intelligence_error, intelligence_retry_at, intelligence_lock_token, intelligence_lock_expires_at, intelligence_refresh_requested_at, updated_at FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1",
      ).bind(trackId, space.id).first<TrackRow>();
      if (!track) return Response.json({ error: "Research direction not found" }, { status: 404 });
      const proposal = await proposeResearchRouteEvolution(database, workspaceId, space, track, memory, apiKey);
      if ("error" in proposal) return Response.json({ error: proposal.error }, { status: proposal.status });
      return Response.json(await readMap(database, space.id, {
        routeEvolutionProposed: true,
        routeEvolutionRevisionId: proposal.revisionId,
        cached: proposal.cached,
      }));
    }

    if (payload.action === "audit-precision") {
      const audit = await auditExistingResearchRoutePrecision(database, workspaceId, space, apiKey);
      return Response.json(await readMap(database, space.id, {
        precisionAuditAppliedCount: audit.appliedCount,
        precisionAuditShadowedCount: audit.shadowedCount,
        precisionAuditDirectCount: audit.directCount,
        precisionAuditBorderlineCount: audit.borderlineCount,
        precisionAuditOffTopicCount: audit.offTopicCount,
        precisionAuditDegraded: audit.auditDegraded,
      }));
    }

    if (payload.action === "advance-intelligence" || payload.action === "interpret") {
      const preferredTrackId = payload.action === "interpret" ? payload.trackId?.trim() || "" : undefined;
      if (payload.action === "interpret" && !preferredTrackId) {
        return Response.json({ error: "trackId is required" }, { status: 400 });
      }
      if (preferredTrackId) await requestResearchTrackIntelligenceRefresh(database, space.id, preferredTrackId);
      const intelligenceAdvance = await advanceDirectionIntelligence(database, workspaceId, space, memory, apiKey, preferredTrackId);
      return Response.json(await readMap(database, space.id, { intelligenceAdvance }));
    }

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
          "INSERT INTO research_tracks (id, space_id, title_zh, title_en, summary_zh, summary_en, search_queries, position, expansion_count, build_status, user_role, depth_score, support_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, -1, 'queued', ?, ?, ?)",
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
    const problemExpanding = payload.action === "expand-problem";
    const actionExpanding = payload.action === "expand-action";
    const automaticGapExpanding = payload.action === "expand-auto-gap";
    const targetedExpanding = gapExpanding || problemExpanding || actionExpanding || automaticGapExpanding;
    const trackId = payload.trackId?.trim() || "";
    const track = await database.prepare(
      "SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, build_status, build_attempt_count, build_source_status_json, build_error, build_retry_at, user_role, monitoring_status, depth_score, support_score, interaction_score, intelligence_json, intelligence_model, intelligence_updated_at, intelligence_status, intelligence_attempt_count, intelligence_error, intelligence_retry_at, intelligence_lock_token, intelligence_lock_expires_at, intelligence_refresh_requested_at, updated_at FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1",
    ).bind(trackId, space.id).first<TrackRow>();
    if (!track) return Response.json({ error: "Research direction not found" }, { status: 404 });
    if (track.monitoring_status === "paused" && ["hydrate", "expand", "expand-gap", "expand-problem", "expand-action", "expand-auto-gap"].includes(payload.action || "")) {
      return Response.json({ error: "This research direction is paused. Resume it before starting new discovery." }, { status: 409 });
    }
    if (hydrating && track.build_status === "ready") return Response.json(await readMap(database, space.id, { cached: true, addedCount: 0 }));
    if (hydrating && track.build_attempt_count >= MAX_RESEARCH_TRACK_BUILD_ATTEMPTS && payload.force !== true) {
      return Response.json(await readMap(database, space.id, { cached: true, addedCount: 0, retryLimitReached: true }));
    }
    const queries = parseJsonArray(track.search_queries);
    if (!queries.length) throw new Error("This direction has no usable discovery queries");
    const synthesisGap = gapExpanding ? await database.prepare(
      "SELECT next_search_query FROM research_syntheses WHERE space_id = ? AND track_id = ? AND status IN ('ready', 'partial') AND next_search_query != '' LIMIT 1",
    ).bind(space.id, track.id).first<{ next_search_query: string }>() : null;
    const problemSignal = problemExpanding ? await activeResearchProblemDiscoverySignal(database, space.id, track.id) : null;
    const actionQuery = actionExpanding ? await database.prepare(
      `SELECT run.search_query FROM research_action_runs run
       JOIN research_problem_actions action ON action.id = run.action_id AND action.status = 'accepted' AND action.kind = 'search'
       WHERE run.id = ? AND run.space_id = ? AND run.track_id = ? AND run.status = 'ready'
        AND run.verification_status IN ('verified', 'revised') AND run.search_query != '' LIMIT 1`,
    ).bind(payload.actionRunId?.trim() || "", space.id, track.id).first<{ search_query: string }>() : null;
    if (automaticGapExpanding && request.headers.get("x-pi-scheduled-gap-discovery") !== "1") {
      return Response.json({ error: "Automatic evidence-gap discovery is scheduler-only" }, { status: 403 });
    }
    const automaticGapJob = automaticGapExpanding ? await database.prepare(
      `SELECT id, origin, signal_revision, query_text FROM research_gap_discovery_jobs
       WHERE id = ? AND space_id = ? AND track_id = ? AND status = 'running' AND lock_token = ? LIMIT 1`,
    ).bind(payload.gapJobId?.trim() || "", space.id, track.id, payload.gapJobToken?.trim() || "")
      .first<{ id: string; origin: string; signal_revision: string; query_text: string }>() : null;
    if (automaticGapExpanding && !automaticGapJob) {
      return Response.json({ error: "Automatic evidence-gap discovery lease is unavailable" }, { status: 409 });
    }
    if (automaticGapJob) {
      const currentAutomaticQuery = automaticGapJob.origin === "problem"
        ? (await activeResearchProblemDiscoverySignal(database, space.id, track.id))?.query || ""
        : automaticGapJob.origin === "synthesis"
          ? (await database.prepare(
            "SELECT next_search_query FROM research_syntheses WHERE space_id = ? AND track_id = ? AND status IN ('ready', 'partial') LIMIT 1",
          ).bind(space.id, track.id).first<{ next_search_query: string }>())?.next_search_query.trim() || ""
          : parseStoredIntelligence(track)?.nextSearchQuery.trim() || "";
      if (!currentAutomaticQuery || currentAutomaticQuery !== automaticGapJob.query_text.trim()) {
        return Response.json({ error: "The evidence-gap signal changed before discovery", automaticGapSuperseded: true }, { status: 409 });
      }
    }
    const targetedQuery = automaticGapExpanding ? automaticGapJob?.query_text.trim() || ""
      : actionExpanding ? actionQuery?.search_query.trim() || ""
      : problemExpanding ? problemSignal?.query || ""
        : gapExpanding ? synthesisGap?.next_search_query.trim() || parseStoredIntelligence(track)?.nextSearchQuery.trim() || "" : "";
    if (targetedExpanding && !targetedQuery) {
      return Response.json({ error: actionExpanding
        ? "Run a valid search action before targeted discovery"
        : problemExpanding ? "Refresh the research problem assessment before scanning its uncertainty"
          : "Refresh Pi's direction assessment before scanning this evidence gap" }, { status: 422 });
    }
    const direction: DirectionDraft = {
      key: track.id,
      titleZh: track.title_zh,
      titleEn: track.title_en,
      summaryZh: track.summary_zh,
      summaryEn: track.summary_en,
      searchQueries: targetedExpanding ? [targetedQuery] : queries,
      userRole: track.user_role,
      depthScore: track.depth_score,
      supportScore: track.support_score,
    };
    const [existing, allExistingIds] = await Promise.all([database.prepare(
      `SELECT tp.canonical_id, tp.title, tp.authors, tp.venue, tp.published_at, tp.citation_count, tp.role,
       tp.summary_zh, tp.summary_en, tp.rationale_zh, tp.rationale_en,
       CASE WHEN EXISTS (
        SELECT 1 FROM research_map_evidence_proposals ep
        JOIN monitored_papers mp ON mp.id = ep.paper_id AND mp.space_id = ep.space_id
        WHERE ep.space_id = tp.space_id AND ep.track_id = tp.track_id
         AND mp.canonical_id = tp.canonical_id AND ep.status = 'confirmed'
       ) THEN 'user_confirmed' ELSE 'system_curated' END AS provenance
       FROM research_track_papers tp WHERE tp.track_id = ? AND tp.curation_status = 'active' ORDER BY tp.position`,
    )
      .bind(track.id).all<ExistingPaperEvidence>(), database.prepare(
        "SELECT canonical_id FROM research_track_papers WHERE track_id = ?",
      ).bind(track.id).all<{ canonical_id: string }>()]);
    const existingEvidence = existing.results.map((item) => ({
      canonicalId: item.canonical_id, title: item.title, authors: item.authors, venue: item.venue, publishedAt: item.published_at,
      citations: item.citation_count, role: item.role, summaryZh: item.summary_zh, summaryEn: item.summary_en, rationaleZh: item.rationale_zh, rationaleEn: item.rationale_en,
      provenance: item.provenance,
    }));
    const offset = hydrating ? Math.max(0, track.build_attempt_count) * 14 : ((track.expansion_count + 1) * 16) % 608;
    const discovery = await discoverCandidates(database, [direction], offset, hydrating ? 14 : 16, hydrating ? track.build_attempt_count : 0);
    const existingIds = new Set(allExistingIds.results.map((row) => row.canonical_id));
    let candidates = discovery.candidates.filter((item) => !existingIds.has(item.canonicalId));
    const sourceStatuses = [...discovery.sources];
    const needsProtectedBaseline = hydrating
      ? candidates.length < 8 || discovery.errors.length > 0
      : targetedExpanding && (candidates.length < 4 || discovery.errors.length > 0);
    if (needsProtectedBaseline) {
      const baseline = await protectedBaselineCandidates(
        database,
        space.id,
        direction,
        new Set([...existingIds, ...candidates.map((item) => item.canonicalId)]),
        hydrating ? 12 : 6,
      );
      candidates = [...candidates, ...baseline];
      sourceStatuses.push({ source: "shared-monitor-baseline", role: "baseline", status: baseline.length ? "cached" : "empty", candidateCount: baseline.length });
    }
    const uniqueCandidates = new Map<string, MapCandidate>();
    for (const candidate of candidates) {
      const current = uniqueCandidates.get(candidate.canonicalId);
      if (!current || candidate.abstractText.length > current.abstractText.length || candidate.citationCount > current.citationCount) uniqueCandidates.set(candidate.canonicalId, candidate);
    }
    candidates = Array.from(uniqueCandidates.values()).slice(0, 36);
    let selectionError: unknown = null;
    let reviewed: Awaited<ReturnType<typeof selectPapers>> = { selections: [], intelligence: [], precisionJudgments: [] };
    if (candidates.length) {
      try {
        reviewed = await selectPapers(
          database,
          workspaceId,
          space,
          memory,
          [direction],
          candidates,
          hydrating ? "initialize" : "expand",
          apiKey,
          existingEvidence.map((item) => ({ canonicalId: item.canonicalId, title: item.title, publishedAt: item.publishedAt, role: item.role, summaryEn: item.summaryEn, rationaleEn: item.rationaleEn, provenance: item.provenance })),
        );
      } catch (error) {
        selectionError = error;
      }
    }
    const selections = reviewed.selections;
    const precisionByCandidate = new Map(reviewed.precisionJudgments.map((judgment) => [routePrecisionJudgmentIdentity(judgment), judgment]));
    const candidateById = new Map(candidates.map((item) => [item.canonicalId, item]));
    const inserted = new Set<string>();
    let position = existing.results.length;
    let addedCount = 0;
    const synthesisExpanding = gapExpanding && Boolean(synthesisGap?.next_search_query.trim());
    const automaticSourceKind = automaticGapJob?.origin === "problem" ? "problem"
      : automaticGapJob?.origin === "synthesis" ? "synthesis" : "gap";
    const queueCandidates = candidates.filter((candidate) => !routePrecisionAutoDeactivates(
      precisionByCandidate.get(`${candidate.directionKey}:${candidate.canonicalId}`),
    )).slice(0, 24).map((candidate) => {
      const sourceKind = automaticGapExpanding ? automaticSourceKind : actionExpanding ? "action" : problemExpanding ? "problem" : synthesisExpanding ? "synthesis" : gapExpanding ? "gap" : candidate.proposedRole;
      const querySuffix = automaticGapExpanding ? `auto:${automaticGapJob?.signal_revision}` : actionExpanding ? `action:${payload.actionRunId}` : problemExpanding ? `problem:${problemSignal?.assessmentRevision}` : synthesisExpanding ? `synthesis:${track.expansion_count + 1}`
        : gapExpanding ? `gap:${track.expansion_count + 1}` : `route:${track.expansion_count + 1}:${candidate.proposedRole}`;
      return {
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
        source: candidate.source === "shared-monitor-baseline" ? "research-route" : candidate.source,
        provenance: [{
          sourceKey: `research-route:${sourceKind}`,
          channel: candidate.source === "arxiv" ? "preprint" as const : candidate.source === "openalex" ? "semantic" as const : "topic" as const,
          queryKey: `${track.id}:${candidate.source}:${querySuffix}`,
          queryText: targetedExpanding ? targetedQuery : queries.join(" | "),
          routeId: track.id,
        }],
      };
    });
    const queueResult = await enqueueMonitorCandidates(database, space.id, queueCandidates, { recordDiscoveryCoverage: true });
    const targetedDegraded = discovery.errors.length > 0 || Boolean(selectionError);
    if (targetedExpanding && !automaticGapExpanding) await settleMatchingResearchGapDiscoveries(database, {
      spaceId: space.id,
      trackId: track.id,
      queryText: targetedQuery,
      degraded: targetedDegraded,
      queuedCount: queueResult.queuedForReviewCount,
      sourceStatuses,
    });
    if (targetedExpanding) {
      // Gap discovery is only a review candidate. Deep review creates the
      // pending evidence proposal if and only if it passes the quality gate.
      addedCount = queueResult.queuedForReviewCount;
    } else {
      inserted.clear();
      for (const selection of selections) {
        const candidate = candidateById.get(selection.canonicalId);
        if (!candidate || inserted.has(selection.canonicalId)) continue;
        inserted.add(selection.canonicalId);
        const precision = precisionByCandidate.get(`${selection.directionKey}:${selection.canonicalId}`);
        if (!routePrecisionAcceptedForActiveNode(precision)) continue;
        const trackPaperId = crypto.randomUUID();
        const insertion = await database.prepare(
          `INSERT OR IGNORE INTO research_track_papers
           (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role, summary_zh, summary_en, rationale_zh, rationale_en, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(trackPaperId, track.id, space.id, candidate.canonicalId, candidate.doi, candidate.title, candidate.authors, candidate.venue,
          candidate.url, candidate.publishedAt, candidate.citationCount, selection.role, selection.summaryZh, selection.summaryEn,
          selection.rationaleZh, selection.rationaleEn, position++).run();
        if (!Number(insertion.meta.changes || 0)) continue;
        await database.prepare(
          `INSERT INTO research_track_paper_precision_audits
           (id, space_id, track_id, track_paper_id, gate_version, verdict, confidence, reason_zh, reason_en, evidence_json, model, status)
           VALUES (?, ?, ?, ?, ?, 'direct', ?, ?, ?, ?, ?, 'shadow')`,
        ).bind(crypto.randomUUID(), space.id, track.id, trackPaperId, RESEARCH_ROUTE_PRECISION_GATE_VERSION,
          precision.confidence, precision.reasonZh, precision.reasonEn, JSON.stringify(precision.evidenceTerms), MODEL).run();
        addedCount += 1;
      }
    }
    let resolvedBuildStatus: string | null = null;
    if (!targetedExpanding) {
      const deferredForCredential = scheduledRetry && candidates.length > 0 && !apiKey;
      const nextAttemptCount = nextResearchTrackBuildAttemptCount({
        currentAttemptCount: track.build_attempt_count,
        deferredForCredential,
        force: payload.force === true,
        storedStatus: track.build_status,
      });
      const buildStatus = resolveResearchTrackBuildStatus({
        existingPaperCount: existing.results.length,
        selectedPaperCount: addedCount,
        candidateCount: candidates.length,
        sourceSuccessCount: sourceStatuses.filter((source) => source.status !== "failed").length,
        sourceFailureCount: sourceStatuses.filter((source) => source.status === "failed").length,
        modelAttempted: candidates.length > 0,
        modelSucceeded: candidates.length === 0 || !selectionError,
        attemptCount: nextAttemptCount,
      });
      const issueCodes = [
        discovery.errors.length ? "source_unavailable" : "",
        selectionError ? deferredForCredential ? "model_credential_required" : "model_unavailable" : "",
        existing.results.length + addedCount === 0 ? "no_visible_evidence" : "",
      ].filter(Boolean);
      const retryAt = buildStatus === "retryable"
        ? researchTrackRetryAt(nextAttemptCount, deferredForCredential ? Date.now() + 6 * 60 * 60 * 1000 : Date.now())
        : null;
      await database.prepare(
        `UPDATE research_tracks SET
         expansion_count = CASE WHEN ? = 1 AND ? > 0 THEN 0 WHEN ? = 0 THEN expansion_count + 1 ELSE expansion_count END,
         build_status = ?, build_attempt_count = ?, build_source_status_json = ?, build_error = ?, build_retry_at = ?,
         interaction_score = CASE WHEN ? = 0 THEN MIN(35, interaction_score + 5) ELSE interaction_score END,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
      ).bind(
        hydrating ? 1 : 0, existing.results.length + addedCount, hydrating ? 1 : 0,
        buildStatus, nextAttemptCount, JSON.stringify(sourceStatuses), issueCodes.join(",") || null, retryAt,
        hydrating ? 1 : 0, track.id, space.id,
      ).run();
      resolvedBuildStatus = buildStatus;
      await recordResearchRouteReliabilityEvent(database, space.id, {
        trackId: track.id,
        outcome: buildStatus === "ready" ? "success" : buildStatus === "partial" || buildStatus === "retryable" ? "degraded" : "failed",
        message: `Research route build resolved ${buildStatus}`,
        metadata: {
          scheduledRetry,
          attemptCount: nextAttemptCount,
          candidateCount: candidates.length,
          topicalRejectedCount: discovery.topicalRejectedCount,
          selectedPaperCount: addedCount,
          retainedPaperCount: existing.results.length,
          queuedForReviewCount: queueResult.queuedForReviewCount,
          sourceStatuses,
          issueCodes,
        },
      });
    }
    if (!targetedExpanding) {
      const refreshedIntelligence = reviewed.intelligence[0] || null;
      if (refreshedIntelligence) await saveDirectionIntelligence(database, space.id, track.id, refreshedIntelligence);
      else if (addedCount > 0) {
        await database.prepare(
          `UPDATE research_tracks SET intelligence_status = 'pending', intelligence_attempt_count = 0,
           intelligence_error = NULL, intelligence_retry_at = NULL, intelligence_lock_token = NULL,
           intelligence_lock_expires_at = NULL, intelligence_refresh_requested_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
        ).bind(track.id, space.id).run();
      }
    }
    return Response.json(await readMap(database, space.id, {
      cached: false,
      addedCount,
      reviewQueuedCount: queueResult.queuedForReviewCount,
      reviewInProgressCount: queueResult.reviewingCount,
      alreadyReviewedCount: queueResult.alreadyReviewedCount,
      discoveredRouteCandidateCount: candidates.length,
      topicalRejectedCandidateCount: discovery.topicalRejectedCount,
      routeSourceStatuses: sourceStatuses,
      routeBuildStatus: resolvedBuildStatus,
      routeBuildDegraded: targetedDegraded,
      hydratedTrackId: hydrating ? track.id : null,
      gapExpanded: gapExpanding,
      problemExpanded: problemExpanding,
      actionExpanded: actionExpanding,
      automaticGapExpanded: automaticGapExpanding,
      gapQuery: targetedExpanding ? targetedQuery : undefined,
    }));
  } catch (error) {
    if (error instanceof ResearchTrackPaperCurationError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.code === "not_found" ? 404 : 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to build the research map" }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { spaceId?: string; trackId?: string; userRole?: ResearchDirectionRole; monitoringStatus?: "active" | "paused"; action?: "confirm-evolution" | "dismiss-evolution"; revisionId?: string };
    const spaceId = payload.spaceId?.trim() || "";
    const trackId = payload.trackId?.trim() || "";
    const hasUserRole = DIRECTION_ROLES.has(payload.userRole as ResearchDirectionRole);
    const hasMonitoringStatus = payload.monitoringStatus === "active" || payload.monitoringStatus === "paused";
    const hasEvolutionDecision = payload.action === "confirm-evolution" || payload.action === "dismiss-evolution";
    if (!spaceId || (!hasEvolutionDecision && (!trackId || (!hasUserRole && !hasMonitoringStatus))) || (hasEvolutionDecision && !payload.revisionId?.trim())) {
      return Response.json({ error: "A valid route update or evolution decision is required" }, { status: 400 });
    }
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    if (hasEvolutionDecision) {
      const decision = await decideResearchRouteEvolution(
        context.database,
        context.space.id,
        payload.revisionId?.trim() || "",
        payload.action === "confirm-evolution" ? "confirm" : "dismiss",
      );
      if ("error" in decision) return Response.json({ error: decision.error }, { status: decision.status });
      return Response.json(await readMap(context.database, context.space.id, {
        routeEvolutionDecision: payload.action,
        routeEvolutionChanged: decision.changed,
      }));
    }
    if (hasUserRole) {
      await context.database.prepare("UPDATE research_tracks SET user_role = ?, interaction_score = MIN(35, interaction_score + 3), intelligence_status = 'pending', intelligence_attempt_count = 0, intelligence_error = NULL, intelligence_retry_at = NULL, intelligence_lock_token = NULL, intelligence_lock_expires_at = NULL, intelligence_refresh_requested_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
        .bind(payload.userRole, trackId, context.space.id).run();
    }
    if (hasMonitoringStatus) {
      await context.database.prepare("UPDATE research_tracks SET monitoring_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
        .bind(payload.monitoringStatus, trackId, context.space.id).run();
    }
    return Response.json(await readMap(context.database, context.space.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update the research direction" }, { status: 500 });
  }
}
