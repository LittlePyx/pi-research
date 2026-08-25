import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { arxivIdFromUrl, buildArxivSearchQuery, normalizeWorkTitle, parseArxivAtom } from "../../../lib/discovery/arxiv";
import {
  benchmarkCalibrationPrompt,
  discoveryCalibrationSignals,
  mergeBenchmarkQueryCoverage,
} from "../../../lib/discovery/benchmark.mjs";
import { hasStrongFitScoreContradiction, inferModelScoreScale, normalizeModelScore } from "../../../lib/discovery/model-score";
import { passesRecommendationGate } from "../../../lib/discovery/review-gate";
import {
  deepCandidateScore,
  formalRecommendationRescueSize,
  isContinuityDeepCandidate,
  isPrimaryDeepCandidate,
  isRescueDeepCandidate,
  selectBalancedByGroup,
  selectBudgetedDeepReviewCandidates,
  summarizeDeepSelectionOutcomes,
} from "../../../lib/discovery/candidate-selection.mjs";
import {
  buildFreshYieldFunnel,
  formalYieldBranchAdjustment,
  shouldRefreshFreshYieldPlan,
} from "../../../lib/discovery/fresh-yield.mjs";
import { passiveBranchBoost } from "../../../lib/passive-engagement.mjs";
import { mergeDailyBriefHistory } from "../../../lib/daily-brief-history.mjs";
import { readPreferenceSignals, upsertPreferenceSignal } from "../../../lib/preference-memory";
import { normalizedDeepSeekProbeError, resolveDeepSeekCredential, verifyDeepSeekCredential } from "../../../lib/model-credentials";
import {
  hasCompleteRecommendationDraft,
  isRetryableEmptyDraftDegradation,
  recommendationDraftMissingFields,
  verifierContradictsCompleteDraft,
} from "../../../lib/recommendation-draft.mjs";
import {
  RECOMMENDATION_VERIFICATION_FIELDS,
  abstractEvidenceUnits,
  evidenceVerificationReport,
  recommendationEvidencePreflight,
  sanitizeEvidenceVerificationDraft,
  type EvidenceVerificationStatus,
  type VerificationEvidenceUnit,
} from "../../../lib/evidence-verification";
import {
  MONITOR_AUTOMATION_LIMITS,
  monitorAutomationPauseCopy,
  monitorAutomationPauseReason,
} from "../../../lib/monitor-automation.mjs";
import { enqueueMonitorCandidates } from "../../../lib/monitor-candidate-queue";
import { buildReliabilityProgram } from "../../../lib/monitor-reliability.mjs";
import {
  deepReviewCompletion,
  isFatalModelFailure,
  modelFailureCode,
  settleFaultTolerantBatch,
  shouldOpenDeepReviewCircuit,
} from "../../../lib/monitor-fault-policy.mjs";
import {
  LATEST_AUDIT_ROUTE_ORIGIN_SUBQUERY,
  PRE_REVIEW_ROUTE_ORIGIN_SUBQUERY,
  RECENT_CONFIRMED_ROUTE_EVIDENCE_SQL,
  RESEARCH_GUIDANCE_REVISIONS_SQL,
  RESEARCH_GUIDANCE_TRACKS_SQL,
  isMonitorRouteProvenance,
  monitorPaperNotDismissedSql,
  monitorRouteOriginKind,
  retainReviewableScanWork,
  retainChangedMonitorWrites,
  reviewableScanCandidateIdsSql,
  researchGuidanceIdentity,
  selectPrioritizedDiscoveryPlans,
  type ConfirmedRouteEvidenceSnapshot,
  type ResearchGuidanceTrackSnapshot,
} from "../../../lib/monitor-route-planning";
import { formalResearchMapEvidencePredicate, promoteAlreadyAcceptedResearchMapEvidence, SYSTEM_CURATED_RESEARCH_MAP_REVIEW_ID_PREFIX, upsertPendingResearchMapEvidence } from "../../../lib/research-map-evidence";
import { fetchSemanticScholar } from "../../../lib/semantic-scholar";
import { getDomainProfile, inferDomainProfile } from "./domain-profiles";

type Horizon = "days" | "months" | "years";
type ScanTrigger = "manual" | "scheduled" | "visit";
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
  last_trigger: string;
  last_user_activity_at: string | null;
  scheduled_runs_since_activity: number;
  automation_paused_at: string | null;
  automation_pause_reason: string;
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
  attempt: number;
  trigger_source: string;
  resume_of_job_id: string | null;
  checkpoint: string;
  first_recommendation_at: string | null;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  work_queue_json?: string;
};
type DailyBriefRow = {
  brief_date: string;
  status: string;
  headline_zh: string;
  headline_en: string;
  overview_zh: string;
  overview_en: string;
  signals_zh: string;
  signals_en: string;
  reading_plan_zh: string;
  reading_plan_en: string;
  watchlist_zh: string;
  watchlist_en: string;
  paper_ids: string;
  metrics_json: string;
  model: string;
  error: string | null;
  updated_at: string;
};
type WeeklyReviewRow = {
  week_key: string;
  status: string;
  title_zh: string;
  title_en: string;
  overview_zh: string;
  overview_en: string;
  gains_zh: string;
  gains_en: string;
  gaps_zh: string;
  gaps_en: string;
  next_steps_zh: string;
  next_steps_en: string;
  source_days: number;
  model: string;
  error: string | null;
  updated_at: string;
};
type NotificationRow = {
  id: string;
  kind: string;
  priority: string;
  title_zh: string;
  title_en: string;
  body_zh: string;
  body_en: string;
  action_view: string;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
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
  last_recommended_at: string | null;
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
  proposed_recommendation_tier: string;
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
  research_problem_id: string;
  problem_fit_score: number;
  uncertainty_reduction_score: number;
  actionability_score: number;
  research_problem_impact_zh: string;
  research_problem_impact_en: string;
  research_decision_zh: string;
  research_decision_en: string;
  verification_status: EvidenceVerificationStatus;
  verification_coverage_score: number;
  verification_json: string;
  track_id: string;
  discovery_provider: string;
  discovery_channels: string;
  discovery_source_key: string;
  discovery_route_id: string;
  discovery_route_interaction: number;
  discovery_track_title_zh: string;
  discovery_track_title_en: string;
  quality_stage: "discovered" | "reviewed" | "reviewing" | "recommended";
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
  source: "crossref" | "semantic_scholar" | "openalex" | "arxiv" | "research-route" | "research-network";
  discoveryChannel: "topic" | "journal" | "author" | "semantic" | "preprint" | "citation";
  provenance: CandidateProvenance[];
};
type CandidateProvenance = {
  sourceKey: string;
  channel: Candidate["discoveryChannel"];
  queryKey: string;
  queryText?: string;
  routeId?: string;
  appearances?: number;
};

type RouteReviewTitle = { titleZh: string; titleEn: string };

function routeReviewOrigins(candidate: Candidate, trackTitles: Map<string, RouteReviewTitle> = new Map()) {
  return candidate.provenance
    .filter(isMonitorRouteProvenance)
    .slice(0, 6)
    .map((entry) => {
      const title = entry.routeId ? trackTitles.get(entry.routeId) : undefined;
      return {
        routeId: entry.routeId || null,
        routeTitleZh: title?.titleZh || "",
        routeTitleEn: title?.titleEn || "",
        sourceKind: monitorRouteOriginKind(entry.sourceKey, entry.routeId) || entry.sourceKey,
        queryContext: cleanText(entry.queryText || "").slice(0, 300),
      };
    });
}

async function loadRouteReviewTitles(database: D1Database, spaceId: string, candidates: Candidate[]) {
  const routeIds = Array.from(new Set(candidates.flatMap((candidate) => candidate.provenance.map((entry) => entry.routeId || "")).filter(Boolean))).slice(0, 30);
  if (!routeIds.length) return new Map<string, RouteReviewTitle>();
  const rows = await database.prepare(
    `SELECT id, title_zh, title_en FROM research_tracks WHERE space_id = ? AND id IN (${routeIds.map(() => "?").join(", ")})`,
  ).bind(spaceId, ...routeIds).all<{ id: string; title_zh: string; title_en: string }>();
  return new Map(rows.results.map((row) => [row.id, { titleZh: row.title_zh, titleEn: row.title_en }]));
}
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
  routeId?: string;
  explorationRole?: "core" | "adjacent";
  adaptiveScore?: number;
  routeUrgency?: number;
};
type DiscoveryBranchScore = {
  sourceKey: string;
  queryKey: string;
  papers: number;
  accepted: number;
  dismissed: number;
  known: number;
  wrongType: number;
  engagedPapers: number;
  engagementWeight: number;
  attempts: number;
  candidates: number;
  newCandidates: number;
  deepReviewed: number;
  formalRecommended: number;
  evidenceRejected: number;
  score: number;
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
  mapRole: "foundation" | "milestone" | "frontier";
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
  researchProblemId: string;
  problemFitScore: number;
  uncertaintyReductionScore: number;
  actionabilityScore: number;
  researchProblemImpactZh: string;
  researchProblemImpactEn: string;
  researchDecisionZh: string;
  researchDecisionEn: string;
  verificationStatus: EvidenceVerificationStatus;
  verificationCoverageScore: number;
  verificationReport: Record<string, unknown>;
  verificationInputTokens: number;
  verificationOutputTokens: number;
  verificationRetryable: boolean;
  proposedRecommendationTier: "must_read" | "browse" | "reserve";
  evidenceLevel: "metadata" | "abstract" | "fulltext";
  evidenceStatus: "unavailable" | "queued" | "fetching" | "ready" | "partial" | "error";
  evidenceGroundedClaims: number;
  evidenceUnsupportedClaims: number;
  evidenceCoverageScore: number;
};

function paperReviewMapRole(value: unknown): PaperReview["mapRole"] {
  return value === "foundation" || value === "milestone" ? value : "frontier";
}
type QuickScreen = {
  canonicalId: string;
  isPaper: boolean;
  relevanceScore: number;
  qualityScore: number;
  screeningReason: string;
  horizon?: Horizon;
};
type HorizonScanStats = {
  rawCandidates: number;
  candidates: number;
  newCandidates: number;
  queued: number;
  completed: boolean;
};
type ScanWorkQueue = {
  candidateIds: string[];
  currentCandidateIds: string[];
  screens: QuickScreen[];
  deepIds: string[];
  deepSelectionOrigins: Record<string, "fresh" | "route" | "backlog">;
  selectionFailureReasons: Record<string, number>;
  deepCompletedIds: string[];
  deepDeferredIds: string[];
  retryDeepIds: string[];
  verificationIds: string[];
  verificationCompletedIds: string[];
  verificationDeferredIds: string[];
  verificationAttempts: Record<string, number>;
  draftRegenerationAttempts: Record<string, number>;
  evidenceIds: string[];
  evidenceCompletedIds: string[];
  rescueScreenIds: string[];
  rescueScreened: boolean;
  rawCandidateCount: number;
  newCandidateCount: number;
  screenFailureCount: number;
  deepFailureCount: number;
  verificationFailureCount: number;
  pipelineVersion: string;
  horizonStats: Record<Horizon, HorizonScanStats>;
  frozenQueryPlan?: QueryPlan;
  resumeCheckpoint?: string;
};
type StagedJobRow = ScanJobRow & { work_queue_json: string };
type DirectionDiscoverySignal = {
  opportunityEn: string;
  watchSignalEn: string;
  evidenceGapEn: string;
  nextSearchQuery: string;
  confidence: number;
  evidenceCanonicalIds: string[];
  updatedAt: string;
};
type MapTrackContext = {
  id: string;
  title_zh: string;
  title_en: string;
  summary_en: string;
  search_queries: string;
  intelligence_json: string;
  intelligence_updated_at: string | null;
};

const CADENCE_MS = 24 * 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 60 * 1000;
const ERROR_RETRY_MS = 15 * 60 * 1000;
const STALE_RUN_MS = 20 * 60 * 1000;
const RUN_LOCK_LEASE_MS = 10 * 60 * 1000;
const DISCOVERY_OFFSET_LIMIT = 3000;
const DIRECTION_INTELLIGENCE_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const REVIEW_BATCH_SIZE = 14;
const QUICK_SCREEN_BATCH_SIZE = 14;
const QUICK_SCREEN_CONCURRENCY = 2;
const DEEP_REVIEW_BATCH_SIZE = 1;
const DEEP_REVIEW_CONCURRENCY = 2;
const DEEP_REVIEW_LIMIT = 8;
const DEEP_REVIEW_RESCUE_LIMIT = 6;
const DEEP_REVIEW_MAX_LIMIT = DEEP_REVIEW_LIMIT + DEEP_REVIEW_RESCUE_LIMIT;
const DAILY_RECOMMENDATION_MIN_TARGET = 3;
const DAILY_RECOMMENDATION_MAX_TARGET = 6;
const HIGH_POTENTIAL_DRAFT_TARGET = 5;
const DEEP_REVIEW_CARRYOVER_LIMIT = 2;
const RESCUE_SCREEN_LIMIT = 8;
const HORIZON_REVIEW_LIMITS: Record<Horizon, number> = { days: 12, months: 16, years: 28 };
const HORIZON_POOL_LIMITS: Record<Horizon, number> = { days: 80, months: 100, years: 140 };
const CANDIDATE_WORK_QUEUE_LIMIT = Object.values(HORIZON_POOL_LIMITS).reduce((sum, value) => sum + value, 0);
const HORIZONS = [
  { key: "days" as const, daysFrom: 14, daysUntil: 0, sort: "relevance" },
  { key: "months" as const, daysFrom: 180, daysUntil: 15, sort: "relevance" },
  { key: "years" as const, daysFrom: 365 * 5, daysUntil: 181, sort: "is-referenced-by-count" },
] as const;
const MONITOR_REVIEW_PIPELINE_RELEASED_AT = "2026-08-19T11:36:00.000Z";
const MONITOR_LLM_REVIEW_RELEASED_AT = Date.parse(MONITOR_REVIEW_PIPELINE_RELEASED_AT);
const MONITOR_QUERY_PLAN_RELEASED_AT = Date.parse("2026-08-23T12:00:00.000Z");
const MONITOR_PIPELINE_VERSION = "continuous-recommendation-v13-bounded-verification";
const COMPATIBLE_MONITOR_PIPELINE_VERSIONS = new Set([
  MONITOR_PIPELINE_VERSION,
  "continuous-recommendation-v12-fresh-yield",
]);
const MONITOR_RELIABILITY_PERIOD_DAYS = 14;
const QUICK_SCREEN_FAST_TIMEOUT_MS = 24_000;
const QUICK_SCREEN_RESCUE_TIMEOUT_MS = 28_000;
const QUICK_SCREEN_RETRY_TIMEOUT_MS = 12_000;
const DEEP_REVIEW_PRIMARY_TIMEOUT_MS = 22_000;
const DEEP_REVIEW_RETRY_TIMEOUT_MS = 16_000;
const VERIFICATION_TIMEOUT_MS = 24_000;
const VERIFICATION_CORRECTION_TIMEOUT_MS = 32_000;
// One independent audit plus one evidence-grounded correction/final decision. Content failures never loop.
const VERIFICATION_ATTEMPT_LIMIT = 2;
const VERIFICATION_BATCH_SIZE = 2;
const INCOMPLETE_DRAFT_REGENERATION_LIMIT = 1;
const VERIFICATION_CIRCUIT_FAILURE_LIMIT = 3;
const BACKGROUND_VERIFICATION_RETRY_MS = 10 * 60 * 1000;
const ADVANCE_LOCK_LEASE_MS = 45_000;
const MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT = 600;
const MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT = 120;
const MONITOR_SPACE_DAILY_ANALYSIS_LIMIT = 64;
const MONITOR_MINIMUM_NEW_SCAN_ANALYSIS_CALLS = 16;
const MONITOR_SEMANTIC_SCHOLAR_DAILY_LIMIT = 90;
const MONITOR_MODEL = "deepseek-v4-pro";
const RECOMMENDATION_THRESHOLD = 72;
const DEEPSEEK_BALANCE_ERROR = "deepseek_insufficient_balance";
const DEEPSEEK_CREDENTIAL_ERROR = "deepseek_credential_invalid";
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
  ["annals of mathematics", "0003-486X"],
  ["journal of the european mathematical society", "1435-9855"],
  ["probability theory and related fields", "0178-8051"],
  ["analysis & pde", "1948-206X"],
  ["duke mathematical journal", "0012-7094"],
  ["mathematical programming", "0025-5610"],
  ["siam journal on optimization", "1052-6234"],
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

function directionDiscoverySignal(value: string, updatedAt: string | null = null): DirectionDiscoverySignal | null {
  try {
    const parsed = JSON.parse(value || "{}") as Record<string, unknown>;
    const evidenceCanonicalIds = Array.isArray(parsed.evidenceCanonicalIds)
      ? parsed.evidenceCanonicalIds.map((item) => cleanText(String(item))).filter(Boolean).slice(0, 12)
      : [];
    const confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0)));
    const updatedAtMs = updatedAt ? databaseTime(updatedAt) : 0;
    const isFresh = updatedAtMs > 0 && Date.now() - updatedAtMs <= DIRECTION_INTELLIGENCE_MAX_AGE_MS;
    if (confidence < 60 || !evidenceCanonicalIds.length || !isFresh) return null;
    const signal = {
      opportunityEn: cleanText(String(parsed.opportunityEn || "")).slice(0, 700),
      watchSignalEn: cleanText(String(parsed.watchSignalEn || "")).slice(0, 700),
      evidenceGapEn: cleanText(String(parsed.evidenceGapEn || "")).slice(0, 700),
      nextSearchQuery: cleanText(String(parsed.nextSearchQuery || "")).slice(0, 220),
      confidence,
      evidenceCanonicalIds,
      updatedAt: updatedAt!,
    };
    return signal.nextSearchQuery || signal.evidenceGapEn || signal.watchSignalEn || signal.opportunityEn ? signal : null;
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

function parseVenues(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function sanitizeRetiredFulltextCopy(value: string) {
  return value
    .replace(/并为\s*\d+\s*篇高潜力论文补强原文证据，/g, "并完成书目与摘要证据核对，")
    .replace(/全文证据门槛/g, "推荐证据核对门槛")
    .replace(/全文证据/g, "书目与摘要证据")
    .replace(/开放全文/g, "可核验来源")
    .replace(/full[- ]text evidence/gi, "verifiable evidence")
    .replace(/open full text/gi, "verifiable sources")
    .replace(/full[- ]text bar/gi, "bibliographic and abstract evidence bar");
}

function parseSanitizedBriefList(value: string) {
  return parseVenues(value).map(sanitizeRetiredFulltextCopy);
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
    url: item.externalIds?.ArXiv ? "https://arxiv.org/abs/" + item.externalIds.ArXiv
      : item.url || (doi ? "https://doi.org/" + doi : ""),
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
    const isAdjacentBridge = queryPlan?.explorationMode !== "focused" && index === (queryPlan?.queries[horizon.key]?.length || 0) - 1;
    queries.push({
      key: `ai-plan-${index + 1}`,
      sourceKey: `crossref:ai-plan:${index + 1}`,
      query,
      sort: horizon.key === "days" ? "published" : horizon.sort,
      rotating: true,
      channel: "topic",
      explorationRole: isAdjacentBridge ? "adjacent" : "core",
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
  return queries.map((item) => ({ ...item, explorationRole: item.explorationRole || "core", query: cleanText(item.query).slice(0, 480) })).filter((item) => item.query.length >= 4);
}

async function discoveryQueryKey(query: DiscoveryQuery) {
  const identity = [query.key, query.sourceKey, query.channel, query.routeId || "", query.query.toLocaleLowerCase(), query.venue?.toLocaleLowerCase() || "", query.issn || "", query.sort].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const suffix = Array.from(new Uint8Array(digest)).slice(0, 10).map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${query.key}:${suffix}`;
}

function adaptiveBranchScore(input: Omit<DiscoveryBranchScore, "score">) {
  const decisions = input.accepted + input.dismissed;
  const acceptanceRate = decisions ? input.accepted / decisions : 0;
  const dismissalRate = decisions ? input.dismissed / decisions : 0;
  const wrongTypeRate = decisions ? input.wrongType / decisions : 0;
  const discoveryYield = input.candidates ? input.newCandidates / input.candidates : 0;
  let score = 55;
  if (decisions) score += acceptanceRate * 30 - dismissalRate * 28 - wrongTypeRate * 16;
  score += passiveBranchBoost(input);
  if (input.known) score += Math.min(6, input.known * 2);
  if (input.candidates) score += Math.min(15, discoveryYield * 15);
  score += formalYieldBranchAdjustment(input);
  if (input.attempts >= 2 && input.newCandidates === 0) score -= Math.min(20, input.attempts * 4);
  return Math.max(5, Math.min(95, Math.round(score)));
}

async function loadDiscoveryBranchScores(database: D1Database, spaceId: string) {
  const [feedbackRows, engagementRows, coverageRows, reviewRows] = await Promise.all([
    database.prepare(
      `SELECT cs.source_key, cs.query_key, COUNT(DISTINCT cs.paper_id) AS papers,
       SUM(CASE WHEN f.saved = 1 OR f.feedback = 'relevant' OR r.status IN ('read','mastered','cited') THEN 1 ELSE 0 END) AS accepted,
       SUM(CASE WHEN f.feedback = 'not_relevant' AND COALESCE(f.reason_code, '') <> 'duplicate_known' THEN 1 ELSE 0 END) AS dismissed,
       SUM(CASE WHEN f.feedback = 'not_relevant' AND f.reason_code = 'wrong_type' THEN 1 ELSE 0 END) AS wrong_type,
       SUM(CASE WHEN f.reason_code = 'duplicate_known' OR r.status = 'mastered' THEN 1 ELSE 0 END) AS known
       FROM monitor_candidate_sources cs
       LEFT JOIN paper_feedback f ON f.paper_id = cs.paper_id AND f.space_id = cs.space_id
       LEFT JOIN paper_reading_progress r ON r.paper_id = cs.paper_id AND r.space_id = cs.space_id
       WHERE cs.space_id = ? GROUP BY cs.source_key, cs.query_key`,
    ).bind(spaceId).all<{ source_key: string; query_key: string; papers: number; accepted: number; dismissed: number; wrong_type: number; known: number }>(),
    database.prepare(
      `SELECT cs.source_key, cs.query_key, COUNT(DISTINCT cs.paper_id) AS engaged_papers,
       SUM(CASE WHEN engagement.paper_weight > 18 THEN 18 ELSE engagement.paper_weight END) AS engagement_weight
       FROM monitor_candidate_sources cs
       JOIN (
         SELECT event.space_id, event.paper_id, SUM(event.weight) AS paper_weight FROM paper_engagement_events event
         WHERE event.occurred_at >= datetime('now', '-90 days')
          AND NOT EXISTS (
            SELECT 1 FROM research_preference_signals disabled
            WHERE disabled.space_id = event.space_id AND disabled.source_type = 'passive_engagement'
             AND disabled.source_id = event.route_id AND disabled.active = 0
          )
         GROUP BY event.space_id, event.paper_id
       ) engagement ON engagement.space_id = cs.space_id AND engagement.paper_id = cs.paper_id
       WHERE cs.space_id = ? GROUP BY cs.source_key, cs.query_key`,
    ).bind(spaceId).all<{ source_key: string; query_key: string; engaged_papers: number; engagement_weight: number }>(),
    database.prepare(
      `SELECT source_key, query_key, SUM(attempt_count) AS attempts,
       SUM(CASE WHEN total_candidate_count = 0 THEN candidate_count ELSE total_candidate_count END) AS candidates,
       SUM(new_candidate_count) AS new_candidates
       FROM monitor_discovery_coverage WHERE space_id = ? GROUP BY source_key, query_key`,
    ).bind(spaceId).all<{ source_key: string; query_key: string; attempts: number; candidates: number; new_candidates: number }>(),
    database.prepare(
      `SELECT cs.source_key, cs.query_key,
       COUNT(DISTINCT CASE WHEN audit.decision <> 'verification_pending' THEN cs.paper_id END) AS deep_reviewed,
       COUNT(DISTINCT CASE WHEN audit.recommended = 1
         AND audit.verification_status IN ('verified', 'revised') THEN cs.paper_id END) AS formal_recommended,
       COUNT(DISTINCT CASE WHEN audit.verification_status = 'degraded' THEN cs.paper_id END) AS evidence_rejected
       FROM monitor_candidate_sources cs
       JOIN recommendation_audit_events audit ON audit.space_id = cs.space_id AND audit.paper_id = cs.paper_id
        AND datetime(cs.first_seen_at) <= datetime(audit.reviewed_at)
       WHERE cs.space_id = ? AND audit.reviewed_at >= datetime('now', '-90 days')
       GROUP BY cs.source_key, cs.query_key`,
    ).bind(spaceId).all<{ source_key: string; query_key: string; deep_reviewed: number; formal_recommended: number; evidence_rejected: number }>(),
  ]);
  const rows = new Map<string, Omit<DiscoveryBranchScore, "score">>();
  const ensure = (sourceKey: string, queryKey: string) => {
    const key = `${sourceKey}|${queryKey}`;
    const existing = rows.get(key);
    if (existing) return existing;
    const created = { sourceKey, queryKey, papers: 0, accepted: 0, dismissed: 0, known: 0, wrongType: 0, engagedPapers: 0, engagementWeight: 0, attempts: 0, candidates: 0, newCandidates: 0, deepReviewed: 0, formalRecommended: 0, evidenceRejected: 0 };
    rows.set(key, created);
    return created;
  };
  for (const row of feedbackRows.results) Object.assign(ensure(row.source_key, row.query_key), {
    papers: Number(row.papers || 0), accepted: Number(row.accepted || 0), dismissed: Number(row.dismissed || 0),
    known: Number(row.known || 0), wrongType: Number(row.wrong_type || 0),
  });
  for (const row of engagementRows.results) Object.assign(ensure(row.source_key, row.query_key), {
    engagedPapers: Number(row.engaged_papers || 0), engagementWeight: Number(row.engagement_weight || 0),
  });
  for (const row of coverageRows.results) Object.assign(ensure(row.source_key, row.query_key), {
    attempts: Number(row.attempts || 0), candidates: Number(row.candidates || 0), newCandidates: Number(row.new_candidates || 0),
  });
  for (const row of reviewRows.results) Object.assign(ensure(row.source_key, row.query_key), {
    deepReviewed: Number(row.deep_reviewed || 0), formalRecommended: Number(row.formal_recommended || 0),
    evidenceRejected: Number(row.evidence_rejected || 0),
  });
  const exact = new Map<string, DiscoveryBranchScore>();
  const sourceBuckets = new Map<string, Array<{ score: number; weight: number }>>();
  for (const [key, row] of rows) {
    const scored = { ...row, score: adaptiveBranchScore(row) };
    exact.set(key, scored);
    const bucket = sourceBuckets.get(row.sourceKey) || [];
    bucket.push({ score: scored.score, weight: Math.max(1, row.papers + row.attempts) });
    sourceBuckets.set(row.sourceKey, bucket);
  }
  const sources = new Map<string, number>();
  for (const [sourceKey, bucket] of sourceBuckets) {
    const weight = bucket.reduce((sum, item) => sum + item.weight, 0);
    sources.set(sourceKey, Math.round(bucket.reduce((sum, item) => sum + item.score * item.weight, 0) / Math.max(1, weight)));
  }
  const ranked = [...exact.values()].sort((left, right) => right.score - left.score);
  return { exact, sources, ranked };
}

async function routeDiscoveryQueries(
  database: D1Database,
  spaceId: string,
  horizon: typeof HORIZONS[number],
  round: number,
  mode: ExplorationMode,
) {
  const rows = await database.prepare(
    `SELECT t.id, t.title_en, t.summary_en, t.search_queries, t.user_role, t.depth_score, t.interaction_score,
     COALESCE(behavior.passive_engagement, 0) AS passive_engagement,
     t.intelligence_json, t.intelligence_updated_at,
     COALESCE(synthesis.overview_en, '') AS synthesis_overview_en,
     COALESCE(synthesis.next_search_query, '') AS synthesis_next_search_query,
     COALESCE(synthesis.confidence, 0) AS synthesis_confidence,
     COALESCE(problem.id, '') AS research_problem_id,
     COALESCE(problem.question, '') AS research_problem_question,
     COALESCE((SELECT assessment.next_search_query FROM research_problem_assessments assessment
       WHERE assessment.problem_id = problem.id ORDER BY assessment.created_at DESC, assessment.rowid DESC LIMIT 1), '') AS problem_next_search_query,
     COALESCE((SELECT run.search_query FROM research_action_runs run
       WHERE run.problem_id = problem.id AND run.status = 'ready'
        AND run.verification_status IN ('verified', 'revised') AND run.search_query != ''
       ORDER BY run.completed_at DESC, run.rowid DESC LIMIT 1), '') AS action_next_search_query,
     MAX(c.last_scanned_at) AS last_scanned_at
     FROM research_tracks t
     LEFT JOIN monitor_discovery_coverage c ON c.space_id = t.space_id AND c.route_id = t.id AND c.horizon = ?
     LEFT JOIN research_syntheses synthesis ON synthesis.space_id = t.space_id AND synthesis.track_id = t.id
      AND synthesis.status IN ('ready', 'partial')
     LEFT JOIN research_problems problem ON problem.space_id = t.space_id AND problem.track_id = t.id AND problem.status = 'active'
     LEFT JOIN (
       SELECT event.space_id, event.route_id, MIN(18, SUM(event.weight)) AS passive_engagement
       FROM paper_engagement_events event
       WHERE event.occurred_at >= datetime('now', '-90 days') AND event.route_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM research_preference_signals disabled
          WHERE disabled.space_id = event.space_id AND disabled.source_type = 'passive_engagement'
           AND disabled.source_id = event.route_id AND disabled.active = 0
        )
       GROUP BY event.space_id, event.route_id
     ) behavior ON behavior.space_id = t.space_id AND behavior.route_id = t.id
      WHERE t.space_id = ? GROUP BY t.id, t.title_en, t.summary_en, t.search_queries, t.user_role, t.depth_score,
      t.interaction_score, behavior.passive_engagement, t.intelligence_json, t.intelligence_updated_at,
      synthesis.overview_en, synthesis.next_search_query, synthesis.confidence, problem.id, problem.question
     ORDER BY CASE WHEN MAX(c.last_scanned_at) IS NULL THEN 0 ELSE 1 END, MAX(c.last_scanned_at),
     CASE t.user_role WHEN 'core' THEN 0 WHEN 'support' THEN 1 ELSE 2 END, t.interaction_score DESC, t.depth_score DESC`,
  ).bind(horizon.key, spaceId).all<{ id: string; title_en: string; summary_en: string; search_queries: string; user_role: string; depth_score: number; interaction_score: number; passive_engagement: number; intelligence_json: string; intelligence_updated_at: string | null; synthesis_overview_en: string; synthesis_next_search_query: string; synthesis_confidence: number; research_problem_id: string; research_problem_question: string; problem_next_search_query: string; action_next_search_query: string; last_scanned_at: string | null }>();
  const coreBudget = mode === "focused" ? 2 : 2;
  const adjacentBudget = mode === "focused" ? 0 : mode === "open" ? 2 : 1;
  const chooseRoutes = (pool: typeof rows.results, budget: number) => {
    const chosen: typeof rows.results = [];
    const engaged = [...pool].filter((row) => row.passive_engagement > 0)
      .sort((left, right) => right.passive_engagement - left.passive_engagement || right.interaction_score - left.interaction_score)[0];
    if (engaged) chosen.push(engaged);
    for (const row of pool) {
      if (chosen.length >= budget) break;
      if (!chosen.some((item) => item.id === row.id)) chosen.push(row);
    }
    return chosen.slice(0, budget);
  };
  const coreRows = chooseRoutes(rows.results.filter((row) => row.user_role !== "explore"), coreBudget);
  const adjacentRows = chooseRoutes(rows.results.filter((row) => row.user_role === "explore"), adjacentBudget);
  const selectedRows = [...coreRows.map((row) => ({ row, role: "core" as const })), ...adjacentRows.map((row) => ({ row, role: "adjacent" as const }))];
  const basePlans = selectedRows.map(({ row, role }) => {
      const queries = parseVenues(row.search_queries).filter(asciiOnly);
      const routeQuery = queries.length ? queries[round % queries.length] : `${row.title_en} ${row.summary_en}`;
      return {
        key: `research-route-${row.id}`,
        sourceKey: `crossref:route:${row.id}`,
        query: cleanText(routeQuery).slice(0, 480),
        sort: horizon.key === "days" ? "published" as const : horizon.sort,
        rotating: true,
        channel: "topic" as const,
        routeId: row.id,
        explorationRole: role,
        routeUrgency: Math.min(22, Math.round(row.passive_engagement / 2) + (row.research_problem_id ? 12 : 0)),
      };
    }).filter((plan) => plan.query.length >= 4);
  const gapRows = selectedRows.flatMap(({ row, role }) => {
    const intelligence = directionDiscoverySignal(row.intelligence_json, row.intelligence_updated_at);
    const actionQuery = cleanText(row.action_next_search_query || "");
    if (actionQuery && asciiOnly(actionQuery)) return [{ row, role, intelligence: { nextSearchQuery: actionQuery, confidence: 100 } }];
    const problemQuery = cleanText(row.problem_next_search_query || "");
    if (problemQuery && asciiOnly(problemQuery)) return [{ row, role, intelligence: { nextSearchQuery: problemQuery, confidence: 96 } }];
    const synthesisQuery = cleanText(row.synthesis_next_search_query || "");
    if (synthesisQuery && asciiOnly(synthesisQuery)) return [{ row, role, intelligence: {
      nextSearchQuery: synthesisQuery,
      confidence: Math.max(Number(row.synthesis_confidence || 0), intelligence?.confidence || 0),
    } }];
    if (!intelligence?.nextSearchQuery || !asciiOnly(intelligence.nextSearchQuery)) return [];
    return [{ row, role, intelligence }];
  }).sort((left, right) => right.intelligence.confidence - left.intelligence.confidence);
  const gap = gapRows.length ? gapRows[round % gapRows.length] : null;
  const gapPlan: DiscoveryQuery[] = gap ? [{
    key: `research-route-gap-${gap.row.id}`,
    sourceKey: `crossref:route-gap:${gap.row.id}`,
    query: cleanText(gap.intelligence.nextSearchQuery).slice(0, 480),
    sort: horizon.key === "days" ? "published" : horizon.sort,
    rotating: true,
    channel: "topic",
    routeId: gap.row.id,
    explorationRole: gap.role,
    routeUrgency: Math.min(24, 10 + Math.round(gap.intelligence.confidence / 10) + Math.round(gap.row.passive_engagement / 3)),
  }] : [];
  return [...basePlans, ...gapPlan].filter((plan, index, plans) => plan.query.length >= 4
    && plans.findIndex((candidate) => candidate.routeId === plan.routeId && candidate.query === plan.query) === index);
}

async function prioritizeDiscoveryPlans(database: D1Database, spaceId: string, plans: DiscoveryQuery[], mode: ExplorationMode) {
  const performance = await loadDiscoveryBranchScores(database, spaceId);
  const enriched = await Promise.all(plans.map(async (plan) => {
    const queryKey = await discoveryQueryKey(plan);
    const exact = performance.exact.get(`${plan.sourceKey}|${queryKey}`)?.score;
    const source = performance.sources.get(plan.sourceKey);
    const score = Math.max(5, Math.min(100, (exact ?? source ?? 55) + (plan.key === "topic-anchor" ? 8 : 0) + (plan.routeUrgency || 0)));
    return { ...plan, explorationRole: plan.explorationRole || "core", adaptiveScore: score };
  }));
  return selectPrioritizedDiscoveryPlans(enriched, mode);
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
  return (await findNewCandidateIds(database, spaceId, candidates)).length;
}

async function findNewCandidateIds(database: D1Database, spaceId: string, candidates: Array<{ canonicalId: string }>) {
  if (!candidates.length) return [] as string[];
  const ids = Array.from(new Set(candidates.map((candidate) => candidate.canonicalId)));
  const known = new Set<string>();
  for (let start = 0; start < ids.length; start += 70) {
    const chunk = ids.slice(start, start + 70);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await database.prepare(`SELECT canonical_id FROM monitored_papers WHERE space_id = ? AND canonical_id IN (${placeholders})`)
      .bind(spaceId, ...chunk).all<{ canonical_id: string }>();
    for (const row of rows.results) known.add(row.canonical_id);
  }
  return ids.filter((id) => !known.has(id));
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
     (id, space_id, horizon, source_key, channel, query_key, query_text, route_id, exploration_role, adaptive_score,
      next_cursor, attempt_count, candidate_count,
      total_candidate_count, new_candidate_count, zero_yield_streak, branch_status, cooldown_until,
      first_scanned_at, last_scanned_at, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(space_id, horizon, source_key, query_key) DO UPDATE SET
       query_text = excluded.query_text, route_id = excluded.route_id,
       exploration_role = excluded.exploration_role, adaptive_score = excluded.adaptive_score,
       next_cursor = excluded.next_cursor,
       attempt_count = monitor_discovery_coverage.attempt_count + 1,
       candidate_count = excluded.candidate_count,
       total_candidate_count = monitor_discovery_coverage.total_candidate_count + excluded.total_candidate_count,
       new_candidate_count = monitor_discovery_coverage.new_candidate_count + excluded.new_candidate_count,
       zero_yield_streak = excluded.zero_yield_streak, branch_status = excluded.branch_status,
       cooldown_until = excluded.cooldown_until,
       first_scanned_at = COALESCE(monitor_discovery_coverage.first_scanned_at, CURRENT_TIMESTAMP),
       last_scanned_at = CURRENT_TIMESTAMP, last_error = excluded.last_error, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), spaceId, horizon, plan.sourceKey, plan.channel, queryKey, queryText,
    plan.routeId || null, plan.explorationRole || "core", plan.adaptiveScore || 55, nextCursor,
    candidates.length, candidates.length, newCount, zeroYieldStreak, branchStatus, cooldownUntil, error).run();
  if (error) {
    await recordReliabilityEvent(database, {
      spaceId,
      kind: "source_degraded",
      stage: `discovering_${horizon}`,
      source: plan.sourceKey,
      outcome: "degraded",
      errorCode: monitorErrorCode(error),
      message: error,
      metadata: { horizon, channel: plan.channel, queryKey, routeId: plan.routeId || null },
    });
  }
}

async function setScanSource(database: D1Database, jobId: string, horizon: Horizon, source: string, progress: number, discoveredCount: number) {
  await database.prepare(
    "UPDATE monitor_scan_jobs SET current_horizon = ?, current_source = ?, checkpoint = ?, progress = ?, discovered_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(horizon, source, `${horizon}:${source}`, progress, discoveredCount, jobId).run();
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
  const routePlans = await routeDiscoveryQueries(database, space.id, horizon, round, queryPlan?.explorationMode || "balanced");
  const plans = [...discoveryQueries(space, horizon, profileKey, round, priorityVenues, trackedAuthors, queryPlan), ...routePlans];
  const runnablePlans = (await Promise.all(plans.map(async (plan) => ({ plan, eligible: await shouldRunDiscoveryQuery(database, space.id, horizon.key, plan) }))))
    .filter((entry) => entry.eligible).map((entry) => entry.plan);
  const eligiblePlans = await prioritizeDiscoveryPlans(database, space.id, runnablePlans, queryPlan?.explorationMode || "balanced");
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
      const normalizedItems = await Promise.all((data.message?.items || []).map(async (item) => {
        const candidate = await normalizeItem(item, horizon.key);
        return candidate ? {
          ...candidate,
          discoveryChannel: plan.channel,
          provenance: [{ sourceKey: plan.sourceKey, channel: plan.channel, queryKey, queryText: cleanText(plan.query).slice(0, 500), routeId: plan.routeId }],
        } : null;
      }));
      const normalized = normalizedItems.filter((candidate): candidate is Exclude<(typeof normalizedItems)[number], null> => candidate !== null);
      const nextOffset = await advanceDiscoveryOffset(database, space.id, horizon.key, plan, offset, rows);
      await recordDiscoveryCoverage(database, space.id, horizon.key, plan, nextOffset, normalized);
      return normalized;
    } catch (error) {
      await recordDiscoveryCoverage(database, space.id, horizon.key, plan, offset, [], error instanceof Error ? error.message.slice(0, 180) : "Crossref request failed");
      return [] as Array<Omit<Candidate, "qualityScore" | "priorityVenue">>;
    }
  }))).flat();
  await setScanSource(database, jobId, horizon.key, "Semantic Scholar · OpenAlex · arXiv 并行检索", horizon.key === "days" ? 12 : horizon.key === "months" ? 28 : 44, discoveredBefore + normalizedCrossref.length);
  const [semantic, openAlex, arxiv] = await Promise.all([
    fetchSemanticScholarHorizon(database, space, horizon, now, round, queryPlan),
    fetchOpenAlexHorizon(database, space, horizon, now, round, queryPlan),
    fetchArxivHorizon(database, space, horizon, now, round, queryPlan),
  ]);
  const citationFrontier = await fetchCitationFrontier(
    database, space, horizon, now, round, jobId,
    discoveredBefore + normalizedCrossref.length + semantic.length + openAlex.length + arxiv.length,
    horizon.key === "years" ? ["references"] : ["citations"],
  );
  const normalized = [...normalizedCrossref, ...semantic, ...openAlex, ...arxiv, ...citationFrontier];
  const unique = new Map<string, Candidate>();
  for (const item of normalized
    .filter((item): item is Omit<Candidate, "qualityScore" | "priorityVenue"> => Boolean(item))
    .map((item) => ({
      item,
      signals: relevanceSignals(`${item.title} ${item.abstractText} ${item.venue}`, space, profileKey),
      calibration: discoveryCalibrationSignals(profileKey, item),
    }))
    .map(({ item, signals, calibration }) => {
      const rawRelevance = item.relevanceScore + signals.score * 20 + calibration.priorityBoost;
      const calibratedRelevance = calibration.likelyWrongType ? Math.min(5, rawRelevance) : rawRelevance;
      return scoreCandidate({ ...item, relevanceScore: Math.max(0, calibratedRelevance) }, priorityVenues, now);
    })) {
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

function monitorSemanticScholarFetch(database: D1Database, spaceId: string, endpoint: URL, init: RequestInit, scopeKey: string) {
  return fetchSemanticScholar(endpoint, init, {
    database,
    spaceId,
    scopeKey,
    feature: "monitor",
    featureDailyLimit: MONITOR_SEMANTIC_SCHOLAR_DAILY_LIMIT,
    // A provider 429 should open the shared cooldown instead of multiplying
    // retries across the concurrently running discovery branches.
    maxRetries: 1,
  });
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
    const response = await monitorSemanticScholarFetch(
      database,
      space.id,
      endpoint,
      options,
      `topic:${horizon.key}:${offset}`,
    );
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
  relations: Array<"references" | "citations">,
) {
  const seeds = await database.prepare(
    `SELECT track_id, doi, url, title FROM research_track_papers
     WHERE space_id = ? AND (doi IS NOT NULL OR url LIKE '%arxiv.org/%')
     ORDER BY CASE role WHEN 'milestone' THEN 0 ELSE 1 END, citation_count DESC, created_at ASC LIMIT 24`,
  ).bind(space.id).all<{ track_id: string; doi: string | null; url: string; title: string }>();
  if (!seeds.results.length) return [] as Array<Omit<Candidate, "qualityScore" | "priorityVenue">>;
  const seed = seeds.results[round % seeds.results.length];
  const arxivId = arxivIdFromUrl(seed.url);
  const paperId = seed.doi ? `DOI:${seed.doi}` : arxivId ? `ARXIV:${arxivId}` : "";
  if (!paperId) return [];
  await setScanSource(database, jobId, horizon.key, `Citation frontier · ${cleanText(seed.title).slice(0, 70)}`, 53, discoveredBefore);
  const relationResults = await Promise.all(relations.map(async (relation) => {
    const plan: DiscoveryQuery = {
      key: `citation-${relation}`,
      sourceKey: `semantic_scholar:${relation}`,
      query: paperId,
      sort: "relevance",
      rotating: true,
      channel: "citation",
      routeId: seed.track_id,
    };
    if (!(await shouldRunDiscoveryQuery(database, space.id, horizon.key, plan))) return [] as Array<Omit<Candidate, "qualityScore" | "priorityVenue">>;
    const limit = 40;
    const offset = await discoveryOffset(database, space.id, horizon.key, plan);
    const endpoint = new URL(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(paperId)}/${relation}`);
    endpoint.searchParams.set("offset", String(offset));
    endpoint.searchParams.set("limit", String(limit));
    endpoint.searchParams.set("fields", "externalIds,title,abstract,authors,venue,url,publicationDate,year,citationCount");
    try {
      const response = await monitorSemanticScholarFetch(database, space.id, endpoint, {
        headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
        signal: AbortSignal.timeout(20_000),
      }, `citation:${relation}:${paperId}:${offset}`);
      if (!response.ok) throw new Error(`Semantic Scholar ${relation} returned ${response.status}`);
      const data = await response.json() as SemanticScholarGraphResponse;
      const papers = (data.data || []).map((entry) => relation === "references" ? entry.citedPaper : entry.citingPaper).filter((item): item is SemanticScholarPaper => Boolean(item));
      const queryKey = await discoveryQueryKey(plan);
      const normalizedCandidates = await Promise.all(papers.map(async (item) => {
        const candidate = await normalizeSemanticScholarItem(item, horizon.key);
        return candidate && candidateWithinHorizon(candidate, horizon, now)
          ? { ...candidate, discoveryChannel: "citation" as const, provenance: [{ sourceKey: plan.sourceKey, channel: plan.channel, queryKey, routeId: seed.track_id }] }
          : null;
      }));
      const normalized = normalizedCandidates.filter((item): item is NonNullable<typeof item> => item !== null);
      const nextOffset = await advanceDiscoveryOffset(database, space.id, horizon.key, plan, offset, limit);
      await recordDiscoveryCoverage(database, space.id, horizon.key, plan, nextOffset, normalized);
      return normalized;
    } catch (error) {
      await recordDiscoveryCoverage(database, space.id, horizon.key, plan, offset, [], error instanceof Error ? error.message.slice(0, 180) : `Semantic Scholar ${relation} failed`);
      return [] as Array<Omit<Candidate, "qualityScore" | "priorityVenue">>;
    }
  }));
  return relationResults.flat();
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
  if (row && !row.user_modified) {
    const inferred = inferDomainProfile(space.name, space.description);
    const currentVenues = parseVenues(row.priority_venues);
    const defaultsChanged = row.profile_key !== inferred.key
      || currentVenues.length !== inferred.venues.length
      || currentVenues.some((venue, index) => venue !== inferred.venues[index]);
    if (defaultsChanged) {
      await database.prepare(
        "UPDATE monitor_preferences SET profile_key = ?, priority_venues = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND user_modified = 0",
      ).bind(inferred.key, JSON.stringify(inferred.venues), space.id).run();
      row = { ...row, profile_key: inferred.key, priority_venues: JSON.stringify(inferred.venues) };
    }
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

function minimumAnalysisCallsForCheckpoint(checkpoint: string) {
  if (!checkpoint || checkpoint === "planning") return MONITOR_MINIMUM_NEW_SCAN_ANALYSIS_CALLS;
  if (["discovering_days", "discovering_months", "discovering_years", "deduplicating", "enriching_screening_abstracts", "screening"].includes(checkpoint)) return 2;
  if (["rescue_screening", "enriching_abstracts", "deep_reviewing"].includes(checkpoint)) return 2;
  if (checkpoint === "verifying_recommendations") return 1;
  return 1;
}

async function readMonitorAnalysisBudget(
  database: D1Database,
  userId: string,
  spaceId: string,
  minimumCalls: number,
) {
  const usageDate = shanghaiDateKey(new Date());
  const workspaceScope = "monitor-workspace:" + userId.replace(/^anonymous:/, "");
  const spaceScope = "monitor-space:" + spaceId;
  const [globalUsed, workspaceUsed, spaceUsed] = await Promise.all([
    usageCount(database, "monitor:global", usageDate),
    usageCount(database, workspaceScope, usageDate),
    usageCount(database, spaceScope, usageDate),
  ]);
  const remaining = Math.max(0, Math.min(
    MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT - globalUsed,
    MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT - workspaceUsed,
    MONITOR_SPACE_DAILY_ANALYSIS_LIMIT - spaceUsed,
  ));
  const tomorrow = new Date(Date.now() + 86_400_000);
  return {
    used: spaceUsed,
    limit: MONITOR_SPACE_DAILY_ANALYSIS_LIMIT,
    remaining,
    minimumToStart: minimumCalls,
    available: remaining >= minimumCalls,
    resetsAt: new Date(`${shanghaiDateKey(tomorrow)}T00:00:00+08:00`).toISOString(),
  };
}

type AutomationPauseReason = "unattended_runs" | "inactive" | "daily_budget" | "model_unavailable";

async function readAutomationCounters(database: D1Database, spaceId: string) {
  const usageDate = shanghaiDateKey(new Date());
  const [pending, usage] = await Promise.all([
    database.prepare(
      `SELECT COUNT(*) AS count
       FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
       LEFT JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
       LEFT JOIN paper_reading_progress r ON r.paper_id = p.id AND r.space_id = p.space_id
       WHERE p.space_id = ? AND i.llm_recommended = 1 AND i.analysis_model = ?
        AND COALESCE(f.saved, 0) = 0 AND COALESCE(f.feedback, '') = ''
        AND COALESCE(r.status, 'unread') = 'unread'`,
    ).bind(spaceId, MONITOR_MODEL).first<{ count: number }>(),
    database.prepare(
      `SELECT COALESCE(request_count, 0) AS requests,
       COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS tokens
       FROM ai_usage_daily WHERE scope = ? AND usage_date = ? LIMIT 1`,
    ).bind("monitor-space:" + spaceId, usageDate).first<{ requests: number; tokens: number }>(),
  ]);
  return {
    pendingRecommendations: pending?.count || 0,
    dailyRequests: usage?.requests || 0,
    dailyTokens: usage?.tokens || 0,
  };
}

async function pauseMonitorAutomation(database: D1Database, spaceId: string, reason: AutomationPauseReason) {
  await database.prepare(
    `UPDATE monitor_runs SET automation_paused_at = COALESCE(automation_paused_at, CURRENT_TIMESTAMP),
     automation_pause_reason = ?, lock_token = NULL, lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE space_id = ?`,
  ).bind(reason, spaceId).run();
}

async function deferMonitorAutomation(database: D1Database, spaceId: string, resumeAt: string) {
  await database.prepare(
    `UPDATE monitor_runs SET next_run_at = ?, lock_token = NULL, lock_expires_at = NULL,
     automation_paused_at = NULL, automation_pause_reason = '', updated_at = CURRENT_TIMESTAMP
     WHERE space_id = ?`,
  ).bind(resumeAt, spaceId).run();
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

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

function normalizedMonitorError(error: unknown) {
  const message = errorText(error).trim();
  if (/insufficient\s+balance|balance\s+insufficient|余额不足/i.test(message)) return DEEPSEEK_BALANCE_ERROR;
  if (/invalid\s+(?:api\s*)?key|authentication|unauthorized|status\s*401|returned\s*401/i.test(message)) return DEEPSEEK_CREDENTIAL_ERROR;
  return message || "Monitoring stage failed";
}

function monitorErrorCode(error: unknown) {
  return modelFailureCode(normalizedMonitorError(error));
}

async function recordReliabilityEvent(database: D1Database, input: {
  spaceId: string;
  scanJobId?: string | null;
  kind: string;
  stage?: string;
  source?: string;
  outcome?: "success" | "degraded" | "failed" | "info";
  durationMs?: number;
  errorCode?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await database.prepare(
      `INSERT INTO monitor_reliability_events
       (id, space_id, scan_job_id, kind, stage, source, outcome, duration_ms, error_code, message, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), input.spaceId, input.scanJobId || null, input.kind, input.stage || "", input.source || "",
      input.outcome || "info", Math.max(0, Math.round(input.durationMs || 0)), input.errorCode || "",
      cleanText(input.message || "").slice(0, 500), JSON.stringify(input.metadata || {}),
    ).run();
  } catch (error) {
    // Reliability telemetry must never become a new failure mode for the scan itself.
    console.error("Failed to record monitor reliability event", error);
  }
}

function isNonRetryableDeepSeekError(error: unknown) {
  return isFatalModelFailure(normalizedMonitorError(error));
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
  apiKey: string,
): Promise<QueryPlan> {
  const planDate = new Date().toISOString().slice(0, 10);
  const queryCoverageLimit = preference.explorationMode === "focused" ? 2 : preference.explorationMode === "open" ? 4 : 3;
  const [existing, guidanceTracks, guidance, confirmedEvidence] = await Promise.all([
    database.prepare(
      "SELECT plan_date, exploration_mode, queries_json, rationale_zh, rationale_en, model, error, created_at FROM monitor_query_plans WHERE space_id = ? AND plan_date = ? LIMIT 1",
    ).bind(space.id, planDate).first<{
      plan_date: string; exploration_mode: string; queries_json: string; rationale_zh: string; rationale_en: string; model: string; error: string | null; created_at: string;
    }>(),
    database.prepare(RESEARCH_GUIDANCE_TRACKS_SQL).bind(space.id).all<ResearchGuidanceTrackSnapshot>(),
    database.prepare(RESEARCH_GUIDANCE_REVISIONS_SQL).bind(space.id, space.id, space.id, space.id, space.id, space.id, space.id, space.id).first<{
      preference_revision: string;
      feedback_revision: string;
      reading_revision: string;
      confirmed_evidence_revision: string;
      synthesis_revision: string;
      problem_revision: string;
      problem_assessment_revision: string;
      action_run_revision: string;
    }>(),
    database.prepare(RECENT_CONFIRMED_ROUTE_EVIDENCE_SQL).bind(space.id).all<ConfirmedRouteEvidenceSnapshot>(),
  ]);
  const guidanceIdentity = researchGuidanceIdentity({
    tracks: guidanceTracks.results,
    preferenceRevision: guidance?.preference_revision || "",
    feedbackRevision: guidance?.feedback_revision || "",
    readingRevision: guidance?.reading_revision || "",
    confirmedEvidenceRevision: guidance?.confirmed_evidence_revision || "",
    synthesisRevision: guidance?.synthesis_revision || "",
    problemRevision: guidance?.problem_revision || "",
    problemAssessmentRevision: guidance?.problem_assessment_revision || "",
    actionRunRevision: guidance?.action_run_revision || "",
    confirmedEvidence: confirmedEvidence.results,
  });
  const guidanceDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(guidanceIdentity));
  const guidanceRevision = Array.from(new Uint8Array(guidanceDigest)).slice(0, 12).map((value) => value.toString(16).padStart(2, "0")).join("");
  let existingQueries: (Partial<Record<Horizon, string[]>> & { guidanceRevision?: string }) = {};
  try { existingQueries = existing ? JSON.parse(existing.queries_json) as typeof existingQueries : {}; } catch { existingQueries = {}; }
  const staleFallback = Boolean(existing && apiKey && existing.model === "deterministic-fallback");
  const stalePipelinePlan = Boolean(existing && databaseTime(existing.created_at) < MONITOR_QUERY_PLAN_RELEASED_AT);
  const staleGuidancePlan = Boolean(existing && existingQueries.guidanceRevision !== guidanceRevision);
  if (existing && !staleFallback && !stalePipelinePlan && !staleGuidancePlan) {
    return {
      planDate: existing.plan_date,
      explorationMode: preference.explorationMode,
      queries: mergeBenchmarkQueryCoverage(preference.profileKey, {
        days: normalizePlannedQueries(existingQueries.days, 4),
        months: normalizePlannedQueries(existingQueries.months, 4),
        years: normalizePlannedQueries(existingQueries.years, 4),
      }, planDate, queryCoverageLimit),
      rationaleZh: existing.rationale_zh,
      rationaleEn: existing.rationale_en,
      model: existing.model,
      error: existing.error,
    };
  }
  if (staleFallback || stalePipelinePlan || staleGuidancePlan) {
    await database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date = ?")
      .bind(space.id, planDate).run();
  }

  const queryLimit = preference.explorationMode === "focused" ? 1 : preference.explorationMode === "open" ? 3 : 2;
  const [signals, tracks, recentCoverage, branchPerformance, activeProblems] = await Promise.all([
    readPreferenceSignals(database, space.id, 28),
    database.prepare(
      `SELECT track.id, track.title_en, track.summary_en, track.search_queries, track.user_role, track.depth_score,
       track.support_score, track.interaction_score, track.intelligence_json, track.intelligence_updated_at,
       COALESCE(synthesis.overview_en, '') AS synthesis_overview_en,
       COALESCE(synthesis.next_search_query, '') AS synthesis_next_search_query,
       COALESCE(synthesis.confidence, 0) AS synthesis_confidence
       FROM research_tracks track LEFT JOIN research_syntheses synthesis
        ON synthesis.space_id = track.space_id AND synthesis.track_id = track.id AND synthesis.status IN ('ready', 'partial')
       WHERE track.space_id = ? ORDER BY CASE track.user_role WHEN 'core' THEN 0 WHEN 'support' THEN 1 ELSE 2 END,
       track.interaction_score DESC, track.depth_score DESC LIMIT 10`,
    ).bind(space.id).all<{ id: string; title_en: string; summary_en: string; search_queries: string; user_role: string; depth_score: number; support_score: number; interaction_score: number; intelligence_json: string; intelligence_updated_at: string | null; synthesis_overview_en: string; synthesis_next_search_query: string; synthesis_confidence: number }>(),
    database.prepare(
      "SELECT source_key, channel, SUM(attempt_count) AS attempts, SUM(new_candidate_count) AS new_candidates FROM monitor_discovery_coverage WHERE space_id = ? GROUP BY source_key, channel ORDER BY SUM(new_candidate_count) ASC, SUM(attempt_count) DESC LIMIT 12",
    ).bind(space.id).all<{ source_key: string; channel: string; attempts: number; new_candidates: number }>(),
    loadDiscoveryBranchScores(database, space.id),
    database.prepare(
      `SELECT problem.id, problem.track_id, problem.question, problem.objective, problem.scope,
        problem.success_criteria, problem.stage,
        COALESCE((SELECT assessment.uncertainty_en FROM research_problem_assessments assessment
          WHERE assessment.problem_id = problem.id ORDER BY assessment.created_at DESC, assessment.rowid DESC LIMIT 1), '') AS uncertainty_en,
        COALESCE((SELECT assessment.next_decision_en FROM research_problem_assessments assessment
          WHERE assessment.problem_id = problem.id ORDER BY assessment.created_at DESC, assessment.rowid DESC LIMIT 1), '') AS next_decision_en,
        COALESCE((SELECT assessment.next_search_query FROM research_problem_assessments assessment
          WHERE assessment.problem_id = problem.id ORDER BY assessment.created_at DESC, assessment.rowid DESC LIMIT 1), '') AS next_search_query
        ,COALESCE((SELECT run.result_en FROM research_action_runs run
          WHERE run.problem_id = problem.id AND run.status = 'ready' AND run.verification_status IN ('verified', 'revised') ORDER BY run.completed_at DESC, run.rowid DESC LIMIT 1), '') AS latest_action_result_en
        ,COALESCE((SELECT run.decision_en FROM research_action_runs run
          WHERE run.problem_id = problem.id AND run.status = 'ready' AND run.verification_status IN ('verified', 'revised') ORDER BY run.completed_at DESC, run.rowid DESC LIMIT 1), '') AS latest_action_decision_en
        ,COALESCE((SELECT run.search_query FROM research_action_runs run
          WHERE run.problem_id = problem.id AND run.status = 'ready' AND run.verification_status IN ('verified', 'revised') AND run.search_query != '' ORDER BY run.completed_at DESC, run.rowid DESC LIMIT 1), '') AS latest_action_search_query
       FROM research_problems problem WHERE problem.space_id = ? AND problem.status = 'active'
       ORDER BY problem.updated_at DESC LIMIT 8`,
    ).bind(space.id).all<{ id: string; track_id: string; question: string; objective: string; scope: string; success_criteria: string; stage: string; uncertainty_en: string; next_decision_en: string; next_search_query: string; latest_action_result_en: string; latest_action_decision_en: string; latest_action_search_query: string }>(),
  ]);
  const directionSignals = tracks.results.flatMap((track) => {
    const intelligence = directionDiscoverySignal(track.intelligence_json, track.intelligence_updated_at);
    return intelligence || track.synthesis_next_search_query ? [{
      trackId: track.id,
      title: track.title_en,
      role: track.user_role,
      depth: track.depth_score + track.interaction_score,
      support: track.support_score,
      opportunity: track.synthesis_overview_en || intelligence?.opportunityEn || "",
      watchSignal: intelligence?.watchSignalEn || "",
      evidenceGap: intelligence?.evidenceGapEn || "",
      nextSearchQuery: track.synthesis_next_search_query || intelligence?.nextSearchQuery || "",
      confidence: Math.max(track.synthesis_confidence || 0, intelligence?.confidence || 0),
    }] : [];
  });
  let queries: Record<Horizon, string[]> = { days: [], months: [], years: [] };
  let rationaleZh = "";
  let rationaleEn = "";
  let error: string | null = null;
  let model = MONITOR_MODEL;

  if (!apiKey) {
    error = "DeepSeek Pro is not configured; deterministic discovery remains active.";
    model = "deterministic-fallback";
  } else {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MONITOR_MODEL,
          messages: [
            { role: "system", content: "You are Pi Research's daily academic discovery strategist. Return strict JSON and design retrieval queries, not paper recommendations." },
            { role: "user", content: [
              `Build today's query plan for ${space.name}: ${space.description}.`,
              `Exploration mode: ${preference.explorationMode}. Return exactly ${queryLimit} concise English bibliographic query strings per horizon.`,
              benchmarkCalibrationPrompt(preference.profileKey),
              "The three horizons are simultaneous: days = newest 14 days; months = new and high-quality 6 months; years = durable, foundational, methodologically useful 5 years.",
              "Move beyond yesterday's obvious wording. Cover core depth, one adjacent bridge when mode allows, unresolved questions, under-covered subdirections, methods, and representative venues. When a grounded cross-paper synthesis or direction assessment contains an evidence gap or nextSearchQuery, use at least one horizon slot to test that gap instead of merely repeating broad topic keywords. Do not include dates, API syntax, Boolean operators, journal names alone, or generic words such as research/study/paper.",
              "Return {\"days\":[...],\"months\":[...],\"years\":[...],\"rationaleZh\":\"...\",\"rationaleEn\":\"...\"}.",
              `Explicit and inferred preference evidence: ${JSON.stringify(signals.map((item) => ({ layer: item.layer, kind: item.kind, label: item.labelEn, evidence: item.evidence, confidence: item.effectiveConfidence })))}`,
              `Existing directions and user depth: ${JSON.stringify(tracks.results.map((track) => ({ title: track.title_en, role: track.user_role, depth: track.depth_score, interaction: track.interaction_score, summary: track.summary_en, queries: parseVenues(track.search_queries).slice(0, 4) })))}`,
              `Grounded direction opportunities, watch signals, and evidence gaps; Grounded cross-paper synthesis that today's search should test: ${JSON.stringify(directionSignals)}`,
              `User-confirmed active research problems. Give these greater weight than broad route wording; use at least one horizon slot to reduce their stated uncertainty when a safe query is available: ${JSON.stringify(activeProblems.results)}`,
              `Recently confirmed route evidence (use its title and route role to refine queries even while Pi is rebuilding direction intelligence): ${JSON.stringify(confirmedEvidence.results.map((item) => ({ trackId: item.track_id, title: item.title, role: item.map_role, confidence: item.confidence })))}`,
              `Priority venues: ${preference.priorityVenues.join("; ")}`,
              `Tracked authors and teams: ${preference.trackedAuthors.join("; ") || "none yet"}`,
              `Low-yield or repeatedly covered channels: ${JSON.stringify(recentCoverage.results)}`,
              `Retrieval branches learned from explicit outcomes, qualified passive engagement, and papers that survived the unchanged formal recommendation gate. Treat passive behavior as a revisable hypothesis, never as stronger evidence than explicit feedback: ${JSON.stringify([...branchPerformance.ranked.slice(0, 4), ...branchPerformance.ranked.slice(-4)].map((branch) => ({ source: branch.sourceKey, score: branch.score, accepted: branch.accepted, dismissed: branch.dismissed, known: branch.known, engagedPapers: branch.engagedPapers, engagementWeight: branch.engagementWeight, discoveryYield: branch.candidates ? Math.round(branch.newCandidates / branch.candidates * 100) : 0, conclusiveReviews: branch.deepReviewed, formalRecommendations: branch.formalRecommended, evidenceRejected: branch.evidenceRejected })))}`,
            ].join("\n") },
          ],
          thinking: { type: "enabled" },
          reasoning_effort: "medium",
          response_format: { type: "json_object" },
          max_tokens: 2800,
          stream: false,
        }),
        signal: AbortSignal.timeout(45_000),
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
  queries = mergeBenchmarkQueryCoverage(preference.profileKey, queries, planDate, queryCoverageLimit);
  await database.prepare(
    `INSERT INTO monitor_query_plans
     (id, space_id, plan_date, exploration_mode, queries_json, rationale_zh, rationale_en, model, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(space_id, plan_date) DO UPDATE SET exploration_mode = excluded.exploration_mode,
     queries_json = excluded.queries_json, rationale_zh = excluded.rationale_zh,
     rationale_en = excluded.rationale_en, model = excluded.model, error = excluded.error,
     created_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), space.id, planDate, preference.explorationMode, JSON.stringify({ ...queries, guidanceRevision }), rationaleZh, rationaleEn, model, error).run();
  return { planDate, explorationMode: preference.explorationMode, queries, rationaleZh, rationaleEn, model, error };
}

async function enrichSpaceWithImportedMemory(database: D1Database, space: SpaceRow): Promise<SpaceRow> {
  const [rows, tracks, feedbackRows, readingRows, groundedEvidenceRows] = await Promise.all([
    database.prepare(
      "SELECT analysis_json FROM research_imports WHERE space_id = ? AND status = 'confirmed' ORDER BY confirmed_at DESC LIMIT 6",
    ).bind(space.id).all<{ analysis_json: string }>(),
    database.prepare(
      "SELECT title_en, summary_en, search_queries FROM research_tracks WHERE space_id = ? ORDER BY interaction_score DESC, depth_score DESC, position LIMIT 8",
    ).bind(space.id).all<{ title_en: string; summary_en: string; search_queries: string }>(),
    database.prepare(
      `SELECT p.title, p.venue, f.feedback, f.saved, f.reason_code FROM paper_feedback f
       JOIN monitored_papers p ON p.id = f.paper_id AND p.space_id = f.space_id
       WHERE f.space_id = ? AND (f.saved = 1 OR f.feedback IN ('relevant', 'not_relevant'))
       ORDER BY f.updated_at DESC LIMIT 30`,
    ).bind(space.id).all<{ title: string; venue: string; feedback: string | null; saved: number; reason_code: string | null }>(),
    database.prepare(
      `SELECT takeaway_en, methods_en, questions_en, connections_en, topics_en
       FROM paper_reading_memories WHERE space_id = ? AND analysis_status = 'ready'
       ORDER BY updated_at DESC LIMIT 16`,
    ).bind(space.id).all<{ takeaway_en: string; methods_en: string; questions_en: string; connections_en: string; topics_en: string }>(),
    database.prepare(
      `SELECT p.title, claim.kind, claim.claim_en, claim.section_label
       FROM paper_evidence_claims claim
       JOIN paper_evidence_documents document ON document.id = claim.document_id
        AND document.space_id = claim.space_id AND document.paper_id = claim.paper_id
       JOIN monitored_papers p ON p.id = claim.paper_id AND p.space_id = claim.space_id
       LEFT JOIN paper_feedback feedback ON feedback.paper_id = p.id AND feedback.space_id = p.space_id
       LEFT JOIN paper_reading_progress reading ON reading.paper_id = p.id AND reading.space_id = p.space_id
       WHERE claim.space_id = ? AND claim.grounded = 1 AND document.status = 'ready'
        AND document.evidence_level = 'fulltext'
        AND (feedback.saved = 1 OR feedback.feedback = 'relevant' OR reading.status IN ('read','mastered','cited')
         OR EXISTS (SELECT 1 FROM research_map_evidence_proposals proposal
          WHERE proposal.space_id = p.space_id AND proposal.paper_id = p.id AND proposal.status = 'confirmed'))
       ORDER BY document.analyzed_at DESC, claim.position LIMIT 18`,
    ).bind(space.id).all<{ title: string; kind: string; claim_en: string; section_label: string }>(),
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
  for (const evidence of groundedEvidenceRows.results) {
    context.push(cleanText(`${evidence.title} — grounded ${evidence.kind}: ${evidence.claim_en}${evidence.section_label ? ` [${evidence.section_label}]` : ""}`).slice(0, 520));
  }
  const positive = feedbackRows.results
    .filter((row) => row.saved || row.feedback === "relevant")
    .map((row) => cleanText(`${row.title}${row.venue ? ` — ${row.venue}` : ""}`));
  const negative = feedbackRows.results
    .filter((row) => row.feedback === "not_relevant" && row.reason_code !== "duplicate_known")
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

function recommendationVerificationPayload(review: PaperReview) {
  return {
    summaryZh: review.summaryZh, summaryEn: review.summaryEn,
    whyReadZh: review.whyReadZh, whyReadEn: review.whyReadEn,
    problemZh: review.problemZh, problemEn: review.problemEn,
    methodZh: review.methodZh, methodEn: review.methodEn,
    contributionZh: review.contributionZh, contributionEn: review.contributionEn,
    limitationsZh: review.limitationsZh, limitationsEn: review.limitationsEn,
    readingFocusZh: review.readingFocusZh, readingFocusEn: review.readingFocusEn,
    researchQuestionsZh: review.researchQuestionsZh, researchQuestionsEn: review.researchQuestionsEn,
    researchProblemImpactZh: review.researchProblemImpactZh, researchProblemImpactEn: review.researchProblemImpactEn,
    researchDecisionZh: review.researchDecisionZh, researchDecisionEn: review.researchDecisionEn,
  };
}

function recommendationVerificationFields(review: PaperReview) {
  return RECOMMENDATION_VERIFICATION_FIELDS.filter((field) => {
    if (field === "summary") return Boolean(review.summaryZh && review.summaryEn);
    if (field === "whyRead") return Boolean(review.whyReadZh && review.whyReadEn);
    if (field === "problem") return Boolean(review.problemZh && review.problemEn);
    if (field === "method") return Boolean(review.methodZh && review.methodEn);
    if (field === "contribution") return Boolean(review.contributionZh && review.contributionEn);
    if (field === "limitations") return Boolean(review.limitationsZh && review.limitationsEn);
    if (field === "readingFocus") return Boolean(review.readingFocusZh && review.readingFocusEn);
    if (field === "researchProblemImpact") return Boolean(review.researchProblemImpactZh && review.researchProblemImpactEn);
    return Boolean(review.researchDecisionZh && review.researchDecisionEn);
  });
}

function correctedRecommendationReview(review: PaperReview, value: unknown): PaperReview | null {
  if (!value || typeof value !== "object") return null;
  const corrected = value as Record<string, unknown>;
  const text = (key: string, fallback: string, limit: number) => cleanText(String(corrected[key] ?? fallback)).slice(0, limit);
  const list = (key: string, fallback: string[], limit: number) => Array.isArray(corrected[key])
    ? (corrected[key] as unknown[]).map((item) => cleanText(String(item))).filter(Boolean).slice(0, limit)
    : fallback;
  const next = {
    ...review,
    summaryZh: text("summaryZh", review.summaryZh, 900), summaryEn: text("summaryEn", review.summaryEn, 1200),
    whyReadZh: text("whyReadZh", review.whyReadZh, 800), whyReadEn: text("whyReadEn", review.whyReadEn, 1000),
    problemZh: text("problemZh", review.problemZh, 800), problemEn: text("problemEn", review.problemEn, 1050),
    methodZh: text("methodZh", review.methodZh, 800), methodEn: text("methodEn", review.methodEn, 1050),
    contributionZh: text("contributionZh", review.contributionZh, 850), contributionEn: text("contributionEn", review.contributionEn, 1100),
    limitationsZh: text("limitationsZh", review.limitationsZh, 750), limitationsEn: text("limitationsEn", review.limitationsEn, 1000),
    readingFocusZh: text("readingFocusZh", review.readingFocusZh, 750), readingFocusEn: text("readingFocusEn", review.readingFocusEn, 1000),
    researchQuestionsZh: list("researchQuestionsZh", review.researchQuestionsZh, 4),
    researchQuestionsEn: list("researchQuestionsEn", review.researchQuestionsEn, 4),
    researchProblemImpactZh: review.researchProblemImpactZh ? text("researchProblemImpactZh", review.researchProblemImpactZh, 760) : "",
    researchProblemImpactEn: review.researchProblemImpactEn ? text("researchProblemImpactEn", review.researchProblemImpactEn, 1000) : "",
    researchDecisionZh: review.researchDecisionZh ? text("researchDecisionZh", review.researchDecisionZh, 650) : "",
    researchDecisionEn: review.researchDecisionEn ? text("researchDecisionEn", review.researchDecisionEn, 850) : "",
  };
  return next.summaryZh && next.summaryEn && next.whyReadZh && next.whyReadEn ? next : null;
}

function isPublishedRecommendation(review: PaperReview) {
  return review.recommended && !review.verificationRetryable
    && (review.verificationStatus === "verified" || review.verificationStatus === "revised");
}

function pendingRecommendationReview(review: PaperReview, reason = "Waiting for bibliographic and abstract evidence checks"): PaperReview {
  if (!review.recommended) return review;
  return {
    ...review,
    verificationStatus: "pending",
    verificationCoverageScore: 0,
    verificationReport: { status: "pending", reason: cleanText(reason).slice(0, 500) },
    verificationRetryable: true,
  };
}

function degradedRecommendationReview(review: PaperReview, report: ReturnType<typeof evidenceVerificationReport>): PaperReview {
  return {
    ...review,
    recommended: false,
    summaryZh: "", summaryEn: "", whyReadZh: "", whyReadEn: "",
    problemZh: "", problemEn: "", methodZh: "", methodEn: "", contributionZh: "", contributionEn: "",
    limitationsZh: "", limitationsEn: "", readingFocusZh: "", readingFocusEn: "",
    researchQuestionsZh: [], researchQuestionsEn: [], researchProblemId: "", problemFitScore: 0,
    uncertaintyReductionScore: 0, actionabilityScore: 0, researchProblemImpactZh: "",
    researchProblemImpactEn: "", researchDecisionZh: "", researchDecisionEn: "",
    trackId: "", mapRationaleZh: "", mapRationaleEn: "",
    screeningReason: cleanText(`Independent evidence gate withheld this recommendation: ${report.reason || report.unsupportedFields.join(", ") || "support remained insufficient"}`).slice(0, 500),
    verificationStatus: "degraded",
    verificationCoverageScore: report.coverageScore,
    verificationReport: report,
    verificationRetryable: false,
  };
}

type RecommendationVerificationEvidence = {
  source: "stored_claims" | "abstract";
  units: VerificationEvidenceUnit[];
};

async function recommendationVerificationEvidence(
  database: D1Database,
  spaceId: string,
  candidate: Candidate,
): Promise<RecommendationVerificationEvidence> {
  try {
    const stored = await database.prepare(
      `SELECT claim.id, claim.evidence_quote, document.evidence_level
       FROM monitored_papers paper
       JOIN paper_evidence_documents document ON document.paper_id = paper.id AND document.space_id = paper.space_id
       JOIN paper_evidence_claims claim ON claim.document_id = document.id
        AND claim.paper_id = paper.id AND claim.space_id = paper.space_id
       WHERE paper.space_id = ? AND paper.canonical_id = ? AND claim.grounded = 1
        AND document.status IN ('ready', 'partial') AND length(trim(claim.evidence_quote)) >= 24
       ORDER BY document.updated_at DESC, claim.position
       LIMIT 10`,
    ).bind(spaceId, candidate.canonicalId).all<{ id: string; evidence_quote: string; evidence_level: string }>();
    const units = stored.results.flatMap((row) => {
      const text = cleanText(row.evidence_quote).slice(0, 700);
      return row.id && text ? [{ id: row.id, text }] : [];
    });
    if (units.length) {
      return {
        source: "stored_claims",
        units,
      };
    }
  } catch {
    // Existing stored evidence is an optimization. Abstract sentence evidence remains a safe fallback.
  }
  return {
    source: "abstract",
    units: abstractEvidenceUnits(candidate.abstractText, {
      prefix: candidate.canonicalId,
      maxUnits: 10,
      maxChars: 420,
    }),
  };
}

async function verifyRecommendationBatch(input: {
  database: D1Database;
  spaceId: string;
  usageDate: string;
  workspaceScope: string;
  spaceScope: string;
  apiKey: string;
  candidates: Candidate[];
  reviews: PaperReview[];
}) {
  const recommended = input.reviews.filter((review) => review.recommended);
  if (!recommended.length) return input.reviews;
  const incompleteDraft = recommended.find((review) => !hasCompleteRecommendationDraft(review));
  if (incompleteDraft) {
    throw new Error(`Recommendation draft incomplete: ${incompleteDraft.canonicalId} is missing ${recommendationDraftMissingFields(incompleteDraft).join(", ")}`);
  }
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const evidenceEntries = await Promise.all(recommended.map(async (review) => {
    const candidate = candidateById.get(review.canonicalId);
    return [review.canonicalId, candidate
      ? await recommendationVerificationEvidence(input.database, input.spaceId, candidate)
      : { source: "abstract" as const, units: [] }] as const;
  }));
  const evidenceByReview = new Map(evidenceEntries);
  const preflightFailures = new Map<string, PaperReview>();
  for (const review of recommended) {
    const candidate = candidateById.get(review.canonicalId);
    const evidence = evidenceByReview.get(review.canonicalId) || { source: "abstract" as const, units: [] };
    const populatedFields = recommendationVerificationFields(review);
    const preflight = recommendationEvidencePreflight({
      title: candidate?.title,
      availableFields: populatedFields,
      requiredFields: populatedFields,
      evidenceUnits: evidence.units,
    });
    if (preflight.ready) continue;
    const initial = sanitizeEvidenceVerificationDraft({
      verdict: "insufficient",
      coverageScore: 0,
      unsupportedFields: preflight.missingFields,
      reason: `Deterministic evidence preflight failed: ${preflight.reasons.join(", ")}`,
    }, { allowedFields: recommendationVerificationFields(review) });
    preflightFailures.set(review.canonicalId, degradedRecommendationReview(review, {
      ...evidenceVerificationReport({ initial }),
      preflight,
      evidenceSource: evidence.source,
    }));
  }
  const auditable = recommended.filter((review) => !preflightFailures.has(review.canonicalId));
  if (!auditable.length) {
    return input.reviews.map((review) => preflightFailures.get(review.canonicalId) || review);
  }
  const correctionMode = auditable.every((review) => review.verificationReport?.correctionRequested === true);
  if (auditable.some((review) => (review.verificationReport?.correctionRequested === true) !== correctionMode)) {
    throw new Error("Recommendation verification batch mixed audit and correction phases");
  }
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MONITOR_MODEL,
      messages: [
        { role: "system", content: correctionMode
          ? "You are Pi Research's conservative recommendation editor. Correct only the supplied draft using the audit findings and numbered evidence units. Return strict JSON without hidden chain-of-thought."
          : "You are Pi Research's fast independent recommendation evidence verifier. Audit only against the supplied metadata and numbered evidence units. Return strict JSON without hidden chain-of-thought." },
        { role: "user", content: [
          correctionMode
            ? "Return {corrections:[{canonicalId,corrected:{summaryZh,summaryEn,whyReadZh,whyReadEn,problemZh,problemEn,methodZh,methodEn,contributionZh,contributionEn,limitationsZh,limitationsEn,readingFocusZh,readingFocusEn,researchQuestionsZh,researchQuestionsEn,researchProblemImpactZh,researchProblemImpactEn,researchDecisionZh,researchDecisionEn},verification:{verdict:\"verified|insufficient\",coverageScore,supportedFields,unsupportedFields,overstatements,contradictionRisks,supportedEvidenceIds,claimChecks:[{field,claimExcerpt,evidenceId,verdict:\"supported|qualified|unsupported\",reason}],reason}}]}."
            : "Return {verifications:[{canonicalId,verdict:\"verified|revise|insufficient\",coverageScore,supportedFields,unsupportedFields,overstatements,contradictionRisks,supportedEvidenceIds,claimChecks:[{field,claimExcerpt,evidenceId,verdict:\"supported|qualified|unsupported\",reason}],reason]}.",
          correctionMode
            ? "Correct every supplied draft into a complete conservative bilingual replacement. Apply the supplied audit exactly, retain supported substance, remove or qualify unsupported claims, and do not add new claims."
            : "Audit every supplied paper. coverageScore must be an integer from 0 to 100. supportedFields and unsupportedFields may use only: " + RECOMMENDATION_VERIFICATION_FIELDS.join(", ") + ".",
          correctionMode
            ? "Every corrected field must remain grounded in the numbered evidence units. Missing detail must be described as unknown, not invented as a limitation. The verification object is the final evidence decision: check the corrected draft, cover every populated substantive field, and cite a supplied evidenceId for every supported or qualified claim."
            : "claimChecks must cover every populated substantive field. Every supported or qualified check must reference one supplied evidenceId. Do not repeat evidence quotes; return only the evidenceId.",
          "Treat title, authors, venue, date, and citation count only as metadata. Evidence units support only what they state or directly entail. Route context and user fit do not prove paper findings.",
          "Flag novelty, proof, optimality, completeness, causality, empirical validation, convergence, or contradiction wording unless a supplied evidence unit explicitly entails it.",
          correctionMode ? "Keep the correction concise while preserving every required bilingual field. Preserve empty researchProblemImpact and researchDecision fields as empty; never invent user-specific context. If the corrected draft cannot pass, return insufficient; there will be no further rewrite loop." : "Keep reasons and claim excerpts concise. Do not rewrite the draft in this audit pass.",
          "Drafts and evidence: " + JSON.stringify(auditable.map((review) => {
            const candidate = candidateById.get(review.canonicalId);
            const evidence = evidenceByReview.get(review.canonicalId);
            return {
              canonicalId: review.canonicalId,
              metadata: candidate ? {
                title: candidate.title, authors: candidate.authors, venue: candidate.venue,
                publishedAt: candidate.publishedAt, citations: candidate.citationCount,
              } : null,
              evidenceSource: evidence?.source || "abstract",
              evidenceUnits: evidence?.units || [],
              priorAudit: correctionMode ? review.verificationReport?.audit || null : undefined,
              draft: recommendationVerificationPayload(review),
            };
          })),
        ].join("\n") },
      ],
      thinking: { type: "disabled" },
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      max_tokens: correctionMode ? Math.min(4200, 1400 + auditable.length * 1500) : Math.min(2600, 850 + auditable.length * 850),
      stream: false,
    }),
    signal: AbortSignal.timeout(correctionMode ? VERIFICATION_CORRECTION_TIMEOUT_MS : VERIFICATION_TIMEOUT_MS),
  });
  const data = await response.json() as DeepSeekResponse;
  if (!response.ok) throw new Error(data.error?.message || "Recommendation evidence verification failed");
  if (!data.choices?.[0]?.message?.content?.trim()) throw new Error("Recommendation evidence verifier returned an empty response");
  const totalInputTokens = data.usage?.prompt_tokens || 0;
  const totalOutputTokens = data.usage?.completion_tokens || 0;
  await Promise.all([
    recordUsage(input.database, "monitor:global", input.usageDate, totalInputTokens, totalOutputTokens),
    recordUsage(input.database, input.workspaceScope, input.usageDate, totalInputTokens, totalOutputTokens),
    recordUsage(input.database, input.spaceScope, input.usageDate, totalInputTokens, totalOutputTokens),
  ]);
  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseJsonObject(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as { verifications?: unknown[]; corrections?: unknown[] };
  const denominator = Math.max(1, auditable.length);
  if (correctionMode) {
    const correctionById = new Map((Array.isArray(parsed.corrections) ? parsed.corrections : []).flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const canonicalId = cleanText(String(item.canonicalId || ""));
      return canonicalId ? [[canonicalId, { corrected: item.corrected, verification: item.verification }] as const] : [];
    }));
    return input.reviews.map((review) => {
      if (!review.recommended) return review;
      const failedPreflight = preflightFailures.get(review.canonicalId);
      if (failedPreflight) return failedPreflight;
      const correction = correctionById.get(review.canonicalId);
      const correctedReview = correctedRecommendationReview(review, correction?.corrected);
      if (!correctedReview) throw new Error(`Recommendation correction incomplete: ${review.canonicalId}`);
      const evidence = evidenceByReview.get(review.canonicalId);
      const evidenceById = new Map((evidence?.units || []).map((unit) => [unit.id, unit.text]));
      const options = {
        allowedFields: recommendationVerificationFields(correctedReview),
        allowedEvidenceIds: new Set(evidenceById.keys()),
        evidenceById,
        evidenceTexts: (evidence?.units || []).map((unit) => unit.text),
        requireAllFields: true,
      };
      const initial = sanitizeEvidenceVerificationDraft(review.verificationReport?.audit || {
        verdict: "revise", reason: "A conservative evidence-grounded correction was requested",
      }, options);
      const revised = sanitizeEvidenceVerificationDraft(correction?.verification || {
        verdict: "insufficient", reason: "Correction response omitted its final evidence decision",
      }, options);
      const report = evidenceVerificationReport({ initial, revised });
      const index = auditable.indexOf(review);
      const usage = {
        verificationInputTokens: review.verificationInputTokens + allocatedTokenShare(totalInputTokens, denominator, index),
        verificationOutputTokens: review.verificationOutputTokens + allocatedTokenShare(totalOutputTokens, denominator, index),
      };
      if (!revised.clean) {
        return { ...degradedRecommendationReview(correctedReview, {
          ...report,
          reason: cleanText(`Evidence-grounded correction did not pass the final deterministic gate. ${revised.reason}`).slice(0, 900),
        }), ...usage };
      }
      return {
        ...correctedReview,
        verificationStatus: "revised" as const,
        verificationCoverageScore: revised.coverageScore,
        verificationReport: { ...report, evidenceSource: evidence?.source || "abstract", correctionCompleted: true },
        verificationRetryable: false,
        ...usage,
      };
    });
  }
  const initialRaw = Array.isArray(parsed.verifications) ? parsed.verifications : [];
  const initialById = new Map(initialRaw.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const canonicalId = cleanText(String(item.canonicalId || ""));
    return canonicalId ? [[canonicalId, item] as const] : [];
  }));
  const initialReports = new Map<string, ReturnType<typeof sanitizeEvidenceVerificationDraft>>();
  for (const review of auditable) {
    const raw = initialById.get(review.canonicalId) || { verdict: "insufficient", reason: "Verifier omitted this paper" };
    if (verifierContradictsCompleteDraft(raw.reason, review)) {
      throw new Error(`Recommendation verifier contradicted a complete draft for ${review.canonicalId}`);
    }
    const evidence = evidenceByReview.get(review.canonicalId) || { source: "abstract" as const, units: [] };
    const evidenceById = new Map(evidence.units.map((unit) => [unit.id, unit.text]));
    const report = sanitizeEvidenceVerificationDraft(raw, {
      allowedFields: recommendationVerificationFields(review),
      allowedEvidenceIds: new Set(evidenceById.keys()),
      evidenceById,
      evidenceTexts: evidence.units.map((unit) => unit.text),
      requireAllFields: true,
    });
    initialReports.set(review.canonicalId, report);
  }
  return input.reviews.map((review) => {
    if (!review.recommended) return review;
    const failedPreflight = preflightFailures.get(review.canonicalId);
    if (failedPreflight) return failedPreflight;
    const initial = initialReports.get(review.canonicalId)
      || sanitizeEvidenceVerificationDraft({ verdict: "insufficient", reason: "Verification result missing" }, { allowedFields: recommendationVerificationFields(review) });
    const report = evidenceVerificationReport({ initial });
    const usage = {
      verificationInputTokens: review.verificationInputTokens + allocatedTokenShare(totalInputTokens, denominator, auditable.indexOf(review)),
      verificationOutputTokens: review.verificationOutputTokens + allocatedTokenShare(totalOutputTokens, denominator, auditable.indexOf(review)),
    };
    if (initial.clean) {
      return {
        ...review,
        verificationStatus: "verified" as const,
        verificationCoverageScore: report.coverageScore,
        verificationReport: report,
        verificationRetryable: false,
        ...usage,
      };
    }
    if (initial.verdict === "revise") {
      const evidence = evidenceByReview.get(review.canonicalId);
      return {
        ...pendingRecommendationReview(review, "Independent audit requested a conservative correction; correction is queued"),
        verificationCoverageScore: initial.coverageScore,
        verificationReport: {
          status: "pending",
          reason: "Independent audit requested a conservative correction; correction is queued",
          evidenceSource: evidence?.source || "abstract",
          correctionQueued: false,
          correctionRequested: true,
          audit: initial,
        },
        ...usage,
      };
    }
    return { ...degradedRecommendationReview(review, report), ...usage };
  });
}

function parseQuickScreenPayload(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = parseJsonObject(cleaned) as { screens?: Array<Partial<QuickScreen>> };
  return Array.isArray(parsed.screens) ? parsed.screens : [];
}

async function quickScreenBatch(
  database: D1Database,
  space: SpaceRow,
  userId: string,
  candidates: Candidate[],
  apiKey: string,
  mode: "fast" | "rescue" = "fast",
) {
  const deliberate = mode === "rescue";
  const [routeTitles, preferenceRow] = await Promise.all([
    loadRouteReviewTitles(database, space.id, candidates),
    database.prepare("SELECT profile_key FROM monitor_preferences WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<{ profile_key: string }>(),
  ]);
  const benchmarkProfileKey = preferenceRow?.profile_key || inferDomainProfile(space.name, space.description).key;
  const prompt = [
    "Return one JSON object only with shape {\"screens\":[...]}. Screen every supplied record.",
    "Each screen must contain canonicalId, isPaper, relevanceScore, qualityScore, and screeningReason.",
    "relevanceScore and qualityScore must be integer scores on a 0-100 scale, never decimals on a 0-1 scale. 0 means no fit/evidence and 100 means exceptional fit/evidence.",
    deliberate
      ? "This is a second-pass review of near-miss papers after abstract enrichment. Reconsider subtle theoretical or methodological fit carefully; do not preserve an earlier low score merely because the connection is not stated in generic keywords."
      : "This is a fast but rigorous academic triage pass. Reject mastheads, publication information, author instructions, contents, corrections, calls for papers, and non-research records.",
    "Judge direct fit to the research space, evidence quality, durable usefulness, and the different standards for 14 days, 6 months, and 5 years.",
    "Calibrate relevance consistently: 80-100 means a direct advance; 65-79 means a credible theoretical, methodological, or foundational contribution to a confirmed route; 55-64 means useful adjacent support; below 55 means genuinely weak fit. Do not require the title to repeat the research-space keywords when the supplied abstract or route context establishes the connection.",
    "Route origins are discovery context only. Use them to test the paper's concrete relationship to that direction, but never treat route discovery as recommendation permission, evidence that the paper is good, or a score boost.",
    benchmarkCalibrationPrompt(benchmarkProfileKey),
    "Do not write summaries or reading advice in this pass. Keep screeningReason under 35 words and use only supplied metadata.",
    `Research space: ${space.name} — ${space.description}`,
    `Confirmed research memory: ${space.memoryContext || "No confirmed imported profile yet"}`,
    `Positive examples: ${space.positiveExamples || "None yet"}`,
    `Negative examples: ${space.negativeExamples || "None yet"}`,
    `Records: ${JSON.stringify(candidates.map((paper) => ({
      canonicalId: paper.canonicalId,
      title: paper.title,
      authors: paper.authors,
      venue: paper.venue,
      publishedAt: paper.publishedAt,
      horizon: paper.horizon,
      citations: paper.citationCount,
      priorityVenue: paper.priorityVenue,
      discoverySource: paper.source,
      routeOrigins: routeReviewOrigins(paper, routeTitles),
      abstract: paper.abstractText.slice(0, 900),
    })))}`,
  ].join("\n");
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MONITOR_MODEL,
          messages: [
            { role: "system", content: deliberate
              ? "You are Pi Research's careful evidence-disciplined second-pass paper triage editor. Return strict JSON."
              : "You are Pi Research's fast evidence-disciplined paper triage editor. Return strict JSON." },
            { role: "user", content: prompt },
          ],
          thinking: { type: deliberate && attempt === 0 ? "enabled" : "disabled" },
          reasoning_effort: deliberate && attempt === 0 ? "medium" : "low",
          response_format: { type: "json_object" },
          max_tokens: Math.min(3600, 500 + candidates.length * (deliberate ? 190 : 150)),
          stream: false,
        }),
        signal: AbortSignal.timeout(attempt === 0
          ? deliberate ? QUICK_SCREEN_RESCUE_TIMEOUT_MS : QUICK_SCREEN_FAST_TIMEOUT_MS
          : QUICK_SCREEN_RETRY_TIMEOUT_MS),
      });
      const data = await response.json() as DeepSeekResponse;
      if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro quick screening failed");
      const content = data.choices?.[0]?.message?.content || "";
      if (!content.trim()) throw new Error("DeepSeek Pro returned an empty screening result");
      const parsedScreens = parseQuickScreenPayload(content);
      const scoreScale = inferModelScoreScale(parsedScreens);
      const byId = new Map(parsedScreens.map((item) => [cleanText(item.canonicalId || ""), item]));
      const screens = candidates.map((candidate) => {
        const item = byId.get(candidate.canonicalId);
        if (!item) throw new Error("DeepSeek Pro did not screen every candidate");
        const relevanceScore = normalizeModelScore(item.relevanceScore, scoreScale);
        const qualityScore = normalizeModelScore(item.qualityScore, scoreScale);
        const screeningReason = cleanText(item.screeningReason || "Fast screening completed").slice(0, 300);
        if (hasStrongFitScoreContradiction(relevanceScore, screeningReason)) {
          throw new Error("DeepSeek Pro returned a screening score that contradicted its fit judgment");
        }
        return {
          canonicalId: candidate.canonicalId,
          isPaper: item.isPaper === true,
          relevanceScore,
          qualityScore,
          screeningReason,
          horizon: candidate.horizon,
        } satisfies QuickScreen;
      });
      const usageDate = shanghaiDateKey(new Date());
      const workspaceScope = "monitor-workspace:" + userId.replace(/^anonymous:/, "");
      await Promise.all([
        recordUsage(database, "monitor:global", usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
        recordUsage(database, workspaceScope, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
        recordUsage(database, "monitor-space:" + space.id, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      ]);
      return screens;
    } catch (error) {
      lastError = error;
      if (isNonRetryableDeepSeekError(error)) throw error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("DeepSeek Pro quick screening failed twice");
}

async function quickScreenCandidates(
  database: D1Database,
  space: SpaceRow,
  userId: string,
  candidates: Candidate[],
  apiKey: string,
  mode: "fast" | "rescue" = "fast",
) {
  if (!apiKey) throw new Error("DeepSeek Pro is required before papers can be screened");
  const usageDate = shanghaiDateKey(new Date());
  const workspaceScope = "monitor-workspace:" + userId.replace(/^anonymous:/, "");
  const spaceScope = "monitor-space:" + space.id;
  const groups = Array.from({ length: QUICK_SCREEN_CONCURRENCY }, (_, index) => candidates.slice(index * QUICK_SCREEN_BATCH_SIZE, (index + 1) * QUICK_SCREEN_BATCH_SIZE)).filter((group) => group.length);
  const [globalCount, workspaceCount, spaceCount] = await Promise.all([
    usageCount(database, "monitor:global", usageDate),
    usageCount(database, workspaceScope, usageDate),
    usageCount(database, spaceScope, usageDate),
  ]);
  if (globalCount + groups.length > MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT
    || workspaceCount + groups.length > MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT
    || spaceCount + groups.length > MONITOR_SPACE_DAILY_ANALYSIS_LIMIT) {
    throw new Error("DeepSeek Pro screening budget reached");
  }
  const settled = await Promise.allSettled(groups.map((group) => quickScreenBatch(database, space, userId, group, apiKey, mode)));
  const screens = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const errors = settled.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  const fatalError = errors.find((error) => isNonRetryableDeepSeekError(error));
  if (fatalError && !screens.length) throw fatalError;
  return { screens, errors };
}

async function persistQuickScreens(database: D1Database, spaceId: string, screens: QuickScreen[]) {
  if (!screens.length) return [] as QuickScreen[];
  const placeholders = screens.map(() => "?").join(", ");
  const rows = await database.prepare(
    `SELECT p.id, p.canonical_id FROM monitored_papers p WHERE p.space_id = ? AND p.canonical_id IN (${placeholders})`,
  ).bind(spaceId, ...screens.map((screen) => screen.canonicalId)).all<{ id: string; canonical_id: string }>();
  const paperIds = new Map(rows.results.map((row) => [row.canonical_id, row.id]));
  const writes = screens.flatMap((screen) => {
    const paperId = paperIds.get(screen.canonicalId);
    if (!paperId) return [];
    const eligible = isPrimaryDeepCandidate(screen) || isRescueDeepCandidate(screen) || isContinuityDeepCandidate(screen);
    return [{ screen, statement: database.prepare(
      `UPDATE paper_insights SET
       analysis_source = CASE WHEN ever_recommended = 1 THEN analysis_source ELSE ? END,
       analysis_model = CASE WHEN ever_recommended = 1 THEN analysis_model ELSE ? END,
       llm_recommended = CASE WHEN ever_recommended = 1 THEN llm_recommended ELSE 0 END,
       llm_relevance_score = CASE WHEN ever_recommended = 1 THEN llm_relevance_score ELSE ? END,
       quality_score = CASE WHEN ever_recommended = 1 THEN quality_score ELSE ? END,
       screening_reason = CASE WHEN ever_recommended = 1 THEN screening_reason ELSE ? END,
       updated_at = CURRENT_TIMESTAMP
       WHERE paper_id = ? AND space_id = ?
        AND ${monitorPaperNotDismissedSql("paper_insights.space_id", "paper_insights.paper_id")}`,
    ).bind(eligible ? "deepseek_screened" : "deepseek_rejected", MONITOR_MODEL, screen.relevanceScore, screen.qualityScore, screen.screeningReason, paperId, spaceId) }];
  });
  if (!writes.length) return [] as QuickScreen[];
  const results = await database.batch(writes.map((write) => write.statement));
  return retainChangedMonitorWrites(writes.map((write) => write.screen), results);
}

async function persistReviewBatch(database: D1Database, spaceId: string, scanJobId: string, candidates: Candidate[], reviews: PaperReview[]) {
  if (!reviews.length) return [] as PaperReview[];
  const candidateByCanonical = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const placeholders = reviews.map(() => "?").join(", ");
  const paperRows = await database.prepare(
    `SELECT id, canonical_id FROM monitored_papers WHERE space_id = ? AND canonical_id IN (${placeholders})`,
  ).bind(spaceId, ...reviews.map((review) => review.canonicalId)).all<{ id: string; canonical_id: string }>();
  const paperIds = new Map(paperRows.results.map((row) => [row.canonical_id, row.id]));
  const insightWrites = reviews.flatMap((review) => {
    const candidate = candidateByCanonical.get(review.canonicalId);
    const paperId = paperIds.get(review.canonicalId);
    if (!candidate || !paperId) return [];
    const proposedTier = review.proposedRecommendationTier || review.recommendationTier;
    const effectiveTier = proposedTier;
    return [{ review, statement: database.prepare(
      `INSERT INTO paper_insights
       (paper_id, space_id, abstract_text, summary_zh, summary_en, why_read_zh, why_read_en, quality_score,
        priority_venue, analysis_source, analysis_model, llm_recommended, llm_relevance_score, screening_reason,
        proposed_recommendation_tier, recommendation_tier, read_minutes, read_depth, problem_zh, problem_en, method_zh, method_en,
        contribution_zh, contribution_en, limitations_zh, limitations_en, reading_focus_zh, reading_focus_en,
        research_questions_zh, research_questions_en, research_problem_id, problem_fit_score,
        uncertainty_reduction_score, actionability_score, research_problem_impact_zh, research_problem_impact_en,
        research_decision_zh, research_decision_en, verification_status, verification_coverage_score,
        verification_json, verification_model, ever_recommended, first_recommended_at, last_recommended_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ${monitorPaperNotDismissedSql("?", "?")}
       ON CONFLICT(paper_id) DO UPDATE SET
       abstract_text = CASE WHEN length(trim(excluded.abstract_text)) > 0 THEN excluded.abstract_text ELSE paper_insights.abstract_text END,
       summary_zh = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.summary_zh ELSE excluded.summary_zh END,
       summary_en = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.summary_en ELSE excluded.summary_en END,
       why_read_zh = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.why_read_zh ELSE excluded.why_read_zh END,
       why_read_en = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.why_read_en ELSE excluded.why_read_en END,
       quality_score = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0
        THEN paper_insights.quality_score ELSE excluded.quality_score END,
       priority_venue = MAX(paper_insights.priority_venue, excluded.priority_venue),
       analysis_source = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.analysis_source ELSE excluded.analysis_source END,
       analysis_model = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.analysis_model ELSE excluded.analysis_model END,
       llm_recommended = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.llm_recommended ELSE excluded.llm_recommended END,
       llm_relevance_score = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.llm_relevance_score ELSE excluded.llm_relevance_score END,
       screening_reason = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.screening_reason ELSE excluded.screening_reason END,
       proposed_recommendation_tier = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.proposed_recommendation_tier ELSE excluded.proposed_recommendation_tier END,
       recommendation_tier = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.recommendation_tier ELSE excluded.recommendation_tier END,
       read_minutes = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.read_minutes ELSE excluded.read_minutes END,
       read_depth = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.read_depth ELSE excluded.read_depth END,
       problem_zh = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.problem_zh ELSE excluded.problem_zh END,
       problem_en = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.problem_en ELSE excluded.problem_en END,
       method_zh = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.method_zh ELSE excluded.method_zh END,
       method_en = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.method_en ELSE excluded.method_en END,
       contribution_zh = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.contribution_zh ELSE excluded.contribution_zh END,
       contribution_en = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.contribution_en ELSE excluded.contribution_en END,
       limitations_zh = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.limitations_zh ELSE excluded.limitations_zh END,
       limitations_en = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.limitations_en ELSE excluded.limitations_en END,
       reading_focus_zh = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.reading_focus_zh ELSE excluded.reading_focus_zh END,
       reading_focus_en = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.reading_focus_en ELSE excluded.reading_focus_en END,
       research_questions_zh = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.research_questions_zh ELSE excluded.research_questions_zh END,
       research_questions_en = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.research_questions_en ELSE excluded.research_questions_en END,
       research_problem_id = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.research_problem_id ELSE excluded.research_problem_id END,
       problem_fit_score = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.problem_fit_score ELSE excluded.problem_fit_score END,
       uncertainty_reduction_score = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.uncertainty_reduction_score ELSE excluded.uncertainty_reduction_score END,
       actionability_score = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.actionability_score ELSE excluded.actionability_score END,
       research_problem_impact_zh = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.research_problem_impact_zh ELSE excluded.research_problem_impact_zh END,
       research_problem_impact_en = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.research_problem_impact_en ELSE excluded.research_problem_impact_en END,
       research_decision_zh = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.research_decision_zh ELSE excluded.research_decision_zh END,
       research_decision_en = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.research_decision_en ELSE excluded.research_decision_en END,
       verification_status = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.verification_status ELSE excluded.verification_status END,
       verification_coverage_score = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.verification_coverage_score ELSE excluded.verification_coverage_score END,
       verification_json = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.verification_json ELSE excluded.verification_json END,
       verification_model = CASE WHEN paper_insights.ever_recommended = 1 AND excluded.ever_recommended = 0 THEN paper_insights.verification_model ELSE excluded.verification_model END,
       ever_recommended = MAX(paper_insights.ever_recommended, excluded.ever_recommended),
       first_recommended_at = COALESCE(paper_insights.first_recommended_at, excluded.first_recommended_at),
       last_recommended_at = CASE WHEN excluded.ever_recommended = 1 THEN excluded.last_recommended_at ELSE paper_insights.last_recommended_at END,
       updated_at = CURRENT_TIMESTAMP`,
    ).bind(paperId, spaceId, candidate.abstractText, review.summaryZh, review.summaryEn, review.whyReadZh, review.whyReadEn,
      review.qualityScore, candidate.priorityVenue ? 1 : 0,
      review.verificationRetryable ? "deepseek_verification_pending" : review.recommended ? "deepseek" : "deepseek_rejected",
      MONITOR_MODEL, isPublishedRecommendation(review) ? 1 : 0, review.relevanceScore, review.screeningReason,
      proposedTier, effectiveTier, review.readMinutes, review.readDepth, review.problemZh, review.problemEn,
      review.methodZh, review.methodEn, review.contributionZh, review.contributionEn, review.limitationsZh,
      review.limitationsEn, review.readingFocusZh, review.readingFocusEn, JSON.stringify(review.researchQuestionsZh),
      JSON.stringify(review.researchQuestionsEn), review.researchProblemId || null, review.problemFitScore,
      review.uncertaintyReductionScore, review.actionabilityScore, review.researchProblemImpactZh,
      review.researchProblemImpactEn, review.researchDecisionZh, review.researchDecisionEn,
      review.verificationStatus, review.verificationCoverageScore, JSON.stringify(review.verificationReport),
      review.verificationStatus === "not_required" ? "" : MONITOR_MODEL,
      isPublishedRecommendation(review) ? 1 : 0,
      isPublishedRecommendation(review) ? new Date().toISOString() : null,
      isPublishedRecommendation(review) ? new Date().toISOString() : null,
      spaceId, paperId) }];
  });
  if (!insightWrites.length) return [] as PaperReview[];
  const insightResults = await database.batch(insightWrites.map((write) => write.statement));
  const persistedReviews = retainChangedMonitorWrites(insightWrites.map((write) => write.review), insightResults);

  const proposals = persistedReviews.flatMap((review) => {
    const candidate = candidateByCanonical.get(review.canonicalId);
    const paperId = paperIds.get(review.canonicalId);
    if (!isPublishedRecommendation(review) || !review.trackId || !paperId || !review.mapRationaleZh || !review.mapRationaleEn) return [];
    const reviewsSystemCuratedPaper = candidate?.provenance.some((entry) => entry.routeId === review.trackId
      && /^research-route:(foundation|milestone|frontier)$/.test(entry.sourceKey));
    return [{
      id: reviewsSystemCuratedPaper ? `${SYSTEM_CURATED_RESEARCH_MAP_REVIEW_ID_PREFIX}${spaceId}:${review.trackId}:${paperId}` : undefined,
      spaceId, trackId: review.trackId, paperId, scanJobId, mapRole: review.mapRole,
      rationaleZh: review.mapRationaleZh, rationaleEn: review.mapRationaleEn, confidence: review.relevanceScore,
    }];
  });
  await upsertPendingResearchMapEvidence(database, proposals);
  await promoteAlreadyAcceptedResearchMapEvidence(database, spaceId, proposals.map((proposal) => proposal.paperId));
  return persistedReviews;
}

function allocatedTokenShare(total: number, count: number, index: number) {
  if (count <= 0 || total <= 0) return 0;
  return Math.floor(total / count) + (index < total % count ? 1 : 0);
}

async function persistRecommendationAuditBatch(
  database: D1Database,
  spaceId: string,
  jobId: string,
  candidates: Candidate[],
  reviews: PaperReview[],
  inputTokens: number,
  outputTokens: number,
) {
  if (!reviews.length) return;
  const candidateByCanonical = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const placeholders = reviews.map(() => "?").join(", ");
  const paperRows = await database.prepare(
    `SELECT id, canonical_id FROM monitored_papers WHERE space_id = ? AND canonical_id IN (${placeholders})`,
  ).bind(spaceId, ...reviews.map((review) => review.canonicalId)).all<{ id: string; canonical_id: string }>();
  const paperIds = new Map(paperRows.results.map((row) => [row.canonical_id, row.id]));
  const statements = reviews.flatMap((review, index) => {
    const candidate = candidateByCanonical.get(review.canonicalId);
    const paperId = paperIds.get(review.canonicalId);
    if (!candidate || !paperId) return [];
    const routeProvenance = candidate.provenance.filter(isMonitorRouteProvenance);
    const genericProvenance = candidate.provenance.filter((entry) => !routeProvenance.includes(entry));
    const provenance = [...routeProvenance, ...genericProvenance].slice(0, 16).map((entry) => ({
      sourceKey: entry.sourceKey,
      channel: entry.channel,
      queryKey: entry.queryKey,
      queryText: cleanText(entry.queryText || "").slice(0, 500),
      routeId: entry.routeId || null,
      originKind: monitorRouteOriginKind(entry.sourceKey, entry.routeId),
      appearances: Math.max(1, entry.appearances || 1),
    }));
    const appearanceCount = provenance.reduce((sum, entry) => sum + entry.appearances, 0) || 1;
    let decision = !review.isPaper ? "not_paper" : review.recommended ? "recommended" : "rejected";
    if (review.verificationRetryable) decision = "verification_pending";
    return [database.prepare(
      `INSERT INTO recommendation_audit_events
       (id, space_id, scan_job_id, paper_id, decision, is_paper, recommended, horizon, model,
        relevance_score, quality_score, recommendation_tier, screening_reason, provenance_json,
        appearance_count, allocated_input_tokens, allocated_output_tokens, verification_status,
        verification_coverage_score, verification_json, verification_input_tokens, verification_output_tokens)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ${monitorPaperNotDismissedSql("?", "?")}
       ON CONFLICT(scan_job_id, paper_id) DO UPDATE SET decision = excluded.decision,
       is_paper = excluded.is_paper, recommended = excluded.recommended, horizon = excluded.horizon,
       model = excluded.model, relevance_score = excluded.relevance_score, quality_score = excluded.quality_score,
       recommendation_tier = excluded.recommendation_tier, screening_reason = excluded.screening_reason,
       provenance_json = excluded.provenance_json, appearance_count = excluded.appearance_count,
       allocated_input_tokens = CASE WHEN excluded.allocated_input_tokens > 0 THEN excluded.allocated_input_tokens ELSE recommendation_audit_events.allocated_input_tokens END,
       allocated_output_tokens = CASE WHEN excluded.allocated_output_tokens > 0 THEN excluded.allocated_output_tokens ELSE recommendation_audit_events.allocated_output_tokens END,
       verification_status = excluded.verification_status,
       verification_coverage_score = excluded.verification_coverage_score,
       verification_json = excluded.verification_json,
       verification_input_tokens = excluded.verification_input_tokens,
       verification_output_tokens = excluded.verification_output_tokens, reviewed_at = CURRENT_TIMESTAMP`,
    ).bind(
      crypto.randomUUID(), spaceId, jobId, paperId, decision, review.isPaper ? 1 : 0, isPublishedRecommendation(review) ? 1 : 0,
      candidate.horizon, MONITOR_MODEL, review.relevanceScore, review.qualityScore, review.recommendationTier,
      review.screeningReason, JSON.stringify(provenance), appearanceCount,
      allocatedTokenShare(inputTokens, reviews.length, index), allocatedTokenShare(outputTokens, reviews.length, index),
      review.verificationStatus, review.verificationCoverageScore, JSON.stringify(review.verificationReport),
      review.verificationInputTokens, review.verificationOutputTokens,
      spaceId, paperId,
    )];
  });
  if (statements.length) await database.batch(statements);
}

async function reviewCandidates(database: D1Database, space: SpaceRow, userId: string, priorityVenues: string[], candidates: Candidate[], jobId: string, lockToken: string, apiKey: string) {
  if (!candidates.length) return [] as PaperReview[];
  if (!apiKey) throw new Error("DeepSeek Pro is required before papers can be recommended");
  const usageDate = shanghaiDateKey(new Date());
  const workspaceScope = "monitor-workspace:" + userId.slice("anonymous:".length);
  const spaceScope = "monitor-space:" + space.id;
  // Drafting is persisted before bibliographic and abstract evidence checks. The verification
  // stage has its own checkpoint, so a slow verifier never repeats this call.
  const expectedCalls = Math.ceil(candidates.length / REVIEW_BATCH_SIZE);
  const [globalCount, workspaceCount, spaceCount] = await Promise.all([
    usageCount(database, "monitor:global", usageDate),
    usageCount(database, workspaceScope, usageDate),
    usageCount(database, spaceScope, usageDate),
  ]);
  if (globalCount + expectedCalls > MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT
    || workspaceCount + expectedCalls > MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT
    || spaceCount + expectedCalls > MONITOR_SPACE_DAILY_ANALYSIS_LIMIT) {
    throw new Error("DeepSeek Pro review budget reached; unreviewed papers were not published");
  }
  const mapTracks = await database.prepare(
    "SELECT id, title_zh, title_en, summary_en, search_queries, intelligence_json, intelligence_updated_at FROM research_tracks WHERE space_id = ? ORDER BY position LIMIT 6",
  ).bind(space.id).all<MapTrackContext>();
  const activeProblems = await database.prepare(
    `SELECT problem.id, problem.track_id, problem.question, problem.objective, problem.scope,
      problem.success_criteria, problem.stage,
      COALESCE((SELECT assessment.uncertainty_en FROM research_problem_assessments assessment
        WHERE assessment.problem_id = problem.id ORDER BY assessment.created_at DESC, assessment.rowid DESC LIMIT 1), '') AS uncertainty_en,
      COALESCE((SELECT assessment.next_decision_en FROM research_problem_assessments assessment
        WHERE assessment.problem_id = problem.id ORDER BY assessment.created_at DESC, assessment.rowid DESC LIMIT 1), '') AS next_decision_en
      ,COALESCE((SELECT run.result_en FROM research_action_runs run
        WHERE run.problem_id = problem.id AND run.status = 'ready' AND run.verification_status IN ('verified', 'revised') ORDER BY run.completed_at DESC, run.rowid DESC LIMIT 1), '') AS latest_action_result_en
      ,COALESCE((SELECT run.decision_en FROM research_action_runs run
        WHERE run.problem_id = problem.id AND run.status = 'ready' AND run.verification_status IN ('verified', 'revised') ORDER BY run.completed_at DESC, run.rowid DESC LIMIT 1), '') AS latest_action_decision_en
     FROM research_problems problem WHERE problem.space_id = ? AND problem.status = 'active'
     ORDER BY problem.updated_at DESC LIMIT 6`,
  ).bind(space.id).all<{ id: string; track_id: string; question: string; objective: string; scope: string; success_criteria: string; stage: string; uncertainty_en: string; next_decision_en: string; latest_action_result_en: string; latest_action_decision_en: string }>();
  const validTrackIds = new Set(mapTracks.results.map((track) => track.id));
  const validProblemIds = new Set(activeProblems.results.map((problem) => problem.id));
  const problemByTrackId = new Map(activeProblems.results.map((problem) => [problem.track_id, problem]));
  const routeTitles = new Map(mapTracks.results.map((track) => [track.id, { titleZh: track.title_zh, titleEn: track.title_en }]));
  const boundedMemoryContext = cleanText(space.memoryContext || "No confirmed imported profile yet").slice(0, 1800);
  const boundedPositiveExamples = cleanText(space.positiveExamples || "No positive paper feedback yet").slice(0, 1000);
  const boundedNegativeExamples = cleanText(space.negativeExamples || "No negative paper feedback yet").slice(0, 800);
  const benchmarkPreference = await database.prepare("SELECT profile_key FROM monitor_preferences WHERE space_id = ? LIMIT 1")
    .bind(space.id).first<{ profile_key: string }>();
  const benchmarkProfileKey = benchmarkPreference?.profile_key || inferDomainProfile(space.name, space.description).key;
  const compactMapTracks = mapTracks.results.map((track) => ({
    id: track.id,
    titleZh: track.title_zh,
    titleEn: track.title_en,
    summaryEn: cleanText(track.summary_en).slice(0, 280),
    searchQueries: parseVenues(track.search_queries).slice(0, 3),
    intelligence: directionDiscoverySignal(track.intelligence_json, track.intelligence_updated_at),
  }));
  const compactProblems = activeProblems.results.map((problem) => ({
    id: problem.id,
    track_id: problem.track_id,
    question: cleanText(problem.question).slice(0, 260),
    objective: cleanText(problem.objective).slice(0, 220),
    uncertainty_en: cleanText(problem.uncertainty_en).slice(0, 260),
    next_decision_en: cleanText(problem.next_decision_en).slice(0, 220),
  }));
  const completed: PaperReview[] = [];

  for (let start = 0; start < candidates.length; start += REVIEW_BATCH_SIZE) {
    const batch = candidates.slice(start, start + REVIEW_BATCH_SIZE);
    const batchReviews: PaperReview[] = [];
    let batchInputTokens = 0;
    let batchOutputTokens = 0;
    const batchRecords = batch.map((paper) => ({
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
      routeOrigins: routeReviewOrigins(paper, routeTitles),
      abstract: paper.abstractText.slice(0, 1400),
    }));
    const prompt = [
      "Return one JSON object only, with shape {\"reviews\":[...]}. Review every supplied record.",
      "Each review must contain: canonicalId, isPaper, recommended, relevanceScore, qualityScore, recommendationTier, readMinutes, readDepth, summaryZh, summaryEn, whyReadZh, whyReadEn, problemZh/En, methodZh/En, contributionZh/En, limitationsZh/En, readingFocusZh/En, researchQuestionsZh/En, screeningReason, trackId, mapRole, mapRationaleZh, mapRationaleEn, researchProblemId, problemFitScore, uncertaintyReductionScore, actionabilityScore, researchProblemImpactZh/En, researchDecisionZh/En.",
      "relevanceScore and qualityScore must be integer scores on a 0-100 scale, never decimals on a 0-1 scale.",
      "Act as a strict academic editor, not a search-result summarizer. A real paper can still be irrelevant and must then be rejected.",
      "Set isPaper=false for mastheads, publication information, author instructions, contents, editorials without research content, corrections, calls for papers, or other non-paper records.",
      `Set recommended=true only when relevanceScore >= ${RECOMMENDATION_THRESHOLD}, the work directly advances, rigorously underpins, or methodologically enables a confirmed research-space direction, and it satisfies its horizon standard. Recency, citations, or a priority venue alone never justify recommendation.`,
      "A paper may be recommended as reserve reading when its connection is supporting rather than central, but the connection must still be concrete and useful. Do not reject a strong foundational or bridge paper merely because its title does not repeat the research-space keywords.",
      "Horizon standards: days = genuinely relevant new development; months = relevant, new, and high quality; years = highly relevant, durable, useful, and methodologically or strategically instructive.",
      "Use only supplied title, abstract, authors, venue, date, citation, and priority-venue evidence. Never invent a theorem, method, experiment, result, section, or conclusion.",
      "Because only metadata and abstracts are supplied, never cite section, page, figure, table, appendix, or theorem numbers in readingFocus or any other field.",
      "Never claim that a work is the first, provides a complete characterization, proves a result, validates it experimentally, establishes a convergence rate, or is optimal unless the supplied abstract explicitly states that exact point.",
      "For recommended papers, summaryZh must be a concrete 100-180 Chinese-character introduction explaining the research question, approach, and evidence-backed contribution; summaryEn must convey the same substance in 55-95 words.",
      "For recommended papers, whyReadZh must be a specific 80-150 Chinese-character explanation of how the paper helps this exact research space and which idea, method, comparison, or decision the reader should extract; whyReadEn must convey the same substance in 45-80 words.",
      "For recommended papers, write evidence-disciplined bilingual fields for the research problem, method, main contribution, limitations or uncertainty, and concrete reading focus. If the metadata cannot support a claim, state that the abstract/metadata is insufficient instead of inventing it.",
      "researchQuestionsZh and researchQuestionsEn must each contain 2-4 concise follow-up questions that a researcher could investigate after reading; align the two lists semantically.",
      "Choose recommendationTier=must_read only for a direct, high-consequence match; browse for a useful paper worth focused reading; reserve for a credible paper that should be kept as supporting material. Choose readDepth=deep|focused|overview and estimate readMinutes from 5 to 90.",
      "When a paper bears directly on a user-confirmed active research problem, return its exact researchProblemId and score problemFitScore, uncertaintyReductionScore, and actionabilityScore from 0-100. Explain what judgment it may change in researchProblemImpactZh/En and what the researcher should decide after reading in researchDecisionZh/En. Metadata or an abstract may motivate a decision to investigate; it cannot justify claiming the user hypothesis is proved. Leave researchProblemId and all related text empty for no credible problem link.",
      "If an active research problem exists for the assigned track, must_read additionally requires problemFitScore >= 82 and a non-empty concrete research decision. Otherwise downgrade to browse. Route relevance alone remains enough for browse or reserve when the paper is useful but does not directly advance the active problem.",
      "Do not write generic phrases such as 'it is recent', 'it has a high score', or 'it comes from a priority venue' as the main reason to read.",
      "For rejected records, set all summary, whyRead, problem, method, contribution, limitations, and readingFocus fields to empty strings, set both researchQuestions arrays to [], and give a short screeningReason. Never spend narrative tokens explaining a rejected record.",
      "When research-map directions are supplied, assign every recommended paper to the single best-fitting trackId whenever a credible direct or supporting relationship exists. Use an empty trackId only when every available direction would create a misleading relationship.",
      "For a track assignment, use mapRole=foundation for a field-defining prerequisite, milestone for a durable development, or frontier for current active work, and write a concrete bilingual map rationale explaining how it extends that direction. For no assignment, keep both map rationales empty.",
      `Research space: ${space.name} — ${space.description}`,
      benchmarkCalibrationPrompt(benchmarkProfileKey),
      `User-confirmed imported research memory: ${boundedMemoryContext}`,
      `Papers the user explicitly valued or saved: ${boundedPositiveExamples}`,
      `Papers the user explicitly marked not relevant: ${boundedNegativeExamples}`,
      "Treat positive examples as preference evidence, not as permission to recommend loosely related papers. Use negative examples to recognize and reject recurring topic drift.",
      "Route-origin metadata explains why Pi surfaced a candidate. Verify that relationship against the supplied title and abstract; it is context only and never permission to recommend or to lower the quality threshold.",
      `Priority venues: ${priorityVenues.join("; ")}`,
      `Existing research-map directions: ${JSON.stringify(compactMapTracks)}`,
      `User-confirmed active research problems and their current unresolved decisions: ${JSON.stringify(compactProblems)}`,
      "Use each direction's evidence gap and watch signal when judging whether a paper actually changes that route. A keyword match that does not close a gap, strengthen evidence, or reveal a credible new branch should not be mapped as new route evidence.",
      "JSON records to review:",
      JSON.stringify(batchRecords),
    ].join("\n");
    const compactRetryPrompt = [
      "Return one JSON object only as {\"reviews\":[...]}; review every record and copy canonicalId exactly.",
      "This is a latency-safe fallback. Judge the supplied evidence directly without hidden chain-of-thought.",
      `Set recommended=true only for a concrete research fit with relevanceScore >= ${RECOMMENDATION_THRESHOLD} and credible quality. Scores are integers from 0 to 100.`,
      "Each item must include canonicalId, isPaper, recommended, relevanceScore, qualityScore, recommendationTier, readMinutes, readDepth, summaryZh, summaryEn, whyReadZh, whyReadEn, problemZh, problemEn, methodZh, methodEn, contributionZh, contributionEn, limitationsZh, limitationsEn, readingFocusZh, readingFocusEn, researchQuestionsZh, researchQuestionsEn, screeningReason, trackId, mapRole, mapRationaleZh, mapRationaleEn.",
      "For every recommended paper, both researchQuestions lists must contain at least 2 concrete questions and every bilingual narrative field must be populated.",
      "For a recommended paper, keep each bilingual narrative concrete but concise and grounded only in the title, abstract, authors, venue, date, and citations supplied. For a rejected paper, leave narrative fields empty and explain the rejection briefly.",
      `Research space: ${space.name} — ${cleanText(space.description).slice(0, 600)}`,
      `Research-map directions: ${JSON.stringify(compactMapTracks.map((track) => ({ id: track.id, titleZh: track.titleZh, titleEn: track.titleEn, summaryEn: track.summaryEn })))}`,
      `Records: ${JSON.stringify(batchRecords)}`,
    ].join("\n");

    let parsed: { reviews?: Array<Partial<PaperReview>> } | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt += 1) {
      try {
        const response = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MONITOR_MODEL,
            messages: [
              { role: "system", content: "You are Pi Research's evidence-disciplined paper screening and briefing editor. Produce strict JSON." },
              { role: "user", content: attempt === 0 ? prompt : compactRetryPrompt },
            ],
            thinking: { type: "disabled" },
            reasoning_effort: "low",
            response_format: { type: "json_object" },
            max_tokens: Math.min(attempt === 0 ? 2600 : 1800, 650 + batch.length * (attempt === 0 ? 1750 : 1150)),
            stream: false,
          }),
          signal: AbortSignal.timeout(attempt === 0 ? DEEP_REVIEW_PRIMARY_TIMEOUT_MS : DEEP_REVIEW_RETRY_TIMEOUT_MS),
        });
        const data = await response.json() as DeepSeekResponse;
        if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro review failed");
        batchInputTokens = data.usage?.prompt_tokens || 0;
        batchOutputTokens = data.usage?.completion_tokens || 0;
        await Promise.all([
          recordUsage(database, "monitor:global", usageDate, batchInputTokens, batchOutputTokens),
          recordUsage(database, workspaceScope, usageDate, batchInputTokens, batchOutputTokens),
          recordUsage(database, "monitor-space:" + space.id, usageDate, batchInputTokens, batchOutputTokens),
        ]);
        const content = data.choices?.[0]?.message?.content || "";
        if (!content.trim()) throw new Error("DeepSeek Pro returned an empty review");
        const nextParsed = parseReviewPayload(content);
        const nextScoreScale = inferModelScoreScale(nextParsed.reviews || []);
        const incomplete = (nextParsed.reviews || []).filter((item) => item.isPaper === true && item.recommended === true
          && normalizeModelScore(item.relevanceScore, nextScoreScale) >= RECOMMENDATION_THRESHOLD
          && normalizeModelScore(item.qualityScore, nextScoreScale) >= 65)
          .map((item) => ({ canonicalId: cleanText(item.canonicalId || ""), missing: recommendationDraftMissingFields(item) }))
          .filter((item) => item.missing.length);
        if (incomplete.length) {
          throw new Error(`DeepSeek Pro returned an incomplete recommended review: ${incomplete.map((item) => `${item.canonicalId || "unknown"} (${item.missing.join(", ")})`).join("; ")}`);
        }
        parsed = nextParsed;
      } catch (error) {
        lastError = error;
        if (isNonRetryableDeepSeekError(error)) throw error;
        if (attempt === 0) {
          await database.prepare(
            "UPDATE monitor_scan_jobs SET current_source = '当前论文响应较慢，正在切换快速模式重试；已完成论文不会重做', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).bind(jobId).run();
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
    if (!parsed) throw lastError instanceof Error ? lastError : new Error("DeepSeek Pro review failed twice");
    const parsedReviews = parsed.reviews || [];
    const scoreScale = inferModelScoreScale(parsedReviews);
    const byId = new Map(parsedReviews.map((item) => [item.canonicalId, item]));
    for (const candidate of batch) {
      const item = byId.get(candidate.canonicalId);
      if (!item) throw new Error("DeepSeek Pro did not review every candidate");
      const relevanceScore = normalizeModelScore(item.relevanceScore, scoreScale);
      const qualityScore = normalizeModelScore(item.qualityScore, scoreScale);
      const summaryZh = cleanText(item.summaryZh || "").slice(0, 900);
      const summaryEn = cleanText(item.summaryEn || "").slice(0, 1200);
      const whyReadZh = cleanText(item.whyReadZh || "").slice(0, 800);
      const whyReadEn = cleanText(item.whyReadEn || "").slice(0, 1000);
      const requestedTier = item.recommendationTier === "must_read" || item.recommendationTier === "reserve" ? item.recommendationTier : "browse";
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
      const assignedTrackId = mapRationaleZh && mapRationaleEn ? trackId : "";
      const activeProblem = assignedTrackId ? problemByTrackId.get(assignedTrackId) : undefined;
      const requestedProblemId = cleanText(item.researchProblemId || "");
      const researchProblemId = recommended && activeProblem && validProblemIds.has(requestedProblemId)
        && activeProblem.id === requestedProblemId ? requestedProblemId : "";
      const problemFitScore = researchProblemId ? normalizeModelScore(item.problemFitScore, scoreScale) : 0;
      const uncertaintyReductionScore = researchProblemId ? normalizeModelScore(item.uncertaintyReductionScore, scoreScale) : 0;
      const actionabilityScore = researchProblemId ? normalizeModelScore(item.actionabilityScore, scoreScale) : 0;
      const researchProblemImpactZh = researchProblemId ? cleanText(item.researchProblemImpactZh || "").slice(0, 760) : "";
      const researchProblemImpactEn = researchProblemId ? cleanText(item.researchProblemImpactEn || "").slice(0, 1000) : "";
      const researchDecisionZh = researchProblemId ? cleanText(item.researchDecisionZh || "").slice(0, 650) : "";
      const researchDecisionEn = researchProblemId ? cleanText(item.researchDecisionEn || "").slice(0, 850) : "";
      let recommendationTier: PaperReview["recommendationTier"] = requestedTier === "must_read" && (relevanceScore < 86 || qualityScore < 80) ? "browse" : requestedTier;
      if (recommendationTier === "must_read" && activeProblem
        && (!researchProblemId || problemFitScore < 82 || !researchProblemImpactZh || !researchProblemImpactEn
          || !researchDecisionZh || !researchDecisionEn)) recommendationTier = "browse";
      batchReviews.push({
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
        trackId: assignedTrackId,
        mapRole: paperReviewMapRole(item.mapRole),
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
        researchProblemId,
        problemFitScore,
        uncertaintyReductionScore,
        actionabilityScore,
        researchProblemImpactZh,
        researchProblemImpactEn,
        researchDecisionZh,
        researchDecisionEn,
        verificationStatus: "not_required",
        verificationCoverageScore: 0,
        verificationReport: {},
        verificationInputTokens: 0,
        verificationOutputTokens: 0,
        verificationRetryable: false,
        proposedRecommendationTier: recommendationTier,
        evidenceLevel: candidate.abstractText.trim() ? "abstract" : "metadata",
        evidenceStatus: "unavailable",
        evidenceGroundedClaims: 0,
        evidenceUnsupportedClaims: 0,
        evidenceCoverageScore: 0,
      });
    }
    const draftedBatchReviews = batchReviews.map((review) => pendingRecommendationReview(review));
    const persistedBatchReviews = await persistReviewBatch(database, space.id, jobId, batch, draftedBatchReviews);
    completed.push(...persistedBatchReviews);
    try {
      await persistRecommendationAuditBatch(database, space.id, jobId, batch, persistedBatchReviews, batchInputTokens, batchOutputTokens);
    } catch (auditError) {
      // Internal evaluation must not force another paid LLM review when recommendation persistence succeeded.
      console.error("Failed to persist internal recommendation audit", auditError);
    }
    await database.batch([
      database.prepare(
        "UPDATE monitor_scan_jobs SET checkpoint = 'reviewing', reviewed_count = ?, recommended_count = ?, progress = MIN(87, 58 + CAST((? * 29.0) / MAX(1, ?) AS INTEGER)), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(completed.length, completed.filter(isPublishedRecommendation).length, completed.length, candidates.length, jobId),
      database.prepare(
        "UPDATE monitor_runs SET lock_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND lock_token = ?",
      ).bind(new Date(Date.now() + RUN_LOCK_LEASE_MS).toISOString(), space.id, lockToken),
    ]);
  }
  return completed;
}

async function reconcileRecommendedReviewTracks(
  database: D1Database,
  space: SpaceRow,
  userId: string,
  candidates: Candidate[],
  reviews: PaperReview[],
  apiKey: string,
) {
  const missing = reviews.filter((review) => isPublishedRecommendation(review) && !review.trackId);
  if (!missing.length || !apiKey) return reviews;
  const tracks = await database.prepare(
    "SELECT id, title_zh, title_en, summary_zh, summary_en FROM research_tracks WHERE space_id = ? ORDER BY position LIMIT 12",
  ).bind(space.id).all<{ id: string; title_zh: string; title_en: string; summary_zh: string; summary_en: string }>();
  if (!tracks.results.length) return reviews;
  const usageDate = shanghaiDateKey(new Date());
  const workspaceScope = "monitor-workspace:" + userId.replace(/^anonymous:/, "");
  const spaceScope = "monitor-space:" + space.id;
  const [globalCount, workspaceCount, spaceCount] = await Promise.all([
    usageCount(database, "monitor:global", usageDate), usageCount(database, workspaceScope, usageDate), usageCount(database, spaceScope, usageDate),
  ]);
  if (globalCount >= MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT
    || workspaceCount >= MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT
    || spaceCount >= MONITOR_SPACE_DAILY_ANALYSIS_LIMIT) return reviews;
  const candidateById = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const validTrackIds = new Set(tracks.results.map((track) => track.id));
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MONITOR_MODEL,
        messages: [
          { role: "system", content: "You are Pi Research's research-map routing editor. Return strict JSON grounded only in supplied paper and route evidence." },
          { role: "user", content: [
            "Return {\"assignments\":[...]} and review every supplied paper.",
            "Each assignment needs canonicalId, trackId, mapRole (foundation|milestone|frontier), rationaleZh, rationaleEn, confidence (0-100).",
            "Choose the single route that the paper most credibly extends, supports, challenges, or connects. Do not rely on title keywords alone.",
            "Use an empty trackId and empty rationales only when all available routes would be misleading. Never invent a result beyond supplied summaries.",
            `Research space: ${space.name} — ${space.description}`,
            `Routes: ${JSON.stringify(tracks.results.map((track) => ({ id: track.id, titleZh: track.title_zh, titleEn: track.title_en, summaryZh: track.summary_zh, summaryEn: track.summary_en })))}`,
            `Recommended papers: ${JSON.stringify(missing.map((review) => ({
              canonicalId: review.canonicalId,
              title: candidateById.get(review.canonicalId)?.title || "",
              abstract: candidateById.get(review.canonicalId)?.abstractText.slice(0, 1400) || "",
              summaryZh: review.summaryZh,
              summaryEn: review.summaryEn,
              contributionZh: review.contributionZh,
              contributionEn: review.contributionEn,
            })))}`,
          ].join("\n") },
        ],
        thinking: { type: "disabled" },
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        max_tokens: 3600,
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json() as DeepSeekResponse;
    if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro route reconciliation failed");
    await Promise.all([
      recordUsage(database, "monitor:global", usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      recordUsage(database, workspaceScope, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      recordUsage(database, spaceScope, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
    ]);
    const parsed = parseJsonObject(data.choices?.[0]?.message?.content || "") as { assignments?: Array<Record<string, unknown>> };
    const assignments = new Map((parsed.assignments || []).flatMap((item) => {
      const canonicalId = cleanText(String(item.canonicalId || ""));
      const trackId = cleanText(String(item.trackId || ""));
      const rationaleZh = cleanText(String(item.rationaleZh || "")).slice(0, 700);
      const rationaleEn = cleanText(String(item.rationaleEn || "")).slice(0, 900);
      if (!canonicalId || !validTrackIds.has(trackId) || !rationaleZh || !rationaleEn) return [];
      return [[canonicalId, {
        trackId,
        mapRole: paperReviewMapRole(item.mapRole),
        mapRationaleZh: rationaleZh,
        mapRationaleEn: rationaleEn,
      }] as const];
    }));
    return reviews.map((review) => review.trackId || !isPublishedRecommendation(review) || !assignments.has(review.canonicalId)
      ? review : { ...review, ...assignments.get(review.canonicalId)! });
  } catch (error) {
    console.error("Non-blocking route reconciliation failed", error);
    return reviews;
  }
}

function briefList(value: unknown, limit = 4, maxLength = 360) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(String(item)).slice(0, maxLength)).filter(Boolean).slice(0, limit);
}

function shanghaiDateKey(date: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function mondayKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

async function saveDailyBrief(
  database: D1Database,
  input: {
    id?: string;
    spaceId: string;
    briefDate: string;
    jobId: string;
    status: "ready" | "degraded";
    headlineZh: string;
    headlineEn: string;
    overviewZh: string;
    overviewEn: string;
    signalsZh: string[];
    signalsEn: string[];
    readingPlanZh: string[];
    readingPlanEn: string[];
    watchlistZh: string[];
    watchlistEn: string[];
    paperIds: string[];
    metrics: Record<string, number>;
    model: string;
    error?: string | null;
  },
) {
  const existingRow = await database.prepare(
    `SELECT headline_zh, headline_en, overview_zh, overview_en, signals_zh, signals_en,
     reading_plan_zh, reading_plan_en, watchlist_zh, watchlist_en, paper_ids, metrics_json
     FROM monitor_daily_briefs WHERE space_id = ? AND brief_date = ? LIMIT 1`,
  ).bind(input.spaceId, input.briefDate).first<{
    headline_zh: string; headline_en: string; overview_zh: string; overview_en: string;
    signals_zh: string; signals_en: string; reading_plan_zh: string; reading_plan_en: string;
    watchlist_zh: string; watchlist_en: string; paper_ids: string; metrics_json: string;
  }>();
  const mergedInput = mergeDailyBriefHistory(existingRow ? {
    headlineZh: existingRow.headline_zh,
    headlineEn: existingRow.headline_en,
    overviewZh: existingRow.overview_zh,
    overviewEn: existingRow.overview_en,
    signalsZh: parseVenues(existingRow.signals_zh),
    signalsEn: parseVenues(existingRow.signals_en),
    readingPlanZh: parseVenues(existingRow.reading_plan_zh),
    readingPlanEn: parseVenues(existingRow.reading_plan_en),
    watchlistZh: parseVenues(existingRow.watchlist_zh),
    watchlistEn: parseVenues(existingRow.watchlist_en),
    paperIds: parseVenues(existingRow.paper_ids),
    metrics: parseJsonObject(existingRow.metrics_json) as Record<string, number>,
  } : null, input);
  await database.prepare(
    `INSERT INTO monitor_daily_briefs
     (id, space_id, brief_date, scan_job_id, status, headline_zh, headline_en, overview_zh, overview_en,
      signals_zh, signals_en, reading_plan_zh, reading_plan_en, watchlist_zh, watchlist_en,
      paper_ids, metrics_json, model, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(space_id, brief_date) DO UPDATE SET scan_job_id = excluded.scan_job_id, status = excluded.status,
      headline_zh = excluded.headline_zh, headline_en = excluded.headline_en,
      overview_zh = excluded.overview_zh, overview_en = excluded.overview_en,
      signals_zh = excluded.signals_zh, signals_en = excluded.signals_en,
      reading_plan_zh = excluded.reading_plan_zh, reading_plan_en = excluded.reading_plan_en,
      watchlist_zh = excluded.watchlist_zh, watchlist_en = excluded.watchlist_en,
      paper_ids = excluded.paper_ids, metrics_json = excluded.metrics_json, model = excluded.model,
      error = excluded.error, updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    input.id || crypto.randomUUID(), input.spaceId, input.briefDate, input.jobId, input.status,
    mergedInput.headlineZh, mergedInput.headlineEn, mergedInput.overviewZh, mergedInput.overviewEn,
    JSON.stringify(mergedInput.signalsZh), JSON.stringify(mergedInput.signalsEn),
    JSON.stringify(mergedInput.readingPlanZh), JSON.stringify(mergedInput.readingPlanEn),
    JSON.stringify(mergedInput.watchlistZh), JSON.stringify(mergedInput.watchlistEn),
    JSON.stringify(mergedInput.paperIds), JSON.stringify(mergedInput.metrics), input.model, input.error || null,
  ).run();
}

function selectDiverseItems<T>(
  rankedItems: T[],
  groupKey: (item: T) => string,
  horizonKey: (item: T) => Horizon,
  limit = 6,
  coreCount = 0,
) {
  const selected: T[] = [];
  const selectedSet = new Set<T>();
  const groupCounts = new Map<string, number>();
  const add = (item: T) => {
    if (selected.length >= limit || selectedSet.has(item)) return false;
    selected.push(item);
    selectedSet.add(item);
    const group = groupKey(item);
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    return true;
  };
  for (const item of rankedItems.slice(0, Math.min(limit, Math.max(0, coreCount)))) add(item);
  for (const horizon of ["days", "months", "years"] as Horizon[]) {
    const item = rankedItems.find((candidate) => !selectedSet.has(candidate) && horizonKey(candidate) === horizon && !(groupCounts.get(groupKey(candidate)) || 0));
    if (item) add(item);
  }
  for (const item of rankedItems) if (!(groupCounts.get(groupKey(item)) || 0)) add(item);
  for (const item of rankedItems) if ((groupCounts.get(groupKey(item)) || 0) < 2) add(item);
  for (const item of rankedItems) add(item);
  return selected;
}

async function generateDailyBrief(
  database: D1Database,
  space: SpaceRow,
  userId: string,
  jobId: string,
  candidates: Candidate[],
  reviews: PaperReview[],
  metrics: { scanned: number; newCandidates: number; duplicates: number; reviewed: number; screened?: number; deepScheduled?: number; deepReviewed?: number; deepDeferred?: number; analysisUnavailable?: number; verificationPending?: number; verificationFailed?: number; recommended: number; rejected: number },
  now: Date,
  apiKey: string,
  deferLlm = false,
) {
  const briefDate = shanghaiDateKey(now);
  const candidateById = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const rankedReviews = reviews.filter(isPublishedRecommendation).sort((left, right) => {
    const tier = { must_read: 3, browse: 2, reserve: 1 };
    return tier[right.recommendationTier] - tier[left.recommendationTier] || right.relevanceScore - left.relevanceScore;
  });
  const selected = selectDiverseItems(
    rankedReviews,
    (review) => review.trackId || `horizon:${candidateById.get(review.canonicalId)?.horizon || "days"}`,
    (review) => candidateById.get(review.canonicalId)?.horizon || "days",
    6,
  );
  const analysisUnavailable = metrics.analysisUnavailable === 1;
  const verificationPending = Math.max(0, metrics.verificationPending || 0);
  const verificationFailed = Math.max(0, metrics.verificationFailed || 0);
  const selectedCanonicalIds = selected.map((review) => review.canonicalId);
  let paperIds: string[] = [];
  if (selectedCanonicalIds.length) {
    const placeholders = selectedCanonicalIds.map(() => "?").join(", ");
    const rows = await database.prepare(`SELECT id, canonical_id FROM monitored_papers WHERE space_id = ? AND canonical_id IN (${placeholders})`)
      .bind(space.id, ...selectedCanonicalIds).all<{ id: string; canonical_id: string }>();
    const byCanonical = new Map(rows.results.map((row) => [row.canonical_id, row.id]));
    paperIds = selectedCanonicalIds.map((id) => byCanonical.get(id)).filter((id): id is string => Boolean(id));
  }
  const saveEvidenceBrief = async (enhancementError?: string) => {
    await saveDailyBrief(database, {
    spaceId: space.id, briefDate, jobId, status: analysisUnavailable ? "degraded" : "ready",
    headlineZh: selected.length
      ? `今天 ${selected.length} 篇已确认${verificationPending ? `，${verificationPending} 篇正在后台核对` : ""}`
      : verificationPending ? `${verificationPending} 篇高潜力论文正在后台核对`
        : analysisUnavailable ? "候选已保存，AI 解读暂未完成"
          : verificationFailed ? `本轮暂无正式推荐，${verificationFailed} 篇证据未通过` : "今天没有论文达到严格推荐门槛",
    headlineEn: selected.length
      ? `${selected.length} confirmed today${verificationPending ? `; ${verificationPending} completing background checks` : ""}`
      : verificationPending ? `${verificationPending} high-potential papers are completing background checks`
        : analysisUnavailable ? "Candidates saved; AI review is pending"
          : verificationFailed ? `No formal recommendation; ${verificationFailed} failed the evidence gate` : "No paper cleared today's strict recommendation bar",
    overviewZh: selected.length
      ? `Pi 从 ${metrics.scanned} 篇候选中快速筛选 ${metrics.screened || metrics.reviewed} 篇、逐篇深度解读 ${metrics.deepReviewed || metrics.reviewed} 篇，并完成书目与摘要证据核对，最终确认 ${selected.length} 篇。${verificationPending ? `${verificationPending} 篇已保存核对进度，Pi 会在后台自动继续，完成前不计入正式推荐。` : ""}${verificationFailed ? `${verificationFailed} 篇因证据不足未发布。` : ""}${metrics.deepDeferred ? `${metrics.deepDeferred} 篇响应较慢的论文已延后重试，不影响本轮结果。` : ""}其余结果仍在探索账本中。`
      : verificationPending
        ? `Pi 已保存 ${verificationPending} 篇达到推荐分数的深度解读和核对进度；Pi 会在后台自动继续，无需你确认，也不会重新检索、筛选或撰写。${verificationFailed ? `另有 ${verificationFailed} 篇未通过证据核对，原因会保留在研究账本中。` : ""}`
      : analysisUnavailable
        ? `Pi 已保存 ${metrics.scanned} 篇候选和 ${metrics.screened || 0} 篇快速筛选结果；本轮 ${metrics.deepScheduled || metrics.deepDeferred || 0} 篇高潜力论文因模型响应异常尚未完成解读。它们仍在待评审队列中，因此这不是“没有论文达标”的质量结论。`
        : verificationFailed
          ? `Pi 从 ${metrics.scanned} 篇候选中快速筛选 ${metrics.screened || metrics.reviewed} 篇，并逐篇深度解读 ${metrics.deepReviewed || metrics.reviewed} 篇；其中 ${verificationFailed} 篇达到高潜力阶段，但未通过独立证据核验，因此本轮正式推荐为 0。它们不是因技术等待被淘汰，核验原因已保留。${metrics.deepDeferred ? `另有 ${metrics.deepDeferred} 篇响应较慢的论文已延后重试。` : ""}`
          : `Pi 从 ${metrics.scanned} 篇候选中快速筛选 ${metrics.screened || metrics.reviewed} 篇，并逐篇深度解读 ${metrics.deepReviewed || metrics.reviewed} 篇；没有论文同时通过相关性、质量、证据完整度与明确推荐四项门槛，因此没有为了填满页面而降低标准。${metrics.deepDeferred ? `另有 ${metrics.deepDeferred} 篇响应较慢的论文已延后重试。` : ""}`,
    overviewEn: selected.length
      ? `Pi fast-screened ${metrics.screened || metrics.reviewed} of ${metrics.scanned} candidates, deeply reviewed ${metrics.deepReviewed || metrics.reviewed}, checked bibliographic and abstract evidence, and confirmed ${selected.length}. ${verificationPending ? `${verificationPending} have saved checking progress and will continue automatically in the background before publication. ` : ""}${verificationFailed ? `${verificationFailed} were withheld for insufficient evidence. ` : ""}${metrics.deepDeferred ? `${metrics.deepDeferred} slow papers were deferred without blocking this run. ` : ""}Other discoveries remain in the exploration ledger.`
      : verificationPending
        ? `Pi preserved ${verificationPending} deeply reviewed drafts together with their checking progress. Pi will continue automatically in the background without asking the user or repeating discovery, screening, or drafting.${verificationFailed ? ` Another ${verificationFailed} failed evidence verification and remain recorded in the research ledger.` : ""}`
      : analysisUnavailable
        ? `Pi saved ${metrics.scanned} candidates and ${metrics.screened || 0} fast-screen results. Model failures prevented this run from completing AI review of ${metrics.deepScheduled || metrics.deepDeferred || 0} high-potential papers. They remain queued, so this is not a finding that no paper met the quality bar.`
        : verificationFailed
          ? `Pi fast-screened ${metrics.screened || metrics.reviewed} of ${metrics.scanned} candidates and deeply reviewed ${metrics.deepReviewed || metrics.reviewed}. ${verificationFailed} reached the high-potential stage but failed bibliographic and abstract evidence checks, so the formal recommendation count is zero. Their evidence-check reasons remain in the research ledger.${metrics.deepDeferred ? ` ${metrics.deepDeferred} slow papers were deferred for a later retry.` : ""}`
          : `Pi fast-screened ${metrics.screened || metrics.reviewed} of ${metrics.scanned} candidates and deeply reviewed ${metrics.deepReviewed || metrics.reviewed}. None cleared all four gates for fit, quality, evidence completeness, and an explicit recommendation, so Pi did not lower the bar to fill the page.${metrics.deepDeferred ? ` ${metrics.deepDeferred} slow papers were deferred for a later retry.` : ""}`,
    signalsZh: selected.slice(0, 6).map((review) => review.contributionZh || review.summaryZh || review.whyReadZh).filter(Boolean),
    signalsEn: selected.slice(0, 6).map((review) => review.contributionEn || review.summaryEn || review.whyReadEn).filter(Boolean),
    readingPlanZh: selected.slice(0, 6).map((review) => review.readingFocusZh || review.whyReadZh || review.summaryZh).filter(Boolean),
    readingPlanEn: selected.slice(0, 6).map((review) => review.readingFocusEn || review.whyReadEn || review.summaryEn).filter(Boolean),
    watchlistZh: [
      ...(metrics.deepDeferred ? [`${metrics.deepDeferred} 篇响应较慢的论文会在后续扫描中重试，不会重复处理已完成论文。`] : []),
      ...(verificationPending ? [`${verificationPending} 篇高潜力论文已保存核对进度；Pi 会在后台自动继续，无需用户操作。`] : []),
      ...(verificationFailed ? [`${verificationFailed} 篇论文未通过独立证据核验；它们与待核验论文分开统计。`] : []),
      ...(!selected.length && !analysisUnavailable && !verificationPending && !verificationFailed ? ["本轮没有强推荐；若首批高潜力论文为零入选，Pi 会自动追加第二批评审，并继续扩展期刊、作者与引用路径。"] : []),
      ...(analysisUnavailable ? ["模型恢复后将从保存点继续评审；已完成的检索与筛选不会重新消耗额度。"] : []),
    ],
    watchlistEn: [
      ...(metrics.deepDeferred ? [`${metrics.deepDeferred} slow papers will be retried in a later scan without repeating completed reviews.`] : []),
      ...(verificationPending ? [`${verificationPending} high-potential papers have saved checking progress; Pi will continue automatically without user action.`] : []),
      ...(verificationFailed ? [`${verificationFailed} papers failed bibliographic and abstract evidence checks and are counted separately from pending drafts.`] : []),
      ...(!selected.length && !analysisUnavailable && !verificationPending && !verificationFailed ? ["No strong recommendation this round. When the first high-potential batch yields nothing, Pi expands to a second review batch and continues across journal, author, and citation paths."] : []),
      ...(analysisUnavailable ? ["When the model recovers, review resumes from the saved checkpoint without repeating completed discovery or screening."] : []),
    ],
    paperIds, metrics, model: "evidence-summary", error: enhancementError || null,
  });
    if (enhancementError) await recordReliabilityEvent(database, {
      spaceId: space.id,
      scanJobId: jobId,
      kind: "daily_brief_enhancement_unavailable",
      stage: "briefing",
      source: MONITOR_MODEL,
      outcome: "degraded",
      errorCode: monitorErrorCode(enhancementError),
      message: enhancementError,
      metadata: { canonicalBrief: "evidence-summary", selectedPapers: selected.length },
    });
  };
  if (!selected.length) return saveEvidenceBrief();
  if (deferLlm) return saveEvidenceBrief();

  const usageDate = now.toISOString().slice(0, 10);
  const workspaceScope = "monitor-workspace:" + userId.replace(/^anonymous:/, "");
  const spaceScope = "monitor-space:" + space.id;
  const [globalCount, workspaceCount, spaceCount] = await Promise.all([
    usageCount(database, "monitor:global", usageDate),
    usageCount(database, workspaceScope, usageDate),
    usageCount(database, spaceScope, usageDate),
  ]);
  if (!apiKey || globalCount >= MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT
    || workspaceCount >= MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT
    || spaceCount >= MONITOR_SPACE_DAILY_ANALYSIS_LIMIT) {
    return saveEvidenceBrief(!apiKey ? "DeepSeek Pro is not configured" : "Daily brief analysis budget reached");
  }
  try {
    const records = selected.map((review) => {
      const candidate = candidateById.get(review.canonicalId);
      return {
        canonicalId: review.canonicalId,
        title: candidate?.title || "",
        venue: candidate?.venue || "",
        publishedAt: candidate?.publishedAt || null,
        horizon: candidate?.horizon || "days",
        recommendationTier: review.recommendationTier,
        relevanceScore: review.relevanceScore,
        summaryZh: review.summaryZh,
        summaryEn: review.summaryEn,
        contributionZh: review.contributionZh,
        contributionEn: review.contributionEn,
        readingFocusZh: review.readingFocusZh,
        readingFocusEn: review.readingFocusEn,
        questionsZh: review.researchQuestionsZh,
        questionsEn: review.researchQuestionsEn,
        abstract: candidate?.abstractText.slice(0, 1400) || "",
      };
    });
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MONITOR_MODEL,
        messages: [
          { role: "system", content: "You are Pi Research's daily research editor. Return strict JSON, stay evidence-disciplined, and synthesize only the supplied paper analyses. Treat their attached evidence state as authoritative." },
          { role: "user", content: [
            "Create a concise bilingual daily research brief for a long-term researcher.",
            "Return {headlineZh, headlineEn, overviewZh, overviewEn, signalsZh, signalsEn, readingPlanZh, readingPlanEn, watchlistZh, watchlistEn}.",
            `signalsZh/signalsEn and readingPlanZh/readingPlanEn must each contain exactly ${records.length} items in the supplied paper order, so every signal and reading action stays attached to one titled paper.`,
            "headlineZh should be at most 22 Chinese characters and headlineEn at most 12 words. overviewZh should be 70-140 Chinese characters and overviewEn 45-85 words; explain the common theme, important difference, or decision for this research space instead of repeating paper abstracts.",
            "Each Chinese signal must be 45-95 characters and each English signal 25-55 words. Use plain language: state what changed or became newly usable, then why it matters to this research space. Do not dump numbered contributions or chains of theorem statements.",
            "Each Chinese reading-plan item must be 35-75 characters and each English item 20-45 words. Give one practical reading action and one question to carry into the paper.",
            "Use only the recommendation analysis that passed bibliographic and abstract evidence checks. Do not imply that Pi downloaded, read, or verified the paper's full text.",
            "Never mention section, page, figure, or theorem numbers unless they are present in the supplied grounded reading focus. Never claim 'first', 'complete characterization', proof, experiment, convergence rate, or optimality unless the supplied verified analysis explicitly supports it.",
            "Briefly explain specialized abbreviations on first use. Avoid generic praise, repeated scores, and phrases such as 'focus on the derivation' without saying what decision or concept the reader should extract.",
            "Identify cross-paper patterns only when supported. Do not invent results or imply that rejected candidates were useful.",
            `Research space: ${space.name} — ${space.description}`,
            `Scan metrics: ${JSON.stringify(metrics)}`,
            `Selected paper analyses: ${JSON.stringify(records)}`,
          ].join("\n") },
        ],
        thinking: { type: "enabled" },
        reasoning_effort: "medium",
        response_format: { type: "json_object" },
        max_tokens: 3600,
        stream: false,
      }),
      signal: AbortSignal.timeout(50_000),
    });
    const data = await response.json() as DeepSeekResponse;
    if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro daily brief failed");
    const content = data.choices?.[0]?.message?.content || "";
    if (!content.trim()) throw new Error("DeepSeek Pro returned an empty daily brief");
    const parsed = parseJsonObject(content);
    await Promise.all([
      recordUsage(database, "monitor:global", usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      recordUsage(database, workspaceScope, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      recordUsage(database, "monitor-space:" + space.id, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
    ]);
    const headlineZh = cleanText(String(parsed.headlineZh || "")).slice(0, 180);
    const headlineEn = cleanText(String(parsed.headlineEn || "")).slice(0, 240);
    const overviewZh = cleanText(String(parsed.overviewZh || "")).slice(0, 900);
    const overviewEn = cleanText(String(parsed.overviewEn || "")).slice(0, 1200);
    if (!headlineZh || !headlineEn || !overviewZh || !overviewEn) throw new Error("DeepSeek Pro returned an incomplete daily brief");
    await saveDailyBrief(database, {
      spaceId: space.id, briefDate, jobId, status: "ready", headlineZh, headlineEn, overviewZh, overviewEn,
      signalsZh: briefList(parsed.signalsZh, selected.length, 280), signalsEn: briefList(parsed.signalsEn, selected.length, 420),
      readingPlanZh: briefList(parsed.readingPlanZh, selected.length, 240), readingPlanEn: briefList(parsed.readingPlanEn, selected.length, 360),
      watchlistZh: briefList(parsed.watchlistZh), watchlistEn: briefList(parsed.watchlistEn),
      paperIds, metrics, model: MONITOR_MODEL,
    });
  } catch (error) {
    await saveEvidenceBrief(error instanceof Error ? error.message.slice(0, 260) : "Daily brief generation failed");
  }
}

async function upsertResearchNotification(database: D1Database, input: {
  spaceId: string;
  dedupeKey: string;
  kind: string;
  priority?: "normal" | "high";
  titleZh: string;
  titleEn: string;
  bodyZh: string;
  bodyEn: string;
  actionView: "today" | "library" | "threads" | "memory";
  entityId?: string | null;
}) {
  await database.prepare(
    `INSERT INTO research_notifications
     (id, space_id, dedupe_key, kind, priority, title_zh, title_en, body_zh, body_en, action_view, entity_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+45 days'))
     ON CONFLICT(space_id, dedupe_key) DO UPDATE SET priority = excluded.priority,
      title_zh = excluded.title_zh, title_en = excluded.title_en, body_zh = excluded.body_zh,
      body_en = excluded.body_en, action_view = excluded.action_view, entity_id = excluded.entity_id,
      expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    crypto.randomUUID(), input.spaceId, input.dedupeKey, input.kind, input.priority || "normal",
    cleanText(input.titleZh).slice(0, 240), cleanText(input.titleEn).slice(0, 320),
    cleanText(input.bodyZh).slice(0, 700), cleanText(input.bodyEn).slice(0, 900),
    input.actionView, input.entityId || null,
  ).run();
}

async function createScanNotifications(
  database: D1Database,
  spaceId: string,
  briefDate: string,
  reviews: PaperReview[],
  metrics: { scanned: number; newCandidates: number; duplicates: number; reviewed: number; screened?: number; deepReviewed?: number; deepDeferred?: number; recommended: number; rejected: number },
  resumed: boolean,
) {
  const brief = await database.prepare(
    "SELECT headline_zh, headline_en, overview_zh, overview_en FROM monitor_daily_briefs WHERE space_id = ? AND brief_date = ? LIMIT 1",
  ).bind(spaceId, briefDate).first<{ headline_zh: string; headline_en: string; overview_zh: string; overview_en: string }>();
  await upsertResearchNotification(database, {
    spaceId, dedupeKey: `daily:${briefDate}`, kind: "daily_brief", priority: metrics.recommended ? "high" : "normal",
    titleZh: brief?.headline_zh || `今日扫描完成：${metrics.recommended} 篇入选`,
    titleEn: brief?.headline_en || `Today's scan is complete: ${metrics.recommended} selected`,
    bodyZh: brief?.overview_zh || `快速筛选 ${metrics.screened || metrics.reviewed} 篇，深度解读 ${metrics.deepReviewed || metrics.reviewed} 篇，避免 ${metrics.duplicates} 次重复分析。`,
    bodyEn: brief?.overview_en || `${metrics.screened || metrics.reviewed} fast-screened, ${metrics.deepReviewed || metrics.reviewed} deeply reviewed, and ${metrics.duplicates} duplicate analyses avoided.`,
    actionView: "today",
  });
  const mustRead = reviews.filter((review) => isPublishedRecommendation(review) && review.recommendationTier === "must_read");
  if (mustRead.length) {
    await upsertResearchNotification(database, {
      spaceId, dedupeKey: `must-read:${briefDate}`, kind: "must_read", priority: "high",
      titleZh: `${mustRead.length} 篇论文被列为今日必读`, titleEn: `${mustRead.length} papers are must-reads today`,
      bodyZh: "这些论文与当前研究问题直接相关，Pi 已给出具体阅读重点和建议顺序。",
      bodyEn: "These papers directly match the current research questions, with concrete reading priorities and order.",
      actionView: "today",
    });
  }
  const confirmedTrackRows = await database.prepare(
    `SELECT DISTINCT ep.track_id FROM research_map_evidence_proposals ep
     JOIN monitor_daily_briefs b ON b.space_id = ep.space_id AND b.scan_job_id = ep.scan_job_id
     WHERE ep.space_id = ? AND b.brief_date = ? AND ep.status = 'confirmed'`,
  ).bind(spaceId, briefDate).all<{ track_id: string }>();
  const changedTracks = new Set(confirmedTrackRows.results.map((row) => row.track_id));
  if (changedTracks.size) {
    await upsertResearchNotification(database, {
      spaceId, dedupeKey: `route-change:${briefDate}`, kind: "route_change", priority: "high",
      titleZh: `${changedTracks.size} 条研究路线获得了新证据`, titleEn: `${changedTracks.size} research routes gained new evidence`,
      bodyZh: "新入选论文已经补充到研究地图，可查看它们改变了哪些方向、节点和后续问题。",
      bodyEn: "Newly selected papers have been added to the research map. See which directions, milestones, and next questions changed.",
      actionView: "threads",
    });
  }
  if (resumed) {
    await upsertResearchNotification(database, {
      spaceId, dedupeKey: `recovered:${briefDate}`, kind: "scan_recovered",
      titleZh: "中断的扫描已经自动续跑完成", titleEn: "The interrupted scan resumed successfully",
      bodyZh: "已复用保存的探索游标和待评审池，没有重新分析已经处理过的论文。",
      bodyEn: "Saved exploration cursors and the pending review pool were reused without re-analyzing processed papers.",
      actionView: "today",
    });
  }
}

async function saveWeeklyReview(database: D1Database, input: {
  spaceId: string;
  weekKey: string;
  status: "ready" | "degraded";
  titleZh: string;
  titleEn: string;
  overviewZh: string;
  overviewEn: string;
  gainsZh: string[];
  gainsEn: string[];
  gapsZh: string[];
  gapsEn: string[];
  nextStepsZh: string[];
  nextStepsEn: string[];
  sourceDays: number;
  model: string;
  error?: string | null;
}) {
  await database.prepare(
    `INSERT INTO monitor_weekly_reviews
     (id, space_id, week_key, status, title_zh, title_en, overview_zh, overview_en, gains_zh, gains_en,
      gaps_zh, gaps_en, next_steps_zh, next_steps_en, source_days, model, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(space_id, week_key) DO UPDATE SET status = excluded.status, title_zh = excluded.title_zh,
      title_en = excluded.title_en, overview_zh = excluded.overview_zh, overview_en = excluded.overview_en,
      gains_zh = excluded.gains_zh, gains_en = excluded.gains_en, gaps_zh = excluded.gaps_zh,
      gaps_en = excluded.gaps_en, next_steps_zh = excluded.next_steps_zh, next_steps_en = excluded.next_steps_en,
      source_days = excluded.source_days, model = excluded.model, error = excluded.error, updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    crypto.randomUUID(), input.spaceId, input.weekKey, input.status, input.titleZh, input.titleEn,
    input.overviewZh, input.overviewEn, JSON.stringify(input.gainsZh), JSON.stringify(input.gainsEn),
    JSON.stringify(input.gapsZh), JSON.stringify(input.gapsEn), JSON.stringify(input.nextStepsZh),
    JSON.stringify(input.nextStepsEn), input.sourceDays, input.model, input.error || null,
  ).run();
}

async function maybeGenerateWeeklyReview(database: D1Database, space: SpaceRow, userId: string, now: Date, apiKey: string) {
  const dateKey = shanghaiDateKey(now);
  const weekKey = mondayKey(dateKey);
  const briefs = await database.prepare(
    `SELECT brief_date, headline_zh, headline_en, overview_zh, overview_en, signals_zh, signals_en,
     reading_plan_zh, reading_plan_en, watchlist_zh, watchlist_en, metrics_json
     FROM monitor_daily_briefs WHERE space_id = ? AND brief_date >= date(?, '-6 days')
     ORDER BY brief_date ASC`,
  ).bind(space.id, dateKey).all<{
    brief_date: string; headline_zh: string; headline_en: string; overview_zh: string; overview_en: string;
    signals_zh: string; signals_en: string; reading_plan_zh: string; reading_plan_en: string;
    watchlist_zh: string; watchlist_en: string; metrics_json: string;
  }>();
  const sourceDays = new Set(briefs.results.map((brief) => brief.brief_date)).size;
  if (sourceDays < 3) return null;
  const existing = await database.prepare(
    "SELECT source_days FROM monitor_weekly_reviews WHERE space_id = ? AND week_key = ? LIMIT 1",
  ).bind(space.id, weekKey).first<{ source_days: number }>();
  if (existing && (existing.source_days >= sourceDays || sourceDays < 7)) return null;

  const [feedback, memories, changes] = await Promise.all([
    database.prepare(
      `SELECT COALESCE(reason_code, 'unspecified') AS reason_code, feedback, COUNT(*) AS count
       FROM paper_feedback WHERE space_id = ? AND updated_at >= datetime('now', '-7 days') AND feedback IS NOT NULL
       GROUP BY reason_code, feedback ORDER BY count DESC LIMIT 12`,
    ).bind(space.id).all<{ reason_code: string; feedback: string; count: number }>(),
    database.prepare(
      `SELECT takeaway_zh, takeaway_en, questions_zh, questions_en FROM paper_reading_memories
       WHERE space_id = ? AND analysis_status = 'ready' AND updated_at >= datetime('now', '-7 days')
       ORDER BY updated_at DESC LIMIT 10`,
    ).bind(space.id).all<{ takeaway_zh: string; takeaway_en: string; questions_zh: string; questions_en: string }>(),
    database.prepare(
      `SELECT c.title_zh, c.title_en, c.summary_zh, c.summary_en FROM research_map_changes c
       WHERE c.space_id = ? AND c.created_at >= datetime('now', '-7 days')
        AND ${formalResearchMapEvidencePredicate("c")}
       ORDER BY c.created_at DESC LIMIT 12`,
    ).bind(space.id).all<{ title_zh: string; title_en: string; summary_zh: string; summary_en: string }>(),
  ]);
  const fallback = async (error?: string) => {
    const totalRecommended = briefs.results.reduce((sum, brief) => {
      try { return sum + Number((JSON.parse(brief.metrics_json) as Record<string, number>).recommended || 0); } catch { return sum; }
    }, 0);
    const review = {
      spaceId: space.id, weekKey, status: error ? "degraded" as const : "ready" as const,
      titleZh: `${sourceDays} 天研究回顾：${totalRecommended} 篇论文进入推荐`,
      titleEn: `${sourceDays}-day research review: ${totalRecommended} papers selected`,
      overviewZh: `Pi 汇总了最近 ${sourceDays} 天的真实扫描、阅读与反馈记录。以下内容只来自已保存的每日简报和用户行为。`,
      overviewEn: `Pi summarized ${sourceDays} days of real discovery, reading, and feedback records using only saved briefs and user activity.`,
      gainsZh: briefs.results.flatMap((brief) => parseVenues(brief.signals_zh)).slice(-4),
      gainsEn: briefs.results.flatMap((brief) => parseVenues(brief.signals_en)).slice(-4),
      gapsZh: briefs.results.flatMap((brief) => parseVenues(brief.watchlist_zh)).slice(-4),
      gapsEn: briefs.results.flatMap((brief) => parseVenues(brief.watchlist_en)).slice(-4),
      nextStepsZh: briefs.results.flatMap((brief) => parseVenues(brief.reading_plan_zh)).slice(-4),
      nextStepsEn: briefs.results.flatMap((brief) => parseVenues(brief.reading_plan_en)).slice(-4),
      sourceDays, model: error ? "deterministic-fallback" : "evidence-summary", error: error || null,
    };
    await saveWeeklyReview(database, review);
    return review;
  };
  const usageDate = now.toISOString().slice(0, 10);
  const workspaceScope = "monitor-workspace:" + userId.replace(/^anonymous:/, "");
  const spaceScope = "monitor-space:" + space.id;
  const [globalCount, workspaceCount, spaceCount] = await Promise.all([
    usageCount(database, "monitor:global", usageDate), usageCount(database, workspaceScope, usageDate), usageCount(database, spaceScope, usageDate),
  ]);
  let review: Awaited<ReturnType<typeof fallback>>;
  if (!apiKey || globalCount >= MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT
    || workspaceCount >= MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT
    || spaceCount >= MONITOR_SPACE_DAILY_ANALYSIS_LIMIT) {
    review = await fallback(!apiKey ? "DeepSeek Pro is not configured" : "Weekly review analysis budget reached");
  } else {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MONITOR_MODEL,
          messages: [
            { role: "system", content: "You are Pi Research's weekly research-review editor. Return strict bilingual JSON and infer only from supplied evidence." },
            { role: "user", content: [
              "Return {titleZh,titleEn,overviewZh,overviewEn,gainsZh,gainsEn,gapsZh,gapsEn,nextStepsZh,nextStepsEn}.",
              "Each list must contain 2-5 concrete items. Separate demonstrated gains from unresolved gaps. Next steps must be actionable reading or research moves.",
              "Never claim that a paper was read unless reading memory is supplied. Do not invent paper findings or progress.",
              `Research space: ${space.name} — ${space.description}`,
              `Daily briefs: ${JSON.stringify(briefs.results)}`,
              `Explicit feedback summary: ${JSON.stringify(feedback.results)}`,
              `Reading memories: ${JSON.stringify(memories.results)}`,
              `Research-map changes: ${JSON.stringify(changes.results)}`,
            ].join("\n") },
          ],
          thinking: { type: "enabled" }, reasoning_effort: "high", response_format: { type: "json_object" },
          max_tokens: 6500, stream: false,
        }),
        signal: AbortSignal.timeout(75_000),
      });
      const data = await response.json() as DeepSeekResponse;
      if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro weekly review failed");
      const parsed = parseJsonObject(data.choices?.[0]?.message?.content || "");
      await Promise.all([
        recordUsage(database, "monitor:global", usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
        recordUsage(database, workspaceScope, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
        recordUsage(database, "monitor-space:" + space.id, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      ]);
      review = {
        spaceId: space.id, weekKey, status: "ready", sourceDays, model: MONITOR_MODEL,
        titleZh: cleanText(String(parsed.titleZh || "")).slice(0, 220), titleEn: cleanText(String(parsed.titleEn || "")).slice(0, 300),
        overviewZh: cleanText(String(parsed.overviewZh || "")).slice(0, 1100), overviewEn: cleanText(String(parsed.overviewEn || "")).slice(0, 1500),
        gainsZh: briefList(parsed.gainsZh, 5), gainsEn: briefList(parsed.gainsEn, 5),
        gapsZh: briefList(parsed.gapsZh, 5), gapsEn: briefList(parsed.gapsEn, 5),
        nextStepsZh: briefList(parsed.nextStepsZh, 5), nextStepsEn: briefList(parsed.nextStepsEn, 5), error: null,
      };
      if (!review.titleZh || !review.titleEn || !review.overviewZh || !review.overviewEn) throw new Error("DeepSeek Pro returned an incomplete weekly review");
      await saveWeeklyReview(database, review);
    } catch (error) {
      review = await fallback(error instanceof Error ? error.message.slice(0, 260) : "Weekly review generation failed");
    }
  }
  await upsertResearchNotification(database, {
    spaceId: space.id, dedupeKey: `weekly:${weekKey}`, kind: "weekly_review", priority: "high",
    titleZh: review.titleZh, titleEn: review.titleEn, bodyZh: review.overviewZh, bodyEn: review.overviewEn,
    actionView: "today", entityId: weekKey,
  });
  return review;
}

async function persistCandidatePool(database: D1Database, spaceId: string, candidates: Candidate[]) {
  await enqueueMonitorCandidates(database, spaceId, candidates);
}

async function pendingCandidateQueue(database: D1Database, spaceId: string, canonicalIds?: string[]) {
  const restrictedIds = Array.from(new Set(canonicalIds || [])).slice(0, CANDIDATE_WORK_QUEUE_LIMIT);
  const explicitlyRestricted = canonicalIds !== undefined;
  const candidateCondition = explicitlyRestricted
    ? restrictedIds.length ? `p.canonical_id IN (${restrictedIds.map(() => "?").join(", ")})` : "0 = 1"
    : `(i.analysis_model = ''
       OR i.analysis_source = 'deepseek_screened'
       OR i.analysis_source = 'deepseek_verification_pending'
       OR (i.analysis_source = 'deepseek_rejected' AND i.verification_status = 'degraded'
         AND (lower(i.screening_reason) LIKE '%timeout%' OR lower(i.screening_reason) LIKE '%aborted%'
           OR lower(i.screening_reason) LIKE '%temporarily unavailable%'))
       OR (i.analysis_source = 'deepseek_rejected' AND datetime(i.updated_at) < datetime('now', '-90 days'))
       OR (i.analysis_source = 'deepseek_rejected' AND datetime(i.updated_at) < datetime(?)
         AND i.llm_relevance_score >= 45 AND i.quality_score >= 48)
       OR (i.analysis_source = 'deepseek_rejected' AND datetime(i.updated_at) < datetime(?) AND (
         (i.llm_relevance_score <= 1 AND (
           lower(i.screening_reason) LIKE '%directly relevant%' OR lower(i.screening_reason) LIKE '%direct fit%'
           OR lower(i.screening_reason) LIKE '%moderate relevance%' OR lower(i.screening_reason) LIKE '%directly addresses%'
           OR i.screening_reason LIKE '%直接相关%' OR i.screening_reason LIKE '%高度相关%'
         ))
         OR (length(trim(i.abstract_text)) = 0 AND lower(i.screening_reason) LIKE '%abstract missing%')
       )))`;
  const candidateParameters = explicitlyRestricted ? restrictedIds : [MONITOR_REVIEW_PIPELINE_RELEASED_AT, MONITOR_REVIEW_PIPELINE_RELEASED_AT];
  // A frozen in-flight queue must keep a paper addressable after it becomes
  // recommended; final reconciliation and job counts still need that record.
  const recommendationEligibility = explicitlyRestricted ? "1 = 1" : "COALESCE(i.ever_recommended, 0) = 0";
  const rows = await database.prepare(
    `SELECT p.id AS paper_id, p.canonical_id, p.doi, p.title, p.authors, p.venue, p.url, p.published_at, p.source, p.horizon,
     p.citation_count, p.relevance_score, i.abstract_text, i.quality_score, i.priority_venue
     FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id
     WHERE p.space_id = ? AND ${candidateCondition}
       AND ${recommendationEligibility}
       AND NOT EXISTS (
         SELECT 1 FROM paper_feedback suppressed
         WHERE suppressed.space_id = p.space_id AND suppressed.paper_id = p.id
           AND suppressed.feedback = 'not_relevant'
       )
     ORDER BY CASE WHEN i.analysis_source = 'deepseek_verification_pending' THEN 3
       WHEN i.analysis_source = 'deepseek_rejected' AND i.verification_status = 'degraded'
         AND (lower(i.screening_reason) LIKE '%timeout%' OR lower(i.screening_reason) LIKE '%aborted%' OR lower(i.screening_reason) LIKE '%temporarily unavailable%') THEN 2
       WHEN i.analysis_source = 'deepseek_screened' THEN 1 ELSE 0 END DESC,
       CASE WHEN i.analysis_source IN ('deepseek_screened', 'deepseek_verification_pending') THEN i.llm_relevance_score ELSE p.relevance_score END DESC,
       p.relevance_score DESC,
       CASE WHEN length(trim(i.abstract_text)) >= 120 THEN 1 ELSE 0 END DESC,
       i.quality_score DESC, p.citation_count DESC, p.discovered_at DESC LIMIT 360`,
  ).bind(spaceId, ...candidateParameters).all<{
    paper_id: string; canonical_id: string; doi: string | null; title: string; authors: string; venue: string; url: string;
    published_at: string | null; source: string; horizon: Horizon; citation_count: number; relevance_score: number;
    abstract_text: string; quality_score: number; priority_venue: number;
  }>();
  const provenanceByPaper = new Map<string, CandidateProvenance[]>();
  for (let start = 0; start < rows.results.length; start += 70) {
    const ids = rows.results.slice(start, start + 70).map((row) => row.paper_id);
    if (!ids.length) continue;
    const placeholders = ids.map(() => "?").join(", ");
    const sources = await database.prepare(
      `SELECT cs.paper_id, cs.source_key, cs.channel, cs.query_key, cs.appearances,
       COALESCE(coverage.query_text, '') AS query_text, COALESCE(coverage.route_id, '') AS route_id
       FROM monitor_candidate_sources cs
       JOIN monitored_papers paper ON paper.id = cs.paper_id AND paper.space_id = cs.space_id
       LEFT JOIN monitor_discovery_coverage coverage ON coverage.space_id = cs.space_id
         AND coverage.horizon = paper.horizon AND coverage.source_key = cs.source_key AND coverage.query_key = cs.query_key
       WHERE cs.space_id = ? AND cs.paper_id IN (${placeholders})
       ORDER BY cs.last_seen_at DESC`,
    ).bind(spaceId, ...ids).all<{
      paper_id: string; source_key: string; channel: string; query_key: string; appearances: number; query_text: string; route_id: string;
    }>();
    for (const source of sources.results) {
      const current = provenanceByPaper.get(source.paper_id) || [];
      if (current.some((entry) => entry.sourceKey === source.source_key && entry.queryKey === source.query_key)) continue;
      current.push({
        sourceKey: source.source_key,
        channel: source.channel as Candidate["discoveryChannel"],
        queryKey: source.query_key,
        queryText: source.query_text,
        routeId: source.route_id || undefined,
        appearances: source.appearances,
      });
      provenanceByPaper.set(source.paper_id, current);
    }
  }
  const candidates = rows.results.map((row) => ({
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
    source: row.source === "semantic_scholar" ? "semantic_scholar" as const
      : row.source === "openalex" ? "openalex" as const
        : row.source === "arxiv" ? "arxiv" as const
          : row.source === "research-route" ? "research-route" as const
            : row.source === "research-network" ? "research-network" as const
              : "crossref" as const,
    discoveryChannel: row.source === "arxiv" ? "preprint" as const : row.source === "semantic_scholar" || row.source === "openalex" ? "semantic" as const : row.priority_venue ? "journal" as const : "topic" as const,
    provenance: provenanceByPaper.get(row.paper_id)?.length ? provenanceByPaper.get(row.paper_id)! : [{
      sourceKey: `${row.source}:stored`,
      channel: row.source === "arxiv" ? "preprint" as const : row.source === "semantic_scholar" || row.source === "openalex" ? "semantic" as const : row.priority_venue ? "journal" as const : "topic" as const,
      queryKey: "stored-candidate",
      queryText: "",
      appearances: 1,
    }],
  }));
  if (!restrictedIds.length) return candidates;
  const order = new Map(restrictedIds.map((id, index) => [id, index]));
  return candidates.sort((left, right) => (order.get(left.canonicalId) ?? 999) - (order.get(right.canonicalId) ?? 999));
}

function candidateScreeningPriority(candidate: Candidate, includeAbstract = true) {
  const deterministicFit = Math.min(105, Math.log1p(Math.max(0, candidate.relevanceScore)) * 19);
  const abstractEvidence = includeAbstract ? Math.min(26, candidate.abstractText.length / 60) : 0;
  const metadataQuality = Math.min(100, Math.max(0, candidate.qualityScore)) * 0.2;
  const citationEvidence = Math.min(12, Math.log1p(Math.max(0, candidate.citationCount)) * 2.5);
  const sourceDiversity = Math.min(8, new Set(candidate.provenance.map((entry) => entry.channel)).size * 2);
  return deterministicFit + abstractEvidence + metadataQuality + citationEvidence + sourceDiversity;
}

function candidateDirectionKey(candidate: Candidate) {
  const routed = candidate.provenance.find((entry) => entry.routeId);
  if (routed?.routeId) return `route:${routed.routeId}`;
  const haystack = normalizedResearchText(`${candidate.title} ${candidate.abstractText} ${candidate.venue}`);
  for (const provenance of candidate.provenance) {
    const matchedTerms = cleanText(provenance.queryText || "").toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 4 && !GENERIC_TERMS.has(term) && haystack.includes(` ${term} `))
      .slice(0, 3);
    if (matchedTerms.length) return `topic:${matchedTerms.join("+")}`;
  }
  const branch = candidate.provenance[0];
  return branch ? `branch:${branch.sourceKey}:${branch.queryKey}` : `channel:${candidate.discoveryChannel}`;
}

function selectHorizonScreeningCandidates(candidates: Candidate[], limit: number) {
  const ranked = [...candidates].sort((left, right) => candidateScreeningPriority(right) - candidateScreeningPriority(left));
  const evidenceGapLimit = Math.min(Math.max(1, Math.round(limit * 0.2)), candidates.filter((candidate) => candidate.abstractText.trim().length < 120).length);
  const primary = selectBalancedByGroup(ranked, candidateDirectionKey, Math.max(0, limit - evidenceGapLimit));
  const primaryIds = new Set(primary.map((candidate) => candidate.canonicalId));
  const evidenceGaps = candidates
    .filter((candidate) => candidate.abstractText.trim().length < 120 && !primaryIds.has(candidate.canonicalId))
    .sort((left, right) => candidateScreeningPriority(right, false) - candidateScreeningPriority(left, false));
  const seeded = [...primary, ...selectBalancedByGroup(evidenceGaps, candidateDirectionKey, evidenceGapLimit)];
  const seededIds = new Set(seeded.map((candidate) => candidate.canonicalId));
  const remaining = ranked.filter((candidate) => !seededIds.has(candidate.canonicalId));
  return [...seeded, ...selectBalancedByGroup(remaining, candidateDirectionKey, Math.max(0, limit - seeded.length))];
}

function selectUnseenReviewBatch(candidates: Candidate[]) {
  const selected: Candidate[] = [];
  for (const horizon of ["days", "months", "years"] as Horizon[]) {
    selected.push(...selectHorizonScreeningCandidates(
      candidates.filter((candidate) => candidate.horizon === horizon),
      HORIZON_REVIEW_LIMITS[horizon],
    ));
  }
  return selected;
}

function selectCurrentAndBacklogReviewBatch(candidates: Candidate[], currentCandidateIds: Iterable<string>) {
  const currentIds = new Set(currentCandidateIds);
  const selected: Candidate[] = [];
  for (const horizon of ["days", "months", "years"] as Horizon[]) {
    const limit = HORIZON_REVIEW_LIMITS[horizon];
    const currentBudget = Math.max(1, Math.round(limit * 0.72));
    const horizonCandidates = candidates.filter((candidate) => candidate.horizon === horizon);
    // Route-origin discoveries share the exact same screening and recommendation
    // gates. One screening slot per non-empty horizon merely prevents a large
    // generic backlog from starving them before the model can judge their fit.
    const routeCandidate = selectHorizonScreeningCandidates(
      horizonCandidates.filter((candidate) => candidate.provenance.some(isMonitorRouteProvenance)),
      1,
    )[0];
    const reservedIds = new Set(routeCandidate ? [routeCandidate.canonicalId] : []);
    const current = selectHorizonScreeningCandidates(
      horizonCandidates.filter((candidate) => currentIds.has(candidate.canonicalId) && !reservedIds.has(candidate.canonicalId)),
      Math.max(0, currentBudget - (routeCandidate && currentIds.has(routeCandidate.canonicalId) ? 1 : 0)),
    );
    const currentSelected = new Set(current.map((candidate) => candidate.canonicalId));
    const backlog = selectHorizonScreeningCandidates(
      horizonCandidates.filter((candidate) => !currentIds.has(candidate.canonicalId)
        && !currentSelected.has(candidate.canonicalId) && !reservedIds.has(candidate.canonicalId)),
      limit - current.length - reservedIds.size,
    );
    const seeded = [...(routeCandidate ? [routeCandidate] : []), ...current, ...backlog];
    const seededIds = new Set(seeded.map((candidate) => candidate.canonicalId));
    const fill = selectHorizonScreeningCandidates(horizonCandidates.filter((candidate) => !seededIds.has(candidate.canonicalId)), limit - seeded.length);
    selected.push(...seeded, ...fill);
  }
  return selected;
}

function semanticScholarIdentifier(candidate: Candidate) {
  if (candidate.doi) return `DOI:${candidate.doi}`;
  const arxivId = candidate.canonicalId.startsWith("arxiv:")
    ? candidate.canonicalId.slice("arxiv:".length)
    : arxivIdFromUrl(candidate.url);
  return arxivId ? `ARXIV:${arxivId}` : "";
}

async function fetchSemanticScholarAbstracts(database: D1Database, spaceId: string, candidates: Candidate[]) {
  const identified = candidates.map((candidate) => ({ candidate, identifier: semanticScholarIdentifier(candidate) }))
    .filter((entry) => Boolean(entry.identifier));
  const abstracts = new Map<string, string>();
  if (!identified.length) return abstracts;
  try {
    const endpoint = new URL("https://api.semanticscholar.org/graph/v1/paper/batch");
    endpoint.searchParams.set("fields", "paperId,externalIds,abstract");
    const response = await monitorSemanticScholarFetch(database, spaceId, endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
      body: JSON.stringify({ ids: identified.map((entry) => entry.identifier) }),
      signal: AbortSignal.timeout(18_000),
    }, `abstracts:${identified.length}`);
    if (!response.ok) return abstracts;
    const records = await response.json() as Array<SemanticScholarPaper | null>;
    records.forEach((record, index) => {
      const abstractText = cleanText(record?.abstract || "").slice(0, 2200);
      if (abstractText && identified[index]) abstracts.set(identified[index].candidate.canonicalId, abstractText);
    });
  } catch {
    // OpenAlex is attempted below for unresolved DOI records.
  }
  return abstracts;
}

async function fetchOpenAlexAbstracts(candidates: Candidate[]) {
  const byDoi = new Map(candidates.filter((candidate) => candidate.doi).map((candidate) => [candidate.doi!.toLocaleLowerCase(), candidate]));
  const abstracts = new Map<string, string>();
  const dois = Array.from(byDoi.keys());
  const chunks = Array.from({ length: Math.ceil(dois.length / 20) }, (_, index) => dois.slice(index * 20, (index + 1) * 20));
  await Promise.all(chunks.map(async (chunk) => {
    if (!chunk.length) return;
    try {
      const endpoint = new URL("https://api.openalex.org/works");
      endpoint.searchParams.set("filter", `doi:${chunk.map((doi) => `https://doi.org/${doi}`).join("|")}`);
      endpoint.searchParams.set("select", "doi,abstract_inverted_index");
      endpoint.searchParams.set("per-page", String(chunk.length));
      endpoint.searchParams.set("mailto", "pi-research@qiudao-pika.chatgpt.site");
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return;
      const data = await response.json() as OpenAlexResponse;
      for (const item of data.results || []) {
        const doi = item.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim().toLocaleLowerCase();
        const candidate = doi ? byDoi.get(doi) : null;
        const abstractText = openAlexAbstract(item.abstract_inverted_index);
        if (candidate && abstractText) abstracts.set(candidate.canonicalId, abstractText);
      }
    } catch {
      // Missing enrichment evidence is handled by the downstream evidence gate.
    }
  }));
  return abstracts;
}

async function enrichDeepReviewAbstracts(database: D1Database, spaceId: string, candidates: Candidate[]) {
  const missing = candidates.filter((candidate) => candidate.abstractText.trim().length < 120);
  if (!missing.length) return { requested: 0, enriched: 0 };
  const abstracts = await fetchSemanticScholarAbstracts(database, spaceId, missing);
  const unresolved = missing.filter((candidate) => !abstracts.has(candidate.canonicalId) && candidate.doi);
  const openAlexAbstracts = await fetchOpenAlexAbstracts(unresolved);
  for (const [canonicalId, abstractText] of openAlexAbstracts) abstracts.set(canonicalId, abstractText);
  const statements = Array.from(abstracts.entries()).map(([canonicalId, abstractText]) => database.prepare(
    `UPDATE paper_insights SET abstract_text = CASE WHEN length(?) > length(abstract_text) THEN ? ELSE abstract_text END,
     updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = (
       SELECT id FROM monitored_papers WHERE space_id = ? AND canonical_id = ? LIMIT 1
     )`,
  ).bind(abstractText, abstractText, spaceId, spaceId, canonicalId));
  for (let start = 0; start < statements.length; start += 70) await database.batch(statements.slice(start, start + 70));
  return { requested: missing.length, enriched: abstracts.size };
}

async function updateRunPhase(database: D1Database, spaceId: string, jobId: string, lockToken: string, status: string, scannedCount: number, newCount = 0) {
  const progress = status === "deduplicating" ? 54 : status === "reviewing" ? 58 : status === "saving" ? 90 : status === "briefing" ? 94 : 4;
  await database.batch([
    database.prepare(
      "UPDATE monitor_runs SET status = ?, scanned_count = ?, new_count = ?, lock_expires_at = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND lock_token = ?",
    ).bind(status, scannedCount, newCount, new Date(Date.now() + RUN_LOCK_LEASE_MS).toISOString(), spaceId, lockToken),
    database.prepare(
      "UPDATE monitor_scan_jobs SET status = ?, checkpoint = ?, progress = MAX(progress, ?), discovered_count = ?, recommended_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(status, status, progress, scannedCount, newCount, jobId),
  ]);
}

function paperUserState(paper: PaperRow, now: number) {
  if (paper.feedback === "not_relevant") return "dismissed" as const;
  if (paper.saved || paper.feedback === "relevant" || ["queued", "reading", "read", "mastered", "cited"].includes(paper.reading_status)) return "accepted" as const;
  if (paper.snoozed_until && Date.parse(paper.snoozed_until) > now) return "snoozed" as const;
  if (paper.opened_at || paper.show_count > 0) return "seen" as const;
  return "unseen" as const;
}

function databaseTime(value: string | null | undefined) {
  if (!value) return 0;
  return Date.parse(value.includes("T") ? value : value.replace(" ", "T") + "Z");
}

function isPaperDue(paper: PaperRow, now: number) {
  const state = paperUserState(paper, now);
  if (state === "accepted" || state === "dismissed" || state === "snoozed") return false;
  if (!paper.last_shown_at || paper.show_count <= 0) return true;
  const reminderDays = paper.show_count === 1 ? 1 : paper.show_count === 2 ? 3 : 14;
  return now - databaseTime(paper.last_shown_at) >= reminderDays * 24 * 60 * 60 * 1000;
}

function monitorDiscoverySources(provider: string, channels: string) {
  const sourceKinds = new Set(channels.split(",").map((item) => cleanText(item).toLocaleLowerCase()).filter(Boolean));
  const sources: Array<{ key: string; labelZh: string; labelEn: string }> = [];
  const add = (key: string, labelZh: string, labelEn: string) => {
    if (!sources.some((source) => source.key === key)) sources.push({ key, labelZh, labelEn });
  };
  if (sourceKinds.has("citation")) add("citation", "核心论文引用追踪", "Citation tracking");
  if (sourceKinds.has("journal")) add("journal", "重点期刊前向扫描", "Priority-journal scan");
  if (sourceKinds.has("author")) add("author", "作者与团队追踪", "Author and team tracking");
  if (sourceKinds.has("preprint") || provider === "arxiv") add("preprint", "arXiv 预印本扫描", "arXiv preprint scan");
  if (sourceKinds.has("semantic") || provider === "openalex" || provider === "semantic_scholar") add("database", "学术数据库检索", "Scholarly database search");
  if (sourceKinds.has("topic") || provider === "crossref") add("topic", "主题与关键词检索", "Topic and keyword search");
  return sources.slice(0, 3);
}

function monitorVerificationPhase(status: EvidenceVerificationStatus, rawReport: string) {
  if (status === "verified") return "verified" as const;
  if (status === "revised") return "revised" as const;
  if (status === "degraded") return "withheld" as const;
  if (status !== "pending") return "not_required" as const;
  const report = parseJsonObject(rawReport || "{}");
  if (report.correctionQueued === true) return "awaiting_recheck" as const;
  if (report.correctionRequested === true) return "awaiting_correction" as const;
  return "awaiting_audit" as const;
}

function toPaper(paper: PaperRow, now: number) {
  const originKind = monitorRouteOriginKind(paper.discovery_source_key, paper.discovery_route_id);
  const discoveryType = originKind === "route_gap" ? "gap" as const
    : originKind === "route_network" ? "citation_network" as const
      : originKind ? "route_search" as const : null;
  const sourceLabels = originKind === "route_gap"
    ? { zh: "研究路线缺口深挖", en: "Research-route gap discovery" }
    : originKind === "route_network"
      ? { zh: "论文引用网络扩展", en: "Citation-network expansion" }
      : originKind
        ? { zh: "研究路线定向检索", en: "Research-route discovery" }
        : null;
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
    recommendedAt: paper.last_recommended_at,
    recommendationOrigin: paper.last_recommended_at
      && databaseTime(paper.last_recommended_at) - databaseTime(paper.discovered_at) >= 24 * 60 * 60 * 1000
      ? "backlog_review" : "current_discovery",
    summaryZh: paper.summary_zh,
    summaryEn: paper.summary_en,
    whyReadZh: paper.why_read_zh,
    whyReadEn: paper.why_read_en,
    qualityScore: paper.quality_score,
    priorityVenue: Boolean(paper.priority_venue),
    analysisSource: paper.analysis_source,
    discoverySources: monitorDiscoverySources(paper.discovery_provider, paper.discovery_channels),
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
    proposedRecommendationTier: paper.proposed_recommendation_tier,
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
    researchProblemId: paper.research_problem_id,
    problemFitScore: paper.problem_fit_score,
    uncertaintyReductionScore: paper.uncertainty_reduction_score,
    actionabilityScore: paper.actionability_score,
    researchProblemImpactZh: paper.research_problem_impact_zh,
    researchProblemImpactEn: paper.research_problem_impact_en,
    researchDecisionZh: paper.research_decision_zh,
    researchDecisionEn: paper.research_decision_en,
    verificationStatus: paper.verification_status,
    verificationCoverageScore: paper.verification_coverage_score,
    verificationPhase: monitorVerificationPhase(paper.verification_status, paper.verification_json),
    trackId: paper.track_id || null,
    qualityStage: paper.quality_stage,
    ...(originKind && paper.discovery_route_id && sourceLabels ? {
      discoveryOrigin: {
        kind: originKind,
        trackId: paper.discovery_route_id,
        trackTitleZh: paper.discovery_track_title_zh,
        trackTitleEn: paper.discovery_track_title_en,
        sourceLabelZh: sourceLabels.zh,
        sourceLabelEn: sourceLabels.en,
      },
      discoveryType,
      discoveryTrack: {
        id: paper.discovery_route_id,
        titleZh: paper.discovery_track_title_zh,
        titleEn: paper.discovery_track_title_en,
      },
    } : {}),
  };
}

async function readState(database: D1Database, space: SpaceRow, extra: Record<string, unknown> = {}) {
  const preference = await ensurePreference(database, space);
  const [run, papers, known, job, coverage, queryPlanRow, preferenceSignals, mapChanges, recentTrackActivity, inferredMapChanges, usageMetrics, scanMetrics, feedbackMetrics, sourcePerformance, trackPerformance, acceptedAuthorRows, readingCounts, dailyScanRows, dailyUsageRows, horizonRows, ledgerRows, readingMemoryRows, feedbackReasonRows, tierRows, dailyBriefRow, weeklyReviewRow, notificationRows, pilotJobMetrics, pilotWrongType, acceptedCostMetrics, reliabilityJobs, reliabilitySources, reliabilityCalibration, reliabilityStages] = await Promise.all([
    database.prepare("SELECT status, last_run_at, next_run_at, new_count, scanned_count, discovery_round, last_trigger, last_user_activity_at, scheduled_runs_since_activity, automation_paused_at, automation_pause_reason, error FROM monitor_runs WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<RunRow>(),
    database.prepare(
      `SELECT p.id, p.canonical_id, p.doi, p.title, p.authors, p.venue, p.url, p.published_at, p.horizon,
       p.source AS discovery_provider,
       COALESCE((SELECT group_concat(DISTINCT candidate_source.channel) FROM monitor_candidate_sources candidate_source
        WHERE candidate_source.space_id = p.space_id AND candidate_source.paper_id = p.id), '') AS discovery_channels,
       p.citation_count, p.relevance_score, p.discovered_at, i.last_recommended_at, COALESCE(i.abstract_text, '') AS abstract_text,
       COALESCE(i.summary_zh, '') AS summary_zh, COALESCE(i.summary_en, '') AS summary_en,
       COALESCE(i.why_read_zh, '') AS why_read_zh, COALESCE(i.why_read_en, '') AS why_read_en,
       COALESCE(i.quality_score, 0) AS quality_score, COALESCE(i.priority_venue, 0) AS priority_venue,
       COALESCE(i.analysis_source, 'metadata') AS analysis_source, COALESCE(i.analysis_model, '') AS analysis_model,
       COALESCE(i.llm_recommended, 0) AS llm_recommended,
       MAX(COALESCE(i.llm_relevance_score, 0), COALESCE((
         SELECT MAX(history.relevance_score) FROM recommendation_audit_events history
         WHERE history.space_id = p.space_id AND history.paper_id = p.id
          AND (history.recommended = 1 OR history.decision = 'verification_pending'
           OR (history.verification_status = 'degraded' AND (
             lower(history.screening_reason) LIKE '%timeout%' OR lower(history.screening_reason) LIKE '%aborted%'
             OR lower(history.screening_reason) LIKE '%draft is empty%' OR lower(history.screening_reason) LIKE '%empty draft%'
             OR lower(history.screening_reason) LIKE '%no populated substantive fields%'
             OR lower(history.screening_reason) LIKE '%draft incomplete%'
           )))
       ), 0)) AS llm_relevance_score,
       COALESCE(i.proposed_recommendation_tier, i.recommendation_tier, 'browse') AS proposed_recommendation_tier,
       COALESCE(i.proposed_recommendation_tier, i.recommendation_tier, 'browse') AS recommendation_tier, COALESCE(i.read_minutes, 12) AS read_minutes,
       COALESCE(i.read_depth, 'focused') AS read_depth, COALESCE(i.problem_zh, '') AS problem_zh,
       COALESCE(i.problem_en, '') AS problem_en, COALESCE(i.method_zh, '') AS method_zh,
       COALESCE(i.method_en, '') AS method_en, COALESCE(i.contribution_zh, '') AS contribution_zh,
       COALESCE(i.contribution_en, '') AS contribution_en, COALESCE(i.limitations_zh, '') AS limitations_zh,
       COALESCE(i.limitations_en, '') AS limitations_en, COALESCE(i.reading_focus_zh, '') AS reading_focus_zh,
       COALESCE(i.reading_focus_en, '') AS reading_focus_en, COALESCE(i.research_questions_zh, '[]') AS research_questions_zh,
       COALESCE(i.research_questions_en, '[]') AS research_questions_en,
       COALESCE(i.research_problem_id, '') AS research_problem_id,
       COALESCE(i.problem_fit_score, 0) AS problem_fit_score,
       COALESCE(i.uncertainty_reduction_score, 0) AS uncertainty_reduction_score,
       COALESCE(i.actionability_score, 0) AS actionability_score,
       COALESCE(i.research_problem_impact_zh, '') AS research_problem_impact_zh,
       COALESCE(i.research_problem_impact_en, '') AS research_problem_impact_en,
       COALESCE(i.research_decision_zh, '') AS research_decision_zh,
       COALESCE(i.research_decision_en, '') AS research_decision_en,
       COALESCE(i.verification_status, 'not_required') AS verification_status,
       COALESCE(i.verification_coverage_score, 0) AS verification_coverage_score,
       COALESCE(i.verification_json, '{}') AS verification_json,
       COALESCE((SELECT tp.track_id FROM research_track_papers tp
         WHERE tp.space_id = p.space_id AND tp.canonical_id = p.canonical_id
         ORDER BY tp.position LIMIT 1),
         (SELECT ep.track_id FROM research_map_evidence_proposals ep
          WHERE ep.space_id = p.space_id AND ep.paper_id = p.id AND ep.status IN ('pending', 'confirmed')
          ORDER BY CASE ep.status WHEN 'confirmed' THEN 0 ELSE 1 END, ep.updated_at DESC LIMIT 1), '') AS track_id,
       COALESCE(audit_route_origin.source_key, fallback_route_origin.source_key, '') AS discovery_source_key,
       COALESCE(audit_route_origin.route_id, fallback_route_origin.route_id, '') AS discovery_route_id,
       COALESCE(route_track.interaction_score,
         (SELECT t.interaction_score FROM research_track_papers tp JOIN research_tracks t ON t.id = tp.track_id AND t.space_id = tp.space_id
          WHERE tp.space_id = p.space_id AND tp.canonical_id = p.canonical_id ORDER BY tp.position LIMIT 1), 0)
       + COALESCE((
         SELECT MIN(18, COALESCE(SUM(event.weight), 0)) FROM paper_engagement_events event
         WHERE event.space_id = p.space_id AND event.occurred_at >= datetime('now', '-90 days')
          AND event.route_id = COALESCE(audit_route_origin.route_id, fallback_route_origin.route_id,
            (SELECT tp.track_id FROM research_track_papers tp
             WHERE tp.space_id = p.space_id AND tp.canonical_id = p.canonical_id ORDER BY tp.position LIMIT 1))
          AND NOT EXISTS (
            SELECT 1 FROM research_preference_signals disabled
            WHERE disabled.space_id = event.space_id AND disabled.source_type = 'passive_engagement'
             AND disabled.source_id = event.route_id AND disabled.active = 0
          )
       ), 0) AS discovery_route_interaction,
       COALESCE(route_track.title_zh, '') AS discovery_track_title_zh,
       COALESCE(route_track.title_en, '') AS discovery_track_title_en,
       CASE
        WHEN i.llm_recommended = 1 AND i.analysis_source = 'deepseek' THEN 'recommended'
        WHEN EXISTS (
          SELECT 1 FROM recommendation_audit_events history
          WHERE history.space_id = p.space_id AND history.paper_id = p.id
           AND history.relevance_score >= 72 AND history.quality_score >= 70
           AND (history.decision = 'verification_pending'
            OR (history.verification_status = 'degraded' AND (
              lower(history.screening_reason) LIKE '%timeout%' OR lower(history.screening_reason) LIKE '%aborted%'
              OR lower(history.screening_reason) LIKE '%draft is empty%' OR lower(history.screening_reason) LIKE '%empty draft%'
              OR lower(history.screening_reason) LIKE '%no populated substantive fields%'
              OR lower(history.screening_reason) LIKE '%draft incomplete%'
            )))
        ) THEN 'reviewing'
        WHEN i.analysis_source LIKE 'deepseek%' OR EXISTS (
          SELECT 1 FROM recommendation_audit_events review
          WHERE review.space_id = p.space_id AND review.paper_id = p.id AND review.is_paper = 1
        ) THEN 'reviewed'
        ELSE 'discovered'
       END AS quality_stage,
       COALESCE(d.show_count, 0) AS show_count, d.first_shown_at, d.last_shown_at, d.opened_at, d.snoozed_until,
       COALESCE(f.saved, 0) AS saved, f.feedback, COALESCE(r.status, 'unread') AS reading_status,
       COALESCE(r.note, '') AS reading_note
       FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id
       LEFT JOIN paper_delivery_state d ON d.paper_id = p.id AND d.space_id = p.space_id
       LEFT JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
       LEFT JOIN paper_reading_progress r ON r.paper_id = p.id AND r.space_id = p.space_id
       LEFT JOIN ${LATEST_AUDIT_ROUTE_ORIGIN_SUBQUERY} audit_route_origin
        ON audit_route_origin.space_id = p.space_id AND audit_route_origin.paper_id = p.id
       LEFT JOIN ${PRE_REVIEW_ROUTE_ORIGIN_SUBQUERY} fallback_route_origin
        ON fallback_route_origin.space_id = p.space_id AND fallback_route_origin.paper_id = p.id
       LEFT JOIN research_tracks route_track
        ON route_track.id = COALESCE(audit_route_origin.route_id, fallback_route_origin.route_id)
        AND route_track.space_id = p.space_id
        WHERE p.space_id = ?
        ORDER BY p.discovered_at DESC, i.quality_score DESC LIMIT 2000`,
    ).bind(space.id).all<PaperRow>(),
    database.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE space_id = ?").bind(space.id).first<{ count: number }>(),
    database.prepare(
      `SELECT id, status, current_horizon, current_source, progress, discovered_count, new_candidate_count,
       duplicate_count, reviewed_count, recommended_count, rejected_count, attempt, trigger_source,
       resume_of_job_id, checkpoint, first_recommendation_at, started_at, completed_at, error, work_queue_json
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
         AND ${formalResearchMapEvidencePredicate("c")}
       ORDER BY c.created_at DESC LIMIT 12`,
    ).bind(space.id).all<{
      id: string; kind: string; title_zh: string; title_en: string; summary_zh: string; summary_en: string;
      confidence: number; created_at: string; track_title_zh: string; track_title_en: string; paper_id: string; paper_title: string;
    }>(),
    database.prepare(
      `SELECT t.id AS track_id, t.title_zh, t.title_en, t.created_at AS track_created_at,
       COUNT(tp.id) AS paper_count, MAX(COALESCE(tp.created_at, t.created_at)) AS latest_activity_at
       FROM research_tracks t
       LEFT JOIN research_track_papers tp ON tp.track_id = t.id AND tp.space_id = t.space_id
        AND tp.created_at >= datetime('now', '-7 days')
       WHERE t.space_id = ? AND (t.created_at >= datetime('now', '-7 days') OR tp.id IS NOT NULL)
       GROUP BY t.id, t.title_zh, t.title_en, t.created_at
       ORDER BY latest_activity_at DESC LIMIT 12`,
    ).bind(space.id).all<{
      track_id: string; title_zh: string; title_en: string; track_created_at: string; paper_count: number; latest_activity_at: string;
    }>(),
    database.prepare(
      `SELECT ('inferred:' || p.id || ':' || tp.track_id) AS id, tp.track_id,
       t.title_zh AS track_title_zh, t.title_en AS track_title_en, p.id AS paper_id, p.title AS paper_title,
       tp.rationale_zh AS summary_zh, tp.rationale_en AS summary_en,
       i.llm_relevance_score AS confidence, MAX(p.discovered_at, tp.created_at) AS created_at
       FROM monitored_papers p
       JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id AND i.llm_recommended = 1
       JOIN research_track_papers tp ON tp.space_id = p.space_id AND tp.canonical_id = p.canonical_id
       JOIN research_map_evidence_proposals ep ON ep.space_id = p.space_id AND ep.paper_id = p.id
        AND ep.track_id = tp.track_id AND ep.status = 'confirmed'
       JOIN research_tracks t ON t.id = tp.track_id AND t.space_id = tp.space_id
       LEFT JOIN research_map_changes c ON c.paper_id = p.id AND c.track_id = tp.track_id AND c.kind = 'new_evidence'
        WHERE p.space_id = ? AND c.id IS NULL
         AND ${formalResearchMapEvidencePredicate("ep", "p.id")}
        AND (p.discovered_at >= datetime('now', '-7 days') OR tp.created_at >= datetime('now', '-7 days'))
       ORDER BY created_at DESC LIMIT 12`,
    ).bind(space.id).all<{
      id: string; track_id: string; track_title_zh: string; track_title_en: string; paper_id: string; paper_title: string;
      summary_zh: string; summary_en: string; confidence: number; created_at: string;
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
    database.prepare(
      `SELECT brief_date, status, headline_zh, headline_en, overview_zh, overview_en, signals_zh, signals_en,
       reading_plan_zh, reading_plan_en, watchlist_zh, watchlist_en, paper_ids, metrics_json, model, error, updated_at
       FROM monitor_daily_briefs WHERE space_id = ? ORDER BY brief_date DESC, updated_at DESC LIMIT 1`,
    ).bind(space.id).first<DailyBriefRow>(),
    database.prepare(
      `SELECT week_key, status, title_zh, title_en, overview_zh, overview_en, gains_zh, gains_en,
       gaps_zh, gaps_en, next_steps_zh, next_steps_en, source_days, model, error, updated_at
       FROM monitor_weekly_reviews WHERE space_id = ? ORDER BY week_key DESC, updated_at DESC LIMIT 1`,
    ).bind(space.id).first<WeeklyReviewRow>(),
    database.prepare(
      `SELECT id, kind, priority, title_zh, title_en, body_zh, body_en, action_view, entity_id, read_at, created_at
       FROM research_notifications WHERE space_id = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       ORDER BY CASE WHEN read_at IS NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 30`,
    ).bind(space.id).all<NotificationRow>(),
    database.prepare(
      `SELECT COUNT(*) AS attempts,
       SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS succeeded,
       SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed,
       COUNT(DISTINCT CASE WHEN status = 'ready' THEN date(started_at) END) AS active_days,
       (SELECT MIN(started_at) FROM monitor_scan_jobs first_job WHERE first_job.space_id = ?) AS first_started_at
       FROM monitor_scan_jobs WHERE space_id = ? AND started_at >= datetime('now', '-6 days')`,
    ).bind(space.id, space.id).first<{ attempts: number; succeeded: number; failed: number; active_days: number; first_started_at: string | null }>(),
    database.prepare(
      `SELECT COUNT(*) AS decisions,
       SUM(CASE WHEN saved = 1 OR feedback = 'relevant' THEN 1 ELSE 0 END) AS accepted,
       SUM(CASE WHEN reason_code = 'wrong_type' AND feedback = 'not_relevant' THEN 1 ELSE 0 END) AS wrong_type
       FROM paper_feedback WHERE space_id = ? AND updated_at >= datetime('now', '-6 days')
       AND (saved = 1 OR feedback IS NOT NULL)`,
    ).bind(space.id).first<{ decisions: number; accepted: number; wrong_type: number }>(),
    database.prepare(
      `WITH accepted_events AS (
         SELECT a.paper_id, a.reviewed_at, a.allocated_input_tokens + a.allocated_output_tokens AS review_tokens
         FROM recommendation_audit_events a
         LEFT JOIN paper_feedback f ON f.paper_id = a.paper_id AND f.space_id = a.space_id
         LEFT JOIN paper_reading_progress r ON r.paper_id = a.paper_id AND r.space_id = a.space_id
         WHERE a.space_id = ? AND a.recommended = 1
           AND (f.saved = 1 OR f.feedback = 'relevant' OR r.status IN ('read','mastered','cited'))
           AND a.reviewed_at >= datetime('now', '-13 days')
       ), paper_costs AS (
         SELECT paper_id,
           SUM(review_tokens) AS review_tokens_14,
           SUM(CASE WHEN reviewed_at >= datetime('now', '-6 days') THEN review_tokens ELSE 0 END) AS review_tokens_7,
           MAX(reviewed_at) AS latest_reviewed_at
         FROM accepted_events GROUP BY paper_id
       )
       SELECT COUNT(*) AS accepted_papers_14,
         COALESCE(SUM(review_tokens_14), 0) AS review_tokens_14,
         COALESCE(SUM(CASE WHEN latest_reviewed_at >= datetime('now', '-6 days') THEN 1 ELSE 0 END), 0) AS accepted_papers_7,
         COALESCE(SUM(review_tokens_7), 0) AS review_tokens_7
       FROM paper_costs`,
    ).bind(space.id).first<{ accepted_papers_14: number; review_tokens_14: number; accepted_papers_7: number; review_tokens_7: number }>(),
    database.prepare(
      `SELECT status, started_at, completed_at, first_recommendation_at, recommended_count, resume_of_job_id, error, work_queue_json
       FROM monitor_scan_jobs WHERE space_id = ? AND started_at >= datetime('now', '-13 days')
       ORDER BY started_at DESC`,
    ).bind(space.id).all<{
      status: string; started_at: string; completed_at: string | null; first_recommendation_at: string | null;
      recommended_count: number; resume_of_job_id: string | null; error: string | null; work_queue_json: string;
    }>(),
    database.prepare(
      `SELECT source, COUNT(*) AS failures, MAX(message) AS last_error, MAX(created_at) AS last_seen_at
       FROM monitor_reliability_events WHERE space_id = ? AND kind = 'source_degraded'
        AND created_at >= datetime('now', '-13 days')
       GROUP BY source ORDER BY failures DESC, last_seen_at DESC LIMIT 12`,
    ).bind(space.id).all<{ source: string; failures: number; last_error: string; last_seen_at: string }>(),
    database.prepare(
      `WITH outcomes AS (
         SELECT p.id, COALESCE(f.saved, 0) AS saved, f.feedback, COALESCE(f.reason_code, '') AS reason_code,
          COALESCE(r.status, 'unread') AS reading_status
         FROM monitored_papers p
         LEFT JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
         LEFT JOIN paper_reading_progress r ON r.paper_id = p.id AND r.space_id = p.space_id
         WHERE p.space_id = ?
       )
       SELECT
        SUM(CASE WHEN saved = 1 OR feedback IS NOT NULL OR reading_status IN ('read','mastered','cited') THEN 1 ELSE 0 END) AS labels,
        SUM(CASE WHEN saved = 1 OR feedback = 'relevant' OR reading_status IN ('read','mastered','cited') THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN feedback = 'not_relevant' AND reason_code <> 'duplicate_known' THEN 1 ELSE 0 END) AS dismissed,
        SUM(CASE WHEN reason_code = 'duplicate_known' OR reading_status IN ('mastered','cited') THEN 1 ELSE 0 END) AS known,
        SUM(CASE WHEN reason_code = 'wrong_type' AND feedback = 'not_relevant' THEN 1 ELSE 0 END) AS wrong_type
       FROM outcomes`,
    ).bind(space.id).first<{ labels: number; accepted: number; dismissed: number; known: number; wrong_type: number }>(),
    database.prepare(
      `SELECT stage, outcome, duration_ms FROM monitor_reliability_events
       WHERE space_id = ? AND created_at >= datetime('now', '-13 days') AND duration_ms > 0
       ORDER BY created_at DESC LIMIT 300`,
    ).bind(space.id).all<{ stage: string; outcome: string; duration_ms: number }>(),
  ]);
  const automationCounters = await readAutomationCounters(database, space.id);
  const now = Date.now();
  const duePapers = papers.results
    .filter((paper) => paper.quality_stage === "recommended" && paper.analysis_model === MONITOR_MODEL && isPaperDue(paper, now))
    .sort((left, right) => databaseTime(right.last_recommended_at) - databaseTime(left.last_recommended_at)
      || left.show_count - right.show_count || right.discovery_route_interaction - left.discovery_route_interaction
      || right.quality_score - left.quality_score || databaseTime(right.discovered_at) - databaseTime(left.discovered_at));
  const selected = selectDiverseItems(
    duePapers,
    (paper) => paper.track_id || paper.discovery_route_id || `horizon:${paper.horizon}`,
    (paper) => paper.horizon,
    6,
    1,
  );
  // The paper library is a durable discovery archive, not a synonym for today's recommendation queue.
  // Keep every discovered paper visible while quality_stage makes clear how far Pi has evaluated it.
  const historyPapers = papers.results.map((paper) => toPaper(paper, now));
  const recommendationHistoryPapers = historyPapers.filter((paper) => paper.qualityStage === "recommended"
    || paper.qualityStage === "reviewing" || paper.saved || Boolean(paper.feedback) || paper.readingStatus !== "unread");
  const savedCandidatePapers = papers.results
    .filter((paper) => paper.quality_stage === "reviewing")
    .sort((left, right) => right.llm_relevance_score - left.llm_relevance_score
      || right.quality_score - left.quality_score || databaseTime(right.discovered_at) - databaseTime(left.discovered_at))
    .slice(0, 12)
    .map((paper) => toPaper(paper, now));
  const pendingPapers = recommendationHistoryPapers.filter((paper) => paper.userState !== "accepted" && paper.userState !== "dismissed");
  const automationPauseReason = (run?.automation_pause_reason || "") as AutomationPauseReason | "";
  const automationPauseCopy = monitorAutomationPauseCopy(automationPauseReason || null);
  let latestQueries: Partial<Record<Horizon, string[]>> = {};
  try { latestQueries = queryPlanRow ? JSON.parse(queryPlanRow.queries_json) as Partial<Record<Horizon, string[]>> : {}; } catch { latestQueries = {}; }
  const reviewed = scanMetrics?.reviewed || 0;
  const recommended = scanMetrics?.recommended || 0;
  const decisions = feedbackMetrics?.decisions || 0;
  const accepted = feedbackMetrics?.accepted || 0;
  const reliabilityProgram = buildReliabilityProgram({
    jobs: reliabilityJobs.results.map((row) => ({
      completionState: (() => {
        const work = parseScanWorkQueue(row.work_queue_json);
        if (row.recommended_count === 0 && work.verificationIds.length > work.verificationCompletedIds.length) {
          return "analysis_unavailable";
        }
        return deepReviewCompletion({
          scheduled: work.deepIds.length,
          completed: work.deepCompletedIds.length,
          deferred: work.deepDeferredIds.length,
          recommended: row.recommended_count,
        }).state;
      })(),
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      firstRecommendationAt: row.first_recommendation_at,
      recommendedCount: row.recommended_count,
      resumeOfJobId: row.resume_of_job_id,
      error: row.error,
    })),
    sourceFailures: reliabilitySources.results.map((row) => ({
      source: row.source,
      failures: row.failures,
      lastError: row.last_error,
      lastSeenAt: row.last_seen_at,
    })),
    calibration: {
      labels: reliabilityCalibration?.labels || 0,
      accepted: reliabilityCalibration?.accepted || 0,
      dismissed: reliabilityCalibration?.dismissed || 0,
      known: reliabilityCalibration?.known || 0,
      wrongType: reliabilityCalibration?.wrong_type || 0,
    },
    stageEvents: reliabilityStages.results.map((row) => ({
      stage: row.stage,
      outcome: row.outcome,
      durationMs: row.duration_ms,
    })),
  });
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
  const acceptedPapers14 = acceptedCostMetrics?.accepted_papers_14 || 0;
  const acceptedPapers7 = acceptedCostMetrics?.accepted_papers_7 || 0;
  const reviewTokensPerAcceptedPaper = acceptedPapers14 ? Math.round((acceptedCostMetrics?.review_tokens_14 || 0) / acceptedPapers14) : 0;
  const totalTokensPerAcceptedPaper = acceptedPapers14 ? Math.round(operationsTotals.tokens / acceptedPapers14) : 0;
  const pilotTokenCutoff = Date.now() - 6 * 86_400_000;
  const pilotTotalTokens = dailyUsageRows.results
    .filter((row) => Date.parse(`${row.usage_date}T00:00:00Z`) >= pilotTokenCutoff)
    .reduce((sum, row) => sum + (row.input_tokens || 0) + (row.output_tokens || 0), 0);
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
  const dailyBrief = dailyBriefRow ? {
    date: dailyBriefRow.brief_date,
    status: dailyBriefRow.status,
    headlineZh: sanitizeRetiredFulltextCopy(dailyBriefRow.headline_zh),
    headlineEn: sanitizeRetiredFulltextCopy(dailyBriefRow.headline_en),
    overviewZh: sanitizeRetiredFulltextCopy(dailyBriefRow.overview_zh),
    overviewEn: sanitizeRetiredFulltextCopy(dailyBriefRow.overview_en),
    signalsZh: parseSanitizedBriefList(dailyBriefRow.signals_zh),
    signalsEn: parseSanitizedBriefList(dailyBriefRow.signals_en),
    readingPlanZh: parseSanitizedBriefList(dailyBriefRow.reading_plan_zh),
    readingPlanEn: parseSanitizedBriefList(dailyBriefRow.reading_plan_en),
    watchlistZh: parseSanitizedBriefList(dailyBriefRow.watchlist_zh),
    watchlistEn: parseSanitizedBriefList(dailyBriefRow.watchlist_en),
    paperIds: parseVenues(dailyBriefRow.paper_ids),
    metrics: (() => { try { return JSON.parse(dailyBriefRow.metrics_json) as Record<string, number>; } catch { return {}; } })(),
    model: dailyBriefRow.model,
    error: dailyBriefRow.error,
    updatedAt: dailyBriefRow.updated_at,
  } : null;
  const weeklyReview = weeklyReviewRow ? {
    weekKey: weeklyReviewRow.week_key,
    status: weeklyReviewRow.status,
    titleZh: sanitizeRetiredFulltextCopy(weeklyReviewRow.title_zh),
    titleEn: sanitizeRetiredFulltextCopy(weeklyReviewRow.title_en),
    overviewZh: sanitizeRetiredFulltextCopy(weeklyReviewRow.overview_zh),
    overviewEn: sanitizeRetiredFulltextCopy(weeklyReviewRow.overview_en),
    gainsZh: parseSanitizedBriefList(weeklyReviewRow.gains_zh),
    gainsEn: parseSanitizedBriefList(weeklyReviewRow.gains_en),
    gapsZh: parseSanitizedBriefList(weeklyReviewRow.gaps_zh),
    gapsEn: parseSanitizedBriefList(weeklyReviewRow.gaps_en),
    nextStepsZh: parseSanitizedBriefList(weeklyReviewRow.next_steps_zh),
    nextStepsEn: parseSanitizedBriefList(weeklyReviewRow.next_steps_en),
    sourceDays: weeklyReviewRow.source_days,
    model: weeklyReviewRow.model,
    error: weeklyReviewRow.error,
    updatedAt: weeklyReviewRow.updated_at,
  } : null;
  const notifications = notificationRows.results.map((row) => ({
    id: row.id,
    kind: row.kind,
    priority: row.priority,
    titleZh: row.title_zh,
    titleEn: row.title_en,
    bodyZh: row.body_zh,
    bodyEn: row.body_en,
    actionView: row.action_view,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
  const pilotFirstScanAt = pilotJobMetrics?.first_started_at || null;
  const pilotElapsedDays = pilotFirstScanAt ? Math.min(7, Math.max(1, Math.floor((Date.now() - databaseTime(pilotFirstScanAt)) / 86_400_000) + 1)) : 0;
  const pilotAttempts = pilotJobMetrics?.attempts || 0;
  const pilotSucceeded = pilotJobMetrics?.succeeded || 0;
  const pilotReliability = pilotAttempts ? Math.round(pilotSucceeded / pilotAttempts * 100) : 0;
  const pilotDecisions = pilotWrongType?.decisions || 0;
  const pilotAccepted = pilotWrongType?.accepted || 0;
  const pilotAcceptance = pilotDecisions ? Math.round(pilotAccepted / pilotDecisions * 100) : 0;
  const activeDays = pilotJobMetrics?.active_days || 0;
  const continuity = pilotElapsedDays ? Math.round(activeDays / pilotElapsedDays * 100) : 0;
  const activeHorizons = horizonRows.results.filter((row) => row.branches > 0 && row.attempts > 0).length;
  const pilotCriteria = [
    { id: "reliability", status: pilotAttempts < 2 ? "waiting" : pilotReliability >= 95 ? "pass" : "watch", value: pilotReliability, target: 95 },
    { id: "paperQuality", status: pilotDecisions < 3 ? "waiting" : (pilotWrongType?.wrong_type || 0) === 0 ? "pass" : "watch", value: pilotWrongType?.wrong_type || 0, target: 0 },
    { id: "usefulness", status: pilotDecisions < 3 ? "waiting" : pilotAcceptance >= 60 ? "pass" : "watch", value: pilotAcceptance, target: 60 },
    { id: "continuity", status: pilotElapsedDays < 3 ? "waiting" : continuity >= 70 ? "pass" : "watch", value: continuity, target: 70 },
    { id: "horizons", status: activeHorizons < 3 ? "waiting" : "pass", value: activeHorizons, target: 3 },
    { id: "deduplication", status: pilotSucceeded < 1 ? "waiting" : "pass", value: operationsTotals.duplicatesAvoided, target: 0 },
  ];
  const scanWork = job ? parseScanWorkQueue(job.work_queue_json) : null;
  const discoveryOrder: Horizon[] = ["days", "months", "years"];
  const activeDiscoveryIndex = job?.checkpoint?.startsWith("discovering_")
    ? discoveryOrder.indexOf(job.checkpoint.replace("discovering_", "") as Horizon)
    : -1;
  const discoveryFinished = Boolean(job && (
    job.status === "ready"
    || (scanWork?.screens.length || 0) > 0
    || (scanWork?.deepIds.length || 0) > 0
    || ["deduplicating", "enriching_screening_abstracts", "screening", "rescue_screening", "enriching_abstracts", "deep_reviewing", "verifying_recommendations", "evidence_deepening", "finalizing", "main_complete", "complete"].includes(job.checkpoint)
    || ["deduplicating", "enriching_screening_abstracts", "screening", "rescue_screening", "enriching_abstracts", "deep_reviewing", "verifying_recommendations"].includes(scanWork?.resumeCheckpoint || "")
  ));
  const scanHorizonStats = discoveryOrder.map((horizon, index) => {
    const stored = scanWork?.horizonStats[horizon];
    const hasMeasuredCounts = Boolean(stored?.completed);
    const status = hasMeasuredCounts || discoveryFinished || (activeDiscoveryIndex >= 0 && index < activeDiscoveryIndex)
      ? "complete"
      : activeDiscoveryIndex === index ? "searching" : "pending";
    return {
      horizon,
      status,
      candidates: hasMeasuredCounts ? stored?.candidates || 0 : null,
      rawCandidates: hasMeasuredCounts ? stored?.rawCandidates || 0 : null,
      newCandidates: hasMeasuredCounts ? stored?.newCandidates || 0 : null,
      queued: hasMeasuredCounts ? stored?.queued || 0 : null,
      screened: scanWork?.screens.filter((screen) => screen.horizon === horizon).length || 0,
    };
  });
  const budgetCheckpoint = job?.status === "error" && scanWork
    ? inferResumeCheckpoint(job, scanWork)
    : job?.checkpoint || "planning";
  const budgetMinimum = job?.status === "ready" || !job
    ? MONITOR_MINIMUM_NEW_SCAN_ANALYSIS_CALLS
    : minimumAnalysisCallsForCheckpoint(budgetCheckpoint);
  const budgetRemaining = Math.max(0, MONITOR_SPACE_DAILY_ANALYSIS_LIMIT - automationCounters.dailyRequests);
  const budgetTomorrow = new Date(Date.now() + 86_400_000);
  const analysisBudget = {
    used: automationCounters.dailyRequests,
    limit: MONITOR_SPACE_DAILY_ANALYSIS_LIMIT,
    remaining: budgetRemaining,
    minimumToStart: budgetMinimum,
    available: budgetRemaining >= budgetMinimum,
    resetsAt: new Date(`${shanghaiDateKey(budgetTomorrow)}T00:00:00+08:00`).toISOString(),
  };
  const persistedMapChanges = mapChanges.results.map((change) => ({
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
  }));
  const inferredEvidenceChanges = inferredMapChanges.results.map((change) => ({
    id: change.id,
    kind: "new_evidence",
    titleZh: `${change.track_title_zh}新增证据：${change.paper_title}`,
    titleEn: `New evidence for ${change.track_title_en}: ${change.paper_title}`,
    summaryZh: change.summary_zh,
    summaryEn: change.summary_en,
    confidence: change.confidence,
    createdAt: change.created_at,
    trackTitleZh: change.track_title_zh,
    trackTitleEn: change.track_title_en,
    paperId: change.paper_id,
    paperTitle: change.paper_title,
  }));
  const structuralMapChanges = recentTrackActivity.results.map((activity) => {
    const initialized = Date.parse(activity.track_created_at + "Z") >= Date.now() - 7 * 24 * 60 * 60 * 1000;
    const count = activity.paper_count || 0;
    return {
      id: `${initialized ? "route-initialized" : "route-expanded"}:${activity.track_id}:${activity.latest_activity_at}`,
      kind: initialized ? "route_initialized" : "node_added",
      titleZh: initialized ? `建立研究路线：${activity.title_zh}` : `${activity.title_zh}新增 ${count} 篇代表论文`,
      titleEn: initialized ? `Research route created: ${activity.title_en}` : `${count} representative papers added to ${activity.title_en}`,
      summaryZh: initialized
        ? `Pi 已建立这条研究路线${count ? `，并纳入 ${count} 篇奠基、里程碑或前沿论文作为结构节点` : "，代表论文仍在持续填充"}。这些结构节点与通过推荐证据核对的路线证据分开标记。`
        : `这条路线最近补充了 ${count} 篇代表论文；完成书目与摘要证据核对后，才会另行记为路线证据变化。`,
      summaryEn: initialized
        ? `Pi created this research route${count ? ` with ${count} foundation, milestone, or frontier papers as structural nodes` : "; representative papers are still being added"}. These structural nodes remain distinct from route evidence that passed recommendation evidence checks.`
        : `${count} representative papers were added recently. A route-evidence change appears separately only after independent recommendation verification.`,
      confidence: 100,
      createdAt: activity.latest_activity_at,
      trackTitleZh: activity.title_zh,
      trackTitleEn: activity.title_en,
      paperId: "",
      paperTitle: initialized ? activity.title_zh : `${activity.title_zh} · +${count}`,
    };
  });
  const mapChangeItems = [...persistedMapChanges, ...inferredEvidenceChanges, ...structuralMapChanges]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 12);
  return {
    monitor: {
      status: run?.status || "idle",
      lastRunAt: run?.last_run_at || null,
      nextRunAt: run?.next_run_at || null,
      newCount: run?.new_count || 0,
      scannedCount: run?.scanned_count || 0,
      explorationRound: run?.discovery_round || 0,
      lastTrigger: run?.last_trigger || "visit",
      knownCount: known?.count || 0,
      error: run?.error || null,
      cadenceHours: 24,
      automation: {
        enabled: !run?.automation_paused_at,
        paused: Boolean(run?.automation_paused_at),
        pauseReason: automationPauseReason || null,
        pauseMessageZh: automationPauseCopy.zh,
        pauseMessageEn: automationPauseCopy.en,
        pausedAt: run?.automation_paused_at || null,
        lastUserActivityAt: run?.last_user_activity_at || null,
        scheduledRunsSinceActivity: run?.scheduled_runs_since_activity || 0,
        pendingRecommendations: automationCounters.pendingRecommendations,
        dailyRequests: automationCounters.dailyRequests,
        dailyTokens: automationCounters.dailyTokens,
        limits: MONITOR_AUTOMATION_LIMITS,
        cadenceHours: 24,
        schedulerCheckMinutes: 10,
        errorRetryMinutes: Math.round(ERROR_RETRY_MS / 60_000),
        singleRunLock: true,
      },
      analysisBudget,
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
        candidateCount: scanWork?.candidateIds.length || 0,
        deepCandidateCount: scanWork?.deepIds.length || 0,
        deepCompletedCount: scanWork?.deepCompletedIds.length || 0,
        deepDeferredCount: scanWork?.deepDeferredIds.length || 0,
        verificationTargetCount: scanWork?.verificationIds.length || 0,
        verificationCompletedCount: scanWork?.verificationCompletedIds.length || 0,
        verificationPendingCount: scanWork ? Math.max(0, scanWork.verificationIds.length - scanWork.verificationCompletedIds.length) : 0,
        horizonStats: scanHorizonStats,
        pipelineVersion: scanWork?.pipelineVersion || "",
        needsRefresh: job.status === "ready" && !COMPATIBLE_MONITOR_PIPELINE_VERSIONS.has(scanWork?.pipelineVersion || ""),
        attempt: job.attempt,
        triggerSource: job.trigger_source,
        resumeOfJobId: job.resume_of_job_id,
        checkpoint: job.checkpoint,
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
      mapChanges: mapChangeItems,
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
          acceptedPapers: acceptedPapers14,
          reviewTokensPerAcceptedPaper,
          totalTokensPerAcceptedPaper,
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
      dailyBrief,
      weeklyReview,
      notifications,
      unreadNotificationCount: notifications.filter((notification) => !notification.readAt).length,
      pilotEvaluation: {
        targetDays: 7,
        elapsedDays: pilotElapsedDays,
        firstScanAt: pilotFirstScanAt,
        complete: pilotElapsedDays >= 7,
        attempts: pilotAttempts,
        succeeded: pilotSucceeded,
        failed: pilotJobMetrics?.failed || 0,
        activeDays,
        criteria: pilotCriteria,
        summary: {
          reliability: pilotReliability,
          acceptanceRate: pilotAcceptance,
          wrongTypeReports: pilotWrongType?.wrong_type || 0,
          continuity,
          activeHorizons,
          duplicatesAvoided: operationsTotals.duplicatesAvoided,
          tokensPerRecommendation: operationsTotals.recommended ? Math.round(operationsTotals.tokens / operationsTotals.recommended) : 0,
          acceptedPapers: acceptedPapers7,
          reviewTokensPerAcceptedPaper: acceptedPapers7 ? Math.round((acceptedCostMetrics?.review_tokens_7 || 0) / acceptedPapers7) : 0,
          totalTokensPerAcceptedPaper: acceptedPapers7 ? Math.round(pilotTotalTokens / acceptedPapers7) : 0,
        },
      },
      internalReliability: {
        ...reliabilityProgram,
        periodDays: MONITOR_RELIABILITY_PERIOD_DAYS,
      },
      suggestedAuthors,
      papers: selected.map((paper) => toPaper(paper, now)),
      savedCandidatePapers,
      historyPapers,
      historyCounts: {
        all: recommendationHistoryPapers.length,
        inbox: pendingPapers.length,
        unseen: pendingPapers.filter((paper) => paper.userState === "unseen").length,
        seen: pendingPapers.filter((paper) => paper.userState === "seen").length,
        snoozed: pendingPapers.filter((paper) => paper.userState === "snoozed").length,
        accepted: recommendationHistoryPapers.filter((paper) => paper.userState === "accepted").length,
        saved: recommendationHistoryPapers.filter((paper) => paper.saved).length,
        dismissed: recommendationHistoryPapers.filter((paper) => paper.userState === "dismissed").length,
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

function emptyHorizonScanStats(): Record<Horizon, HorizonScanStats> {
  return {
    days: { rawCandidates: 0, candidates: 0, newCandidates: 0, queued: 0, completed: false },
    months: { rawCandidates: 0, candidates: 0, newCandidates: 0, queued: 0, completed: false },
    years: { rawCandidates: 0, candidates: 0, newCandidates: 0, queued: 0, completed: false },
  };
}

function parseFrozenQueryPlan(value: unknown): QueryPlan | undefined {
  if (!value || typeof value !== "object") return undefined;
  const parsed = value as Partial<QueryPlan>;
  if (!parsed.queries || typeof parsed.queries !== "object") return undefined;
  const explorationMode: ExplorationMode = ["focused", "balanced", "open"].includes(parsed.explorationMode || "")
    ? parsed.explorationMode as ExplorationMode : "balanced";
  return {
    planDate: typeof parsed.planDate === "string" ? parsed.planDate : "",
    explorationMode,
    queries: {
      days: normalizePlannedQueries(parsed.queries.days, 3),
      months: normalizePlannedQueries(parsed.queries.months, 3),
      years: normalizePlannedQueries(parsed.queries.years, 3),
    },
    rationaleZh: typeof parsed.rationaleZh === "string" ? parsed.rationaleZh : "",
    rationaleEn: typeof parsed.rationaleEn === "string" ? parsed.rationaleEn : "",
    model: typeof parsed.model === "string" ? parsed.model : "deterministic-fallback",
    error: typeof parsed.error === "string" ? parsed.error : null,
  };
}

function parseScanWorkQueue(value: string | null | undefined): ScanWorkQueue {
  const fallback: ScanWorkQueue = {
    candidateIds: [], currentCandidateIds: [], screens: [], deepIds: [], deepSelectionOrigins: {}, selectionFailureReasons: {},
    deepCompletedIds: [], rawCandidateCount: 0, newCandidateCount: 0,
    deepDeferredIds: [], retryDeepIds: [],
    verificationIds: [], verificationCompletedIds: [], verificationDeferredIds: [],
    verificationAttempts: {}, draftRegenerationAttempts: {},
    evidenceIds: [], evidenceCompletedIds: [],
    rescueScreenIds: [], rescueScreened: false, screenFailureCount: 0, deepFailureCount: 0, verificationFailureCount: 0,
    pipelineVersion: "", horizonStats: emptyHorizonScanStats(), resumeCheckpoint: "",
  };
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<ScanWorkQueue>;
    const horizonStats = emptyHorizonScanStats();
    for (const horizon of ["days", "months", "years"] as Horizon[]) {
      const stored = parsed.horizonStats?.[horizon];
      if (!stored) continue;
      horizonStats[horizon] = {
        rawCandidates: Math.max(0, Number(stored.rawCandidates) || 0),
        candidates: Math.max(0, Number(stored.candidates) || 0),
        newCandidates: Math.max(0, Number(stored.newCandidates) || 0),
        queued: Math.max(0, Number(stored.queued) || 0),
        completed: stored.completed === true,
      };
    }
    return {
      candidateIds: Array.isArray(parsed.candidateIds) ? parsed.candidateIds.filter((id): id is string => typeof id === "string").slice(0, CANDIDATE_WORK_QUEUE_LIMIT) : [],
      currentCandidateIds: Array.isArray(parsed.currentCandidateIds) ? parsed.currentCandidateIds.filter((id): id is string => typeof id === "string").slice(0, CANDIDATE_WORK_QUEUE_LIMIT) : [],
      screens: Array.isArray(parsed.screens) ? parsed.screens.filter((screen): screen is QuickScreen => Boolean(screen && typeof screen.canonicalId === "string")).slice(0, CANDIDATE_WORK_QUEUE_LIMIT).map((screen) => ({
        ...screen,
        horizon: ["days", "months", "years"].includes(screen.horizon || "") ? screen.horizon : undefined,
      })) : [],
      deepIds: Array.isArray(parsed.deepIds) ? parsed.deepIds.filter((id): id is string => typeof id === "string").slice(0, DEEP_REVIEW_MAX_LIMIT) : [],
      deepSelectionOrigins: parsed.deepSelectionOrigins && typeof parsed.deepSelectionOrigins === "object" && !Array.isArray(parsed.deepSelectionOrigins)
        ? Object.fromEntries(Object.entries(parsed.deepSelectionOrigins).filter((entry): entry is [string, "fresh" | "route" | "backlog"] =>
          Boolean(entry[0]) && ["fresh", "route", "backlog"].includes(String(entry[1]))).slice(0, DEEP_REVIEW_MAX_LIMIT))
        : {},
      selectionFailureReasons: parsed.selectionFailureReasons && typeof parsed.selectionFailureReasons === "object" && !Array.isArray(parsed.selectionFailureReasons)
        ? Object.fromEntries(Object.entries(parsed.selectionFailureReasons).filter(([reason]) => Boolean(reason)).slice(0, 20)
          .map(([reason, count]) => [reason, Math.max(0, Number(count) || 0)]))
        : {},
      deepCompletedIds: Array.isArray(parsed.deepCompletedIds) ? parsed.deepCompletedIds.filter((id): id is string => typeof id === "string").slice(0, DEEP_REVIEW_MAX_LIMIT) : [],
      deepDeferredIds: Array.isArray(parsed.deepDeferredIds) ? parsed.deepDeferredIds.filter((id): id is string => typeof id === "string").slice(0, DEEP_REVIEW_MAX_LIMIT) : [],
      retryDeepIds: Array.isArray(parsed.retryDeepIds) ? parsed.retryDeepIds.filter((id): id is string => typeof id === "string").slice(0, DEEP_REVIEW_CARRYOVER_LIMIT) : [],
      verificationIds: Array.isArray(parsed.verificationIds) ? parsed.verificationIds.filter((id): id is string => typeof id === "string").slice(0, DEEP_REVIEW_MAX_LIMIT) : [],
      verificationCompletedIds: Array.isArray(parsed.verificationCompletedIds) ? parsed.verificationCompletedIds.filter((id): id is string => typeof id === "string").slice(0, DEEP_REVIEW_MAX_LIMIT) : [],
      verificationDeferredIds: Array.isArray(parsed.verificationDeferredIds) ? parsed.verificationDeferredIds.filter((id): id is string => typeof id === "string").slice(0, DEEP_REVIEW_MAX_LIMIT) : [],
      verificationAttempts: parsed.verificationAttempts && typeof parsed.verificationAttempts === "object" && !Array.isArray(parsed.verificationAttempts)
        ? Object.fromEntries(Object.entries(parsed.verificationAttempts).filter(([id]) => id).slice(0, DEEP_REVIEW_MAX_LIMIT)
          .map(([id, count]) => [id, Math.max(0, Math.min(VERIFICATION_ATTEMPT_LIMIT, Number(count) || 0))]))
        : {},
      draftRegenerationAttempts: parsed.draftRegenerationAttempts && typeof parsed.draftRegenerationAttempts === "object" && !Array.isArray(parsed.draftRegenerationAttempts)
        ? Object.fromEntries(Object.entries(parsed.draftRegenerationAttempts).filter(([id]) => id).slice(0, DEEP_REVIEW_MAX_LIMIT)
          .map(([id, count]) => [id, Math.max(0, Math.min(INCOMPLETE_DRAFT_REGENERATION_LIMIT, Number(count) || 0))]))
        : {},
      evidenceIds: [],
      evidenceCompletedIds: [],
      rescueScreenIds: Array.isArray(parsed.rescueScreenIds) ? parsed.rescueScreenIds.filter((id): id is string => typeof id === "string").slice(0, RESCUE_SCREEN_LIMIT) : [],
      rescueScreened: parsed.rescueScreened === true,
      rawCandidateCount: Math.max(0, Number(parsed.rawCandidateCount) || 0),
      newCandidateCount: Math.max(0, Number(parsed.newCandidateCount) || 0),
      screenFailureCount: Math.max(0, Number(parsed.screenFailureCount) || 0),
      deepFailureCount: Math.max(0, Number(parsed.deepFailureCount) || 0),
      verificationFailureCount: Math.max(0, Number(parsed.verificationFailureCount) || 0),
      pipelineVersion: typeof parsed.pipelineVersion === "string" ? parsed.pipelineVersion : "",
      horizonStats,
      frozenQueryPlan: parseFrozenQueryPlan(parsed.frozenQueryPlan),
      resumeCheckpoint: typeof parsed.resumeCheckpoint === "string" ? parsed.resumeCheckpoint : "",
    };
  } catch {
    return fallback;
  }
}

function newScanWorkQueue(): ScanWorkQueue {
  return {
    candidateIds: [], currentCandidateIds: [], screens: [], deepIds: [], deepSelectionOrigins: {}, selectionFailureReasons: {},
    deepCompletedIds: [], rescueScreenIds: [], rescueScreened: false,
    deepDeferredIds: [], retryDeepIds: [],
    verificationIds: [], verificationCompletedIds: [], verificationDeferredIds: [],
    verificationAttempts: {}, draftRegenerationAttempts: {},
    evidenceIds: [], evidenceCompletedIds: [],
    rawCandidateCount: 0, newCandidateCount: 0, screenFailureCount: 0, deepFailureCount: 0, verificationFailureCount: 0,
    pipelineVersion: MONITOR_PIPELINE_VERSION, horizonStats: emptyHorizonScanStats(), resumeCheckpoint: "",
  };
}

const RESUMABLE_SCAN_CHECKPOINTS = new Set([
  "planning", "discovering_days", "discovering_months", "discovering_years", "deduplicating",
  "enriching_screening_abstracts", "screening", "rescue_screening", "enriching_abstracts", "deep_reviewing", "verifying_recommendations", "evidence_deepening", "finalizing",
]);

function inferResumeCheckpoint(job: Pick<StagedJobRow, "checkpoint" | "current_source">, work: ScanWorkQueue) {
  if (work.resumeCheckpoint && RESUMABLE_SCAN_CHECKPOINTS.has(work.resumeCheckpoint)) return work.resumeCheckpoint;
  if (RESUMABLE_SCAN_CHECKPOINTS.has(job.checkpoint)) return job.checkpoint;
  if (work.verificationIds.length && work.verificationCompletedIds.length + work.verificationDeferredIds.length < work.verificationIds.length) return "verifying_recommendations";
  if (work.deepIds.length) {
    return work.deepCompletedIds.length || work.deepDeferredIds.length ? "deep_reviewing" : "enriching_abstracts";
  }
  if (work.rescueScreenIds.length && !work.rescueScreened) return "rescue_screening";
  if (work.screens.length || /筛选|screen/i.test(job.current_source)) return "screening";
  if (work.candidateIds.length) return work.candidateIds.length <= Object.values(HORIZON_REVIEW_LIMITS).reduce((sum, value) => sum + value, 0)
    ? "screening" : "deduplicating";
  return "planning";
}

function statusForCheckpoint(checkpoint: string) {
  if (["enriching_screening_abstracts", "screening", "rescue_screening"].includes(checkpoint)) return "screening";
  if (["enriching_abstracts", "deep_reviewing", "verifying_recommendations", "evidence_deepening", "finalizing"].includes(checkpoint)) return "deep_reviewing";
  if (checkpoint === "deduplicating") return "deduplicating";
  if (checkpoint.startsWith("discovering_")) return checkpoint;
  return "scanning";
}

function monitorProgressByCheckpoint(checkpoint: string) {
  if (checkpoint === "enriching_screening_abstracts") return 54;
  if (checkpoint === "screening") return 56;
  if (checkpoint === "rescue_screening") return 72;
  if (checkpoint === "enriching_abstracts") return 76;
  if (checkpoint === "deep_reviewing") return 80;
  if (checkpoint === "verifying_recommendations") return 94;
  if (checkpoint === "evidence_deepening") return 95;
  if (checkpoint === "finalizing") return 99;
  if (checkpoint === "deduplicating") return 50;
  if (checkpoint === "discovering_years") return 36;
  if (checkpoint === "discovering_months") return 22;
  if (checkpoint === "discovering_days") return 10;
  return 3;
}

async function saveScanWorkQueue(database: D1Database, jobId: string, work: ScanWorkQueue) {
  await database.prepare("UPDATE monitor_scan_jobs SET work_queue_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(JSON.stringify(work), jobId).run();
}

async function pruneExplicitlyWithdrawnScanWork(database: D1Database, spaceId: string, work: ScanWorkQueue) {
  const queuedIds = Array.from(new Set([
    ...work.candidateIds,
    ...work.screens.map((screen) => screen.canonicalId),
    ...work.deepIds,
    ...work.deepCompletedIds,
    ...work.deepDeferredIds,
    ...work.retryDeepIds,
    ...work.verificationIds,
    ...work.verificationCompletedIds,
    ...work.verificationDeferredIds,
    ...work.evidenceIds,
    ...work.evidenceCompletedIds,
    ...work.rescueScreenIds,
  ])).filter(Boolean);
  if (!queuedIds.length) return false;

  const reviewableIds = new Set<string>();
  for (let start = 0; start < queuedIds.length; start += 70) {
    const chunk = queuedIds.slice(start, start + 70);
    const rows = await database.prepare(reviewableScanCandidateIdsSql(chunk.length))
      .bind(spaceId, ...chunk).all<{ canonical_id: string }>();
    for (const row of rows.results) reviewableIds.add(row.canonical_id);
  }

  const before = JSON.stringify({
    candidateIds: work.candidateIds,
    currentCandidateIds: work.currentCandidateIds,
    screenIds: work.screens.map((screen) => screen.canonicalId),
    deepIds: work.deepIds,
    deepCompletedIds: work.deepCompletedIds,
    deepDeferredIds: work.deepDeferredIds,
    retryDeepIds: work.retryDeepIds,
    verificationIds: work.verificationIds,
    verificationCompletedIds: work.verificationCompletedIds,
    verificationDeferredIds: work.verificationDeferredIds,
    evidenceIds: work.evidenceIds,
    evidenceCompletedIds: work.evidenceCompletedIds,
    rescueScreenIds: work.rescueScreenIds,
  });
  const retained = retainReviewableScanWork(work, reviewableIds);
  Object.assign(work, retained);
  work.currentCandidateIds = work.currentCandidateIds.filter((id) => reviewableIds.has(id));
  work.deepSelectionOrigins = Object.fromEntries(Object.entries(work.deepSelectionOrigins)
    .filter(([id]) => reviewableIds.has(id)));
  work.deepDeferredIds = work.deepDeferredIds.filter((id) => reviewableIds.has(id));
  work.retryDeepIds = work.retryDeepIds.filter((id) => reviewableIds.has(id));
  work.verificationIds = work.verificationIds.filter((id) => reviewableIds.has(id));
  work.verificationCompletedIds = work.verificationCompletedIds.filter((id) => reviewableIds.has(id));
  work.verificationDeferredIds = work.verificationDeferredIds.filter((id) => reviewableIds.has(id));
  work.evidenceIds = work.evidenceIds.filter((id) => reviewableIds.has(id));
  work.evidenceCompletedIds = work.evidenceCompletedIds.filter((id) => reviewableIds.has(id));
  return before !== JSON.stringify({
    candidateIds: work.candidateIds,
    currentCandidateIds: work.currentCandidateIds,
    screenIds: work.screens.map((screen) => screen.canonicalId),
    deepIds: work.deepIds,
    deepCompletedIds: work.deepCompletedIds,
    deepDeferredIds: work.deepDeferredIds,
    retryDeepIds: work.retryDeepIds,
    verificationIds: work.verificationIds,
    verificationCompletedIds: work.verificationCompletedIds,
    verificationDeferredIds: work.verificationDeferredIds,
    evidenceIds: work.evidenceIds,
    evidenceCompletedIds: work.evidenceCompletedIds,
    rescueScreenIds: work.rescueScreenIds,
  });
}

function chooseDeepCandidateIds(candidates: Candidate[], screens: QuickScreen[], limit = DEEP_REVIEW_LIMIT) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const ranked = screens
    .filter((screen) => isPrimaryDeepCandidate(screen) && candidateById.has(screen.canonicalId))
    .sort((left, right) => deepCandidateScore(right) - deepCandidateScore(left));
  return selectDiverseItems(
    ranked,
    (screen) => candidateDirectionKey(candidateById.get(screen.canonicalId)!),
    (screen) => candidateById.get(screen.canonicalId)?.horizon || "days",
    limit,
    Math.ceil(limit / 2),
  ).map((screen) => screen.canonicalId);
}

function candidateHasReviewableEvidence(candidate: Candidate) {
  return candidate.title.trim().length >= 8
    && candidate.authors.trim().length >= 2
    && candidate.abstractText.trim().length >= 120
    && Boolean(candidate.publishedAt || candidate.venue.trim());
}

function chooseBudgetedDeepCandidateIds(
  candidates: Candidate[],
  screens: QuickScreen[],
  currentCandidateIds: Iterable<string>,
  limit = DEEP_REVIEW_LIMIT,
  pinnedIds: Iterable<string> = [],
  includeContinuity = false,
) {
  const currentIds = new Set(currentCandidateIds);
  const pinned = new Set(pinnedIds);
  const screenById = new Map(screens.map((screen) => [screen.canonicalId, screen]));
  const items = candidates.flatMap((candidate) => {
    const screen = screenById.get(candidate.canonicalId);
    const eligible = pinned.has(candidate.canonicalId) || Boolean(screen && (
      isPrimaryDeepCandidate(screen) || isRescueDeepCandidate(screen)
      || (includeContinuity && isContinuityDeepCandidate(screen))));
    if (!eligible) return [];
    const route = candidate.provenance.find(isMonitorRouteProvenance);
    const eligibilityBoost = screen && isPrimaryDeepCandidate(screen) ? 24 : screen && isRescueDeepCandidate(screen) ? 8 : 0;
    return [{
      canonicalId: candidate.canonicalId,
      score: (screen ? deepCandidateScore(screen) : 100) + candidateScreeningPriority(candidate) * 0.18 + eligibilityBoost,
      isCurrentDiscovery: currentIds.has(candidate.canonicalId),
      isRouteOrigin: Boolean(route),
      routeKey: route?.routeId || route?.sourceKey || "",
      directionKey: candidateDirectionKey(candidate),
      evidenceReady: candidateHasReviewableEvidence(candidate),
    }];
  });
  return selectBudgetedDeepReviewCandidates(items, { limit, pinnedIds: pinned }).map((item) => item.canonicalId);
}

function deepSelectionOrigin(candidate: Candidate, currentCandidateIds: Set<string>): "fresh" | "route" | "backlog" {
  if (currentCandidateIds.has(candidate.canonicalId)) return "fresh";
  return candidate.provenance.some(isMonitorRouteProvenance) ? "route" : "backlog";
}

function updateDeepSelectionDiagnostics(work: ScanWorkQueue, candidates: Candidate[]) {
  const currentIds = new Set(work.currentCandidateIds);
  const candidateById = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  work.deepSelectionOrigins = Object.fromEntries(work.deepIds.flatMap((id) => {
    const candidate = candidateById.get(id);
    return candidate ? [[id, deepSelectionOrigin(candidate, currentIds)] as const] : [];
  }));
  work.selectionFailureReasons = summarizeDeepSelectionOutcomes({
    candidates: candidates.map((candidate) => ({
      canonicalId: candidate.canonicalId,
      evidenceReady: candidateHasReviewableEvidence(candidate),
    })),
    screens: work.screens,
    selectedIds: work.deepIds,
    duplicateCount: Math.max(0, work.rawCandidateCount - work.newCandidateCount),
  });
}

function chooseRescueScreenIds(candidates: Candidate[], screens: QuickScreen[], limit = RESCUE_SCREEN_LIMIT) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const ranked = screens
    .filter((screen) => isRescueDeepCandidate(screen) && candidateById.has(screen.canonicalId))
    .sort((left, right) => deepCandidateScore(right) - deepCandidateScore(left));
  return selectDiverseItems(
    ranked,
    (screen) => candidateDirectionKey(candidateById.get(screen.canonicalId)!),
    (screen) => candidateById.get(screen.canonicalId)?.horizon || "days",
    limit,
  ).map((screen) => screen.canonicalId);
}

async function loadCachedQuickScreens(database: D1Database, spaceId: string, canonicalIds: string[]) {
  if (!canonicalIds.length) return [] as QuickScreen[];
  const uniqueIds = Array.from(new Set(canonicalIds)).slice(0, CANDIDATE_WORK_QUEUE_LIMIT);
  const rows = await database.prepare(
    `SELECT p.canonical_id, p.horizon, i.llm_relevance_score, i.quality_score, i.screening_reason
     FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
     WHERE p.space_id = ? AND (i.analysis_source IN ('deepseek_screened', 'deepseek_verification_pending')
       OR (i.analysis_source = 'deepseek_rejected' AND i.verification_status = 'degraded'
         AND (lower(i.screening_reason) LIKE '%timeout%' OR lower(i.screening_reason) LIKE '%aborted%'
           OR lower(i.screening_reason) LIKE '%temporarily unavailable%'
           OR lower(i.screening_reason) LIKE '%draft is empty%'
           OR lower(i.screening_reason) LIKE '%empty draft%'
           OR lower(i.screening_reason) LIKE '%no populated substantive fields%'
           OR lower(i.screening_reason) LIKE '%draft incomplete%'))) AND i.analysis_model = ?
       AND p.canonical_id IN (${uniqueIds.map(() => "?").join(", ")})`,
  ).bind(spaceId, MONITOR_MODEL, ...uniqueIds).all<{
    canonical_id: string; horizon: Horizon; llm_relevance_score: number; quality_score: number; screening_reason: string;
  }>();
  return rows.results.map((row) => ({
    canonicalId: row.canonical_id,
    isPaper: true,
    relevanceScore: row.llm_relevance_score,
    qualityScore: row.quality_score,
    screeningReason: row.screening_reason,
    horizon: row.horizon,
  }));
}

async function loadPersistedReviews(database: D1Database, spaceId: string, canonicalIds: string[]) {
  if (!canonicalIds.length) return [] as PaperReview[];
  const placeholders = canonicalIds.map(() => "?").join(", ");
  const rows = await database.prepare(
    `SELECT p.canonical_id, i.analysis_source, i.llm_recommended, i.llm_relevance_score, i.quality_score,
     i.summary_zh, i.summary_en, i.why_read_zh, i.why_read_en, i.screening_reason,
     COALESCE(i.proposed_recommendation_tier, i.recommendation_tier, 'browse') AS proposed_recommendation_tier,
     COALESCE(i.proposed_recommendation_tier, i.recommendation_tier, 'browse') AS recommendation_tier,
     i.read_minutes, i.read_depth, i.problem_zh, i.problem_en,
     i.method_zh, i.method_en, i.contribution_zh, i.contribution_en, i.limitations_zh,
     i.limitations_en, i.reading_focus_zh, i.reading_focus_en, i.research_questions_zh, i.research_questions_en,
     COALESCE(i.research_problem_id, '') AS research_problem_id, COALESCE(i.problem_fit_score, 0) AS problem_fit_score,
     COALESCE(i.uncertainty_reduction_score, 0) AS uncertainty_reduction_score,
     COALESCE(i.actionability_score, 0) AS actionability_score,
     COALESCE(i.research_problem_impact_zh, '') AS research_problem_impact_zh,
     COALESCE(i.research_problem_impact_en, '') AS research_problem_impact_en,
     COALESCE(i.research_decision_zh, '') AS research_decision_zh,
     COALESCE(i.research_decision_en, '') AS research_decision_en,
     COALESCE(i.verification_status, 'not_required') AS verification_status,
     COALESCE(i.verification_coverage_score, 0) AS verification_coverage_score,
     COALESCE(i.verification_json, '{}') AS verification_json,
     COALESCE(ed.evidence_level, CASE WHEN length(trim(i.abstract_text)) > 0 THEN 'abstract' ELSE 'metadata' END) AS evidence_level,
     COALESCE(ed.status, 'unavailable') AS evidence_status,
     COALESCE(ed.grounded_claim_count, 0) AS evidence_grounded_claims,
     COALESCE(ed.unsupported_claim_count, 0) AS evidence_unsupported_claims,
     COALESCE(ed.coverage_score, 0) AS evidence_coverage_score,
     COALESCE((SELECT ep.track_id FROM research_map_evidence_proposals ep
       WHERE ep.space_id = p.space_id AND ep.paper_id = p.id AND ep.status IN ('pending','confirmed')
       ORDER BY CASE ep.status WHEN 'confirmed' THEN 0 ELSE 1 END, ep.updated_at DESC LIMIT 1),
       (SELECT tp.track_id FROM research_track_papers tp
        WHERE tp.space_id = p.space_id AND tp.canonical_id = p.canonical_id ORDER BY tp.position LIMIT 1), '') AS track_id,
     COALESCE((SELECT ep.map_role FROM research_map_evidence_proposals ep
       WHERE ep.space_id = p.space_id AND ep.paper_id = p.id AND ep.status IN ('pending','confirmed')
       ORDER BY CASE ep.status WHEN 'confirmed' THEN 0 ELSE 1 END, ep.updated_at DESC LIMIT 1),
       (SELECT tp.role FROM research_track_papers tp
        WHERE tp.space_id = p.space_id AND tp.canonical_id = p.canonical_id ORDER BY tp.position LIMIT 1), 'frontier') AS map_role,
     COALESCE((SELECT ep.rationale_zh FROM research_map_evidence_proposals ep
       WHERE ep.space_id = p.space_id AND ep.paper_id = p.id AND ep.status IN ('pending','confirmed')
       ORDER BY CASE ep.status WHEN 'confirmed' THEN 0 ELSE 1 END, ep.updated_at DESC LIMIT 1),
       (SELECT tp.rationale_zh FROM research_track_papers tp
        WHERE tp.space_id = p.space_id AND tp.canonical_id = p.canonical_id ORDER BY tp.position LIMIT 1), '') AS map_rationale_zh,
     COALESCE((SELECT ep.rationale_en FROM research_map_evidence_proposals ep
       WHERE ep.space_id = p.space_id AND ep.paper_id = p.id AND ep.status IN ('pending','confirmed')
       ORDER BY CASE ep.status WHEN 'confirmed' THEN 0 ELSE 1 END, ep.updated_at DESC LIMIT 1),
       (SELECT tp.rationale_en FROM research_track_papers tp
        WHERE tp.space_id = p.space_id AND tp.canonical_id = p.canonical_id ORDER BY tp.position LIMIT 1), '') AS map_rationale_en
     FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
     LEFT JOIN paper_evidence_documents ed ON ed.paper_id = p.id AND ed.space_id = p.space_id
     WHERE p.space_id = ? AND p.canonical_id IN (${placeholders})`,
  ).bind(spaceId, ...canonicalIds).all<{
    canonical_id: string; analysis_source: string; llm_recommended: number; llm_relevance_score: number; quality_score: number;
    summary_zh: string; summary_en: string; why_read_zh: string; why_read_en: string; screening_reason: string;
    proposed_recommendation_tier: string; recommendation_tier: string; read_minutes: number; read_depth: string; problem_zh: string; problem_en: string;
    method_zh: string; method_en: string; contribution_zh: string; contribution_en: string; limitations_zh: string;
    limitations_en: string; reading_focus_zh: string; reading_focus_en: string; research_questions_zh: string; research_questions_en: string;
    research_problem_id: string; problem_fit_score: number; uncertainty_reduction_score: number; actionability_score: number;
    research_problem_impact_zh: string; research_problem_impact_en: string; research_decision_zh: string; research_decision_en: string;
    verification_status: EvidenceVerificationStatus; verification_coverage_score: number; verification_json: string;
    evidence_level: PaperReview["evidenceLevel"]; evidence_status: PaperReview["evidenceStatus"];
    evidence_grounded_claims: number; evidence_unsupported_claims: number; evidence_coverage_score: number;
    track_id: string; map_role: string; map_rationale_zh: string; map_rationale_en: string;
  }>();
  const byId = new Map(rows.results.map((row) => [row.canonical_id, row]));
  return canonicalIds.flatMap((canonicalId) => {
    const row = byId.get(canonicalId);
    if (!row || !["deepseek", "deepseek_rejected", "deepseek_verification_pending"].includes(row.analysis_source)) return [];
    const verificationRetryable = row.analysis_source === "deepseek_verification_pending";
    const tier: PaperReview["recommendationTier"] = row.recommendation_tier === "must_read" || row.recommendation_tier === "reserve" ? row.recommendation_tier : "browse";
    const proposedTier: PaperReview["proposedRecommendationTier"] = row.proposed_recommendation_tier === "must_read" || row.proposed_recommendation_tier === "reserve" ? row.proposed_recommendation_tier : "browse";
    const depth: PaperReview["readDepth"] = row.read_depth === "deep" || row.read_depth === "overview" ? row.read_depth : "focused";
    return [{
      canonicalId, isPaper: true, recommended: verificationRetryable || Boolean(row.llm_recommended), relevanceScore: row.llm_relevance_score,
      qualityScore: row.quality_score, summaryZh: row.summary_zh, summaryEn: row.summary_en, whyReadZh: row.why_read_zh,
      whyReadEn: row.why_read_en, screeningReason: row.screening_reason, trackId: row.track_id,
      mapRole: paperReviewMapRole(row.map_role),
      mapRationaleZh: row.map_rationale_zh, mapRationaleEn: row.map_rationale_en,
      recommendationTier: tier, readMinutes: row.read_minutes, readDepth: depth,
      problemZh: row.problem_zh, problemEn: row.problem_en, methodZh: row.method_zh, methodEn: row.method_en,
      contributionZh: row.contribution_zh, contributionEn: row.contribution_en, limitationsZh: row.limitations_zh,
      limitationsEn: row.limitations_en, readingFocusZh: row.reading_focus_zh, readingFocusEn: row.reading_focus_en,
      researchQuestionsZh: parseVenues(row.research_questions_zh), researchQuestionsEn: parseVenues(row.research_questions_en),
      researchProblemId: row.research_problem_id, problemFitScore: row.problem_fit_score,
      uncertaintyReductionScore: row.uncertainty_reduction_score, actionabilityScore: row.actionability_score,
      researchProblemImpactZh: row.research_problem_impact_zh, researchProblemImpactEn: row.research_problem_impact_en,
      researchDecisionZh: row.research_decision_zh, researchDecisionEn: row.research_decision_en,
      verificationStatus: row.verification_status, verificationCoverageScore: row.verification_coverage_score,
      verificationReport: parseJsonObject(row.verification_json || "{}"),
      verificationInputTokens: 0, verificationOutputTokens: 0,
      verificationRetryable,
      proposedRecommendationTier: proposedTier,
      evidenceLevel: row.evidence_level,
      evidenceStatus: row.evidence_status,
      evidenceGroundedClaims: row.evidence_grounded_claims,
      evidenceUnsupportedClaims: row.evidence_unsupported_claims,
      evidenceCoverageScore: row.evidence_coverage_score,
    }];
  });
}

async function runIncrementalDeepReview(
  database: D1Database,
  space: SpaceRow,
  userId: string,
  priorityVenues: string[],
  candidates: Candidate[],
  jobId: string,
  lockToken: string,
  apiKey: string,
  onReviewsSaved: (reviews: PaperReview[]) => Promise<void>,
) {
  const queue = candidates.slice(0, DEEP_REVIEW_CONCURRENCY);
  if (!queue.length) return { reviews: [] as PaperReview[], errors: [] as unknown[], failedIds: [] as string[] };
  let saveQueue = Promise.resolve();
  const settled = await settleFaultTolerantBatch(
    queue,
    (candidate) => reviewCandidates(database, space, userId, priorityVenues, [candidate], jobId, lockToken, apiKey),
    async (_candidate, reviews) => {
      if (!reviews.length) return;
      saveQueue = saveQueue.then(() => onReviewsSaved(reviews));
      await saveQueue;
    },
  );
  return {
    reviews: settled.successes.flatMap((result) => Array.isArray(result.value) ? result.value : []),
    errors: settled.failures.map((result) => result.error),
    failedIds: settled.failures.map((result) => result.item.canonicalId),
  };
}

async function runLegacyMonitor(request: Request) {
  try {
    const payload = await request.json() as { spaceId?: string; force?: boolean; trigger?: ScanTrigger };
    const spaceId = payload.spaceId?.trim() || "";
    if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    const { database, space, user } = context;
    const apiKey = resolveDeepSeekCredential(request).apiKey;
    const trigger: ScanTrigger = payload.trigger === "scheduled" || payload.trigger === "manual" || payload.trigger === "visit"
      ? payload.trigger : payload.force ? "manual" : "visit";
    const preference = await ensurePreference(database, space);
    const enrichedSpace = await enrichSpaceWithImportedMemory(database, space);
    const previous = await database.prepare("SELECT status, last_run_at, next_run_at, updated_at, discovery_round, lock_token, lock_expires_at FROM monitor_runs WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<{ status: string; last_run_at: string | null; next_run_at: string | null; updated_at: string; discovery_round: number; lock_token: string | null; lock_expires_at: string | null }>();
    const previousTime = previous?.last_run_at ? Date.parse(previous.last_run_at) : 0;
    const now = new Date();
    const discoveryRound = Math.max(0, previous?.discovery_round || 0);
    const runUpdatedAt = previous?.updated_at ? databaseTime(previous.updated_at) : 0;
    const lockExpiry = previous?.lock_expires_at ? Date.parse(previous.lock_expires_at) : 0;
    if (previous?.lock_token && lockExpiry > now.getTime()) {
      return Response.json(await readState(database, space, { cached: true, alreadyRunning: true }));
    }
    if (previous && !["idle", "ready", "error"].includes(previous.status) && now.getTime() - runUpdatedAt < STALE_RUN_MS) {
      return Response.json(await readState(database, space, { cached: true, alreadyRunning: true }));
    }
    const retryTime = previous?.next_run_at ? Date.parse(previous.next_run_at) : 0;
    if (!payload.force && previous?.status === "error" && retryTime > now.getTime()) {
      return Response.json(await readState(database, space, { cached: true, retryScheduled: true }));
    }
    const minimumAge = payload.force ? MANUAL_COOLDOWN_MS : CADENCE_MS;
    if (previousTime >= MONITOR_LLM_REVIEW_RELEASED_AT && now.getTime() - previousTime < minimumAge) {
      return Response.json(await readState(database, space, {
        cached: true,
        throttled: Boolean(payload.force),
        retryAfterMinutes: Math.max(1, Math.ceil((minimumAge - (now.getTime() - previousTime)) / 60_000)),
      }));
    }

    const previousJob = await database.prepare(
      "SELECT id, status, attempt FROM monitor_scan_jobs WHERE space_id = ? ORDER BY started_at DESC LIMIT 1",
    ).bind(space.id).first<{ id: string; status: string; attempt: number }>();
    const resumable = Boolean(previousJob && previousJob.status !== "ready");
    const lockToken = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    await database.prepare(
      "INSERT OR IGNORE INTO monitor_runs (id, space_id, status, last_trigger, updated_at) VALUES (?, ?, 'idle', ?, CURRENT_TIMESTAMP)",
    ).bind(crypto.randomUUID(), space.id, trigger).run();
    await database.prepare(
      `UPDATE monitor_runs SET status = 'scanning', lock_token = ?, lock_expires_at = ?, last_trigger = ?,
       error = NULL, new_count = 0, scanned_count = 0, updated_at = CURRENT_TIMESTAMP
       WHERE space_id = ? AND (lock_token IS NULL OR lock_expires_at IS NULL OR datetime(lock_expires_at) <= CURRENT_TIMESTAMP)`,
    ).bind(lockToken, new Date(now.getTime() + RUN_LOCK_LEASE_MS).toISOString(), trigger, space.id).run();
    const acquired = await database.prepare("SELECT lock_token FROM monitor_runs WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<{ lock_token: string | null }>();
    if (acquired?.lock_token !== lockToken) {
      return Response.json(await readState(database, space, { cached: true, alreadyRunning: true }));
    }
    try {
      await database.prepare(
        `INSERT INTO monitor_scan_jobs
         (id, space_id, status, progress, discovered_count, reviewed_count, recommended_count,
          attempt, trigger_source, resume_of_job_id, checkpoint)
         VALUES (?, ?, 'scanning', 4, 0, 0, 0, ?, ?, ?, 'scanning')`,
      ).bind(jobId, space.id, resumable ? Math.max(2, (previousJob?.attempt || 1) + 1) : 1, trigger, resumable ? previousJob?.id || null : null).run();
      await setScanSource(database, jobId, "days", "DeepSeek Pro · daily query plan", 6, 0);
      const queryPlan = await ensureDailyQueryPlan(database, enrichedSpace, user.userId, preference, apiKey);
      const batches: Array<{ candidates: Candidate[]; rawCount: number }> = [];
      let discoveredCount = 0;
      for (const horizon of HORIZONS) {
        await updateRunPhase(database, space.id, jobId, lockToken, `discovering_${horizon.key}`, discoveredCount);
        const batch = await fetchHorizon(database, enrichedSpace, horizon, now, preference.priorityVenues, preference.trackedAuthors, preference.profileKey, discoveryRound, jobId, discoveredCount, queryPlan);
        batches.push(batch);
        discoveredCount += batch.candidates.length;
        await updateRunPhase(database, space.id, jobId, lockToken, `discovering_${horizon.key}`, discoveredCount);
      }
      await updateRunPhase(database, space.id, jobId, lockToken, "deduplicating", discoveredCount);
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
      await updateRunPhase(database, space.id, jobId, lockToken, "reviewing", scannedCount);
      const reviews = await reviewCandidates(database, enrichedSpace, user.userId, preference.priorityVenues, pendingCandidates, jobId, lockToken, apiKey);

      const newCount = reviews.filter(isPublishedRecommendation).length;
      const rejectedCount = reviews.length - newCount;
      await updateRunPhase(database, space.id, jobId, lockToken, "saving", scannedCount, newCount);

      const completedAt = new Date();
      await updateRunPhase(database, space.id, jobId, lockToken, "briefing", scannedCount, newCount);
      await generateDailyBrief(database, enrichedSpace, user.userId, jobId, pendingCandidates, reviews, {
        scanned: scannedCount,
        newCandidates: newCandidateCount,
        duplicates: duplicateCount,
        reviewed: reviews.length,
        verificationPending: reviews.filter((review) => review.verificationRetryable).length,
        verificationFailed: reviews.filter((review) => review.verificationStatus === "degraded").length,
        recommended: newCount,
        rejected: rejectedCount,
      }, completedAt, apiKey);
      try {
        await createScanNotifications(database, space.id, shanghaiDateKey(completedAt), reviews, {
          scanned: scannedCount,
          newCandidates: newCandidateCount,
          duplicates: duplicateCount,
          reviewed: reviews.length,
          recommended: newCount,
          rejected: rejectedCount,
        }, resumable);
        await maybeGenerateWeeklyReview(database, enrichedSpace, user.userId, completedAt, apiKey);
      } catch (supplementalError) {
        // Catch-up notifications and weekly synthesis enrich a completed scan, but must never
        // turn successfully discovered and reviewed papers into a failed monitoring run.
        console.error("Failed to build supplemental research review", supplementalError);
      }
      await database.batch([
        database.prepare(
          "UPDATE monitor_runs SET status = 'ready', last_run_at = ?, next_run_at = ?, new_count = ?, scanned_count = ?, discovery_round = discovery_round + 1, lock_token = NULL, lock_expires_at = NULL, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND lock_token = ?",
        ).bind(completedAt.toISOString(), new Date(completedAt.getTime() + CADENCE_MS).toISOString(), newCount, scannedCount, space.id, lockToken),
        database.prepare(
          "UPDATE monitor_scan_jobs SET status = 'ready', checkpoint = 'complete', current_horizon = '', current_source = '', progress = 100, discovered_count = ?, new_candidate_count = ?, duplicate_count = ?, reviewed_count = ?, recommended_count = ?, rejected_count = ?, completed_at = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(scannedCount, newCandidateCount, duplicateCount, reviews.length, newCount, rejectedCount, completedAt.toISOString(), jobId),
      ]);
      return Response.json(await readState(database, space, { cached: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Monitoring scan failed";
      const failedAt = new Date();
      await database.batch([
        database.prepare("UPDATE monitor_runs SET status = 'error', next_run_at = ?, lock_token = NULL, lock_expires_at = NULL, error = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND lock_token = ?")
          .bind(new Date(failedAt.getTime() + ERROR_RETRY_MS).toISOString(), message, space.id, lockToken),
        database.prepare("UPDATE monitor_scan_jobs SET status = 'error', checkpoint = 'retry_pending', error = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(message, failedAt.toISOString(), jobId),
      ]);
      return Response.json(await readState(database, space), { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to run monitoring" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let payload: { spaceId?: string; force?: boolean; trigger?: ScanTrigger; action?: "start" | "advance" | "enhance" | "legacy"; jobId?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid monitoring request" }, { status: 400 });
  }
  if (payload.action === "legacy") return runLegacyMonitor(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(payload) }));
  const spaceId = payload.spaceId?.trim() || "";
  if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
  const context = await ownedSpace(request, spaceId);
  if ("error" in context) return context.error;
  const { database, space, user } = context;
  const apiKey = resolveDeepSeekCredential(request).apiKey;
  const action = payload.action || "start";
  const trigger: ScanTrigger = payload.trigger === "scheduled" || payload.trigger === "manual" || payload.trigger === "visit"
    ? payload.trigger : payload.force ? "manual" : "visit";
  let advanceLockJobId = "";
  let advanceLockToken = "";
  const enforceAnalysisBudget = async (minimumCalls: number) => {
    const budget = await readMonitorAnalysisBudget(database, user.userId, space.id, minimumCalls);
    if (budget.available) return null;
    if (trigger === "scheduled") await deferMonitorAutomation(database, space.id, budget.resetsAt);
    const state = await readState(database, space, {
      cached: true,
      throttled: true,
      quotaActionRequired: trigger === "manual",
      automationDeferred: trigger === "scheduled",
    });
    if (trigger !== "manual") return Response.json(state);
    return Response.json({ ...state, error: "monitor_analysis_budget_insufficient" }, { status: 429 });
  };
  const rejectUnavailableModel = async (error: unknown, job?: {
    id: string;
    checkpoint: string;
    work_queue_json: string;
  }) => {
    const message = normalizedDeepSeekProbeError(error).slice(0, 300);
    const failedAt = new Date();
    const statements = [database.prepare(
      `UPDATE monitor_runs SET status = 'error', next_run_at = ?, lock_token = NULL, lock_expires_at = NULL,
       error = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?`,
    ).bind(new Date(failedAt.getTime() + ERROR_RETRY_MS).toISOString(), message, space.id)];
    let resumableCheckpoint = "planning";
    if (job) {
      const work = parseScanWorkQueue(job.work_queue_json);
      resumableCheckpoint = RESUMABLE_SCAN_CHECKPOINTS.has(job.checkpoint)
        ? job.checkpoint : inferResumeCheckpoint({ checkpoint: job.checkpoint, current_source: "" }, work);
      work.resumeCheckpoint = resumableCheckpoint;
      statements.push(database.prepare(
        `UPDATE monitor_scan_jobs SET status = 'error', checkpoint = 'retry_pending',
         current_source = '模型连接检查未通过，扫描尚未继续', work_queue_json = ?, error = ?, completed_at = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(JSON.stringify(work), message, failedAt.toISOString(), job.id));
    }
    await database.batch(statements);
    if (trigger === "scheduled") await pauseMonitorAutomation(database, space.id, "model_unavailable");
    await recordReliabilityEvent(database, {
      spaceId: space.id,
      scanJobId: job?.id || null,
      kind: "model_preflight_failed",
      stage: resumableCheckpoint,
      source: trigger,
      outcome: "failed",
      errorCode: monitorErrorCode(message),
      message,
      metadata: { stoppedBeforeDiscovery: resumableCheckpoint === "planning", checkpointPreserved: Boolean(job) },
    });
    const state = await readState(database, space, {
      cached: true,
      credentialActionRequired: isNonRetryableDeepSeekError(message),
    });
    return Response.json({ ...state, error: message }, { status: 502 });
  };
  const preflightModel = async (job?: { id: string; checkpoint: string; work_queue_json: string }) => {
    try {
      await verifyDeepSeekCredential(apiKey);
      return null;
    } catch (error) {
      return rejectUnavailableModel(error, job);
    }
  };

  try {
    if (action === "start") {
      await database.prepare(
        `INSERT OR IGNORE INTO monitor_runs
         (id, space_id, status, last_trigger, last_user_activity_at, updated_at)
         VALUES (?, ?, 'idle', ?, ?, CURRENT_TIMESTAMP)`,
      ).bind(crypto.randomUUID(), space.id, trigger, trigger === "scheduled" ? null : new Date().toISOString()).run();
      if (trigger !== "scheduled") {
        await database.prepare(
          `UPDATE monitor_runs SET last_user_activity_at = CURRENT_TIMESTAMP, scheduled_runs_since_activity = 0,
           automation_paused_at = NULL, automation_pause_reason = '', updated_at = CURRENT_TIMESTAMP WHERE space_id = ?`,
        ).bind(space.id).run();
      }
      if (!apiKey) {
        if (trigger === "scheduled") {
          await pauseMonitorAutomation(database, space.id, "model_unavailable");
          return Response.json(await readState(database, space, { cached: true, automationPaused: true }));
        }
        return Response.json({ error: "请先在网页中连接 DeepSeek API Key" }, { status: 400 });
      }
      await ensurePreference(database, space);
      const previous = await database.prepare(
        "SELECT status, last_run_at, next_run_at, updated_at, discovery_round, lock_token, lock_expires_at, last_user_activity_at, scheduled_runs_since_activity FROM monitor_runs WHERE space_id = ? LIMIT 1",
      ).bind(space.id).first<{ status: string; last_run_at: string | null; next_run_at: string | null; updated_at: string; discovery_round: number; lock_token: string | null; lock_expires_at: string | null; last_user_activity_at: string | null; scheduled_runs_since_activity: number }>();
      const activeJob = await database.prepare(
        "SELECT id, status, checkpoint, work_queue_json FROM monitor_scan_jobs WHERE space_id = ? AND status NOT IN ('ready', 'error') ORDER BY started_at DESC LIMIT 1",
      ).bind(space.id).first<{ id: string; status: string; checkpoint: string; work_queue_json: string }>();
      const now = new Date();
      const lockExpiry = previous?.lock_expires_at ? Date.parse(previous.lock_expires_at) : 0;
      if (activeJob && previous && !["idle", "ready", "error"].includes(previous.status)) {
        const quotaResponse = await enforceAnalysisBudget(minimumAnalysisCallsForCheckpoint(activeJob.checkpoint));
        if (quotaResponse) return quotaResponse;
        if (previous.lock_token && lockExpiry > now.getTime()) {
          return Response.json(await readState(database, space, { cached: true, alreadyRunning: true }), { status: 202 });
        }
        if (trigger !== "scheduled") {
          const modelResponse = await preflightModel(activeJob);
          if (modelResponse) return modelResponse;
        }
        const resumedLock = crypto.randomUUID();
        await database.prepare(
          "UPDATE monitor_runs SET lock_token = ?, lock_expires_at = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?",
        ).bind(resumedLock, new Date(now.getTime() + RUN_LOCK_LEASE_MS).toISOString(), space.id).run();
        return Response.json(await readState(database, space, { cached: true, alreadyRunning: true }), { status: 202 });
      }
      if (trigger !== "manual") {
        const counters = await readAutomationCounters(database, space.id);
        const pauseReason = monitorAutomationPauseReason({
          ...counters,
          lastUserActivityAt: previous?.last_user_activity_at || null,
          scheduledRunsSinceActivity: previous?.scheduled_runs_since_activity || 0,
          now: now.getTime(),
        }) as AutomationPauseReason | null;
        if (pauseReason) {
          if (pauseReason === "daily_budget") {
            const budget = await readMonitorAnalysisBudget(database, user.userId, space.id, 1);
            await deferMonitorAutomation(database, space.id, budget.resetsAt);
            return Response.json(await readState(database, space, { cached: true, automationDeferred: true }));
          }
          await pauseMonitorAutomation(database, space.id, pauseReason);
          return Response.json(await readState(database, space, { cached: true, automationPaused: true }));
        }
      }
      const previousJob = await database.prepare(
        `SELECT id, status, current_horizon, current_source, progress, discovered_count, new_candidate_count,
         duplicate_count, reviewed_count, recommended_count, rejected_count, attempt, trigger_source,
         resume_of_job_id, checkpoint, work_queue_json, first_recommendation_at, started_at, completed_at, error
         FROM monitor_scan_jobs WHERE space_id = ? ORDER BY started_at DESC LIMIT 1`,
      ).bind(space.id).first<StagedJobRow>();
      if (trigger !== "manual" && previousJob?.status === "error" && isNonRetryableDeepSeekError(previousJob.error)) {
        if (trigger === "scheduled") await pauseMonitorAutomation(database, space.id, "model_unavailable");
        return Response.json(await readState(database, space, { cached: true, credentialActionRequired: true }));
      }
      const previousWork = parseScanWorkQueue(previousJob?.work_queue_json);
      const pipelineOutdated = Boolean(previousJob && !COMPATIBLE_MONITOR_PIPELINE_VERSIONS.has(previousWork.pipelineVersion));
      const verificationCarryover = Boolean(!pipelineOutdated && previousJob?.status === "ready"
        && previousWork.verificationDeferredIds.length);
      const previousDeepReviews = !pipelineOutdated && previousJob?.status === "ready" && previousWork.deepIds.length
        ? await loadPersistedReviews(database, space.id, previousWork.deepIds)
        : [];
      const incompleteDraftCarryoverIds = previousDeepReviews
        .filter((review) => isRetryableEmptyDraftDegradation(review))
        .map((review) => review.canonicalId)
        .filter((canonicalId) => (previousWork.draftRegenerationAttempts[canonicalId] || 0) < INCOMPLETE_DRAFT_REGENERATION_LIMIT);
      const incompleteDraftCarryover = Boolean(incompleteDraftCarryoverIds.length);
      const qualityCarryover = verificationCarryover || incompleteDraftCarryover;
      const previousTime = previous?.last_run_at ? Date.parse(previous.last_run_at) : 0;
      const minimumAge = payload.force ? MANUAL_COOLDOWN_MS : CADENCE_MS;
      if (!qualityCarryover && !pipelineOutdated && previousJob?.status !== "error" && previousTime >= MONITOR_LLM_REVIEW_RELEASED_AT && now.getTime() - previousTime < minimumAge) {
        return Response.json(await readState(database, space, {
          cached: true,
          throttled: Boolean(payload.force),
          retryAfterMinutes: Math.max(1, Math.ceil((minimumAge - (now.getTime() - previousTime)) / 60_000)),
        }));
      }
      const lockToken = crypto.randomUUID();
      const jobId = crypto.randomUUID();
      const resumeCheckpoint = previousJob?.status === "error" && !pipelineOutdated
        ? inferResumeCheckpoint(previousJob, previousWork)
        : incompleteDraftCarryover ? "deep_reviewing"
          : verificationCarryover ? "verifying_recommendations" : "planning";
      const resumable = Boolean(!pipelineOutdated && resumeCheckpoint !== "planning"
        && (previousJob?.status === "error" || qualityCarryover));
      const quotaResponse = await enforceAnalysisBudget(resumable
        ? minimumAnalysisCallsForCheckpoint(resumeCheckpoint)
        : MONITOR_MINIMUM_NEW_SCAN_ANALYSIS_CALLS);
      if (quotaResponse) return quotaResponse;
      if (trigger !== "scheduled") {
        const modelResponse = await preflightModel(resumable && previousJob?.status === "error"
          ? { id: previousJob.id, checkpoint: resumeCheckpoint, work_queue_json: previousJob.work_queue_json }
          : undefined);
        if (modelResponse) return modelResponse;
      }
      if (resumable) {
        previousWork.resumeCheckpoint = "";
        previousWork.screenFailureCount = 0;
        previousWork.deepFailureCount = 0;
        previousWork.verificationFailureCount = 0;
        if (verificationCarryover) {
          previousWork.verificationDeferredIds = [];
          previousWork.verificationAttempts = {};
        }
        if (incompleteDraftCarryoverIds.length) {
          const retryIds = new Set(incompleteDraftCarryoverIds);
          previousWork.deepIds = Array.from(new Set([...previousWork.deepIds, ...incompleteDraftCarryoverIds])).slice(0, DEEP_REVIEW_MAX_LIMIT);
          previousWork.deepCompletedIds = previousWork.deepCompletedIds.filter((id) => !retryIds.has(id));
          previousWork.deepDeferredIds = previousWork.deepDeferredIds.filter((id) => !retryIds.has(id));
          previousWork.verificationIds = previousWork.verificationIds.filter((id) => !retryIds.has(id));
          previousWork.verificationCompletedIds = previousWork.verificationCompletedIds.filter((id) => !retryIds.has(id));
          previousWork.verificationDeferredIds = previousWork.verificationDeferredIds.filter((id) => !retryIds.has(id));
          for (const id of retryIds) delete previousWork.verificationAttempts[id];
        }
      }
      const initialCheckpoint = resumable ? resumeCheckpoint : "planning";
      const initialWork = resumable ? previousWork : newScanWorkQueue();
      if (!resumable && previousJob?.status === "ready" && previousWork.deepDeferredIds.length) {
        initialWork.retryDeepIds = previousWork.deepDeferredIds.slice(0, DEEP_REVIEW_CARRYOVER_LIMIT);
      }
      const initialStatus = statusForCheckpoint(initialCheckpoint);
      const initialProgress = resumable ? Math.max(previousJob?.progress || 3, monitorProgressByCheckpoint(initialCheckpoint)) : 3;
      const initialSource = resumable
        ? initialCheckpoint === "screening"
          ? `从已保存进度继续 · ${previousWork.screens.length} / ${previousWork.candidateIds.length} 篇已筛选`
          : initialCheckpoint === "evidence_deepening"
            ? "从已保存进度继续 · 正在跳过旧版原文核验阶段"
          : initialCheckpoint === "verifying_recommendations"
            ? `从已保存进度继续 · ${previousWork.verificationCompletedIds.length} / ${previousWork.verificationIds.length} 篇已完成证据核对`
          : initialCheckpoint === "deep_reviewing" || initialCheckpoint === "enriching_abstracts"
            ? `从已保存进度继续 · ${new Set([...previousWork.deepCompletedIds, ...previousWork.deepDeferredIds]).size} / ${previousWork.deepIds.length} 篇已处理`
            : "从已保存检查点继续本轮扫描"
        : "Pi 正在制定本轮检索计划";
      await database.prepare(
        `UPDATE monitor_runs SET status = ?, next_run_at = CURRENT_TIMESTAMP, lock_token = ?, lock_expires_at = ?, last_trigger = ?, error = NULL,
         new_count = ?, scanned_count = ?, scheduled_runs_since_activity = scheduled_runs_since_activity + ?,
         automation_paused_at = NULL, automation_pause_reason = '', updated_at = CURRENT_TIMESTAMP WHERE space_id = ?`,
      ).bind(initialStatus, lockToken, new Date(now.getTime() + RUN_LOCK_LEASE_MS).toISOString(), trigger,
        resumable ? previousJob?.recommended_count || 0 : 0, resumable ? previousJob?.discovered_count || 0 : 0,
        trigger === "scheduled" ? 1 : 0, space.id).run();
      await database.prepare(
        `INSERT INTO monitor_scan_jobs
         (id, space_id, status, current_horizon, current_source, progress, discovered_count, new_candidate_count,
          duplicate_count, reviewed_count, recommended_count, rejected_count, attempt, trigger_source,
          resume_of_job_id, checkpoint, work_queue_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(jobId, space.id, initialStatus, resumable ? previousJob?.current_horizon || "" : "", initialSource, initialProgress,
        resumable ? previousJob?.discovered_count || 0 : 0, resumable ? previousJob?.new_candidate_count || 0 : 0,
        resumable ? previousJob?.duplicate_count || 0 : 0, resumable ? previousJob?.reviewed_count || 0 : 0,
        resumable ? previousJob?.recommended_count || 0 : 0, resumable ? previousJob?.rejected_count || 0 : 0,
        resumable ? Math.max(2, (previousJob?.attempt || 1) + 1) : 1, trigger, resumable ? previousJob?.id || null : null,
         initialCheckpoint, JSON.stringify(initialWork)).run();
      await recordReliabilityEvent(database, {
        spaceId: space.id,
        scanJobId: jobId,
        kind: resumable ? "scan_resumed" : "scan_started",
        stage: initialCheckpoint,
        source: trigger,
        outcome: "info",
        metadata: { attempt: resumable ? Math.max(2, (previousJob?.attempt || 1) + 1) : 1, resumeOfJobId: resumable ? previousJob?.id || null : null },
      });
      return Response.json(await readState(database, space, { accepted: true }), { status: 202 });
    }

    const job = payload.jobId
      ? await database.prepare(
        `SELECT id, status, current_horizon, current_source, progress, discovered_count, new_candidate_count,
         duplicate_count, reviewed_count, recommended_count, rejected_count, attempt, trigger_source,
         resume_of_job_id, checkpoint, work_queue_json, first_recommendation_at, started_at, completed_at, error
         FROM monitor_scan_jobs WHERE id = ? AND space_id = ? LIMIT 1`,
      ).bind(payload.jobId, space.id).first<StagedJobRow>()
      : await database.prepare(
        `SELECT id, status, current_horizon, current_source, progress, discovered_count, new_candidate_count,
         duplicate_count, reviewed_count, recommended_count, rejected_count, attempt, trigger_source,
         resume_of_job_id, checkpoint, work_queue_json, first_recommendation_at, started_at, completed_at, error
         FROM monitor_scan_jobs WHERE space_id = ? ORDER BY started_at DESC LIMIT 1`,
      ).bind(space.id).first<StagedJobRow>();
    if (!job) return Response.json({ error: "No scan job is available" }, { status: 404 });
    const work = parseScanWorkQueue(job.work_queue_json);
    if (await pruneExplicitlyWithdrawnScanWork(database, space.id, work)) {
      await saveScanWorkQueue(database, job.id, work);
    }
    const preference = await ensurePreference(database, space);
    const enrichedSpace = await enrichSpaceWithImportedMemory(database, space);

    if (action === "enhance") {
      if (!["main_complete", "complete"].includes(job.checkpoint)) return Response.json(await readState(database, space, { enhancementPending: true }), { status: 202 });
      if (job.checkpoint === "complete") return Response.json(await readState(database, space, { enhanced: true }));
      const candidates = await pendingCandidateQueue(database, space.id, work.deepIds);
      const reviews = await loadPersistedReviews(database, space.id, work.deepCompletedIds);
      const completedAt = job.completed_at ? new Date(job.completed_at) : new Date();
      const recommendedCount = reviews.filter(isPublishedRecommendation).length;
      const completion = deepReviewCompletion({
        scheduled: work.deepIds.length,
        completed: reviews.length,
        deferred: work.deepDeferredIds.length,
        recommended: recommendedCount,
      });
      await generateDailyBrief(database, enrichedSpace, user.userId, job.id, candidates, reviews, {
        scanned: job.discovered_count,
        newCandidates: job.new_candidate_count,
        duplicates: job.duplicate_count,
        reviewed: reviews.length,
        screened: work.screens.length,
        deepScheduled: work.deepIds.length,
        deepReviewed: reviews.length,
        deepDeferred: work.deepDeferredIds.length,
        analysisUnavailable: completion.state === "analysis_unavailable" ? 1 : 0,
        verificationPending: reviews.filter((review) => review.verificationRetryable).length,
        verificationFailed: reviews.filter((review) => review.verificationStatus === "degraded").length,
        recommended: recommendedCount,
        rejected: Math.max(0, work.screens.length - recommendedCount),
      }, completedAt, apiKey);
      try {
        await maybeGenerateWeeklyReview(database, enrichedSpace, user.userId, completedAt, apiKey);
      } catch (supplementalError) {
        console.error("Failed to generate the non-blocking weekly review", supplementalError);
      }
      await database.prepare(
        "UPDATE monitor_scan_jobs SET checkpoint = 'complete', current_source = '', error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(job.id).run();
      return Response.json(await readState(database, space, { enhanced: true }));
    }

    if (action !== "advance") return Response.json({ error: "Unknown monitoring action" }, { status: 400 });
    if (!apiKey) return Response.json({ error: "请先在网页中连接 DeepSeek API Key" }, { status: 400 });
    if (["ready", "error"].includes(job.status)) return Response.json(await readState(database, space, { cached: true }));
    advanceLockToken = crypto.randomUUID();
    const advanceLock = await database.prepare(
      `UPDATE monitor_scan_jobs SET advance_lock_token = ?, advance_lock_expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND space_id = ? AND status NOT IN ('ready', 'error')
        AND (advance_lock_token IS NULL OR advance_lock_expires_at IS NULL OR datetime(advance_lock_expires_at) <= CURRENT_TIMESTAMP)`,
    ).bind(advanceLockToken, new Date(Date.now() + ADVANCE_LOCK_LEASE_MS).toISOString(), job.id, space.id).run();
    if (!Number(advanceLock.meta?.changes || 0)) {
      advanceLockToken = "";
      return Response.json(await readState(database, space, { cached: true, alreadyAdvancing: true }), { status: 202 });
    }
    advanceLockJobId = job.id;
    const run = await database.prepare(
      "SELECT status, discovery_round, lock_token, lock_expires_at FROM monitor_runs WHERE space_id = ? LIMIT 1",
    ).bind(space.id).first<{ status: string; discovery_round: number; lock_token: string | null; lock_expires_at: string | null }>();
    let lockToken = run?.lock_token || "";
    if (!lockToken || !run?.lock_expires_at || Date.parse(run.lock_expires_at) <= Date.now()) lockToken = crypto.randomUUID();
    await database.prepare(
      "UPDATE monitor_runs SET lock_token = ?, lock_expires_at = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?",
    ).bind(lockToken, new Date(Date.now() + RUN_LOCK_LEASE_MS).toISOString(), space.id).run();
    const stageStartedAt = Date.now();
    let firstRecommendationAt = job.first_recommendation_at;

    const setStage = async (checkpoint: string, status: string, progress: number, source: string, horizon = "") => {
      await database.batch([
        database.prepare(
          "UPDATE monitor_runs SET status = ?, lock_expires_at = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND lock_token = ?",
        ).bind(status, new Date(Date.now() + RUN_LOCK_LEASE_MS).toISOString(), space.id, lockToken),
        database.prepare(
          "UPDATE monitor_scan_jobs SET status = ?, checkpoint = ?, current_horizon = ?, current_source = ?, progress = MAX(progress, ?), error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(status, checkpoint, horizon, source, progress, job.id),
      ]);
      await recordReliabilityEvent(database, {
        spaceId: space.id,
        scanJobId: job.id,
        kind: checkpoint === job.checkpoint ? "checkpoint_retry" : "checkpoint_completed",
        stage: job.checkpoint,
        source: job.current_source,
        outcome: checkpoint === job.checkpoint ? "degraded" : "success",
        durationMs: Date.now() - stageStartedAt,
        metadata: { nextCheckpoint: checkpoint, progress, horizon },
      });
    };

    const finalizeMain = async (candidates: Candidate[], reviews: PaperReview[]) => {
      const completedAt = new Date();
      const reviewableIds = new Set(candidates.map((candidate) => candidate.canonicalId));
      const reviewableReviews = reviews.filter((review) => reviewableIds.has(review.canonicalId));
      const reconciledReviews = await reconcileRecommendedReviewTracks(database, enrichedSpace, user.userId, candidates, reviewableReviews, apiKey);
      // Re-run the guarded persistence even when route reconciliation made no
      // change: a user may have withdrawn a paper while that LLM call was in flight.
      const finalizedReviews = await persistReviewBatch(database, space.id, job.id, candidates, reconciledReviews);
      const recommended = finalizedReviews.filter(isPublishedRecommendation).length;
      const verificationPending = finalizedReviews.filter((review) => review.verificationRetryable).length;
      const verificationFailed = finalizedReviews.filter((review) => review.verificationStatus === "degraded").length;
      const completion = deepReviewCompletion({
        scheduled: work.deepIds.length,
        completed: finalizedReviews.length,
        deferred: work.deepDeferredIds.length,
        recommended,
      });
      const rejected = Math.max(0, work.screens.length - recommended);
      const duplicateCount = Math.max(0, work.rawCandidateCount - work.newCandidateCount);
      const nextRunAt = new Date(completedAt.getTime() + (verificationPending ? BACKGROUND_VERIFICATION_RETRY_MS : CADENCE_MS)).toISOString();
      if (recommended && !firstRecommendationAt) {
        firstRecommendationAt = completedAt.toISOString();
        await database.prepare(
          "UPDATE monitor_scan_jobs SET first_recommendation_at = COALESCE(first_recommendation_at, ?) WHERE id = ?",
        ).bind(firstRecommendationAt, job.id).run();
        await recordReliabilityEvent(database, {
          spaceId: space.id,
          scanJobId: job.id,
          kind: "first_recommendation_ready",
          stage: "deep_reviewing",
          source: MONITOR_MODEL,
          outcome: "success",
          durationMs: Math.max(0, completedAt.getTime() - databaseTime(job.started_at)),
          metadata: { recommended },
        });
      }
      if (!recommended) {
        const rejectionBreakdown = finalizedReviews.reduce<Record<string, number>>((counts, review) => {
          const reason = !review.isPaper ? "not_research_paper"
            : review.relevanceScore < RECOMMENDATION_THRESHOLD ? "below_relevance_gate"
              : review.qualityScore < 65 ? "below_quality_gate"
                : review.verificationRetryable ? "evidence_verification_pending"
                : review.verificationStatus === "degraded" ? "evidence_verification_failed"
                  : "model_did_not_recommend_or_evidence_incomplete";
          counts[reason] = (counts[reason] || 0) + 1;
          return counts;
        }, {});
        await recordReliabilityEvent(database, {
          spaceId: space.id,
          scanJobId: job.id,
          kind: "zero_recommendation_audit",
          stage: "finalizing",
          source: MONITOR_MODEL,
          outcome: completion.state === "analysis_unavailable" || verificationPending ? "degraded" : "info",
          errorCode: completion.state === "analysis_unavailable" ? "analysis_unavailable" : verificationPending ? "verification_pending" : "",
          message: completion.state === "analysis_unavailable"
            ? "No quality conclusion was made because every scheduled deep review was deferred"
            : verificationPending
            ? "High-potential drafts were preserved; bibliographic and abstract evidence checks are pending"
            : "Completed reviews produced no recommendation",
          metadata: { completionState: completion.state, verificationPending, verificationFailed, ...completion, rejectionBreakdown },
        });
      }
      await generateDailyBrief(database, enrichedSpace, user.userId, job.id, candidates, finalizedReviews, {
        scanned: job.discovered_count,
        newCandidates: work.newCandidateCount,
        duplicates: duplicateCount,
        reviewed: finalizedReviews.length,
        screened: work.screens.length,
        deepScheduled: work.deepIds.length,
        deepReviewed: finalizedReviews.length,
        deepDeferred: work.deepDeferredIds.length,
        analysisUnavailable: completion.state === "analysis_unavailable" ? 1 : 0,
        verificationPending,
        verificationFailed,
        recommended,
        rejected,
      }, completedAt, apiKey, true);
      try {
        await createScanNotifications(database, space.id, shanghaiDateKey(completedAt), finalizedReviews, {
          scanned: job.discovered_count, newCandidates: work.newCandidateCount, duplicates: duplicateCount,
          reviewed: finalizedReviews.length, screened: work.screens.length, deepReviewed: finalizedReviews.length,
          deepDeferred: work.deepDeferredIds.length, recommended, rejected,
        }, Boolean(job.resume_of_job_id));
      } catch (notificationError) {
        console.error("Failed to create staged scan notifications", notificationError);
      }
      const selectionMix = Object.values(work.deepSelectionOrigins).reduce<Record<string, number>>((counts, origin) => {
        counts[origin] = (counts[origin] || 0) + 1;
        return counts;
      }, {});
      const recommendationMix = finalizedReviews.filter(isPublishedRecommendation).reduce<Record<string, number>>((counts, review) => {
        const origin = work.deepSelectionOrigins[review.canonicalId] || "backlog";
        counts[origin] = (counts[origin] || 0) + 1;
        return counts;
      }, {});
      const freshFunnel = buildFreshYieldFunnel({
        currentCandidateIds: work.currentCandidateIds,
        screens: work.screens,
        deepIds: work.deepIds,
        deepCompletedIds: work.deepCompletedIds,
        deepDeferredIds: work.deepDeferredIds,
        reviews: finalizedReviews,
      });
      await recordReliabilityEvent(database, {
        spaceId: space.id,
        scanJobId: job.id,
        kind: "scan_yield_attribution",
        stage: "finalizing",
        source: MONITOR_MODEL,
        outcome: recommended ? "success" : verificationPending || work.deepDeferredIds.length ? "degraded" : "info",
        message: "Internal fresh-paper yield and failure attribution was recorded for adaptive discovery calibration",
        metadata: {
          qualityGateUnchanged: true,
          currentDiscoveryPool: work.currentCandidateIds.length,
          freshFunnel,
          selectionMix,
          recommendationMix,
          failureReasons: {
            ...work.selectionFailureReasons,
            evidence_audit_failed: verificationFailed,
            analysis_deferred: work.deepDeferredIds.length,
          },
        },
      });
      if (shouldRefreshFreshYieldPlan(freshFunnel)) {
        const planDate = completedAt.toISOString().slice(0, 10);
        await database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date = ?")
          .bind(space.id, planDate).run();
        await recordReliabilityEvent(database, {
          spaceId: space.id,
          scanJobId: job.id,
          kind: "fresh_yield_replan_scheduled",
          stage: "finalizing",
          source: "adaptive-discovery",
          outcome: "info",
          message: "The next due scan will regenerate its query plan from the diagnosed fresh-paper funnel without lowering the recommendation gate",
          metadata: { qualityGateUnchanged: true, planDate, diagnosis: freshFunnel.diagnosis, freshFunnel },
        });
      }
      await database.batch([
        database.prepare(
          `UPDATE monitor_runs SET status = 'ready', last_run_at = ?, next_run_at = ?, new_count = ?, scanned_count = ?,
           discovery_round = discovery_round + 1, lock_token = NULL, lock_expires_at = NULL, error = NULL,
           updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND lock_token = ?`,
        ).bind(completedAt.toISOString(), nextRunAt, recommended, job.discovered_count, space.id, lockToken),
        database.prepare(
          `UPDATE monitor_scan_jobs SET status = 'ready', checkpoint = 'main_complete', current_horizon = '',
           current_source = ?, progress = 100, new_candidate_count = ?,
           duplicate_count = ?, reviewed_count = ?, recommended_count = ?, rejected_count = ?, completed_at = ?,
           error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(completion.state === "analysis_unavailable"
          ? `候选与筛选结果已保存；${work.deepDeferredIds.length} 篇高潜力论文等待模型恢复后续评`
          : verificationPending
            ? `本轮发现与解读已完成；${verificationPending} 篇已保存核对进度，Pi 会在后台自动继续${verificationFailed ? `；另有 ${verificationFailed} 篇证据未通过` : ""}`
          : verificationFailed
            ? `本轮严格评审已完成；${verificationFailed} 篇高潜力论文因证据不足未发布`
          : work.deepDeferredIds.length
            ? `本轮已完成；${work.deepDeferredIds.length} 篇响应较慢的论文已延后重试`
            : recommended ? "推荐已可阅读，Pi 正在后台整理今日简报" : "本轮严格评审已完成，暂无强推荐",
        work.newCandidateCount, duplicateCount, work.screens.length, recommended, rejected, completedAt.toISOString(), job.id),
      ]);
      await recordReliabilityEvent(database, {
        spaceId: space.id,
        scanJobId: job.id,
        kind: work.deepDeferredIds.length || verificationPending ? "scan_completed_partial" : "scan_completed",
        stage: "main_complete",
        outcome: work.deepDeferredIds.length || verificationPending ? "degraded" : "success",
        durationMs: Math.max(0, completedAt.getTime() - databaseTime(job.started_at)),
        metadata: {
          discovered: job.discovered_count,
          newCandidates: work.newCandidateCount,
          screened: work.screens.length,
          deepReviewed: finalizedReviews.length,
          deepDeferred: work.deepDeferredIds.length,
          verificationPending,
          verificationFailed,
          completionState: completion.state,
          recommended,
          duplicates: duplicateCount,
        },
      });
      return Response.json(await readState(database, space, { mainComplete: true }));
    };

    try {
      if (job.checkpoint === "planning" || job.checkpoint === "queued") {
        await setStage("planning", "scanning", 5, "DeepSeek Pro 正在规划本轮检索");
        work.frozenQueryPlan = await ensureDailyQueryPlan(database, enrichedSpace, user.userId, preference, apiKey);
        await saveScanWorkQueue(database, job.id, work);
        await setStage("discovering_days", "discovering_days", 10, "正在检索近 14 天", "days");
      } else if (["discovering_days", "discovering_months", "discovering_years"].includes(job.checkpoint)) {
        const horizonKey = job.checkpoint.replace("discovering_", "") as Horizon;
        const horizon = HORIZONS.find((item) => item.key === horizonKey)!;
        const queryPlan = work.frozenQueryPlan || await ensureDailyQueryPlan(database, enrichedSpace, user.userId, preference, apiKey);
        if (!work.frozenQueryPlan) {
          work.frozenQueryPlan = queryPlan;
          await saveScanWorkQueue(database, job.id, work);
        }
        const batch = await fetchHorizon(database, enrichedSpace, horizon, new Date(), preference.priorityVenues, preference.trackedAuthors, preference.profileKey, Math.max(0, run?.discovery_round || 0), job.id, job.discovered_count, queryPlan);
        const newlyDiscoveredIds = await findNewCandidateIds(database, space.id, batch.candidates);
        const newCandidates = newlyDiscoveredIds.length;
        await persistCandidatePool(database, space.id, batch.candidates);
        work.candidateIds = Array.from(new Set([...work.candidateIds, ...batch.candidates.map((candidate) => candidate.canonicalId)]));
        work.currentCandidateIds = Array.from(new Set([...work.currentCandidateIds, ...newlyDiscoveredIds])).slice(0, CANDIDATE_WORK_QUEUE_LIMIT);
        work.rawCandidateCount += batch.rawCount;
        work.newCandidateCount += newCandidates;
        work.horizonStats[horizonKey] = {
          rawCandidates: batch.rawCount,
          candidates: batch.candidates.length,
          newCandidates,
          queued: work.horizonStats[horizonKey]?.queued || 0,
          completed: true,
        };
        await saveScanWorkQueue(database, job.id, work);
        const nextCheckpoint = horizonKey === "days" ? "discovering_months" : horizonKey === "months" ? "discovering_years" : "deduplicating";
        const nextStatus = nextCheckpoint === "deduplicating" ? "deduplicating" : nextCheckpoint;
        const progress = horizonKey === "days" ? 22 : horizonKey === "months" ? 36 : 50;
        const source = nextCheckpoint === "deduplicating" ? "正在去重并准备候选队列" : nextCheckpoint === "discovering_months" ? "正在检索近 6 个月" : "正在回溯近 5 年";
        await database.prepare(
          "UPDATE monitor_scan_jobs SET discovered_count = ?, new_candidate_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(work.candidateIds.length, work.newCandidateCount, job.id).run();
        await setStage(nextCheckpoint, nextStatus, progress, source, nextCheckpoint.startsWith("discovering_") ? nextCheckpoint.replace("discovering_", "") : "");
      } else if (job.checkpoint === "deduplicating") {
        const pendingQueue = await pendingCandidateQueue(database, space.id);
        const selected = selectCurrentAndBacklogReviewBatch(pendingQueue, work.candidateIds);
        work.candidateIds = Array.from(new Set([
          ...selected.map((candidate) => candidate.canonicalId),
          ...work.retryDeepIds,
        ])).slice(0, CANDIDATE_WORK_QUEUE_LIMIT);
        work.screens = await loadCachedQuickScreens(database, space.id, work.candidateIds);
        work.deepIds = [];
        work.deepSelectionOrigins = {};
        work.selectionFailureReasons = {};
        work.deepCompletedIds = [];
        work.deepDeferredIds = [];
        work.verificationIds = [];
        work.verificationCompletedIds = [];
        work.verificationDeferredIds = [];
        work.verificationAttempts = {};
        work.draftRegenerationAttempts = {};
        work.verificationFailureCount = 0;
        work.evidenceIds = [];
        work.evidenceCompletedIds = [];
        work.rescueScreenIds = [];
        work.rescueScreened = false;
        work.pipelineVersion = MONITOR_PIPELINE_VERSION;
        for (const horizon of ["days", "months", "years"] as Horizon[]) {
          work.horizonStats[horizon].queued = selected.filter((candidate) => candidate.horizon === horizon).length;
        }
        await saveScanWorkQueue(database, job.id, work);
        await database.prepare(
          "UPDATE monitor_scan_jobs SET duplicate_count = ?, reviewed_count = 0, recommended_count = 0, rejected_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(Math.max(0, work.rawCandidateCount - work.newCandidateCount), job.id).run();
        if (!work.candidateIds.length) return finalizeMain([], []);
        await setStage("enriching_screening_abstracts", "screening", 54,
          work.screens.length
            ? `已从长期候选池接续 ${work.screens.length} 篇既有筛选结果；正在补全本轮新候选证据`
            : `正在为 ${selected.length} 篇候选批量补全摘要证据`);
      } else if (job.checkpoint === "enriching_screening_abstracts") {
        const candidates = await pendingCandidateQueue(database, space.id, work.candidateIds);
        const enrichment = await enrichDeepReviewAbstracts(database, space.id, candidates);
        const source = enrichment.requested
          ? `已批量补全 ${enrichment.enriched} / ${enrichment.requested} 篇缺失摘要，开始快速筛选`
          : "候选摘要证据完整，开始快速筛选";
        await setStage("screening", "screening", 56, source);
      } else if (job.checkpoint === "screening") {
        const screenedIds = new Set(work.screens.map((screen) => screen.canonicalId));
        const remainingIds = work.candidateIds.filter((id) => !screenedIds.has(id));
        if (remainingIds.length) {
          const ids = remainingIds.slice(0, QUICK_SCREEN_BATCH_SIZE * QUICK_SCREEN_CONCURRENCY);
          const candidates = await pendingCandidateQueue(database, space.id, ids);
          const batchStart = work.screens.length + 1;
          const batchEnd = Math.min(work.screens.length + ids.length, work.candidateIds.length);
          await database.prepare(
            "UPDATE monitor_scan_jobs SET current_source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).bind(`DeepSeek Pro 正在筛选第 ${batchStart}–${batchEnd} / ${work.candidateIds.length} 篇；本批完成后自动保存`, job.id).run();
          const result = await quickScreenCandidates(database, enrichedSpace, user.userId, candidates, apiKey);
          const persistedScreens = await persistQuickScreens(database, space.id, result.screens);
          const byId = new Map(work.screens.map((screen) => [screen.canonicalId, screen]));
          for (const screen of persistedScreens) byId.set(screen.canonicalId, screen);
          work.screens = Array.from(byId.values());
          work.screenFailureCount = result.errors.length && !result.screens.length ? work.screenFailureCount + 1 : 0;
          await saveScanWorkQueue(database, job.id, work);
          if (result.errors.length) await recordReliabilityEvent(database, {
            spaceId: space.id,
            scanJobId: job.id,
            kind: "llm_stage_degraded",
            stage: "screening",
            source: MONITOR_MODEL,
            outcome: "degraded",
            errorCode: monitorErrorCode(result.errors[0]),
            message: normalizedMonitorError(result.errors[0]),
            metadata: { requested: candidates.length, completed: result.screens.length, failureCount: work.screenFailureCount },
          });
          const fatalError = result.errors.find((error) => isNonRetryableDeepSeekError(error));
          if (fatalError) throw fatalError;
          if (work.screenFailureCount >= 2) throw result.errors[0] instanceof Error ? result.errors[0] : new Error("Quick screening failed twice");
        }
        const screenRemaining = work.candidateIds.filter((id) => !new Set(work.screens.map((screen) => screen.canonicalId)).has(id));
        const screeningProgress = Math.min(74, 56 + Math.round(work.screens.length / Math.max(1, work.candidateIds.length) * 18));
        await database.prepare(
          "UPDATE monitor_scan_jobs SET reviewed_count = ?, rejected_count = ?, current_source = ?, progress = MAX(progress, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(work.screens.length, work.screens.filter((screen) => !screen.isPaper || screen.relevanceScore < 68 || screen.qualityScore < 55).length,
          `DeepSeek Pro 已快速筛选 ${work.screens.length} / ${work.candidateIds.length}`, screeningProgress, job.id).run();
        if (!screenRemaining.length) {
          const candidates = await pendingCandidateQueue(database, space.id, work.candidateIds);
          const primaryIds = chooseDeepCandidateIds(candidates, work.screens);
          if (!work.rescueScreened && primaryIds.length < DEEP_REVIEW_LIMIT) {
            work.rescueScreenIds = chooseRescueScreenIds(candidates, work.screens, Math.min(RESCUE_SCREEN_LIMIT, DEEP_REVIEW_LIMIT - primaryIds.length + 2));
            work.rescueScreened = true;
            await saveScanWorkQueue(database, job.id, work);
            if (work.rescueScreenIds.length) {
              await setStage("rescue_screening", "screening", 72, `正在认真复审 ${work.rescueScreenIds.length} 篇临界论文，避免过早淘汰`);
              return Response.json(await readState(database, space, { rescueScreening: true }), { status: 202 });
            }
          }
          work.deepIds = chooseBudgetedDeepCandidateIds(candidates, work.screens, work.currentCandidateIds, DEEP_REVIEW_LIMIT);
          if (work.deepIds.length < Math.min(3, DEEP_REVIEW_LIMIT)) {
            work.deepIds = chooseBudgetedDeepCandidateIds(
              candidates, work.screens, work.currentCandidateIds, DEEP_REVIEW_LIMIT, work.deepIds, true,
            );
          }
          if (work.retryDeepIds.length) {
            work.deepIds = Array.from(new Set([
              ...work.deepIds,
              ...work.retryDeepIds,
            ])).slice(0, DEEP_REVIEW_MAX_LIMIT);
            work.retryDeepIds = [];
          }
          const queuedExistingReviews = await loadPersistedReviews(database, space.id, work.candidateIds);
          const queuedPendingIds = queuedExistingReviews
            .filter((review) => review.verificationRetryable)
            .map((review) => review.canonicalId);
          work.deepIds = Array.from(new Set([...queuedPendingIds, ...work.deepIds])).slice(0, DEEP_REVIEW_MAX_LIMIT);
          updateDeepSelectionDiagnostics(work, candidates);
          const existingReviews = queuedExistingReviews.filter((review) => work.deepIds.includes(review.canonicalId));
          const pendingVerificationIds = existingReviews
            .filter((review) => review.verificationRetryable)
            .map((review) => review.canonicalId);
          work.deepCompletedIds = Array.from(new Set([...work.deepCompletedIds, ...pendingVerificationIds]));
          work.verificationIds = Array.from(new Set([...work.verificationIds, ...pendingVerificationIds]));
          await saveScanWorkQueue(database, job.id, work);
          if (!work.deepIds.length) return finalizeMain([], []);
          await setStage("enriching_abstracts", "deep_reviewing", 76, `正在为 ${work.deepIds.length} 篇高潜力论文补全摘要证据`);
        }
      } else if (job.checkpoint === "rescue_screening") {
        const candidates = await pendingCandidateQueue(database, space.id, work.rescueScreenIds);
        const result = await quickScreenCandidates(database, enrichedSpace, user.userId, candidates, apiKey, "rescue");
        const persistedScreens = await persistQuickScreens(database, space.id, result.screens);
        const byId = new Map(work.screens.map((screen) => [screen.canonicalId, screen]));
        for (const screen of persistedScreens) byId.set(screen.canonicalId, screen);
        work.screens = Array.from(byId.values());
        work.screenFailureCount = result.errors.length && !result.screens.length ? work.screenFailureCount + 1 : 0;
        await saveScanWorkQueue(database, job.id, work);
        if (result.errors.length) await recordReliabilityEvent(database, {
          spaceId: space.id,
          scanJobId: job.id,
          kind: "llm_stage_degraded",
          stage: "rescue_screening",
          source: MONITOR_MODEL,
          outcome: "degraded",
          errorCode: monitorErrorCode(result.errors[0]),
          message: normalizedMonitorError(result.errors[0]),
          metadata: { requested: candidates.length, completed: result.screens.length, failureCount: work.screenFailureCount },
        });
        const fatalError = result.errors.find((error) => isNonRetryableDeepSeekError(error));
        if (fatalError) throw fatalError;
        if (work.screenFailureCount >= 2) throw result.errors[0] instanceof Error ? result.errors[0] : new Error("Near-miss screening failed twice");
        if (result.errors.length && !result.screens.length) {
          await setStage("rescue_screening", "screening", 72, "临界论文复审响应较慢，正在从保存点重试");
        } else {
          await setStage("screening", "screening", 74, "临界论文复审完成，正在确定深度解读队列");
        }
      } else if (job.checkpoint === "enriching_abstracts") {
        const candidates = await pendingCandidateQueue(database, space.id, work.deepIds);
        const enrichment = await enrichDeepReviewAbstracts(database, space.id, candidates);
        const refreshedCandidates = await pendingCandidateQueue(database, space.id, work.candidateIds);
        const pinnedIds = new Set([...work.deepCompletedIds, ...work.verificationIds]);
        const evidenceReadyCandidates = refreshedCandidates.filter((candidate) =>
          candidateHasReviewableEvidence(candidate) || pinnedIds.has(candidate.canonicalId));
        const previousDeepIds = new Set(work.deepIds);
        work.deepIds = chooseBudgetedDeepCandidateIds(
          evidenceReadyCandidates,
          work.screens,
          work.currentCandidateIds,
          previousDeepIds.size,
          pinnedIds,
          true,
        ).slice(0, DEEP_REVIEW_MAX_LIMIT);
        const removedForEvidence = [...previousDeepIds].filter((id) => !work.deepIds.includes(id) && !pinnedIds.has(id));
        updateDeepSelectionDiagnostics(work, refreshedCandidates);
        await saveScanWorkQueue(database, job.id, work);
        if (removedForEvidence.length) await recordReliabilityEvent(database, {
          spaceId: space.id,
          scanJobId: job.id,
          kind: "deep_review_evidence_precheck",
          stage: "enriching_abstracts",
          source: "bibliographic_and_abstract_evidence",
          outcome: "info",
          message: "Candidates still lacking usable abstract evidence were replaced before expensive deep review",
          metadata: {
            removed: removedForEvidence.length,
            replacements: work.deepIds.filter((id) => !previousDeepIds.has(id)).length,
            qualityGateUnchanged: true,
          },
        });
        if (!work.deepIds.length) return finalizeMain([], []);
        const source = enrichment.requested
          ? `已补全 ${enrichment.enriched} / ${enrichment.requested} 篇缺失摘要，${work.deepIds.length} 篇证据充分候选准备深度解读`
          : "候选摘要证据完整，准备深度解读";
        await setStage("deep_reviewing", "deep_reviewing", 80, source);
      } else if (job.checkpoint === "deep_reviewing") {
        const completedIds = new Set(work.deepCompletedIds);
        const deferredIds = new Set(work.deepDeferredIds);
        const remainingIds = work.deepIds.filter((id) => !completedIds.has(id) && !deferredIds.has(id));
        if (remainingIds.length) {
          const concurrency = work.deepCompletedIds.length ? DEEP_REVIEW_CONCURRENCY : 1;
          const ids = remainingIds.slice(0, concurrency * DEEP_REVIEW_BATCH_SIZE);
          const candidates = await pendingCandidateQueue(database, space.id, ids);
          const batchStart = work.deepCompletedIds.length + 1;
          const batchEnd = Math.min(batchStart + ids.length - 1, work.deepIds.length);
          await database.prepare(
            "UPDATE monitor_scan_jobs SET current_source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).bind(`DeepSeek Pro 正在解读第 ${batchStart}${batchEnd > batchStart ? `–${batchEnd}` : ""} / ${work.deepIds.length} 篇；任一篇完成都会立即保存`, job.id).run();
          const result = await runIncrementalDeepReview(database, enrichedSpace, user.userId, preference.priorityVenues, candidates, job.id, lockToken, apiKey, async (savedReviews) => {
            work.deepCompletedIds = Array.from(new Set([...work.deepCompletedIds, ...savedReviews.map((review) => review.canonicalId)]));
            work.deepFailureCount = 0;
            await saveScanWorkQueue(database, job.id, work);
            const saved = await loadPersistedReviews(database, space.id, work.deepCompletedIds);
            const ready = saved.filter(isPublishedRecommendation).length;
            const pendingVerification = saved.filter((review) => review.verificationRetryable).length;
            const progress = Math.min(94, 76 + Math.round(work.deepCompletedIds.length / Math.max(1, work.deepIds.length) * 18));
            await database.prepare(
              `UPDATE monitor_scan_jobs SET status = 'deep_reviewing', checkpoint = 'deep_reviewing', recommended_count = ?,
               first_recommendation_at = CASE WHEN ? > 0 THEN COALESCE(first_recommendation_at, CURRENT_TIMESTAMP) ELSE first_recommendation_at END,
               current_source = ?, progress = MAX(progress, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            ).bind(ready, ready, `已完成 ${work.deepCompletedIds.length} / ${work.deepIds.length} 篇深度解读，${pendingVerification} 篇高潜力解读正在等待推荐判断`, progress, job.id).run();
            if (ready && !firstRecommendationAt) {
              firstRecommendationAt = new Date().toISOString();
              await recordReliabilityEvent(database, {
                spaceId: space.id,
                scanJobId: job.id,
                kind: "first_recommendation_ready",
                stage: "deep_reviewing",
                source: MONITOR_MODEL,
                outcome: "success",
                durationMs: Math.max(0, Date.now() - databaseTime(job.started_at)),
                metadata: { completed: work.deepCompletedIds.length, total: work.deepIds.length, ready },
              });
            }
          });
          work.deepCompletedIds = Array.from(new Set([...work.deepCompletedIds, ...result.reviews.map((review) => review.canonicalId)]));
          const fatalError = result.errors.find((error) => isNonRetryableDeepSeekError(error));
          if (!fatalError && result.failedIds.length) {
            work.deepDeferredIds = Array.from(new Set([...work.deepDeferredIds, ...result.failedIds])).slice(0, DEEP_REVIEW_MAX_LIMIT);
            work.deepFailureCount += result.failedIds.length;
          }
          if (!result.errors.length) work.deepFailureCount = 0;
          await saveScanWorkQueue(database, job.id, work);
          if (result.errors.length) await recordReliabilityEvent(database, {
            spaceId: space.id,
            scanJobId: job.id,
            kind: "llm_stage_degraded",
            stage: "deep_reviewing",
            source: MONITOR_MODEL,
            outcome: "degraded",
            errorCode: monitorErrorCode(result.errors[0]),
            message: normalizedMonitorError(result.errors[0]),
            metadata: {
              requested: candidates.length,
              completed: result.reviews.length,
              deferred: result.failedIds.length,
              failureCount: work.deepFailureCount,
            },
          });
          if (!fatalError && shouldOpenDeepReviewCircuit({
            consecutiveFailures: work.deepFailureCount,
            completedInBatch: result.reviews.length,
            failedInBatch: result.failedIds.length,
          })) {
            const handledIds = new Set([...work.deepCompletedIds, ...work.deepDeferredIds]);
            const circuitDeferredIds = work.deepIds.filter((id) => !handledIds.has(id));
            work.deepDeferredIds = Array.from(new Set([...work.deepDeferredIds, ...circuitDeferredIds])).slice(0, DEEP_REVIEW_MAX_LIMIT);
            await saveScanWorkQueue(database, job.id, work);
            await recordReliabilityEvent(database, {
              spaceId: space.id,
              scanJobId: job.id,
              kind: "llm_circuit_opened",
              stage: "deep_reviewing",
              source: MONITOR_MODEL,
              outcome: "degraded",
              errorCode: monitorErrorCode(result.errors[0]),
              message: "Repeated transient review failures; remaining papers were deferred without additional model calls",
              metadata: {
                consecutiveFailures: work.deepFailureCount,
                newlyDeferred: circuitDeferredIds.length,
                totalDeferred: work.deepDeferredIds.length,
              },
            });
          }
          if (fatalError) throw fatalError;
        }
        const persistedReviews = await loadPersistedReviews(database, space.id, work.deepCompletedIds);
        const recommended = persistedReviews.filter(isPublishedRecommendation).length;
        const verificationPending = persistedReviews.filter((review) => review.verificationRetryable).length;
        const potentialRecommendations = persistedReviews.filter((review) => review.recommended).length;
        const processedDeepCount = new Set([...work.deepCompletedIds, ...work.deepDeferredIds]).size;
        const deepProgress = Math.min(94, 76 + Math.round(processedDeepCount / Math.max(1, work.deepIds.length) * 18));
        await database.prepare(
          "UPDATE monitor_scan_jobs SET status = 'deep_reviewing', checkpoint = 'deep_reviewing', reviewed_count = ?, recommended_count = ?, rejected_count = ?, current_source = ?, progress = MAX(progress, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(work.screens.length, recommended, Math.max(0, work.screens.length - recommended),
          `已处理 ${processedDeepCount} / ${work.deepIds.length} 篇深度解读，${verificationPending} 篇高潜力解读等待推荐判断${recommended ? `，${recommended} 篇已可阅读` : ""}${work.deepDeferredIds.length ? `，${work.deepDeferredIds.length} 篇响应较慢已延后` : ""}`, deepProgress, job.id).run();
        const newlyVerifiableIds = persistedReviews
          .filter((review) => review.verificationRetryable && !work.verificationIds.includes(review.canonicalId))
          .map((review) => review.canonicalId);
        const earlyVerificationThreshold = recommended === 0 ? 1 : Math.min(2, Math.max(1, DAILY_RECOMMENDATION_MIN_TARGET - recommended));
        if (newlyVerifiableIds.length && (newlyVerifiableIds.length >= earlyVerificationThreshold || processedDeepCount >= work.deepIds.length)) {
          work.verificationIds = Array.from(new Set([...work.verificationIds, ...newlyVerifiableIds]));
          await saveScanWorkQueue(database, job.id, work);
          await setStage("verifying_recommendations", "deep_reviewing", 94,
            `已有 ${newlyVerifiableIds.length} 篇高潜力解读，先完成推荐判断；其余论文稍后继续解读`);
          return Response.json(await readState(database, space, { earlyVerification: true }), { status: 202 });
        }
        if (processedDeepCount >= work.deepIds.length) {
          const recommendationShortfall = Math.max(0, HIGH_POTENTIAL_DRAFT_TARGET - potentialRecommendations);
          if (recommendationShortfall && work.deepIds.length < DEEP_REVIEW_MAX_LIMIT) {
            const allCandidates = await pendingCandidateQueue(database, space.id, work.candidateIds);
            const secondWaveLimit = Math.min(
              DEEP_REVIEW_RESCUE_LIMIT,
              DEEP_REVIEW_MAX_LIMIT - work.deepIds.length,
              Math.max(2, recommendationShortfall * 2),
            );
            const scheduled = new Set(work.deepIds);
            const rescueIds = chooseBudgetedDeepCandidateIds(
              allCandidates,
              work.screens,
              work.currentCandidateIds,
              Math.min(DEEP_REVIEW_MAX_LIMIT, work.deepIds.length + secondWaveLimit),
              work.deepIds,
              true,
            ).filter((id) => !scheduled.has(id)).slice(0, secondWaveLimit);
            if (rescueIds.length) {
              work.deepIds = [...work.deepIds, ...rescueIds];
              updateDeepSelectionDiagnostics(work, allCandidates);
              await saveScanWorkQueue(database, job.id, work);
              await setStage("enriching_abstracts", "deep_reviewing", 76,
                `目前形成 ${potentialRecommendations} 篇高潜力稿，正在追加 ${rescueIds.length} 篇第二批评审，目标补足到 ${HIGH_POTENTIAL_DRAFT_TARGET} 篇`);
              return Response.json(await readState(database, space, { rescueReview: true }), { status: 202 });
            }
          }
          work.verificationIds = Array.from(new Set([
            ...work.verificationIds,
            ...persistedReviews.filter((review) => review.verificationRetryable).map((review) => review.canonicalId),
          ]));
          work.verificationCompletedIds = work.verificationCompletedIds.filter((id) => work.verificationIds.includes(id));
          work.verificationDeferredIds = work.verificationDeferredIds.filter((id) => work.verificationIds.includes(id));
          work.verificationAttempts = Object.fromEntries(Object.entries(work.verificationAttempts)
            .filter(([id]) => work.verificationIds.includes(id)));
          await saveScanWorkQueue(database, job.id, work);
          if (work.verificationIds.length) {
            await setStage("verifying_recommendations", "deep_reviewing", 94,
              `已形成 ${work.verificationIds.length} 篇高潜力解读，正在两篇一组核对书目与摘要证据`);
            return Response.json(await readState(database, space, { verifyingRecommendations: true }), { status: 202 });
          }
          work.evidenceIds = [];
          work.evidenceCompletedIds = [];
          await saveScanWorkQueue(database, job.id, work);
          await setStage("finalizing", "deep_reviewing", 99, "推荐内容核验完成，正在整理今日推荐");
        }
      } else if (job.checkpoint === "verifying_recommendations") {
        const handled = new Set([...work.verificationCompletedIds, ...work.verificationDeferredIds]);
        const canonicalId = work.verificationIds.find((id) => !handled.has(id));
        if (canonicalId) {
          const candidates = await pendingCandidateQueue(database, space.id, [canonicalId]);
          const drafts = await loadPersistedReviews(database, space.id, [canonicalId]);
          const draft = drafts.find((review) => review.verificationRetryable);
          if (draft && !hasCompleteRecommendationDraft(draft) && candidates.length) {
            const regenerationAttempts = work.draftRegenerationAttempts[canonicalId] || 0;
            if (regenerationAttempts < INCOMPLETE_DRAFT_REGENERATION_LIMIT) {
              const retryIds = new Set([canonicalId]);
              work.draftRegenerationAttempts[canonicalId] = regenerationAttempts + 1;
              work.deepIds = Array.from(new Set([...work.deepIds, canonicalId])).slice(0, DEEP_REVIEW_MAX_LIMIT);
              work.deepCompletedIds = work.deepCompletedIds.filter((id) => !retryIds.has(id));
              work.deepDeferredIds = work.deepDeferredIds.filter((id) => !retryIds.has(id));
              work.verificationIds = work.verificationIds.filter((id) => !retryIds.has(id));
              work.verificationCompletedIds = work.verificationCompletedIds.filter((id) => !retryIds.has(id));
              work.verificationDeferredIds = work.verificationDeferredIds.filter((id) => !retryIds.has(id));
              delete work.verificationAttempts[canonicalId];
              await saveScanWorkQueue(database, job.id, work);
              await setStage("deep_reviewing", "deep_reviewing", 86,
                `发现 1 篇解读结构不完整，正在自动重新生成；已完成论文不会重做`);
              return Response.json(await readState(database, space, { regeneratingIncompleteDraft: true }), { status: 202 });
            }
            const incompleteReport = evidenceVerificationReport({
              initial: sanitizeEvidenceVerificationDraft({
                verdict: "insufficient",
                reason: "Recommendation draft remained incomplete after one targeted regeneration",
              }, { allowedFields: recommendationVerificationFields(draft) }),
            });
            const persisted = await persistReviewBatch(database, space.id, job.id, candidates, [
              degradedRecommendationReview(draft, incompleteReport),
            ]);
            await persistRecommendationAuditBatch(database, space.id, job.id, candidates, persisted, 0, 0);
            work.selectionFailureReasons.incomplete_analysis = (work.selectionFailureReasons.incomplete_analysis || 0) + 1;
            work.verificationCompletedIds = Array.from(new Set([...work.verificationCompletedIds, canonicalId]));
            work.verificationDeferredIds = work.verificationDeferredIds.filter((id) => id !== canonicalId);
            delete work.verificationAttempts[canonicalId];
            await recordReliabilityEvent(database, {
              spaceId: space.id,
              scanJobId: job.id,
              kind: "incomplete_draft_regeneration_exhausted",
              stage: "verifying_recommendations",
              source: MONITOR_MODEL,
              outcome: "degraded",
              errorCode: "incomplete_recommendation_draft",
              message: "A targeted draft regeneration remained incomplete; the paper was retained in the exploration ledger without blocking other verification work",
              metadata: { canonicalId, regenerationAttempts, qualityGateUnchanged: true },
            });
          } else if (!draft || !candidates.length) {
            work.verificationDeferredIds = Array.from(new Set([...work.verificationDeferredIds, canonicalId]));
            delete work.verificationAttempts[canonicalId];
          } else {
            const usageDate = shanghaiDateKey(new Date());
            const workspaceScope = "monitor-workspace:" + user.userId.replace(/^anonymous:/, "");
            const spaceScope = "monitor-space:" + space.id;
            const firstCorrectionMode = draft.verificationReport?.correctionRequested === true;
            const batchIds = [canonicalId];
            const batchCandidates = [...candidates];
            const batchDrafts = [draft];
            const secondId = work.verificationIds.find((id) => !handled.has(id) && id !== canonicalId);
            if (secondId && !firstCorrectionMode && batchIds.length < VERIFICATION_BATCH_SIZE) {
              const [secondCandidates, secondDrafts] = await Promise.all([
                pendingCandidateQueue(database, space.id, [secondId]),
                loadPersistedReviews(database, space.id, [secondId]),
              ]);
              const secondDraft = secondDrafts.find((review) => review.verificationRetryable);
              if (secondCandidates.length && secondDraft && hasCompleteRecommendationDraft(secondDraft)
                && (secondDraft.verificationReport?.correctionRequested === true) === firstCorrectionMode) {
                batchIds.push(secondId);
                batchCandidates.push(...secondCandidates);
                batchDrafts.push(secondDraft);
              }
            }
            const verificationAttempts = new Map(batchIds.map((id) => {
              const attempt = Math.min(VERIFICATION_ATTEMPT_LIMIT, (work.verificationAttempts[id] || 0) + 1);
              work.verificationAttempts[id] = attempt;
              return [id, attempt] as const;
            }));
            await saveScanWorkQueue(database, job.id, work);
            try {
              const verified = await verifyRecommendationBatch({
                database, spaceId: space.id, usageDate, workspaceScope, spaceScope,
                apiKey, candidates: batchCandidates, reviews: batchDrafts,
              });
              const boundedVerified = verified.map((review) => {
                const attempt = verificationAttempts.get(review.canonicalId) || 1;
                if (!review.verificationRetryable || attempt < VERIFICATION_ATTEMPT_LIMIT) return review;
                const initial = sanitizeEvidenceVerificationDraft(review.verificationReport?.audit || {
                  verdict: "insufficient", reason: "Verification call budget ended before a conservative correction could be completed",
                }, { allowedFields: recommendationVerificationFields(review) });
                return degradedRecommendationReview(review, {
                  ...evidenceVerificationReport({ initial }),
                  reason: "Verification call budget ended without a clean evidence decision; the paper was withheld instead of entering another content loop",
                });
              });
              const persisted = await persistReviewBatch(database, space.id, job.id, batchCandidates, boundedVerified);
              await persistRecommendationAuditBatch(database, space.id, job.id, batchCandidates, persisted, 0, 0);
              work.verificationFailureCount = 0;
              for (const batchId of batchIds) {
                const persistedReview = persisted.find((review) => review.canonicalId === batchId);
                const verificationAttempt = verificationAttempts.get(batchId) || 1;
                if (persistedReview?.verificationRetryable) {
                  await recordReliabilityEvent(database, {
                    spaceId: space.id,
                    scanJobId: job.id,
                    kind: "verification_retry_scheduled",
                    stage: "verifying_recommendations",
                    source: MONITOR_MODEL,
                    outcome: "info",
                    message: "Evidence audit completed; one bounded conservative correction is queued",
                    metadata: {
                      canonicalId: batchId, verificationAttempt, draftPreserved: true, retryScope: "verification_only",
                      correctionRequested: persistedReview.verificationReport?.correctionRequested === true,
                      maximumModelCalls: VERIFICATION_ATTEMPT_LIMIT,
                    },
                  });
                } else {
                  work.verificationCompletedIds = Array.from(new Set([...work.verificationCompletedIds, batchId]));
                  delete work.verificationAttempts[batchId];
                }
              }
            } catch (verificationError) {
              if (isNonRetryableDeepSeekError(verificationError)) throw verificationError;
              work.verificationFailureCount += 1;
              for (const batchId of batchIds) {
                const verificationAttempt = verificationAttempts.get(batchId) || 1;
                const retryScheduled = verificationAttempt < VERIFICATION_ATTEMPT_LIMIT;
                if (!retryScheduled) {
                  work.verificationDeferredIds = Array.from(new Set([...work.verificationDeferredIds, batchId]));
                }
                await recordReliabilityEvent(database, {
                  spaceId: space.id,
                  scanJobId: job.id,
                  kind: retryScheduled ? "verification_retry_scheduled" : "verification_deferred",
                  stage: "verifying_recommendations",
                  source: MONITOR_MODEL,
                  outcome: "degraded",
                  errorCode: monitorErrorCode(verificationError),
                  message: normalizedMonitorError(verificationError),
                  metadata: { canonicalId: batchId, verificationAttempt, retryScheduled, draftPreserved: true, retryScope: "verification_only" },
                });
              }
              if (work.verificationFailureCount >= VERIFICATION_CIRCUIT_FAILURE_LIMIT) {
                const alreadyHandled = new Set([...work.verificationCompletedIds, ...work.verificationDeferredIds]);
                const circuitDeferred = work.verificationIds.filter((id) => !alreadyHandled.has(id));
                work.verificationDeferredIds = Array.from(new Set([...work.verificationDeferredIds, ...circuitDeferred]));
                await recordReliabilityEvent(database, {
                  spaceId: space.id,
                  scanJobId: job.id,
                  kind: "llm_circuit_opened",
                  stage: "verifying_recommendations",
                  source: MONITOR_MODEL,
                  outcome: "degraded",
                  errorCode: monitorErrorCode(verificationError),
                  message: "Repeated verifier failures; remaining drafts were deferred without more model calls",
                  metadata: { consecutiveFailures: work.verificationFailureCount, newlyDeferred: circuitDeferred.length },
                });
              }
            }
          }
          await saveScanWorkQueue(database, job.id, work);
        }
        const verificationProcessed = new Set([...work.verificationCompletedIds, ...work.verificationDeferredIds]).size;
        const verificationReviews = await loadPersistedReviews(database, space.id, work.deepCompletedIds);
        const published = verificationReviews.filter(isPublishedRecommendation).length;
        const pending = verificationReviews.filter((review) => work.verificationIds.includes(review.canonicalId) && review.verificationRetryable).length;
        const retrying = work.verificationIds.filter((id) => !work.verificationCompletedIds.includes(id)
          && !work.verificationDeferredIds.includes(id) && (work.verificationAttempts[id] || 0) > 0).length;
        const verificationProgress = Math.min(96, 94 + Math.round(verificationProcessed
          / Math.max(1, work.verificationIds.length) * 2));
        await database.prepare(
          "UPDATE monitor_scan_jobs SET recommended_count = ?, current_source = ?, progress = MAX(progress, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(published,
          `推荐判断已完成 ${verificationProcessed} / ${work.verificationIds.length} 篇；${published} 篇已可阅读${retrying ? `，${retrying} 篇正在核对` : pending ? `，${pending} 篇将在短暂故障恢复后继续` : ""}`,
          verificationProgress, job.id).run();
        if (verificationProcessed >= work.verificationIds.length) {
          const remainingDeepIds = work.deepIds.filter((id) => !work.deepCompletedIds.includes(id) && !work.deepDeferredIds.includes(id));
          if (published < DAILY_RECOMMENDATION_MIN_TARGET && remainingDeepIds.length) {
            await saveScanWorkQueue(database, job.id, work);
            await setStage("deep_reviewing", "deep_reviewing", 86,
              `已有 ${published} 篇正式入选；继续解读 ${remainingDeepIds.length} 篇已排队论文，争取达到 ${DAILY_RECOMMENDATION_MIN_TARGET} 篇`);
            return Response.json(await readState(database, space, { resumedDeepReviewAfterVerification: true }), { status: 202 });
          }
          const allCandidates = await pendingCandidateQueue(database, space.id, work.candidateIds);
          const availableCandidates = allCandidates.filter((candidate) => !work.deepIds.includes(candidate.canonicalId));
          const formalRescueSize = formalRecommendationRescueSize({
            published,
            reviewed: work.deepIds.length,
            maxReviews: DEEP_REVIEW_MAX_LIMIT,
            availableCandidates: availableCandidates.length,
            minTarget: DAILY_RECOMMENDATION_MIN_TARGET,
            maxPerWave: DEEP_REVIEW_RESCUE_LIMIT,
          });
          if (formalRescueSize > 0) {
            const scheduled = new Set(work.deepIds);
            const formalRescueIds = chooseBudgetedDeepCandidateIds(
              allCandidates,
              work.screens,
              work.currentCandidateIds,
              Math.min(DEEP_REVIEW_MAX_LIMIT, work.deepIds.length + formalRescueSize),
              work.deepIds,
              true,
            ).filter((id) => !scheduled.has(id)).slice(0, formalRescueSize);
            if (formalRescueIds.length) {
              work.deepIds = [...work.deepIds, ...formalRescueIds].slice(0, DEEP_REVIEW_MAX_LIMIT);
              updateDeepSelectionDiagnostics(work, allCandidates);
              await saveScanWorkQueue(database, job.id, work);
              await recordReliabilityEvent(database, {
                spaceId: space.id,
                scanJobId: job.id,
                kind: "formal_yield_rescue_started",
                stage: "verifying_recommendations",
                source: MONITOR_MODEL,
                outcome: "info",
                message: "Evidence checks left the formal daily queue below target; an additional quality-preserving review wave was scheduled",
                metadata: {
                  published,
                  minimumTarget: DAILY_RECOMMENDATION_MIN_TARGET,
                  maximumDisplayTarget: DAILY_RECOMMENDATION_MAX_TARGET,
                  additionalReviews: formalRescueIds.length,
                  qualityGateUnchanged: true,
                },
              });
              await setStage("enriching_abstracts", "deep_reviewing", 84,
                `已有 ${published} 篇正式入选；正在追加 ${formalRescueIds.length} 篇候选评审，争取达到 ${DAILY_RECOMMENDATION_MIN_TARGET} 篇，质量门槛不变`);
              return Response.json(await readState(database, space, { formalYieldRescue: true }), { status: 202 });
            }
          }
          work.evidenceIds = [];
          work.evidenceCompletedIds = [];
          await saveScanWorkQueue(database, job.id, work);
          await setStage("finalizing", "deep_reviewing", 99,
            pending ? `${pending} 篇高潜力解读已保存核对进度，Pi 会在后台自动继续` : "推荐判断完成，正在整理今日推荐");
        }
      } else if (job.checkpoint === "evidence_deepening") {
        work.evidenceIds = [];
        work.evidenceCompletedIds = [];
        await saveScanWorkQueue(database, job.id, work);
        await setStage("finalizing", "deep_reviewing", 99, "已跳过旧版原文核验阶段，正在整理今日推荐");
      } else if (job.checkpoint === "finalizing") {
        const candidates = await pendingCandidateQueue(database, space.id, work.deepIds);
        const persistedReviews = await loadPersistedReviews(database, space.id, work.deepCompletedIds);
        return finalizeMain(candidates, persistedReviews);
      }
      return Response.json(await readState(database, space, { advanced: true }), { status: 202 });
    } catch (error) {
      const message = normalizedMonitorError(error).slice(0, 300);
      const failedAt = new Date();
      work.resumeCheckpoint = job.checkpoint;
      await database.batch([
        database.prepare(
          "UPDATE monitor_runs SET status = 'error', next_run_at = ?, lock_token = NULL, lock_expires_at = NULL, error = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?",
        ).bind(new Date(failedAt.getTime() + ERROR_RETRY_MS).toISOString(), message, space.id),
        database.prepare(
          "UPDATE monitor_scan_jobs SET status = 'error', checkpoint = 'retry_pending', current_source = '扫描已暂停，已保存当前进度', work_queue_json = ?, error = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(JSON.stringify(work), message, failedAt.toISOString(), job.id),
      ]);
      await recordReliabilityEvent(database, {
        spaceId: space.id,
        scanJobId: job.id,
        kind: "scan_failed",
        stage: job.checkpoint,
        source: job.current_source,
        outcome: "failed",
        durationMs: Date.now() - stageStartedAt,
        errorCode: monitorErrorCode(error),
        message,
        metadata: {
          progress: job.progress,
          screened: work.screens.length,
          deepCompleted: work.deepCompletedIds.length,
          resumableCheckpoint: work.resumeCheckpoint,
        },
      });
      return Response.json(await readState(database, space), { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to run monitoring" }, { status: 500 });
  } finally {
    if (advanceLockJobId && advanceLockToken) {
      await database.prepare(
        "UPDATE monitor_scan_jobs SET advance_lock_token = NULL, advance_lock_expires_at = NULL WHERE id = ? AND advance_lock_token = ?",
      ).bind(advanceLockJobId, advanceLockToken).run().catch(() => undefined);
    }
  }
}
