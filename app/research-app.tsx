"use client";
import './workspace-access.css';
import {WorkspaceWelcome} from './components/workspace-welcome';
import {WorkspaceAccess} from './components/workspace-access';
import {SpaceManagementList,type ManagedSpace} from './components/space-management-list';
import './space-management.css';
import {PaperPanelNavigation} from './components/paper-panel-navigation';
import type {PaperPanel} from '../lib/workspace-navigation';
import {initializeWorkspaceSession} from '../lib/workspace-initialization';
import type {WorkspaceSession} from '../lib/workspace-identity';
import "./today-focus.css";
import {useTaskBrief} from "./components/use-task-brief";
import {taskBriefOverview} from "../lib/task-brief-presentation.mjs";
import {useLibrarySearch} from "./components/use-library-search";
import {digestOverview} from "../lib/digest-overview.mjs";
import {TodayDiscoveryStatus} from "./components/today-discovery-status";
import { RecommendationMemoryLink } from "./components/recommendation-memory-link";
import { ResearchPreferencesPanel } from "./components/research-preferences-panel";
import {readSavedJson,SavedReadError} from '../lib/saved-read';
import { MemoryResume } from "./components/memory-resume";
import { workspaceFetch as fetch } from "../lib/workspace-request";


import { DemoJourney } from "./components/demo-journey";
import { ModelSettingsPanel } from "./components/model-settings-panel";
import { DraftRecovery } from "./components/draft-recovery";
import { sessionDraftKey, writeSessionDraft, clearSessionDraft } from "../lib/session-draft";
import { ImportProfileReview } from "./components/import-profile-review";
import "./dialog-workspace.css";
import "./navigation-workspace.css";
import { readWorkspaceLocation, workspaceHash, type WorkspaceLocation } from "../lib/workspace-navigation";
import { SectionNavigation } from "./components/section-navigation";
import { ResearchMaintenance } from "./components/research-maintenance";
import { EmailSubscription } from "./components/email-subscription";
import { focusWorkspaceSection } from "../lib/workspace-section-navigation";
import { ResearchSourceSuggestions } from "./components/research-source-suggestions";
import "./components/research-memory-sources.css";
import { QualityReviewStatus, type AbstractPaperStatus } from "./components/quality-review-status";
import { supplementaryReading, fieldBriefReading } from "../lib/supplementary-reading.mjs";

import { FormEvent, type ReactNode, lazy, Suspense, useEffect, useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { MathText } from "./components/math-text";
import { InterfaceIcon, type InterfaceIconName } from "./components/interface-icon";
import { LearningGoalPlanner, LearningPathHeader } from "./components/learning-goal-planner";
import type { GraphDeskPaper } from "./components/graph-research-desk";
import type { GraphTaskContext } from "../lib/graph-task";
import "./components/graph-research-desk.css";
import { GraphTaskNavigation } from "./components/graph-task-navigation";
import { LearningStageNavigation } from "./components/learning-stage-navigation";
import { LearningStageWorkspace } from "./components/learning-stage-workspace";
import { LearningSessionEntry } from "./components/learning-session-entry";
import "./learning-workspace.css";
import "./paper-workspace.css";
import "./comparison-workspace.css";
import "./memory-workspace.css";
import { SynthesisReading } from "./components/synthesis-reading";
import "./components/problem-reading.css";
import "./components/learning-planning.css";
import { SynthesisPreparation } from "./components/synthesis-preparation";
import type { synthesisPreparation } from "../lib/synthesis-preparation";
import { routeMaterialState } from "../lib/route-material-state";
import "./route-reading.css";
import type { WorkbookSource } from "../lib/research-workbook";
import { learningBrowseStep, canChangeLearningStep, nextReadableLearningStep } from "../lib/learning-browse";
import type { ImportSourceKind, ResearchImportRecord, ResearchProfileAnalysis } from "../lib/research-profile";
import { emptyResearchMapState, researchLeadActionableGap, researchRouteLearningSignal, researchRouteOperationalStatus, selectResearchRouteAttention, type ResearchDirectionRole, type ResearchLeadGapOrigin, type ResearchMapState, type ResearchRouteAttentionKind, type ResearchRoutePortfolio, type ResearchTrack, type ResearchTrackPaper, type ResearchTrackRole } from "../lib/research-map";
import { learningDiscoveryDelay, learningPathResultMessage, learningResourcePaperId, type LearningPathState, type LearningPathStep, type LearningResource } from "../lib/learning-path";
import { monitorScanCompletionLabel, shouldWakeLearningQualityQueue } from "../lib/monitor-quality-queue.mjs";
import { isDatabaseVerifiedCitationEdge, isVerifiableSimilarityNeighborEdge, paperNetworkEdgeKey, selectMultiOriginCandidates, selectVerifiableOneHopEdges, type MultiOriginIntent } from "../lib/paper-network";
import type { ResearchNetworkCandidate, ResearchNetworkExpandResponse, ResearchNetworkSeed, ResearchNetworkSimilarityEdge } from "../lib/research-network";
import { archiveQualityStagePresentation, isRecommendationQualityStage, routeDiscoveryPresentation } from "../lib/discovery-archive-semantics.mjs";
import { shouldReclaimMonitorLease } from "../lib/monitor-follower-control.mjs";
import { shouldBlockManualMonitorStart } from "../lib/monitor-runtime-control.mjs";
import { modelConnectionFailureState, modelConnectionProblemCopy } from "../lib/model-connection-state";
import { modelSettingsRequest } from "../lib/model-settings-request";
import { activateModalFocus } from "../lib/modal-focus";
import { briefPaperEntries, remainingBriefEntries, briefRunStatus, datedBriefText, coverageIdentity, scanDisplayProgress, scanFunnel, isReadReference, readingReferences, resumeReading, readingQueueExclusions, nextReadingPaperId } from "../lib/today-presentation.mjs";
import { TodayContinuation } from './components/today-continuation';
import { useWorkspaceNavigation } from "./components/use-workspace-navigation";
import { usePaperNetworkNavigation } from "./components/use-paper-network-navigation";
import { PrimaryLibrary } from "./components/primary-library";
import { CitationFlowWorkbench } from "./components/citation-flow-workbench";
import { ReadingOrderWorkbench } from "./components/reading-order-workbench";
import { learningEvidenceLabel, learningResourceSignals, learningTime, readingStatusLabel, researchPaperYear, researchRoleLabel } from "../lib/research-workspace-presentation";
import {
  PaperNetworkGraph,
  buildNetworkPaperNodes,
  researchNetworkOriginKey,
  candidateBelongsToTab,
  networkCandidateFitLabel,
  currentOriginEvidenceCount,
  researchNetworkSourceLabel,
  isResearchNetworkExpandResponse,
  researchNetworkHasNoNewCandidates,
  researchNetworkIssueSummary,
  buildExternalNetworkPaperNodes,
  externalNetworkEdges,
  networkRelationLabel,
  networkEvidenceLabel,
  paperNetworkSourceNotice,
  type NetworkPaperNode,
  type PaperDiscoveryTab,
} from "./components/paper-network-graph";
const AnswerMarkdown = lazy(() => import("./components/answer-markdown").then(module => ({ default: module.AnswerMarkdown })));
const GraphResearchDesk = lazy(() => import("./components/graph-research-desk").then(module => ({ default: module.GraphResearchDesk })));
const LibraryExplorer = lazy(() => import("./components/library-explorer").then(module => ({ default: module.LibraryExplorer })));
const PaperReadingContent = lazy(() => import("./components/paper-reading-content").then(module => ({ default: module.PaperReadingContent })));
const ReadingCalendar = lazy(() => import("./components/reading-calendar").then(module => ({ default: module.ReadingCalendar })));
const ResearchEntry = lazy(() => import("./components/research-entry").then(module => ({ default: module.ResearchEntry })));
const ResearchLeads = lazy(() => import("./components/research-leads").then(module => ({ default: module.ResearchLeads })));
const ResearchMemoryNotebook = lazy(() => import("./components/research-memory-notebook").then(module => ({ default: module.ResearchMemoryNotebook })));
const ResearchStart = lazy(() => import("./components/research-start").then(module => ({ default: module.ResearchStart })));
const ResearchWorkbook = lazy(() => import("./components/research-workbook").then(module => ({ default: module.ResearchWorkbook })));
const RouteReferenceViews = lazy(() => import("./components/route-reference-views").then(module => ({ default: module.RouteReferenceViews })));
const RouteStart = lazy(() => import("./components/route-start").then(module => ({ default: module.RouteStart })));
const RouteEvolutionWorkbench = lazy(() => import("./components/route-evolution-workbench").then(module => ({ default: module.RouteEvolutionWorkbench })));

function DeferredWorkspacePanel({ locale, children }: { locale: "zh" | "en"; children: ReactNode }) {
  return <Suspense fallback={<section className="pi-deferred-surface" role="status"><span aria-hidden="true">◌</span>{locale === "zh" ? "正在载入工作区…" : "Loading workspace…"}</section>}>{children}</Suspense>;
}

type Locale = "zh" | "en";
type ModelConnectionState = "unconfigured" | "checking" | "connected" | "invalid" | ReturnType<typeof modelConnectionFailureState>;
type View = "today" | "threads" | "thread-detail" | "learn" | "library" | "memory" | "paper-detail" | "workbook";
type LibraryFilter = "inbox" | "accepted" | "all" | "dismissed";
type InboxFilter = "all" | "unseen" | "seen" | "snoozed";
type LibraryStageFilter = "all" | "evaluated";
type LibrarySort = "priority" | "newest" | "quality";
type ResearchMapMode = "directions" | "papers";
type ResearchRouteTab = "start" | "problem" | "assessment" | "evidence" | "gaps" | "agenda";
type PaperNetworkBuildPhase = "verified" | "pi" | null;
const SHOW_INTERNAL_QUALITY_UI = false;
type Space = {
  id: string;
  name: string;
  memberName: string;
  description: string;
  accent: string;
  preferredLocale?: string;
  createdAt?: string;
  deletedAt?:string;
};
type User = { userId: string; displayName: string; email: string; fullName: string | null };
type Localized = { zh: string; en: string };
type RouteDiscoveryKind = "route_foundation" | "route_milestone" | "route_frontier" | "route_gap" | "route_synthesis" | "route_network" | "route_version_shadow" | "route_learning" | "route_classic" | "route_search";
type RouteDiscoveryType = "route_search" | "gap" | "synthesis" | "citation_network";
type MonitorPaper = {
  id: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  horizon: "days" | "months" | "years";
  citationCount: number;
  relevanceScore: number;
  discoveredAt: string;
  recommendedAt?: string | null;
  recommendationOrigin?: "current_discovery" | "backlog_review";
  summaryZh: string;
  summaryEn: string;
  demoReadingContext?: {paperId:string;evidenceZh:string;evidenceEn:string} | null;
  whyReadZh: string;
  whyReadEn: string;
  qualityScore: number;
  priorityVenue: boolean;
  analysisSource: string;
  screeningReason: string;
  discoverySources?: Array<{ key: string; labelZh: string; labelEn: string }>;
  userState: "unseen" | "seen" | "snoozed" | "accepted" | "dismissed";
  showCount: number;
  saved: boolean;
  feedback: string | null;
  firstShownAt: string | null;
  lastShownAt: string | null;
  openedAt: string | null;
  snoozedUntil: string | null;
  readingStatus: "unread" | "queued" | "reading" | "read" | "mastered" | "cited";
  readingNote: string;
  proposedRecommendationTier: "must_read" | "browse" | "reserve";
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
  verificationStatus: "not_required" | "pending" | "verified" | "revised" | "degraded";
  verificationCoverageScore: number;
  verificationPhase?: "not_required" | "awaiting_audit" | "awaiting_correction" | "awaiting_recheck" | "verified" | "revised" | "withheld";
  discoveryOrigin?: {
    kind: RouteDiscoveryKind;
    trackId: string;
    trackTitleZh: string;
    trackTitleEn: string;
    sourceLabelZh: string;
    sourceLabelEn: string;
    impactZh: string;
    impactEn: string;
  } | null;
  discoveryType?: RouteDiscoveryType | null;
  discoveryTrack?: { id: string; titleZh: string; titleEn: string } | null;
  qualityStage?: "awaiting_evidence" | "queued" | "discovered" | "reviewed" | "reviewing" | "recommended" | null;
};
type FeedbackRouteEvidence = {
  status: "pending" | "confirmed" | "dismissed";
  trackId: string;
  trackTitleZh: string;
  trackTitleEn: string;
  qualityEligible: boolean;
  formal: boolean;
  changed: boolean;
};
type ResearchSynthesisSource = {
  claimId: string;
  paperId: string;
  title: string;
  authors: string;
  venue: string;
  publishedAt: string | null;
  evidenceQuote: string;
  locator: string;
  sourceUrl: string;
  evidenceLevel: "metadata" | "abstract" | "fulltext";
};
type ResearchSynthesisStatement = {
  id: string;
  kind: "consensus" | "disagreement" | "qualification" | "method_lineage" | "evidence_gap";
  titleZh: string;
  titleEn: string;
  textZh: string;
  textEn: string;
  confidence: number;
  sourcePaperIds: string[];
  sources: ResearchSynthesisSource[];
};
type ResearchSynthesis = {
  status: "empty" | "generating" | "ready" | "partial" | "error";
  questionZh: string;
  questionEn: string;
  overviewZh: string;
  overviewEn: string;
  changeSummaryZh: string;
  changeSummaryEn: string;
  nextSearchQuery: string;
  nextSearchSourceStatementId: string | null;
  confidence: number;
  sourcePaperCount: number;
  fulltextPaperCount: number;
  claimCount: number;
  availablePaperCount: number;
  availableFulltextPaperCount: number;
  availableClaimCount: number;
  preparation?: ReturnType<typeof synthesisPreparation>;
  canGenerate: boolean;
  stale: boolean;
  model: string;
  error: string | null;
  analyzedAt: string | null;
  updatedAt: string | null;
  statements: ResearchSynthesisStatement[];
};
type ResearchProblemHypothesis = {
  id: string;
  statement: string;
  rationale: string;
  status: "proposed" | "confirmed" | "rejected";
  confidence: number;
  sourceStatementIds: string[];
  position: number;
};
type ResearchProblemAssessment = {
  id: string;
  inputRevision: string;
  summaryZh: string;
  summaryEn: string;
  changeZh: string;
  changeEn: string;
  uncertaintyZh: string;
  uncertaintyEn: string;
  nextDecisionZh: string;
  nextDecisionEn: string;
  nextSearchQuery: string;
  hypothesisImpacts: Array<{ hypothesisId: string; relation: "supports" | "challenges" | "qualifies" | "method" | "gap"; explanationZh: string; explanationEn: string; confidence: number; sourceStatementIds: string[] }>;
  sourceStatementIds: string[];
  confidence: number;
  model: string;
  createdAt: string;
  stale: boolean;
};
type ResearchProblemAction = {
  id: string;
  assessmentId: string | null;
  kind: "read" | "compare" | "verify" | "search" | "decide";
  titleZh: string;
  titleEn: string;
  rationaleZh: string;
  rationaleEn: string;
  status: "proposed" | "accepted" | "done" | "dismissed";
  position: number;
  completedAt: string | null;
  updatedAt: string;
  run: null | {
    id: string;
    status: "queued" | "running" | "ready" | "failed";
    progress: number;
    stage: string;
    inputRevision: string;
    headlineZh: string;
    headlineEn: string;
    resultZh: string;
    resultEn: string;
    decisionZh: string;
    decisionEn: string;
    limitationsZh: string;
    limitationsEn: string;
    searchQuery: string;
    deliverable: {
      steps?: Array<{ titleZh: string; titleEn: string; detailZh: string; detailEn: string; paperIds: string[]; claimIds: string[] }>;
      comparisonRows?: Array<{ dimensionZh: string; dimensionEn: string; findingZh: string; findingEn: string; paperIds: string[]; claimIds: string[] }>;
    };
    sourcePaperIds: string[];
    sourceClaimIds: string[];
    sourcePapers: Array<{ id: string; title: string; authors: string; venue: string; publishedAt: string | null; url: string }>;
    model: string;
    verificationStatus: "pending" | "verified" | "revised" | "degraded";
    verificationCoverageScore: number;
    error: string | null;
    startedAt: string;
    completedAt: string | null;
    updatedAt: string;
  };
};
type ResearchProblemStage = "literature" | "theory" | "method" | "experiment" | "writing";
type ResearchProblemState = {
  problem: null | {
    id: string;
    status: "draft" | "active" | "paused" | "resolved";
    workingLanguage: "zh" | "en";
    question: string;
    objective: string;
    scope: string;
    successCriteria: string;
    stage: ResearchProblemStage;
    model: string;
    sourceRevision: string;
    confirmedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  hypotheses: ResearchProblemHypothesis[];
  assessment: ResearchProblemAssessment | null;
  actions: ResearchProblemAction[];
  evidence: { synthesisReady: boolean; statementCount: number; synthesisRevision: string; canDraft: boolean; canAssess: boolean };
};
type MonitorPreferences = {
  profileKey: string;
  profileNameZh: string;
  profileNameEn: string;
  priorityVenues: string[];
  explorationMode: "focused" | "balanced" | "open";
  trackedAuthors: string[];
  userModified: boolean;
};
type PreferenceSignal = {
  id: string;
  layer: "explicit" | "inferred";
  kind: string;
  labelZh: string;
  labelEn: string;
  evidence: string;
  confidence: number;
  effectiveConfidence: number;
  sourceType: string;
  sourcePaperId?: string | null;
  observedAt: string;
  expiresAt: string | null;
};
type ExplorationBranch = {
  id: string;
  horizon: "days" | "months" | "years";
  sourceKey: string;
  channel: string;
  queryText: string;
  nextCursor: number;
  attempts: number;
  candidates: number;
  newCandidates: number;
  discoveryYield: number;
  zeroYieldStreak: number;
  status: "exploring" | "revisit" | "cooling" | "error";
  cooldownUntil: string | null;
  firstScannedAt: string | null;
  lastScannedAt: string | null;
  error: string | null;
};
type ReadingMemory = {
  paperId: string;
  title: string;
  authors: string;
  venue: string;
  readingStatus: string;
  noteExcerpt: string;
  analysisStatus: string;
  takeawayZh: string;
  takeawayEn: string;
  methodsZh: string[];
  methodsEn: string[];
  questionsZh: string[];
  questionsEn: string[];
  connectionsZh: string[];
  connectionsEn: string[];
  topicsZh: string[];
  topicsEn: string[];
  trackId: string | null;
  model: string;
  error: string | null;
  analyzedAt: string | null;
  updatedAt: string;
};
type ResearchNotification = {
  id: string;
  kind: string;
  priority: string;
  titleZh: string;
  titleEn: string;
  bodyZh: string;
  bodyEn: string;
  actionView: string;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};
const ACTION_NOTIFICATION_KINDS = new Set(["must_read", "route_change", "weekly_review", "reading_reminder"]);
type MonitorStatus = "idle" | "scanning" | "discovering_days" | "discovering_months" | "discovering_years" | "deduplicating" | "screening" | "deep_reviewing" | "reviewing" | "saving" | "briefing" | "ready" | "error";
type MonitorState = {
  status: MonitorStatus;
  lastRunAt: string | null;
  nextRunAt: string | null;
  newCount: number;
  scannedCount: number;
  knownCount: number;
  explorationRound?: number;
  error: string | null;
  alreadyAdvancing?: boolean;
  alreadyRunning?: boolean;
  leaseOwner?: boolean;
  leaseToken?: string | null;
  leaseGeneration?: number;
  leaseExpiresAt?: string | null;
  idempotentReplay?: boolean;
  automationDeferred?: boolean;
  cadenceHours: number;
  lastTrigger?: string;
  automation?: {
    enabled: boolean;
    paused?: boolean;
    pauseReason?: "unattended_runs" | "inactive" | "daily_budget" | "model_unavailable" | "space_deleted" | null;
    pauseMessageZh?: string;
    pauseMessageEn?: string;
    pausedAt?: string | null;
    lastUserActivityAt?: string | null;
    scheduledRunsSinceActivity?: number;
    pendingRecommendations?: number;
    dailyRequests?: number;
    dailyTokens?: number;
    limits?: { scheduledRunsWithoutActivity: number; inactiveDays: number; dailyRequests: number; dailyTokens: number };
    cadenceHours: number;
    schedulerCheckMinutes: number;
    errorRetryMinutes: number;
    singleRunLock: boolean;
  };
  analysisBudget?: {
    used: number;
    limit: number | null;
    remaining: number | null;
    minimumToStart: number;
    available: boolean;
    fullAvailable?: boolean;
    compactAvailable?: boolean;
    recommendedMode?: "full" | "fresh_only" | "wait";
    compactMinimum?: number;
    estimatedFullScans?: number | null;
    backgroundRemaining?: number | null;
    backgroundAvailable?: boolean;
    protectedForOtherSpaces?: number;
    resetsAt: string;
    unlimited?: boolean;
  };
  source: string;
  horizons: string[];
  preferences?: MonitorPreferences;
  papers: MonitorPaper[];
  qualityQueue?: { pendingCount: number; verificationCount: number; retryCount: number; awaitingAbstractCount: number; abstractRetryAt: number | null; observedAt: string; abstractPapers?: AbstractPaperStatus[] } | null;
  savedCandidatePapers?: MonitorPaper[];
  historyPapers?: MonitorPaper[];
  historyCounts?: { all: number; inbox: number; unseen: number; seen: number; snoozed: number; accepted: number; saved: number; dismissed: number; reading?: Record<string, number> };
  scanJob?: {
    id: string;
    status: string;
    currentHorizon: string;
    currentSource: string;
    progress: number;
    discoveredCount: number;
    reviewedCount: number;
    recommendedCount: number;
    newCandidateCount?: number;
    duplicateCount?: number;
    rejectedCount?: number;
    candidateCount?: number;
    deepCandidateCount?: number;
    deepCompletedCount?: number;
    deepDeferredCount?: number;
    verificationTargetCount?: number;
    verificationCompletedCount?: number;
    verificationPendingCount?: number;
    horizonStats?: Array<{
      horizon: "days" | "months" | "years";
      status: "pending" | "searching" | "complete";
      candidates: number | null;
      rawCandidates: number | null;
      newCandidates: number | null;
      queued: number | null;
      screened: number;
    }>;
    pipelineVersion?: string;
    scanMode?: "full" | "fresh_only" | "quality_queue";
    needsRefresh?: boolean;
    attempt?: number;
    triggerSource?: string;
    resumeOfJobId?: string | null;
    checkpoint?: string;
    failureKind?: string;
    failureSource?: string;
    retryCount?: number;
    nextRetryAt?: string | null;
    lastSuccessfulStage?: string;
    lastSuccessfulSource?: string;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
  } | null;
  coverage?: Array<{
    sourceKey: string;
    channel: string;
    attempts: number;
    candidates: number;
    newCandidates: number;
    lastScannedAt: string | null;
    healthy: boolean;
  }>;
  queryPlan?: {
    planDate: string;
    explorationMode: string;
    queryCount: number;
    rationaleZh: string;
    rationaleEn: string;
    model: string;
    degraded: boolean;
  } | null;
  preferenceSignals?: PreferenceSignal[];
  mapChanges?: Array<{
    id: string;
    kind: string;
    titleZh: string;
    titleEn: string;
    summaryZh: string;
    summaryEn: string;
    confidence: number;
    createdAt: string;
    trackTitleZh: string;
    trackTitleEn: string;
    paperId: string;
    paperTitle: string;
  }>;
  qualityMetrics?: {
    windowDays: number;
    scans: number;
    candidates: number;
    reviewed: number;
    recommended: number;
    recommendationYield: number;
    decisions: number;
    accepted: number;
    dismissed: number;
    acceptanceRate: number;
    requests: number;
    inputTokens: number;
    outputTokens: number;
  };
  discoveryPerformance?: {
    sources: Array<{ sourceKey: string; channel: string; papers: number; accepted: number; dismissed: number; acceptanceRate: number }>;
    tracks: Array<{ trackId: string; titleZh: string; titleEn: string; papers: number; accepted: number; acceptanceRate: number }>;
  };
  operationsDashboard?: {
    periodDays: number;
    totals: { scans: number; candidates: number; newCandidates: number; duplicatesAvoided: number; reviewed: number; recommended: number; rejected: number; tokens: number; recommendationYield: number; duplicateAvoidanceRate: number; tokensPerRecommendation: number; acceptanceRate: number };
    daily: Array<{ date: string; scans: number; candidates: number; newCandidates: number; duplicatesAvoided: number; reviewed: number; recommended: number; rejected: number; tokens: number }>;
    horizons: Array<{ horizon: "days" | "months" | "years"; branches: number; attempts: number; candidates: number; newCandidates: number; cooling: number; discoveryYield: number }>;
    tiers: Record<string, number>;
    feedbackReasons: Array<{ reasonCode: string; decision: string; count: number }>;
  };
  explorationLedger?: ExplorationBranch[];
  readingMemories?: ReadingMemory[];
  dailyBrief?: {
    date: string;
    isCurrent: boolean;
    status: string;
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
    error: string | null;
    updatedAt: string;
  } | null;
  weeklyReview?: {
    weekKey: string;
    status: string;
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
    error: string | null;
    updatedAt: string;
  } | null;
  notifications?: ResearchNotification[];
  unreadNotificationCount?: number;
  pilotEvaluation?: {
    targetDays: number;
    elapsedDays: number;
    firstScanAt: string | null;
    complete: boolean;
    attempts: number;
    succeeded: number;
    failed: number;
    activeDays: number;
    criteria: Array<{ id: string; status: "pass" | "watch" | "waiting"; value: number; target: number }>;
    summary: { reliability: number; acceptanceRate: number; wrongTypeReports: number; continuity: number; activeHorizons: number; duplicatesAvoided: number; tokensPerRecommendation: number };
  };
  suggestedAuthors?: string[];
  cached?: boolean;
  throttled?: boolean;
  retryAfterMinutes?: number;
};
type ImportedMaterial = { name: string; text: string; chars: number; truncated: boolean };

const copy = {
  zh: {
    today: "今日",
    threads: "研究",
    learn: "学习",
    library: "论文库",
    memory: "研究记忆",
    researchRadar: "研究雷达",
    knowledge: "知识与记忆",
    currentSpace: "当前研究空间",
    switchSpace: "切换研究空间",
    newSpace: "新建研究空间",
    privateSpace: "独立空间",
    isolated: "数据与其他方向隔离",
    askPlaceholder: "向 Pi 提问，或搜索当前研究空间",
    askPi: "询问 Pi",
    connected: "AI 模型已连接",
    setupRequired: "AI 模型待配置",
    workspaceLabel: "匿名浏览器工作区",
    todayDate: "2026 年 8 月 18 日 · 星期二",
    goodMorning: "早上好",
    reviewed: "Pi 正在监控三个研究时间层级",
    matched: "每个空间超过 24 小时后，会在你首次打开时自动扫描。",
    attention: "篇为本轮新发现",
    briefTime: "主题、重点期刊与学术图谱共同发现；DeepSeek 负责筛选与撰写",
    mustRead: "必须读",
    worthReading: "值得读",
    whyYou: "为什么与你有关",
    actuallyNew: "真正的新意",
    relevantTo: "关联研究线索",
    openAnalysis: "查看完整分析",
    save: "收藏",
    saved: "已收藏",
    relevant: "接受",
    notRelevant: "不相关",
    readLater: "稍后读",
    remindLater: "将在 3 天后再次提醒",
    inbox: "待处理",
    accepted: "已接受",
    ignored: "已忽略",
    unseen: "未看过",
    seenPending: "看过未处理",
    snoozed: "稍后提醒",
    historyOverview: "阅读收件箱",
    historyPromise: "只有真正进入屏幕并停留的论文才算看过；未决定的论文会按节奏再次出现。",
    historySearch: "搜索标题、作者、期刊或论文介绍",
    sortPriority: "优先处理",
    sortNewest: "最新发现",
    sortQuality: "质量最高",
    returnPending: "回到待处理",
    nextReminder: "再次进入推荐队列",
    neverViewed: "尚未实际看到",
    decisionNeeded: "等待你的决定",
    viewAnalysis: "查看分析",
    agentNote: "Pi 的本轮判断",
    spacePulse: "空间概况",
    activeThreads: "活跃线索",
    savedPapers: "核心论文",
    memorySignals: "记忆信号",
    quietThreads: "安静的线索",
    noUpdates: "今天没有重要进展",
    quietPromise: "Pi 不会为了活跃而制造推荐。",
    recentChanges: "研究变化",
    last24h: "过去 24 小时",
    allThreads: "所有研究线索",
    threadSubtitle: "持续监测的具体科研问题，而不是关键词订阅。",
    createThread: "新建线索",
    researchQuestion: "研究问题",
    understands: "Pi 对你的理解",
    interested: "主要关注",
    lessInterested: "较少关注",
    developments: "近期进展",
    monitoring: "监测设置",
    cadence: "每日一次",
    backThreads: "返回研究线索",
    buildPath: "构建学习路径",
    learnTitle: "学习路径",
    learnIntro: "Pi 会根据当前空间的知识状态，跳过你已经掌握的内容，构建到研究前沿的最短有效路径。",
    suggested: "基于当前研究空间推荐",
    prerequisites: "先修知识",
    foundation: "基础工作",
    modern: "现代框架",
    frontier: "当前前沿",
    whyRead: "为什么读",
    readSections: "建议阅读",
    startPath: "开始这条路径",
    libraryTitle: "论文收件箱与历史",
    libraryIntro: "未处理论文会一直保留并按节奏再次提醒；接受、收藏和忽略记录也不会丢失。",
    all: "全部",
    reading: "阅读中",
    finished: "已读完",
    added: "加入时间",
    status: "状态",
    memoryTitle: "Pi 在这个空间里记住了什么",
    memoryIntro: "每个研究空间拥有独立的兴趣、知识、活动和偏好记忆。",
    interestMemory: "兴趣记忆",
    knowledgeMemory: "知识记忆",
    activityMemory: "活动记忆",
    preferenceMemory: "偏好记忆",
    isolationBoundary: "空间隔离边界",
    isolationBody: "当前空间的提问、反馈、论文和偏好只会用于当前方向。切换空间后，Pi 会加载另一套独立上下文。",
    accountNote: "可以通过此浏览器使用。连接 ChatGPT 后，可在其他设备恢复工作区。",
    paperBack: "返回今日",
    recommendation: "推荐判断",
    coreContribution: "核心贡献",
    relation: "与你研究的关系",
    suggestedReading: "如果只有 20 分钟",
    askAboutPaper: "围绕这篇论文提问",
    spaceDialogTitle: "你的研究空间",
    spaceDialogIntro: "管理研究方向、现有空间与访问方式。",
    threadsCount: "条研究线索",
    papersCount: "篇论文",
    createSpaceTitle: "创建独立研究空间",
    spaceName: "空间名称",
    memberName: "使用者名称",
    spaceScope: "研究范围",
    cancel: "取消",
    create: "创建空间",
    creating: "正在创建",
    askTitle: "询问当前研究空间",
    askScope: "Pi 只会使用当前空间的研究记忆。",
    send: "发送",
    thinking: "Pi 正在结合研究记忆分析",
    previewMode: "安全预览",
    modelAnswer: "AI 实时回答",
    askExample: "最近哪些工作改变了高斯极值问题的核心假设？",
    close: "关闭",
    feedbackSaved: "已写入当前研究空间的记忆",
    profile: "工作区与设置",
    signOut: "退出",
    liveMonitor: "DeepSeek 审核后的真实论文",
    monitorIntro: "主题、重点期刊、arXiv、OpenAlex、Semantic Scholar 与引用网络共同补充候选，DeepSeek 按研究空间逐篇判断并撰写论文介绍和适读理由。",
    daysHorizon: "近 14 天",
    monthsHorizon: "近 6 个月",
    yearsHorizon: "近 5 年",
    daysFocus: "主打最新：快速捕捉刚出现的问题、结果和方法。",
    monthsFocus: "新且高质量：兼顾时效、相关性、来源质量与早期引用信号。",
    yearsFocus: "高质量且有用：优先可复用、能指导方法或研究路线的工作。",
    autoVisit: "后台每 10 分钟检查到期空间；每个研究空间每 24 小时最多完成一次常规扫描。打开页面时会立即显示上次结果，并继续展示本轮真实进度。",
    lastScan: "上次扫描",
    nextScan: "下次可扫描",
    neverScanned: "尚未扫描",
    scanning: "正在扫描主题、重点期刊与论文网络",
    scanReady: "扫描完成",
    scanError: "扫描暂时失败",
    scanNow: "立即扫描",
    scanningButton: "扫描中",
    knownPapers: "篇已去重记录",
    scannedPapers: "条入选候选",
    dedupeNote: "按 DOI 或标题指纹去重；新候选才会消耗完整评审 token。已通过的论文复用原有解读，未处理时按 1、3、14 天节奏再次提醒；被淘汰的候选仅在规则变化或满 90 天后重新审核。",
    noLivePapers: "当前没有通过 DeepSeek 严格评审的论文，Pi 不会用不相关结果填满列表。",
    manualCooling: "手动扫描一小时内只执行一次，已返回缓存结果。",
    prioritySources: "重点期刊与会议",
    editSources: "设置重点来源",
    systemProvided: "Pi 自动提供",
    userCustomized: "用户已修改",
    sourceSettingsTitle: "设置重点期刊与会议",
    sourceSettingsIntro: "Pi 已根据当前研究空间识别领域并提供默认来源。每行填写一个期刊或会议；你的修改只影响当前空间。",
    detectedDomain: "Pi 识别的领域",
    venuesLabel: "重点来源（每行一个）",
    saveSources: "保存并重新扫描",
    resetSources: "恢复 Pi 默认",
    savingSources: "正在保存",
    sourcesSaved: "重点来源已保存，Pi 正在按新规则重新扫描",
    introLabel: "论文介绍",
    whySuitable: "为什么适合读",
    priorityVenueLabel: "重点来源",
    aiBrief: "DeepSeek 评审",
    metadataBrief: "等待模型评审",
    openOriginal: "打开原文",
    citations: "引用",
    qualityScore: "推荐分",
    relevanceScoreLabel: "相关分",
    noHorizonPaper: "本轮没有足够强的推荐，Pi 不会为了填满列表而凑数。",
    realBrief: "真实研究简报",
    realBriefIntro: "优先展示你尚未处理、或到期需要再次提醒的真实论文。",
    topRecommendation: "当前首要推荐",
    moreRealPapers: "更多待处理推荐",
    realPapers: "篇真实论文",
    scanCandidates: "入选候选",
    aiAnalyzed: "已由 Pi 解读",
    recentDiscoveries: "最近发现",
    publicationInfo: "论文信息",
    recommendationSignals: "推荐信号",
    sourceRecord: "来源记录",
    currentSpaceFit: "当前空间匹配",
    shareDaily: "分享今日推荐",
    sharePaper: "生成单篇快照",
    creatingShare: "正在生成快照",
    snapshotCopied: "公开快照链接已复制，可以直接转发",
    snapshotShared: "公开快照已生成",
    snapshotOpened: "公开快照已在新窗口打开",
    shareFailed: "快照生成失败，请稍后重试",
    importResearch: "导入 AI 项目 / 研究资料",
    importIntro: "让 Pi 从聊天记录、已发表论文和公开项目材料中提取真实关注、知识基础、未解问题，并扩展可继续研究的方向。",
    importSafetyTitle: "上传前请确认资料可以公开处理",
    importSafetyBody: "不要上传未发表稿件、投稿或审稿材料、未公开项目书、内部资料、专利前材料、个人隐私或任何涉密内容。",
    importSafetyProcess: "文件仅在本次分析中提取文本并发送给 DeepSeek；Pi 不保存原文件或原始正文。生成的画像草稿会暂存，放弃即删除，确认后才用于推荐。",
    singleFile: "选择单个或多个文件",
    folderUpload: "选择文件夹",
    pasteConversation: "也可以粘贴聊天记录",
    analyzeMaterials: "生成研究画像草稿",
    analyzingMaterials: "DeepSeek 正在分析资料",
    confirmPublic: "我确认所选资料已经公开、可合法处理，不含未发表或涉密内容。",
    importDraftTitle: "研究画像草稿",
    importDraftNote: "这是 AI 推断，尚未影响推荐。请检查、修改或删除不准确的内容，再确认写入。",
    mainDirection: "提炼后的主方向",
    profileSummary: "研究画像摘要",
    subdirectionsLabel: "子方向与长期兴趣",
    openQuestionsLabel: "关注与未解决问题",
    futureDirections: "可继续研究的相关方向",
    evidenceConfidence: "证据置信度",
    confirmProfile: "确认写入当前空间",
    discardDraft: "放弃这份草稿",
    profileConfirmed: "研究画像已写入当前空间，之后的检索与推荐会使用它",
    rawNotStored: "原文件和原始正文不会保存",
    selectedMaterials: "已选择的资料",
    noMaterials: "尚未选择文件",
    supportedFiles: "支持 PDF、DOCX、JSON、Markdown、TXT、HTML 和 CSV；最多 12 个文件。",
    suspiciousBlocked: "疑似未发表、送审或涉密文件已被阻止",
    importFailed: "资料分析失败，请检查文件后重试",
    profileSources: "画像来源",
  },
  en: {
    today: "Today",
    threads: "Research",
    learn: "Learn",
    library: "Library",
    memory: "Research Memory",
    researchRadar: "Research radar",
    knowledge: "Knowledge & memory",
    currentSpace: "Current research space",
    switchSpace: "Switch research space",
    newSpace: "New research space",
    privateSpace: "Isolated space",
    isolated: "Data is isolated from other directions",
    askPlaceholder: "Ask Pi or search this research space",
    askPi: "Ask Pi",
    connected: "AI model connected",
    setupRequired: "AI model setup required",
    workspaceLabel: "Anonymous browser workspace",
    todayDate: "Tuesday, August 18, 2026",
    goodMorning: "Good morning",
    reviewed: "Pi monitors three research horizons",
    matched: "Each space scans on its first visit after the 24-hour window expires.",
    attention: "new in this scan",
    briefTime: "Topics, priority journals, and academic graphs discover candidates; DeepSeek screens and writes every recommendation",
    mustRead: "Must read",
    worthReading: "Worth reading",
    whyYou: "Why it matters to you",
    actuallyNew: "What is actually new",
    relevantTo: "Relevant thread",
    openAnalysis: "Open full analysis",
    save: "Save",
    saved: "Saved",
    relevant: "Accept",
    notRelevant: "Not relevant",
    readLater: "Read later",
    remindLater: "Pi will remind you again in 3 days",
    inbox: "Inbox",
    accepted: "Accepted",
    ignored: "Ignored",
    unseen: "Unseen",
    seenPending: "Seen, undecided",
    snoozed: "Remind later",
    historyOverview: "Reading inbox",
    historyPromise: "A paper counts as seen only after it actually enters the viewport. Undecided papers return on a deliberate cadence.",
    historySearch: "Search title, author, venue, or brief",
    sortPriority: "Action priority",
    sortNewest: "Newest found",
    sortQuality: "Highest quality",
    returnPending: "Return to inbox",
    nextReminder: "Returns to recommendations",
    neverViewed: "Not actually viewed",
    decisionNeeded: "Waiting for your decision",
    viewAnalysis: "View analysis",
    agentNote: "Pi's scan judgment",
    spacePulse: "Space pulse",
    activeThreads: "Active threads",
    savedPapers: "Core papers",
    memorySignals: "Memory signals",
    quietThreads: "Quiet threads",
    noUpdates: "No significant updates today",
    quietPromise: "Pi will not recommend for the sake of activity.",
    recentChanges: "Research changes",
    last24h: "Past 24 hours",
    allThreads: "All research threads",
    threadSubtitle: "Specific research questions under continuous monitoring—not keyword subscriptions.",
    createThread: "New thread",
    researchQuestion: "Research question",
    understands: "What Pi understands",
    interested: "Mainly interested in",
    lessInterested: "Less interested in",
    developments: "Recent developments",
    monitoring: "Monitoring",
    cadence: "Once daily",
    backThreads: "Back to threads",
    buildPath: "Build learning path",
    learnTitle: "Learning path",
    learnIntro: "Pi uses this space's knowledge state to skip what you already know and build the shortest effective path to the frontier.",
    suggested: "Suggested from this research space",
    prerequisites: "Prerequisites",
    foundation: "Foundations",
    modern: "Modern formulation",
    frontier: "Current frontier",
    whyRead: "Why read it",
    readSections: "Read",
    startPath: "Start this path",
    libraryTitle: "Paper inbox & history",
    libraryIntro: "Unresolved papers stay available and resurface on a measured schedule; accepted, saved, and ignored records remain in history.",
    all: "All",
    reading: "Reading",
    finished: "Finished",
    added: "Added",
    status: "Status",
    memoryTitle: "What Pi remembers in this space",
    memoryIntro: "Every research space has its own interest, knowledge, activity, and preference memory.",
    interestMemory: "Interest memory",
    knowledgeMemory: "Knowledge memory",
    activityMemory: "Activity memory",
    preferenceMemory: "Preference memory",
    isolationBoundary: "Space isolation boundary",
    isolationBody: "Questions, feedback, papers, and preferences in this space are used only for this direction. Switching spaces loads a separate context.",
    accountNote: "Use this browser, or connect ChatGPT to recover your workspace on other devices.",
    paperBack: "Back to Today",
    recommendation: "Recommendation",
    coreContribution: "Core contribution",
    relation: "Relation to your research",
    suggestedReading: "If you only have 20 minutes",
    askAboutPaper: "Ask about this paper",
    spaceDialogTitle: "Your research spaces",
    spaceDialogIntro: "Manage research directions, saved spaces and workspace access.",
    threadsCount: "threads",
    papersCount: "papers",
    createSpaceTitle: "Create an isolated research space",
    spaceName: "Space name",
    memberName: "Researcher name",
    spaceScope: "Research scope",
    cancel: "Cancel",
    create: "Create space",
    creating: "Creating",
    askTitle: "Ask the current research space",
    askScope: "Pi will use only this space's research memory.",
    send: "Send",
    thinking: "Pi is analyzing against your research memory",
    previewMode: "Safe preview",
    modelAnswer: "Live AI answer",
    askExample: "Which recent works changed the core assumptions in Gaussian extremality?",
    close: "Close",
    feedbackSaved: "Saved to this research space's memory",
    profile: "Workspace & settings",
    signOut: "Sign out",
    liveMonitor: "Real papers approved by DeepSeek",
    monitorIntro: "Topics, priority journals, arXiv, OpenAlex, Semantic Scholar, and citation frontiers supply candidates; DeepSeek judges each one against this research space and writes the briefing.",
    daysHorizon: "Past 14 days",
    monthsHorizon: "Past 6 months",
    yearsHorizon: "Past 5 years",
    daysFocus: "Newest first: catch problems, results, and methods that just appeared.",
    monthsFocus: "New and high quality: balance recency, relevance, venue quality, and early citation signals.",
    yearsFocus: "High quality and useful: prioritize reusable work that guides methods or research direction.",
    autoVisit: "The background checks due spaces every 10 minutes; each research space completes at most one routine scan every 24 hours. Opening the page shows the last results immediately while real progress continues.",
    lastScan: "Last scan",
    nextScan: "Next eligible scan",
    neverScanned: "Not scanned yet",
    scanning: "Scanning topics, priority journals, and paper networks",
    scanReady: "Scan complete",
    scanError: "Scan temporarily failed",
    scanNow: "Scan now",
    scanningButton: "Scanning",
    knownPapers: "deduplicated papers",
    scannedPapers: "shortlisted candidates",
    dedupeNote: "Deduplicated by DOI or title fingerprint. Only new candidates consume a full review. Approved papers reuse their existing brief and resurface after 1, 3, then 14 days while unresolved; rejected candidates are reconsidered only after rules change or 90 days.",
    noLivePapers: "No paper passed DeepSeek's strict review in this scan; Pi will not fill the list with weak matches.",
    manualCooling: "Manual scans run at most once per hour; cached results were returned.",
    prioritySources: "Priority journals & conferences",
    editSources: "Set priority sources",
    systemProvided: "Provided by Pi",
    userCustomized: "Customized by user",
    sourceSettingsTitle: "Set priority journals and conferences",
    sourceSettingsIntro: "Pi inferred this space's field and supplied defaults. Enter one journal or conference per line; changes apply only to this space.",
    detectedDomain: "Field inferred by Pi",
    venuesLabel: "Priority sources (one per line)",
    saveSources: "Save and rescan",
    resetSources: "Restore Pi defaults",
    savingSources: "Saving",
    sourcesSaved: "Priority sources saved; Pi is rescanning with the new rules",
    introLabel: "Paper introduction",
    whySuitable: "Why it is worth reading",
    priorityVenueLabel: "Priority venue",
    aiBrief: "DeepSeek review",
    metadataBrief: "Awaiting AI review",
    openOriginal: "Open original",
    citations: "Citations",
    qualityScore: "Score",
    relevanceScoreLabel: "Relevance",
    noHorizonPaper: "No recommendation was strong enough in this window; Pi will not fill the list for appearance's sake.",
    realBrief: "Real research brief",
    realBriefIntro: "Prioritizes papers you have not handled yet or that are due to resurface.",
    topRecommendation: "Top recommendation now",
    moreRealPapers: "More pending recommendations",
    realPapers: "real papers",
    scanCandidates: "shortlisted candidates",
    aiAnalyzed: "analyzed by Pi",
    recentDiscoveries: "Recent discoveries",
    publicationInfo: "Publication information",
    recommendationSignals: "Recommendation signals",
    sourceRecord: "Source record",
    currentSpaceFit: "Current space match",
    shareDaily: "Share today's picks",
    sharePaper: "Create paper snapshot",
    creatingShare: "Creating snapshot",
    snapshotCopied: "Public snapshot link copied and ready to forward",
    snapshotShared: "Public snapshot created",
    snapshotOpened: "Public snapshot opened in a new window",
    shareFailed: "Could not create the snapshot. Please try again.",
    importResearch: "Import AI project / research materials",
    importIntro: "Let Pi infer real interests, knowledge, unresolved questions, and promising adjacent directions from chats, published papers, and public project materials.",
    importSafetyTitle: "Confirm these materials are safe for external processing",
    importSafetyBody: "Do not upload unpublished manuscripts, submissions, reviewer material, non-public proposals, internal documents, pre-patent material, personal data, or anything confidential.",
    importSafetyProcess: "Text is extracted for this analysis and sent to DeepSeek. Pi stores neither original files nor raw text. The profile draft is held until you discard or confirm it, and affects recommendations only after confirmation.",
    singleFile: "Choose files",
    folderUpload: "Choose folder",
    pasteConversation: "Or paste conversation text",
    analyzeMaterials: "Generate profile draft",
    analyzingMaterials: "DeepSeek is analyzing the materials",
    confirmPublic: "I confirm these materials are public, lawful to process, and contain nothing unpublished or confidential.",
    importDraftTitle: "Research profile draft",
    importDraftNote: "This is an AI inference and does not affect recommendations yet. Review, edit, or remove inaccurate items before confirming.",
    mainDirection: "Refined primary direction",
    profileSummary: "Research profile summary",
    subdirectionsLabel: "Subdirections and sustained interests",
    openQuestionsLabel: "Interests and unresolved questions",
    futureDirections: "Related directions to continue exploring",
    evidenceConfidence: "Evidence confidence",
    confirmProfile: "Confirm for this space",
    discardDraft: "Discard this draft",
    profileConfirmed: "Research profile saved to this space; future discovery and recommendations will use it",
    rawNotStored: "Original files and raw text are not stored",
    selectedMaterials: "Selected materials",
    noMaterials: "No files selected yet",
    supportedFiles: "Supports PDF, DOCX, JSON, Markdown, TXT, HTML, and CSV; up to 12 files.",
    suspiciousBlocked: "A possibly unpublished, review-only, or confidential file was blocked",
    importFailed: "Material analysis failed. Check the files and try again.",
    profileSources: "Profile sources",
  },
} as const;

const fallbackSpaces: Space[] = [
  { id: "space-pending", name: "Research workspace", memberName: "", description: "", accent: "blue" },
];

function initials(value: string) {
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function defaultSpaceName(name: string, locale: Locale) {
  if (locale === "en") return name;
  const names: Record<string, string> = {
    "Information Theory": "信息论",
    "Applied Mathematics": "应用数学",
    "ML Reading": "机器学习阅读",
  };
  return names[name] || name;
}

function formatMonitorDate(value: string | null, locale: Locale) {
  if (!value) return copy[locale].neverScanned;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPaperDate(value: string | null, locale: Locale) {
  if (!value) return locale === "zh" ? "日期未提供" : "Date unavailable";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatTodayDate(locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function formatNotificationTime(value: string, locale: Locale) {
  const timestamp = new Date(value).getTime();
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return locale === "zh" ? "刚刚" : "Just now";
  if (elapsedMinutes < 60) return locale === "zh" ? `${elapsedMinutes} 分钟前` : `${elapsedMinutes}m ago`;
  if (elapsedMinutes < 24 * 60) return locale === "zh" ? `${Math.floor(elapsedMinutes / 60)} 小时前` : `${Math.floor(elapsedMinutes / 60)}h ago`;
  return formatMonitorDate(value, locale);
}

function notificationActionLabel(kind: string, locale: Locale) {
  if (kind === "must_read") return locale === "zh" ? "开始阅读" : "Start reading";
  if (kind === "route_change") return locale === "zh" ? "查看地图" : "Open map";
  if (kind === "weekly_review") return locale === "zh" ? "查看回顾" : "Open review";
  return locale === "zh" ? "立即处理" : "Open";
}

function directionRoleLabel(role: ResearchDirectionRole, locale: Locale) {
  const labels: Record<ResearchDirectionRole, Localized> = {
    core: { zh: "主攻", en: "Core" },
    support: { zh: "辅助", en: "Support" },
    explore: { zh: "探索", en: "Explore" },
  };
  return labels[role][locale];
}

function confirmedRouteEvidenceCount(track: ResearchTrack) {
  return (track as ResearchTrack & { confirmedEvidenceCount?: number }).confirmedEvidenceCount ?? track.papers.length;
}

function pendingRouteEvidenceCount(track: ResearchTrack) {
  return (track as ResearchTrack & { pendingEvidenceCount?: number }).pendingEvidenceCount ?? 0;
}

type RouteQualityPipeline = {
  queued: number;
  reviewing: number;
  recommended: number;
  hasCounts: boolean;
  lastQueuedAt: string | null;
};

function routeQualityPipeline(track: ResearchTrack): RouteQualityPipeline {
  const value = track as ResearchTrack & {
    queuedForReviewCount?: number;
    reviewingForReviewCount?: number;
    recommendedCandidateCount?: number;
    lastQueuedAt?: string | null;
  };
  return {
    queued: Math.max(0, value.queuedForReviewCount ?? 0),
    reviewing: Math.max(0, value.reviewingForReviewCount ?? 0),
    recommended: Math.max(0, value.recommendedCandidateCount ?? 0),
    hasCounts: [value.queuedForReviewCount, value.reviewingForReviewCount, value.recommendedCandidateCount].some((count) => typeof count === "number"),
    lastQueuedAt: value.lastQueuedAt || null,
  };
}

function routeDiscoveryKindLabel(paper: MonitorPaper, locale: Locale) {
  const labels: Record<RouteDiscoveryKind | RouteDiscoveryType, Localized> = {
    route_foundation: { zh: "奠基文献", en: "Foundation" },
    route_milestone: { zh: "里程碑", en: "Milestone" },
    route_frontier: { zh: "前沿进展", en: "Frontier" },
    route_gap: { zh: "证据缺口", en: "Evidence gap" },
    route_synthesis: { zh: "研究综合", en: "Research synthesis" },
    route_network: { zh: "引用网络", en: "Citation network" },
    route_version_shadow: { zh: "上一版路线对照", en: "Prior-version control" },
    route_learning: { zh: "学习路径补证", en: "Learning evidence" },
    route_classic: { zh: "经典文献补证", en: "Classical evidence" },
    route_search: { zh: "路线定向检索", en: "Route search" },
    gap: { zh: "证据缺口", en: "Evidence gap" },
    synthesis: { zh: "研究综合", en: "Research synthesis" },
    citation_network: { zh: "引用网络", en: "Citation network" },
  };
  const originLabel = locale === "zh" ? paper.discoveryOrigin?.sourceLabelZh : paper.discoveryOrigin?.sourceLabelEn;
  const kind = paper.discoveryOrigin?.kind || paper.discoveryType;
  return kind ? labels[kind][locale] : originLabel?.trim() || (locale === "zh" ? "路线发现" : "Route discovery");
}

function monitorPaperRouteDiscovery(paper: MonitorPaper, locale: Locale) {
  const origin = paper.discoveryOrigin;
  const track = paper.discoveryTrack;
  if (!origin && !(track && paper.discoveryType)) return null;
  const title = locale === "zh"
    ? (origin?.trackTitleZh || track?.titleZh)
    : (origin?.trackTitleEn || track?.titleEn);
  if (!title) return null;
  const source = locale === "zh" ? origin?.sourceLabelZh : origin?.sourceLabelEn;
  const impact = locale === "zh" ? origin?.impactZh : origin?.impactEn;
  return { title, kind: routeDiscoveryKindLabel(paper, locale), source: source || (locale === "zh" ? "研究路线供稿" : "Research-route lead"), impact: impact?.trim() || "" };
}

function RouteDiscoveryBadge({ paper, locale }: { paper: MonitorPaper; locale: Locale }) {
  const discovery = monitorPaperRouteDiscovery(paper, locale);
  if (!discovery) return null;
  const presentation = routeDiscoveryPresentation(paper.qualityStage, locale);
  return <span className={`v2-route-discovery-origin ${paper.qualityStage || "discovered"}`} title={presentation.fallbackTitle}><b>{presentation.label}</b><span>{discovery.kind}</span><i>{discovery.title}</i></span>;
}

function RouteImpactNote({ paper, locale, detail = false }: { paper: MonitorPaper; locale: Locale; detail?: boolean }) {
  const discovery = monitorPaperRouteDiscovery(paper, locale);
  if (!discovery?.impact) return null;
  const presentation = routeDiscoveryPresentation(paper.qualityStage, locale);
  return <section className={detail ? "v2-content-section v2-route-impact-note detail" : "v2-route-impact-note"}>
    <strong>{presentation.impactHeading} “{discovery.title}”</strong>
    <p>{discovery.impact}</p>
    <small>{presentation.impactFooter}</small>
  </section>;
}

function RecommendationVerificationBadge({ paper, locale }: { paper: MonitorPaper; locale: Locale }) {
  const verificationLabel = paper.verificationStatus === "verified"
    ? (locale === "zh" ? "推荐内容已核验" : "Recommendation verified")
    : paper.verificationStatus === "revised"
      ? (locale === "zh" ? "核验后已修订" : "Verified and revised") : "";
  return verificationLabel ? <span className={`v2-verification-badge ${paper.verificationStatus}`} title={locale === "zh" ? `关键表述证据覆盖 ${paper.verificationCoverageScore}%` : `${paper.verificationCoverageScore}% evidence coverage for substantive statements`}><i />{verificationLabel}</span> : null;
}

function recommendationAuditPhaseLabel(paper: MonitorPaper, locale: Locale) {
  if (paper.verificationPhase === "awaiting_correction") return locale === "zh" ? "正在核对并修正" : "Checking and correcting";
  return locale === "zh" ? "正在核对" : "Checking evidence";
}

function PaperDiscoverySourceBadge({ paper, locale }: { paper: MonitorPaper; locale: Locale }) {
  const sources = paper.discoverySources || [];
  if (!sources.length) return null;
  const labels = sources.map((source) => locale === "zh" ? source.labelZh : source.labelEn);
  const primary = labels[0].length > 48 ? `${labels[0].slice(0, 48)}…` : labels[0];
  return <span className="v2-paper-discovery-source" title={labels.join(" · ")} aria-label={labels.join(" · ")}><i />{primary}{labels.length > 1 ? ` +${labels.length - 1}` : ""}</span>;
}

function PaperFreshnessBadge({ paper, locale }: { paper: MonitorPaper; locale: Locale }) {
  const label = paper.discoveryOrigin?.kind === "route_foundation"
    ? (locale === "zh" ? "奠基补读" : "Foundation")
    : paper.horizon === "days"
      ? (locale === "zh" ? "近 14 天新论文" : "New · 14 days")
      : paper.horizon === "months"
        ? (locale === "zh" ? "近期优质" : "Recent quality")
        : (locale === "zh" ? "核心补读" : "Core catch-up");
  return <span className={`v2-freshness-badge ${paper.horizon || "years"}`}>{label}</span>;
}

function monitorPaperHorizonLabel(paper: MonitorPaper, locale: Locale) {
  if (paper.discoveryOrigin?.kind === "route_foundation") {
    return locale === "zh" ? "历史奠基文献" : "Historical foundation";
  }
  if (paper.horizon === "days") return locale === "zh" ? "近 14 天" : "Past 14 days";
  if (paper.horizon === "months") return locale === "zh" ? "近 6 个月" : "Past 6 months";
  return locale === "zh" ? "近 5 年" : "Past 5 years";
}

function RouteOperationalBadge({ track, locale }: { track: ResearchTrack; locale: Locale }) {
  const status = researchRouteOperationalStatus(track);
  const labels = {
    paused: { zh: "已暂停自动发现", en: "Automatic discovery paused" },
    retryable: { zh: "等待可靠来源补齐", en: "Awaiting source recovery" },
    degraded: { zh: "部分可用，保留现有证据", en: "Partially available; evidence retained" },
    learning: { zh: "质量队列与路线学习中", en: "Quality review and route learning" },
    healthy: { zh: "持续供稿", en: "Continuously supplying" },
    scheduled: { zh: "等待下一轮", en: "Scheduled for next cycle" },
  } satisfies Record<ReturnType<typeof researchRouteOperationalStatus>, Localized>;
  return <span className={`v2-route-operational ${status}`}><i />{labels[status][locale]}</span>;
}

function RoutePipelineFunnel({ track, locale }: { track: ResearchTrack; locale: Locale }) {
  const pipeline = routeQualityPipeline(track);
  const stages = [
    { key: "discovered", label: locale === "zh" ? "发现" : "Found", count: track.discoveryEffect.discoveredCount },
    { key: "queue", label: locale === "zh" ? "队列中" : "In queue", count: pipeline.queued + pipeline.reviewing },
    { key: "reviewed", label: locale === "zh" ? "已深评" : "Reviewed", count: track.discoveryEffect.deepReviewedCount },
    { key: "recommended", label: locale === "zh" ? "已推荐" : "Recommended", count: track.discoveryEffect.recommendedCount },
    { key: "confirmed", label: locale === "zh" ? "已确认" : "Confirmed", count: confirmedRouteEvidenceCount(track) },
  ];
  return <div className="v2-route-pipeline" aria-label={locale === "zh" ? "本路线发现到正式证据漏斗" : "This route's discovery-to-evidence funnel"}>{stages.map((stage, index) => <span className={stage.key} key={stage.key}><small>{String(index + 1).padStart(2, "0")} · {stage.label}</small><strong>{stage.count}</strong>{index < stages.length - 1 && <i>→</i>}</span>)}</div>;
}

function RouteLearningNote({ track, locale }: { track: ResearchTrack; locale: Locale }) {
  const signal = researchRouteLearningSignal(track);
  const copy = {
    paused: { zh: "自动扫描已停；历史节点、候选和反馈全部保留，恢复后继续参与排序。", en: "Automatic scans are stopped. Historical nodes, candidates, and feedback remain and rejoin ranking after resume." },
    reinforcing: { zh: "已有接受或完成阅读的结果作为正向证据，正在参与这条路线下一轮检索排序。", en: "Accepted or completed-reading outcomes now provide positive evidence for this route's next query ranking." },
    awaiting_feedback: { zh: "已有论文通过质量评估，等待你的阅读判断；未确认前不会写入正式路线。", en: "Papers passed quality review and await your judgment; none enter the formal route before confirmation." },
    rebalancing: { zh: "多篇候选进入深评但尚未通过，下一轮会降低相似低产分支，同时保留有限探索。", en: "Several candidates reached deep review without passing, so similar low-yield branches are down-ranked while bounded exploration remains." },
    observing: { zh: "已有发现或候选进入质量流程；样本尚少，当前保持中性探索。", en: "Discoveries have entered the quality flow; the sample is still small, so exploration remains neutral." },
    neutral: { zh: "还没有足够结果改变路线预算；下一轮按当前主攻、辅助或探索定位运行。", en: "There are not enough outcomes to change route budget; the next cycle follows its current core, support, or explore role." },
  } satisfies Record<ReturnType<typeof researchRouteLearningSignal>, Localized>;
  return <p className={`v2-route-learning-note ${signal}`}><InterfaceIcon name="route" /><strong>{locale === "zh" ? "路线学习" : "Route learning"}</strong><small>{copy[signal][locale]}</small></p>;
}

function ResearchGapDiscoveryStatus({ track, locale }: { track: ResearchTrack; locale: Locale }) {
  const job = track.gapDiscovery;
  const status = job?.status || "pending";
  const title = !job
    ? (locale === "zh" ? "等待后台补证" : "Waiting for background discovery")
    : status === "running"
      ? (locale === "zh" ? "正在查找缺失文献" : "Finding missing papers")
      : status === "retryable"
        ? job?.reason === "no_candidates"
          ? (locale === "zh" ? "本轮未找到候选，正在扩大范围" : "No candidates yet; broadening the search")
          : (locale === "zh" ? "来源暂不可用，任务已保留" : "Sources are unavailable; the task is retained")
        : status === "ready"
          ? job.queuedCount > 0
            ? (locale === "zh" ? `${job.queuedCount} 篇候选已进入质量评估` : `${job.queuedCount} candidates entered quality review`)
            : (locale === "zh" ? "本轮补证完成，暂未新增候选" : "Evidence search finished with no new candidates")
          : status === "empty"
            ? (locale === "zh" ? "已完成多轮检索，暂未找到合格候选" : "Multiple searches completed without a qualified candidate")
          : status === "degraded"
            ? (locale === "zh" ? "来源持续不可用，可稍后重试" : "Sources remain unavailable; retry later")
            : status === "superseded"
              ? (locale === "zh" ? "研究判断已更新，旧任务已停止" : "The research judgment changed; the old task stopped")
              : (locale === "zh" ? "已排入后台补证" : "Queued for background discovery");
  const detail = job?.status === "retryable" && job.nextRetryAt
    ? (locale === "zh" ? `${formatNotificationTime(job.nextRetryAt, locale)} 后重试` : `Retry after ${formatNotificationTime(job.nextRetryAt, locale)}`)
    : job?.status === "running"
      ? (locale === "zh" ? `第 ${job.attemptCount} 次尝试` : `Attempt ${job.attemptCount}`)
      : job?.updatedAt
        ? formatNotificationTime(job.updatedAt, locale)
        : (locale === "zh" ? "无需手动操作" : "No action required");
  return <div className={`v2-gap-discovery-status ${status}`} role="status"><i /><span><strong>{title}</strong><small>{detail}</small></span></div>;
}

function RoutePortfolioOverview({ attentionKind, attentionTrack, locale, onAction }: {
  attentionKind: ResearchRouteAttentionKind;
  attentionTrack: ResearchTrack; locale: Locale; onAction: () => void;
}) {
  const zh = locale === "zh";
  const reading = attentionKind === "read_material";
  const recommended = attentionKind === "today" || attentionKind === "confirm_evidence";
  const title = recommended ? (zh ? "看看新推荐，决定读哪篇" : "Choose your next paper")
    : reading ? (zh ? "从现有材料继续研究" : "Continue with available materials")
    : (zh ? "先明确这条路线要解决什么" : "Explore this route’s research question");
  const body = recommended ? (zh ? "从推荐理由与摘要开始，再决定是否纳入自己的研究。" : "Start with the rationale and abstract, then decide what belongs in your research.")
    : reading ? (zh ? `这条路线有 ${attentionTrack.papers.length} 篇材料，可以查看定位、比较方法并留下问题。` : `${attentionTrack.papers.length} papers are available to inspect, compare and annotate.`)
    : (zh ? "先查看方向与研究范围；材料处理情况可在下方按需查看。" : "Explore the scope first; processing details are available below.");
  return <section className="pi-route-next" aria-label={zh ? "下一步研究" : "Next research action"}>
    <div className="pi-route-next-content"><small>{zh ? "下一步" : "NEXT STEP"}</small><h2>{title}</h2>
      <strong><MathText inline>{zh ? attentionTrack.titleZh : attentionTrack.titleEn}</MathText></strong><p>{body}</p></div>
    <button type="button" onClick={onAction}>{recommended ? (zh ? "查看推荐" : "View recommendations") : reading ? (zh ? "查看路线材料" : "Explore materials") : (zh ? "了解路线" : "Explore route")} →</button>

  </section>;
}

function RouteUpdateRecords({ portfolio, todayCount, locale, children }: {
  portfolio: ResearchRoutePortfolio; todayCount: number; locale: Locale; children?: ReactNode;
}) {
  const zh = locale === "zh";
  const inReview = portfolio.queuedCount + portfolio.reviewingCount;
  return (    <details className="pi-route-update-records"><summary>{zh ? "更新记录" : "Update records"}</summary>
      <dl><div><dt>{zh ? "已发现候选" : "Discovered"}</dt><dd>{portfolio.discoveredCount}</dd></div><div><dt>{zh ? "评估队列" : "Review queue"}</dt><dd>{inReview}</dd></div><div><dt>{zh ? "今日推荐" : "In Today"}</dt><dd>{todayCount}</dd></div><div><dt>{zh ? "已确认的路线证据" : "Confirmed evidence"}</dt><dd>{portfolio.formalEvidenceCount}</dd></div></dl>
      <p>{zh ? `${portfolio.degradedRouteCount} 条路线仍需补充材料，${portfolio.pausedRouteCount} 条已暂停。候选数不代表已推荐或已确认的论文数。` : `${portfolio.degradedRouteCount} routes need more materials; ${portfolio.pausedRouteCount} are paused. Candidates are not recommendations or confirmed evidence.`}</p>
      {children}
    </details>);
}

function RouteDiscoveryLoop({ track, locale }: { track: ResearchTrack; locale: Locale }) {
  const effect = track.discoveryEffect;
  const taskLabels = {
    frontier: locale === "zh" ? "前沿追踪" : "Frontier",
    foundation: locale === "zh" ? "奠基补齐" : "Foundations",
    gap: locale === "zh" ? "证据缺口" : "Evidence gaps",
    network: locale === "zh" ? "引用网络" : "Citation network",
  };
  const tasks = (Object.keys(taskLabels) as Array<keyof typeof taskLabels>).map((key) => ({ key, label: taskLabels[key], ...effect.tasks[key] }));
  return <section className={`v2-route-discovery-loop ${track.monitoringStatus}`}>
    <header><div><small>{locale === "zh" ? "路线自动供稿" : "AUTOMATIC ROUTE DISCOVERY"}</small><strong>{track.monitoringStatus === "paused" ? (locale === "zh" ? "自动发现已暂停，历史与队列继续保留" : "Automatic discovery is paused; history and queue remain") : (locale === "zh" ? "四条发现通道共同服务今日推荐" : "Four discovery channels feed Today's recommendations")}</strong></div><RouteOperationalBadge track={track} locale={locale} />{effect.lastScannedAt && <time>{locale === "zh" ? "最近扫描 " : "Last scan "}{formatNotificationTime(effect.lastScannedAt, locale)}</time>}</header>
    <div className="v2-route-discovery-tasks">{tasks.map((task) => <span className={task.status} key={task.key}><i /> <strong>{task.label}</strong><small>{task.attempts > 0 ? (locale === "zh" ? `${task.attempts} 轮` : `${task.attempts} runs`) : (locale === "zh" ? "下轮启用" : "Starts next scan")}</small></span>)}</div>
    <RoutePipelineFunnel track={track} locale={locale} />
    <dl><div><dt>{locale === "zh" ? "路线发现" : "Discovered"}</dt><dd>{effect.discoveredCount}</dd></div><div><dt>{locale === "zh" ? "进入深评" : "Deep reviewed"}</dt><dd>{effect.deepReviewedCount}<small>{effect.discoveredCount ? `${effect.deepReviewRate}%` : "—"}</small></dd></div><div><dt>{locale === "zh" ? "推到今日" : "Recommended"}</dt><dd>{effect.recommendedCount}<small>{effect.deepReviewedCount ? `${effect.recommendationRate}%` : "—"}</small></dd></div><div><dt>{locale === "zh" ? "你已接受" : "Accepted"}</dt><dd>{effect.acceptedCount}<small>{effect.recommendedCount ? `${effect.acceptanceRate}%` : "—"}</small></dd></div></dl>
    <RouteLearningNote track={track} locale={locale} />
    <footer><span>{locale === "zh" ? "你的“适合 / 不相关 / 已掌握 / 稍后”会分别调整这条路线和四类发现通道的下一轮预算。" : "Useful, not relevant, mastered, and later feedback separately tune this route and its four channel budgets."}</span>{track.monitoringStatus !== "paused" && effect.staleDays !== null && effect.staleDays >= 7 && <b>{locale === "zh" ? `${effect.staleDays} 天未获得新扫描，下一轮优先补充` : `No new scan for ${effect.staleDays} days; prioritized next`}</b>}</footer>
  </section>;
}

function ResearchLeadDecisionPanel({
  track,
  problemState,
  synthesis,
  locale,
  onOpenWorkspace,
  onOpenToday,
  onOpenLearning,
  onScanGap,
  gapScanning,
  gapScanBlocked,
}: {
  track: ResearchTrack;
  problemState: ResearchProblemState | null;
  synthesis: ResearchSynthesis | null;
  locale: Locale;
  onOpenWorkspace: (tab: ResearchRouteTab) => void;
  onOpenToday: () => void;
  onOpenLearning: () => void;
  onScanGap: (origin: ResearchLeadGapOrigin) => void;
  gapScanning: boolean;
  gapScanBlocked: boolean;
}) {
  const problem = problemState?.problem || null;
  const assessment = problemState?.assessment || null;
  const activeAction = problemState?.actions.find((item) => item.status === "accepted")
    || problemState?.actions.find((item) => item.status === "proposed") || null;
  const synthesisGap = synthesis && !synthesis.stale
    ? synthesis.statements.find((statement) => statement.kind === "evidence_gap") || null
    : null;
  const actionableGap = researchLeadActionableGap({
    hasAssessment: Boolean(assessment),
    assessmentStale: Boolean(assessment?.stale),
    assessmentQuery: assessment?.nextSearchQuery,
    synthesisQuery: synthesis && !synthesis.stale ? synthesis.nextSearchQuery : "",
    routeQuery: track.intelligence?.nextSearchQuery,
  });
  const shouldScanGap = Boolean(actionableGap && !activeAction);
  const unresolvedToday = Math.max(0, track.discoveryEffect.recommendedCount - track.discoveryEffect.acceptedCount);
  const visibleEvidence = track.papers.length;
  const decision = assessment
    ? (locale === "zh" ? assessment.nextDecisionZh : assessment.nextDecisionEn)
    : problem?.status === "active"
      ? problem.question
      : !visibleEvidence
        ? (locale === "zh" ? "先恢复真实论文供给，再形成研究判断" : "Restore real-paper supply before forming a research judgment")
        : actionableGap
          ? (locale === "zh" ? "先补齐已识别的关键证据，再把路线收敛成研究问题" : "Close the identified evidence gap before narrowing the route into a research problem")
        : (locale === "zh" ? "把当前路线收敛成一个可证伪、可推进的研究问题" : "Turn this route into a falsifiable, actionable research problem");
  const uncertainty = assessment
    ? (locale === "zh" ? assessment.uncertaintyZh : assessment.uncertaintyEn)
    : synthesisGap
      ? (locale === "zh" ? synthesisGap.textZh : synthesisGap.textEn)
      : track.intelligence
        ? (locale === "zh" ? track.intelligence.evidenceGapZh : track.intelligence.evidenceGapEn)
        : !visibleEvidence
          ? (locale === "zh" ? "外部来源或模型阶段尚未提供可见论文证据，当前状态不能视为路线完成。" : "External sources or the model stage have not supplied visible paper evidence, so this route is not complete.")
          : (locale === "zh" ? "还需要综合现有论文，才能定位最关键的不确定性。" : "The existing papers still need synthesis before the key uncertainty can be located.");
  const nextAction = activeAction
    ? (locale === "zh" ? activeAction.titleZh : activeAction.titleEn)
    : actionableGap
      ? (locale === "zh" ? "立即按关键不确定性检索真实论文" : "Search for real papers that close the key uncertainty now")
    : problem?.status === "active"
      ? assessment?.stale
        ? (locale === "zh" ? "依据新增证据更新研究问题评估" : "Refresh the problem assessment from new evidence")
        : (locale === "zh" ? "推进研究问题并记录下一次判断" : "Advance the research problem and record the next decision")
      : track.confirmedEvidenceCount > 0
        ? (locale === "zh" ? "形成并确认研究问题" : "Form and confirm a research problem")
        : visibleEvidence
          ? (locale === "zh" ? "先做跨论文综合，识别可执行缺口" : "Synthesize the papers and identify an actionable gap")
          : (locale === "zh" ? "从健康来源或受保护基线补齐真实证据" : "Recover real evidence from healthy sources or the protected baseline");
  const primaryTab: ResearchRouteTab = problem?.status === "active" || problemState?.evidence.canDraft
    ? "problem"
    : visibleEvidence ? "assessment" : "gaps";
  const primaryLabel = primaryTab === "problem"
    ? (locale === "zh" ? "推进研究问题" : "Advance research problem")
    : primaryTab === "assessment"
      ? (locale === "zh" ? "形成综合研判" : "Build synthesis")
      : (locale === "zh" ? "恢复证据供给" : "Recover evidence supply");
  return <section className="v2-research-decision-panel v2-research-decision-focus" aria-labelledby={`research-decision-${track.id}`}>
    <div className="v2-research-decision-main">
      <header><p className="v2-kicker">{locale === "zh" ? "当前研究判断" : "CURRENT RESEARCH JUDGMENT"}</p><h2 id={`research-decision-${track.id}`}>{decision}</h2></header>
      <div className="v2-research-uncertainty"><small>{locale === "zh" ? "关键不确定性" : "KEY UNCERTAINTY"}</small><p>{uncertainty}</p></div>
    </div>
    <aside className={`v2-research-decision-next ${shouldScanGap ? "actionable" : ""}`}>
      <small>{locale === "zh" ? "下一步" : "NEXT"}</small><h3>{nextAction}</h3>
      {shouldScanGap && <ResearchGapDiscoveryStatus track={track} locale={locale} />}
      <div className="v2-research-decision-actions">{shouldScanGap && actionableGap ? <button type="button" className="primary" disabled={gapScanBlocked} onClick={() => onScanGap(actionableGap.origin)}>{gapScanning ? (locale === "zh" ? "正在补证据…" : "Finding evidence…") : (locale === "zh" ? "立即检索" : "Search now")} →</button> : <button type="button" className="primary" onClick={() => onOpenWorkspace(primaryTab)}>{primaryLabel} →</button>}{(unresolvedToday > 0 || track.pendingEvidenceCount > 0) && <button type="button" onClick={onOpenToday}>{locale === "zh" ? `今日待决 ${Math.max(unresolvedToday, track.pendingEvidenceCount)}` : `${Math.max(unresolvedToday, track.pendingEvidenceCount)} pending in Today`}</button>}<button type="button" onClick={onOpenLearning}>{locale === "zh" ? "学习路径" : "Learning path"}</button></div>
    </aside>
  </section>;
}

function routeManagementNeedsAttention(track: ResearchTrack) {
  const operational = researchRouteOperationalStatus(track);
  return Boolean((track.routeRevisions || []).some((revision) => revision.status === "proposed") || track.monitoringStatus === "paused" || ["retryable", "degraded"].includes(operational));
}

function RouteManagementDrawer({ track, locale, children }: { track: ResearchTrack; locale: Locale; children: ReactNode }) {
  const proposed = (track.routeRevisions || []).find((revision) => revision.status === "proposed") || null;
  const currentFormal = (track.routeRevisions || []).find((revision) => revision.status === "confirmed") || null;
  const operational = researchRouteOperationalStatus(track);
  const needsAttention = routeManagementNeedsAttention(track);
  const [open, setOpen] = useState(Boolean(proposed || track.monitoringStatus === "paused"));
  const summary = proposed
    ? (locale === "zh" ? `v${proposed.version} 路线提案等待确认` : `Route proposal v${proposed.version} awaits confirmation`)
    : track.monitoringStatus === "paused"
      ? (locale === "zh" ? "路线已暂停；历史和已保存结果仍保留" : "Route paused; history and saved results remain available")
      : ["retryable", "degraded"].includes(operational)
        ? (locale === "zh" ? "来源或模型阶段需要恢复，已有结果仍保留" : "A source or model stage needs recovery; existing results are retained")
        : (locale === "zh" ? "低频设置与运行记录，不影响当前研究工作" : "Low-frequency controls and run history, separate from current research work");
  return <details className={`v2-route-management ${needsAttention ? "attention" : ""}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span><small>{locale === "zh" ? "路线管理" : "ROUTE MANAGEMENT"}</small><strong>{locale === "zh" ? "定位、运行与版本" : "Role, operations, and versions"}</strong><p>{summary}</p></span><div><em>{directionRoleLabel(track.userRole, locale)}</em><RouteOperationalBadge track={track} locale={locale} />{currentFormal && <em>v{currentFormal.version}</em>}{proposed && <em className="attention">{locale === "zh" ? "待确认" : "Pending"}</em>}<b>{open ? (locale === "zh" ? "收起 ↑" : "Collapse ↑") : (locale === "zh" ? "管理路线 ↓" : "Manage route ↓")}</b></div></summary>
    <div className="v2-route-management-body">{children}</div>
  </details>;
}



function routePaperCurationSourceLabel(paper: ResearchTrackPaper, locale: Locale) {
  if (paper.curationSource === "system_model_selection_guard") return locale === "zh" ? "Pi 选择一致性守卫" : "Pi selection consistency guard";
  if (paper.curationSource === "system_semantic_precision_guard") return locale === "zh" ? "Pi 独立语义精度守卫" : "Pi independent semantic precision guard";
  if (paper.curationSource === "user_evidence_confirmation") return locale === "zh" ? "用户证据确认" : "User evidence confirmation";
  if (paper.curationSource === "user_network_acceptance") return locale === "zh" ? "引用网络确认" : "Citation-network confirmation";
  return locale === "zh" ? "路线人工复核" : "Route curation review";
}

function directionHeatLabel(level: ResearchTrack["heatLevel"], locale: Locale) {
  const labels: Record<ResearchTrack["heatLevel"], Localized> = {
    hot: { zh: "高热", en: "Hot" },
    rising: { zh: "升温", en: "Rising" },
    steady: { zh: "稳定", en: "Steady" },
    quiet: { zh: "低频", en: "Quiet" },
  };
  return labels[level][locale];
}

function directionHeatTitle(track: ResearchTrack, locale: Locale) {
  return locale === "zh"
    ? `当前发现热度 ${track.heatScore}；近 6 个月发现 ${track.recentPaperCount} 篇代表论文。基于 Pi 当前扫描范围，不代表全领域绝对排名。`
    : `Discovery heat ${track.heatScore}; ${track.recentPaperCount} representative papers found in the last six months. Based on Pi's current discovery scope, not an absolute field ranking.`;
}

function researchTrackBuildSummary(track: ResearchTrack, locale: Locale) {
  if (track.buildStatus === "queued") return locale === "zh" ? "等待首次补充" : "Awaiting first evidence pass";
  if (track.buildStatus === "retryable") return locale === "zh" ? "来源或模型暂不可用 · 等待重试" : "Source or model unavailable · retry pending";
  if (track.buildStatus === "empty") return locale === "zh" ? "健康来源暂未找到可见证据" : "No visible evidence from healthy sources yet";
  if (track.buildStatus === "failed") return locale === "zh" ? "本轮来源不可用 · 可稍后重试" : "Sources unavailable in this run · retry later";
  const evidenceCounts = `${confirmedRouteEvidenceCount(track)} ${locale === "zh" ? "篇已确认纳入" : "confirmed in route"} · ${track.papers.length} ${locale === "zh" ? "篇代表作" : "representatives"}${pendingRouteEvidenceCount(track) ? ` · ${pendingRouteEvidenceCount(track)} ${locale === "zh" ? "待确认" : "pending"}` : ""}`;
  return track.buildStatus === "partial" ? `${locale === "zh" ? "部分可用" : "Partially available"} · ${evidenceCounts}` : evidenceCounts;
}

function timeValue(value: string | null | undefined) {
  if (!value) return 0;
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recommendationTierLabel(tier: MonitorPaper["recommendationTier"], locale: Locale) {
  if (tier === "must_read") return locale === "zh" ? "今日必读" : "Must read";
  if (tier === "browse") return locale === "zh" ? "重点浏览" : "Browse";
  return locale === "zh" ? "储备线索" : "Reserve";
}

function readDepthLabel(depth: MonitorPaper["readDepth"], locale: Locale) {
  if (depth === "deep") return locale === "zh" ? "精读" : "Deep read";
  if (depth === "focused") return locale === "zh" ? "定向阅读" : "Focused read";
  return locale === "zh" ? "概览" : "Overview";
}

function explorationStatusLabel(status: ExplorationBranch["status"], locale: Locale) {
  if (status === "cooling") return locale === "zh" ? "暂时降频" : "Cooling";
  if (status === "revisit") return locale === "zh" ? "一轮完成" : "Round complete";
  if (status === "error") return locale === "zh" ? "来源异常" : "Source error";
  return locale === "zh" ? "继续深挖" : "Exploring";
}

function historyCountsFor(papers: MonitorPaper[]) {
  const recommendationPapers = papers.filter((paper) => paper.qualityStage === "recommended" || paper.qualityStage === "reviewing"
    || paper.saved || Boolean(paper.feedback) || paper.readingStatus !== "unread");
  const unresolved = recommendationPapers.filter((paper) => !["accepted", "dismissed"].includes(paper.userState));
  return {
    all: recommendationPapers.length,
    inbox: unresolved.length,
    unseen: unresolved.filter((paper) => paper.userState === "unseen").length,
    seen: unresolved.filter((paper) => paper.userState === "seen").length,
    snoozed: unresolved.filter((paper) => paper.userState === "snoozed").length,
    accepted: recommendationPapers.filter((paper) => paper.userState === "accepted").length,
    saved: recommendationPapers.filter((paper) => paper.saved).length,
    dismissed: recommendationPapers.filter((paper) => paper.userState === "dismissed").length,
    reading: recommendationPapers.reduce<Record<string, number>>((counts, paper) => {
      const status = paper.readingStatus || "unread";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {}),
  };
}

const monitorProgressByStatus: Record<MonitorStatus, number> = {
  idle: 0,
  scanning: 4,
  discovering_days: 12,
  discovering_months: 24,
  discovering_years: 38,
  deduplicating: 48,
  screening: 56,
  deep_reviewing: 76,
  reviewing: 58,
  saving: 88,
  briefing: 94,
  ready: 100,
  error: 0,
};

function isMonitorScanning(status: MonitorStatus | undefined) {
  return Boolean(status && !["idle", "ready", "error"].includes(status));
}

function monitorPhaseLabel(status: MonitorStatus | undefined, locale: Locale) {
  const labels: Record<MonitorStatus, { zh: string; en: string }> = {
    idle: { zh: "准备扫描", en: "Preparing the scan" },
    scanning: { zh: "正在准备研究范围", en: "Preparing the research scope" },
    discovering_days: { zh: "正在检索近 14 天的新论文", en: "Searching the latest 14 days" },
    discovering_months: { zh: "正在检索近 6 个月的高质量论文", en: "Searching the latest 6 months" },
    discovering_years: { zh: "正在回溯近 5 年的重要论文", en: "Reviewing the last 5 years" },
    deduplicating: { zh: "正在去重并排除已评审记录", en: "Deduplicating previously reviewed records" },
    screening: { zh: "DeepSeek 正在快速筛选候选", en: "DeepSeek is triaging candidates" },
    deep_reviewing: { zh: "高潜力论文正在并行深度解读", en: "High-potential papers are being interpreted in parallel" },
    reviewing: { zh: "DeepSeek 正在逐篇筛选并撰写", en: "DeepSeek is screening and writing each brief" },
    saving: { zh: "正在保存推荐与淘汰记录", en: "Saving recommendations and rejected records" },
    briefing: { zh: "Pi 正在生成今日研究简报", en: "Pi is writing today's research brief" },
    ready: { zh: "扫描完成", en: "Scan complete" },
    error: { zh: "扫描暂时失败", en: "Scan temporarily failed" },
  };
  return labels[status || "idle"][locale];
}

function monitorErrorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

function isModelCredentialFailure(error: unknown) {
  return ["invalid", "balance"].includes(modelConnectionFailureState(error));
}

function monitorFailureMessage(error: unknown, locale: Locale) {
  const message = monitorErrorText(error);
  if (/deepseek_insufficient_balance|insufficient\s+balance|余额不足/i.test(message)) {
    return locale === "zh"
      ? "DeepSeek 账户余额不足。候选论文和已完成的筛选进度都已保存；充值或更换可用 Key 后可以从断点继续。"
      : "The DeepSeek account has insufficient balance. Candidates and completed screening progress are saved; top up or use another key to resume.";
  }
  if (modelConnectionFailureState(error) === "invalid") {
    return locale === "zh"
      ? "当前 DeepSeek API Key 已失效。更换可用 Key 后可以从已保存的断点继续。"
      : "The current DeepSeek API key is no longer valid. Replace it to resume from the saved checkpoint.";
  }
  if (/monitor_analysis_budget_insufficient|budget reached/i.test(message)) {
    return locale === "zh"
      ? "今日剩余额度不足以完成下一批智能筛选，Pi 已停止重复检索。现有论文与进度都已保留，明日额度刷新后可直接继续。"
      : "Today's remaining budget cannot complete the next screening batch, so Pi stopped before repeating retrieval. Existing papers and progress are preserved for tomorrow.";
  }
  if (/timeout|aborted|temporarily unavailable|status\s*5\d\d/i.test(message)) {
    return locale === "zh" ? "DeepSeek 或论文来源暂时响应超时，当前进度已保存，可以稍后从断点继续。" : "DeepSeek or a paper source timed out. Progress is saved and can be resumed later.";
  }
  return locale === "zh" ? "本轮扫描暂停了，当前进度已经保存。可以点击“从断点继续”重试。" : "This scan paused, but its progress is saved. Select “Resume from checkpoint” to try again.";
}

function pilotCriterionLabel(id: string, locale: Locale) {
  const labels: Record<string, { zh: string; en: string }> = {
    reliability: { zh: "扫描可靠性", en: "Scan reliability" },
    paperQuality: { zh: "非论文误报", en: "Non-paper false positives" },
    usefulness: { zh: "推荐有用性", en: "Recommendation usefulness" },
    continuity: { zh: "每日持续运行", en: "Daily continuity" },
    horizons: { zh: "三层时间覆盖", en: "Three-horizon coverage" },
    deduplication: { zh: "重复分析保护", en: "Duplicate-analysis protection" },
  };
  return (labels[id] || { zh: id, en: id })[locale];
}

function routeChangeKindLabel(kind: string): { zh: string; en: string; symbol: InterfaceIconName } {
  const labels: Record<string, { zh: string; en: string; symbol: InterfaceIconName }> = {
    new_evidence: { zh: "新增证据", en: "New evidence", symbol: "add" },
    route_initialized: { zh: "新建路线", en: "Route created", symbol: "route" },
    node_added: { zh: "节点扩展", en: "Nodes added", symbol: "route" },
    evidence_refined: { zh: "证据补强", en: "Evidence refined", symbol: "document" },
  };
  return labels[kind] || { zh: "路线更新", en: "Route update", symbol: "add" };
}

function researchSynthesisKindLabel(kind: ResearchSynthesisStatement["kind"], locale: Locale) {
  const labels: Record<ResearchSynthesisStatement["kind"], Localized> = {
    consensus: { zh: "当前共识", en: "Current consensus" },
    disagreement: { zh: "真实分歧", en: "Substantive disagreement" },
    qualification: { zh: "条件差异", en: "Conditional difference" },
    method_lineage: { zh: "方法演进", en: "Method lineage" },
    evidence_gap: { zh: "证据缺口", en: "Evidence gap" },
  };
  return labels[kind][locale];
}

function startMonitorPolling(spaceId: string, onUpdate: (monitor: MonitorState) => void, immediate = true) {
  let stopped = false;
  let polling = false;
  const poll = async () => {
    if (stopped || polling || document.visibilityState === "hidden") return;
    polling = true;
    try {
      const response = await fetch("/api/monitor?spaceId=" + encodeURIComponent(spaceId), { signal: AbortSignal.timeout(20_000) });
      const data = await response.json() as { monitor?: MonitorState };
      if (!stopped && response.ok && data.monitor) onUpdate(data.monitor);
    } catch {
      // The long-running scan remains authoritative; the next poll can recover.
    } finally {
      polling = false;
    }
  };
  if (immediate) void poll();
  const timer = window.setInterval(() => void poll(), 5000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

async function followMonitorPipeline(
  spaceId: string,
  initialMonitor: MonitorState,
  onUpdate: (monitor: MonitorState) => void,
  isCancelled: () => boolean = () => false,
): Promise<MonitorState> {
  let current = initialMonitor;
  let lastReclaimAttemptAt = 0;
  for (let step = 0; step < 400 && !isCancelled() && !["ready", "error"].includes(current.status); step += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 5000));
    if (isCancelled()||current.automation?.paused) break;
    try {
      const response = await fetch("/api/monitor?spaceId=" + encodeURIComponent(spaceId), { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as { monitor?: MonitorState };
      if (response.ok && data.monitor) {
        current = data.monitor;
        if (!isCancelled()) onUpdate(current);
      }
    } catch {
      // The elected owner remains authoritative; a later read can catch up.
    }
    if(current.automation?.paused)break;
    const now = Date.now();
    if (!isCancelled() && shouldReclaimMonitorLease(current, { now, lastAttemptAt: lastReclaimAttemptAt })) {
      lastReclaimAttemptAt = now;
      try {
        const response = await fetch("/api/monitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId, trigger: "visit", action: "start" }),
        });
        const data = await response.json().catch(() => ({})) as { monitor?: MonitorState };
        if (data.monitor) {
          current = data.monitor;
          if (!isCancelled()) onUpdate(current);
        }
        if (response.ok && data.monitor && !data.monitor.throttled
          && data.monitor.leaseOwner !== false && !data.monitor.alreadyRunning
          && !["ready", "error"].includes(data.monitor.status)) {
          return advanceMonitorPipeline(spaceId, data.monitor, onUpdate, isCancelled);
        }
      } catch {
        // A later read will retry after the bounded reclaim interval.
      }
    }
  }
  return current;
}

async function advanceMonitorPipeline(
  spaceId: string,
  initialMonitor: MonitorState,
  onUpdate: (monitor: MonitorState) => void,
  isCancelled: () => boolean = () => false,
): Promise<MonitorState> {
  let current = initialMonitor;
  for (let step = 0; step < 64 && !isCancelled(); step += 1) {
    if (["ready", "error"].includes(current.status)||current.automation?.paused) break;
    let response: Response;
    let data: { monitor?: MonitorState; error?: string };
    try {
      response = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId,
          action: "advance",
          jobId: current.scanJob?.id,
          leaseToken: current.leaseToken,
          leaseGeneration: current.leaseGeneration,
        }),
      });
      data = await response.json();
    } catch (error) {
      if (isCancelled()) return current;
      // A disconnected response does not tell us whether the stage persisted.
      // Read the authoritative job and use the existing lease-reclaim cadence.
      if (error instanceof TypeError || (error instanceof Error && error.name === "AbortError")) {
        return followMonitorPipeline(spaceId, current, onUpdate, isCancelled);
      }
      throw error;
    }
    if (data.monitor) {
      current = data.monitor;
      if (!isCancelled()) onUpdate(current);
    }
    if (!response.ok || !data.monitor) throw new Error(data.error || data.monitor?.error || data.monitor?.scanJob?.error || "scan stage unavailable");
    // Another tab or scheduler owns this checkpoint. Stop issuing POSTs and let
    // the read-only poll follow the authoritative job instead of creating a request storm.
    if (data.monitor.alreadyAdvancing || data.monitor.leaseOwner === false) {
      return followMonitorPipeline(spaceId, current, onUpdate, isCancelled);
    }
  }
  if (!isCancelled() && current.status === "ready" && current.scanJob?.checkpoint === "main_complete") {
    void fetch("/api/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId, action: "enhance", jobId: current.scanJob.id }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { monitor?: MonitorState };
      if (!isCancelled() && response.ok && data.monitor) onUpdate(data.monitor);
    }).catch(() => undefined);
  }
  return current;
}

function modelDisplayName(model: string | null | undefined) {
  if (model === "deepseek-flash") return "DeepSeek V4.1 Flash";
  if (model === "deepseek-v4-pro") return "DeepSeek V4 Pro";
  if (model === "evidence-summary") return "Evidence-first";
  return model || "DeepSeek";
}

function displayQualityScore(score: number) {
  return Math.min(100, Math.max(0, Math.round(score || 0)));
}

function compactNavCount(count: number) {
  return count > 99 ? "99+" : String(Math.max(0, count));
}

function feedbackEffectCopy(kind: "save" | "relevant" | "not_relevant" | "later", value: boolean, reasonCode: string | undefined, locale: Locale) {
  const copy = !value
    ? { zh: "已撤回这项反馈；收藏、阅读记录与笔记分别保留。", en: "This feedback was withdrawn; other saved and reading records remain." }
    : kind === "later"
      ? { zh: "已推迟 3 天，不会降低研究偏好。", en: "Snoozed for three days without lowering your preferences." }
      : reasonCode === "duplicate_known"
        ? { zh: "已掌握：减少同类入门内容，继续寻找更深或更新的论文。", en: "Mastered: Pi will seek deeper or newer work instead of similar introductions." }
        : kind === "not_relevant"
          ? { zh: "已记录排除反馈，供后续检索参考；当前推荐未重新计算。", en: "Exclusion recorded for future discovery; current recommendations have not been recalculated." }
          : kind === "relevant"
            ? { zh: "已记录相关主题、方法或问题，供后续检索参考。", en: "The related topic, method, or question will guide the next scan." }
            : { zh: "已保存，并用于改进后续检索。", en: "Saved and added to future discovery guidance." };
  return locale === "zh" ? copy.zh : copy.en;
}

const materialNameWarning = /(?:confidential|do[\s_-]*not[\s_-]*distribute|under[\s_-]*review|reviewer[\s_-]*copy|unpublished|submission|draft|机密|绝密|保密|未公开|未发表|投稿稿|送审稿)/i;
const MATERIAL_FILE_LIMIT = 12;
const MATERIAL_CHAR_LIMIT = 50_000;

function readablePart(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}

function flattenConversationJson(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const conversations = Array.isArray(parsed) ? parsed : [parsed];
    const output: string[] = [];
    for (const conversation of conversations) {
      if (!conversation || typeof conversation !== "object") continue;
      const record = conversation as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title : "Imported conversation";
      const mapping = record.mapping && typeof record.mapping === "object" ? record.mapping as Record<string, unknown> : null;
      if (!mapping) continue;
      const messages = Object.values(mapping).map((node) => {
        if (!node || typeof node !== "object") return null;
        const message = (node as Record<string, unknown>).message;
        if (!message || typeof message !== "object") return null;
        const value = message as Record<string, unknown>;
        const author = value.author && typeof value.author === "object" ? value.author as Record<string, unknown> : {};
        const content = value.content && typeof value.content === "object" ? value.content as Record<string, unknown> : {};
        const parts = Array.isArray(content.parts) ? content.parts.map(readablePart).filter(Boolean).join("\n") : "";
        return { role: String(author.role || "unknown"), text: parts, time: Number(value.create_time || 0) };
      }).filter((message): message is { role: string; text: string; time: number } => Boolean(message?.text)).sort((first, second) => first.time - second.time);
      if (!messages.length) continue;
      output.push(`# ${title}`, ...messages.map((message) => `${message.role.toUpperCase()}: ${message.text}`));
      if (output.join("\n").length >= MATERIAL_CHAR_LIMIT) break;
    }
    return output.length ? output.join("\n\n") : JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

async function extractPdfText(file: File) {
  const moduleUrl = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
  const pdfjs = await import(/* @vite-ignore */ moduleUrl) as {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument(input: { data: ArrayBuffer }): { promise: Promise<{ numPages: number; getPage(page: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }> }> }> };
  };
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 120); pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => (item.str || "") + (item.hasEOL ? "\n" : " ")).join("").trim());
    if (pages.join("\n").length >= MATERIAL_CHAR_LIMIT) break;
  }
  return pages.join("\n\n");
}

async function loadMammoth() {
  const browser = window as typeof window & { mammoth?: { extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> } };
  if (browser.mammoth) return browser.mammoth;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-pi-mammoth="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("DOCX parser unavailable")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mammoth@1.11.0/mammoth.browser.min.js";
    script.dataset.piMammoth = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("DOCX parser unavailable"));
    document.head.appendChild(script);
  });
  if (!browser.mammoth) throw new Error("DOCX parser unavailable");
  return browser.mammoth;
}

async function extractMaterialText(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (extension === "pdf") return extractPdfText(file);
  if (extension === "docx") {
    const mammoth = await loadMammoth();
    return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  const raw = await file.text();
  if (extension === "json") return flattenConversationJson(raw);
  if (extension === "html" || extension === "htm") return new DOMParser().parseFromString(raw, "text/html").body.textContent || "";
  if (["txt", "md", "markdown", "csv"].includes(extension) || file.type.startsWith("text/")) return raw;
  throw new Error("Unsupported file type");
}

async function readResearchMapState(spaceId: string) {
  const response = await fetch("/api/research-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spaceId, action: "read" }),
  });
  const data = await response.json() as ResearchMapState & { error?: string };
  if (!response.ok) throw new Error(data.error || "research map unavailable");
  return data;
}

async function requestPaperNetworkBuildPhase(spaceId: string, phase: Exclude<PaperNetworkBuildPhase, null>, force: boolean) {
  const response = await fetch("/api/research-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spaceId, action: "network", force, networkPhase: phase }),
  });
  const data = await response.json() as ResearchMapState & { error?: string };
  if (!response.ok) throw new Error(data.error || "paper network unavailable");
  return data;
}

function ResearchSynthesisWorkbench({
  synthesis, loading, error, locale, onRefresh, onScanGap, onPaper, onMaterials, reviewStages,
}: {
  track: ResearchTrack;
  synthesis: ResearchSynthesis | null;
  loading: boolean;
  error: string;
  locale: Locale;
  onRefresh: () => void;
  onScanGap: () => void;
  onExplain: () => void;
  onPaper: (id: string) => void;
  onMaterials: () => void;
  reviewStages: Record<string, string|null|undefined>;
}) {
  const ready = Boolean(synthesis && ["ready", "partial"].includes(synthesis.status) && synthesis.statements.length);
  const availablePapers = synthesis?.availablePaperCount || 0;
  return <section className="v2-route-workspace-panel v2-research-synthesis" role="tabpanel">
    <header><div><p className="v2-kicker">{locale === "zh" ? "跨论文" : "CROSS-PAPER"}</p><h2>{locale === "zh" ? "共识、分歧与缺口" : "Consensus, conflicts, and gaps"}</h2><span className="v2-sr-only">这条路线目前可以怎样判断</span></div><div><button type="button" onClick={onRefresh} disabled={loading || !synthesis?.canGenerate}>{loading ? (locale === "zh" ? "正在综合…" : "Synthesizing…") : ready ? (locale === "zh" ? "按最新证据更新" : "Refresh from evidence") : (locale === "zh" ? "生成跨论文综合" : "Build synthesis")}</button></div></header>
    {!ready && !loading && synthesis && <SynthesisPreparation reviewStages={reviewStages} papers={synthesis.preparation || []} available={availablePapers} locale={locale} onPaper={onPaper} onMaterials={onMaterials} />}
    {ready ? <SynthesisReading synthesis={synthesis!} locale={locale} onScanGap={onScanGap} /> : loading ? <div className="v2-route-panel-empty v2-synthesis-loading"><InterfaceIcon name="loading" className="pi-state-mark" /><div><strong>{locale === "zh" ? "正在核对论文证据" : "Checking paper evidence"}</strong><p>{locale === "zh" ? "比较结论、适用条件、冲突和方法演进。" : "Comparing conclusions, conditions, conflicts, and method lineage."}</p></div></div> : synthesis && availablePapers < 2 ? (error ? <p role="alert">{error}</p> : null) : <div className="v2-route-panel-empty v2-synthesis-empty"><InterfaceIcon name="synthesis" className="pi-state-mark" /><div><strong>{availablePapers < 2 ? (locale === "zh" ? "至少需要两篇已确认、可核验的论文" : "At least two confirmed, grounded papers are needed") : (locale === "zh" ? "尚无跨论文综合" : "No cross-paper synthesis yet")}</strong><p>{availablePapers < 2 ? (locale === "zh" ? `现有可核验证据：${availablePapers} 篇。` : `Grounded evidence available: ${availablePapers} paper(s).`) : (locale === "zh" ? "现有证据可用于生成带来源的综合。" : "The available evidence can support a source-linked synthesis.")}</p>{error && <em>{error}</em>}</div>{availablePapers >= 2 ? <button type="button" onClick={onRefresh}>{locale === "zh" ? "开始综合" : "Build synthesis"} →</button> : <button type="button" onClick={onMaterials}>{locale === "zh" ? "查看材料" : "View materials"} →</button>}</div>}
  </section>;
}

function researchProblemStageLabel(stage: ResearchProblemStage, locale: Locale) {
  const labels = {
    literature: { zh: "文献界定", en: "Literature framing" }, theory: { zh: "理论推导", en: "Theory" },
    method: { zh: "方法设计", en: "Method design" }, experiment: { zh: "实验验证", en: "Experiment" }, writing: { zh: "论文写作", en: "Writing" },
  };
  return labels[stage][locale];
}

function researchProblemRelationLabel(relation: ResearchProblemAssessment["hypothesisImpacts"][number]["relation"], locale: Locale) {
  const labels = {
    supports: { zh: "支持", en: "Supports" }, challenges: { zh: "挑战", en: "Challenges" },
    qualifies: { zh: "限定", en: "Qualifies" }, method: { zh: "方法支撑", en: "Method support" }, gap: { zh: "仍有缺口", en: "Evidence gap" },
  };
  return labels[relation][locale];
}

function researchEvidenceLevelLabel(level: ResearchSynthesisSource["evidenceLevel"], locale: Locale) {
  if (level === "abstract") return locale === "zh" ? "摘要证据" : "Abstract evidence";
  if (level === "metadata") return locale === "zh" ? "结构化元数据" : "Structured metadata";
  return locale === "zh" ? "已保存历史证据" : "Saved legacy evidence";
}

function ResearchStatementTrace({ statementIds, synthesis, locale, userDefined = false }: {
  statementIds: string[];
  synthesis: ResearchSynthesis | null;
  locale: Locale;
  userDefined?: boolean;
}) {
  const statementById = new Map((synthesis?.statements || []).map((statement) => [statement.id, statement]));
  const statements = Array.from(new Set(statementIds)).flatMap((id) => {
    const statement = statementById.get(id);
    return statement ? [statement] : [];
  });
  if (!statements.length) return <small className="v2-problem-trace-missing">{userDefined
    ? (locale === "zh" ? "用户定义假设 · 未绑定综合证据" : "User-defined hypothesis · no synthesis evidence linked")
    : (locale === "zh" ? "来源已变化，请重新研判" : "Sources changed; refresh the assessment")}</small>;
  const sourcePaperCount = new Set(statements.flatMap((statement) => statement.sources.map((source) => source.paperId))).size;
  return <details className="v2-problem-statement-trace"><summary>{locale === "zh"
    ? `追溯 ${statements.length} 条综合判断 · ${sourcePaperCount} 篇论文`
    : `Trace ${statements.length} synthesis statement(s) · ${sourcePaperCount} paper(s)`} ＋</summary><div>{statements.map((statement) => <article key={statement.id}><header><span>{researchSynthesisKindLabel(statement.kind, locale)}</span><strong>{locale === "zh" ? statement.titleZh : statement.titleEn}</strong><small>{statement.confidence}%</small></header><p>{locale === "zh" ? statement.textZh : statement.textEn}</p><footer>{statement.sources.map(source => <div className="pi-problem-source" key={source.claimId}><strong><MathText inline>{source.title}</MathText></strong><small>{researchEvidenceLevelLabel(source.evidenceLevel, locale)} · {source.locator || (locale === "zh" ? "位置待核对" : "Location needs checking")}</small>{source.evidenceQuote && <blockquote><MathText>{source.evidenceQuote}</MathText></blockquote>}{/^https?:\/\//.test(source.sourceUrl) && <a href={source.sourceUrl} target="_blank" rel="noreferrer">{locale === "zh" ? "打开来源" : "Open source"} ↗</a>}</div>)}</footer></article>)}</div></details>;
}

function researchActionStageLabel(stage: string, locale: Locale) {
  const labels: Record<string, Localized> = {
    queued: { zh: "正在排队", en: "Queued" },
    collecting_evidence: { zh: "正在整理证据", en: "Collecting evidence" },
    reasoning: { zh: "正在深入研判", en: "Reasoning" },
    verifying_sources: { zh: "正在核对来源", en: "Verifying sources" },
    ready: { zh: "研究产物已完成", en: "Deliverable ready" },
    interrupted: { zh: "上次执行已中断", en: "Previous run interrupted" },
    failed: { zh: "本次执行未完成", en: "Run failed" },
  };
  return (labels[stage] || labels.reasoning)[locale];
}

function ResearchActionRunOutput({ item, locale, busy, completed, onExecute, onDone }: {
  item: ResearchProblemAction;
  locale: Locale;
  busy: boolean;
  completed: boolean;
  onExecute: () => void;
  onDone: () => void;
}) {
  const run = item.run;
  if (!run) return <button className="v2-action-execute" type="button" disabled={busy} onClick={onExecute}>{locale === "zh" ? "让 Pi 执行" : "Ask Pi to execute"} →</button>;
  if (run.status === "queued" || run.status === "running") return <section className="v2-action-run-progress" role="status" aria-live="polite"><div><InterfaceIcon name="loading" className="pi-state-mark" /><strong>{researchActionStageLabel(run.stage, locale)}</strong><b>{Math.max(8, run.progress)}%</b></div><i><b style={{ width: `${Math.max(8, run.progress)}%` }} /></i><small>{locale === "zh" ? "执行状态已保存；离开页面后回来仍可继续查看。" : "Progress is saved and remains available after you leave this page."}</small></section>;
  if (run.status === "failed") return <section className="v2-action-run-failed"><div><strong>{researchActionStageLabel(run.stage, locale)}</strong><p>{run.error || (locale === "zh" ? "已有研究内容没有受到影响。" : "Existing research content was not affected.")}</p></div><button type="button" disabled={busy} onClick={onExecute}>{locale === "zh" ? "重新执行" : "Retry"}</button></section>;
  const steps = run.deliverable.steps || [];
  const rows = run.deliverable.comparisonRows || [];
  const trustworthy = run.verificationStatus === "verified" || run.verificationStatus === "revised";
  const verificationLabel = run.verificationStatus === "verified" ? (locale === "zh" ? "内容已逐条核验" : "Evidence verified")
    : run.verificationStatus === "revised" ? (locale === "zh" ? "核验后已自动修订" : "Verified after revision")
      : (locale === "zh" ? "证据不足，原结论未发布" : "Insufficient evidence; draft withheld");
  return <section className={`v2-action-run-ready verification-${run.verificationStatus}`}><header><div><small>{locale === "zh" ? "Pi 已执行" : "PI EXECUTED"} · {verificationLabel}</small><h4>{locale === "zh" ? run.headlineZh : run.headlineEn}</h4></div><span>{trustworthy ? "✓" : "!"}</span></header><p>{locale === "zh" ? run.resultZh : run.resultEn}</p>{rows.length > 0 && <div className="v2-action-comparison">{rows.map((row, index) => <article key={`${row.dimensionEn}:${index}`}><strong>{locale === "zh" ? row.dimensionZh : row.dimensionEn}</strong><p>{locale === "zh" ? row.findingZh : row.findingEn}</p><small>{row.paperIds.length} {locale === "zh" ? "篇论文" : "papers"} · {row.claimIds.length} {locale === "zh" ? "条证据" : "claims"}</small></article>)}</div>}{steps.length > 0 && <ol className="v2-action-steps">{steps.map((step, index) => <li key={`${step.titleEn}:${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{locale === "zh" ? step.titleZh : step.titleEn}</strong><p>{locale === "zh" ? step.detailZh : step.detailEn}</p></div></li>)}</ol>}<div className="v2-action-run-judgment"><article><small>{locale === "zh" ? "现在可以作出的判断" : "DECISION NOW"}</small><strong>{locale === "zh" ? run.decisionZh : run.decisionEn}</strong></article><article><small>{locale === "zh" ? "证据边界" : "EVIDENCE BOUNDARY"}</small><p>{locale === "zh" ? run.limitationsZh : run.limitationsEn}</p></article></div>{run.searchQuery && <code className="v2-action-query">{run.searchQuery}</code>}{run.sourcePapers.length > 0 && <details className="v2-action-sources"><summary>{locale === "zh" ? `${run.sourcePapers.length} 篇来源论文` : `${run.sourcePapers.length} source papers`} ＋</summary><div>{run.sourcePapers.map((paper) => <a href={paper.url || "#"} target={paper.url ? "_blank" : undefined} rel="noreferrer" key={paper.id}><strong><MathText inline>{paper.title}</MathText></strong><small>{[paper.authors, paper.publishedAt?.slice(0, 4), paper.venue].filter(Boolean).join(" · ")}</small></a>)}</div></details>}<footer>{completed ? <em>✓ {locale === "zh" ? "已形成长期研究记录" : "Saved to research history"}</em> : trustworthy && <button type="button" disabled={busy} onClick={onDone}>{locale === "zh" ? "确认完成" : "Mark complete"}</button>}{!completed && <button type="button" disabled={busy} onClick={onExecute}>{trustworthy ? (locale === "zh" ? "按最新证据重做" : "Rerun with latest evidence") : (locale === "zh" ? "补证据后重试" : "Retry after adding evidence")}</button>}</footer></section>;
}

function ResearchProblemWorkbench({
  state, synthesis, loading, action, error, locale, mode, draftStorageKey, onDraft, onConfirm, onAssess, onScanProblem, onUpdateAction, onExecuteAction, onSynthesis,
}: {
  draftStorageKey: string;
  mode?: "question" | "tasks";
  state: ResearchProblemState | null;
  synthesis: ResearchSynthesis | null;
  loading: boolean;
  action: string | null;
  error: string;
  locale: Locale;
  onDraft: () => void;
  onSynthesis: () => void;
  onConfirm: (draft: { question: string; objective: string; scope: string; successCriteria: string; stage: ResearchProblemStage; hypotheses: Array<{ statement: string; rationale: string; confidence: number; sourceStatementIds: string[] }> }) => void;
  onAssess: () => void;
  onScanProblem: () => void;
  onUpdateAction: (actionId: string, status: "accepted" | "done" | "dismissed") => void;
  onExecuteAction: (action: ResearchProblemAction) => void;
}) {
  const [draftStorageError, setDraftStorageError] = useState(false);
  const [draft, setDraft] = useState(() => ({
    question: state?.problem?.question || "",
    objective: state?.problem?.objective || "",
    scope: state?.problem?.scope || "",
    successCriteria: state?.problem?.successCriteria || "",
    stage: state?.problem?.stage || "literature" as "literature" | "theory" | "method" | "experiment" | "writing",
  }));
  const [hypotheses, setHypotheses] = useState<Array<{ statement: string; rationale: string; confidence: number; sourceStatementIds: string[] }>>(() =>
    state?.hypotheses.filter((item) => item.status !== "rejected").map((item) => ({
      statement: item.statement,
      rationale: item.rationale,
      confidence: item.confidence,
      sourceStatementIds: item.sourceStatementIds,
    })) || [],
  );
  const editDraft = (update: (previous: typeof draft) => typeof draft) => {
    const next = update(draft); setDraft(next);
    setDraftStorageError(!writeSessionDraft(draftStorageKey, JSON.stringify(state?.problem || null), JSON.stringify({ draft: next, hypotheses })));
  };
  const editHypotheses = (update: (previous: typeof hypotheses) => typeof hypotheses) => {
    const next = update(hypotheses); setHypotheses(next);
    setDraftStorageError(!writeSessionDraft(draftStorageKey, JSON.stringify(state?.problem || null), JSON.stringify({ draft, hypotheses: next })));
  };
  if (loading && !state) return <section className="v2-route-workspace-panel v2-route-panel-empty v2-problem-loading" role="tabpanel"><InterfaceIcon name="loading" className="pi-state-mark" /><div><strong>{locale === "zh" ? "正在读取研究问题" : "Loading the research problem"}</strong><p>{locale === "zh" ? "核对问题、假设和最新证据。" : "Checking the problem, hypotheses, and latest evidence."}</p></div></section>;
  const active = state?.problem?.status === "active";
  if (mode === "tasks" && (!active || !state?.problem)) return <section className="v2-route-workspace-panel"><h2>{locale === "zh" ? "研究任务" : "Research tasks"}</h2>{error && <p role="alert">{error}</p>}<p>{locale === "zh" ? "先在问题与判断中确认研究问题，再根据证据提出具体任务。" : "Confirm a research question first, then use the evidence to propose tasks."}</p><button type="button" onClick={onSynthesis}>{locale === "zh" ? "前往问题与判断" : "Open question & findings"} →</button></section>;
  if (!active || !state?.problem) return <section className="v2-route-workspace-panel v2-research-problem pi-problem-reading" role="tabpanel">
    <header><div><p className="v2-kicker">{locale === "zh" ? "待核实的工作问题" : "WORKING QUESTION · NOT YET CONFIRMED"}</p><h2><MathText>{draft.question || (locale === "zh" ? "这条路线，接下来要回答什么？" : "What should this route answer next?")}</MathText></h2></div></header>
    {error && <p role="alert">{error}</p>}
    <section className="pi-problem-section"><h3>{locale === "zh" ? "还需要核实什么" : "What needs checking"}</h3>{hypotheses.length ? hypotheses.map((item, index) => <article key={index}><p><MathText>{item.statement}</MathText></p>{item.rationale && <p><MathText>{item.rationale}</MathText></p>}<ResearchStatementTrace statementIds={item.sourceStatementIds} synthesis={synthesis} locale={locale} userDefined={!item.sourceStatementIds.length} /></article>) : <p>{locale === "zh" ? "尚未定义具体假设。需要明确研究对象、适用条件和可检验的结果；材料未收集齐不等于领域存在空白。" : "No specific hypothesis has been defined. Specify the object, conditions and testable result; missing materials do not establish a research gap."}</p>}</section>
    <section className="pi-problem-section"><h3>{locale === "zh" ? "下一步" : "Next step"}</h3><p>{locale === "zh" ? "写下你想回答的一个问题，并说明用什么结果判断是否推进。确认后才用于后续研究。" : "Write one question and the result that would count as progress. It guides research only after confirmation."}</p>{state?.evidence.canDraft ? <button type="button" disabled={Boolean(action)} onClick={onDraft}>{action === "draft" ? (locale === "zh" ? "正在起草…" : "Drafting…") : (locale === "zh" ? "根据材料起草问题" : "Draft from evidence")}</button> : <button type="button" onClick={onSynthesis}>{locale === "zh" ? "核对现有材料" : "Inspect materials"} →</button>}</section>
    <SectionNavigation label={locale === "zh" ? "继续推进" : "Continue"} items={[{ label: locale === "zh" ? "填写或修改问题" : "Define or edit question", target: ".pi-problem-edit" }]} /><details className="pi-problem-edit"><summary>{locale === "zh" ? (draft.question ? "编辑问题" : "写下研究问题") : (draft.question ? "Edit question" : "Write a question")}</summary>{draftStorageError && <p role="alert">{locale === "zh" ? "草稿无法暂存，请复制保留后再离开。" : "Draft storage unavailable. Copy your work before leaving."}</p>}<DraftRecovery key={draftStorageKey} storageKey={draftStorageKey} current={JSON.stringify({ draft, hypotheses })} base={JSON.stringify(state?.problem || null)} locale={locale} onRestore={value => { try { const local = JSON.parse(value); if (local.draft && ["question", "objective", "scope", "successCriteria", "stage"].every(field => typeof local.draft[field] === "string") && Array.isArray(local.hypotheses)) { setDraft(local.draft); setHypotheses(local.hypotheses); } } catch { /* Preserve the server-backed form. */ } }} /><div className="v2-problem-editor"><label className="question"><span>{locale === "zh" ? "当前要回答的问题" : "Question to answer"}</span><textarea placeholder={locale === "zh" ? "明确研究对象、条件和你想回答的关系" : "Name the object, conditions and relationship you want to understand"} value={draft.question} maxLength={520} onChange={(event) => editDraft((current) => ({ ...current, question: event.target.value }))} /></label><label><span>{locale === "zh" ? "研究目标" : "Objective"}</span><textarea value={draft.objective} maxLength={700} onChange={(event) => editDraft((current) => ({ ...current, objective: event.target.value }))} /></label><label><span>{locale === "zh" ? "范围与边界" : "Scope and boundary"}</span><textarea value={draft.scope} maxLength={700} onChange={(event) => editDraft((current) => ({ ...current, scope: event.target.value }))} /></label><label><span>{locale === "zh" ? "怎样才算推进" : "Success criterion"}</span><textarea placeholder={locale === "zh" ? "例如：完成一次有出处的条件比较，或验证一个具体边界情形" : "For example: a sourced comparison of assumptions, or a checked boundary case"} value={draft.successCriteria} maxLength={700} onChange={(event) => editDraft((current) => ({ ...current, successCriteria: event.target.value }))} /></label><label className="stage"><span>{locale === "zh" ? "当前阶段" : "Current stage"}</span><select value={draft.stage} onChange={(event) => editDraft((current) => ({ ...current, stage: event.target.value as typeof current.stage }))}>{(["literature", "theory", "method", "experiment", "writing"] as const).map((stage) => <option value={stage} key={stage}>{researchProblemStageLabel(stage, locale)}</option>)}</select></label></div><section className="v2-problem-hypotheses"><header><strong>{locale === "zh" ? "待确认假设" : "Hypotheses to confirm"}</strong><small>{locale === "zh" ? "你可以直接修改；Pi 只保留提案身份" : "Edit freely; Pi keeps these as proposals until confirmation"}</small></header>{hypotheses.map((hypothesis, index) => <article key={index}><span>H{index + 1}</span><div><textarea value={hypothesis.statement} maxLength={520} onChange={(event) => editHypotheses((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, statement: event.target.value } : item))} /><p>{hypothesis.rationale}</p></div><button type="button" onClick={() => editHypotheses((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></article>)}<button className="add" type="button" onClick={() => editHypotheses((current) => [...current, { statement: "", rationale: "", confidence: 0, sourceStatementIds: [] }])}>＋ {locale === "zh" ? "增加一个自己的假设" : "Add your own hypothesis"}</button></section><footer className="v2-problem-confirm"><div><strong>{locale === "zh" ? "确认后才会指导扫描" : "Guides discovery only after confirmation"}</strong><p>{locale === "zh" ? "之后 Pi 可以提出证据影响和修改建议，但不会自动改写这些内容。" : "Pi may suggest evidence impacts and revisions later, but never silently rewrites these fields."}</p></div><button type="button" disabled={Boolean(action) || !draft.question.trim() || !draft.objective.trim() || !draft.scope.trim() || !draft.successCriteria.trim()} onClick={() => onConfirm({ ...draft, hypotheses: hypotheses.filter((item) => item.statement.trim()) })}>{action === "confirm" ? (locale === "zh" ? "正在确认…" : "Confirming…") : (locale === "zh" ? "确认并用于研究" : "Confirm for research")} →</button></footer></details></section>;
  const assessment = state.assessment;
  const acceptedActions = state.actions.filter((item) => item.status === "accepted");
  return <section className="v2-route-workspace-panel v2-research-problem active pi-problem-reading" role="tabpanel">
    <header><div><p className="v2-kicker">{locale === "zh" ? "用户确认的研究问题" : "USER-CONFIRMED RESEARCH PROBLEM"}</p><h2><MathText inline>{state.problem.question}</MathText></h2></div><span>{researchProblemStageLabel(state.problem.stage, locale)}</span></header>
    {mode !== "tasks" && (assessment ? <section className={`v2-problem-assessment ${assessment.stale ? "stale" : ""}`}><header><div><small>{locale === "zh" ? "最新证据对问题的影响" : "LATEST EVIDENCE IMPACT"}</small><strong>{assessment.confidence}% {locale === "zh" ? "当前判断置信度" : "current confidence"}</strong></div><button type="button" disabled={Boolean(action)} onClick={onAssess}>{action === "assess" ? (locale === "zh" ? "Pi 正在研判…" : "Assessing…") : assessment.stale ? (locale === "zh" ? "按最新证据更新" : "Refresh from evidence") : (locale === "zh" ? "重新研判" : "Reassess")}</button></header><p>{locale === "zh" ? assessment.summaryZh : assessment.summaryEn}</p>{(locale === "zh" ? assessment.changeZh : assessment.changeEn) && <blockquote><b>↗</b><span><strong>{locale === "zh" ? "本次改变" : "What changed"}</strong>{locale === "zh" ? assessment.changeZh : assessment.changeEn}</span></blockquote>}<ResearchStatementTrace statementIds={assessment.sourceStatementIds} synthesis={synthesis} locale={locale} /><div><article><small>{locale === "zh" ? "最关键的不确定性" : "KEY UNCERTAINTY"}</small><p>{locale === "zh" ? assessment.uncertaintyZh : assessment.uncertaintyEn}</p></article><article><small>{locale === "zh" ? "下一项需要作出的判断" : "NEXT DECISION"}</small><p>{locale === "zh" ? assessment.nextDecisionZh : assessment.nextDecisionEn}</p></article></div>{assessment.nextSearchQuery && <section className="v2-problem-next-search"><div><small>{locale === "zh" ? "由当前研判生成的定向检索" : "TARGETED SEARCH FROM THIS ASSESSMENT"}</small><code>{assessment.nextSearchQuery}</code><p>{assessment.stale ? (locale === "zh" ? "证据已经变化，请先更新研判；旧检索不会继续供稿。" : "Evidence has changed. Refresh the assessment before this query can supply candidates.") : (locale === "zh" ? "Pi 已自动安排一次有上限的补证；此按钮可提前执行。候选进入今日共用的质量评估队列，不会直接改写路线或假设。" : "Pi has automatically scheduled one bounded evidence search; this button runs it early. Candidates enter Today's shared quality queue and do not directly rewrite the route or hypotheses.")}</p></div><button type="button" disabled={Boolean(action) || assessment.stale} onClick={onScanProblem}>{action === "scan-problem" ? (locale === "zh" ? "正在寻找论文…" : "Discovering papers…") : (locale === "zh" ? "立即提前检索" : "Run search now")} →</button></section>}</section> : <section className="v2-problem-assessment empty"><div><strong>{locale === "zh" ? "问题已经确认，等待第一次证据研判" : "The problem is confirmed and ready for its first evidence assessment"}</strong><p>{locale === "zh" ? "Pi 会把跨论文证据映射到你的假设，只提出影响，不修改问题。" : "Pi maps cross-paper evidence to your hypotheses and suggests impacts without changing the problem."}</p></div><button type="button" disabled={Boolean(action) || !state.evidence.canAssess} onClick={onAssess}>{action === "assess" ? (locale === "zh" ? "Pi 正在研判…" : "Assessing…") : (locale === "zh" ? "开始证据研判" : "Assess evidence")} →</button></section>)}
    <section className="v2-problem-actions" hidden={mode !== "tasks"}><header><div><strong>{locale === "zh" ? "接下来推进什么" : "What moves the problem forward"}</strong><small>{locale === "zh" ? "接受后由 Pi 执行；结果带来源并长期保存" : "Pi executes accepted actions and saves source-linked results"}</small></div><span>{acceptedActions.length} {locale === "zh" ? "进行中" : "active"}</span></header>
      {state.actions.map((item, index) => <article className={`${item.status} ${item.run?.status || "not-run"}`} key={item.id}><span>{item.status === "done" ? "✓" : String(index + 1).padStart(2, "0")}</span><div className="v2-action-body"><small>{({ read: locale === "zh" ? "阅读核查" : "Read", compare: locale === "zh" ? "比较论文" : "Compare", verify: locale === "zh" ? "验证条件" : "Verify", search: locale === "zh" ? "补充检索" : "Search", decide: locale === "zh" ? "形成判断" : "Decide" })[item.kind]}</small><strong>{locale === "zh" ? item.titleZh : item.titleEn}</strong><p>{locale === "zh" ? item.rationaleZh : item.rationaleEn}</p>{item.status !== "proposed" && <ResearchActionRunOutput item={item} locale={locale} busy={Boolean(action)} completed={item.status === "done"} onExecute={() => onExecuteAction(item)} onDone={() => onUpdateAction(item.id, "done")} />}</div>{item.status === "proposed" && <footer><button type="button" disabled={Boolean(action)} onClick={() => onExecuteAction(item)}>{locale === "zh" ? "接受并让 Pi 执行" : "Accept & execute"}</button><button type="button" disabled={Boolean(action)} onClick={() => onUpdateAction(item.id, "dismissed")}>{locale === "zh" ? "暂不做" : "Dismiss"}</button></footer>}</article>)}
      {!state.actions.length && <p className="v2-problem-no-actions">{locale === "zh" ? "完成一次证据研判后，Pi 会提出 1–3 项具体行动。" : "After an evidence assessment, Pi will propose 1–3 concrete moves."}</p>}
    </section>
    <details className="v2-problem-context" hidden={mode === "tasks"}><summary><span><small>{locale === "zh" ? "已确认的问题上下文" : "CONFIRMED PROBLEM CONTEXT"}</small><strong>{locale === "zh" ? `目标、边界、推进标准与 ${state.hypotheses.filter((item) => item.status === "confirmed").length} 个假设` : `Objective, scope, success criterion, and ${state.hypotheses.filter((item) => item.status === "confirmed").length} hypotheses`}</strong></span><b>{locale === "zh" ? "展开查看 ↓" : "Inspect context ↓"}</b></summary><div className="v2-problem-definition"><article><small>{locale === "zh" ? "当前目标" : "OBJECTIVE"}</small><p>{state.problem.objective}</p></article><article><small>{locale === "zh" ? "范围边界" : "SCOPE"}</small><p>{state.problem.scope}</p></article><article><small>{locale === "zh" ? "推进标准" : "SUCCESS CRITERION"}</small><p>{state.problem.successCriteria}</p></article></div><section className="v2-problem-confirmed-hypotheses"><header><strong>{locale === "zh" ? "当前假设" : "Current hypotheses"}</strong><span>{state.hypotheses.filter((item) => item.status === "confirmed").length}</span></header>{state.hypotheses.filter((item) => item.status === "confirmed").map((hypothesis, index) => { const impacts = assessment?.hypothesisImpacts.filter((item) => item.hypothesisId === hypothesis.id) || []; return <article key={hypothesis.id}><span>H{index + 1}</span><div><h3>{hypothesis.statement}</h3><p>{hypothesis.rationale}</p><ResearchStatementTrace statementIds={hypothesis.sourceStatementIds} synthesis={synthesis} locale={locale} userDefined={!hypothesis.sourceStatementIds.length} />{impacts.map((impact) => <aside className={impact.relation} key={`${impact.hypothesisId}:${impact.relation}`}><b>{researchProblemRelationLabel(impact.relation, locale)}</b><span>{locale === "zh" ? impact.explanationZh : impact.explanationEn}</span><em>{impact.confidence}%</em><ResearchStatementTrace statementIds={impact.sourceStatementIds} synthesis={synthesis} locale={locale} /></aside>)}</div></article>; })}</section></details>
    {error && <div className="v2-problem-error">{error}</div>}
  </section>;
}

export default function ResearchApp({ user, demo = false }: { user: User; demo?: boolean }) {
  const [locale, setLocale] = useState<Locale>("zh");
  const [view, setView] = useState<View>("today");
  const [todaySurface,setTodaySurface]=useState<"home"|"reading"|"discovery"|"records"|"settings">("home");
  const openTodaySurface=(surface:typeof todaySurface)=>navigate("today",undefined,{panel:surface});
  const [memoryRouteError, setMemoryRouteError] = useState(false);
  const [memoryRouteRetry, setMemoryRouteRetry] = useState(0);
  const [memorySection, setMemorySection] = useState<"continue" | "reading" | "insights" | "preferences">("preferences");
  const [spaces, setSpaces] = useState<Space[]>(fallbackSpaces);
  const [deletedSpaces,setDeletedSpaces]=useState<Space[]>([]);
  const [spaceDeletionEnabled,setSpaceDeletionEnabled]=useState(false);
  const [workspaceReady,setWorkspaceReady] = useState(false);
  const [workspaceEmpty,setWorkspaceEmpty] = useState(false);
  const [workspaceSession,setWorkspaceSession] = useState<WorkspaceSession|null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState(fallbackSpaces[0].id);
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [spaceCreateError, setSpaceCreateError] = useState("");
  const [newSpace, setNewSpace] = useState({ name: "", memberName: "", description: "" });
  const [selectedMonitorPaper, setSelectedMonitorPaper] = useState<MonitorPaper | null>(null);
  const updateOpenedPaperReviewStage = useCallback((paperId: string, qualityStage: "queued") => {
    setSelectedMonitorPaper(current => current?.id === paperId && current.qualityStage !== qualityStage ? { ...current, qualityStage } : current);
  }, []);


  const [researchSynthesis, setResearchSynthesis] = useState<ResearchSynthesis | null>(null);
  const [researchSynthesisLoading, setResearchSynthesisLoading] = useState(false);
  const [researchSynthesisError, setResearchSynthesisError] = useState("");
  const synthesisAutoAttemptRef = useRef(new Set<string>());
  const [researchProblemState, setResearchProblemState] = useState<ResearchProblemState | null>(null);
  const [researchProblemLoading, setResearchProblemLoading] = useState(false);
  const [researchProblemAction, setResearchProblemAction] = useState<string | null>(null);
  const [researchProblemError, setResearchProblemError] = useState("");
  const researchProblemAutoAttemptRef = useRef(new Set<string>());
  const [researchMap, setResearchMap] = useState<ResearchMapState>(() => emptyResearchMapState());
  const [selectedThread, setSelectedThread] = useState<ResearchTrack | null>(null);
  const [researchMapMode, setResearchMapMode] = useState<ResearchMapMode>("directions");
  const [researchRouteTab, updateResearchRouteTab] = useState<ResearchRouteTab>("start");
  const setResearchRouteTab = (tab: ResearchRouteTab) => {
    const next = tab === "gaps" ? "evidence" : tab === "assessment" ? "problem" : tab;
    updateResearchRouteTab(next);
    if (view === "thread-detail" && selectedThread) navigate("thread-detail", workbookTrackId, { id: selectedThread.id, tab: next });
  };
  const [graphTask, setGraphTask] = useState<GraphTaskContext>({spaceId:"",question:"",papers:[]});
  const [workbookTask, setWorkbookTask] = useState<GraphTaskContext | undefined>();
  const [learningTask, setLearningTask] = useState<GraphTaskContext | undefined>();
  const [graphDetailsOpen, setGraphDetailsOpen] = useState(false);
  const [workbookVersionId, setWorkbookVersionId] = useState("");
  const [workbookTrackId, setWorkbookTrackId] = useState<string | null>(null);
  const [workbookReturnView, setWorkbookReturnView] = useState<View>("threads");
  const [workbookPaperFocus, setWorkbookPaperFocus] = useState("");
  const [libraryViewState,setLibraryViewState]=useState({query:"",scope:"related" as "related"|"all",page:1,focusId:""});
  const [workbookViewState,setWorkbookViewState]=useState({panel:"evidence" as "evidence"|"relations"|"task",focus:""});
  const loadedWorkbookRef = useRef('');
  const { workbookScrollRef, navigationScroll, restoredLocation: restoredLocationRef, navigationRevision, requestLocationRestore, updateWorkspaceHash, rememberCurrentLocation } = useWorkspaceNavigation(activeSpaceId, user.userId);
  const [navigationIssue, setNavigationIssue] = useState<"space" | "missing" | "paper" | null>(null);
  const [requestedLocation, setRequestedLocation] = useState<WorkspaceLocation | null>(null);
  useEffect(() => {
    if (!navigationIssue) return;
    const frame = requestAnimationFrame(() => {
      const notice = document.querySelector<HTMLElement>(".pi-navigation-notice");
      notice?.focus({ preventScroll: true }); notice?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [navigationIssue]);
  const [libraryGraphPaperId, setLibraryGraphPaperId] = useState("");
  const [graphReturnView, setGraphReturnView] = useState<"threads" | "library">("threads");
  const [recoveryFocusRequested, setRecoveryFocusRequested] = useState(false);
  const paperNetworkNavigation = usePaperNetworkNavigation(updateWorkspaceHash);
  const restorePaperNetworkNavigation = paperNetworkNavigation.restore;
  const graphSurface = paperNetworkNavigation.surface;
  const paperNetworkMode = paperNetworkNavigation.mode;
  const paperNetworkScope = paperNetworkNavigation.scope;
  const paperNetworkTrackId = paperNetworkNavigation.trackId;
  const selectedNetworkPaperId = paperNetworkNavigation.focusId;
  const setGraphSurface = paperNetworkNavigation.setSurface;
  const setPaperNetworkMode = paperNetworkNavigation.setMode;
  const setPaperNetworkScope = paperNetworkNavigation.setScope;
  const setPaperNetworkTrackId = paperNetworkNavigation.setTrackId;
  const setSelectedNetworkPaperId = paperNetworkNavigation.setFocus;
  const changeNetworkMode = paperNetworkNavigation.changeMode;
  const changeNetworkScope = paperNetworkNavigation.changeScope;
  const changeNetworkFocus = paperNetworkNavigation.changeFocus;
  const [paperDiscoveryTab, setPaperDiscoveryTab] = useState<PaperDiscoveryTab>("similar");
  const [multiOriginIntent, setMultiOriginIntent] = useState<MultiOriginIntent>("shared");
  const [paperNetworkOriginCanonicalIds, setPaperNetworkOriginCanonicalIds] = useState<string[]>([]);
  const [hoveredNetworkPaperId, setHoveredNetworkPaperId] = useState<string | null>(null);
  const [researchNetworkSeeds, setResearchNetworkSeeds] = useState<ResearchNetworkSeed[]>([]);
  const [researchNetworkCandidates, setResearchNetworkCandidates] = useState<ResearchNetworkCandidate[]>([]);
  const [researchNetworkSimilarityEdges, setResearchNetworkSimilarityEdges] = useState<ResearchNetworkSimilarityEdge[]>([]);
  const [researchNetworkResponse, setResearchNetworkResponse] = useState<ResearchNetworkExpandResponse | null>(null);
  const [researchNetworkDecisions, setResearchNetworkDecisions] = useState<Record<string, "accepted" | "dismissed" | "saving">>({});
  const [researchNetworkLoading, setResearchNetworkLoading] = useState(false);
  const [researchNetworkError, setResearchNetworkError] = useState("");
  const [paperNetworkLoading, setPaperNetworkLoading] = useState(false);
  const [paperNetworkBuildPhase, setPaperNetworkBuildPhase] = useState<PaperNetworkBuildPhase>(null);
  const paperNetworkSpaceRef = useRef(activeSpaceId);
  const paperNetworkAutoAttemptRef = useRef(new Set<string>());
  const researchNetworkContextRef = useRef({ version: 0, spaceId: activeSpaceId, originKey: "" });
  const researchNetworkExpandRequestRef = useRef(0);
  const researchNetworkDecisionSequenceRef = useRef(0);
  const researchNetworkDecisionRequestsRef = useRef(new Map<string, number>());
  const [mapLoading, setMapLoading] = useState(false);
  const [mapAction, setMapAction] = useState<string | null>(null);
  const [mapOutlinePhase, setMapOutlinePhase] = useState(0);
  const [mapBuildTrackId, setMapBuildTrackId] = useState<string | null>(null);
  const [, setMapBuildErrors] = useState<Record<string, boolean>>({});
  const [mapIntelligenceTrackId, setMapIntelligenceTrackId] = useState<string | null>(null);
  const [learningState, setLearningState] = useState<LearningPathState>({ path: null, suggestedTarget: "", availablePaperCount: 0, waitingQualityCount: 0, model: "deepseek-flash" });
  const [learningMonitorWake, setLearningMonitorWake] = useState(0);
  const [learningTarget, setLearningTarget] = useState("");
  const [learningPlannerOpen, setLearningPlannerOpen] = useState(false);
  const [learningTargetTrackId, setLearningTargetTrackId] = useState<string | null>(null);
  const [learningScopeDirty, setLearningScopeDirty] = useState(false);
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningAction, setLearningAction] = useState<string | null>(null);
  const [learningBrowseSelection, setLearningBrowseSelection] = useState<{ scope: string; stepId: string } | null>(null);
  const [learningLoadedSpaceId, setLearningLoadedSpaceId] = useState<string | null>(null);
  const [learningError, setLearningError] = useState("");
  const [learningReloadNonce, setLearningReloadNonce] = useState(0);
  const learningRequestRef = useRef(0);
  const learningIntentRef = useRef<{ spaceId: string; trackId: string; target: string } | null>(null);
  const [modelConnectionState, setModelConnectionState] = useState<ModelConnectionState>("checking");
  const [connectedModel, setConnectedModel] = useState<string | null>(null);
  const [modelCredentialSource, setModelCredentialSource] = useState<"browser" | "server" | null>(null);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [checkingModel, setCheckingModel] = useState(false);
  const [modelApiKey, setModelApiKey] = useState("");
  const [modelSettingsError, setModelSettingsError] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [compactAsk, setCompactAsk] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const sync = () => setCompactAsk(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const [askContext, setAskContext] = useState<{trackId?: string; routePaperId?: string; paperId?: string}>({});
  const [askError, setAskError] = useState("");
  const askRequest = useRef(0);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerMode, setAnswerMode] = useState<"deepseek" | "preview" | null>(null);
  const [answerModel, setAnswerModel] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [monitor, setMonitor] = useState<MonitorState | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [workspaceLoadFailed, setWorkspaceLoadFailed] = useState(false);
  const [monitorLoadFailed, setMonitorLoadFailed] = useState(false);
  const [reloadingMonitor, setReloadingMonitor] = useState(false);
  const savedMonitorReadRef=useRef<{spaceId:string;controller:AbortController}|null>(null);
  const monitorSpaceRef = useRef<string | null>(null);
  const [scanElapsedSeconds, setScanElapsedSeconds] = useState(0);
  const [sourceSettingsOpen, setSourceSettingsOpen] = useState(false);
  const [sourceSection, setSourceSection] = useState("suggested");
  const [spaceSection, setSpaceSection] = useState("existing");
  const [venueDraft, setVenueDraft] = useState("");
  const [authorDraft, setAuthorDraft] = useState("");
  const [explorationDraft, setExplorationDraft] = useState<"focused" | "balanced" | "open">("balanced");
  const [savingPreferences, setSavingPreferences] = useState(false);
  const feedbackSaving = useRef(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackReceipt, setFeedbackReceipt] = useState<{spaceId:string;title:string;effect:string;paper:MonitorPaper;kind:"save"|"relevant"|"not_relevant";error?:string} | null>(null);
  const [feedbackPrompt, setFeedbackPrompt] = useState<{ paper: MonitorPaper; kind: "relevant" | "not_relevant" } | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [libraryStageFilter, setLibraryStageFilter] = useState<LibraryStageFilter>("all");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [libraryRevision,setLibraryRevision]=useState(0);
  const [libraryTag,setLibraryTag]=useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("priority");
  const [libraryPageNumber,setLibraryPageNumber]=useState(1);
  const [libraryVisibleCount, setLibraryVisibleCount] = useState(60);
  const [paperReturnView, setPaperReturnView] = useState<View>("today");
  const [paperNoteDraft, setPaperNoteDraft] = useState("");
  const [paperPanel,setPaperPanel]=useState<PaperPanel>("reading");
  const [noteSaveError, setNoteSaveError] = useState("");
  const [savedReadingId, setSavedReadingId] = useState("");
  const [questionReadingIds,setQuestionReadingIds]=useState<{spaceId:string;ids:string[]}>({spaceId:"",ids:[]});
  const [noteDraftUnavailable, setNoteDraftUnavailable] = useState(false);
  const noteDraftKey = sessionDraftKey(user.userId, activeSpaceId, `note:${selectedMonitorPaper?.id || ""}`);
  const editPaperNote = (value: string) => {
    setPaperNoteDraft(value); setNoteSaveError("");
    setNoteDraftUnavailable(!writeSessionDraft(noteDraftKey, selectedMonitorPaper?.readingNote || "", value));
  };
  const [readingMemoryAnalyzing, setReadingMemoryAnalyzing] = useState(false);
  const [readingSaving, setReadingSaving] = useState(false);
  const readingWriteRef = useRef<object | null>(null);
  const learningPaperRequestRef = useRef(0);
  const [openingLearningResourceId, setOpeningLearningResourceId] = useState<string | null>(null);
  const [notificationsExpanded, setNotificationsExpanded] = useState(false);
  const [sharingSnapshot, setSharingSnapshot] = useState<string | null>(null);
  const [researchImports, setResearchImports] = useState<ResearchImportRecord[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importSourceKind, setImportSourceKind] = useState<ImportSourceKind>("chat");
  const [importFiles, setImportFiles] = useState<ImportedMaterial[]>([]);
  const [pastedMaterial, setPastedMaterial] = useState("");
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [parsingMaterials, setParsingMaterials] = useState(false);
  const [analyzingImport, setAnalyzingImport] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [importDraft, setImportDraft] = useState<ResearchImportRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const reportedImpressions = useRef(new Set<string>());
  const reportedEngagements = useRef(new Set<string>());
  const engagementSessionRef = useRef("");

  const t = copy[locale];
  useEffect(() => { paperNetworkSpaceRef.current = activeSpaceId; }, [activeSpaceId]);
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) || spaces[0] || fallbackSpaces[0];
  useEffect(()=>()=>{savedMonitorReadRef.current?.controller.abort()},[activeSpace.id]);
  const currentGraphTask = graphTask.spaceId === activeSpace.id ? graphTask : {spaceId:activeSpace.id,question:"",papers:[]};
  const activeSpaceSupportsLearning = !activeSpace.id.startsWith("space-") && !activeSpace.id.startsWith("local-");
  const activeLearningReady = learningLoadedSpaceId === activeSpace.id;
  const activeLearningState: LearningPathState = activeLearningReady
    ? learningState
    : { path: null, suggestedTarget: "", availablePaperCount: 0, waitingQualityCount: 0, model: "deepseek-flash" };
  const activeLearningLoading = learningLoading || (activeSpaceSupportsLearning && !activeLearningReady);
  const activeLearningError = activeLearningReady ? learningError : "";
  const activeLearningTargetTrack = learningTargetTrackId ? researchMap.tracks.find((track) => track.id === learningTargetTrackId) || null : null;
  const activeLearningPathDirectionMismatch = Boolean(activeLearningState.path
    && (learningTargetTrackId
      ? activeLearningState.path.targetTrackId !== learningTargetTrackId
      : learningScopeDirty && activeLearningState.path.targetTrackId !== null));
  const currentLearningStep = activeLearningState.path?.steps.find((step) => step.status === "active")
    || activeLearningState.path?.steps.find((step) => step.status !== "completed") || null;
  const learningBrowseScope = `${activeSpace.id}:${activeLearningState.path?.id || ''}`;
  const activeLearningStep = learningBrowseStep(activeLearningState.path?.steps || [], currentLearningStep, learningBrowseScope, learningBrowseSelection);
  const readableLearningStep = nextReadableLearningStep(activeLearningState.path?.steps || [], activeLearningStep);
  const mapViewActive = view === "threads" || view === "thread-detail";
  const rankedMonitorPapers = useMemo(
    () => {
      const tierRank: Record<MonitorPaper["recommendationTier"], number> = { must_read: 0, browse: 1, reserve: 2 };
      return [...(monitor?.papers || [])].sort((first, second) => timeValue(second.recommendedAt) - timeValue(first.recommendedAt)
        || (tierRank[first.recommendationTier || "browse"] - tierRank[second.recommendationTier || "browse"])
        || second.qualityScore - first.qualityScore || second.relevanceScore - first.relevanceScore);
    },
    [monitor?.papers],
  );
  const historyPapers = useMemo(() => monitor?.historyPapers || monitor?.papers || [], [monitor?.historyPapers, monitor?.papers]);
  const todayPaperIdentity = useMemo(() => (monitor?.papers || []).map((paper) => paper.id).join("|"), [monitor?.papers]);
  const selectedMonitorPaperId = selectedMonitorPaper?.id || "";
  const engagementEventKey = (paperId: string, kind: string) => {
    if (!engagementSessionRef.current) engagementSessionRef.current = crypto.randomUUID();
    return `${engagementSessionRef.current}:${paperId}:${kind}`;
  };
  const recordPaperEngagement = (
    paper: MonitorPaper,
    kind: "detail_dwell" | "original_click" | "share" | "ask_pi",
    options: { dwellMs?: number; context?: string } = {},
  ) => {
    if (activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spaceId: activeSpace.id,
        paperId: paper.id,
        kind,
        value: true,
        eventKey: engagementEventKey(paper.id, kind),
        dwellMs: options.dwellMs || 0,
        context: options.context || "paper_detail",
      }),
    }).catch(() => undefined);
  };
  const libraryPapers = useMemo(() => {
    const query = librarySearch.trim().toLocaleLowerCase();
    const stateRank: Record<MonitorPaper["userState"], number> = { unseen: 0, seen: 1, snoozed: 2, accepted: 3, dismissed: 4 };
    const qualityStageRank: Record<NonNullable<MonitorPaper["qualityStage"]>, number> = { recommended: 0, reviewing: 1, reviewed: 2, discovered: 3, queued: 4, awaiting_evidence: 4 };
    return historyPapers.filter((paper) => {
      const belongsToRecommendationInbox = paper.qualityStage === "recommended" || paper.qualityStage === "reviewing"
        || paper.saved || Boolean(paper.feedback) || paper.readingStatus !== "unread";
      if (libraryStageFilter === "evaluated" && !["reviewed", "reviewing", "recommended"].includes(paper.qualityStage || "")) return false;
      if (libraryFilter === "inbox" && !belongsToRecommendationInbox) return false;
      if (libraryFilter === "inbox" && ["accepted", "dismissed"].includes(paper.userState)) return false;
      if (libraryFilter === "accepted" && paper.userState !== "accepted") return false;
      if (libraryFilter === "dismissed" && paper.userState !== "dismissed") return false;
      if (libraryFilter === "inbox" && inboxFilter !== "all" && paper.userState !== inboxFilter) return false;
      if (libraryTag==="saved"&&!paper.saved)return false;
      if (libraryTag==="notes"&&!paper.readingNote.trim())return false;
      if (!query) return true;
      return [paper.title, paper.authors, paper.venue,paper.doi,paper.readingNote, paper.summaryZh, paper.summaryEn, paper.whyReadZh, paper.whyReadEn]
        .join(" ").toLocaleLowerCase().includes(query);
    }).sort((first, second) => {
      if (librarySort === "newest") return timeValue(second.discoveredAt) - timeValue(first.discoveredAt);
      if (librarySort === "quality") return second.qualityScore - first.qualityScore || second.relevanceScore - first.relevanceScore;
      return (qualityStageRank[first.qualityStage || "discovered"] - qualityStageRank[second.qualityStage || "discovered"])
        || stateRank[first.userState] - stateRank[second.userState]
        || second.relevanceScore - first.relevanceScore
        || (first.qualityStage === "recommended" && second.qualityStage === "recommended" ? second.qualityScore - first.qualityScore : 0)
        || timeValue(first.firstShownAt) - timeValue(second.firstShownAt);
    });
  }, [historyPapers, inboxFilter, libraryFilter, librarySearch, librarySort, libraryStageFilter,libraryTag]);
  const taskBriefState=useTaskBrief(activeSpace.id,view==='today'&&todaySurface==='home'&&!workspaceLoadFailed&&!activeSpace.id.startsWith('space-')&&!activeSpace.id.startsWith('local-'),`${monitor?.status}:${monitor?.lastRunAt}:${monitor?.newCount}:${selectedMonitorPaper?.feedback}:${selectedMonitorPaper?.readingStatus}:${libraryRevision}`);
  const libraryPage=useLibrarySearch<MonitorPaper>({spaceId:activeSpace.id,enabled:!demo&&view==='library'&&!workspaceLoadFailed&&!activeSpace.id.startsWith('space-')&&!activeSpace.id.startsWith('local-'),q:librarySearch,filter:libraryFilter,stage:libraryStageFilter,inbox:inboxFilter,sort:librarySort,tag:libraryTag,page:libraryPageNumber,onPage:page=>{setLibraryPageNumber(page);updateWorkspaceHash({libraryPage:page},'push');},refresh:JSON.stringify([libraryRevision,monitor?.lastRunAt,monitor?.historyCounts,selectedMonitorPaper?.id,selectedMonitorPaper?.feedback,selectedMonitorPaper?.saved,selectedMonitorPaper?.readingStatus,selectedMonitorPaper?.readingNote])});
  const visibleLibraryPapers = demo?libraryPapers.slice(0,libraryVisibleCount):libraryPage.data?.papers||[];
  const libraryTotal=demo?libraryPapers.length:libraryPage.data?.total;
  const libraryCounts=demo?{...monitor?.historyCounts,total:historyPapers.length}:libraryPage.data?.counts;

  const scanIsActive = Boolean(monitor) && (monitoring || isMonitorScanning(monitor?.status));
  const effectiveScanStatus: MonitorStatus = monitoring && !isMonitorScanning(monitor?.status) ? "scanning" : monitor?.status || "idle";
  const activeScanJob = monitor?.scanJob && !["ready", "error"].includes(monitor.scanJob.status) ? monitor.scanJob : null;
  const verificationInProgress = Boolean(scanIsActive && activeScanJob?.checkpoint === "verifying_recommendations");
  const analysisBudgetBlocked = monitor?.analysisBudget?.available === false;
  const manualCooldownBlocked = shouldBlockManualMonitorStart(monitor);
  const backgroundAutomationDeferred = Boolean(monitor?.automationDeferred && !scanIsActive);
  const failedScanJob = monitor?.status === "error" ? monitor.scanJob || null : null;
  const failedScanError = failedScanJob?.error || monitor?.error || "";
  const resumeAvailable = Boolean(failedScanJob && (failedScanJob.candidateCount || failedScanJob.reviewedCount || failedScanJob.checkpoint === "retry_pending"));
  const compactScanAvailable = Boolean(!scanIsActive
    && monitor?.analysisBudget?.recommendedMode === "fresh_only"
    && !resumeAvailable);
  const scanProgress = scanDisplayProgress(scanIsActive, monitor?.status === "ready", monitorProgressByStatus[effectiveScanStatus], activeScanJob?.progress);
  const scanProgressLabel = verificationInProgress ? (locale === "zh" ? "核对中" : "Checking") : `${scanProgress}%`;
  const baseScanPhase = verificationInProgress
    ? (locale === "zh" ? "正在核对推荐依据" : "Checking recommendation evidence")
    : monitorPhaseLabel(scanIsActive ? effectiveScanStatus : monitor?.status, locale);
  const scanPhase = scanIsActive && activeScanJob?.currentSource ? `${baseScanPhase} · ${activeScanJob.currentSource}` : baseScanPhase;
  const reloadSavedMonitor = async () => {
    const spaceId = activeSpace.id;
    if(savedMonitorReadRef.current?.spaceId===spaceId&&!savedMonitorReadRef.current.controller.signal.aborted)return;
    savedMonitorReadRef.current?.controller.abort();
    const controller=new AbortController(),request={spaceId,controller};savedMonitorReadRef.current=request;
    setReloadingMonitor(true);
    try {
      const data = await readSavedJson('/api/monitor?spaceId=' + encodeURIComponent(spaceId),value=>{
        if(!value||typeof value!=='object'||!('monitor' in value)||!value.monitor||typeof value.monitor!=='object')throw new SavedReadError('invalid');
        return (value as {monitor:MonitorState}).monitor;
      },controller.signal);
      if (savedMonitorReadRef.current!==request||controller.signal.aborted||paperNetworkSpaceRef.current !== spaceId) return;
      setMonitor(data); setMonitorLoadFailed(false);
    } catch {
      if (savedMonitorReadRef.current===request&&!controller.signal.aborted&&paperNetworkSpaceRef.current === spaceId) setMonitorLoadFailed(true);
    } finally {
      if (savedMonitorReadRef.current===request){savedMonitorReadRef.current=null;setReloadingMonitor(false)}
    }
  };
  const monitorReadNotice = workspaceLoadFailed ? <section className="pi-content-loading" role="alert"><strong>{locale === "zh" ? "研究空间暂时未能载入" : "Workspace could not be loaded"}</strong><button type="button" onClick={() => window.location.reload()}>{locale === "zh" ? "重新载入" : "Retry loading"}</button></section> : monitorLoadFailed ? <section className="pi-content-loading" role="alert"><strong>{locale === "zh" ? "论文暂时未能载入" : "Papers could not be loaded"}</strong><p>{locale === "zh" ? "这不代表空间为空。重新载入只读取已有内容。" : "This does not mean the workspace is empty. Reloading only retrieves saved content."}</p><button type="button" disabled={reloadingMonitor} onClick={() => void reloadSavedMonitor()}>{reloadingMonitor ? (locale === "zh" ? "正在载入…" : "Loading…") : (locale === "zh" ? "重新载入" : "Retry loading")}</button></section> : !monitor ? <section className="pi-content-loading" role="status"><strong>{locale === "zh" ? "正在读取已保存的论文…" : "Loading saved papers…"}</strong><p>{locale === "zh" ? "已有内容载入后即可阅读，无需等待后台扫描完成。" : "You can read saved content while discovery continues in the background."}</p></section> : null;
  const currentRunHasDiscovery = Boolean(activeScanJob && (activeScanJob.discoveredCount > 0
    || activeScanJob.horizonStats?.some((item) => item.candidates !== null)));
  const healthyCoverageCount = !scanIsActive || currentRunHasDiscovery
    ? monitor?.coverage?.filter((source) => source.healthy).length || 0
    : 0;
  const displayScanElapsedSeconds = scanElapsedSeconds <= 3_600 ? scanElapsedSeconds : 0;
  const restoredOldScan = scanElapsedSeconds > 3_600;
  const scanHorizonStats = (["days", "months", "years"] as const).map((horizon) => monitor?.scanJob?.horizonStats?.find((item) => item.horizon === horizon) || {
    horizon,
    status: monitor?.scanJob?.currentHorizon === horizon ? "searching" as const : "pending" as const,
    candidates: null,
    rawCandidates: null,
    newCandidates: null,
    queued: null,
    screened: 0,
  });
  const todayNavigationCount = rankedMonitorPapers.filter(paper => !isReadReference(paper)).length;
  const dailyBriefEntries = useMemo(() => briefPaperEntries(monitor?.dailyBrief?.paperIds, historyPapers), [historyPapers, monitor?.dailyBrief?.paperIds]);
  const excludedReadingIds = readingQueueExclusions(historyPapers);
  const readingQueueKey = JSON.stringify([...excludedReadingIds].sort());
  const currentQuestionReadingIds = (questionReadingIds.spaceId === activeSpace.id && activeSpaceSupportsLearning ? questionReadingIds.ids : []).filter(id => !excludedReadingIds.includes(id));
  const nextBriefEntries = dailyBriefEntries.filter(entry => !excludedReadingIds.includes(entry.paper.id));
  const dailyBriefPapers: MonitorPaper[] = nextBriefEntries.map((entry) => entry.paper);
  const resumePaper: MonitorPaper | null = resumeReading(historyPapers);
  const featuredReadingIds = [...currentQuestionReadingIds, ...(resumePaper && monitor && !monitorLoadFailed ? [resumePaper.id] : [])];
  const remainingBrief = remainingBriefEntries(nextBriefEntries, featuredReadingIds);
  const visibleBriefEntries = remainingBrief.slice(0, 6);
  const featuredBriefCount = nextBriefEntries.length - remainingBrief.length;
  const readReferencePapers: MonitorPaper[] = readingReferences([...dailyBriefEntries.map(entry => entry.paper), ...rankedMonitorPapers, ...historyPapers]);
  const dailyFreshnessCounts = {
    days: visibleBriefEntries.map(entry => entry.paper).filter((paper) => paper.horizon === "days").length,
    months: visibleBriefEntries.map(entry => entry.paper).filter((paper) => paper.horizon === "months").length,
    years: visibleBriefEntries.map(entry => entry.paper).filter((paper) => !["days", "months"].includes(paper.horizon || "")).length,
  };
  const dailySignals = monitor?.dailyBrief ? (locale === "zh" ? monitor.dailyBrief.signalsZh : monitor.dailyBrief.signalsEn) : [];
  const dailyReadingPlan = monitor?.dailyBrief ? (locale === "zh" ? monitor.dailyBrief.readingPlanZh : monitor.dailyBrief.readingPlanEn) : [];
  const dailyBriefEntryCount = visibleBriefEntries.length;
  const runFunnel = scanFunnel(monitor?.scanJob, monitor?.dailyBrief);
  const briefFunnel = scanFunnel(null, monitor?.dailyBrief);
  const latestQuickScreenedCount = briefFunnel.screened ?? "—";
  const latestDeepReviewedCount = briefFunnel.deepReviewed ?? "—";
  const latestDeepDeferredCount = monitor?.dailyBrief?.metrics.deepDeferred ?? 0;
  const dailyBriefPaperIds = new Set(monitor?.dailyBrief?.paperIds || []);
  const additionalTodayPapers: MonitorPaper[] = supplementaryReading([...rankedMonitorPapers, ...historyPapers], [...dailyBriefPaperIds, ...featuredReadingIds]);
  const nextReadingId = nextReadingPaperId(currentQuestionReadingIds, [...dailyBriefPapers, ...additionalTodayPapers], excludedReadingIds, [selectedMonitorPaper?.id, feedbackReceipt?.spaceId === activeSpace.id ? feedbackReceipt.paper.id : undefined]);
  const pendingActionNotifications = useMemo(() => (monitor?.notifications || []).filter((notification) => ACTION_NOTIFICATION_KINDS.has(notification.kind) && !notification.readAt), [monitor?.notifications]);
  const activityGroups = useMemo(() => {
    const groups = new Map<string, { key: string; primary: ResearchNotification; recovered: boolean }>();
    for (const notification of monitor?.notifications || []) {
      if (ACTION_NOTIFICATION_KINDS.has(notification.kind)) continue;
      const key = notification.createdAt.slice(0, 10);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { key, primary: notification, recovered: notification.kind === "scan_recovered" });
        continue;
      }
      if (notification.kind === "daily_brief" || existing.primary.kind !== "daily_brief") existing.primary = notification;
      if (notification.kind === "scan_recovered") existing.recovered = true;
    }
    return Array.from(groups.values()).sort((left, right) => right.primary.createdAt.localeCompare(left.primary.createdAt));
  }, [monitor?.notifications]);
  const operationsMaxCandidates = Math.max(1, ...(monitor?.operationsDashboard?.daily || []).map((day) => day.candidates));
  const latestConfirmedImport = useMemo(() => researchImports.find((item) => item.status === "confirmed") || null, [researchImports]);
  const confirmedProfile = latestConfirmedImport?.analysis || null;

  const paperStateByCanonicalId = useMemo(() => {
    const states: Record<string, MonitorPaper["userState"]> = {};
    for (const paper of historyPapers) if (paper.doi) states["doi:" + paper.doi.trim().toLocaleLowerCase()] = paper.userState;
    return states;
  }, [historyPapers]);
  const networkPaperNodes = useMemo(() => buildNetworkPaperNodes(researchMap), [researchMap]);
  const routePortfolio = researchMap.routePortfolio;
  const monitorReadyLabel = demo ? (locale === "zh" ? "演示样例 · 未执行扫描" : "Demo sample · no scan performed") : monitorScanCompletionLabel(monitor, locale);
  const routeTodayPaperCount = useMemo(() => rankedMonitorPapers.filter((paper) => Boolean(
    paper.discoveryOrigin || (paper.discoveryTrack && paper.discoveryType),
  )).length, [rankedMonitorPapers]);
  const routeAttention = useMemo(() => selectResearchRouteAttention(researchMap.tracks), [researchMap.tracks]);
  const routeAttentionTrack = useMemo(() => routeAttention
    ? researchMap.tracks.find((track) => track.id === routeAttention.trackId) || null
    : null, [researchMap.tracks, routeAttention]);
  const selectedThreadChanges = useMemo(() => {
    if (!selectedThread) return [];
    return (monitor?.mapChanges || []).filter((change) => change.trackTitleZh === selectedThread.titleZh
      || change.trackTitleEn === selectedThread.titleEn).slice(0, 5);
  }, [monitor?.mapChanges, selectedThread]);
  const rankedResearchNetworkCandidates = useMemo(() => {
    const originIds = paperNetworkOriginCanonicalIds.length
      ? paperNetworkOriginCanonicalIds
      : researchNetworkSeeds.map((seed) => seed.canonicalId);
    const visible = researchNetworkCandidates.filter((candidate) => researchNetworkDecisions[candidate.canonicalId] !== "dismissed");
    return selectMultiOriginCandidates(visible, originIds, multiOriginIntent, 36);
  }, [multiOriginIntent, paperNetworkOriginCanonicalIds, researchNetworkCandidates, researchNetworkDecisions, researchNetworkSeeds]);
  const externalNetworkPaperNodes = useMemo(() => {
    return buildExternalNetworkPaperNodes(researchMap, rankedResearchNetworkCandidates);
  }, [rankedResearchNetworkCandidates, researchMap]);
  const allNetworkPaperNodes = useMemo(
    () => Array.from(new Map([...networkPaperNodes, ...externalNetworkPaperNodes].map((node) => [node.paper.canonicalId, node])).values()),
    [externalNetworkPaperNodes, networkPaperNodes],
  );
  const eligibleNetworkPaperNodes = useMemo(
    () => allNetworkPaperNodes.filter((node) => paperNetworkTrackId === "all" || node.trackIds.includes(paperNetworkTrackId)),
    [allNetworkPaperNodes, paperNetworkTrackId],
  );
  const visibleCitationEdgeCount = useMemo(() => {
    const visibleIds = new Set(eligibleNetworkPaperNodes.filter((node) => !node.external).map((node) => node.paper.id));
    return researchMap.paperEdges.filter((edge) => isDatabaseVerifiedCitationEdge(edge) && visibleIds.has(edge.sourcePaperId) && visibleIds.has(edge.targetPaperId)).length;
  }, [eligibleNetworkPaperNodes, researchMap.paperEdges]);
  const visibleSimilarityEdgeCount = useMemo(() => {
    const visibleIds = new Set(eligibleNetworkPaperNodes.filter(n=>!n.external).map(n=>n.paper.id));
    return researchMap.paperEdges.filter(e=>e.kind === "similarity" && visibleIds.has(e.sourcePaperId) && visibleIds.has(e.targetPaperId)).length;
  }, [eligibleNetworkPaperNodes,researchMap.paperEdges]);
  const explicitNetworkOriginNodes = useMemo(() => {
    const nodeByCanonicalId = new Map(eligibleNetworkPaperNodes.map((node) => [node.paper.canonicalId, node]));
    return paperNetworkOriginCanonicalIds.map((canonicalId) => nodeByCanonicalId.get(canonicalId))
      .filter((node): node is NetworkPaperNode => Boolean(node)).slice(0, 3);
  }, [eligibleNetworkPaperNodes, paperNetworkOriginCanonicalIds]);
  const effectiveNetworkOriginNodes = useMemo(() => {
    if (explicitNetworkOriginNodes.length) return explicitNetworkOriginNodes;
    const strongest = [...eligibleNetworkPaperNodes].sort((left, right) => right.paper.citationCount - left.paper.citationCount)[0];
    return strongest ? [strongest] : [];
  }, [eligibleNetworkPaperNodes, explicitNetworkOriginNodes]);
  const effectiveNetworkOriginIds = useMemo(() => effectiveNetworkOriginNodes.map((node) => node.paper.id), [effectiveNetworkOriginNodes]);
  const graphDeskOrigin = effectiveNetworkOriginNodes[0];
  const graphDeskPaper = (node: NetworkPaperNode): GraphDeskPaper => {
    const links = researchMap.paperEdges.filter(e => e.kind !== "semantic" && graphDeskOrigin && ((e.sourcePaperId === graphDeskOrigin.paper.id && e.targetPaperId === node.paper.id) || (e.targetPaperId === graphDeskOrigin.paper.id && e.sourcePaperId === node.paper.id)));
    const direct = links.filter(isDatabaseVerifiedCitationEdge);
    const external = node.external?.relations.filter(r=>r.seedCanonicalId===graphDeskOrigin?.paper.canonicalId) || [];
    const relations = [
      ...direct.map(e => `${e.sourcePaperId === graphDeskOrigin?.paper.id ? (locale === "zh" ? "起点引用本文" : "Cited by starting paper") : (locale === "zh" ? "本文引用起点" : "Cites starting paper")} · ${e.evidenceSource}`),
      ...links.filter(e=>e.kind === "similarity" && e.relationKind === "bibliographic_coupling").map(()=>locale === "zh" ? "共享参考文献" : "Shared references"),
      ...external.map(r=>`${r.kind === "reference" ? (locale === "zh" ? "起点引用本文" : "Cited by starting paper") : r.kind === "citation" ? (locale === "zh" ? "本文引用起点" : "Cites starting paper") : (locale === "zh" ? "来源推荐线索 · 尚未确认引用" : "Provider recommendation · citation unconfirmed")} · ${r.evidenceSource}`),
    ];
    return {id:node.paper.id,canonicalId:node.paper.canonicalId,title:node.paper.title,authors:node.paper.authors,url:node.paper.url,year:researchPaperYear(node.paper),external:Boolean(node.external),abstractText:node.external?.abstractText || "",relations:[...new Set(relations)],direct:Boolean(direct.length || external.some(r=>r.kind!=="recommendation"))};
  };
  const graphDeskOrigins = eligibleNetworkPaperNodes.filter(n=>!n.external).map(graphDeskPaper);
  const graphDeskPapers = allNetworkPaperNodes.filter(n=>n.paper.canonicalId!==graphDeskOrigin?.paper.canonicalId).map(graphDeskPaper).filter(p=>p.relations.length>0);
  const effectiveNetworkOriginCanonicalIds = useMemo(() => effectiveNetworkOriginNodes.map((node) => node.paper.canonicalId), [effectiveNetworkOriginNodes]);
  const researchNetworkIsPartial = Boolean(researchNetworkResponse && (researchNetworkResponse.externalUnavailable
    || Object.values(researchNetworkResponse.sourceStatus).some((status) => status === "partial" || status === "unavailable")));
  const selectedNetworkNode = useMemo(
    () => allNetworkPaperNodes.find((node) => node.paper.id === selectedNetworkPaperId) || null,
    [allNetworkPaperNodes, selectedNetworkPaperId],
  );
  const showNetworkPaperDrawer = Boolean(selectedNetworkNode && paperNetworkMode !== "citations");
  const externalResearchNetworkEdges = useMemo(
    () => externalNetworkEdges(allNetworkPaperNodes, externalNetworkPaperNodes, researchNetworkSimilarityEdges),
    [allNetworkPaperNodes, externalNetworkPaperNodes, researchNetworkSimilarityEdges],
  );
  const selectedNetworkRelations = useMemo(
    () => selectedNetworkNode ? [...researchMap.paperEdges, ...externalResearchNetworkEdges]
      .filter((edge) => edge.sourcePaperId === selectedNetworkNode.paper.id || edge.targetPaperId === selectedNetworkNode.paper.id)
      .sort((left, right) => right.confidence - left.confidence) : [],
    [externalResearchNetworkEdges, researchMap.paperEdges, selectedNetworkNode],
  );
  const selectedModeNetworkRelations = useMemo(() => selectedNetworkRelations.filter(edge=>edge.kind !== "semantic").filter((edge) => paperNetworkMode === "citations"
    ? isDatabaseVerifiedCitationEdge(edge)
    : paperNetworkMode === "path" ? false : paperNetworkScope === "one-hop" ? isVerifiableSimilarityNeighborEdge(edge) : true).slice(0, 6), [paperNetworkMode, paperNetworkScope, selectedNetworkRelations]);
  const selectedVerifiableOneHopCount = useMemo(() => selectedNetworkNode
    ? new Set(selectVerifiableOneHopEdges(selectedNetworkRelations, selectedNetworkNode.paper.id).map(paperNetworkEdgeKey)).size
    : 0, [selectedNetworkNode, selectedNetworkRelations]);
  const networkDiscoveryNodesByTab = useMemo(() => {
    const originIds = new Set(effectiveNetworkOriginIds);
    const citationEdges = researchMap.paperEdges.filter(isDatabaseVerifiedCitationEdge);
    const similarityEvidenceEdges = [...researchMap.paperEdges, ...externalResearchNetworkEdges]
      .filter(isVerifiableSimilarityNeighborEdge);
    const strictJointIntent = paperNetworkScope === "multi-seed" && multiOriginIntent !== "union" && originIds.size >= 2;
    const hasJointEvidence = (node: NetworkPaperNode) => originIds.has(node.paper.id) || new Set(Array.from(originIds).filter((originId) => similarityEvidenceEdges.some((edge) => (edge.sourcePaperId === originId && edge.targetPaperId === node.paper.id) || (edge.targetPaperId === originId && edge.sourcePaperId === node.paper.id)))).size >= 2;
    const matchesInternalLineage = (node: NetworkPaperNode, tab: PaperDiscoveryTab) => {
      if (tab === "similar") return true;
      if (tab === "prior") return citationEdges.some((edge) => originIds.has(edge.sourcePaperId) && edge.targetPaperId === node.paper.id);
      return citationEdges.some((edge) => originIds.has(edge.targetPaperId) && edge.sourcePaperId === node.paper.id);
    };
    const result = { similar: [] as NetworkPaperNode[], prior: [] as NetworkPaperNode[], derivative: [] as NetworkPaperNode[] };
    for (const tab of ["similar", "prior", "derivative"] as PaperDiscoveryTab[]) {
      result[tab] = eligibleNetworkPaperNodes.filter((node) => (!strictJointIntent || hasJointEvidence(node))
        && (node.external ? candidateBelongsToTab(node.external, tab) : matchesInternalLineage(node, tab)))
        .sort((left, right) => Number(Boolean(right.external)) - Number(Boolean(left.external))
          || (right.external?.score || 0) - (left.external?.score || 0)
          || right.paper.citationCount - left.paper.citationCount);
    }
    return result;
  }, [effectiveNetworkOriginIds, eligibleNetworkPaperNodes, externalResearchNetworkEdges, multiOriginIntent, paperNetworkScope, researchMap.paperEdges]);
  const networkDiscoveryNodes = networkDiscoveryNodesByTab[paperDiscoveryTab];
  const paperNetworkContext = useMemo(() => {
    if (paperNetworkMode === "citations") return {
      title: locale === "zh" ? "箭头表示知识流向" : "Arrows show knowledge flow",
      body: locale === "zh" ? "被引工作 → 后续引用它的工作" : "cited work → later work that cites it",
    };
    if (paperNetworkMode === "path") return {
      title: locale === "zh" ? "编号表示建议阅读顺序" : "Numbers show the suggested reading order",
      body: locale === "zh" ? "金色箭头表示先读 → 再读；支线仍保留" : "gold arrows mean read first → read next; branches remain visible",
    };
    if (paperNetworkScope === "multi-seed") return {
      title: multiOriginIntent === "shared"
        ? (locale === "zh" ? "共同邻居" : "Shared neighbors")
        : multiOriginIntent === "bridge" ? (locale === "zh" ? "跨域桥接" : "Cross-domain bridges") : (locale === "zh" ? "分别探索" : "Explore each origin"),
      body: multiOriginIntent === "shared"
        ? (locale === "zh" ? "仅展示与至少 2 个当前起点分别存在独立关系证据的候选；没有证据时不会退回并集。" : "Only candidates with independent relation evidence to at least two active origins are shown; no union fallback is used.")
        : multiOriginIntent === "bridge"
          ? (locale === "zh" ? "仅在至少 2 个当前起点都有独立关系证据时，突出真正的跨域桥接工作。" : "Bridge papers require independent relation evidence to at least two active origins.")
          : (locale === "zh" ? "为每个种子保留公平配额，便于比较各自独有邻域。" : "Preserving a fair quota around each origin for comparison."),
    };
    if (paperNetworkScope === "one-hop") return {
      title: locale === "zh" ? `${selectedVerifiableOneHopCount} 条可核验一跳关系` : `${selectedVerifiableOneHopCount} verifiable one-hop relations`,
      body: locale === "zh" ? "只保留文献耦合或数据库核验的引用发现关系；没有加入推荐发现线索或 Pi 推断关系。" : "Only bibliographic coupling or database-verified citation discovery remains; recommendation leads and Pi inferences are not included.",
    };
    return {
      title: locale === "zh" ? "点击只查看，不会改变图谱" : "Select to inspect without changing the graph",
      body: locale === "zh" ? "需要缩小范围时，再单独使用“聚焦邻域”；相似图不显示引用箭头。" : "Use Focus neighborhood only when needed; citation arrows stay out of the similarity map.",
    };
  }, [locale, multiOriginIntent, paperNetworkMode, paperNetworkScope, selectedVerifiableOneHopCount]);

  function resetResearchNetworkExpansion(originCanonicalIds: string[] = [], spaceId = paperNetworkSpaceRef.current) {
    researchNetworkContextRef.current = {
      version: researchNetworkContextRef.current.version + 1,
      spaceId,
      originKey: researchNetworkOriginKey(originCanonicalIds),
    };
    researchNetworkExpandRequestRef.current += 1;
    researchNetworkDecisionRequestsRef.current.clear();
    setResearchNetworkSeeds([]);
    setResearchNetworkCandidates([]);
    setResearchNetworkSimilarityEdges([]);
    setResearchNetworkResponse(null);
    setResearchNetworkDecisions({});
    setResearchNetworkLoading(false);
    setResearchNetworkError("");
  }

  function setSingleNetworkOrigin(node: NetworkPaperNode) {
    resetResearchNetworkExpansion([node.paper.canonicalId]);
    setPaperNetworkOriginCanonicalIds([node.paper.canonicalId]);
    setPaperNetworkMode("similarity");
    setPaperDiscoveryTab("similar");
    setSelectedNetworkPaperId(node.paper.id);
    setPaperNetworkScope("all");
  }

  function addMultiNetworkOrigin(node: NetworkPaperNode) {
    const baseCanonicalIds = explicitNetworkOriginNodes.length
      ? explicitNetworkOriginNodes.map((origin) => origin.paper.canonicalId)
      : effectiveNetworkOriginNodes.map((origin) => origin.paper.canonicalId);
    const nextCanonicalIds = Array.from(new Set([...baseCanonicalIds, node.paper.canonicalId])).slice(0, 3);
    resetResearchNetworkExpansion(nextCanonicalIds);
    setPaperNetworkOriginCanonicalIds(nextCanonicalIds);
    setPaperNetworkMode("similarity");
    setPaperDiscoveryTab("similar");
    setMultiOriginIntent("shared");
    setSelectedNetworkPaperId(null);
    setPaperNetworkScope("multi-seed");
  }

  function removeNetworkOrigin(canonicalId: string) {
    const remainingCanonicalIds = paperNetworkOriginCanonicalIds.filter((id) => id !== canonicalId);
    resetResearchNetworkExpansion(remainingCanonicalIds);
    setPaperNetworkOriginCanonicalIds(remainingCanonicalIds);
    if (remainingCanonicalIds.length < 2 && paperNetworkScope === "multi-seed") {
      const remaining = eligibleNetworkPaperNodes.find((node) => node.paper.canonicalId === remainingCanonicalIds[0]);
      setSelectedNetworkPaperId(remaining?.paper.id || null);
      setPaperNetworkScope(remaining ? "one-hop" : "all");
    } else if (selectedNetworkNode?.paper.canonicalId === canonicalId) {
      setSelectedNetworkPaperId(null);
      if (paperNetworkScope === "one-hop") setPaperNetworkScope("all");
    }
  }

  async function expandResearchNetwork(originCanonicalIds = effectiveNetworkOriginNodes.map((node) => node.paper.canonicalId), force = false, preserveMode = false) {
    const origins = Array.from(new Set(originCanonicalIds)).filter(Boolean).slice(0, 3);
    if (!origins.length) return;
    const spaceId = paperNetworkSpaceRef.current;
    const originKey = researchNetworkOriginKey(origins);
    if (researchNetworkContextRef.current.spaceId !== spaceId || researchNetworkContextRef.current.originKey !== originKey) {
      resetResearchNetworkExpansion(origins, spaceId);
    }
    const contextVersion = researchNetworkContextRef.current.version;
    const requestId = ++researchNetworkExpandRequestRef.current;
    const requestIsCurrent = () => researchNetworkExpandRequestRef.current === requestId
      && researchNetworkContextRef.current.version === contextVersion
      && researchNetworkContextRef.current.spaceId === spaceId
      && researchNetworkContextRef.current.originKey === originKey
      && paperNetworkSpaceRef.current === spaceId;
    setResearchNetworkLoading(true);
    setResearchNetworkResponse(null);
    setResearchNetworkError("");
    if (!preserveMode) setPaperNetworkMode("similarity");
    setPaperDiscoveryTab("similar");
    setPaperNetworkOriginCanonicalIds(origins);
    setPaperNetworkScope(origins.length >= 2 ? "multi-seed" : "all");
    try {
      const response = await fetch("/api/research-network", {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expand", spaceId, originCanonicalIds: origins, limit: 36, force }),
      });
      const data = await response.json() as unknown;
      if (isResearchNetworkExpandResponse(data)) {
        if (!requestIsCurrent()) return;
        if (!response.ok && data.status === "rate_limited") {
          setResearchNetworkResponse(data);
          if (data.candidates.length) {
            setResearchNetworkSeeds(data.seeds);
            setResearchNetworkCandidates(data.candidates);
            setResearchNetworkSimilarityEdges(data.similarityEdges);
          }
          return;
        }
        setResearchNetworkSeeds(data.seeds);
        setResearchNetworkCandidates(data.candidates);
        setResearchNetworkSimilarityEdges(data.similarityEdges);
        setResearchNetworkResponse(data);
        setResearchNetworkDecisions({});
        return;
      }
      const errorMessage = data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error : "research network unavailable";
      throw new Error(errorMessage);
    } catch {
      if (requestIsCurrent()) setResearchNetworkError(locale === "zh"
        ? "本次外部发现未能完成，现有图谱没有变化；请稍后再试。"
        : "External discovery could not complete. The current map is unchanged; please try again later.");
    } finally {
      if (requestIsCurrent()) setResearchNetworkLoading(false);
    }
  }

  async function generateResearchNetworkFrom(node: NetworkPaperNode) {
    setSingleNetworkOrigin(node);
    await expandResearchNetwork([node.paper.canonicalId], true);
  }

  async function decideResearchNetworkCandidate(candidate: ResearchNetworkCandidate, action: "accept" | "dismiss") {
    if (researchNetworkDecisions[candidate.canonicalId] === "saving") return;
    const spaceId = paperNetworkSpaceRef.current;
    const contextVersion = researchNetworkContextRef.current.version;
    const requestId = ++researchNetworkDecisionSequenceRef.current;
    researchNetworkDecisionRequestsRef.current.set(candidate.canonicalId, requestId);
    const requestIsCurrent = () => researchNetworkDecisionRequestsRef.current.get(candidate.canonicalId) === requestId
      && researchNetworkContextRef.current.version === contextVersion
      && researchNetworkContextRef.current.spaceId === spaceId
      && paperNetworkSpaceRef.current === spaceId;
    setResearchNetworkDecisions((current) => ({ ...current, [candidate.canonicalId]: "saving" }));
    setResearchNetworkError("");
    try {
      const response = await fetch("/api/research-network", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, candidateId: candidate.id, action }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "candidate decision failed");
      if (!requestIsCurrent()) return;
      setResearchNetworkDecisions((current) => ({ ...current, [candidate.canonicalId]: action === "accept" ? "accepted" : "dismissed" }));
      if (action === "accept") {
        try {
          const nextMap = await readResearchMapState(spaceId);
          if (requestIsCurrent()) {
            setResearchMap(nextMap);
            setResearchNetworkCandidates((current) => current.filter((item) => item.id !== candidate.id));
          }
        } catch {
          // The accepted paper remains durable; the next map visit retries the read.
        }
      }
      if (requestIsCurrent() && action === "dismiss" && selectedNetworkNode?.paper.canonicalId === candidate.canonicalId) setSelectedNetworkPaperId(null);
    } catch (error) {
      if (requestIsCurrent()) {
        setResearchNetworkDecisions((current) => { const next = { ...current }; delete next[candidate.canonicalId]; return next; });
        setResearchNetworkError(error instanceof Error ? error.message : "candidate decision failed");
      }
    }
  }

  useEffect(() => {
    if (paperNetworkScope !== "multi-seed" || explicitNetworkOriginNodes.length >= 2) return;
    const fallback = explicitNetworkOriginNodes[0] || effectiveNetworkOriginNodes[0];
    const timer = window.setTimeout(() => {
      setSelectedNetworkPaperId(fallback?.paper.id || null);
      setPaperNetworkScope(fallback ? "one-hop" : "all");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [effectiveNetworkOriginNodes, explicitNetworkOriginNodes, paperNetworkScope, setPaperNetworkScope, setSelectedNetworkPaperId]);

  useEffect(() => {
    let cancelled=false;
    const abort=new AbortController();
    const hydrationTimer = window.setTimeout(() => {
      let savedLocale:string|null=null;
      try{savedLocale = window.localStorage.getItem(demo ? "pi-demo-locale" : "pi-locale")}catch{/* Server identity works without local storage. */}
      if (savedLocale === "en" || savedLocale === "zh") setLocale(savedLocale);
    }, 0);

    initializeWorkspaceSession(demo,AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]))
      .then(session=>{if(cancelled)return null;setWorkspaceSession(session);if(session?.mode==='locked'){setSpaces([]);setWorkspaceEmpty(true);setWorkspaceReady(true);return null}return fetch("/api/spaces", { signal: AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]) })})
      .then(async (response) => {
        if(!response)return null;
        if (!response.ok) throw new Error("spaces unavailable");
        return response.json() as Promise<{
          spaces?: Space[];
          deletedSpaces?:Space[];deletionAvailable?:boolean;
          modelConfigured?: boolean;
          model?: string | null;
          modelCredentialSource?: "browser" | "server" | null;
        }>;
      })
      .then((data) => {
        if(!data||cancelled)return;
        if(!Array.isArray(data.spaces))throw Error('Invalid spaces response');
        setSpaces(data.spaces);setDeletedSpaces(data.deletedSpaces||[]);setSpaceDeletionEnabled(Boolean(data.deletionAvailable));setWorkspaceEmpty(!data.spaces.length);setWorkspaceReady(true);
        if (data.spaces?.length) {
          let savedSpace:string|null=null;
          try{savedSpace=window.localStorage.getItem(demo ? "pi-demo-active-space" : "pi-active-space")}catch{/* Keep owned server spaces accessible. */}
          setActiveSpaceId(data.spaces.find(space=>space.id===savedSpace)?.id||data.spaces[0].id);
          if(!demo&&new URLSearchParams(window.location.search).get('workspace-access')==='1'){setSpaceSection('identity');setSpaceDialog(true)}
        }
        const credentialPresent = Boolean(data.modelConfigured);
        setModelConnectionState(credentialPresent ? "checking" : "unconfigured");
        setConnectedModel(data.model || null);
        setModelCredentialSource(data.modelCredentialSource || null);
        if (credentialPresent&&data.spaces.length) {
          setCheckingModel(true);
          void modelSettingsRequest("/api/model-settings?verify=1")
            .then(({ response, data: status }) => {
              if (!response.ok || !status.configured) throw new Error(status.error || "model status unavailable");
              setModelConnectionState("connected");
              setConnectedModel(status.model || null);
              setModelCredentialSource(status.source || null);
            })
            .catch((error) => {
              setModelConnectionState(modelConnectionFailureState(error));
            })
            .finally(() => setCheckingModel(false));
        }
      })
      .catch(() => {
        if(cancelled)return;
        setSpaces(fallbackSpaces);
        setWorkspaceLoadFailed(true);
        setModelConnectionState("unavailable");
      });

    return () => {cancelled=true;abort.abort();window.clearTimeout(hydrationTimer)};
  }, [demo]);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    try{window.localStorage.setItem(demo ? "pi-demo-locale" : "pi-locale", locale)}catch{/* Language remains usable when storage is blocked. */}
  }, [locale, demo]);

  useEffect(() => {
    window.addEventListener("popstate", requestLocationRestore);
    window.addEventListener("hashchange", requestLocationRestore);
    return () => { window.removeEventListener("popstate", requestLocationRestore); window.removeEventListener("hashchange", requestLocationRestore); };
  }, [requestLocationRestore]);

  useEffect(() => {
    const restore = () => {
    let hash = window.location.hash;
    const key = activeSpace.id + hash;
    if (restoredLocationRef.current === key || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    const location = readWorkspaceLocation(hash);
    if (location.space && location.space !== activeSpace.id) { setRequestedLocation(location); setNavigationIssue("space"); return; }
    const track = researchMap.tracks.find(item => item.id === (location.view === "thread-detail" ? location.id : location.track));
    if (location.view === "thread-detail" && !track) { setView("threads"); if (!mapLoading) { setRequestedLocation(location); setNavigationIssue("missing"); } return; }
    setNavigationIssue(null);
    if (!location.space) { hash = workspaceHash({ ...location, space: activeSpace.id }); window.history.replaceState(null, "", hash); }
    restoredLocationRef.current = activeSpace.id + hash;
    if (track) setSelectedThread(track);
    if (location.step && location.path) setLearningBrowseSelection({ scope: `${activeSpace.id}:${location.path}`, stepId: location.step });
    else if (location.view === "learn") setLearningBrowseSelection(null);
    updateResearchRouteTab((location.tab || "start") as ResearchRouteTab);
    setPaperPanel(location.paperPanel||"reading");
    setRecoveryFocusRequested(location.focus === "recovery");
    if(location.view==='library'||location.view==='thread-detail'||location.view==='threads'&&Boolean(location.graph))setLibraryViewState({query:location.libraryQuery||'',scope:location.libraryScope||'related',page:location.libraryPage||1,focusId:location.libraryFocus||''});
    if(location.view==='library'){setLibrarySearch(location.libraryQuery||'');setLibraryFilter(location.libraryFilter||'all');setLibraryStageFilter(location.libraryStage||'all');setInboxFilter(location.libraryInbox||'all');setLibrarySort(location.librarySort||'priority');setLibraryTag(location.libraryTag||'all');setLibraryPageNumber(location.libraryPage||1);}
    if (location.graph) { setResearchMapMode("papers"); setLibraryGraphPaperId(location.graph === "all" ? "" : location.graph); setGraphReturnView(location.graphFrom === "library" ? "library" : "threads");restorePaperNetworkNavigation(location,new Set(researchMap.tracks.map(track=>track.id)));setGraphDetailsOpen(Boolean(location.graphFocus)); }
    else if (location.view === "threads") {setResearchMapMode("directions");setSelectedNetworkPaperId(null);}
    const comparisonLocation = location.view === "workbook" ? location : location.view === "paper-detail" && location.from === "workbook" && location.returnTo ? readWorkspaceLocation(location.returnTo) : null;
    if (comparisonLocation?.view === "workbook" && loadedWorkbookRef.current !== `${activeSpace.id}:${comparisonLocation.id}:${comparisonLocation.workbookId || ''}`) {
      loadedWorkbookRef.current = '';
      setWorkbookVersionId(comparisonLocation.workbookId || "");
      if (comparisonLocation.workbookId) setWorkbookTask(undefined);
    }
    if (location.view === "workbook") { setWorkbookTrackId(location.id!); setWorkbookReturnView(location.from || "threads");setWorkbookViewState({panel:location.workbookPanel||'evidence',focus:location.workbookFocus||''}); }
    const restoreScroll = () => requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: navigationScroll.current.get(hash) || 0, behavior: "auto" })));
    if (location.view === "today" || location.from === "today") setTodaySurface(location.panel || "home");
    if (location.view !== "paper-detail") { setView(location.view); restoreScroll(); return; }
    setPaperReturnView(location.from || "today");
    setWorkbookPaperFocus(location.readingFocus || "");
    if(view==="paper-detail"&&selectedMonitorPaper?.id===location.id){restoreScroll();return;}
    const abort = new AbortController();
    let completed = false;
    if (location.from === "workbook" && location.track) setWorkbookTrackId(location.track);
    fetch(`/api/monitor?spaceId=${encodeURIComponent(activeSpace.id)}&paperId=${encodeURIComponent(location.id!)}`, { signal: abort.signal })
      .then(async response => { if (!response.ok) throw Error(); return response.json() as Promise<{ monitor?: MonitorState }>; })
      .then(data => {
        const paper = data.monitor?.historyPapers?.find(item => item.id === location.id) || data.monitor?.papers?.find(item => item.id === location.id);
        if (!paper) throw Error();
        if (abort.signal.aborted) return;
        completed = true; setSelectedMonitorPaper(paper); setPaperNoteDraft(paper.readingNote || ""); setView("paper-detail"); restoreScroll();
      }).catch(() => { if (!abort.signal.aborted) { setView(location.from === "paper-detail" ? "today" : location.from || "today"); setRequestedLocation(location); setNavigationIssue("paper"); } });
    return () => { abort.abort(); if (!completed) restoredLocationRef.current = ""; };
    };
    let cleanup: (() => void) | undefined;
    const frame = requestAnimationFrame(() => { cleanup = restore(); });
    return () => { cancelAnimationFrame(frame); cleanup?.(); };
  }, [activeSpace.id, researchMap.tracks, mapLoading, navigationRevision, locale, selectedMonitorPaper?.id, view, navigationScroll, restoredLocationRef, restorePaperNetworkNavigation, setSelectedNetworkPaperId]);

  useEffect(() => {
    if (!recoveryFocusRequested || view !== "today" || todaySurface !== "discovery" || monitor?.status !== "error") return;
    const frame = requestAnimationFrame(() => {
      if (focusWorkspaceSection("#discovery-recovery")) setRecoveryFocusRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [recoveryFocusRequested, view, todaySurface, monitor?.status]);

  useEffect(() => {
    if (activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    let cancelled = false;
    let savedContentLoaded = false;
    let stopPolling: () => void = () => undefined;
    const timer = window.setTimeout(() => {
      if (monitorSpaceRef.current !== activeSpace.id) setMonitor(null);
      monitorSpaceRef.current = activeSpace.id;
      setMonitoring(true);
      setMonitorLoadFailed(false);
      // Render saved papers before requesting any visit-triggered background work.
      fetch("/api/monitor?spaceId=" + encodeURIComponent(activeSpace.id), { signal: AbortSignal.timeout(20_000) })
        .then(async (response) => {
          const data = await response.json() as { monitor?: MonitorState; error?: string };
          if (!response.ok || !data.monitor) throw new Error(data.error || "monitor unavailable");
          savedContentLoaded = true;
          if (!cancelled) setMonitor(data.monitor);
        })
        .then(() => {
          if (cancelled) return null;
          stopPolling = startMonitorPolling(activeSpace.id, (nextMonitor) => {
            if (!cancelled) setMonitor(nextMonitor);
          }, false);
          return fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trigger: "visit", action: "start" }),
          });
        })
        .then(async (response) => {
          if (!response || cancelled) return;
          const data = await response.json() as { monitor?: MonitorState; error?: string };
          if (data.monitor && !cancelled) setMonitor(data.monitor);
          if (!response.ok || !data.monitor) throw new Error(data.error || data.monitor?.error || data.monitor?.scanJob?.error || "monitor unavailable");
          if(data.monitor.automation?.paused)return;
          if (!data.monitor.throttled && data.monitor.leaseOwner !== false
            && !data.monitor.alreadyRunning && !["ready", "error"].includes(data.monitor.status)) {
            await advanceMonitorPipeline(activeSpace.id, data.monitor, (nextMonitor) => { if (!cancelled) setMonitor(nextMonitor); }, () => cancelled);
          } else if (!data.monitor.throttled && !["ready", "error"].includes(data.monitor.status)) {
            stopPolling();
            await followMonitorPipeline(activeSpace.id, data.monitor, (nextMonitor) => { if (!cancelled) setMonitor(nextMonitor); }, () => cancelled);
          }
        })
        .catch(() => {
          if (!cancelled && !savedContentLoaded) setMonitorLoadFailed(true);
        })
        .finally(() => {
          stopPolling();
          if (!cancelled) setMonitoring(false);
        });
    }, 0);
    return () => { cancelled = true; stopPolling(); window.clearTimeout(timer); };
  }, [activeSpace.id, learningMonitorWake]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!monitor?.throttled || !monitor.retryAfterMinutes) return;
    const timer = window.setTimeout(() => {
      setMonitor((current) => current?.throttled
        ? { ...current, throttled: false, retryAfterMinutes: 0 }
        : current);
    }, monitor.retryAfterMinutes * 60_000);
    return () => window.clearTimeout(timer);
  }, [monitor?.retryAfterMinutes, monitor?.throttled]);

  useEffect(() => {
    const startedAt = activeScanJob?.startedAt;
    if (!startedAt) {
      const resetTimer = window.setTimeout(() => setScanElapsedSeconds(0), 0);
      return () => window.clearTimeout(resetTimer);
    }
    const update = () => setScanElapsedSeconds(Math.max(1, Math.floor((Date.now() - timeValue(startedAt)) / 1000)));
    const initialTimer = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [activeScanJob?.id, activeScanJob?.startedAt]);

  useEffect(() => {
    if (view !== "memory" || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setResearchImports([]);
      setImportDraft(null);
      fetch("/api/research-imports?spaceId=" + encodeURIComponent(activeSpace.id))
        .then(async (response) => {
          const data = await response.json() as { imports?: ResearchImportRecord[] };
          if (!response.ok) throw new Error("imports unavailable");
          return data;
        })
        .then((data) => { if (!cancelled) setResearchImports(data.imports || []); })
        .catch(() => undefined);
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [view, activeSpace.id]);

  useEffect(() => {
    if (view !== "memory" || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    let cancelled = false;
    void readResearchMapState(activeSpace.id).then(data => {
      if (!cancelled) { setResearchMap(data); setMemoryRouteError(false); }
    }).catch(() => { if (!cancelled) setMemoryRouteError(true); });
    return () => { cancelled = true; };
  }, [view, activeSpace.id, memoryRouteRetry]);

  useEffect(() => {
    if (!mapViewActive || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    let cancelled = false;
    const load = async () => {
      setMapLoading(true);
      setMapOutlinePhase(0);
      setMapBuildErrors({});
      try {
        let data = await readResearchMapState(activeSpace.id);
        if (!data.generated) {
          setMapAction("initialize");
          const response = await fetch("/api/research-map", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spaceId: activeSpace.id, action: "initialize" }),
          });
          data = await response.json() as ResearchMapState & { error?: string };
          if (!response.ok) throw new Error(data.error || "map generation failed");
        } else if (data.needsStructure) {
          setMapAction("structure");
          const response = await fetch("/api/research-map", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spaceId: activeSpace.id, action: "structure" }),
          });
          data = await response.json() as ResearchMapState & { error?: string };
          if (!response.ok) throw new Error(data.error || "map structuring failed");
        }
        if (!cancelled) {
          setResearchMap(data);
          setSelectedThread((current) => data.tracks.find((track) => track.id === current?.id) || data.tracks[0] || null);
          setMapLoading(false);
          setMapAction(null);
        }
        for (const trackId of data.buildProgress?.pendingTrackIds || []) {
          if (cancelled) break;
          setMapBuildTrackId(trackId);
          try {
            const fillResponse = await fetch("/api/research-map", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ spaceId: activeSpace.id, action: "hydrate", trackId }),
            });
            const filled = await fillResponse.json() as ResearchMapState & { error?: string };
            if (!fillResponse.ok) throw new Error(filled.error || "route fill failed");
            if (!cancelled) {
              data = filled;
              setResearchMap(filled);
              setSelectedThread((current) => filled.tracks.find((track) => track.id === current?.id) || filled.tracks[0] || null);
              setMapBuildErrors((current) => { const next = { ...current }; delete next[trackId]; return next; });
            }
          } catch {
            if (!cancelled) setMapBuildErrors((current) => ({ ...current, [trackId]: true }));
          }
        }
        if (!cancelled && data.generated && data.tracks.some((track) => track.papers.length > 0)) {
          try {
            const precisionResponse = await fetch("/api/research-map", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ spaceId: activeSpace.id, action: "audit-precision" }),
            });
            const audited = await precisionResponse.json() as ResearchMapState & { error?: string };
            if (!precisionResponse.ok) throw new Error(audited.error || "route precision audit failed");
            if (!cancelled) {
              data = audited;
              setResearchMap(audited);
              setSelectedThread((current) => audited.tracks.find((track) => track.id === current?.id) || audited.tracks[0] || null);
            }
          } catch {
            // Precision review is private and non-blocking. Existing evidence
            // remains available and the audit is retried on a later visit.
          }
        }
        for (let intelligencePass = 0; intelligencePass < 2; intelligencePass += 1) {
          if (cancelled || !data.intelligenceProgress
            || data.intelligenceProgress.ready >= data.intelligenceProgress.total) break;
          const trackId = data.intelligenceProgress.pendingTrackIds[0]
            || data.intelligenceProgress.staleTrackIds?.[0]
            || data.intelligenceProgress.retryableTrackIds?.[0]
            || data.intelligenceProgress.runningTrackIds?.[0]
            || null;
          setMapIntelligenceTrackId(trackId);
          try {
            const interpretationResponse = await fetch("/api/research-map", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ spaceId: activeSpace.id, action: "advance-intelligence" }),
            });
            const interpreted = await interpretationResponse.json() as ResearchMapState & {
              error?: string;
              intelligenceAdvance?: { status?: "idle" | "ready" | "retryable" | "superseded"; trackId?: string };
            };
            if (!interpretationResponse.ok) throw new Error(interpreted.error || "direction interpretation failed");
            if (!cancelled) {
              data = interpreted;
              setResearchMap(interpreted);
              setSelectedThread((current) => interpreted.tracks.find((track) => track.id === current?.id) || interpreted.tracks[0] || null);
            }
            if (interpreted.intelligenceAdvance?.status === "idle" || interpreted.intelligenceAdvance?.status === "superseded") break;
          } catch {
            // The saved assessment remains usable; the durable job state is retried later.
            break;
          }
        }
      } catch {
        if (!cancelled) setToast(locale === "zh" ? "研究路线暂时无法生成，请稍后重试" : "The research map could not be built just now");
      } finally {
        if (!cancelled) { setMapLoading(false); setMapAction(null); setMapBuildTrackId(null); setMapIntelligenceTrackId(null); }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [activeSpace.id, locale, mapViewActive]);

  useEffect(() => {
    const stale = researchMap.paperNetwork.paperRevision
      ? researchMap.paperNetwork.builtPaperRevision !== researchMap.paperNetwork.paperRevision
      : researchMap.paperNetwork.builtPaperCount < researchMap.paperNetwork.paperCount;
    const outdated = researchMap.paperNetwork.model !== "deepseek-flash+coupling-v2";
    if (researchMapMode !== "papers" || researchMap.paperNetwork.paperCount < 2
      || paperNetworkLoading || (!stale && !outdated && !["idle", "building"].includes(researchMap.paperNetwork.status))) return;
    const spaceId = activeSpace.id;
    const attemptKey = `${spaceId}:${researchMap.paperNetwork.paperRevision || researchMap.paperNetwork.paperCount}:deepseek-flash+coupling-v2`;
    if (paperNetworkAutoAttemptRef.current.has(attemptKey)) return;
    paperNetworkAutoAttemptRef.current.add(attemptKey);
    const resumePi = false;
    const build = async () => {
      let failedPhase: Exclude<PaperNetworkBuildPhase, null> = resumePi ? "pi" : "verified";
      setPaperNetworkLoading(true);
      try {
        if (!resumePi) {
          setPaperNetworkBuildPhase("verified");
          const verified = await requestPaperNetworkBuildPhase(spaceId, "verified", false);
          if (paperNetworkSpaceRef.current !== spaceId) {
            paperNetworkAutoAttemptRef.current.delete(attemptKey);
            return;
          }
          setResearchMap(verified);
          failedPhase = "pi";
        }

      } catch {
        if (paperNetworkSpaceRef.current === spaceId) {
          setResearchMap((current) => ({ ...current, paperNetwork: { ...current.paperNetwork, status: "partial", error: `${failedPhase === "verified" ? "citation" : "pi"}: network request interrupted` } }));
          setToast(locale === "zh" ? "论文关系暂时只显示已有节点，可稍后重试" : "Paper nodes remain available; relationships can be retried later");
        } else paperNetworkAutoAttemptRef.current.delete(attemptKey);
      } finally {
        if (paperNetworkSpaceRef.current === spaceId) {
          setPaperNetworkBuildPhase(null);
          setPaperNetworkLoading(false);
        }
      }
    };
    void build();
  }, [activeSpace.id, locale, paperNetworkLoading, researchMap.paperNetwork.builtPaperCount, researchMap.paperNetwork.builtPaperRevision, researchMap.paperNetwork.model, researchMap.paperNetwork.paperCount, researchMap.paperNetwork.paperRevision, researchMap.paperNetwork.sources, researchMap.paperNetwork.status, researchMapMode]);

  useEffect(() => {
    if (!mapLoading) return;
    const timer = window.setInterval(() => setMapOutlinePhase((current) => Math.min(3, current + 1)), 2600);
    return () => window.clearInterval(timer);
  }, [mapLoading]);

  useEffect(() => {
    if (view !== "thread-detail" || !["start", "assessment", "problem", "agenda"].includes(researchRouteTab) || !selectedThread
      || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    let cancelled = false;
    const spaceId = activeSpace.id;
    const trackId = selectedThread.id;
    const load = async () => {
      setResearchSynthesis(null);
      setResearchSynthesisError("");
      setResearchSynthesisLoading(true);
      try {
        const response = await fetch(`/api/research-synthesis?spaceId=${encodeURIComponent(spaceId)}&trackId=${encodeURIComponent(trackId)}`);
        const data = await response.json() as { synthesis?: ResearchSynthesis; error?: string };
        if (!response.ok || !data.synthesis) throw new Error(data.error || "synthesis unavailable");
        if (cancelled) return;
        setResearchSynthesis(data.synthesis);
        if (researchRouteTab !== "problem") return;
        const shouldGenerate = data.synthesis.canGenerate && (data.synthesis.status === "empty" || data.synthesis.stale);
        const attemptKey = `${spaceId}:${trackId}:${data.synthesis.availableClaimCount}:${data.synthesis.updatedAt || "new"}`;
        if (!shouldGenerate || synthesisAutoAttemptRef.current.has(attemptKey)) return;
        synthesisAutoAttemptRef.current.add(attemptKey);
        const generateResponse = await fetch("/api/research-synthesis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId, trackId }),
        });
        const generated = await generateResponse.json() as { synthesis?: ResearchSynthesis; error?: string; modelRequired?: boolean };
        if (!generateResponse.ok || !generated.synthesis) throw new Error(generated.error || "synthesis generation failed");
        if (!cancelled) setResearchSynthesis(generated.synthesis);
      } catch (error) {
        if (!cancelled) setResearchSynthesisError(error instanceof Error ? error.message : "synthesis unavailable");
      } finally {
        if (!cancelled) setResearchSynthesisLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [activeSpace.id, researchRouteTab, selectedThread, view]);

  useEffect(() => {
    if (view !== "thread-detail" || !["problem", "agenda"].includes(researchRouteTab) || !selectedThread
      || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    let cancelled = false;
    const spaceId = activeSpace.id;
    const trackId = selectedThread.id;
    const run = async () => {
      setResearchProblemLoading(true);
      setResearchProblemError("");
      try {
        const response = await fetch(`/api/research-problem?spaceId=${encodeURIComponent(spaceId)}&trackId=${encodeURIComponent(trackId)}`);
        const data = await response.json() as { problemState?: ResearchProblemState; error?: string };
        if (!response.ok || !data.problemState) throw new Error(data.error || "research problem unavailable");
        if (cancelled) return;
        setResearchProblemState(data.problemState);
        const autoAction = !data.problemState.problem && data.problemState.evidence.canDraft ? "draft"
          : data.problemState.problem?.status === "active" && data.problemState.evidence.canAssess
            && (!data.problemState.assessment || data.problemState.assessment.stale) ? "assess" : null;
        const attemptKey = `${spaceId}:${trackId}:${autoAction || "none"}:${data.problemState.problem?.updatedAt || "new"}:${data.problemState.evidence.synthesisRevision}`;
        if (!autoAction || researchProblemAutoAttemptRef.current.has(attemptKey)) return;
        researchProblemAutoAttemptRef.current.add(attemptKey);
        setResearchProblemAction(autoAction);
        const generatedResponse = await fetch("/api/research-problem", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId, trackId, action: autoAction, workingLanguage: locale }),
        });
        const generated = await generatedResponse.json() as { problemState?: ResearchProblemState; error?: string };
        if (!generatedResponse.ok || !generated.problemState) throw new Error(generated.error || "research problem generation failed");
        if (!cancelled) setResearchProblemState(generated.problemState);
      } catch (error) {
        if (!cancelled) setResearchProblemError(error instanceof Error ? error.message : "research problem unavailable");
      } finally {
        if (!cancelled) { setResearchProblemLoading(false); setResearchProblemAction(null); }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [activeSpace.id, locale, researchRouteTab, selectedThread, view]);

  useEffect(() => {
    const needsLearningPath = view === "learn" || (view === "threads" && researchMapMode === "papers" && paperNetworkMode === "path");
    if (!needsLearningPath || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLearningLoading(true);
      setLearningError("");
      fetch("/api/learning-path?spaceId=" + encodeURIComponent(activeSpace.id))
        .then(async (response) => {
          const data = await response.json() as LearningPathState & { error?: string };
          if (!response.ok) throw new Error(data.error || "learning path unavailable");
          return data;
        })
        .then((data) => {
          if (cancelled) return;
          setLearningState(data);
          const pendingIntent = learningIntentRef.current;
          if (pendingIntent?.spaceId === activeSpace.id) {
            setLearningTarget(pendingIntent.target);
            setLearningTargetTrackId(pendingIntent.trackId);
          } else {
            setLearningTarget(data.path?.target || data.suggestedTarget);
            setLearningTargetTrackId(data.path?.targetTrackId || null);
            setLearningScopeDirty(false);
          }
          setLearningLoadedSpaceId(activeSpace.id);
        })
        .catch(() => {
          if (cancelled) return;
          setLearningState({ path: null, suggestedTarget: "", availablePaperCount: 0, waitingQualityCount: 0, model: "deepseek-flash" });
          const pendingIntent = learningIntentRef.current;
          if (pendingIntent?.spaceId === activeSpace.id) {
            setLearningTarget(pendingIntent.target);
            setLearningTargetTrackId(pendingIntent.trackId);
          } else {
            setLearningTarget("");
            setLearningTargetTrackId(null);
            setLearningScopeDirty(false);
          }
          setLearningLoadedSpaceId(activeSpace.id);
          setLearningError(locale === "zh" ? "当前空间的学习路径没有载入，已停止显示旧空间内容。" : "The path for this space did not load, so content from the previous space is hidden.");
        })
        .finally(() => { if (!cancelled) setLearningLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeSpace.id, learningReloadNonce, locale, paperNetworkMode, researchMapMode, view]);

  useEffect(() => {
    const needsLearningPath = view === "learn" || (view === "threads" && researchMapMode === "papers" && paperNetworkMode === "path");
    if (!needsLearningPath || learningLoadedSpaceId !== activeSpace.id || learningLoading || learningAction) return;
    const path = learningState.path;
    const delay = learningDiscoveryDelay(path);
    if (!path || delay === null) return;
    let cancelled = false;
    let timer: number;
    const run = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") { timer = window.setTimeout(run, 30_000); return; }
      try {
        const response = await fetch("/api/learning-path", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId: activeSpace.id, pathId: path.id, action: "advance-evidence" }),
        });
        const data = await response.json() as LearningPathState & { discoveryAdvance?: { queuedCount?: number } };
        if (cancelled) return;
        if (response.ok && data.path?.id === path.id) {
          setLearningState(data);
          // Reuse Today's existing leased pipeline; never approve or confirm here.
          if (!monitoring && ((data.discoveryAdvance?.queuedCount || 0) > 0
            || shouldWakeLearningQualityQueue({ path: data.path, monitor: { status: monitor?.status, nextRunAt: monitor?.nextRunAt }, monitoring }))) {
            setLearningMonitorWake((value) => value + 1);
          }
          return;
        }
        if (response.status === 409) { setLearningReloadNonce((value) => value + 1); return; }
      } catch { /* Keep the visible path and retry later; do not clear history. */ }
      if (!cancelled) timer = window.setTimeout(run, 60_000);
    };
    timer = window.setTimeout(run, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeSpace.id, learningAction, learningLoadedSpaceId, learningLoading, learningState.path, monitor?.status, monitor?.nextRunAt, monitoring, paperNetworkMode, researchMapMode, view]);

  useEffect(() => {
    if (view !== "today" || !monitor?.papers.length || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    const dwellTimers = new Map<Element, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const paperId = entry.target.getAttribute("data-paper-impression");
        if (!paperId) continue;
        const key = activeSpace.id + ":" + paperId;
        const existingTimer = dwellTimers.get(entry.target);
        if ((!entry.isIntersecting || entry.intersectionRatio < 0.55) && existingTimer) {
          window.clearTimeout(existingTimer);
          dwellTimers.delete(entry.target);
          continue;
        }
        if (!entry.isIntersecting || entry.intersectionRatio < 0.55 || existingTimer || reportedImpressions.current.has(key)) continue;
        const timer = window.setTimeout(() => {
          dwellTimers.delete(entry.target);
          if (document.visibilityState !== "visible" || reportedImpressions.current.has(key)) return;
          reportedImpressions.current.add(key);
          const shownAt = new Date().toISOString();
          setMonitor((current) => {
            if (!current) return current;
            const updatePaper = (paper: MonitorPaper): MonitorPaper => paper.id === paperId ? {
              ...paper,
              userState: paper.userState === "unseen" ? "seen" : paper.userState,
              showCount: paper.showCount + 1,
              firstShownAt: paper.firstShownAt || shownAt,
              lastShownAt: shownAt,
            } : paper;
            const historyPapers = (current.historyPapers || current.papers).map(updatePaper);
            return { ...current, papers: current.papers.map(updatePaper), historyPapers, historyCounts: historyCountsFor(historyPapers) };
          });
          fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spaceId: activeSpace.id, paperId, kind: "shown", value: true }),
          }).catch(() => reportedImpressions.current.delete(key));
        }, 1400);
        dwellTimers.set(entry.target, timer);
      }
    }, { threshold: [0.55] });
    const elements = document.querySelectorAll("[data-paper-impression]");
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      dwellTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeSpace.id, monitor?.papers, view]);

  useEffect(() => {
    if (view !== "today" || !todayPaperIdentity || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    const dwellTimers = new Map<Element, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const paperId = entry.target.getAttribute("data-paper-impression");
        if (!paperId) continue;
        const key = `${activeSpace.id}:${paperId}:engaged_view`;
        const existingTimer = dwellTimers.get(entry.target);
        if ((!entry.isIntersecting || entry.intersectionRatio < 0.55) && existingTimer) {
          window.clearTimeout(existingTimer);
          dwellTimers.delete(entry.target);
          continue;
        }
        if (!entry.isIntersecting || entry.intersectionRatio < 0.55 || existingTimer || reportedEngagements.current.has(key)) continue;
        const timer = window.setTimeout(() => {
          dwellTimers.delete(entry.target);
          if (document.visibilityState !== "visible" || reportedEngagements.current.has(key)) return;
          reportedEngagements.current.add(key);
          fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              spaceId: activeSpace.id,
              paperId,
              kind: "engaged_view",
              value: true,
              eventKey: engagementEventKey(paperId, "engaged_view"),
              dwellMs: 8_000,
              context: "today",
            }),
          }).catch(() => reportedEngagements.current.delete(key));
        }, 8_000);
        dwellTimers.set(entry.target, timer);
      }
    }, { threshold: [0.55] });
    const elements = document.querySelectorAll("[data-paper-impression]");
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      dwellTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeSpace.id, todayPaperIdentity, view]);

  useEffect(() => {
    if (view !== "paper-detail" || !selectedMonitorPaperId || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    const paperId = selectedMonitorPaperId;
    const key = `${activeSpace.id}:${paperId}:detail_dwell`;
    if (reportedEngagements.current.has(key)) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "visible" || reportedEngagements.current.has(key)) return;
      reportedEngagements.current.add(key);
      if (!engagementSessionRef.current) engagementSessionRef.current = crypto.randomUUID();
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId: activeSpace.id,
          paperId,
          kind: "detail_dwell",
          value: true,
          eventKey: `${engagementSessionRef.current}:${paperId}:detail_dwell`,
          dwellMs: 12_000,
          context: "paper_detail",
        }),
      }).catch(() => reportedEngagements.current.delete(key));
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [activeSpace.id, selectedMonitorPaperId, view]);

  const attachCurrentAskContext = () => {
    const context = view === "paper-detail" && selectedMonitorPaper ? { paperId: selectedMonitorPaper.id } : view === "thread-detail" && selectedThread ? { trackId: selectedThread.id } : view === "workbook" && workbookTrackId ? { trackId: workbookTrackId } : {};
    setAskContext(context);
    if (question.trim()) writeSessionDraft(sessionDraftKey(user.userId, activeSpace.id, "ask"), "", JSON.stringify({ question, context }));
    setAskOpen(true);
  };

  const openContextualAsk = () => { if (!question.trim()) attachCurrentAskContext(); else setAskOpen(true); };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector("[data-pi-dialog]")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!question.trim()) setAskContext(view === "paper-detail" && selectedMonitorPaper ? { paperId: selectedMonitorPaper.id } : view === "thread-detail" && selectedThread ? { trackId: selectedThread.id } : view === "workbook" && workbookTrackId ? { trackId: workbookTrackId } : {});
        setAskOpen(true);
      }
      if (event.key === "Escape") {
        setAskOpen(false);
        setSpaceDialog(false);
        setSourceSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, selectedMonitorPaper, selectedThread, workbookTrackId, question]);

  const navigate = (next: View, workbookTarget = workbookTrackId, target: Partial<WorkspaceLocation> = {}, preserveScroll = false) => {
    rememberCurrentLocation();
    if(next==='paper-detail')setPaperPanel(target.paperPanel||'reading');
    setNavigationIssue(null);
    navigationScroll.current.set(window.location.hash, window.scrollY);
    const returning = view === "paper-detail" || view === "workbook" || (view === "threads" && next === "library" && graphReturnView === "library");
    const currentLocation = readWorkspaceLocation(window.location.hash);
    const origin = currentLocation.returnTo ? readWorkspaceLocation(currentLocation.returnTo) : null;
    const returnLocation = returning && origin?.view === next && origin.space === activeSpace.id ? origin : null;
    const location: WorkspaceLocation = {
      view: next, space: activeSpace.id,
      ...(next==="paper-detail"?{paperPanel:"reading" as PaperPanel}:{}),
      panel: next === "today" ? (returning ? todaySurface : undefined) : next === "paper-detail" && view === "today" ? todaySurface : undefined,
      id: next === "workbook" ? workbookTarget || undefined : next === "thread-detail" ? selectedThread?.id : next === "paper-detail" ? selectedMonitorPaper?.id : undefined,
      tab: next === "thread-detail" || next === "paper-detail" ? researchRouteTab : undefined,
      track: next === "paper-detail" ? (view === "workbook" ? workbookTarget || undefined : selectedThread?.id) : undefined,
      from: next === "paper-detail" ? view : next === "workbook" ? workbookReturnView : undefined,
      graph: (next === "threads" || next === "paper-detail" && view === "threads") && researchMapMode === "papers" ? libraryGraphPaperId || "all" : undefined,
      graphFrom: (next === "threads" || next === "paper-detail" && view === "threads") && researchMapMode === "papers" && graphReturnView === "library" ? "library" : undefined,
      graphMode:next==='threads'&&researchMapMode==='papers'?paperNetworkMode:undefined,
      graphSurface:next==='threads'&&researchMapMode==='papers'?graphSurface:undefined,
      graphScope:next==='threads'&&researchMapMode==='papers'?paperNetworkScope:undefined,
      graphTrack:next==='threads'&&researchMapMode==='papers'?paperNetworkTrackId:undefined,
      graphFocus:next==='threads'&&researchMapMode==='papers'?selectedNetworkPaperId||undefined:undefined,
      libraryQuery:next==='library'?librarySearch||undefined:next==='thread-detail'||next==='threads'&&researchMapMode==='papers'?libraryViewState.query||undefined:undefined,
      libraryScope:next==='library'||next==='thread-detail'||next==='threads'&&researchMapMode==='papers'?libraryViewState.scope:undefined,
      libraryPage:next==='library'?libraryPageNumber:next==='thread-detail'||next==='threads'&&researchMapMode==='papers'?libraryViewState.page:undefined,
      libraryFocus:next==='library'||next==='thread-detail'||next==='threads'&&researchMapMode==='papers'?libraryViewState.focusId||undefined:undefined,
      libraryFilter:next==='library'?libraryFilter:undefined,
      libraryStage:next==='library'?libraryStageFilter:undefined,
      libraryInbox:next==='library'?inboxFilter:undefined,
      librarySort:next==='library'?librarySort:undefined,
      libraryTag:next==='library'?libraryTag as WorkspaceLocation['libraryTag']:undefined,
      workbookPanel:next==='workbook'?workbookViewState.panel:undefined,
      workbookFocus:next==='workbook'?workbookViewState.focus||undefined:undefined,
      step: (next === "learn" || next === "paper-detail" && view === "learn") && learningBrowseSelection?.scope.startsWith(`${activeSpace.id}:`) ? learningBrowseSelection.stepId : undefined,
      path: (next === "learn" || next === "paper-detail" && view === "learn") && learningBrowseSelection?.scope.startsWith(`${activeSpace.id}:`) ? learningBrowseSelection.scope.slice(activeSpace.id.length + 1) : undefined,
      ...(['paper-detail','workbook'].includes(next) && view !== 'paper-detail' ? { returnTo: window.location.hash } : {}),
      ...(returnLocation || {}),
      ...target,
    };
    const hash = returnLocation && Object.keys(target).length === 0 ? currentLocation.returnTo! : workspaceHash(location);
    rememberCurrentLocation(hash);
    if (window.location.hash !== hash) window.history.pushState({ piView: next }, "", hash);
    restoredLocationRef.current = returnLocation ? "" : activeSpace.id + hash;
    if(next === "today") setTodaySurface(location.panel || "home");
    setRecoveryFocusRequested(location.focus === "recovery");
    setView(next); setMobileNav(false);
    const top = preserveScroll ? window.scrollY : returning ? navigationScroll.current.get(hash) || (next === "workbook" ? workbookScrollRef.current : 0) : 0;
    navigationScroll.current.set(hash, top);
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top, behavior: "auto" })));
  };

  const navigatePrimary = (next: View) => {
    if (next === "threads") {
      setGraphReturnView("threads");
      setResearchMapMode("directions");
      navigate(next, undefined, { graph: undefined, graphFrom: undefined });
      return;
    }
    navigate(next, undefined, next === "today" ? { panel: "home" } : {});
  };

  const switchSpace = (space: Space) => {
    paperNetworkSpaceRef.current = space.id;
    learningRequestRef.current += 1;
    learningPaperRequestRef.current += 1;
    readingWriteRef.current = null;
    setReadingSaving(false);
    setReadingMemoryAnalyzing(false);
    setOpeningLearningResourceId(null);
    resetResearchNetworkExpansion([], space.id);
    setActiveSpaceId(space.id);
    // Fail closed at the workspace boundary. If the target workspace cannot be
    // loaded or initialized, no route, synthesis, or problem from the previous
    // workspace may remain visible.
    savedMonitorReadRef.current?.controller.abort();
    setMonitor(null);
    setMonitorLoadFailed(false);
    setReloadingMonitor(false);
    setMonitoring(false);
    setResearchMap(emptyResearchMapState());
    setSelectedThread(null);
    setResearchSynthesis(null);
    setResearchSynthesisLoading(false);
    setResearchSynthesisError("");
    setResearchProblemState(null);
    setResearchProblemLoading(false);
    setResearchProblemAction(null);
    setResearchProblemError("");
    setResearchMapMode("directions");
    setGraphReturnView("threads");
    setRecoveryFocusRequested(false);
    updateResearchRouteTab("problem");
    setPaperNetworkLoading(false);
    setPaperNetworkBuildPhase(null);
    setSelectedNetworkPaperId(null);
    setHoveredNetworkPaperId(null);
    setPaperNetworkScope("all");
    setPaperDiscoveryTab("similar");
    setMultiOriginIntent("shared");
    setPaperNetworkTrackId("all");
    setPaperNetworkOriginCanonicalIds([]);
    setLearningState({ path: null, suggestedTarget: "", availablePaperCount: 0, waitingQualityCount: 0, model: "deepseek-flash" });
    setLearningTarget("");
    setLearningTargetTrackId(null);
    setLearningScopeDirty(false);
    learningIntentRef.current = null;
    setLearningLoadedSpaceId(null);
    setLearningError("");
    setLearningLoading(false);
    setLearningAction(null);
    try{window.localStorage.setItem(demo ? "pi-demo-active-space" : "pi-active-space", space.id)}catch{/* The active server space remains usable. */}
    setSpaceDialog(false);
    navigationScroll.current.clear();
    navigate("today", null, { space: space.id });
    setAnswer("");
    setAnswerModel(null);
    askRequest.current++;
    setAsking(false);
    setAskContext({});
    setAskError("");
    setQuestion("");
    setSelectedMonitorPaper(null);
    setWorkbookTrackId(null);
    loadedWorkbookRef.current = '';
    setWorkbookPaperFocus("");
  };

  const submitSpace = async (event: FormEvent) => {
    event.preventDefault();
    if (demo || creatingSpace || !newSpace.name.trim()) return;
    setCreatingSpace(true);
    setSpaceCreateError("");
    try {
      const response = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newSpace, preferredLocale: locale }),
      });
      if (!response.ok) throw new Error("create failed");
      const data = await response.json() as { space: Space };
      if (!data.space?.id) throw new Error("invalid space response");
      setSpaces((current) => [...current, data.space]);
      setWorkspaceEmpty(false);
      setNewSpace({ name: "", memberName: "", description: "" });
      switchSpace(data.space);
    } catch {
      const refreshed = await fetch('/api/spaces', { signal: AbortSignal.timeout(10_000) }).catch(() => null);
      const data = refreshed?.ok ? await refreshed.json().catch(() => null) as { spaces?: Space[] } | null : null;
      if (data?.spaces?.length) setSpaces(data.spaces);
      setSpaceCreateError(locale === "zh" ? "暂未确认空间创建成功，填写内容已保留。请先在「切换空间」中检查是否已创建，再决定是否重试。" : "Space creation could not be confirmed. Your input is preserved. Check Switch space for an existing result before retrying.");
    } finally {
      setCreatingSpace(false);
    }
  };

  const changePaperPanel=(panel:PaperPanel)=>{
    navigationScroll.current.set(window.location.hash,window.scrollY);
    setPaperPanel(panel);
    const location=readWorkspaceLocation(window.location.hash);
    window.history.pushState(null,"",workspaceHash({...location,paperPanel:panel}));
  };

  const changeSpaceList=(space:ManagedSpace,removed:boolean)=>{
    if(removed){
      const remaining=spaces.filter(row=>row.id!==space.id);
      setSpaces(current=>current.filter(row=>row.id!==space.id));setDeletedSpaces(current=>[...current.filter(row=>row.id!==space.id),space]);
      if(space.id===(readWorkspaceLocation(window.location.hash).space||activeSpace.id)){switchSpace(remaining[0]||fallbackSpaces[0]);setWorkspaceEmpty(!remaining.length)}
    }else{
      setDeletedSpaces(current=>current.filter(row=>row.id!==space.id));setSpaces(current=>[...current.filter(row=>row.id!==space.id),space]);setWorkspaceEmpty(false);switchSpace(space);
    }
  };

  const submitQuestion = async (event?: FormEvent) => {
    event?.preventDefault();
    if (demo || !question.trim() || asking) return;
    const requestNumber = ++askRequest.current;
    setAsking(true);
    setAskError("");
    setAnswer("");
    setAnswerMode(null);
    setAnswerModel(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, question, locale, ...askContext }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await response.json().catch(() => ({})) as { answer?: string; mode?: "deepseek" | "preview"; model?: string | null; code?: string };
      if (requestNumber !== askRequest.current) return;
      if (!response.ok || !data.answer) throw new Error(data.code || (response.status === 401 ? "session_expired" : "request_failed"));
      clearSessionDraft(sessionDraftKey(user.userId, activeSpace.id, "ask"), JSON.stringify({ question, context: askContext }));
      setAnswer(data.answer);
      setAnswerMode(data.mode || "preview");
      setAnswerModel(data.model || null);
      if (data.mode === "deepseek") {
        setModelConnectionState("connected");
        setConnectedModel(data.model || connectedModel);
      }
    } catch (error) {
      if (requestNumber !== askRequest.current) return;
      const code = error instanceof Error ? error.message : "request_failed";
      const messages: Record<string, [string,string]> = {
        model_unconfigured: ["尚未配置模型，请打开模型设置。", "Configure a model in model settings."],
        credential_invalid: ["模型凭据未通过验证，请检查模型设置。", "Check the credential in model settings."],
        insufficient_balance: ["模型服务余额不足，请检查服务账户。", "The model provider reports insufficient balance."],
        daily_limit: ["今日问答额度已用完，请明天再试。", "Today's question allowance is used. Try tomorrow."],
        provider_busy: ["模型服务繁忙，请稍后重试。", "The model service is busy. Try again shortly."],
        timeout: ["本次回答超时，问题已保留，可以重试。", "The request timed out. Your question is retained; retry."],
        context_unavailable: ["对应研究材料已变化，请重新打开论文后提问。", "The research context changed. Reopen the paper and ask again."],
        session_expired: ["当前会话已失效，请刷新页面后重试。", "Your session expired. Refresh and retry."],
        empty_response: ["模型没有返回可显示的回答，请重试。", "The model returned no answer. Please retry."],
      };
      setAskError((messages[code] || (error instanceof Error && error.name === "TimeoutError" ? messages.timeout : ["这次回答未完成，问题已保留，请重试。", "The answer could not be completed. Your question is retained; retry."]))[locale === "zh" ? 0 : 1]);
      setAnswerMode(null);
    } finally {
      if (requestNumber === askRequest.current) setAsking(false);
    }
  };

  const runManualMonitor = async (reviewPending = false) => {
    if (demo || monitoring || (!reviewPending && manualCooldownBlocked)) return;
    if (activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) {
      setToast(locale === "zh" ? "研究空间尚未连接，请刷新页面后再试" : "The research space is not connected yet. Refresh the page and try again.");
      return;
    }
    const resumingCheckpoint = Boolean(monitor?.status === "error" && monitor.scanJob
      && (monitor.scanJob.candidateCount || monitor.scanJob.reviewedCount || monitor.scanJob.checkpoint === "retry_pending"));
    setMonitor((current) => current ? {
      ...current,
      status: "scanning",
      error: null,
      scanJob: resumingCheckpoint && current.scanJob ? {
        ...current.scanJob,
        status: "scanning",
        error: null,
        currentSource: locale === "zh" ? "正在检查模型并恢复已保存断点" : "Checking the model and restoring the saved checkpoint",
      } : null,
    } : current);
    setMonitoring(true);
    let pipelineDetached = false;
    const stopPolling = startMonitorPolling(activeSpace.id, setMonitor);
    const handlePipelineFailure = (error: unknown) => {
      const message = monitorFailureMessage(error, locale);
      setToast(message);
      if (isModelCredentialFailure(error)) {
        setModelConnectionState(modelConnectionFailureState(error));
        setModelSettingsError(message);
        setMobileNav(false);
        setModelSettingsOpen(true);
      }
    };
    try {
      const response = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, force: true, trigger: "manual", action: "start", ...(reviewPending ? { reviewPending: true } : {}) }),
      });
      const data = await response.json().catch(() => ({})) as { monitor?: MonitorState; error?: string };
      if (data.monitor) setMonitor(data.monitor);
      if (!response.ok || !data.monitor) throw new Error(data.error || data.monitor?.error || data.monitor?.scanJob?.error || "scan unavailable");
      if (data.monitor.status === "idle") {
        setToast(locale === "zh" ? "当前没有可接续的候选评审。" : "No candidate review is waiting to continue.");
        return;
      }
      if (data.monitor.throttled) setToast(t.manualCooling);
      else if (data.monitor.leaseOwner !== false && !data.monitor.alreadyRunning
        && !["ready", "error"].includes(data.monitor.status)) {
        pipelineDetached = true;
        void advanceMonitorPipeline(activeSpace.id, data.monitor, setMonitor)
          .catch(handlePipelineFailure)
          .finally(() => {
            stopPolling();
            setMonitoring(false);
          });
      } else if (!["ready", "error"].includes(data.monitor.status)) {
        pipelineDetached = true;
        stopPolling();
        void followMonitorPipeline(activeSpace.id, data.monitor, setMonitor)
          .catch(handlePipelineFailure)
          .finally(() => setMonitoring(false));
      }
    } catch (error) {
      handlePipelineFailure(error);
    } finally {
      if (!pipelineDetached) {
        stopPolling();
        setMonitoring(false);
      }
    }
  };

  const openSourceSettings = () => {
    setSourceSection("suggested");
    setVenueDraft((monitor?.preferences?.priorityVenues || []).join("\n"));
    setAuthorDraft((monitor?.preferences?.trackedAuthors || []).join("\n"));
    setExplorationDraft(monitor?.preferences?.explorationMode || "balanced");
    setSourceSettingsOpen(true);
  };

  const saveSourceSettings = async (reset = false, rescan = false) => {
    if (savingPreferences || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    const priorityVenues = venueDraft.split(/\r?\n/).map((venue) => venue.trim()).filter(Boolean);
    const trackedAuthors = authorDraft.split(/\r?\n/).map((author) => author.trim()).filter(Boolean);
    if (!reset && !priorityVenues.length) return;
    setSavingPreferences(true);
    let stopPolling: (() => void) | null = null;
    try {
      const response = await fetch("/api/monitor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, priorityVenues, trackedAuthors, explorationMode: explorationDraft, reset, rescan }),
      });
      const data = await response.json() as { monitor?: MonitorState };
      if (!response.ok || !data.monitor) throw new Error("preference update failed");
      setMonitor(data.monitor);
      setVenueDraft((data.monitor.preferences?.priorityVenues || []).join("\n"));
      setAuthorDraft((data.monitor.preferences?.trackedAuthors || []).join("\n"));
      setSourceSettingsOpen(false);
      setToast(rescan ? t.sourcesSaved : (locale === "zh" ? "关注来源已保存，将用于后续扫描" : "Sources saved for future discovery"));
      if (!rescan) return;
      setMonitoring(true);
      stopPolling = startMonitorPolling(activeSpace.id, setMonitor);
      const scanResponse = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trigger: "manual", action: "start" }),
      });
      const scanData = await scanResponse.json() as { monitor?: MonitorState };
      if (scanData.monitor) {
        setMonitor(scanData.monitor);
        if (scanData.monitor.leaseOwner !== false && !scanData.monitor.alreadyRunning
          && !["ready", "error"].includes(scanData.monitor.status)) {
          await advanceMonitorPipeline(activeSpace.id, scanData.monitor, setMonitor);
        } else if (!["ready", "error"].includes(scanData.monitor.status)) {
          stopPolling?.();
          stopPolling = null;
          await followMonitorPipeline(activeSpace.id, scanData.monitor, setMonitor);
        }
      }
    } catch {
      setToast(locale === "zh" ? "来源设置未能完成，请重试" : "Source settings could not be updated; retry");
    } finally {
      stopPolling?.();
      if (rescan) setMonitoring(false);
      setSavingPreferences(false);
    }
  };

  const markNotificationsRead = async (notification?: ResearchNotification) => {
    if (!monitor || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    const readAt = new Date().toISOString();
    setMonitor((current) => current ? {
      ...current,
      notifications: (current.notifications || []).map((item) => !notification || item.id === notification.id ? { ...item, readAt: item.readAt || readAt } : item),
      unreadNotificationCount: notification ? Math.max(0, (current.unreadNotificationCount || 0) - (notification.readAt ? 0 : 1)) : 0,
    } : current);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, notificationId: notification?.id, readAll: !notification }),
      });
      const data = await response.json() as { notifications?: ResearchNotification[]; unreadCount?: number };
      if (response.ok && data.notifications) setMonitor((current) => current ? {
        ...current, notifications: data.notifications, unreadNotificationCount: data.unreadCount || 0,
      } : current);
    } catch {
      // The next monitor refresh restores the authoritative notification state.
    }
  };

  const openResearchNotification = (notification: ResearchNotification) => {
    void markNotificationsRead(notification);
    const target = (["today", "threads", "library", "memory"] as View[]).includes(notification.actionView as View)
      ? notification.actionView as View : "today";
    if (target === "library") { setLibraryFilter("inbox"); setLibraryStageFilter("all"); setInboxFilter("all");setLibraryPageNumber(1);navigate(target,undefined,{libraryFilter:'inbox',libraryStage:undefined,libraryInbox:undefined,libraryPage:undefined});return; }
    navigate(target);
  };

  const saveFeedback = (paper: MonitorPaper, kind: "save" | "relevant" | "not_relevant" | "later", reasonCode?: string, note = "", forcedValue?: boolean) => {
    const spaceId = activeSpace.id;
    const key = spaceId + ":" + paper.id;
    const currentSaved = saved[key] ?? paper.saved;
    const value = forcedValue ?? (kind === "save" ? !currentSaved : true);
    const nextState: MonitorPaper["userState"] = !value ? (kind !== "save" && currentSaved ? "accepted" : kind === "save" && paper.feedback === "relevant" ? "accepted" : "seen") : kind === "not_relevant" ? "dismissed"
      : kind === "later" ? "snoozed"
        : kind === "save" && !value ? paper.feedback === "relevant" ? "accepted" : "seen" : "accepted";
    if (feedbackSaving.current) return;
    document.querySelectorAll(".v2-paper-more-actions[open]").forEach(element => element.removeAttribute("open"));
    feedbackSaving.current = true;
    setFeedbackBusy(true);
    setFeedbackReceipt(current => forcedValue === false && current ? {...current,error:undefined} : null);
    setToast(locale === "zh" ? "正在保存反馈…" : "Saving feedback…");
    void (async () => {
      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId, paperId: paper.id, kind, value, reasonCode, note }),
        });
        const result = await response.json().catch(() => ({})) as {
          effect?: { zh?: string; en?: string };
          routeEvidence?: FeedbackRouteEvidence | null;
        };
        if (!response.ok) throw new Error("feedback save failed");
        if (paperNetworkSpaceRef.current !== spaceId) return;
        setLibraryRevision(n=>n+1);
        if (kind === "save") setSaved((current) => ({ ...current, [key]: value }));
        if (kind === "not_relevant" && value) setSaved((current) => ({ ...current, [key]: false }));
        const updatePaper = (item: MonitorPaper): MonitorPaper => item.id !== paper.id ? item : {
            ...item,
            userState: nextState,
            readingStatus: reasonCode === "duplicate_known" ? "mastered" : item.readingStatus,
            saved: kind === "not_relevant" && value ? false : kind === "save" ? value : item.saved,
            feedback: kind === "relevant" || kind === "not_relevant" ? (value ? kind : null) : item.feedback,
            snoozedUntil: kind === "later" && value ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() : null,
          };
        const taskUpdate=updatePaper(paper);
        taskBriefState.patchPaper(paper.id,{feedback:taskUpdate.feedback,saved:taskUpdate.saved,readingStatus:taskUpdate.readingStatus,snoozed:nextState==='snoozed'});
        setSelectedMonitorPaper(current => current ? updatePaper(current) : current);
        setMonitor((current) => {
          if (!current) return current;
          const historyPapers = (current.historyPapers || current.papers).map(updatePaper);
          return {
            ...current,
            papers: ["accepted", "dismissed", "snoozed"].includes(nextState) ? current.papers.filter((item) => item.id !== paper.id) : current.papers.map(updatePaper),
            historyPapers,
            historyCounts: historyCountsFor(historyPapers),
          };
        });
        setFeedbackPrompt(null); setFeedbackNote("");
        setToast(feedbackEffectCopy(kind, value, reasonCode, locale));
        const authoritativeEffect = locale === "zh" ? result.effect?.zh : result.effect?.en;
        if (authoritativeEffect) setToast(authoritativeEffect);
        setFeedbackReceipt(value && kind !== "later" ? {spaceId,title:paper.title,paper:{...paper,saved:kind === "not_relevant" ? false : kind === "save" ? value : paper.saved,feedback:kind === "relevant" || kind === "not_relevant" ? kind : paper.feedback},kind,effect:authoritativeEffect || feedbackEffectCopy(kind,value,reasonCode,locale)} : null);
        if (result.routeEvidence?.changed) {
          const refreshedMap = await readResearchMapState(spaceId).catch(() => null);
          if (refreshedMap && paperNetworkSpaceRef.current === spaceId) {
            setResearchMap(refreshedMap);
            setSelectedThread((current) => refreshedMap.tracks.find((track) => track.id === current?.id)
              || refreshedMap.tracks.find((track) => track.id === result.routeEvidence?.trackId)
              || refreshedMap.tracks[0] || null);
          }
        }
        if (reasonCode || !value) {
          const refreshed = await fetch(`/api/monitor?spaceId=${encodeURIComponent(spaceId)}`).catch(() => null);
          const data = refreshed?.ok ? await refreshed.json().catch(() => null) as { monitor?: MonitorState } | null : null;
          if (data?.monitor && paperNetworkSpaceRef.current === spaceId) setMonitor(data.monitor);
        }
      } catch {
        if (paperNetworkSpaceRef.current === spaceId) {
          const message = locale === "zh" ? "未能确认反馈保存，请重试。" : "Could not confirm the save. Please retry.";
          setToast(message); setFeedbackReceipt(current => current ? {...current,error:message} : current);
        }
      } finally {
        feedbackSaving.current = false;
        setFeedbackBusy(false);
      }
    })();
  };

  const openRecommendationMemory = async () => {
    const spaceId = activeSpace.id;
    try {
      const response = await fetch(`/api/monitor?spaceId=${encodeURIComponent(spaceId)}`);
      if (!response.ok) throw new Error();
      const data = await response.json() as {monitor?:MonitorState};
      if (!data.monitor) throw new Error();
      if (paperNetworkSpaceRef.current !== spaceId) return;
      setMonitor(data.monitor); setMemorySection("preferences"); navigate("memory"); setFeedbackReceipt(null);
    } catch { if (paperNetworkSpaceRef.current === spaceId) {
      const message = locale === "zh" ? "偏向暂未读取，请重试。已保存的反馈仍然保留。" : "Could not load interests. Your saved feedback is retained; please retry.";
      setToast(message); setFeedbackReceipt(current => current ? {...current,error:message} : current);
    } }
  };

  const requestPaperDecision = (paper: MonitorPaper, kind: "relevant" | "not_relevant") => {
    if (feedbackSaving.current) return;
    document.querySelectorAll(".v2-paper-more-actions[open]").forEach(element => element.removeAttribute("open"));
    setFeedbackNote("");
    setFeedbackPrompt({ paper, kind });
  };

  const chooseFeedbackReason = (reasonCode: string) => {
    if (!feedbackPrompt) return;
    saveFeedback(feedbackPrompt.paper, feedbackPrompt.kind, reasonCode, feedbackNote);
  };

  const memorySpaceRef = useRef(activeSpace.id);
  useEffect(() => { memorySpaceRef.current = activeSpace.id; }, [activeSpace.id]);
  const updateMemorySignal = async (signal: PreferenceSignal, active: boolean) => {
    const spaceId = activeSpace.id;
    try {
      const response = await fetch("/api/preference-signals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spaceId, signalId: signal.id, active }) });
      if (!response.ok) return false;
      if (memorySpaceRef.current === spaceId) setMonitor(current => current ? { ...current, preferenceSignals: [...(current.preferenceSignals || []).filter(item => item.id !== signal.id), ...(active ? [signal] : [])] } : current);
      return true;
    } catch { return false; }
  };

  const returnPaperToInbox = (paper: MonitorPaper) => {
    const kind = paper.userState === "dismissed" ? "not_relevant" : paper.feedback === "relevant" ? "relevant" : "save";
    saveFeedback(paper, kind, undefined, "", false);
  };

  const updateReadingProgress = async (paper: MonitorPaper, status: MonitorPaper["readingStatus"], note = paper.readingNote || "", analyze = false) => {
    if (readingWriteRef.current) return;
    const write = {};
    readingWriteRef.current = write;
    const spaceId = activeSpace.id;
    const isCurrent = () => readingWriteRef.current === write && paperNetworkSpaceRef.current === spaceId;
    setReadingSaving(true);
    setNoteSaveError("");
    const updatePaper = (item: MonitorPaper): MonitorPaper => item.id === paper.id ? { ...item, readingStatus: status, readingNote: note } : item;
    const noteChanged = note.trim().slice(0, 3000) !== (paper.readingNote || "");
    if (analyze) setReadingMemoryAnalyzing(true);
    try {
      const response = await fetch("/api/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, paperId: paper.id, status, note, analyze }),
      });
      if (!response.ok) throw new Error("reading progress update failed");
      const result = await response.json() as { memoryAnalysis?: { status?: string } | null };
      if (!isCurrent()) return;
      setLibraryRevision(n=>n+1);
      taskBriefState.patchPaper(paper.id,{readingStatus:status});
      clearSessionDraft(sessionDraftKey(user.userId, spaceId, `note:${paper.id}`), note);
      setSavedReadingId(`${spaceId}:${paper.id}`);
      setSelectedMonitorPaper((current) => current?.id === paper.id ? updatePaper(current) : current);
      setMonitor((current) => {
        if (!current) return current;
        const papers = current.papers.map(updatePaper);
        const historyPapers = (current.historyPapers || current.papers).map(updatePaper);
        return { ...current, papers, historyPapers, historyCounts: historyCountsFor(historyPapers),
          preferenceSignals: noteChanged ? current.preferenceSignals?.filter(signal => signal.sourceType !== "reading_note" || signal.sourcePaperId !== paper.id) : current.preferenceSignals,
          readingMemories: noteChanged ? current.readingMemories?.filter(memory => memory.paperId !== paper.id) : current.readingMemories };
      });
      setLearningReloadNonce((current) => current + 1);
      if (analyze) {
        const refreshed = await fetch(`/api/monitor?spaceId=${encodeURIComponent(spaceId)}`).catch(() => null);
        const data = refreshed?.ok ? await refreshed.json().catch(() => null) as { monitor?: MonitorState } | null : null;
        if (!isCurrent()) return;
        if (data?.monitor) setMonitor(data.monitor);
        setToast(result.memoryAnalysis?.status === "ready"
          ? (locale === "zh" ? "阅读笔记已由 Pi 沉淀到研究记忆" : "Pi added this note to research memory")
          : result.memoryAnalysis?.status === "needs_more_context"
            ? (locale === "zh" ? "笔记已保存；再写具体一些后即可让 Pi 沉淀" : "Note saved; add more detail for Pi to synthesize it")
            : (locale === "zh" ? "笔记已保存，智能沉淀暂未完成" : "Note saved; memory synthesis is pending"));
      } else {
        setToast(locale === "zh" ? `阅读记录已保存 · ${readingStatusLabel(status, locale)}` : `Reading status updated to ${readingStatusLabel(status, locale)}`);
        if (demo || noteChanged) {
          const refreshed = await fetch('/api/monitor?spaceId=' + encodeURIComponent(spaceId)).catch(() => null);
          const data = refreshed?.ok ? await refreshed.json().catch(() => null) as {monitor?:MonitorState} | null : null;
          if (data?.monitor && isCurrent()) setMonitor(data.monitor);
        }
      }
    } catch {
      if (!isCurrent()) return;
      setNoteSaveError(locale === "zh" ? "保存失败，输入仍保留。请重试。" : "Save failed. Your input is preserved. Retry.");
    } finally {
      if (isCurrent()) {
        readingWriteRef.current = null;
        setReadingSaving(false);
        if (analyze) setReadingMemoryAnalyzing(false);
      }
    }
  };

  const openMonitorPaper = (paper: MonitorPaper, returnView: View = view === "learn" ? "learn" : view === "library" ? "library" : "today", readingFocus?: string) => {
    const openedPaper = { ...paper, openedAt: new Date().toISOString(), userState: paper.userState === "unseen" ? "seen" as const : paper.userState };
    setPaperReturnView(returnView);
    setNoteSaveError(""); setNoteDraftUnavailable(false);
    setSelectedMonitorPaper(openedPaper);
    setPaperNoteDraft(paper.readingNote || "");
    setMonitor((current) => {
      if (!current) return current;
      const updatePaper = (item: MonitorPaper): MonitorPaper => item.id === paper.id ? openedPaper : item;
      const historyPapers = (current.historyPapers || current.papers).map(updatePaper);
      return { ...current, papers: current.papers.map(updatePaper), historyPapers, historyCounts: historyCountsFor(historyPapers) };
    });
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spaceId: activeSpace.id,
        paperId: paper.id,
        kind: "open",
        value: true,
        eventKey: engagementEventKey(paper.id, "detail_open"),
        context: returnView,
      }),
    }).catch(() => undefined);
    navigate("paper-detail", workbookTrackId, { id: paper.id, from: returnView, readingFocus });
  };

  const showPaperLoadError = (paperId: string, from: View) => {
    setRequestedLocation({ view: "paper-detail", id: paperId, space: activeSpace.id, from, track: from === "workbook" ? workbookTrackId || undefined : selectedThread?.id, tab: researchRouteTab });
    setNavigationIssue("paper");
  };

  const refreshOpenedPaperReview = async () => {
    const spaceId=activeSpace.id,paperId=selectedMonitorPaper?.id;
    if(!paperId)return;
    const response=await fetch(`/api/monitor?spaceId=${encodeURIComponent(spaceId)}&paperId=${encodeURIComponent(paperId)}`,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error("Review refresh unavailable");
    const data=await response.json() as {monitor?:MonitorState};
    const paper=data.monitor?.historyPapers?.find(item=>item.id===paperId);
    if(!paper||!data.monitor)throw Error("Updated review missing");
    if(paperNetworkSpaceRef.current!==spaceId)return;
    setMonitor(data.monitor);
    setSelectedMonitorPaper(current=>current?.id===paperId?{...paper,readingNote:current.readingNote,readingStatus:current.readingStatus}:current);
  };

  const openLearningResource = async (resource: LearningResource) => {
    const paperId = learningResourcePaperId(resource);
    if (!paperId || openingLearningResourceId) return;
    const spaceId = activeSpace.id;
    const requestId = ++learningPaperRequestRef.current;
    setOpeningLearningResourceId(resource.id);
    try {
      let paper = historyPapers.find((item) => item.id === paperId);
      if (!paper) {
        const response = await fetch(`/api/monitor?spaceId=${encodeURIComponent(spaceId)}&paperId=${encodeURIComponent(paperId)}`);
        if (!response.ok) throw new Error("paper unavailable");
        const data = await response.json() as { monitor?: MonitorState };
        paper = data.monitor?.historyPapers?.find((item) => item.id === paperId);
      }
      if (requestId !== learningPaperRequestRef.current || paperNetworkSpaceRef.current !== spaceId) return;
      if (!paper) throw new Error("paper unavailable");
      openMonitorPaper(paper, "learn");
    } catch {
      if (requestId === learningPaperRequestRef.current && paperNetworkSpaceRef.current === spaceId) {
        showPaperLoadError(paperId, "learn");
      }
    } finally {
      if (requestId === learningPaperRequestRef.current && paperNetworkSpaceRef.current === spaceId) setOpeningLearningResourceId(null);
    }
  };

  const openRoutePaper = async (paperId: string, returnView: View = "thread-detail") => {
    const spaceId = activeSpace.id;
    const requestId = ++learningPaperRequestRef.current;
    try {
      let paper = historyPapers.find(item => item.id === paperId);
      if (!paper) {
        setToast(locale === "zh" ? "正在读取这篇论文…" : "Loading this paper…");
        const response = await fetch(`/api/monitor?spaceId=${encodeURIComponent(spaceId)}&paperId=${encodeURIComponent(paperId)}`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("paper unavailable");
        const data = await response.json() as { monitor?: MonitorState };
        paper = data.monitor?.historyPapers?.find(item => item.id === paperId);
      }
      if (paperNetworkSpaceRef.current !== spaceId || learningPaperRequestRef.current !== requestId) return;
      if (!paper) throw new Error("paper unavailable");
      openMonitorPaper(paper, returnView);
    } catch {
      if (paperNetworkSpaceRef.current === spaceId && learningPaperRequestRef.current === requestId) showPaperLoadError(paperId, returnView);
    }
  };

  const openWorkbook = (trackId: string, task?: GraphTaskContext) => {
    loadedWorkbookRef.current = '';
    setWorkbookTask(task);
    setWorkbookVersionId("");
    setWorkbookViewState({panel:"evidence",focus:""});
    setWorkbookTrackId(trackId);
    setWorkbookReturnView(view);
    navigate("workbook", trackId, { from: view, workbookId: undefined, workbookPanel: "evidence", workbookFocus: undefined });
  };

  const openWorkbookPaper = async (source: WorkbookSource, focus: string) => {
    const spaceId = activeSpace.id;
    const requestId = ++learningPaperRequestRef.current;
    try {
      let paper = historyPapers.find(p => p.id === source.id);
      if (!paper) {
        const response = await fetch(`/api/monitor?spaceId=${encodeURIComponent(spaceId)}&paperId=${encodeURIComponent(source.id)}`);
        if (!response.ok) throw new Error("paper unavailable");
        const data = await response.json() as { monitor?: MonitorState };
        paper = data.monitor?.historyPapers?.find(p => p.id === source.id);
      }
      if (paperNetworkSpaceRef.current !== spaceId || learningPaperRequestRef.current !== requestId) return;
      if (!paper) throw new Error("paper unavailable");
      workbookScrollRef.current = window.scrollY;
      setWorkbookPaperFocus(focus); openMonitorPaper(paper, "workbook", focus);
    } catch {
      if (paperNetworkSpaceRef.current === spaceId && learningPaperRequestRef.current === requestId) showPaperLoadError(source.id, "workbook");
    }
  };

  const shareSnapshot = async (kind: "daily" | "paper", papers: MonitorPaper[]) => {
    const shareKey = kind === "daily" ? "daily" : papers[0]?.id;
    if (!shareKey || !papers.length || sharingSnapshot || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setSharingSnapshot(shareKey);
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, kind, paperIds: papers.slice(0, 6).map((paper) => paper.id), locale }),
      });
      const data = await response.json() as { url?: string; title?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "share failed");
      if (kind === "paper" && papers[0]) recordPaperEngagement(papers[0], "share", { context: "paper_detail" });

      if (navigator.share) {
        try {
          await navigator.share({ title: data.title || "Pi Research", url: data.url });
          setToast(t.snapshotShared);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(data.url);
        setToast(t.snapshotCopied);
      } catch {
        window.open(data.url, "_blank", "noopener,noreferrer");
        setToast(t.snapshotOpened);
      }
    } catch {
      setToast(t.shareFailed);
    } finally {
      setSharingSnapshot(null);
    }
  };

  const openResearchImport = () => {
    const savedDraft = researchImports.find((item) => item.status === "draft") || null;
    setImportDraft(savedDraft);
    if (savedDraft) setImportSourceKind(savedDraft.sourceKind);
    setImportFiles([]);
    setPastedMaterial("");
    setSafetyConfirmed(false);
    setImportOpen(true);
  };

  const addMaterialFiles = async (list: FileList | null) => {
    if (!list?.length || parsingMaterials) return;
    setParsingMaterials(true);
    let blocked = false;
    try {
      const next = [...importFiles];
      for (const file of Array.from(list).slice(0, Math.max(0, MATERIAL_FILE_LIMIT - next.length))) {
        const relativeName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        if (materialNameWarning.test(relativeName)) {
          blocked = true;
          continue;
        }
        if (next.some((item) => item.name === relativeName && item.chars === file.size)) continue;
        try {
          const extracted = (await extractMaterialText(file)).replace(/\r\n?/g, "\n").trim();
          if (!extracted) continue;
          next.push({ name: relativeName.slice(0, 180), text: extracted.slice(0, MATERIAL_CHAR_LIMIT), chars: extracted.length, truncated: extracted.length > MATERIAL_CHAR_LIMIT });
        } catch {
          // Unsupported or unreadable files are skipped; the visible list remains authoritative.
        }
      }
      setImportFiles(next.slice(0, MATERIAL_FILE_LIMIT));
      if (blocked) setToast(t.suspiciousBlocked);
    } finally {
      setParsingMaterials(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  };

  const analyzeResearchImport = async () => {
    if (analyzingImport || !safetyConfirmed) return;
    const pasted = pastedMaterial.trim();
    const files = [...importFiles.map(({ name, text }) => ({ name, text }))];
    if (pasted) files.push({ name: locale === "zh" ? "粘贴的聊天记录.txt" : "pasted-conversation.txt", text: pasted.slice(0, MATERIAL_CHAR_LIMIT) });
    if (!files.length) return;
    setAnalyzingImport(true);
    try {
      const response = await fetch("/api/research-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, sourceKind: importSourceKind, files, safetyConfirmed: true, locale }),
      });
      const data = await response.json() as { import?: ResearchImportRecord | null; error?: string };
      if (!response.ok || !data.import) throw new Error(data.error || "import failed");
      setResearchImports((current) => [data.import!, ...current.filter((item) => item.id !== data.import!.id)]);
      setImportFiles([]);
      setPastedMaterial("");
      setSafetyConfirmed(false);
      if (data.import.status === "confirmed") {
        setImportOpen(false);
        setToast(t.profileConfirmed);
      } else {
        setImportDraft(data.import);
      }
    } catch (error) {
      const message = error instanceof Error && error.message && error.message !== "import failed" ? error.message : t.importFailed;
      setToast(message);
    } finally {
      setAnalyzingImport(false);
    }
  };

  const editImportAnalysis = (update: (analysis: ResearchProfileAnalysis) => ResearchProfileAnalysis) => {
    setImportDraft((current) => current ? { ...current, analysis: update(current.analysis) } : current);
  };

  const saveImportDecision = async (action: "confirm" | "discard") => {
    if (!importDraft || savingImport) return;
    setSavingImport(true);
    try {
      const response = await fetch("/api/research-imports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, importId: importDraft.id, action, analysis: importDraft.analysis }),
      });
      const data = await response.json() as { import?: ResearchImportRecord | null; error?: string };
      if (!response.ok || !data.import) throw new Error(data.error || "save failed");
      setResearchImports((current) => action === "discard" ? current.filter((item) => item.id !== data.import!.id) : [data.import!, ...current.filter((item) => item.id !== data.import!.id)]);
      if (action === "confirm") {
        void fetch(`/api/monitor?spaceId=${encodeURIComponent(activeSpace.id)}`)
          .then((monitorResponse) => monitorResponse.json() as Promise<{ monitor?: MonitorState }>)
          .then((monitorData) => { if (monitorData.monitor) setMonitor(monitorData.monitor); })
          .catch(() => undefined);
      }
      setImportDraft(null);
      setImportOpen(false);
      setToast(action === "confirm" ? t.profileConfirmed : locale === "zh" ? "画像草稿已放弃" : "Profile draft discarded");
    } catch {
      setToast(t.importFailed);
    } finally {
      setSavingImport(false);
    }
  };

  const askAboutMonitorPaper = (paper: MonitorPaper) => {
    askRequest.current++;
    setAsking(false);
    setAskContext({paperId:paper.id});
    setAskError("");
    setAnswer("");
    recordPaperEngagement(paper, "ask_pi", { context: "paper_detail" });
    setQuestion(locale === "zh" ? `请结合当前研究空间分析这篇论文：${paper.title}` : `Analyze this paper in the context of the current research space: ${paper.title}`);
    setAskOpen(true);
  };

  const openThread = (thread: ResearchTrack, tab: ResearchRouteTab = "start") => {
    setSelectedThread(thread);
    if (selectedThread?.id !== thread.id) setResearchProblemState(null);
    setResearchSynthesis(null);
    updateResearchRouteTab(tab === "gaps" ? "evidence" : tab === "assessment" ? "problem" : tab);
    navigate("thread-detail", workbookTrackId, { id: thread.id, tab: tab === "gaps" ? "evidence" : tab === "assessment" ? "problem" : tab });
    void fetch("/api/research-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId: activeSpace.id, action: "activity", trackId: thread.id, activityKind: "track_opened" }),
    }).catch(() => undefined);
  };

  const recordMapPaperOpen = (threadId: string) => {
    void fetch("/api/research-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId: activeSpace.id, action: "activity", trackId: threadId, activityKind: "paper_opened" }),
    }).catch(() => undefined);
  };

  const refreshPaperNetwork = async (refreshMode: "all" | "verified" | "pi" = "verified") => {
    if (paperNetworkLoading || researchMap.paperNetwork.paperCount < 2) return;
    const spaceId = activeSpace.id;
    paperNetworkAutoAttemptRef.current.add(`${spaceId}:${researchMap.paperNetwork.paperRevision || researchMap.paperNetwork.paperCount}:deepseek-flash+coupling-v2`);
    let failedPhase: Exclude<PaperNetworkBuildPhase, null> = refreshMode === "pi" ? "pi" : "verified";
    setPaperNetworkLoading(true);
    try {
      if (refreshMode !== "pi") {
        setPaperNetworkBuildPhase("verified");
        const verified = await requestPaperNetworkBuildPhase(spaceId, "verified", true);
        if (paperNetworkSpaceRef.current !== spaceId) return;
        setResearchMap(verified);
      }
      if (refreshMode !== "verified") {
        failedPhase = "pi";
        setPaperNetworkBuildPhase("pi");
        const curated = await requestPaperNetworkBuildPhase(spaceId, "pi", true);
        if (paperNetworkSpaceRef.current !== spaceId) return;
        setResearchMap(curated);
      }
      setToast(refreshMode === "verified"
        ? (locale === "zh" ? "已核验当前论文库中的真实引用" : "Verified citations in the current paper library")
        : refreshMode === "pi"
          ? (locale === "zh" ? "Pi 已重新分析论文关系" : "Pi re-analyzed the paper relationships")
          : (locale === "zh" ? "论文网络已根据当前真实论文更新" : "The paper network now reflects the current real papers"));
    } catch {
      if (paperNetworkSpaceRef.current === spaceId) {
        setResearchMap((current) => ({ ...current, paperNetwork: { ...current.paperNetwork, status: "partial", error: `${failedPhase === "verified" ? "citation" : "pi"}: network request interrupted` } }));
        setToast(locale === "zh" ? "论文关系暂时无法更新，已有节点仍可浏览" : "Relationships could not refresh; existing nodes remain available");
      }
    } finally {
      if (paperNetworkSpaceRef.current === spaceId) {
        setPaperNetworkBuildPhase(null);
        setPaperNetworkLoading(false);
      }
    }
  };

  const askAboutNetworkPaper = (node: NetworkPaperNode) => {
    askRequest.current++;
    setAsking(false);
    setAskContext({trackId:node.track.id,routePaperId:node.paper.id});
    setAskError("");
    setAnswer("");
    setQuestion(locale === "zh"
      ? `请结合当前研究空间，解释《${node.paper.title}》在“${node.track.titleZh}”发展路线中的位置，以及它与前后代表论文的关键关系。`
      : `Explain where “${node.paper.title}” sits in the “${node.track.titleEn}” development route and its key relationships to representative work before and after it.`);
    setAskOpen(true);
  };

  const askAboutResearchRoute = (thread: ResearchTrack, focus: "assessment" | "gap" | "agenda" = "assessment") => {
    askRequest.current++;
    setAsking(false);
    setAskContext({trackId:thread.id});
    setAskError("");
    setAnswer("");
    const title = locale === "zh" ? thread.titleZh : thread.titleEn;
    const focusPrompt = focus === "gap"
      ? (locale === "zh" ? `请基于当前真实论文，分析“${title}”的证据缺口，解释还缺什么证据，并给出下一步可核验的检索和阅读建议。` : `Using the current real papers, analyze the evidence gap in “${title}” and propose a verifiable next search and reading plan.`)
      : focus === "agenda"
        ? (locale === "zh" ? `请把“${title}”当前的关键机会、观察信号和证据缺口拆成一个可执行的研究议程，并明确每一步应核对哪些论文证据。` : `Turn the current opportunity, watch signal, and evidence gap for “${title}” into an actionable research agenda with paper evidence to verify at every step.`)
        : (locale === "zh" ? `请基于“${title}”路线中的真实论文解释当前判断、关键机会和主要不确定性，并明确区分用户确认纳入的论文、路线参考材料与已完成书目和摘要证据核对的推荐。` : `Explain the current assessment, key opportunity, and main uncertainty for “${title}” using its real papers, separating user-confirmed route papers, route reference material, and recommendations that passed bibliographic and abstract evidence checks.`);
    setQuestion(focusPrompt);
    setAskOpen(true);
  };

  const askAboutRoutePaper = (thread: ResearchTrack, paper: ResearchTrackPaper) => {
    askRequest.current++;
    setAsking(false);
    setAskContext({trackId:thread.id,routePaperId:paper.id});
    setAskError("");
    setAnswer("");
    setQuestion(locale === "zh"
      ? `请结合“${thread.titleZh}”这条研究路线，解释《${paper.title}》的实际贡献，并核对“${researchRoleLabel(paper.role, locale)}”定位是否成立。先给判断与摘要出处；没有依据就建议调整，不为已有标签推测理由，不把缺少材料当作研究缺口。`
      : `In the “${thread.titleEn}” route, check the actual contribution of “${paper.title}” and whether its ${researchRoleLabel(paper.role, locale)} classification is justified. Cite abstract evidence, suggest a correction if unsupported, and do not invent research gaps from missing materials.`);
    setAskOpen(true);
  };

  const openRouteLearningPath = (thread: Pick<ResearchTrack, "id" | "titleZh" | "titleEn">, task?: GraphTaskContext) => {
    setLearningTask(task);
    setLearningPlannerOpen(true);
    const target = locale === "zh" ? thread.titleZh : thread.titleEn;
    learningIntentRef.current = { spaceId: activeSpace.id, trackId: thread.id, target };
    setLearningTarget(target);
    setLearningTargetTrackId(thread.id);
    setLearningScopeDirty(false);
    navigate("learn");
  };

  const startRecommendedResearch = (track: Pick<ResearchTrack, "id" | "titleZh" | "titleEn">, task: GraphTaskContext) => {
    if (task.spaceId !== activeSpace.id) return;
    openRouteLearningPath(track, task);
    void readResearchMapState(task.spaceId).then(data => {
      if (paperNetworkSpaceRef.current === task.spaceId) setResearchMap(data);
    }).catch(() => {});
  };

  const addNetworkPaperToLearningPath = (node: NetworkPaperNode) => {
    openRouteLearningPath(node.track, { ...currentGraphTask, papers: [{canonicalId:node.paper.canonicalId,title:node.paper.title}] });
  };

  const setResearchDirectionRole = async (thread: ResearchTrack, userRole: ResearchDirectionRole) => {
    if (mapAction) return;
    setMapAction(`role:${thread.id}`);
    try {
      const response = await fetch("/api/research-map", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trackId: thread.id, userRole }),
      });
      const data = await response.json() as ResearchMapState & { error?: string };
      if (!response.ok) throw new Error(data.error || "role update failed");
      setResearchMap(data);
      setSelectedThread(data.tracks.find((item) => item.id === thread.id) || null);
    } catch {
      setToast(locale === "zh" ? "方向定位暂时无法保存" : "Could not save the direction role");
    } finally {
      setMapAction(null);
    }
  };

  const setResearchDirectionMonitoring = async (thread: ResearchTrack, monitoringStatus: "active" | "paused") => {
    if (mapAction) return;
    setMapAction(`monitoring:${thread.id}`);
    try {
      const response = await fetch("/api/research-map", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trackId: thread.id, monitoringStatus }),
      });
      const data = await response.json() as ResearchMapState & { error?: string };
      if (!response.ok) throw new Error(data.error || "monitoring status update failed");
      setResearchMap(data);
      setSelectedThread(data.tracks.find((item) => item.id === thread.id) || null);
      setToast(monitoringStatus === "paused"
        ? (locale === "zh" ? "已暂停新的自动发现；历史、候选、推荐和阅读记录全部保留" : "New automatic discovery is paused; history, candidates, recommendations, and reading records remain")
        : (locale === "zh" ? "路线已恢复，将从下一轮继续自动发现" : "The route is active again and will rejoin automatic discovery next cycle"));
    } catch {
      setToast(locale === "zh" ? "路线运行状态暂时无法保存" : "Could not save the route monitoring status");
    } finally {
      setMapAction(null);
    }
  };

  const proposeResearchRouteEvolution = async (thread: ResearchTrack) => {
    if (mapAction || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setMapAction(`evolution-propose:${thread.id}`);
    try {
      const response = await fetch("/api/research-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trackId: thread.id, action: "propose-evolution" }),
      });
      const data = await response.json() as ResearchMapState & { error?: string };
      if (!response.ok) throw new Error(data.error || "route evolution proposal failed");
      setResearchMap(data);
      setSelectedThread(data.tracks.find((item) => item.id === thread.id) || null);
      setToast(locale === "zh" ? "路线演化提案已生成；确认前不会改变正式路线" : "Route evolution proposal created; the formal route is unchanged until confirmation");
    } catch (error) {
      setToast(error instanceof Error ? error.message : (locale === "zh" ? "当前证据还无法形成可靠的路线变化" : "The current evidence cannot support a reliable route change yet"));
    } finally {
      setMapAction(null);
    }
  };

  const decideResearchRouteEvolution = async (thread: ResearchTrack, revisionId: string, decision: "confirm" | "dismiss") => {
    if (mapAction || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setMapAction(`evolution-${decision}:${revisionId}`);
    try {
      const response = await fetch("/api/research-map", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId: activeSpace.id,
          trackId: thread.id,
          revisionId,
          action: decision === "confirm" ? "confirm-evolution" : "dismiss-evolution",
        }),
      });
      const data = await response.json() as ResearchMapState & { error?: string };
      if (!response.ok) throw new Error(data.error || "route evolution decision failed");
      setResearchMap(data);
      setSelectedThread(data.tracks.find((item) => item.id === thread.id) || null);
      setToast(decision === "confirm"
        ? (locale === "zh" ? "正式路线已更新为新版本；下一轮发现将使用新的路线定义" : "The formal route is now on the new version; future discovery will use it")
        : (locale === "zh" ? "提案已驳回并保留在版本历史中" : "Proposal dismissed and retained in version history"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : (locale === "zh" ? "路线版本决策暂时无法保存" : "Could not save the route version decision"));
    } finally {
      setMapAction(null);
    }
  };

  const curateResearchTrackPaperNode = async (thread: ResearchTrack, paper: ResearchTrackPaper, status: "active" | "deactivated") => {
    if (mapAction || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setMapAction(`curate:${paper.id}`);
    try {
      const response = await fetch("/api/research-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId: activeSpace.id,
          action: "curate-paper",
          trackId: thread.id,
          paperId: paper.id,
          curationStatus: status,
          curationReasonCode: status === "deactivated" ? "off_topic" : "restored",
        }),
      });
      const data = await response.json() as ResearchMapState & { error?: string };
      if (!response.ok) throw new Error(data.error || "route paper curation failed");
      setResearchMap(data);
      setSelectedThread(data.tracks.find((item) => item.id === thread.id) || null);
      setToast(status === "deactivated"
        ? (locale === "zh" ? "节点已停用；历史与审计记录保留，后续不再作为活跃路线证据供稿" : "Node deactivated. History and audit records remain; it no longer supplies the active route.")
        : (locale === "zh" ? "节点已恢复；路线将保持部分可用，直到下一次补充完成" : "Node restored. The route remains partial until the next refresh completes."));
    } catch (error) {
      setToast(error instanceof Error ? error.message : (locale === "zh" ? "路线节点状态暂时无法更新" : "Could not update the route node"));
    } finally {
      setMapAction(null);
    }
  };

  const expandResearchTrack = async (thread: ResearchTrack) => {
    if (thread.monitoringStatus === "paused" || mapAction || mapBuildTrackId || mapIntelligenceTrackId || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setMapAction(thread.id);
    const isInitialFill = ["queued", "retryable", "empty", "failed"].includes(thread.buildStatus);
    try {
      const response = await fetch("/api/research-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, action: isInitialFill ? "hydrate" : "expand", trackId: thread.id, force: ["empty", "failed"].includes(thread.buildStatus) }),
      });
      const data = await response.json() as ResearchMapState & { reviewQueuedCount?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "expand failed");
      setResearchMap(data);
      const updated = data.tracks.find((item) => item.id === thread.id) || null;
      setSelectedThread(updated);
      setMapBuildErrors((current) => { const next = { ...current }; delete next[thread.id]; return next; });
      setToast(locale === "zh"
        ? (data.reviewQueuedCount ? `已找到 ${data.reviewQueuedCount} 篇候选，将在下一次质量评估中审阅` : "本轮没有新的候选进入质量队列，探索位置已保存")
        : (data.reviewQueuedCount ? `${data.reviewQueuedCount} candidates will be reviewed in the next quality pass` : "No new candidate entered the quality queue; the exploration position was saved"));
    } catch {
      setToast(locale === "zh" ? "继续挖掘失败，请稍后重试" : "Could not continue mining this direction");
    } finally {
      setMapAction(null);
    }
  };

  const scanResearchRouteSignal = async (thread: ResearchTrack, origin: "gap" | "problem") => {
    const hasQuery = origin === "problem"
      ? Boolean(researchProblemState?.assessment?.nextSearchQuery && !researchProblemState.assessment.stale)
      : Boolean((researchSynthesis && selectedThread?.id === thread.id ? researchSynthesis.nextSearchQuery : "") || thread.intelligence?.nextSearchQuery);
    if (thread.monitoringStatus === "paused" || mapAction || mapBuildTrackId || mapIntelligenceTrackId || !hasQuery
      || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setMapAction(`${origin}:${thread.id}`);
    try {
      const response = await fetch("/api/research-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, action: origin === "problem" ? "expand-problem" : "expand-gap", trackId: thread.id }),
      });
      const data = await response.json() as ResearchMapState & {
        reviewQueuedCount?: number;
        routeBuildDegraded?: boolean;
        routeSourceStatuses?: Array<{ source: string; status: string; error?: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || `${origin} expansion failed`);
      setResearchMap(data);
      setSelectedThread(data.tracks.find((item) => item.id === thread.id) || thread);
      const queued = data.reviewQueuedCount || 0;
      const degraded = Boolean(data.routeBuildDegraded || data.routeSourceStatuses?.some((source) => source.status === "failed"));
      setToast(degraded
        ? queued
          ? locale === "zh"
            ? `${queued} 篇候选已进入共享质量队列；部分来源暂不可用，已有结果仍保留`
            : `${queued} candidates entered the shared quality queue; some sources are unavailable and existing results remain`
          : locale === "zh"
            ? "部分论文来源暂不可用，本轮尚未补齐证据；这不代表没有合适论文，已有记录已保留，可稍后重试"
            : "Some paper sources are unavailable, so this pass did not close the gap. This is not a no-paper result; existing records remain available for retry"
        : origin === "problem"
          ? locale === "zh"
            ? (queued ? `围绕研究问题发现的 ${queued} 篇候选已进入共享质量队列` : "健康来源已完成检索，本轮没有新的研究问题候选；检索位置已保存")
            : (queued ? `${queued} research-problem candidates entered the shared quality queue` : "Healthy sources completed the search with no new research-problem candidates; the search position was saved")
          : locale === "zh"
            ? (queued ? `沿缺口发现的 ${queued} 篇候选已进入共享质量队列，将在下一轮审阅` : "健康来源已完成检索，本轮没有新的缺口候选；检索位置已保存")
            : (queued ? `${queued} gap candidates entered the shared queue for the next review pass` : "Healthy sources completed the search with no new gap candidates; the search position was saved"));
    } catch {
      setToast(origin === "problem"
        ? (locale === "zh" ? "研究问题扫描暂时未完成，请先保留当前研判" : "The research-problem scan could not finish; the assessment remains saved")
        : (locale === "zh" ? "证据缺口扫描暂时未完成，请稍后重试" : "The evidence-gap scan could not finish just now"));
    } finally {
      setMapAction(null);
    }
  };

  const scanResearchRouteGap = (thread: ResearchTrack) => scanResearchRouteSignal(thread, "gap");
  const scanResearchProblemGap = (thread: ResearchTrack) => scanResearchRouteSignal(thread, "problem");

  const refreshDirectionIntelligence = async (thread: ResearchTrack) => {
    if (thread.monitoringStatus === "paused" || mapAction || mapBuildTrackId || mapIntelligenceTrackId || !thread.papers.length) return;
    setMapAction(`interpret:${thread.id}`);
    try {
      const response = await fetch("/api/research-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, action: "interpret", trackId: thread.id }),
      });
      const data = await response.json() as ResearchMapState & {
        error?: string;
        intelligenceAdvance?: { status?: "idle" | "ready" | "retryable" | "superseded" };
      };
      if (!response.ok) throw new Error(data.error || "direction interpretation failed");
      setResearchMap(data);
      setSelectedThread(data.tracks.find((item) => item.id === thread.id) || null);
      setToast(data.intelligenceAdvance?.status === "ready"
        ? (locale === "zh" ? "Pi 已基于当前证据更新方向研判" : "Pi refreshed the direction assessment from current evidence")
        : (locale === "zh" ? "本次研判已进入重试，旧研判继续保留" : "The refresh will retry; the saved assessment remains available"));
    } catch {
      setToast(locale === "zh" ? "方向研判暂时无法更新" : "The direction assessment could not be refreshed");
    } finally {
      setMapAction(null);
    }
  };

  const refreshResearchSynthesis = async (thread: ResearchTrack) => {
    if (researchSynthesisLoading || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setResearchSynthesisLoading(true);
    setResearchSynthesisError("");
    try {
      const response = await fetch("/api/research-synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trackId: thread.id, force: true }),
      });
      const data = await response.json() as { synthesis?: ResearchSynthesis; error?: string; modelRequired?: boolean };
      if (!response.ok || !data.synthesis) throw new Error(data.error || "synthesis generation failed");
      setResearchSynthesis(data.synthesis);
      setToast(locale === "zh" ? "Pi 已按最新证据重建跨论文综合" : "Pi rebuilt the cross-paper synthesis from current evidence");
    } catch (error) {
      setResearchSynthesisError(error instanceof Error ? error.message : "synthesis unavailable");
      setToast(locale === "zh" ? "跨论文综合暂时无法更新，已有研判仍可使用" : "The synthesis could not refresh; the saved assessment remains available");
    } finally {
      setResearchSynthesisLoading(false);
    }
  };

  const draftResearchProblem = async () => {
    if (!selectedThread || researchProblemAction || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setResearchProblemAction("draft");
    setResearchProblemError("");
    try {
      const response = await fetch("/api/research-problem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trackId: selectedThread.id, action: "draft", workingLanguage: locale }),
      });
      const data = await response.json() as { problemState?: ResearchProblemState; error?: string };
      if (!response.ok || !data.problemState) throw new Error(data.error || "research problem draft failed");
      setResearchProblemState(data.problemState);
    } catch (error) {
      setResearchProblemError(error instanceof Error ? error.message : "research problem draft failed");
    } finally { setResearchProblemAction(null); }
  };

  const confirmResearchProblem = async (draft: { question: string; objective: string; scope: string; successCriteria: string; stage: ResearchProblemStage; hypotheses: Array<{ statement: string; rationale: string; confidence: number; sourceStatementIds: string[] }> }) => {
    if (!selectedThread || researchProblemAction) return;
    setResearchProblemAction("confirm");
    setResearchProblemError("");
    try {
      const response = await fetch("/api/research-problem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trackId: selectedThread.id, action: "confirm", workingLanguage: locale, ...draft }),
      });
      const data = await response.json() as { problemState?: ResearchProblemState; error?: string };
      if (!response.ok || !data.problemState) throw new Error(data.error || "research problem confirmation failed");
      setResearchProblemState(data.problemState);
      setResearchProblemAction("assess");
      const assessmentResponse = await fetch("/api/research-problem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trackId: selectedThread.id, action: "assess" }),
      });
      const assessmentData = await assessmentResponse.json() as { problemState?: ResearchProblemState; error?: string };
      if (!assessmentResponse.ok || !assessmentData.problemState) throw new Error(assessmentData.error || "initial research assessment failed");
      setResearchProblemState(assessmentData.problemState);
      setToast(locale === "zh" ? "研究问题已确认，并开始指导今日发现" : "The research problem is confirmed and now guides discovery");
    } catch (error) {
      setResearchProblemError(error instanceof Error ? error.message : "research problem confirmation failed");
    } finally { setResearchProblemAction(null); }
  };

  const assessResearchProblem = async () => {
    if (!selectedThread || researchProblemAction) return;
    setResearchProblemAction("assess");
    setResearchProblemError("");
    try {
      const response = await fetch("/api/research-problem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trackId: selectedThread.id, action: "assess" }),
      });
      const data = await response.json() as { problemState?: ResearchProblemState; error?: string };
      if (!response.ok || !data.problemState) throw new Error(data.error || "research problem assessment failed");
      setResearchProblemState(data.problemState);
      setToast(locale === "zh" ? "Pi 已按最新证据更新问题研判" : "Pi updated the problem assessment from current evidence");
    } catch (error) {
      setResearchProblemError(error instanceof Error ? error.message : "research problem assessment failed");
    } finally { setResearchProblemAction(null); }
  };

  const updateResearchProblemAction = async (actionId: string, status: "accepted" | "done" | "dismissed") => {
    if (!selectedThread || researchProblemAction) return;
    setResearchProblemAction(`action:${actionId}`);
    try {
      const response = await fetch("/api/research-problem", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trackId: selectedThread.id, actionId, status }),
      });
      const data = await response.json() as { problemState?: ResearchProblemState; error?: string };
      if (!response.ok || !data.problemState) throw new Error(data.error || "research action update failed");
      setResearchProblemState(data.problemState);
    } catch {
      setToast(locale === "zh" ? "研究行动暂时无法更新" : "The research action could not be updated");
    } finally { setResearchProblemAction(null); }
  };

  const executeResearchProblemAction = async (item: ResearchProblemAction) => {
    if (!selectedThread || researchProblemAction) return;
    const trackId = selectedThread.id;
    setResearchProblemAction(`execute:${item.id}`);
    setResearchProblemError("");
    let pollTimer: number | null = null;
    const refreshActionState = async () => {
      const response = await fetch(`/api/research-problem?spaceId=${encodeURIComponent(activeSpace.id)}&trackId=${encodeURIComponent(trackId)}`);
      const data = await response.json() as { problemState?: ResearchProblemState };
      if (response.ok && data.problemState) setResearchProblemState(data.problemState);
    };
    try {
      if (item.status === "proposed") {
        const acceptResponse = await fetch("/api/research-problem", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId: activeSpace.id, trackId, actionId: item.id, status: "accepted" }),
        });
        const accepted = await acceptResponse.json() as { problemState?: ResearchProblemState; error?: string };
        if (!acceptResponse.ok || !accepted.problemState) throw new Error(accepted.error || "research action acceptance failed");
        setResearchProblemState(accepted.problemState);
      }
      pollTimer = window.setInterval(() => { void refreshActionState(); }, 1400);
      const response = await fetch("/api/research-actions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trackId, actionId: item.id, force: Boolean(item.run) }),
      });
      const data = await response.json() as { runId?: string; kind?: ResearchProblemAction["kind"]; searchQuery?: string; error?: string };
      if (!response.ok || !data.runId) throw new Error(data.error || "research action execution failed");
      let queued = 0;
      if (item.kind === "search" && data.searchQuery) {
        const discoveryResponse = await fetch("/api/research-map", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId: activeSpace.id, trackId, action: "expand-action", actionRunId: data.runId }),
        });
        const discoveryData = await discoveryResponse.json() as ResearchMapState & { reviewQueuedCount?: number; error?: string };
        if (discoveryResponse.ok) {
          queued = discoveryData.reviewQueuedCount || 0;
          setResearchMap(discoveryData);
          setSelectedThread(discoveryData.tracks.find((track) => track.id === trackId) || selectedThread);
        } else {
          setToast(locale === "zh" ? "检索方案已完成；外部候选发现可稍后重试" : "The search plan is ready; external discovery can be retried later");
        }
      }
      await refreshActionState();
      setToast(item.kind === "read"
        ? (locale === "zh" ? "阅读计划已完成，选中的论文已进入阅读队列" : "The reading plan is ready and selected papers entered your queue")
        : item.kind === "search"
          ? (locale === "zh" ? `定向检索已执行，${queued} 篇候选进入质量队列` : `Targeted discovery ran; ${queued} candidates entered quality review`)
          : (locale === "zh" ? "Pi 已完成这项研究行动，并保留全部来源" : "Pi completed the action and retained its sources"));
    } catch (error) {
      await refreshActionState().catch(() => undefined);
      setResearchProblemError(error instanceof Error ? error.message : "research action execution failed");
    } finally {
      if (pollTimer !== null) window.clearInterval(pollTimer);
      setResearchProblemAction(null);
    }
  };

  const generateLearningPath = async (targetOverride?: string, trackIdOverride: string | null | undefined = undefined, previewId?: string) => {
    const target = targetOverride?.trim() || learningTarget.trim();
    if (learningAction || (!target && !previewId) || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    const spaceId = activeSpace.id;
    const targetTrackId = trackIdOverride === undefined ? learningTargetTrackId : trackIdOverride;
    const requestId = ++learningRequestRef.current;
    setLearningAction("generate");
    setLearningError("");
    try {
      const response = await fetch("/api/learning-path", {
        method: "POST",
        signal: AbortSignal.timeout(270_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewId ? { spaceId, action: "commit-preview", previewId } : { spaceId, target, trackId: targetTrackId, goal: activeLearningState.path?.learningGoal, background: activeLearningState.path?.learnerBackground }),
      });
      const data = await response.json() as LearningPathState & { error?: string };
      if (!response.ok || !data.path) throw new Error(data.error || "path generation failed");
      if (learningRequestRef.current !== requestId || paperNetworkSpaceRef.current !== spaceId) return;
      setLearningState(data);
      setLearningTarget(data.path.target);
      setLearningTargetTrackId(data.path.targetTrackId);
      setLearningScopeDirty(false);
      learningIntentRef.current = data.path.targetTrackId ? { spaceId, trackId: data.path.targetTrackId, target: data.path.target } : null;
      setLearningLoadedSpaceId(spaceId);
      setToast(learningPathResultMessage(data.path, locale));
      setLearningPlannerOpen(false);
    } catch (error) {
      if (learningRequestRef.current !== requestId || paperNetworkSpaceRef.current !== spaceId) return;
      setLearningError(locale === "zh" ? "Pi 没有完成这次重新规划；已保存的旧路径不会被覆盖。" : "Pi did not finish this replan; the saved path was not replaced.");
      setToast(error instanceof Error && error.message ? error.message : locale === "zh" ? "学习路径生成失败，请稍后重试" : "Could not build the learning path");
    } finally {
      if (learningRequestRef.current === requestId && paperNetworkSpaceRef.current === spaceId) setLearningAction(null);
    }
  };

  const updateLearningStep = async (step: LearningPathStep) => {
    const path = activeLearningState.path;
    if (!path || learningAction) return;
    const spaceId = activeSpace.id;
    const requestId = ++learningRequestRef.current;
    setLearningAction(step.id);
    setLearningError("");
    try {
      const response = await fetch("/api/learning-path", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, pathId: path.id, stepId: step.id, completed: step.status !== "completed" }),
      });
      const data = await response.json() as LearningPathState & { error?: string };
      if (!response.ok || !data.path) throw new Error(data.error || "progress update failed");
      if (learningRequestRef.current !== requestId || paperNetworkSpaceRef.current !== spaceId) return;
      setLearningState(data);
      setLearningLoadedSpaceId(spaceId);
      setToast(step.status === "completed" ? (locale === "zh" ? "已恢复为待学习" : "Returned to the learning queue") : (locale === "zh" ? "进度已保存到当前研究空间" : "Progress saved to this research space"));
    } catch {
      if (learningRequestRef.current !== requestId || paperNetworkSpaceRef.current !== spaceId) return;
      setLearningError(locale === "zh" ? "进度没有保存成功；当前显示仍以服务器中的已保存版本为准。" : "Progress was not saved; the view still reflects the last saved server version.");
      setToast(locale === "zh" ? "学习进度暂时无法保存" : "Could not save learning progress");
    } finally {
      if (learningRequestRef.current === requestId && paperNetworkSpaceRef.current === spaceId) setLearningAction(null);
    }
  };

  const hasPaperGuide = Boolean(selectedMonitorPaper && [
    locale === "zh" ? selectedMonitorPaper.problemZh : selectedMonitorPaper.problemEn,
    locale === "zh" ? selectedMonitorPaper.methodZh : selectedMonitorPaper.methodEn,
    locale === "zh" ? selectedMonitorPaper.contributionZh : selectedMonitorPaper.contributionEn,
    locale === "zh" ? selectedMonitorPaper.limitationsZh : selectedMonitorPaper.limitationsEn,
    locale === "zh" ? selectedMonitorPaper.readingFocusZh : selectedMonitorPaper.readingFocusEn,
    ...(locale === "zh" ? selectedMonitorPaper.researchQuestionsZh || [] : selectedMonitorPaper.researchQuestionsEn || []),
  ].some(text => text?.trim()));
  const navItems: Array<{ id: View; label: string; mark: InterfaceIconName }> = [
    { id: "today", label: t.today, mark: "today" },
    { id: "threads", label: t.threads, mark: "route" },
    { id: "learn", label: t.learn, mark: "reading" },
    { id: "library", label: t.library, mark: "library" },
    { id: "memory", label: t.memory, mark: "notes" },
  ];
  const activeNav = view === "workbook" || (view === "paper-detail" && ["workbook", "thread-detail"].includes(paperReturnView)) ? "threads" : view === "paper-detail" ? paperReturnView : view === "thread-detail" ? "threads" : view;
  const mapOutlineLabels = locale === "zh"
    ? ["读取研究空间与已确认记忆", "划分主攻、辅助与探索方向", "建立方向之间的主干关系", "保存方向骨架，即将展示"]
    : ["Reading the research space and confirmed memory", "Separating core, support, and exploratory directions", "Connecting the field backbone", "Saving the outline for immediate display"];
  const currentBuildTrack = researchMap.tracks.find((track) => track.id === mapBuildTrackId) || null;
  const currentIntelligenceTrack = researchMap.tracks.find((track) => track.id === mapIntelligenceTrackId) || null;

  const refreshModelStatus = async () => {
    if (checkingModel) return;
    setCheckingModel(true);
    setModelConnectionState("checking");
    setModelSettingsError("");
    try {
      const { response, data } = await modelSettingsRequest("/api/model-settings?verify=1");
      if (!response.ok) throw new Error(data.error || "model status unavailable");
      setModelConnectionState(data.configured ? "connected" : "unconfigured");
      setConnectedModel(data.model || null);
      setModelCredentialSource(data.source || null);
      setToast(data.configured
        ? (locale === "zh" ? "DeepSeek 已连接" : "DeepSeek is connected")
        : (locale === "zh" ? "当前浏览器还没有可用的 API Key" : "This browser does not have a usable API key yet"));
    } catch (error) {
      const problem = modelConnectionProblemCopy(modelConnectionFailureState(error), locale);
      const message = problem ? `${problem.title}。${problem.detail}` : (locale === "zh" ? "模型认证失败，请重新检测或更换 Key。" : "Model authentication failed. Check again or replace the key.");
      setModelConnectionState(modelConnectionFailureState(error));
      setModelSettingsError(message);
    } finally {
      setCheckingModel(false);
    }
  };

  const saveModelCredential = async () => {
    const apiKey = modelApiKey.trim();
    if (!apiKey || checkingModel) return;
    setCheckingModel(true);
    setModelConnectionState("checking");
    setModelSettingsError("");
    try {
      const { response, data } = await modelSettingsRequest("/api/model-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!response.ok) throw new Error(data.error || "DeepSeek connection failed");
      setModelConnectionState("connected");
      setConnectedModel(data.model || "deepseek-flash");
      setModelCredentialSource("browser");
      setModelApiKey("");
        setToast(locale === "zh" ? "API Key 已验证并保存到当前浏览器" : "The API key was verified and saved in this browser");
    } catch (error) {
      setModelConnectionState(modelConnectionFailureState(error));
      const problem = modelConnectionProblemCopy(modelConnectionFailureState(error), locale);
      setModelSettingsError(problem ? `${problem.title}。${problem.detail}` : (locale === "zh" ? "模型认证失败，请检查输入的 Key。" : "Model authentication failed. Check the entered key."));
    } finally {
      setCheckingModel(false);
    }
  };

  const removeBrowserModelCredential = async () => {
    if (checkingModel) return;
    setCheckingModel(true);
    setModelConnectionState("checking");
    setModelSettingsError("");
    try {
      const { response, data } = await modelSettingsRequest("/api/model-settings", { method: "DELETE" });
      if (!response.ok) throw new Error(data.error || "Could not remove the key");
      setModelApiKey("");
      setModelCredentialSource(null);
      setConnectedModel(null);
      const { response: statusResponse, data: status } = await modelSettingsRequest("/api/model-settings?verify=1");
      if (!statusResponse.ok) throw new Error(status.error || "model status unavailable");
      setModelConnectionState(status.configured ? "connected" : "unconfigured");
      setConnectedModel(status.model || null);
      setModelCredentialSource(status.source || null);
      setToast(locale === "zh" ? "当前浏览器保存的 API Key 已删除" : "The browser-stored API key was removed");
    } catch (error) {
      setModelConnectionState(modelConnectionFailureState(error));
      const problem = modelConnectionProblemCopy(modelConnectionFailureState(error), locale);
      setModelSettingsError(problem ? `${problem.title}。${problem.detail}` : (locale === "zh" ? "模型认证失败，请检查配置。" : "Model authentication failed. Check your settings."));
    } finally {
      setCheckingModel(false);
    }
  };

  const modelConnectionCopy = modelConnectionProblemCopy(modelConnectionState, locale) || (modelConnectionState === "connected"
    ? { title: t.connected, detail: modelDisplayName(connectedModel), modal: locale === "zh" ? "已验证" : "Verified" }
    : modelConnectionState === "checking"
      ? { title: locale === "zh" ? "AI 模型待检测" : "AI model check pending", detail: checkingModel ? (locale === "zh" ? "正在验证当前 Key" : "Verifying the current key") : (locale === "zh" ? "正在确认连接可用性" : "Confirming availability"), modal: checkingModel ? (locale === "zh" ? "检测中" : "Checking") : (locale === "zh" ? "待检测" : "Check pending") }
      : modelConnectionState === "invalid"
        ? { title: locale === "zh" ? "AI 模型认证失败" : "AI model authentication failed", detail: locale === "zh" ? "打开重新检测或更换 Key" : "Open to check or replace key", modal: locale === "zh" ? "认证失败" : "Authentication failed" }
        : { title: t.setupRequired, detail: locale === "zh" ? "打开配置" : "Open setup", modal: locale === "zh" ? "尚未连接" : "Not connected" });
  const credentialFailureRecovered = Boolean(modelConnectionState === "connected" && monitor?.status === "error" && isModelCredentialFailure(failedScanError));
  const closeModelSettings = () => {
    setModelSettingsOpen(false);
    setModelApiKey("");
    setModelSettingsError("");
  };
  const resumeAfterModelConnection = () => {
    closeModelSettings();
    window.setTimeout(() => void runManualMonitor(), 0);
  };
  const handleRouteAttention = () => {
    if (!routeAttention || !routeAttentionTrack) return;
    if (["today", "confirm_evidence"].includes(routeAttention.kind)) navigate("today");
    else if (routeAttention.kind === "evidence_gap") openThread(routeAttentionTrack, "gaps");
    else if (routeAttention.kind === "read_material") openThread(routeAttentionTrack, "evidence");
    else openThread(routeAttentionTrack);
  };

  const askVisible = askOpen && !importOpen && !feedbackPrompt && !modelSettingsOpen && !sourceSettingsOpen && !spaceDialog && !mobileNav;
  const activeDialogKind = askVisible && compactAsk ? "ask" : importOpen ? "import" : feedbackPrompt ? "feedback" : modelSettingsOpen ? "model" : sourceSettingsOpen ? "sources" : spaceDialog ? "space" : mobileNav ? "mobile" : null;
  useEffect(() => {
    if (!askVisible || compactAsk) return;
    const trigger = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".v2-ask-panel textarea")?.focus());
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setAskOpen(false); } };
    window.addEventListener("keydown", escape);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", escape); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [askVisible, compactAsk]);
  const closeActiveDialogRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    closeActiveDialogRef.current = () => {
    if (activeDialogKind === "ask") setAskOpen(false);
    else if (activeDialogKind === "import") { if (!analyzingImport && !savingImport) setImportOpen(false); }
    else if (activeDialogKind === "feedback") setFeedbackPrompt(null);
    else if (activeDialogKind === "model") { setModelSettingsOpen(false); setModelApiKey(""); setModelSettingsError(""); }
    else if (activeDialogKind === "sources") setSourceSettingsOpen(false);
    else if (activeDialogKind === "space") setSpaceDialog(false);
    else setMobileNav(false);
    };
  }, [activeDialogKind, analyzingImport, savingImport]);
  useEffect(() => {
    if (!activeDialogKind) return;
    const dialog = document.querySelector<HTMLElement>(`[data-pi-dialog='${activeDialogKind}']`);
    if (!dialog) return;
    return activateModalFocus(dialog, () => closeActiveDialogRef.current(), document.querySelector<HTMLElement>(".v2-mobile-menu"));
  }, [activeDialogKind]);

  if(!workspaceReady&&!workspaceLoadFailed)return <main className="pi-workspace-welcome"><header><div className="pi-welcome-brand"><span className="pi-welcome-mark" aria-hidden="true"/><strong>Pi Research</strong></div></header><section className="pi-welcome-layout" role="status"><div className="pi-welcome-heading"><h1>{locale==='zh'?'正在读取你的工作区':'Loading your workspace'}</h1><p>{locale==='zh'?'先核对访问身份与已有空间。':'Checking workspace access and saved spaces.'}</p></div></section></main>;
  if(workspaceReady&&workspaceEmpty)return <WorkspaceWelcome locale={locale} onLocale={setLocale} session={workspaceSession} demo={demo} deletedSpaces={deletedSpaces} onRestored={space=>changeSpaceList(space,false)} onCreated={space=>{setSpaces(current=>[...current,space]);setWorkspaceEmpty(false);switchSpace(space)}}/>;
  return (
    <div className="v2-app pi-workspace">
      <a className="pi-skip-link" href="#workspace-content" onClick={event => { event.preventDefault(); document.getElementById("workspace-content")?.focus(); }}>{locale === "zh" ? "跳到主要内容" : "Skip to content"}</a>
      <aside className={"v2-sidebar " + (mobileNav ? "open" : "")} data-pi-dialog={mobileNav ? "mobile" : undefined} role={mobileNav ? "dialog" : undefined} aria-modal={mobileNav ? true : undefined} aria-label={locale === "zh" ? "功能导航" : "Workspace navigation"} tabIndex={-1}>
        <div className="v2-logo"><span className="v2-product-mark"><Image src="/pi-research-mark.png" width={38} height={32} alt="Pi Research logo" priority /></span><div><strong>Pi Research</strong><small>RESEARCH AGENT</small></div><button type="button" aria-label={t.close} onClick={() => setMobileNav(false)}>×</button></div>
        <button className="v2-space-switch" type="button" onClick={() => { setMobileNav(false); setSpaceDialog(true); }}>
          <span className={"v2-space-avatar " + activeSpace.accent}>{initials(activeSpace.name)}</span>
          <span><small>{t.currentSpace}</small><strong>{defaultSpaceName(activeSpace.name, locale)}</strong><em>{activeSpace.memberName}</em></span>
          <b>⌄</b>
        </button>
        <nav className="v2-nav" aria-label="Primary navigation">
          <p>{t.researchRadar}</p>
          {navItems.slice(0, 2).map((item) => (
            <button type="button" key={item.id} className={activeNav === item.id ? "active" : ""} aria-current={activeNav === item.id ? "page" : undefined} onClick={() => navigatePrimary(item.id)}>
              <InterfaceIcon name={item.mark} />{item.label}{item.id === "today" && Boolean(todayNavigationCount) && <b>{Math.min(99, todayNavigationCount)}</b>}
            </button>
          ))}
          <p>{t.knowledge}</p>
          {navItems.slice(2).map((item) => (
            <button type="button" key={item.id} className={activeNav === item.id ? "active" : ""} aria-current={activeNav === item.id ? "page" : undefined} onClick={() => navigatePrimary(item.id)}>
              <InterfaceIcon name={item.mark} />{item.label}{item.id === "library" && Boolean(historyPapers.length) && <b title={locale === "zh" ? `${historyPapers.length} 篇已保存论文` : `${historyPapers.length} saved papers`}>{compactNavCount(monitor?.knownCount ?? historyPapers.length)}</b>}
            </button>
          ))}
        </nav>

        <div className="v2-sidebar-bottom">
          {demo ? <button type="button" className="v2-demo-entry" onClick={() => window.location.assign("/")}><InterfaceIcon name="workspace" /><strong>返回正式工作区</strong><b>↗</b></button> : <a className="v2-demo-entry" href="/demo"><InterfaceIcon name="demo" /><strong>{locale === "zh" ? "演示空间" : "Demo workspace"}</strong><b>↗</b></a>}
          <button className={`v2-openai-state ${modelConnectionState}`} type="button" onClick={() => { setMobileNav(false); setModelSettingsOpen(true); }} aria-label={locale === "zh" ? "打开 AI 模型设置" : "Open AI model settings"}><i /><span><strong>{demo ? (locale === "zh" ? "演示模式" : "Demo mode") : modelConnectionState === "connected" ? modelConnectionCopy.detail : modelConnectionCopy.title}</strong><small>{demo ? (locale === "zh" ? "查看模型设置" : "View model settings") : modelConnectionState === "connected" ? (locale === "zh" ? "模型设置 · 已连接" : "Model settings · Connected") : modelConnectionCopy.detail}</small></span><b>›</b></button>
          <button className="v2-account" type="button" onClick={() => { setMobileNav(false); setSpaceDialog(true); }}><InterfaceIcon name="workspace" /><span><strong>{locale === "zh" ? "管理研究空间" : "Manage workspaces"}</strong><small>{activeSpace.memberName}</small></span><b>→</b></button>
        </div>
      </aside>

      <div className="v2-main" id="workspace-content" tabIndex={-1}>
        {navigationIssue && <section className="pi-navigation-notice" role="alert" tabIndex={-1}><strong>{navigationIssue === "space" ? (locale === "zh" ? "这个链接属于另一个研究空间" : "This link belongs to another workspace") : navigationIssue === "missing" ? (locale === "zh" ? "暂时找不到这条研究路线" : "This research route is unavailable") : (locale === "zh" ? "论文暂时无法读取" : "This paper could not be loaded")}</strong><p>{navigationIssue === "space" ? (locale === "zh" ? "当前空间没有改变。仅能切换到你有权访问的空间。" : "Your current workspace is unchanged. You can switch only to an accessible workspace.") : (locale === "zh" ? "已有内容保留，你可以重试或返回当前空间。" : "Saved content is preserved. Retry or return to your workspace.")}</p>{navigationIssue === "space" ? spaces.some(space => space.id === requestedLocation?.space) && <button type="button" onClick={() => { const target = spaces.find(space => space.id === requestedLocation?.space); if (!target || !requestedLocation) return; const destination = workspaceHash(requestedLocation); switchSpace(target); window.history.replaceState(null, "", destination); requestLocationRestore(); }}>{locale === "zh" ? "切换并打开链接" : "Switch and open link"}</button> : <button type="button" onClick={() => { if (navigationIssue === "missing") navigate("threads"); else { if (requestedLocation) window.history.pushState(null, "", workspaceHash(requestedLocation)); requestLocationRestore(); } }}>{navigationIssue === "missing" ? (locale === "zh" ? "查看路线总览" : "View routes") : (locale === "zh" ? "重试" : "Retry")}</button>}<button type="button" onClick={() => navigate("today")}>{locale === "zh" ? "返回当前空间" : "Return to current workspace"}</button></section>}

        <header className="v2-topbar">
          <button className="v2-mobile-menu" type="button" aria-label="Menu" onClick={() => setMobileNav(true)}>≡</button>
          <div className="v2-breadcrumb"><span>{defaultSpaceName(activeSpace.name, locale)}</span><b>/</b><strong>{navItems.find((item) => item.id === activeNav)?.label}</strong>{["paper-detail", "thread-detail", "workbook"].includes(view) && <><b>/</b><span className="pi-breadcrumb-detail">{view === "paper-detail" ? (locale === "zh" ? "论文详情" : "Paper details") : view === "workbook" ? (locale === "zh" ? "论文比较" : "Paper comparison") : (locale === "zh" ? selectedThread?.titleZh : selectedThread?.titleEn)}</span></>}</div>
          <div className="v2-top-actions">
            <button className="v2-ask-trigger v2-command-trigger" type="button" aria-label={t.askPi} title={`${t.askPi} · Ctrl+K / ⌘K`} onClick={openContextualAsk}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M8 9h8M8 13h5"/></svg><span className="v2-command-copy"><strong>{t.askPi}</strong></span></button>
            {pendingActionNotifications.length > 0 && <button className="v2-alert-link" type="button" aria-label={`${locale === "zh" ? "待处理研究提醒" : "Pending research alerts"}: ${pendingActionNotifications.length}`} onClick={() => { navigate("today"); openTodaySurface("records"); setNotificationsExpanded(false); window.setTimeout(() => document.querySelector(".v2-action-inbox")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg><span>{locale === "zh" ? "提醒" : "Alerts"}</span><b>{pendingActionNotifications.length > 99 ? "99+" : pendingActionNotifications.length}</b></button>}
            <div className="v2-language" role="group" aria-label={locale === "zh" ? "界面语言" : "Interface language"}><button className={locale === "zh" ? "active" : ""} aria-pressed={locale === "zh"} type="button" onClick={() => setLocale("zh")}>中文</button><button className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} type="button" onClick={() => setLocale("en")}>EN</button></div>
          </div>
        </header>

        {view === "today" && (
          <main className={`v2-page v2-today pi-editorial-today pi-focus-today pi-today-${todaySurface}`}>

            {monitorReadNotice}
            <section className="pi-home-heading">
              <div><h1>{locale==="zh"?({home:"今日",reading:"全部阅读",discovery:"发现进度",records:"研究记录",settings:"今日设置"}[todaySurface]):({home:"Today",reading:"All reading",discovery:"Discovery",records:"Research records",settings:"Today settings"}[todaySurface])}</h1><p>{formatTodayDate(locale)}</p></div>
            </section>
            <nav className="pi-today-navigation" aria-label={locale==="zh"?"今日页面导航":"Today navigation"}><div className="pi-today-tabs">{(["home","reading","discovery","records"] as const).map(surface=><a href={workspaceHash({view:"today",space:activeSpace.id,panel:surface})} key={surface} aria-current={todaySurface===surface?"page":undefined} className={todaySurface===surface?"is-active":""}>{locale==="zh"?({home:"今日精选",reading:"全部阅读",discovery:"发现进度",records:"研究记录"}[surface]):({home:"For you",reading:"All reading",discovery:"Discovery",records:"Records"}[surface])}</a>)}</div><a href={workspaceHash({view:"today",space:activeSpace.id,panel:"settings"})} className="pi-today-settings" aria-current={todaySurface==="settings"?"page":undefined} aria-label={locale==="zh"?"今日设置":"Today settings"}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg><span>{locale==="zh"?"设置":"Settings"}</span></a></nav>

            {todaySurface==="home"&&!demo&&!workspaceLoadFailed&&<TodayContinuation key={`${user.userId}:${activeSpace.id}`} userId={user.userId} spaceId={activeSpace.id} locale={locale} onResume={hash=>{navigationScroll.current.set(window.location.hash,window.scrollY);window.location.hash=hash;setMobileNav(false);}}/>}
            {todaySurface==="home"&&!demo&&<TodayDiscoveryStatus state={scanIsActive?"running":monitor?.status==="error"?"error":"idle"} hasReading={Boolean(resumePaper || currentQuestionReadingIds.length || dailyBriefPapers.length || additionalTodayPapers.length)} phase={baseScanPhase} discovered={activeScanJob?.discoveredCount} screened={activeScanJob?.reviewedCount} locale={locale} href={workspaceHash({view:"today",space:activeSpace.id,panel:"discovery",focus:monitor?.status==="error"?"recovery":undefined})}/>}


            {["home","reading","discovery"].includes(todaySurface) && !workspaceLoadFailed && (activeSpaceSupportsLearning||todaySurface==="home") && <DeferredWorkspacePanel locale={locale}><ResearchEntry fieldDescription={activeSpace.description} bibliography={historyPapers} taskBrief={taskBriefState.brief} taskBriefError={taskBriefState.error} overview={monitorLoadFailed?null:taskBriefState.brief?taskBriefOverview(taskBriefState.brief,locale):digestOverview(monitor?.dailyBrief,historyPapers,locale)} searchPapers={monitorLoadFailed?[]:historyPapers} briefDate={monitor?.dailyBrief?.date} onLibrary={()=>{setLibraryFilter("all");setLibraryStageFilter("all");setLibrarySearch("");setLibraryPageNumber(1);navigate("library",undefined,{libraryQuery:undefined,libraryFilter:undefined,libraryStage:undefined,libraryInbox:undefined,librarySort:undefined,libraryTag:undefined,libraryPage:undefined});}} mode={todaySurface as "home"|"reading"|"discovery"} onAll={()=>openTodaySurface("reading")} fallbackPapers={fieldBriefReading([...dailyBriefPapers,...rankedMonitorPapers,...historyPapers],excludedReadingIds,8).map(p=>({id:p.id,title:p.title,whyZh:p.whyReadZh||"",whyEn:p.whyReadEn||"",focusZh:"",focusEn:"",checkZh:"",checkEn:""}))} key={`entry:${activeSpace.id}`} spaceId={activeSpace.id} spaceName={activeSpace.name} locale={locale} demo={demo} resume={monitor && !monitorLoadFailed ? resumePaper : null} onProgress={() => openTodaySurface("discovery")} excludedReadingIds={excludedReadingIds} refreshKey={`${monitor?.status}:${monitor?.lastRunAt}:${monitor?.newCount}:${readingQueueKey}`} scanStatus={scanIsActive ? scanPhase : monitor?.status === "error" ? monitorFailureMessage(failedScanError, locale) : ""} blocked={!monitor || monitorLoadFailed ? (locale === "zh" ? "先载入空间内容，再开始检索。" : "Load workspace content before searching.") : scanIsActive ? (locale === "zh" ? "当前扫描进行中，新问题用于后续新扫描。" : "A scan is running; the new question applies to a future new scan.") : analysisBudgetBlocked ? (locale === "zh" ? "今日额度已用完，问题已保留。" : "Today's budget is exhausted; your question is saved.") : manualCooldownBlocked ? (locale === "zh" ? "扫描暂在冷却期，稍后可继续。" : "Discovery is cooling down; continue later.") : resumeAvailable ? (locale === "zh" ? "当前有待恢复的扫描，请先在下方从断点继续；新问题用于之后的新扫描。" : "Resume the saved scan below first. The new question applies to a subsequent new scan.") : ""} onDiscover={() => void runManualMonitor()} onRead={id => void openRoutePaper(id, "today")} onReadingList={ids=>setQuestionReadingIds(current=>current.spaceId===activeSpace.id && current.ids.join("|")===ids.join("|") ? current : {spaceId:activeSpace.id,ids})} onSaved={() => { setLibraryRevision(n=>n+1); void readResearchMapState(activeSpace.id).then(data => { if(paperNetworkSpaceRef.current === activeSpace.id)setResearchMap(data); }).catch(() => {}); }} onRoute={id => { const track=researchMap.tracks.find(t=>t.id===id); if(track)openThread(track); else navigate("threads"); }} /></DeferredWorkspacePanel>}
            {todaySurface==="reading"&&<>
            {monitor?.dailyBrief && <section className={`v2-ai-daily-brief ${monitor.dailyBrief.status}`}>
              <div className="v2-daily-brief-lead">
                <header><div><p className="v2-kicker">{monitor.dailyBrief.date}</p><h2>{demo ? (locale === "zh" ? "示例研究简报" : "Sample research brief") : monitor.dailyBrief.isCurrent ? (locale === "zh" ? "今日研究简报" : "Today’s research brief") : (locale === "zh" ? "最近研究简报" : "Latest research brief")}</h2></div><span>{nextBriefEntries.length} {demo ? (locale === "zh" ? "篇样例" : "sample papers") : (locale === "zh" ? "篇入选" : "selected")}</span></header>
                {monitor.dailyBrief.model !== "evidence-summary" && <p className="pi-brief-editorial-headline">{datedBriefText(locale === "zh" ? monitor.dailyBrief.headlineZh : monitor.dailyBrief.headlineEn, monitor.dailyBrief)}</p>}
                <details className="pi-brief-context"><summary>{locale === "zh" ? "简报说明与研判依据" : "Brief context & assessment"}</summary><p className="v2-daily-brief-overview">{datedBriefText(locale === "zh" ? monitor.dailyBrief.overviewZh : monitor.dailyBrief.overviewEn, monitor.dailyBrief)}</p>{!monitor.dailyBrief.isCurrent && <p>{locale === "zh" ? "历史简报，不计入今日数量。" : "An earlier brief; excluded from today’s count."}</p>}</details>
                {Boolean(dailyBriefPapers.length) && <footer><button className="secondary" type="button" onClick={() => shareSnapshot("daily", dailyBriefPapers)} disabled={Boolean(sharingSnapshot)}>{sharingSnapshot === "daily" ? t.creatingShare : t.shareDaily}</button></footer>}
              </div>
              <div className={`v2-daily-paper-queue ${!dailyBriefEntryCount && featuredBriefCount ? "pi-brief-fully-featured" : ""}`}>
                {featuredBriefCount > 0 && <p className="pi-brief-featured-note">{locale === "zh" ? `${featuredBriefCount} 篇已列在上方阅读区` : `${featuredBriefCount} papers already shown above`}</p>}
                <header><div><strong>{featuredReadingIds.length ? (locale === "zh" ? "其他入选文献" : "Other selected papers") : monitor.dailyBrief.isCurrent ? (locale === "zh" ? "今日入选" : "Selected today") : (locale === "zh" ? `${monitor.dailyBrief.date} 入选` : `Selected on ${monitor.dailyBrief.date}`)}</strong><small>{locale === "zh" ? `显示 ${dailyBriefEntryCount} / ${remainingBrief.length} 篇 · 按阅读优先级排序` : `Showing ${dailyBriefEntryCount} / ${remainingBrief.length} · Reading priority`}</small></div><span>{dailyBriefEntryCount} {locale === "zh" ? "篇" : "papers"}</span></header>
                {Boolean(dailyBriefEntryCount) && <div className="v2-daily-freshness-summary"><span className="days">{locale === "zh" ? "近 14 天新论文" : "New · 14 days"} <b>{dailyFreshnessCounts.days}</b></span><span className="months">{locale === "zh" ? "近期优质" : "Recent quality"} <b>{dailyFreshnessCounts.months}</b></span><span className="years">{locale === "zh" ? "核心补读" : "Core catch-up"} <b>{dailyFreshnessCounts.years}</b></span></div>}
                <div className="v2-daily-brief-list">
                  {visibleBriefEntries.map(({ paper, briefIndex }, index) => {
                    const signal = dailySignals[briefIndex];
                    const readingAction = dailyReadingPlan[briefIndex];
                    return <details key={paper?.id || `${index}:${signal || readingAction}`}>
                      <summary><span>{String(index + 1).padStart(2, "0")}</span><div>{paper && <div className="v2-daily-paper-flags"><i className={`v2-tier-badge ${paper.recommendationTier || "browse"}`}>{recommendationTierLabel(paper.recommendationTier || "browse", locale)}</i><PaperFreshnessBadge paper={paper} locale={locale} /><PaperDiscoverySourceBadge paper={paper} locale={locale} /></div>}<h3>{paper ? <button className="pi-paper-title-link" type="button" onClick={event => { event.preventDefault(); openMonitorPaper(paper); }}><MathText inline>{paper.title}</MathText></button> : (locale === "zh" ? `第 ${index + 1} 篇入选论文` : `Selected paper ${index + 1}`)}</h3>{(signal || (paper && (locale === "zh" ? paper.whyReadZh : paper.whyReadEn))) && <p className="pi-news-standfirst"><MathText inline>{signal || (locale === "zh" ? paper!.whyReadZh : paper!.whyReadEn)}</MathText></p>}{paper && <><p className="v2-daily-paper-authors"><span>{paper.authors || (locale === "zh" ? "作者信息未提供" : "Authors unavailable")}</span></p><div className="v2-daily-paper-publication"><span>{formatPaperDate(paper.publishedAt, locale)}</span><span>{paper.venue || (locale === "zh" ? "来源待核对" : "Source pending")}</span><span>{paper.citationCount || 0} {locale === "zh" ? "被引" : "citations"}</span><span>{paper.readMinutes || 15} {locale === "zh" ? "分钟" : "min"}</span></div></>}</div><b aria-hidden="true">＋</b></summary>
                      <div className="v2-daily-paper-analysis">{paper && <RecommendationMemoryLink locale={locale} example={demo ? paper.demoReadingContext : null} onPaper={id => void openRoutePaper(id, "today")} onMemory={() => void openRecommendationMemory()} />}{paper?.researchProblemId && <section className="research-problem-impact"><strong>{locale === "zh" ? "对当前研究问题的影响" : "Impact on the active problem"}</strong><p>{locale === "zh" ? paper.researchProblemImpactZh : paper.researchProblemImpactEn}</p><small>{locale === "zh" ? "读后需要判断" : "Decision after reading"}</small><b>{locale === "zh" ? paper.researchDecisionZh : paper.researchDecisionEn}</b></section>}{paper && <RouteImpactNote paper={paper} locale={locale} />}{signal && <section><strong>{locale === "zh" ? "它带来了什么" : "What changed"}</strong><p>{signal}</p></section>}{readingAction && <section><strong>{locale === "zh" ? "建议怎么读" : "How to read it"}</strong><p>{readingAction}</p></section>}{paper && <footer><button type="button" onClick={() => openMonitorPaper(paper)}>{locale === "zh" ? "查看解读" : "Open analysis"} →</button><button className="positive" type="button" onClick={() => requestPaperDecision(paper, "relevant")}>✓ {locale === "zh" ? "适合" : "Useful"}</button><button type="button" onClick={() => requestPaperDecision(paper, "not_relevant")}>× {locale === "zh" ? "不相关" : "Not relevant"}</button><button type="button" onClick={() => saveFeedback(paper, "not_relevant", "duplicate_known")}><InterfaceIcon name="check" /> {locale === "zh" ? "已掌握" : "Mastered"}</button><button type="button" onClick={() => saveFeedback(paper, "later")}>◷ {locale === "zh" ? "稍后" : "Later"}</button></footer>}</div>
                    </details>;
                  })}
                </div>
                {!dailyBriefEntryCount && !featuredBriefCount && dailyBriefEntries.some(entry => isReadReference(entry.paper)) && <div className="v2-daily-zero-state"><strong>{locale === "zh" ? "本期材料已读完" : "This brief’s papers are already read"}</strong><p>{locale === "zh" ? "可在下方已读参考中回看原文与笔记。" : "Revisit them with your notes in Read references below."}</p></div>}
                {!dailyBriefEntryCount && !featuredBriefCount && !dailyBriefEntries.some(entry => isReadReference(entry.paper)) && <div className="v2-daily-zero-state"><strong>{dailyBriefPaperIds.size ? (locale === "zh" ? "论文详情暂未加载" : "Paper details unavailable") : (locale === "zh" ? "本简报暂无入选" : "No selections in this brief")}</strong><p>{dailyBriefPaperIds.size ? (locale === "zh" ? "已保留入选记录，请稍后刷新查看。" : "Selections are preserved. Refresh to load their details.") : locale === "zh" ? `${latestQuickScreenedCount} 篇完成初筛，${latestDeepReviewedCount} 篇完成深评${latestDeepDeferredCount ? `，${latestDeepDeferredCount} 篇延后` : ""}；暂无论文通过全部质量门槛。` : `${latestQuickScreenedCount} screened, ${latestDeepReviewedCount} deeply reviewed${latestDeepDeferredCount ? `, ${latestDeepDeferredCount} deferred` : ""}; none cleared every quality gate.`}</p></div>}
                {Boolean(briefRunStatus(monitor.dailyBrief, locale).length) && <details className="pi-processing-details"><summary>{locale === "zh" ? "简报处理记录" : "Brief processing record"}</summary><aside><strong>{locale === "zh" ? `${monitor.dailyBrief.date} 简报保存时状态（末批）` : `${monitor.dailyBrief.date} status when saved (last run)`}</strong><ul>{briefRunStatus(monitor.dailyBrief, locale).map((item) => <li key={item}>{item}</li>)}</ul></aside></details>}
              </div>
            </section>}

            {Boolean(additionalTodayPapers.length) && <section className="v2-today-more pi-unread-recommendations">
              <header className="pi-unread-heading"><div><h2>{featuredReadingIds.length ? (locale === "zh" ? "其他值得读的文献" : "More worthwhile reading") : (locale === "zh" ? "推荐阅读" : "Recommended reading")}</h2><p>{demo ? (locale === "zh" ? "延伸阅读样例，未执行推荐评审" : "Further reading samples, not reviewed recommendations") : (locale === "zh" ? "已通过评审，留给你继续阅读" : "Reviewed papers to continue reading")}</p></div><span>{additionalTodayPapers.length} {locale === "zh" ? "篇未读" : "unread"}</span></header>
              {monitor?.dailyBrief?.isCurrent && !dailyBriefPaperIds.size && <p className="pi-reading-date-note">{locale === "zh" ? `${monitor.dailyBrief.date} 简报没有新增推荐，以下保留此前的未读推荐。` : `No new selections in the ${monitor.dailyBrief.date} brief. Your unread recommendations remain below.`}</p>}
              <div className="pi-reading-list">{additionalTodayPapers.map((paper) => {
                const reason = locale === "zh" ? paper.whyReadZh : paper.whyReadEn;
                return <article key={paper.id} data-paper-impression={paper.id}>
                  <div className="pi-reading-meta"><span>{recommendationTierLabel(paper.recommendationTier || "browse", locale)}</span><span>{paper.readMinutes || 15} min</span>{paper.recommendedAt && <span>{locale === "zh" ? "推荐于 " : "Recommended "}{formatPaperDate(paper.recommendedAt, locale)}</span>}</div>
                  <h3><button type="button" onClick={() => openMonitorPaper(paper)}><MathText inline>{paper.title}</MathText></button></h3>
                  <p className="pi-reading-bibliography">{paper.authors}{paper.publishedAt && <> · {formatPaperDate(paper.publishedAt, locale)}</>}</p>
                  {reason && <p className="pi-reading-reason"><MathText>{reason}</MathText></p>}<RecommendationMemoryLink locale={locale} example={demo ? paper.demoReadingContext : null} onPaper={id => void openRoutePaper(id, "today")} onMemory={() => void openRecommendationMemory()} />
                  <footer><details><summary>{locale === "zh" ? "来源与评审" : "Sources & review"}</summary><div><PaperFreshnessBadge paper={paper} locale={locale} /><PaperDiscoverySourceBadge paper={paper} locale={locale} /><RecommendationVerificationBadge paper={paper} locale={locale} /><RouteDiscoveryBadge paper={paper} locale={locale} /></div></details><button type="button" onClick={() => openMonitorPaper(paper)}>{locale === "zh" ? "阅读与笔记" : "Read & take notes"} →</button></footer>
                </article>;
              })}</div>
            </section>}

            {readReferencePapers.length > 0 && <section className="pi-read-references" aria-label={locale === "zh" ? "已读参考" : "Read references"}>
              <header><h2>{locale === "zh" ? "已读参考" : "Read references"}</h2><p>{locale === "zh" ? "回看已有知识，继续核对与比较。" : "Revisit familiar work for checks and comparisons."}</p></header>
              {readReferencePapers.map(paper => <article key={paper.id}><div><button type="button" onClick={() => openMonitorPaper(paper)}><MathText inline>{paper.title}</MathText></button><p>{readingStatusLabel(paper.readingStatus, locale)}{paper.authors ? ` · ${paper.authors}` : ""}</p></div><button type="button" onClick={() => openMonitorPaper(paper)}>{locale === "zh" ? "回看与笔记" : "Revisit & notes"} →</button></article>)}
            </section>}

            </>}
            {todaySurface==="reading" && demo && <DemoJourney view={view} locale={locale} space={activeSpace.id} />}
            {todaySurface==="records" && !workspaceLoadFailed && activeSpaceSupportsLearning && <DeferredWorkspacePanel locale={locale}><ReadingCalendar key={`calendar:${activeSpace.id}`} spaceId={activeSpace.id} locale={locale} onPaper={id => void openRoutePaper(id, "today")} /></DeferredWorkspacePanel>}
            {todaySurface==="reading" && historyPapers.length > 0 && !activeSpace.id.startsWith("space-") && !activeSpace.id.startsWith("local-") && <DeferredWorkspacePanel locale={locale}><ResearchStart key={activeSpace.id} spaceId={activeSpace.id} locale={locale} onRead={id => void openRoutePaper(id, "today")} onStart={startRecommendedResearch} /></DeferredWorkspacePanel>}

            {todaySurface==="discovery"&&<QualityReviewStatus monitor={monitor} locale={locale} phase={scanPhase} failureMessage={monitorFailureMessage(failedScanError, locale)} formatTime={formatMonitorDate} onOpenPaper={id => void openRoutePaper(id, "today")} onContinueReview={() => void runManualMonitor(true)} reviewDisabled={demo || !monitor || scanIsActive || monitoring || analysisBudgetBlocked} />}
            {todaySurface==="settings" && !workspaceLoadFailed && activeSpaceSupportsLearning && <ResearchMaintenance key={`maintenance:${activeSpace.id}`} spaceId={activeSpace.id} locale={locale} />}
            {todaySurface==="settings" && !workspaceLoadFailed && activeSpaceSupportsLearning && <EmailSubscription key={`email:${activeSpace.id}`} spaceId={activeSpace.id} locale={locale} />}

            {todaySurface==="records" && monitor?.weeklyReview && <details className={`v2-weekly-review ${monitor.weeklyReview.status}`}>
              <summary><span><p className="v2-kicker">7D {locale === "zh" ? "阶段研究回顾" : "RESEARCH REVIEW"}</p><strong>{locale === "zh" ? monitor.weeklyReview.titleZh : monitor.weeklyReview.titleEn}</strong><small>{locale === "zh" ? `来自 ${monitor.weeklyReview.sourceDays} 天真实记录` : `Based on ${monitor.weeklyReview.sourceDays} days of real activity`}</small></span><b>＋</b></summary>
              <div className="v2-weekly-review-body"><p>{locale === "zh" ? monitor.weeklyReview.overviewZh : monitor.weeklyReview.overviewEn}</p><div><article><h3>{locale === "zh" ? "已经获得" : "What advanced"}</h3><ul>{(locale === "zh" ? monitor.weeklyReview.gainsZh : monitor.weeklyReview.gainsEn).map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>{locale === "zh" ? "仍有缺口" : "Remaining gaps"}</h3><ul>{(locale === "zh" ? monitor.weeklyReview.gapsZh : monitor.weeklyReview.gapsEn).map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>{locale === "zh" ? "下一步行动" : "Next moves"}</h3><ol>{(locale === "zh" ? monitor.weeklyReview.nextStepsZh : monitor.weeklyReview.nextStepsEn).map((item) => <li key={item}>{item}</li>)}</ol></article></div></div>
            </details>}

            <div className="v2-research-utilities">
            {todaySurface==="discovery"&&<section className="v2-monitor-panel v2-monitor-compact">
              <div className="v2-monitor-head">
                <div className="v2-monitor-intro"><p className="v2-kicker">{locale === "zh" ? "论文发现" : "PAPER DISCOVERY"}</p><h2>{locale === "zh" ? "论文扫描" : "Paper scan"}</h2><p>{locale === "zh" ? "近 14 天 · 近 6 个月 · 近 5 年" : "14 days · 6 months · 5 years"}</p></div>
                <div className="v2-monitor-actions">
                  <span className={"v2-monitor-status " + (scanIsActive ? "scanning" : monitor?.status || "idle")}><i />{!monitor ? (locale === "zh" ? "正在读取已有内容" : "Loading saved content") : scanIsActive ? scanPhase : monitor?.status === "error" ? t.scanError : monitor?.status === "ready" ? monitorReadyLabel : t.neverScanned}</span>
                  <button className="secondary" type="button" onClick={openSourceSettings} disabled={!monitor?.preferences || scanIsActive}>{t.editSources}</button>
<button type="button" onClick={() => void runManualMonitor()} title={demo ? "演示不执行扫描" : undefined} disabled={demo || !monitor || scanIsActive || analysisBudgetBlocked || manualCooldownBlocked}>{scanIsActive ? `${t.scanningButton} ${scanProgressLabel}` : analysisBudgetBlocked ? (locale === "zh" ? "明日额度刷新后继续" : "Resume after tomorrow's reset") : manualCooldownBlocked ? (locale === "zh" ? `约 ${monitor?.retryAfterMinutes || 1} 分钟后可再扫描` : `Scan again in about ${monitor?.retryAfterMinutes || 1} min`) : resumeAvailable ? (locale === "zh" ? "从断点继续" : "Resume") : compactScanAvailable ? (locale === "zh" ? "扫描近 14 天" : "Scan latest 14 days") : monitor?.scanJob?.needsRefresh ? (locale === "zh" ? "用新版重新扫描" : "Rescan with new method") : t.scanNow}</button>
                </div>
              </div>
              {analysisBudgetBlocked && !scanIsActive && <div className="v2-scan-budget-note"><InterfaceIcon name="clock" /><p>{locale === "zh" ? "今天的完整扫描额度已用完；Pi 会在刷新后继续，现有论文、偏好与断点均已保留。" : "Today's full-scan budget is exhausted. Pi will continue after the reset; papers, preferences, and checkpoints are preserved."}</p></div>}
              {backgroundAutomationDeferred && !analysisBudgetBlocked && <div className="v2-scan-budget-note" role="status"><InterfaceIcon name="clock" /><p>{locale === "zh" ? "无人操作的后台扫描已待机以控制费用；你现在仍可手动扫描，已有候选、论文与进度都会保留。" : "Unattended background scanning is on standby to control cost. You can still scan manually now, and existing candidates, papers, and progress are preserved."}</p></div>}
              {compactScanAvailable && !manualCooldownBlocked && <div className="v2-scan-budget-note" role="status"><span>↗</span><p>{locale === "zh" ? "今天适合先看最新变化：本轮只扫描近 14 天并完成最多 2 篇严格判断；半年和五年窗口会在额度刷新后自动继续，论文与偏好不会丢失。" : "Start with the newest changes today: this pass scans the latest 14 days and strictly evaluates up to two papers. Six-month and five-year horizons continue after the reset, with papers and preferences preserved."}</p></div>}
              {manualCooldownBlocked && !scanIsActive && <div className="v2-scan-cooldown-note" role="status"><InterfaceIcon name="clock" /><div><strong>{locale === "zh" ? "刚才没有启动重复扫描" : "A duplicate scan was not started"}</strong><p>{locale === "zh" ? `上次扫描仍在费用保护期，约 ${monitor?.retryAfterMinutes || 1} 分钟后可再次运行；现有推荐、论文库和进度都没有变化。` : `The previous scan is still inside its cost-protection window. Try again in about ${monitor?.retryAfterMinutes || 1} minutes; recommendations, library papers, and progress remain unchanged.`}</p></div></div>}
              {monitor?.scanJob?.needsRefresh && !scanIsActive && !compactScanAvailable && <div className="v2-scan-upgrade-note"><InterfaceIcon name="refresh" className="pi-state-mark" /><div><strong>{locale === "zh" ? "当前结果来自旧版筛选方法" : "These results use the previous screening method"}</strong><p>{locale === "zh" ? "新版会先完成近 14 天新论文的优先判断，再继续半年与五年补读；按研究方向保留名额，质量门槛不变。此次升级重扫不受本小时冷却限制。" : "The new method decides on papers from the latest 14 days first, then continues with six-month and five-year catch-up. Research directions keep protected slots and the quality gate is unchanged. This upgrade rescan bypasses the hourly cooldown."}</p></div></div>}
              {monitor?.status === "error" && credentialFailureRecovered && (
                <div className="v2-scan-credential-restored" role="status"><span>✓</span><div><strong>{locale === "zh" ? "模型连接已恢复，扫描断点仍在" : "Model connection restored; checkpoint preserved"}</strong><p>{locale === "zh" ? "无需重新检索候选；使用上方“从断点继续”即可恢复。" : "Candidates will not be retrieved again; use Resume above to continue."}</p></div></div>
              )}
              {monitor?.status === "error" && !credentialFailureRecovered && (
                <details id="discovery-recovery" className={`v2-scan-failure ${isModelCredentialFailure(failedScanError) ? "credential" : ""}`} role="alert">
                  <summary>
                    <span>!</span>
                    <strong>{locale === "zh" ? "扫描暂停，进度已保存" : "Scan paused; progress saved"}</strong>
                    {failedScanJob && <small>{locale === "zh"
                      ? `${failedScanJob.discoveredCount || 0} 候选 · ${failedScanJob.reviewedCount || 0}/${failedScanJob.candidateCount || 0} 已筛选`
                      : `${failedScanJob.discoveredCount || 0} candidates · ${failedScanJob.reviewedCount || 0}/${failedScanJob.candidateCount || 0} screened`}</small>}
                    <b>{locale === "zh" ? "查看原因" : "Details"}<i>＋</i></b>
                  </summary>
                  <div>
                    <p>{monitorFailureMessage(failedScanError, locale)}</p>
                    {failedScanJob?.nextRetryAt && <small>{locale === "zh"
                      ? `Pi 会在 ${formatMonitorDate(failedScanJob.nextRetryAt, locale)} 后自动重试；也可以稍后手动从断点继续。`
                      : `Pi will retry automatically after ${formatMonitorDate(failedScanJob.nextRetryAt, locale)}; you can also resume the checkpoint later.`}</small>}
                    {isModelCredentialFailure(failedScanError) && <button className="secondary" type="button" onClick={() => { setModelSettingsError(monitorFailureMessage(failedScanError, locale)); setModelSettingsOpen(true); }}>{locale === "zh" ? "检查 Key" : "Check key"}</button>}
                  </div>
                </details>
              )}
              {scanIsActive && (
                <div className="v2-scan-progress" role="status" aria-live="polite" aria-label={`${scanPhase} ${scanProgressLabel}`}>
                  <div><span>{scanPhase}</span><strong>{scanProgressLabel}</strong></div>
                  <i><b style={{ width: `${scanProgress}%` }} /></i>
                  <small>
                    {activeScanJob?.discoveredCount || 0} {locale === "zh" ? "条候选" : "candidates"}
                    {["screening", "deep_reviewing", "reviewing"].includes(effectiveScanStatus) && <> · {activeScanJob?.reviewedCount || 0}{activeScanJob?.candidateCount ? ` / ${activeScanJob.candidateCount}` : ""} {locale === "zh" ? "篇已筛选保存" : "screened and saved"}</>}
                    {effectiveScanStatus === "deep_reviewing" && !verificationInProgress && <> · {activeScanJob?.deepCompletedCount || 0} {locale === "zh" ? "篇深度解读已保存" : "deep interpretations saved"}</>}
                    {verificationInProgress && <> · {activeScanJob?.verificationCompletedCount || 0} / {activeScanJob?.verificationTargetCount || 0} {locale === "zh" ? "篇证据已核对" : "evidence checks complete"}</>}
                    {verificationInProgress && Boolean(activeScanJob?.verificationPendingCount) && <> · {activeScanJob?.verificationPendingCount} {locale === "zh" ? "篇待处理" : "remaining"}</>}
                    {effectiveScanStatus === "deep_reviewing" && Boolean(activeScanJob?.deepDeferredCount) && <> · {activeScanJob?.deepDeferredCount} {locale === "zh" ? "篇已延后，不阻塞本轮" : "deferred without blocking this scan"}</>}
                    {healthyCoverageCount > 0 && <> · {healthyCoverageCount} {locale === "zh" ? "类来源正常" : "source groups healthy"}</>}
                    {displayScanElapsedSeconds > 0 && <> · {displayScanElapsedSeconds < 60 ? `${displayScanElapsedSeconds}s` : `${Math.floor(displayScanElapsedSeconds / 60)}m ${displayScanElapsedSeconds % 60}s`}</>}
                    {locale === "zh" ? " · 上次推荐仍可继续阅读" : " · Previous recommendations remain readable"}
                  </small>
                  {["screening", "deep_reviewing"].includes(effectiveScanStatus) && <em className="v2-resume-note">✓ {locale === "zh" ? "每完成一批就会立即保存；推荐出现后可先阅读，无需等待整轮结束" : "Each completed batch is saved immediately. You can start reading before the full scan finishes."}</em>}
                  {activeScanJob?.resumeOfJobId && <em className="v2-resume-note">↻ {locale === "zh" ? `正在从已保存检查点续跑 · 第 ${activeScanJob.attempt || 2} 次尝试` : `Resuming from a saved checkpoint · attempt ${activeScanJob.attempt || 2}`}</em>}
                  {restoredOldScan && !activeScanJob?.resumeOfJobId && <em className="v2-resume-note">↻ {locale === "zh" ? "已从旧任务的保存断点恢复，不沿用中断期间的耗时" : "Restored from an older checkpoint; inactive time is not counted."}</em>}
                </div>
              )}
              <div className="v2-monitor-meta"><button className="v2-inbox-summary" type="button" onClick={() => { setLibraryFilter("inbox"); setLibraryStageFilter("all"); setInboxFilter("all");setLibraryPageNumber(1); navigate("library",undefined,{libraryFilter:'inbox',libraryStage:undefined,libraryInbox:undefined,libraryPage:undefined}); }}><span>{monitor?.historyCounts?.inbox || 0} {locale === "zh" ? "篇待你查看" : "papers for you to review"}</span><small>{monitor?.historyCounts?.unseen || 0} {t.unseen} · {locale === "zh" ? "未处理内容会保留" : "Unresolved papers stay here"}</small><b>→</b></button>
              <details className="v2-scan-details">
                <summary>{locale === "zh" ? "扫描范围与来源" : "Scan scope & sources"}<b>＋</b></summary>
                <p>{monitor?.scanJob ? (locale === "zh" ? "最近任务" : "Latest task") : (locale === "zh" ? "本简报" : "This brief")}</p><dl className="v2-monitor-run-funnel"><div><dt>{locale === "zh" ? "候选" : "Candidates"}</dt><dd>{runFunnel.scanned ?? "—"}</dd></div><div><dt>{locale === "zh" ? "筛选" : "Screened"}</dt><dd>{runFunnel.screened ?? "—"}</dd></div><div><dt>{locale === "zh" ? "深评" : "Deep review"}</dt><dd>{runFunnel.deepReviewed ?? "—"}</dd></div><div><dt>{locale === "zh" ? "入选" : "Selected"}</dt><dd>{runFunnel.recommended ?? "—"}</dd></div></dl>
                <div className="v2-horizon-strip" aria-label={locale === "zh" ? "本轮三个时间窗的实际检索状态" : "Actual retrieval status for the three horizons"}>
                  {scanHorizonStats.map((item) => {
                    const label = item.horizon === "days" ? t.daysHorizon : item.horizon === "months" ? t.monthsHorizon : t.yearsHorizon;
                    const purpose = item.horizon === "days"
                      ? (locale === "zh" ? "捕捉最新变化" : "Newest changes")
                      : item.horizon === "months" ? (locale === "zh" ? "新且质量高" : "Recent and high quality")
                        : (locale === "zh" ? "核心、代表性成果" : "Durable representative work");
                    const statusLabel = item.status === "searching" ? (locale === "zh" ? "检索中" : "Searching") : item.status === "complete" ? (locale === "zh" ? "已检索" : "Searched") : (locale === "zh" ? "待检索" : "Pending");
                    return <article className={item.status} key={item.horizon}><header><span><i />{label}</span><b>{statusLabel}</b></header><strong>{item.candidates === null ? purpose : `${item.candidates} ${locale === "zh" ? "篇候选" : "candidates"}`}</strong><small>{item.candidates === null ? (locale === "zh" ? "下次扫描会显示实际候选和入筛数量" : "The next scan will show retrieved and queued counts") : (locale === "zh" ? `${item.newCandidates || 0} 篇本轮新发现 · ${item.queued || 0} 篇进入筛选` : `${item.newCandidates || 0} new this run · ${item.queued || 0} queued`)}</small></article>;
                  })}
                </div>
                <div className="v2-source-profile"><div><span>{t.detectedDomain}</span><strong>{locale === "zh" ? monitor?.preferences?.profileNameZh : monitor?.preferences?.profileNameEn}</strong><em>{monitor?.preferences?.userModified ? t.userCustomized : t.systemProvided}</em></div><div><span>{t.prioritySources}</span><p>{monitor?.preferences?.priorityVenues.slice(0, 6).map((venue) => <i key={venue}>{venue}</i>)}</p></div>{Boolean(monitor?.preferences?.trackedAuthors?.length) && <div><span>{locale === "zh" ? "追踪作者" : "Tracked authors"}</span><p>{monitor?.preferences?.trackedAuthors.slice(0, 6).map((author) => <i key={author}>{author}</i>)}</p></div>}</div>
                {SHOW_INTERNAL_QUALITY_UI && monitor?.queryPlan && <div className="v2-query-plan"><InterfaceIcon name="search" className="pi-state-mark" /><div><strong>{locale === "zh" ? "研究线索驱动的今日检索" : "Today's route-guided discovery"} · {monitor.queryPlan.queryCount} {locale === "zh" ? "组查询" : "queries"}</strong><p>{locale === "zh" ? monitor.queryPlan.rationaleZh : monitor.queryPlan.rationaleEn}</p></div></div>}
                <dl className="v2-monitor-metrics">
                  <div><dt>{t.lastScan}</dt><dd>{formatMonitorDate(monitor?.lastRunAt || null, locale)}</dd></div>
                  <div><dt>{t.nextScan}</dt><dd>{monitor?.automation?.paused ? (locale === "zh" ? "等待你处理后恢复" : "Waiting for your return") : formatMonitorDate(monitor?.nextRunAt || null, locale)}</dd></div>
                  <div>
                    <dt>{locale === "zh" ? "自动监控" : "Automatic monitoring"}</dt>
                    <dd title={locale === "zh" ? monitor?.automation?.pauseMessageZh : monitor?.automation?.pauseMessageEn}>
                      {monitor?.automation?.paused
                        ? `${locale === "zh" ? "已待机" : "On standby"} · ${monitor.automation.pauseReason === "daily_budget" ? (locale === "zh" ? "今日预算已用完" : "daily budget used") : monitor.automation.pauseReason === "model_unavailable" ? (locale === "zh" ? "模型待恢复" : "model unavailable") : monitor.automation.pauseReason === "space_deleted" ? (locale === "zh" ? "手动扫描后恢复" : "manual scan required") : (locale === "zh" ? "下次打开后恢复" : "resumes next visit")}`
                        : `${locale === "zh" ? "每日继续发现" : "Daily discovery"} · ${monitor?.automation?.pendingRecommendations || 0} ${locale === "zh" ? "篇待浏览" : "to browse"}`}
                    </dd>
                  </div>
                  <div><dt>{locale === "zh" ? "上次触发" : "Last trigger"}</dt><dd>{monitor?.lastTrigger === "scheduled" ? (locale === "zh" ? "后台定时" : "Scheduled") : monitor?.lastTrigger === "manual" ? (locale === "zh" ? "手动深挖" : "Manual deep dive") : (locale === "zh" ? "打开时补扫" : "Catch-up on visit")}</dd></div>
                  <div><dt>{locale === "zh" ? "持续探索轮次" : "Exploration round"}</dt><dd>#{monitor?.explorationRound || 0}</dd></div>
                  <div><dt>{monitor?.knownCount || 0} {t.knownPapers}</dt><dd>{monitor?.scannedCount || 0} {t.scannedPapers}</dd></div>
                </dl>
                {SHOW_INTERNAL_QUALITY_UI && monitor?.qualityMetrics && <dl className="v2-quality-metrics"><div><dt>{locale === "zh" ? "7日入选率" : "7-day selection yield"}</dt><dd>{monitor.qualityMetrics.recommendationYield}%</dd></div><div><dt>{locale === "zh" ? "用户接受率" : "User acceptance"}</dt><dd>{monitor.qualityMetrics.acceptanceRate}%</dd></div><div><dt>{locale === "zh" ? "候选 / 深度评审" : "Candidates / reviewed"}</dt><dd>{monitor.qualityMetrics.candidates} / {monitor.qualityMetrics.reviewed}</dd></div><div><dt>{locale === "zh" ? "7日智能用量" : "7-day AI usage"}</dt><dd>{Math.round((monitor.qualityMetrics.inputTokens + monitor.qualityMetrics.outputTokens) / 1000)}k tokens</dd></div></dl>}
                {SHOW_INTERNAL_QUALITY_UI && Boolean(monitor?.discoveryPerformance?.sources.length) && <div className="v2-discovery-performance"><header><strong>{locale === "zh" ? "发现来源表现" : "Discovery performance"}</strong><small>{locale === "zh" ? "依据真实入选与反馈持续调整" : "Updated from real selections and feedback"}</small></header>{monitor?.discoveryPerformance?.sources.slice(0, 6).map((source) => <div key={`${source.channel}:${source.sourceKey}`}><span>{source.sourceKey.replace(/_/g, " ")}</span><i>{source.channel}</i><b>{source.papers}</b><em>{source.acceptanceRate}%</em></div>)}</div>}
                {SHOW_INTERNAL_QUALITY_UI && Boolean(monitor?.discoveryPerformance?.tracks.length) && <div className="v2-track-performance"><span>{locale === "zh" ? "研究方向命中" : "Research-track fit"}</span><div>{monitor?.discoveryPerformance?.tracks.slice(0, 6).map((track) => <i key={track.trackId}><b>{locale === "zh" ? track.titleZh : track.titleEn}</b><small>{track.papers} {locale === "zh" ? "篇" : "papers"} · {track.acceptanceRate}%</small></i>)}</div></div>}
                {!!monitor?.coverage?.length && <div className="v2-coverage-ledger"><span>{locale === "zh" ? "探索覆盖" : "Discovery coverage"}</span><div>{monitor.coverage.slice(0, 8).map((source) => <i className={source.healthy ? "healthy" : "degraded"} key={coverageIdentity(source)} title={source.channel}><b />{source.sourceKey.replace(/_/g, " ")}<small>+{source.newCandidates}</small></i>)}</div></div>}
                <p>{t.autoVisit}</p>
              </details>
              </div>
            </section>}

            {todaySurface==="records" && Boolean(monitor?.notifications?.length) && <section className={`v2-research-catchup v2-action-inbox ${pendingActionNotifications.length ? "has-items" : "is-empty"}`}>
              <header><div><p className="v2-kicker warm">{locale === "zh" ? "研究提醒" : "RESEARCH ALERTS"}</p><h2>{pendingActionNotifications.length ? (locale === "zh" ? `${pendingActionNotifications.length} 项需要你处理` : `${pendingActionNotifications.length} items need your attention`) : (locale === "zh" ? "今天没有待处理事项" : "Nothing needs attention today")}</h2></div>{pendingActionNotifications.length > 0 && <button type="button" onClick={() => void markNotificationsRead()}>{locale === "zh" ? "全部处理" : "Handle all"}</button>}</header>
              <div className="v2-action-inbox-list">
                {pendingActionNotifications.slice(0, 4).map((notification) => <article className={notification.kind} key={notification.id}><span>{notification.kind === "weekly_review" ? "7D" : notification.kind === "route_change" ? "↗" : notification.kind === "must_read" ? "!" : "◷"}</span><div><small>{notification.kind === "must_read" ? (locale === "zh" ? "优先阅读" : "Priority reading") : notification.kind === "route_change" ? (locale === "zh" ? "路线变化" : "Route change") : notification.kind === "weekly_review" ? (locale === "zh" ? "阶段回顾" : "Research review") : (locale === "zh" ? "阅读提醒" : "Reading reminder")} · {formatNotificationTime(notification.createdAt, locale)}</small><strong>{locale === "zh" ? notification.titleZh : notification.titleEn}</strong><p>{locale === "zh" ? notification.bodyZh : notification.bodyEn}</p></div><button type="button" onClick={() => openResearchNotification(notification)}>{notificationActionLabel(notification.kind, locale)} →</button></article>)}
                {!pendingActionNotifications.length && <div className="v2-action-inbox-empty"><span>✓</span><p>{locale === "zh" ? "新的必读论文、路线变化和阅读提醒会出现在这里。" : "New must-reads, route changes, and reading reminders will appear here."}</p></div>}
              </div>
              {Boolean(activityGroups.length) && <details className="v2-activity-log" open={notificationsExpanded} onToggle={(event) => setNotificationsExpanded(event.currentTarget.open)}><summary><span><strong>{locale === "zh" ? "Pi 运行记录" : "Pi activity"}</strong><small>{locale === "zh" ? "扫描和恢复信息，不计入待处理" : "Scan activity, not an action item"}</small></span><b>{notificationsExpanded ? (locale === "zh" ? "收起" : "Close") : (locale === "zh" ? "查看" : "View")} ＋</b></summary><div>{activityGroups.slice(0, 7).map((activity) => <article key={activity.key}><span>✓</span><div><strong>{locale === "zh" ? "扫描完成" : "Scan complete"}{activity.recovered ? (locale === "zh" ? " · 已从断点续跑" : " · resumed from checkpoint") : ""}</strong><p>{locale === "zh" ? activity.primary.bodyZh : activity.primary.bodyEn}</p><small>{formatNotificationTime(activity.primary.createdAt, locale)}</small></div><button type="button" onClick={() => openTodaySurface("discovery")}>{locale === "zh" ? "扫描详情" : "Scan details"} →</button></article>)}</div></details>}
            </section>}
            </div>

            {SHOW_INTERNAL_QUALITY_UI && monitor?.pilotEvaluation && <section className="v2-pilot-evaluation"><header><div><p className="v2-kicker warm">{locale === "zh" ? "7 天真实试运行" : "7-DAY LIVE PILOT"}</p><h2>{monitor.pilotEvaluation.complete ? (locale === "zh" ? "试运行周期已完成" : "Pilot period complete") : (locale === "zh" ? `第 ${monitor.pilotEvaluation.elapsedDays || 0} / 7 天` : `Day ${monitor.pilotEvaluation.elapsedDays || 0} of 7`)}</h2></div><strong>{monitor.pilotEvaluation.succeeded}/{monitor.pilotEvaluation.attempts}<small>{locale === "zh" ? "成功扫描" : "successful scans"}</small></strong></header><div>{monitor.pilotEvaluation.criteria.map((criterion) => <article className={criterion.status} key={criterion.id}><span>{criterion.status === "pass" ? "✓" : criterion.status === "watch" ? "!" : "·"}</span><div><strong>{pilotCriterionLabel(criterion.id, locale)}</strong><small>{criterion.id === "paperQuality" ? (locale === "zh" ? `${criterion.value} 次错误类型反馈` : `${criterion.value} wrong-type reports`) : criterion.id === "horizons" ? `${criterion.value}/3` : criterion.id === "deduplication" ? (locale === "zh" ? `${criterion.value} 次重复已避免` : `${criterion.value} duplicates avoided`) : `${criterion.value}%`}</small></div><b>{criterion.status === "pass" ? (locale === "zh" ? "达标" : "Pass") : criterion.status === "watch" ? (locale === "zh" ? "观察" : "Watch") : (locale === "zh" ? "等待数据" : "Waiting")}</b></article>)}</div><footer><span>{locale === "zh" ? `可靠性 ${monitor.pilotEvaluation.summary.reliability}% · 接受率 ${monitor.pilotEvaluation.summary.acceptanceRate}% · 每篇有效推荐约 ${monitor.pilotEvaluation.summary.tokensPerRecommendation || 0} token` : `${monitor.pilotEvaluation.summary.reliability}% reliability · ${monitor.pilotEvaluation.summary.acceptanceRate}% acceptance · ${monitor.pilotEvaluation.summary.tokensPerRecommendation || 0} tokens per useful recommendation`}</span></footer></section>}

            {todaySurface==="discovery" && SHOW_INTERNAL_QUALITY_UI && monitor?.operationsDashboard && <section className="v2-operations-dashboard"><header><div><p className="v2-kicker">{locale === "zh" ? "发现质量" : "DISCOVERY QUALITY"}</p><h2>{locale === "zh" ? "每次扫描是否真的带来新的、有用的论文" : "Whether each scan finds genuinely new, useful work"}</h2></div><small>{locale === "zh" ? `近 ${monitor.operationsDashboard.periodDays} 天真实运行数据` : `Last ${monitor.operationsDashboard.periodDays} days of real activity`}</small></header><div className="v2-operations-metrics"><article><span>{locale === "zh" ? "新候选" : "New candidates"}</span><strong>{monitor.operationsDashboard.totals.newCandidates}</strong><small>{monitor.operationsDashboard.totals.candidates} {locale === "zh" ? "篇独立候选" : "unique candidates"}</small></article><article><span>{locale === "zh" ? "去重节省" : "Duplicates avoided"}</span><strong>{monitor.operationsDashboard.totals.duplicatesAvoided}</strong><small>{monitor.operationsDashboard.totals.duplicateAvoidanceRate}% {locale === "zh" ? "无需重复交给 LLM" : "kept away from the LLM"}</small></article><article><span>{locale === "zh" ? "深审入选率" : "Review yield"}</span><strong>{monitor.operationsDashboard.totals.recommendationYield}%</strong><small>{monitor.operationsDashboard.totals.recommended} / {monitor.operationsDashboard.totals.reviewed} {locale === "zh" ? "篇入选" : "selected"}</small></article><article><span>{locale === "zh" ? "用户接受率" : "Acceptance"}</span><strong>{monitor.operationsDashboard.totals.acceptanceRate}%</strong><small>{monitor.operationsDashboard.totals.tokensPerRecommendation ? `${Math.round(monitor.operationsDashboard.totals.tokensPerRecommendation / 100) / 10}k token / ${locale === "zh" ? "推荐" : "recommendation"}` : (locale === "zh" ? "等待更多反馈" : "Awaiting feedback")}</small></article></div><div className="v2-operations-body"><div className="v2-scan-trend"><h3>{locale === "zh" ? "每日发现趋势" : "Daily discovery trend"}</h3>{monitor.operationsDashboard.daily.length ? monitor.operationsDashboard.daily.map((day) => <div key={day.date}><time>{day.date.slice(5)}</time><i><b style={{ width: `${Math.max(3, day.candidates / operationsMaxCandidates * 100)}%` }} /></i><span>+{day.newCandidates}</span><em>{day.recommended} {locale === "zh" ? "入选" : "selected"}</em></div>) : <p>{locale === "zh" ? "完成第一轮新版本扫描后，这里会开始记录趋势。" : "Trend data will appear after the first scan on this version."}</p>}</div><div className="v2-horizon-performance"><h3>{locale === "zh" ? "三层覆盖效率" : "Three-horizon efficiency"}</h3>{monitor.operationsDashboard.horizons.map((item) => <article key={item.horizon}><span>{item.horizon === "days" ? t.daysHorizon : item.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span><strong>{item.discoveryYield}%</strong><small>{item.branches} {locale === "zh" ? "条分支" : "branches"} · {item.cooling} {locale === "zh" ? "条降频" : "cooling"}</small></article>)}</div></div>{Boolean(monitor.explorationLedger?.length) && <details className="v2-exploration-ledger"><summary><span><b>{locale === "zh" ? "持续探索账本" : "Continuous exploration ledger"}</b><small>{locale === "zh" ? "Pi 记录每条检索分支的位置；低收益分支自动降频，之后再回访。" : "Pi remembers each branch position, cools low-yield paths, and revisits them later."}</small></span><strong>{monitor.explorationLedger?.length} →</strong></summary><div>{monitor.explorationLedger?.slice(0, 16).map((branch) => <article className={branch.status} key={`${branch.horizon}:${branch.id}`}><header><span>{branch.horizon === "days" ? t.daysHorizon : branch.horizon === "months" ? t.monthsHorizon : t.yearsHorizon} · {branch.channel}</span><b>{explorationStatusLabel(branch.status, locale)}</b></header><p>{branch.queryText || branch.sourceKey.replace(/_/g, " ")}</p><footer><span>{locale === "zh" ? "游标" : "cursor"} {branch.nextCursor}</span><span>{branch.attempts} {locale === "zh" ? "轮" : "rounds"}</span><span>{branch.newCandidates}/{branch.candidates} {locale === "zh" ? "新发现" : "new"}</span><strong>{branch.discoveryYield}%</strong></footer></article>)}</div></details>}</section>}

            {todaySurface==="records" && !!monitor?.mapChanges?.length && <details className="v2-route-changes v2-route-changes-compact"><summary><span><strong>{locale === "zh" ? "研究路线变化" : "Research route changes"}</strong><small>{monitor.mapChanges.length} {locale === "zh" ? "项更新" : "updates"}</small></span><b>＋</b></summary><div>{monitor.mapChanges.slice(0, 3).map((change) => { const kind = routeChangeKindLabel(change.kind); return <article key={change.id}><InterfaceIcon name={kind.symbol} /><div><small>{locale === "zh" ? change.trackTitleZh : change.trackTitleEn} · {locale === "zh" ? kind.zh : kind.en}{change.kind === "new_evidence" ? ` · ${change.confidence}%` : ""}</small><h3>{change.kind === "new_evidence" ? change.paperTitle : locale === "zh" ? change.titleZh : change.titleEn}</h3><p>{locale === "zh" ? change.summaryZh : change.summaryEn}</p></div></article>; })}</div><footer><button type="button" onClick={() => navigate("threads")}>{locale === "zh" ? "查看研究路线" : "Open research routes"} →</button></footer></details>}



          </main>
        )}

        {(view === "threads" || view === "paper-detail" && paperReturnView === "threads" || view === "workbook" && workbookReturnView === "threads" || view === "paper-detail" && paperReturnView === "workbook" && workbookReturnView === "threads") && (
          <main hidden={view !== "threads"} className={`v2-page v2-map-page ${researchMapMode === "directions" ? "pi-leads-page" : ""}`}>
              <section className="v2-page-head v2-map-head v2-route-page-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)}</p><h1>{researchMapMode === "directions" ? (locale === "zh" ? "研究路线" : "Research routes") : (locale === "zh" ? "文献探索" : "Literature explorer")}</h1><p className="pi-page-purpose">{researchMapMode === "directions" ? (locale === "zh" ? "选择一条线索，核对材料，再推进比较、研究问题或学习。" : "Choose a lead, inspect its materials, then compare, investigate or study.") : (locale === "zh" ? "从一篇论文和一个具体问题出发，查找、筛选并比较相关工作。" : "Start with a paper and a question to discover, examine and compare related work.")}</p></div><div className="v2-map-head-actions">{researchMapMode === "papers" ? <button className="v2-route-back-overview" type="button" onClick={() => { setResearchMapMode("directions"); setSelectedNetworkPaperId(null); if (graphReturnView === "library") navigate("library"); else navigate("threads", workbookTrackId, { graph: undefined }); }}>{graphReturnView === "library" ? (locale === "zh" ? "← 返回论文库" : "← Back to library") : (locale === "zh" ? "← 返回路线总览" : "← Back to route overview")}</button> : <><span className="v2-map-total"><strong>{researchMap.tracks.length}</strong>{locale === "zh" ? "条研究路线" : "research routes"}</span><button className="v2-route-head-explorer" type="button" onClick={() => { setGraphReturnView("threads"); setResearchMapMode("papers"); navigate("threads", workbookTrackId, { graph: libraryGraphPaperId || "all" }); }}>{locale === "zh" ? "文献探索" : "Literature explorer"} →</button></>}</div></section>
            {researchMapMode === "papers" && <nav className="pi-explorer-scope" aria-label={locale === "zh" ? "探索范围" : "Exploration scope"}><button type="button" aria-pressed={graphSurface === "library"} onClick={() => paperNetworkNavigation.changeSurface("library")}>{locale === "zh" ? "全部论文 · 引用查询" : "All papers · citations"}</button><button type="button" aria-pressed={graphSurface === "routes"} onClick={() => paperNetworkNavigation.changeSurface("routes")}>{locale === "zh" ? "路线材料 · 相关工作" : "Route materials · related work"}</button></nav>}
            {researchMapMode === "papers" && graphSurface === "library" && <DeferredWorkspacePanel locale={locale}><LibraryExplorer key={`${activeSpace.id}:${libraryGraphPaperId}`} spaceId={activeSpace.id} locale={locale} initialPaperId={libraryGraphPaperId} initialState={libraryViewState} onStateChange={(state,history)=>{setLibraryViewState({query:state.query||'',scope:state.scope||'related',page:state.page||1,focusId:state.focusId||''});updateWorkspaceHash({libraryQuery:state.query,libraryScope:state.scope,libraryPage:state.page,libraryFocus:state.focusId},history);}} routes={researchMap.tracks.map(track=>({id:track.id,title:locale === "zh" ? track.titleZh : track.titleEn}))} onCompare={(id,context)=>openWorkbook(id,context)} onOpen={id => void openRoutePaper(id,"threads")} /></DeferredWorkspacePanel>}
            <section className="pi-route-graph-legacy" hidden={researchMapMode === "papers" && graphSurface !== "routes"}>
            {mapLoading ? (
              <section className="v2-map-loading v2-outline-loading" role="status"><InterfaceIcon name="loading" className="pi-state-mark" /><div><strong>{locale === "zh" ? "正在建立研究路线" : "Building research routes"}</strong><p>{mapOutlineLabels[mapOutlinePhase]}</p><i><b style={{ width: `${22 + mapOutlinePhase * 21}%` }} /></i><small>{locale === "zh" ? "已识别的路线先显示，论文证据随后补充。" : "Identified routes appear first; paper evidence follows."}</small></div></section>
            ) : researchMap.tracks.length ? (
              <>
                {researchMapMode === "directions" ? <>
                  <DeferredWorkspacePanel locale={locale}><ResearchLeads tracks={researchMap.tracks} locale={locale} onOpen={openThread} onLearn={openRouteLearningPath} /></DeferredWorkspacePanel>

                  {routeAttention && routeAttentionTrack && <RoutePortfolioOverview attentionKind={routeAttention.kind} attentionTrack={routeAttentionTrack} locale={locale} onAction={handleRouteAttention} />}

                  <RouteUpdateRecords portfolio={routePortfolio} todayCount={routeTodayPaperCount} locale={locale}>
                  {(researchMap.buildProgress?.pendingTrackIds.length || mapBuildTrackId) ? <section className="v2-map-build-progress v2-route-build-progress" role="status"><div><span className={mapBuildTrackId ? "working" : "paused"}><i /></span><div><strong>{mapBuildTrackId ? (locale === "zh" ? `正在补充第 ${(researchMap.buildProgress?.ready || 0) + 1} / ${researchMap.buildProgress?.total || researchMap.tracks.length} 条路线` : `Filling route ${(researchMap.buildProgress?.ready || 0) + 1} of ${researchMap.buildProgress?.total || researchMap.tracks.length}`) : (locale === "zh" ? `${researchMap.buildProgress?.pendingTrackIds.length || 0} 条路线等待补充` : `${researchMap.buildProgress?.pendingTrackIds.length || 0} routes await evidence`)}</strong><p>{currentBuildTrack ? (locale === "zh" ? currentBuildTrack.titleZh : currentBuildTrack.titleEn) : (locale === "zh" ? "已完成内容已经保存" : "Completed work is saved")}</p></div></div><i><b style={{ width: `${researchMap.buildProgress?.total ? Math.round((researchMap.buildProgress.ready / researchMap.buildProgress.total) * 100) : 0}%` }} /></i></section> : null}
                  {((researchMap.intelligenceProgress && researchMap.intelligenceProgress.ready < researchMap.intelligenceProgress.total) || mapIntelligenceTrackId) ? <section className="v2-map-build-progress v2-intelligence-progress v2-route-build-progress" role="status"><div><InterfaceIcon name={mapIntelligenceTrackId ? "loading" : "clock"} className="pi-state-mark" /><div><strong>{mapIntelligenceTrackId ? (locale === "zh" ? "方向研判中" : "Assessing direction") : (locale === "zh" ? "部分方向待更新" : "Some assessments need refresh")}</strong><p>{currentIntelligenceTrack ? (locale === "zh" ? currentIntelligenceTrack.titleZh : currentIntelligenceTrack.titleEn) : (locale === "zh" ? "已有路线和研判已保留" : "Existing routes and assessments are retained")}</p></div></div><i><b style={{ width: `${researchMap.intelligenceProgress?.total ? Math.round((researchMap.intelligenceProgress.ready / researchMap.intelligenceProgress.total) * 100) : 0}%` }} /></i></section> : null}
                  {Boolean((researchMap.buildProgress?.partialTrackIds?.length || 0) + (researchMap.buildProgress?.emptyTrackIds?.length || 0) + (researchMap.buildProgress?.failedTrackIds?.length || 0)) && <section className="v2-map-build-progress v2-route-build-degraded"><div><span className="paused"><i>!</i></span><div><strong>{locale === "zh" ? "部分路线待补充" : "Some routes need evidence"}</strong><p>{locale === "zh" ? "已有论文已保留；无可见证据的路线不会标记为完成。" : "Existing papers are retained; routes without visible evidence are not marked complete."}</p></div></div></section>}


                  </RouteUpdateRecords>

                </> : <section className="v2-paper-network-panel">
                  <header className="v2-paper-network-toolbar">
                    <GraphTaskNavigation mode={paperNetworkMode} onMode={changeNetworkMode} onCompare={() => { const track = paperNetworkTrackId !== "all" ? paperNetworkTrackId : effectiveNetworkOriginNodes[0]?.track.id; if (track) openWorkbook(track, currentGraphTask); }} canCompare={currentGraphTask.papers.length >= 2 && Boolean(effectiveNetworkOriginNodes.length)} citations={visibleCitationEdgeCount} similarities={visibleSimilarityEdgeCount} candidates={rankedResearchNetworkCandidates.length} stages={activeLearningState.path?.steps.length || 0} locale={locale} />
                    <div className="v2-paper-network-filters">{paperNetworkMode === "similarity" && <div className="v2-paper-network-scope" role="group" aria-label={locale === "zh" ? "网络范围" : "Network scope"}><button type="button" className={paperNetworkScope === "all" ? "active" : ""} onClick={() => changeNetworkScope("all")}>{locale === "zh" ? "完整图谱" : "Full graph"}</button><button type="button" className={paperNetworkScope === "one-hop" ? "active" : ""} disabled={!selectedNetworkPaperId} onClick={() => changeNetworkScope("one-hop")}>{locale === "zh" ? "可核验一跳" : "Verified one-hop"}</button>{explicitNetworkOriginNodes.length >= 2 && <button type="button" className={paperNetworkScope === "multi-seed" ? "active" : ""} onClick={() => changeNetworkScope("multi-seed")}>{locale === "zh" ? "联合种子" : "Multi-origin"}</button>}</div>}<label><span>{locale === "zh" ? "方向" : "Direction"}</span><select value={paperNetworkTrackId} onChange={(event) => { const track=event.target.value;paperNetworkNavigation.changeTrack(track); setPaperNetworkOriginCanonicalIds([]); resetResearchNetworkExpansion([]); }}><option value="all">{locale === "zh" ? "全部方向" : "All directions"}</option>{researchMap.tracks.map((track) => <option value={track.id} key={track.id}>{locale === "zh" ? track.titleZh : track.titleEn}</option>)}</select></label>{paperNetworkMode === "similarity" && <button type="button" className="primary" onClick={() => void expandResearchNetwork(undefined, true)} disabled={researchNetworkLoading || !effectiveNetworkOriginNodes.length}>{researchNetworkLoading ? (locale === "zh" ? "寻找中…" : "Discovering…") : researchNetworkCandidates.length ? (locale === "zh" ? "继续发现" : "Discover more") : (locale === "zh" ? "发现更多论文" : "Discover papers")}</button>}{paperNetworkMode !== "path" && <button type="button" onClick={() => void refreshPaperNetwork("verified")} disabled={paperNetworkLoading || researchMap.paperNetwork.paperCount < 2}>{paperNetworkLoading ? (locale === "zh" ? "核验中…" : "Verifying…") : paperNetworkMode === "citations" ? (locale === "zh" ? "核验引用关系" : "Verify citations") : (locale === "zh" ? "核验耦合与引用" : "Verify coupling and citations")}</button>}</div>
                  </header>
                  {paperNetworkMode !== "path" && <DeferredWorkspacePanel locale={locale}><GraphResearchDesk key={`${activeSpace.id}:${paperNetworkTrackId}:${graphDeskOrigin?.paper.canonicalId || ""}`} spaceId={activeSpace.id} mode={paperNetworkMode} papers={graphDeskPapers} origins={graphDeskOrigins} originId={graphDeskOrigin?.paper.id || ""} context={currentGraphTask} onContext={setGraphTask} locale={locale} expanding={researchNetworkLoading} discoveryNotice={researchNetworkError || (researchNetworkResponse?.status === "partial" || researchNetworkResponse?.status === "unavailable" || researchNetworkResponse?.status === "rate_limited" ? (locale === "zh" ? "部分来源尚未完成，已有结果仍可查看。具体情况见下方来源与运行状态。" : "Some sources are incomplete; available results remain usable. See source status below.") : "")} onOrigin={id=>{const node=eligibleNetworkPaperNodes.find(n=>n.paper.id===id);if(node)setSingleNetworkOrigin(node);}} onFocus={id=>{changeNetworkFocus(id);setGraphDetailsOpen(true);}} onExpand={()=>void expandResearchNetwork(undefined,true,true)} onCompare={()=>{if(graphDeskOrigin)openWorkbook(paperNetworkTrackId === "all" ? graphDeskOrigin.track.id : paperNetworkTrackId,currentGraphTask);}} onLearn={()=>{if(graphDeskOrigin)openRouteLearningPath(paperNetworkTrackId === "all" ? graphDeskOrigin.track : researchMap.tracks.find(t=>t.id===paperNetworkTrackId) || graphDeskOrigin.track,currentGraphTask);}} /></DeferredWorkspacePanel>}
                  <details className="pi-graph-diagnostics"><summary>{locale === "zh" ? "检索来源与运行状态" : "Sources and processing status"}</summary>
                  {paperNetworkMode === "similarity" && <div className={`v2-paper-network-context ${paperNetworkMode} ${paperNetworkScope}`}><strong><MathText inline>{paperNetworkContext.title}</MathText></strong><span>{paperNetworkContext.body}</span></div>}
                  {paperNetworkMode === "similarity" && <><div className="v2-network-origin-bar"><span>{locale === "zh" ? "起始论文" : "Origin papers"}<b>{effectiveNetworkOriginNodes.length}/3</b></span><div>{effectiveNetworkOriginNodes.map((node, index) => <span className="v2-network-origin-chip" key={node.paper.canonicalId}><button className="v2-network-origin-select" type="button" aria-pressed={selectedNetworkPaperId === node.paper.id} onClick={() => changeNetworkFocus(node.paper.id)}><b>{index + 1}</b><span>{node.paper.title.slice(0, 44)}</span></button>{explicitNetworkOriginNodes.length > 0 && <button className="v2-network-origin-remove" type="button" onClick={() => removeNetworkOrigin(node.paper.canonicalId)} aria-label={locale === "zh" ? `移除种子：${node.paper.title}` : `Remove origin: ${node.paper.title}`}>×</button>}</span>)}</div><small>{locale === "zh" ? "金环只表示起始论文；深绿外环表示当前聚焦。点击只查看，生成新图是独立操作。" : "Gold rings only mark origins; a dark-green outer ring marks the current focus. Selection only inspects; rebuilding is separate."}</small></div>{explicitNetworkOriginNodes.length >= 2 && <div className="v2-multi-origin-intents" role="group" aria-label={locale === "zh" ? "多种子意图" : "Multi-origin intent"}>{(["shared", "union"] as MultiOriginIntent[]).map((intent) => <button type="button" key={intent} className={multiOriginIntent === intent ? "active" : ""} onClick={() => { setMultiOriginIntent(intent); changeNetworkScope("multi-seed"); }}>{intent === "shared" ? (locale === "zh" ? "共同邻居" : "Shared neighbors") : intent === "bridge" ? (locale === "zh" ? "跨域桥接" : "Bridges") : (locale === "zh" ? "分别探索" : "Explore each origin")}</button>)}</div>}</>}
                  {paperNetworkMode !== "path" && (paperNetworkLoading || researchMap.paperNetwork.status === "building") && <div className="v2-paper-network-progress" role="status"><span><i /></span><div><strong>{paperNetworkBuildPhase === "pi" ? (locale === "zh" ? "真实关系已可浏览" : "Verified links are ready") : (locale === "zh" ? "正在核验真实引用" : "Verifying real citations")}</strong><p>{paperNetworkBuildPhase === "pi" ? (locale === "zh" ? `Pi 正在逐条补充语义关系；当前已有 ${researchMap.paperNetwork.citationEdgeCount + researchMap.paperNetwork.similarityEdgeCount} 条真实关系。建议阅读顺序由已保存的学习路径独立维护。` : `Pi is adding semantic links; ${researchMap.paperNetwork.citationEdgeCount + researchMap.paperNetwork.similarityEdgeCount} verified links are already visible. Reading order is maintained by the saved learning path.`) : (locale === "zh" ? "真实引用与文献耦合一旦核验完成，就会先出现在图上。" : "Verified citations and coupling links will appear before Pi analysis finishes.")}</p></div></div>}
                  {paperNetworkMode !== "path" && !paperNetworkLoading && ["partial", "error"].includes(researchMap.paperNetwork.status) && (() => { const notice = paperNetworkSourceNotice(researchMap.paperNetwork, locale); return notice ? <div className="v2-paper-network-note" role="status"><span /><div><strong><MathText inline>{notice.title}</MathText></strong><p>{notice.body}</p></div><button type="button" onClick={() => void refreshPaperNetwork("verified")}>{notice.action}</button></div> : null; })()}
                  {paperNetworkMode === "similarity" && researchNetworkLoading && <div className="v2-paper-network-progress v2-external-network-progress" role="status"><span><i /></span><div><strong>{locale === "zh" ? "正在围绕起始论文寻找新邻域" : "Discovering a new neighborhood around the origins"}</strong><p>{locale === "zh" ? "现有图谱仍可浏览；候选返回后会作为浅色节点加入。" : "The current graph remains usable; candidates will arrive as lightweight ghost nodes."}</p></div></div>}
                  {paperNetworkMode === "similarity" && researchNetworkResponse && (() => {
                    const issueSummary = researchNetworkIssueSummary(researchNetworkResponse, locale);
                    const savedDatabaseRelationCount = researchMap.paperNetwork.citationEdgeCount + researchMap.paperNetwork.similarityEdgeCount;
                    const batchCandidateCount = researchNetworkResponse.candidates.length;
                    const directEvidenceCandidateCount = researchNetworkResponse.candidates.filter((candidate) => candidate.relations.some((relation) => relation.kind === "citation" || relation.kind === "reference")).length;
                    const batchHasNoNewCandidates = researchNetworkHasNoNewCandidates(researchNetworkResponse);
                    const discoveryUnavailable = researchNetworkResponse.status === "unavailable";
                    const emptyPartialBatch = researchNetworkResponse.status === "partial" && batchCandidateCount === 0;
                    const discoveryTitle = researchNetworkResponse.status === "rate_limited" ? (locale === "zh" ? "来源短暂限流，已保留本批结果" : "Source temporarily rate-limited; this batch is preserved") : discoveryUnavailable ? (locale === "zh" ? "本次来源暂不可用" : "Sources are unavailable for this discovery") : batchHasNoNewCandidates ? (locale === "zh" ? "本轮没有新的可推荐论文" : "No new papers to recommend in this pass") : emptyPartialBatch ? (locale === "zh" ? "本批部分来源完成" : "Some sources completed for this batch") : researchNetworkResponse.stale ? (locale === "zh" ? "本批使用过期缓存，建议刷新" : "This batch uses stale cache; refresh recommended") : researchNetworkResponse.cached ? (locale === "zh" ? "本批复用仍有效的发现缓存" : "This batch reused a valid discovery cache") : researchNetworkIsPartial ? (locale === "zh" ? "本批部分来源完成" : "Some sources completed for this batch") : (locale === "zh" ? "本批外部发现已完成" : "External discovery completed for this batch");
                    const candidateEvidenceSummary = batchCandidateCount > 0 ? (locale === "zh" ? `${directEvidenceCandidateCount}/${batchCandidateCount} 篇候选有直接引用 / 参考文献证据` : `${directEvidenceCandidateCount}/${batchCandidateCount} candidates have direct citation / reference evidence`) : batchHasNoNewCandidates ? (locale === "zh" ? "已完成当前起点周边检查，现有图谱保持不变" : "The neighborhood was checked; the current map is unchanged") : (locale === "zh" ? "本批暂无可用候选" : "No usable candidates in this batch");
                    const similaritySummary = researchNetworkResponse.similarityEdges.length > 0 ? (locale === "zh" ? `${researchNetworkResponse.similarityEdges.length} 条可计算关系` : `${researchNetworkResponse.similarityEdges.length} computable links`) : (locale === "zh" ? "暂无可计算关系" : "No computable links yet");
                    return <div className={`v2-research-network-source-state ${researchNetworkResponse.stale ? "stale" : batchHasNoNewCandidates ? "empty" : researchNetworkIsPartial ? "partial" : "ready"}`} role="status">
                      <section className="v2-research-network-saved-state">
                        <small>{locale === "zh" ? "已保存研究地图" : "Saved research map"}</small>
                        <strong>{locale === "zh" ? `地图累计 ${savedDatabaseRelationCount} 条数据库关系` : `${savedDatabaseRelationCount} database links saved in the map`}</strong>
                        <span>{locale === "zh" ? `${researchMap.paperNetwork.paperCount} 篇已收录论文` : `${researchMap.paperNetwork.paperCount} papers in the map`}</span>
                      </section>
                      <section className="v2-research-network-current-state">
                        <div><small>{locale === "zh" ? "本次外部发现" : "This external discovery"}</small><strong>{discoveryTitle}</strong><span>{candidateEvidenceSummary}</span></div>
                        <dl><div><dt>Semantic Scholar</dt><dd>{researchNetworkSourceLabel(researchNetworkResponse.sourceStatus.semanticScholar, locale)}</dd></div>{researchNetworkResponse.sourceStatus.openAlex !== "not_attempted" && <div><dt>OpenAlex</dt><dd>{researchNetworkSourceLabel(researchNetworkResponse.sourceStatus.openAlex, locale)}</dd></div>}<div><dt>{locale === "zh" ? "相似性" : "Similarity"}</dt><dd>{similaritySummary}</dd></div></dl>
                      </section>
                      {issueSummary && <p className="v2-research-network-issue">{issueSummary}</p>}
                    </div>;
                  })()}
                  {paperNetworkMode === "similarity" && researchNetworkError && <div className="v2-paper-network-note" role="status"><span /><div><strong>{locale === "zh" ? "外部论文发现暂时不可用" : "External discovery is temporarily unavailable"}</strong><p>{researchNetworkError}</p></div><button type="button" onClick={() => setResearchNetworkError("")}>{locale === "zh" ? "关闭" : "Dismiss"}</button></div>}
                  </details>
                  <details className="pi-graph-secondary" open={paperNetworkMode === "path" || graphDetailsOpen} onToggle={event=>setGraphDetailsOpen(event.currentTarget.open)}><summary>{paperNetworkMode === "path" ? (locale === "zh" ? "已保存的阅读安排" : "Saved reading plan") : (locale === "zh" ? "查看关系图与论文详情" : "Inspect graph and paper details")}</summary>
                  <div className={`v2-paper-network-stage ${paperNetworkMode === "similarity" ? "discovery-mode" : "analysis-mode"} ${showNetworkPaperDrawer ? "has-drawer" : ""}`}>
                    {paperNetworkMode === "similarity" && <aside className="v2-paper-discovery-list" aria-label={locale === "zh" ? "论文发现列表" : "Paper discovery list"}>
                      <div className="v2-paper-discovery-tabs" role="group" aria-label={locale === "zh" ? "发现类型" : "Discovery type"}>{(["similar", "prior", "derivative"] as PaperDiscoveryTab[]).map((tab) => <button type="button" key={tab} aria-pressed={paperDiscoveryTab === tab} className={paperDiscoveryTab === tab ? "active" : ""} onClick={() => setPaperDiscoveryTab(tab)}><span>{tab === "similar" ? (locale === "zh" ? "相似论文" : "Similar") : tab === "prior" ? (locale === "zh" ? "前置奠基" : "Prior") : (locale === "zh" ? "后续发展" : "Derivative")}</span><b>{networkDiscoveryNodesByTab[tab].length}</b></button>)}</div>
                      <div className="v2-paper-discovery-scroll">{networkDiscoveryNodes.length ? networkDiscoveryNodes.map((node) => { const candidate = node.external; const decision = candidate ? researchNetworkDecisions[candidate.canonicalId] : undefined; const origin = effectiveNetworkOriginIds.includes(node.paper.id); const evidenceCount = candidate ? currentOriginEvidenceCount(candidate, effectiveNetworkOriginCanonicalIds) : 0; return <article key={node.paper.id} className={`${selectedNetworkPaperId === node.paper.id ? "selected" : ""} ${candidate ? "ghost" : "saved"}`} onPointerEnter={() => setHoveredNetworkPaperId(node.paper.id)} onPointerLeave={() => setHoveredNetworkPaperId(null)}><button type="button" className="v2-paper-discovery-select" onClick={() => changeNetworkFocus(node.paper.id)}><span>{origin ? (locale === "zh" ? "起点" : "Origin") : candidate ? decision === "accepted" ? (locale === "zh" ? "已收录" : "Added") : (locale === "zh" ? "待收录" : "Candidate") : (locale === "zh" ? "地图内" : "In map")}</span><strong><MathText inline>{node.paper.title}</MathText></strong><small>{[node.paper.authors, researchPaperYear(node.paper), node.paper.venue].filter(Boolean).join(" · ")}</small>{candidate && <em>{networkCandidateFitLabel(candidate.score, locale)} · {locale === "zh" ? `${evidenceCount} 个当前起点有独立关系证据` : `${evidenceCount} active origin(s) with independent relation evidence`}</em>}</button>{candidate && decision !== "accepted" && <footer><button type="button" disabled={decision === "saving"} onClick={() => void decideResearchNetworkCandidate(candidate, "accept")}>{decision === "saving" ? "…" : (locale === "zh" ? "收录" : "Add")}</button><button type="button" disabled={decision === "saving"} onClick={() => void decideResearchNetworkCandidate(candidate, "dismiss")}>{locale === "zh" ? "忽略" : "Dismiss"}</button></footer>}</article>; }) : <div className="v2-paper-discovery-empty"><strong>{researchNetworkResponse && researchNetworkHasNoNewCandidates(researchNetworkResponse) ? (locale === "zh" ? "本轮没有新的可推荐论文" : "No new papers to recommend in this pass") : paperDiscoveryTab === "prior" ? (locale === "zh" ? "暂无共同前置工作" : "No common prior works yet") : paperDiscoveryTab === "derivative" ? (locale === "zh" ? "暂无共同后续工作" : "No common derivative works yet") : (locale === "zh" ? "尚未发现外部候选" : "No external candidates yet")}</strong><p>{researchNetworkResponse && researchNetworkHasNoNewCandidates(researchNetworkResponse) ? (locale === "zh" ? "Pi 已检查当前起点周边；现有图谱和历史论文不会因此丢失。" : "Pi checked the current neighborhood; saved map papers remain available.") : (locale === "zh" ? "可以从起始论文继续发现，现有论文不会丢失。" : "Discover from an origin; saved papers remain intact.")}</p></div>}</div>
                    </aside>}
                    <div className="v2-paper-network-main">
                      {paperNetworkMode === "similarity" ? <>{graphDetailsOpen && <PaperNetworkGraph map={researchMap} mode="similarity" scope={paperNetworkScope} multiOriginIntent={multiOriginIntent} trackFilter={paperNetworkTrackId} locale={locale} selectedPaperId={selectedNetworkPaperId} hoveredPaperId={hoveredNetworkPaperId} originPaperIds={effectiveNetworkOriginIds} externalNodes={externalNetworkPaperNodes} externalSimilarityEdges={researchNetworkSimilarityEdges} paperStates={paperStateByCanonicalId} onSelect={changeNetworkFocus} onHover={setHoveredNetworkPaperId} />}<footer className="v2-paper-network-legend"><span><i className="focus" />{locale === "zh" ? "深绿外环：当前聚焦" : "Dark-green outer ring: current focus"}</span><span><i className="origin" />{locale === "zh" ? "金环：起始论文" : "Gold ring: origin paper"}</span><span><i className="similarity" />{locale === "zh" ? "距离 / 线宽：文献耦合强度" : "Distance / line width: bibliographic coupling"}</span><span><i className="discovery-fallback" />{locale === "zh" ? "中性虚线：引用或推荐发现线索（非耦合）" : "Neutral dashed line: citation or recommendation lead (not coupling)"}</span><span><i className="node-size" />{locale === "zh" ? "节点大小：被引量" : "Node size: citations"}</span><span><i className="year" />{locale === "zh" ? "颜色：发表年份（旧 → 新）" : "Color: publication year (older → newer)"}</span><span><i className="ghost" />{locale === "zh" ? "虚边节点：尚未收录" : "Dashed node: not yet added"}</span>{paperNetworkScope === "multi-seed" && <span><i className="shared-neighbor" />{locale === "zh" ? "双环：多个种子的共同邻居" : "Double ring: neighbor shared by multiple origins"}</span>}</footer></> : paperNetworkMode === "citations" ? <CitationFlowWorkbench map={researchMap} trackFilter={paperNetworkTrackId} locale={locale} selectedPaperId={selectedNetworkPaperId} onSelect={changeNetworkFocus} onExpandFocus={(node) => { setSingleNetworkOrigin(node); void expandResearchNetwork([node.paper.canonicalId], true, true); }} onOpenFocus={(node) => recordMapPaperOpen(node.track.id)} onAskFocus={askAboutNetworkPaper} expanding={researchNetworkLoading} /> : <ReadingOrderWorkbench map={researchMap} trackFilter={paperNetworkTrackId} locale={locale} selectedPaperId={selectedNetworkPaperId} learningState={activeLearningState} learningLoading={activeLearningLoading} learningError={activeLearningError} learningAction={learningAction} onSelect={changeNetworkFocus} onToggleStep={(step) => void updateLearningStep(step)} onGenerate={(track) => { const route = track || effectiveNetworkOriginNodes[0]?.track; if (route) openRouteLearningPath(route, currentGraphTask); else { setLearningPlannerOpen(true); navigate("learn"); } }} onRetry={() => setLearningReloadNonce((current) => current + 1)} />}
                    </div>
                    {showNetworkPaperDrawer && selectedNetworkNode && <aside className="v2-paper-network-drawer" aria-label={locale === "zh" ? "论文详情" : "Paper details"}>
                      <button className="v2-paper-drawer-close" type="button" onClick={() => changeNetworkFocus(null)} aria-label={t.close}>×</button>
                      <p className="v2-kicker">{selectedNetworkNode.external ? (locale === "zh" ? "外部候选 · 尚未收入地图" : "External candidate · not in map") : researchRoleLabel(selectedNetworkNode.paper.role, locale)} · {researchPaperYear(selectedNetworkNode.paper)}</p>
                      <div className="v2-paper-drawer-state"><span className="focused">{locale === "zh" ? "当前聚焦" : "Current focus"}</span>{effectiveNetworkOriginIds.includes(selectedNetworkNode.paper.id) && <span className="origin">{locale === "zh" ? "起始论文" : "Origin paper"}</span>}{paperNetworkScope === "one-hop" && <span>{selectedVerifiableOneHopCount} {locale === "zh" ? "条可核验一跳" : "verified one-hop"}</span>}</div>
                      <h2><MathText inline>{selectedNetworkNode.paper.title}</MathText></h2>
                      <small>{[selectedNetworkNode.paper.authors, selectedNetworkNode.paper.venue, `${selectedNetworkNode.paper.citationCount} ${t.citations}`].filter(Boolean).join(" · ")}</small>
                      <div className="v2-paper-drawer-copy"><b>{t.introLabel}</b><p>{locale === "zh" ? selectedNetworkNode.paper.summaryZh : selectedNetworkNode.paper.summaryEn}</p><b>{locale === "zh" ? "路线位置" : "Place in the route"}</b><p>{locale === "zh" ? selectedNetworkNode.paper.rationaleZh : selectedNetworkNode.paper.rationaleEn}</p></div>
                      {selectedNetworkNode.external && <div className="v2-paper-candidate-decision"><span>{networkCandidateFitLabel(selectedNetworkNode.external.score, locale)} · {locale === "zh" ? `${currentOriginEvidenceCount(selectedNetworkNode.external, effectiveNetworkOriginCanonicalIds)} 个当前起点有独立关系证据` : `${currentOriginEvidenceCount(selectedNetworkNode.external, effectiveNetworkOriginCanonicalIds)} active origin(s) with independent relation evidence`}</span><div><button type="button" disabled={researchNetworkDecisions[selectedNetworkNode.external.canonicalId] === "saving" || researchNetworkDecisions[selectedNetworkNode.external.canonicalId] === "accepted"} onClick={() => void decideResearchNetworkCandidate(selectedNetworkNode.external!, "accept")}>{researchNetworkDecisions[selectedNetworkNode.external.canonicalId] === "accepted" ? (locale === "zh" ? "已收录" : "Added") : (locale === "zh" ? "收录到地图" : "Add to map")}</button><button type="button" disabled={researchNetworkDecisions[selectedNetworkNode.external.canonicalId] === "saving"} onClick={() => void decideResearchNetworkCandidate(selectedNetworkNode.external!, "dismiss")}>{locale === "zh" ? "忽略" : "Dismiss"}</button></div></div>}
                      {selectedModeNetworkRelations.length > 0 && <div className="v2-paper-drawer-relations"><b>{paperNetworkMode === "citations" ? (locale === "zh" ? "已核验引用" : "Verified citations") : (locale === "zh" ? "关键关系" : "Key relationships")}</b>{selectedModeNetworkRelations.map((edge) => { const outgoingCitation = edge.kind === "citation" && edge.sourcePaperId === selectedNetworkNode.paper.id; const otherId = edge.sourcePaperId === selectedNetworkNode.paper.id ? edge.targetPaperId : edge.sourcePaperId; const other = allNetworkPaperNodes.find((node) => node.paper.id === otherId); if (!other) return null; const relationLabel = edge.kind === "citation" ? outgoingCitation ? (locale === "zh" ? "本论文引用了" : "This paper cites") : (locale === "zh" ? "后续论文引用了本论文" : "Later paper cites this work") : networkRelationLabel(edge, locale); return <button type="button" key={edge.id} onClick={() => changeNetworkFocus(other.paper.id)}><span>{relationLabel} · {networkEvidenceLabel(edge, locale)}</span><strong><MathText inline>{other.paper.title}</MathText></strong><small>{locale === "zh" ? edge.relationshipZh : edge.relationshipEn}</small></button>; })}</div>}
                      {paperNetworkMode === "similarity" && <div className="v2-paper-origin-actions"><button type="button" className={paperNetworkScope === "one-hop" ? "active" : ""} onClick={() => changeNetworkScope(paperNetworkScope === "one-hop" ? "all" : "one-hop")}>{paperNetworkScope === "one-hop" ? (locale === "zh" ? "返回完整图谱" : "Back to full graph") : (locale === "zh" ? "查看可核验一跳" : "View verified one-hop")}</button><button type="button" onClick={() => void generateResearchNetworkFrom(selectedNetworkNode)} disabled={researchNetworkLoading || Boolean(selectedNetworkNode.external && researchNetworkDecisions[selectedNetworkNode.external.canonicalId] !== "accepted")}>{selectedNetworkNode.external && researchNetworkDecisions[selectedNetworkNode.external.canonicalId] !== "accepted" ? (locale === "zh" ? "收录后可生成新图" : "Add before rebuilding") : (locale === "zh" ? "以此生成新图" : "Build new graph from this")}</button><button type="button" onClick={() => addMultiNetworkOrigin(selectedNetworkNode)} disabled={effectiveNetworkOriginIds.includes(selectedNetworkNode.paper.id) || explicitNetworkOriginNodes.length >= 3 || Boolean(selectedNetworkNode.external && researchNetworkDecisions[selectedNetworkNode.external.canonicalId] !== "accepted")}>{effectiveNetworkOriginIds.includes(selectedNetworkNode.paper.id) ? (locale === "zh" ? "已是起点" : "Already an origin") : (locale === "zh" ? "加入联合种子" : "Add as origin")}</button></div>}
                      <footer><a href={selectedNetworkNode.paper.url || (selectedNetworkNode.paper.doi ? "https://doi.org/" + selectedNetworkNode.paper.doi : "#")} target="_blank" rel="noreferrer" onClick={() => recordMapPaperOpen(selectedNetworkNode.track.id)}>{t.openOriginal} ↗</a><button type="button" onClick={() => askAboutNetworkPaper(selectedNetworkNode)}>{locale === "zh" ? "让 Pi 解释" : "Ask Pi"}</button><button type="button" onClick={() => addNetworkPaperToLearningPath(selectedNetworkNode)}>{locale === "zh" ? "以此方向规划路径" : "Plan from this direction"}</button></footer>
                    </aside>}
                  </div>
                  </details>
                </section>}
              </>
            ) : <section className="v2-map-empty"><InterfaceIcon name="route" className="pi-state-mark" /><h2>{locale === "zh" ? "暂时没有可展示的真实路线" : "No real route is available yet"}</h2><p>{locale === "zh" ? "Pi 不会用演示论文填充这里。稍后重新进入即可再次尝试。" : "Pi will not fill this area with demo papers. Return later to retry."}</p></section>}
            </section>
          </main>
        )}

        {(view === "thread-detail" || view === "paper-detail" && paperReturnView === "thread-detail" || view === "workbook" && workbookReturnView === "thread-detail" || view === "paper-detail" && paperReturnView === "workbook" && workbookReturnView === "thread-detail") && (
          <main hidden={view !== "thread-detail"} className="v2-page v2-detail-page v2-map-detail v2-route-workspace">
            <button className="v2-back" type="button" onClick={() => navigate("threads")}>← {locale === "zh" ? "返回路线总览" : "Back to route overview"}</button>
            {selectedThread ? <>
              <section className="v2-route-workspace-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {directionRoleLabel(selectedThread.userRole, locale)}</p><h1><MathText inline>{locale === "zh" ? selectedThread.titleZh : selectedThread.titleEn}</MathText></h1><p className="pi-route-scope">{locale === "zh" ? selectedThread.summaryZh : selectedThread.summaryEn}</p><details className="v2-route-summary"><summary>{locale === "zh" ? "收录与更新情况" : "Collection and updates"}</summary><div className="v2-route-workspace-meta"><span className={`v2-direction-heat ${selectedThread.heatLevel}`} title={directionHeatTitle(selectedThread, locale)}><i />{directionHeatLabel(selectedThread.heatLevel, locale)}</span><RouteOperationalBadge track={selectedThread} locale={locale} />{selectedThread.buildStatus !== "ready" && <span>{researchTrackBuildSummary(selectedThread, locale)}</span>}<span>{confirmedRouteEvidenceCount(selectedThread)} {locale === "zh" ? "篇已确认" : "confirmed"}</span>{pendingRouteEvidenceCount(selectedThread) > 0 && <span>{pendingRouteEvidenceCount(selectedThread)} {locale === "zh" ? "篇待确认" : "pending"}</span>}</div></details></div></section>



              <nav className="v2-route-workspace-tabs pi-route-navigation" aria-label={locale === "zh" ? "路线工作区" : "Route workspace"}>{(["start", "evidence", "problem", "agenda"] as ResearchRouteTab[]).map((tab) => <button type="button" aria-current={researchRouteTab === tab ? "page" : undefined} className={researchRouteTab === tab ? "active" : ""} key={tab} onClick={() => setResearchRouteTab(tab)}><strong>{tab === "start" ? (locale === "zh" ? "概览" : "Overview") : tab === "problem" ? (locale === "zh" ? "问题与判断" : "Question & findings") : tab === "assessment" ? (locale === "zh" ? "综合研判" : "Synthesis") : tab === "evidence" ? (locale === "zh" ? "材料" : "Materials") : tab === "gaps" ? (locale === "zh" ? "材料补充" : "Collect materials") : (locale === "zh" ? "任务" : "Tasks")}</strong>{tab === "problem" && researchProblemState?.problem?.status === "active" && <b>✓</b>}{tab === "evidence" && <b>{routeMaterialState(selectedThread).paperIds.length}</b>}{tab === "gaps" && pendingRouteEvidenceCount(selectedThread) > 0 && <b>{pendingRouteEvidenceCount(selectedThread)}</b>}</button>)}</nav>

              {researchRouteTab === "start" && <DeferredWorkspacePanel locale={locale}><RouteStart track={selectedThread} synthesis={researchSynthesis} loading={researchSynthesisLoading} failed={Boolean(researchSynthesisError)} locale={locale} onEvidence={() => setResearchRouteTab("evidence")} onMaterials={() => setResearchRouteTab("gaps")} onSynthesis={() => setResearchRouteTab("assessment")} onPaperOpen={() => recordMapPaperOpen(selectedThread.id)} onCompare={() => openWorkbook(selectedThread.id)} onProblem={() => setResearchRouteTab("problem")} onLearn={() => openRouteLearningPath(selectedThread)} question={researchProblemState?.problem?.status === "active" ? researchProblemState.problem.question : undefined} /></DeferredWorkspacePanel>}

              <div hidden={!["problem", "agenda"].includes(researchRouteTab)}><ResearchProblemWorkbench draftStorageKey={sessionDraftKey(user.userId, activeSpace.id, `problem:${selectedThread.id}`)} mode={researchRouteTab === "agenda" ? "tasks" : "question"} key={`${selectedThread.id}:${researchProblemState?.problem?.id || "empty"}:${researchProblemState?.problem?.updatedAt || "pending"}`} state={researchProblemState} synthesis={researchSynthesis} loading={researchProblemLoading} action={researchProblemAction || (mapAction === `problem:${selectedThread.id}` ? "scan-problem" : null)} error={researchProblemError} locale={locale} onSynthesis={() => { setResearchRouteTab("problem"); requestAnimationFrame(() => focusWorkspaceSection(".v2-research-synthesis")); }} onDraft={() => void draftResearchProblem()} onConfirm={(draft) => void confirmResearchProblem(draft)} onAssess={() => void assessResearchProblem()} onScanProblem={() => void scanResearchProblemGap(selectedThread)} onUpdateAction={(actionId, status) => void updateResearchProblemAction(actionId, status)} onExecuteAction={(item) => void executeResearchProblemAction(item)} /></div>
              {researchRouteTab === "problem" && <ResearchSynthesisWorkbench reviewStages={Object.fromEntries(historyPapers.map(p => [p.id, p.qualityStage]))} track={selectedThread} synthesis={researchSynthesis} loading={researchSynthesisLoading} error={researchSynthesisError} locale={locale} onMaterials={() => setResearchRouteTab("evidence")} onPaper={(id) => void openRoutePaper(id)} onRefresh={() => void refreshResearchSynthesis(selectedThread)} onScanGap={() => void scanResearchRouteGap(selectedThread)} onExplain={() => askAboutResearchRoute(selectedThread, "gap")} />}

              {researchRouteTab === "evidence" && <section className="v2-route-workspace-panel v2-route-evidence-panel" role="tabpanel">
                <button type="button" onClick={() => openWorkbook(selectedThread.id)}>{locale === "zh" ? "比较条件、制定任务并留下研究产物" : "Compare conditions, plan a task and record an artifact"} →</button>
                <header><div><p className="v2-kicker">{locale === "zh" ? "路线论文与证据状态" : "ROUTE PAPERS & EVIDENCE STATUS"}</p><h2>{locale === "zh" ? "路线材料" : "Route materials"}</h2></div><div className="v2-route-stage-counts">{(["foundation", "milestone", "frontier", "background"] as ResearchTrackRole[]).map((role) => <span className={role} key={role}><i />{researchRoleLabel(role, locale)}<b>{selectedThread.papers.filter((paper) => paper.role === role).length}</b></span>)}</div></header>
                {!selectedThread.papers.length && <p className="pi-route-no-materials">{locale === "zh" ? "先从下方相关文献中选用材料，或前往材料补充查看收集情况。" : "Choose papers below, or open Collect materials to check discovery."}</p>}<div className="v2-route-evidence-chain">{(["foundation", "milestone", "frontier", "background"] as ResearchTrackRole[]).filter(role => selectedThread.papers.some(paper => paper.role === role)).map((role, roleIndex) => <section className={role} key={role}><header><span>{String(roleIndex + 1).padStart(2, "0")}</span><div><strong>{researchRoleLabel(role, locale)}</strong><small>{role === "background" ? (locale === "zh" ? "与路线相关的工具和综述" : "Related tools and surveys") : role === "foundation" ? (locale === "zh" ? "定义问题与基本工具" : "Defines the question and core tools") : role === "milestone" ? (locale === "zh" ? "改变路线走向的关键节点" : "Turning points that changed the route") : (locale === "zh" ? "当前活跃问题与方法" : "Current active questions and methods")}</small></div></header><div>{selectedThread.papers.filter((paper) => paper.role === role).map((paper) => <article key={paper.id}><header><span>{researchPaperYear(paper)}</span><small>{[paper.venue, `${paper.citationCount} ${t.citations}`].filter(Boolean).join(" · ")}</small></header>{paper.provenance === "user_confirmed" && <em className="v2-route-provenance user_confirmed">{locale === "zh" ? "用户确认纳入" : "User confirmed in route"}</em>}<h3><button className="pi-paper-title-link" type="button" onClick={() => void openRoutePaper(paper.id)}><MathText inline>{paper.title}</MathText></button></h3><p>{locale === "zh" ? paper.rationaleZh : paper.rationaleEn}</p><footer><button type="button" onClick={() => demo ? void openRoutePaper(paper.id) : askAboutRoutePaper(selectedThread, paper)}>{locale === "zh" ? "为什么读这篇" : "Why read this paper"}</button><a href={paper.url || (paper.doi ? "https://doi.org/" + paper.doi : "#")} target="_blank" rel="noreferrer" onClick={() => recordMapPaperOpen(selectedThread.id)}>{t.openOriginal} ↗</a>{paper.provenance !== "user_confirmed" && <details className="pi-route-node-actions"><summary>{locale === "zh" ? "认为不相关？" : "Not relevant?"}</summary><p>{locale === "zh" ? "只从本路线停用，保留论文与历史，可在已停用节点中恢复。" : "Deactivate in this route only. The paper and history remain, and the node can be restored."}</p><button className="v2-route-node-deactivate" type="button" disabled={Boolean(mapAction)} onClick={() => void curateResearchTrackPaperNode(selectedThread, paper, "deactivated")}>{mapAction === `curate:${paper.id}` ? "…" : (locale === "zh" ? "从本路线移除" : "Remove from this route")}</button></details>}</footer></article>)}{!selectedThread.papers.some((paper) => paper.role === role) && <div className="v2-route-chain-empty"><span>＋</span><p>{locale === "zh" ? "本空间尚未收录此类材料，不代表相关研究不存在。" : "This workspace has not collected this category yet; relevant research may already exist."}</p><button type="button" onClick={() => { setResearchRouteTab("gaps"); }}>{locale === "zh" ? "查看材料补充" : "View collection status"} →</button></div>}</div></section>)}</div>
                {(selectedThread.deactivatedPapers || []).length > 0 && <details className="v2-route-deactivated-nodes"><summary><span><small>{locale === "zh" ? "保留在审计历史中" : "RETAINED IN AUDIT HISTORY"}</small><strong>{locale === "zh" ? "已停用路线节点" : "Deactivated route nodes"}</strong></span><b>{selectedThread.deactivatedPapers?.length || 0}</b></summary><div>{(selectedThread.deactivatedPapers || []).map((paper) => <article key={paper.id}><header><span>{locale === "zh" ? "不参与路线供稿" : "Excluded from active route supply"}</span><small>{paper.curationUpdatedAt ? formatNotificationTime(paper.curationUpdatedAt, locale) : ""}</small></header><h3><MathText inline>{paper.title}</MathText></h3><p>{locale === "zh" ? paper.curationReasonZh : paper.curationReasonEn}</p><footer><span>{routePaperCurationSourceLabel(paper, locale)} · {(paper.curationEvidence || []).length} {locale === "zh" ? "条审计证据" : "audit signals"}</span><button type="button" disabled={Boolean(mapAction)} onClick={() => void curateResearchTrackPaperNode(selectedThread, paper, "active")}>{mapAction === `curate:${paper.id}` ? "…" : (locale === "zh" ? "恢复节点" : "Restore node")}</button></footer></article>)}</div></details>}
              <DeferredWorkspacePanel locale={locale}><LibraryExplorer key={activeSpace.id + selectedThread.id} spaceId={activeSpace.id} trackId={selectedThread.id} locale={locale} initialState={libraryViewState} onStateChange={(state,history)=>{setLibraryViewState({query:state.query||'',scope:state.scope||'related',page:state.page||1,focusId:state.focusId||''});updateWorkspaceHash({libraryQuery:state.query,libraryScope:state.scope,libraryPage:state.page,libraryFocus:state.focusId},history);}} routes={[{id:selectedThread.id,title:locale === "zh" ? selectedThread.titleZh : selectedThread.titleEn}]} onCompare={(id,context)=>openWorkbook(id,context)} onOpen={id => void openRoutePaper(id)} /></DeferredWorkspacePanel></section>}

                    {researchRouteTab === "evidence" && <section className="v2-route-workspace-panel v2-route-gap-panel" role="tabpanel">
                      <header><div><p className="v2-kicker">{locale === "zh" ? "本空间的材料覆盖" : "WORKSPACE COLLECTION"}</p><h2>{locale === "zh" ? "待收录与待核对材料" : "Materials to collect and check"}</h2></div><div className="v2-route-evidence-status"><span><strong>{confirmedRouteEvidenceCount(selectedThread)}</strong>{locale === "zh" ? "已纳入" : "in route"}</span><span className={pendingRouteEvidenceCount(selectedThread) ? "pending" : ""}><strong>{pendingRouteEvidenceCount(selectedThread)}</strong>{locale === "zh" ? "待确认" : "pending"}</span></div></header>
                      {selectedThread.intelligence ? <div className="v2-route-gap-layout"><article className="v2-route-gap-primary"><small>{locale === "zh" ? "材料检索建议 · 尚未证明是学界空白" : "COLLECTION SUGGESTION · NOT AN ESTABLISHED RESEARCH GAP"}</small><h3>{locale === "zh" ? selectedThread.intelligence.evidenceGapZh : selectedThread.intelligence.evidenceGapEn}</h3><ResearchGapDiscoveryStatus track={selectedThread} locale={locale} />{selectedThread.intelligence.nextSearchQuery && <details className="v2-gap-query"><summary>{locale === "zh" ? "查看定向检索式" : "View targeted query"}<b>＋</b></summary><code>{selectedThread.intelligence.nextSearchQuery}</code></details>}<footer><button type="button" onClick={() => void scanResearchRouteGap(selectedThread)} disabled={Boolean(mapAction || mapBuildTrackId || selectedThread.monitoringStatus === "paused" || !selectedThread.intelligence.nextSearchQuery)}>{mapAction === `gap:${selectedThread.id}` ? (locale === "zh" ? "正在扫描…" : "Scanning…") : selectedThread.monitoringStatus === "paused" ? (locale === "zh" ? "恢复后扫描" : "Resume to scan") : (locale === "zh" ? "立即扫描" : "Run scan")} →</button><button type="button" onClick={() => askAboutResearchRoute(selectedThread, "gap")}>{locale === "zh" ? "解释材料需求" : "Explain material needs"}</button></footer></article><aside><header><strong>{locale === "zh" ? "前沿代表作" : "Frontier representatives"}</strong><span>{selectedThread.papers.filter((paper) => paper.role === "frontier").length}</span></header>{selectedThread.papers.filter((paper) => paper.role === "frontier").slice(0, 3).map((paper) => <button type="button" key={paper.id} onClick={() => demo ? void openRoutePaper(paper.id) : askAboutRoutePaper(selectedThread, paper)}><span>{researchPaperYear(paper)}</span><strong><MathText inline>{paper.title}</MathText></strong></button>)}{!selectedThread.papers.some((paper) => paper.role === "frontier") && <p>{locale === "zh" ? "暂无前沿代表作。" : "No frontier representative yet."}</p>}</aside></div> : <div className="v2-route-panel-empty"><InterfaceIcon name="search" className="pi-state-mark" /><div><strong>{locale === "zh" ? "暂未形成材料检索建议" : "No collection suggestion yet"}</strong><p>{locale === "zh" ? "这表示本空间的整理尚未完成，不表示学界没有相关工作。" : "This workspace is still being organized; this does not mean relevant research is absent."}</p></div><button type="button" onClick={() => void refreshDirectionIntelligence(selectedThread)} disabled={!selectedThread.papers.length || selectedThread.monitoringStatus === "paused"}>{selectedThread.monitoringStatus === "paused" ? (locale === "zh" ? "恢复后研判" : "Resume to assess") : (locale === "zh" ? "形成研判" : "Build assessment")} →</button></div>}
                    </section>}

              {researchRouteTab === "agenda" && <section className="v2-route-workspace-panel v2-route-agenda-panel" role="tabpanel">
                <header><div><p className="v2-kicker">{locale === "zh" ? "下一步" : "NEXT"}</p><h2>{locale === "zh" ? "研究计划" : "Research plan"}</h2></div><button type="button" onClick={() => askAboutResearchRoute(selectedThread, "agenda")}>{locale === "zh" ? "拆解行动" : "Break into actions"} →</button></header>
                <div className="pi-route-next-actions"><h3>{locale === "zh" ? "从一项具体工作开始" : "Start with one concrete task"}</h3>
                  <p>{locale === "zh" ? "比较已审核论文的适用条件，记录仍需核查的问题。" : "Compare conditions in reviewed papers and record unresolved questions."}</p><button type="button" className="pi-research-primary" onClick={() => openWorkbook(selectedThread.id)}>{locale === "zh" ? "开始一次论文比较" : "Start a paper comparison"} →</button>
                  <button type="button" onClick={() => openRouteLearningPath(selectedThread)}>{locale === "zh" ? "先补充阅读与基础" : "Start with reading and foundations"}</button>
                </div>
                {selectedThreadChanges.length > 0 && <section className="v2-route-change-log"><header><strong>{locale === "zh" ? "最近确认的变化" : "Recent confirmed changes"}</strong><span>{selectedThreadChanges.length}</span></header>{selectedThreadChanges.map((change) => <article key={change.id}><InterfaceIcon name={routeChangeKindLabel(change.kind).symbol} /><div><small>{formatNotificationTime(change.createdAt, locale)}</small><strong>{change.kind === "new_evidence" ? change.paperTitle : (locale === "zh" ? change.titleZh : change.titleEn)}</strong><p>{locale === "zh" ? change.summaryZh : change.summaryEn}</p></div></article>)}</section>}
              </section>}

              {researchRouteTab === "start" && <DeferredWorkspacePanel locale={locale}><RouteReferenceViews selectedTrack={selectedThread} mode="connections" tracks={researchMap.tracks} edges={researchMap.edges} locale={locale} onPaper={id => void openRoutePaper(id)} onMaterials={track => openThread(track, "evidence")} /></DeferredWorkspacePanel>}
              {researchRouteTab === "start" && <ResearchMaintenance key={activeSpace.id+selectedThread.id} spaceId={activeSpace.id} trackId={selectedThread.id} locale={locale} />}
              <RouteManagementDrawer key={`${selectedThread.id}:${routeManagementNeedsAttention(selectedThread) ? "attention" : "quiet"}`} track={selectedThread} locale={locale}>
              <ResearchLeadDecisionPanel track={selectedThread} problemState={researchProblemState} synthesis={researchSynthesis} locale={locale} onOpenWorkspace={setResearchRouteTab} onOpenToday={() => navigate("today")} onOpenLearning={() => openRouteLearningPath(selectedThread)} onScanGap={(origin) => void scanResearchRouteSignal(selectedThread, origin)} gapScanning={mapAction === `gap:${selectedThread.id}` || mapAction === `problem:${selectedThread.id}`} gapScanBlocked={Boolean(mapAction || mapBuildTrackId || mapIntelligenceTrackId || selectedThread.monitoringStatus === "paused")} />
                <section className={`v2-route-role-strip ${selectedThread.userRole} ${selectedThread.monitoringStatus}`}><div><small>{locale === "zh" ? "当前定位" : "CURRENT ROLE"}</small><strong>{directionRoleLabel(selectedThread.userRole, locale)}</strong><p>{locale === "zh" ? "定位会改变后续扫描预算和路线优先级；暂停只停止新发现，不清除任何历史。" : "This role changes future discovery budget and priority; pausing only stops new discovery and clears no history."}</p></div><div className="v2-direction-role-control" role="group" aria-label={locale === "zh" ? "设置方向定位" : "Set direction role"}>{(["core", "support", "explore"] as ResearchDirectionRole[]).map((role) => <button type="button" className={selectedThread.userRole === role ? "active" : ""} key={role} onClick={() => void setResearchDirectionRole(selectedThread, role)} disabled={Boolean(mapAction)}>{directionRoleLabel(role, locale)}</button>)}<button type="button" className={`monitor-toggle ${selectedThread.monitoringStatus}`} onClick={() => void setResearchDirectionMonitoring(selectedThread, selectedThread.monitoringStatus === "paused" ? "active" : "paused")} disabled={Boolean(mapAction)}>{mapAction === `monitoring:${selectedThread.id}` ? "…" : selectedThread.monitoringStatus === "paused" ? (locale === "zh" ? "恢复路线" : "Resume route") : (locale === "zh" ? "暂停路线" : "Pause route")}</button></div><dl><div><dt>{locale === "zh" ? "研究深度" : "Depth"}</dt><dd>{selectedThread.depthScore}</dd></div><div><dt>{locale === "zh" ? "辅助价值" : "Support"}</dt><dd>{selectedThread.supportScore}</dd></div><div><dt>{locale === "zh" ? "近期证据" : "Recent"}</dt><dd>{selectedThread.recentPaperCount}</dd></div></dl></section>
                <div className="v2-route-management-actions"><button type="button" onClick={() => askAboutResearchRoute(selectedThread)}>{locale === "zh" ? "让 Pi 解释这条路线" : "Ask Pi about this route"}</button><button type="button" onClick={() => void expandResearchTrack(selectedThread)} disabled={Boolean(mapAction || mapBuildTrackId || selectedThread.monitoringStatus === "paused")}>{mapAction === selectedThread.id ? (locale === "zh" ? "正在补充…" : "Filling…") : selectedThread.monitoringStatus === "paused" ? (locale === "zh" ? "已暂停自动发现" : "Automatic discovery paused") : ["queued", "retryable", "empty", "failed"].includes(selectedThread.buildStatus) ? (locale === "zh" ? "重试补充这条路线" : "Retry this route") : selectedThread.buildStatus === "partial" ? (locale === "zh" ? "补全这条路线" : "Complete this route") : (locale === "zh" ? "继续填充这条路线" : "Continue this route")} ＋</button></div>
                <RouteDiscoveryLoop track={selectedThread} locale={locale} />
                <DeferredWorkspacePanel locale={locale}><RouteEvolutionWorkbench track={selectedThread} locale={locale} action={mapAction} formatNotificationTime={formatNotificationTime} onPropose={() => void proposeResearchRouteEvolution(selectedThread)} onDecision={(revisionId, decision) => void decideResearchRouteEvolution(selectedThread, revisionId, decision)} /></DeferredWorkspacePanel>
              </RouteManagementDrawer>
            </> : <section className="v2-map-loading"><InterfaceIcon name="loading" className="pi-state-mark" /><div><strong>{locale === "zh" ? "正在载入研究路线" : "Loading the research route"}</strong></div></section>}
          </main>
        )}

        {(view === "learn" || view === "paper-detail" && paperReturnView === "learn" || view === "workbook" && workbookReturnView === "learn" || view === "paper-detail" && paperReturnView === "workbook" && workbookReturnView === "learn") && (
          <main hidden={view !== "learn"} className="v2-page v2-learn-page">
            <header className="v2-page-head"><div><h1>{t.learnTitle}</h1><p className="pi-page-purpose">{locale === "zh" ? "确定学习目标，按阶段阅读与练习，完成后再推进下一步。" : "Set your goal, work through reading and exercises, then move to the next stage."}</p></div></header>
            {activeLearningState.path?.targetTrackId && <div className="pi-study-path-links"><button type="button" onClick={() => { const track = researchMap.tracks.find(t => t.id === activeLearningState.path?.targetTrackId); if (track) openThread(track); }} disabled={!researchMap.tracks.some(t => t.id === activeLearningState.path?.targetTrackId)}>{locale === "zh" ? "返回所属研究路线" : "Back to research route"}</button><button type="button" onClick={() => openWorkbook(activeLearningState.path!.targetTrackId!)}>{locale === "zh" ? "比较论文与学习练习" : "Paper comparison & exercise"}</button></div>}
            {activeLearningStep && <LearningSessionEntry step={activeLearningStep} locale={locale} openingId={openingLearningResourceId} onOpen={resource => void openLearningResource(resource)} />}
            <LearningGoalPlanner onRead={id => void openRoutePaper(id, "learn")} key={`${activeSpace.id}:${activeLearningState.path?.id || "new"}:${learningTargetTrackId || "custom"}:${learningTarget}:${JSON.stringify(learningTask || null)}`} spaceId={activeSpace.id} tracks={learningTargetTrackId && !researchMap.tracks.some(t => t.id === learningTargetTrackId) ? [...researchMap.tracks, {id:learningTargetTrackId,titleZh:learningTarget,titleEn:learningTarget}] : researchMap.tracks} target={learningTarget} trackId={learningTargetTrackId} path={activeLearningState.path} taskContext={learningTask?.spaceId === activeSpace.id ? learningTask : undefined} locale={locale} open={learningPlannerOpen || !activeLearningState.path || activeLearningPathDirectionMismatch} onOpen={setLearningPlannerOpen} onCommit={id => generateLearningPath(undefined, undefined, id)} busy={Boolean(learningAction) || activeLearningLoading} />
            {activeLearningLoading ? <section className="v2-learning-loading" role="status"><InterfaceIcon name="loading" className="pi-state-mark" /><div><strong>{locale === "zh" ? "正在载入学习路径" : "Loading the learning path"}</strong><i><b /></i></div></section> : activeLearningError && !activeLearningState.path ? <div className="v2-learning-empty error" role="alert"><InterfaceIcon name="warning" className="pi-state-mark" /><h2>{locale === "zh" ? "学习路径载入失败" : "Learning path failed to load"}</h2><p>{activeLearningError}</p><button type="button" onClick={() => setLearningReloadNonce((current) => current + 1)}>{locale === "zh" ? "重新载入" : "Retry"} →</button></div> : activeLearningState.path ? (
              <section className="v2-learning-path">
                {activeLearningState.path.model === "evidence-structure-v1" && <p role="status">{learningPathResultMessage(activeLearningState.path, locale)} <button type="button" disabled={Boolean(learningAction)} onClick={() => setLearningPlannerOpen(true)}>{locale === "zh" ? "重试规划" : "Retry planning"}</button></p>}
                {activeLearningPathDirectionMismatch && <div className="v2-reading-order-warning direction" role="status"><span>↔</span><p>{!learningTargetTrackId && learningScopeDirty ? (locale === "zh" ? `下面的旧路径限定于“${activeLearningState.path.target}”；你已切换为从全空间论文中规划。重新规划前，旧进度不会被冒充为全空间结果。` : `The saved path below is scoped to “${activeLearningState.path.target}”; you have switched to planning from the full workspace. Existing progress will not be presented as a workspace-wide result before replanning.`) : (locale === "zh" ? `下面是此前保存的“${activeLearningState.path.target}”路径；你现在准备规划“${activeLearningTargetTrack?.titleZh || learningTarget}”。点击重新规划前，旧进度不会被冒充为当前范围。` : `The path below was saved for “${activeLearningState.path.target}”; you are now preparing “${activeLearningTargetTrack?.titleEn || learningTarget}”. Existing progress will not be presented as the selected scope before replanning.`)}</p><button type="button" disabled={Boolean(learningAction)} onClick={() => setLearningPlannerOpen(true)}>{learningTargetTrackId ? (locale === "zh" ? "按当前方向重新规划" : "Replan this direction") : (locale === "zh" ? "按全空间重新规划" : "Replan across the workspace")}</button></div>}
                {activeLearningError && <div className="v2-reading-order-warning" role="status"><span>!</span><p>{locale === "zh" ? "上次更新没有完成；下面仍是当前空间中已保存的版本。" : "The last update did not finish; the saved version for this space remains below."} {activeLearningError}</p><button type="button" onClick={() => setLearningReloadNonce((current) => current + 1)}>{locale === "zh" ? "重新载入" : "Reload"}</button></div>}

                <LearningPathHeader path={activeLearningState.path} locale={locale} busy={Boolean(learningAction)} onAdjust={() => { setLearningPlannerOpen(true); document.getElementById("learning-goal-planner")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} onRefresh={() => void generateLearningPath(activeLearningState.path!.target, activeLearningState.path!.targetTrackId)} />
                <div className="pi-study-layout">
                <LearningStageNavigation steps={activeLearningState.path.steps} selectedId={activeLearningStep?.id} currentId={currentLearningStep?.id} locale={locale} label={learningEvidenceLabel} onSelect={(stepId) => { setLearningBrowseSelection({ scope: learningBrowseScope, stepId }); navigate("learn", workbookTrackId, { step: stepId, path: activeLearningState.path?.id }, true); }} />
                <div className="pi-study-session">
                {readableLearningStep && <aside className="pi-study-available"><strong>{locale === "zh" ? "当前阶段的材料还在准备，可以先浏览已有阅读" : "This stage is waiting for materials; another reading is available"}</strong><button type="button" onClick={() => { setLearningBrowseSelection({ scope: learningBrowseScope, stepId: readableLearningStep.id }); navigate("learn", workbookTrackId, { step: readableLearningStep.id, path: activeLearningState.path?.id }, true); }}>{locale === "zh" ? readableLearningStep.titleZh : readableLearningStep.titleEn} →</button></aside>}
                {activeLearningStep && currentLearningStep && activeLearningStep.id !== currentLearningStep.id && <p className="pi-learning-browse-note">{locale === "zh" ? "查看本阶段材料，不改变学习进度。" : "Browsing these materials does not change your progress."}<button type="button" onClick={() => { setLearningBrowseSelection(null); navigate("learn", workbookTrackId, { step: undefined, path: undefined }, true); }}>{locale === "zh" ? "返回当前进度" : "Back to current progress"}</button></p>}
                {activeLearningStep && <LearningStageWorkspace step={activeLearningStep} locale={locale} openingId={openingLearningResourceId} onOpen={resource => void openLearningResource(resource)} signals={learningResourceSignals} canComplete={canChangeLearningStep(activeLearningStep, currentLearningStep)} busy={Boolean(learningAction)} onComplete={() => void updateLearningStep(activeLearningStep)} duration={learningTime(activeLearningStep.estimatedMinutes, locale)} />}
                </div></div>
              </section>
            ) : <section className="v2-learning-empty"><InterfaceIcon name="reading" className="pi-state-mark" /><h2>{locale === "zh" ? "还没有学习路径" : "No learning path yet"}</h2><p>{locale === "zh" ? "输入研究方向，生成分阶段阅读计划。缺少可靠论文的阶段会保留为空。" : "Enter a direction to build a staged reading plan. Stages without reliable papers remain empty."}</p></section>}
          </main>
        )}

        {(view === "library" || view === "paper-detail" && paperReturnView === "library" || view === "workbook" && workbookReturnView === "library" || view === "paper-detail" && paperReturnView === "workbook" && workbookReturnView === "library") && (
          <PrimaryLibrary
            visible={view === "library"}
            demo={demo}
            locale={locale}
            spaceId={activeSpace.id}
            spaceName={defaultSpaceName(activeSpace.name, locale)}
            monitorReadNotice={monitorReadNotice}
            labels={t}
            filter={libraryFilter}
            allFilterActive={libraryFilter === "all" && libraryStageFilter === "all"}
            sort={librarySort}
            tag={libraryTag as "all" | "saved" | "notes"}
            search={librarySearch}
            counts={libraryCounts}
            papers={visibleLibraryPapers}
            total={libraryTotal}
            page={libraryPage}
            readingSaving={readingSaving}
            sharingSnapshot={Boolean(sharingSnapshot)}
            remainingDemoCount={Math.max(0, libraryPapers.length - visibleLibraryPapers.length)}
            onFilter={(filter) => {
              setLibraryFilter(filter);
              setLibraryStageFilter("all");
              if (filter === "inbox") setInboxFilter("all");
              setLibraryPageNumber(1);
              updateWorkspaceHash({
                libraryFilter: filter === "all" ? undefined : filter,
                libraryStage: undefined,
                libraryInbox: undefined,
                libraryPage: undefined,
              }, "push");
            }}
            onSearch={(query, history) => {
              setLibrarySearch(query);
              setLibraryPageNumber(1);
              updateWorkspaceHash({ libraryQuery: query || undefined, libraryPage: undefined }, history);
            }}
            onSort={(sort) => {
              setLibrarySort(sort);
              setLibraryPageNumber(1);
              updateWorkspaceHash({ librarySort: sort === "priority" ? undefined : sort, libraryPage: undefined }, "push");
            }}
            onTag={(tag) => {
              setLibraryTag(tag);
              setLibraryPageNumber(1);
              updateWorkspaceHash({ libraryTag: tag === "all" ? undefined : tag, libraryPage: undefined }, "push");
            }}
            onClearAll={() => {
              setLibrarySearch("");
              setLibraryFilter("all");
              setLibraryStageFilter("all");
              setInboxFilter("all");
              setLibraryTag("all");
              setLibraryPageNumber(1);
              updateWorkspaceHash({ libraryQuery: undefined, libraryFilter: undefined, libraryStage: undefined, libraryInbox: undefined, libraryTag: undefined, libraryPage: undefined }, "push");
            }}
            onOpen={openMonitorPaper}
            onExploreGraph={(paper) => {
              setLibraryGraphPaperId(paper.id);
              setGraphReturnView("library");
              setResearchMapMode("papers");
              navigate("threads", workbookTrackId, { graph: paper.id, graphFrom: "library" });
            }}
            onReadingStatus={(paper, status) => void updateReadingProgress(paper, status)}
            onRelevant={(paper) => requestPaperDecision(paper, "relevant")}
            onLater={(paper) => saveFeedback(paper, "later")}
            onNotRelevant={(paper) => requestPaperDecision(paper, "not_relevant")}
            onReturnInbox={returnPaperToInbox}
            onShare={(paper) => shareSnapshot("paper", [paper])}
            onLoadMore={() => setLibraryVisibleCount((count) => count + 60)}
          />
        )}
        {view === "memory" && (
          <main className="v2-page pi-memory-workspace">
            <section className="v2-page-head"><div><h1>{locale === "zh" ? "研究记忆" : "Research memory"}</h1><p className="pi-page-purpose">{locale === "zh" ? "让每一次阅读，成为下一次发现的线索。" : "Let every reading guide your next discovery."}</p></div><div className="pi-memory-tools"><button type="button" onClick={openResearchImport}>{locale === "zh" ? "补充资料" : "Add context"}</button><button type="button" onClick={openSourceSettings} disabled={!monitor?.preferences}>{locale === "zh" ? "关注来源" : "Sources"}</button></div></section>
            <nav className="pi-memory-nav" aria-label={locale === "zh" ? "研究记忆分类" : "Research memory sections"}>
              <button type="button" aria-current={memorySection === "preferences" ? "page" : undefined} onClick={() => setMemorySection("preferences")}>{locale === "zh" ? "研究偏向" : "Research interests"}</button>
              <button type="button" aria-current={memorySection !== "preferences" ? "page" : undefined} onClick={() => setMemorySection("reading")}>{locale === "zh" ? "研究记录" : "Research records"}</button>
            </nav>
            {memorySection !== "preferences" && <nav className="pi-memory-record-nav" aria-label={locale === "zh" ? "研究记录分类" : "Record categories"}>{(["reading", "continue", "insights"] as const).map(section => <button key={section} aria-current={memorySection === section ? "page" : undefined} onClick={() => setMemorySection(section)}>{section === "reading" ? (locale === "zh" ? "阅读笔记" : "Reading notes") : section === "continue" ? (locale === "zh" ? "比较记录" : "Comparisons") : (locale === "zh" ? "笔记整理" : "Note insights")}</button>)}</nav>}

            {memorySection !== "preferences" && memoryRouteError && <p role="alert">{locale === "zh" ? "路线关联暂未载入，笔记仍可阅读。" : "Route links are unavailable; your notes remain accessible."}<button onClick={() => setMemoryRouteRetry(n => n + 1)}>{locale === "zh" ? "重试" : "Retry"}</button></p>}
            {memorySection === "continue" && <MemoryResume key={activeSpace.id} spaceId={activeSpace.id} locale={locale} routes={researchMap.tracks.map(track => ({ id:track.id,title:locale === "zh" ? track.titleZh : track.titleEn }))} onCompare={id => openWorkbook(id)} />}
            {(memorySection === "reading" || memorySection === "insights") && <DeferredWorkspacePanel locale={locale}><ResearchMemoryNotebook key={`${activeSpace.id}:${memorySection}`} routes={researchMap.tracks.map(track => ({title:locale === "zh" ? track.titleZh : track.titleEn,paperIds:track.papers.map(paper => paper.id)}))} mode={memorySection === "reading" ? "notes" : "insights"} spaceId={activeSpace.id} locale={locale} onOpenPaper={id => void openRoutePaper(id, "memory")} onLibrary={() => navigate("library")} onQuestion={(title, followup) => { setQuestion(locale === "zh" ? `基于论文“${title}”的阅读笔记，我想继续研究：${followup}。请区分已有依据和待验证假设。` : `From my reading note on “${title}”, explore: ${followup}. Separate evidence from hypotheses.`); setAskOpen(true); }} /></DeferredWorkspacePanel>}
            {memorySection === "reading" && <details className="pi-memory-calendar"><summary>{locale === "zh" ? "按日期回看阅读" : "Browse reading dates"}</summary><DeferredWorkspacePanel locale={locale}><ReadingCalendar key={`memory-calendar:${activeSpace.id}`} spaceId={activeSpace.id} locale={locale} onPaper={id => void openRoutePaper(id, "memory")} /></DeferredWorkspacePanel></details>}
            {memorySection === "insights" && confirmedProfile && <section className="pi-memory-profile">
              <header><h2>{locale === "zh" ? "从研究资料中积累" : "Insights from your materials"}</h2><p>{locale === "zh" ? "来自你确认过的资料画像。下列内容是 Pi 的归纳，依据可逐条核对。" : "Pi’s interpretation of the material profile you confirmed. Check the source context for each item."}</p><button type="button" onClick={openResearchImport}>{locale === "zh" ? "补充研究资料" : "Add research materials"} →</button></header>
              {confirmedProfile ? <>
                {([{title: locale === "zh" ? "知识与方法" : "Knowledge and methods", items: confirmedProfile.knowledge}, {title: locale === "zh" ? "继续研究的问题" : "Questions to pursue", items: confirmedProfile.openQuestions}]).map(group => <section className="pi-memory-profile-group" key={group.title}><h3>{group.title}</h3>{group.items.length ? group.items.map((item, index) => <article key={index}><h4>{locale === "zh" ? item.labelZh : item.labelEn}</h4><p>{locale === "zh" ? item.evidenceZh : item.evidenceEn}</p></article>) : <p>{locale === "zh" ? "后续确认的资料会在这里形成积累。" : "Insights from future confirmed materials will appear here."}</p>}</section>)}
                {confirmedProfile.researchOpportunities.length > 0 && <section className="pi-memory-profile-group"><h3>{locale === "zh" ? "可探索的方向" : "Directions to explore"}</h3><p>{locale === "zh" ? "Pi 提出的研究建议，需要进一步验证。" : "Suggestions from Pi for further investigation."}</p>{confirmedProfile.researchOpportunities.map((item, index) => <article key={index}><h4>{locale === "zh" ? item.titleZh : item.titleEn}</h4><p>{locale === "zh" ? item.rationaleZh : item.rationaleEn}</p><ul>{(locale === "zh" ? item.startingPointsZh : item.startingPointsEn).map(point => <li key={point}>{point}</li>)}</ul>{item.evidenceFiles.length > 0 && <small>{locale === "zh" ? "资料来源：" : "Sources: "}{item.evidenceFiles.join(" · ")}</small>}</article>)}</section>}
              {confirmedProfile && <section className="pi-memory-profile-group"><h3>{locale === "zh" ? "关注的研究主题" : "Research interests"}</h3>{[...confirmedProfile.subdirections, ...confirmedProfile.interests].map((item, index) => <article key={index}><h4>{locale === "zh" ? item.labelZh : item.labelEn}</h4><p>{locale === "zh" ? item.evidenceZh : item.evidenceEn}</p></article>)}</section>}
                <section className="pi-memory-profile-group"><h3>{locale === "zh" ? "画像资料来源" : "Profile sources"}</h3>{confirmedProfile.sourceAssessments.map((source, index) => <article key={index}><h4>{source.fileName}</h4><small>{source.used ? (locale === "zh" ? "用于当前画像" : "Used in this profile") : (locale === "zh" ? "未用于当前画像" : "Not used in this profile")}</small><p>{locale === "zh" ? source.reasonZh : source.reasonEn}</p></article>)}</section>
              </> : <p className="pi-memory-empty">{locale === "zh" ? "可以导入已有论文、项目或研究记录，确认后用于整理研究背景。" : "Import papers, projects or research notes and confirm the extracted context."}</p>}
            </section>}
            {memorySection === "preferences" && <div className="pi-memory-preferences">
<ResearchPreferencesPanel key={activeSpace.id} spaceId={activeSpace.id} locale={locale} demo={demo} onToggle={updateMemorySignal} onRecords={() => setMemorySection("reading")} onPaper={id => void openRoutePaper(id, "memory")} />
              <p className="pi-memory-scope">{locale === "zh" ? "这些记录仅用于当前研究空间。" : "These records belong to this research space."}<button type="button" onClick={() => setSpaceDialog(true)}>{t.switchSpace} →</button></p>
            </div>}
            <footer className="v2-lab-attribution"><span>{locale === "zh" ? "研究团队" : "Research team"}</span><Image src="/pi-lab-logo.png" width={78} height={25} alt="P&amp;I Lab" /></footer>
          </main>
        )}

        {workbookTrackId && <div hidden={view !== "workbook"}><DeferredWorkspacePanel locale={locale}><ResearchWorkbook initialWorkbookId={workbookVersionId} onWorkbookChange={id=>{loadedWorkbookRef.current=`${activeSpace.id}:${workbookTrackId}:${id}`;const current=readWorkspaceLocation(window.location.hash);if(current.view==="workbook"&&current.id===workbookTrackId)updateWorkspaceHash({workbookId:id},"replace");}} userId={user.userId} key={`${activeSpace.id}:${workbookTrackId}:${JSON.stringify(workbookTask || null)}`} taskContext={workbookTask?.spaceId === activeSpace.id ? workbookTask : undefined} spaceId={activeSpace.id} trackId={workbookTrackId} locale={locale} initialPanel={workbookViewState.panel} initialFocus={workbookViewState.focus} onViewChange={(panel,focus)=>{setWorkbookViewState({panel,focus});updateWorkspaceHash({workbookPanel:panel,workbookFocus:focus||undefined},'push');}} onOpenPaper={(source, focus) => void openWorkbookPaper(source, focus)} onBack={() => navigate(workbookReturnView)} /></DeferredWorkspacePanel></div>}

        {view === "paper-detail" && selectedMonitorPaper && (
          <main className="v2-page v2-paper-detail pi-paper-workspace">
            <button className="v2-back" type="button" onClick={() => navigate(paperReturnView)}>← {paperReturnView === "thread-detail" ? (locale === "zh" ? "返回原路线研判" : "Return to route synthesis") : paperReturnView === "workbook" ? (locale === "zh" ? "返回原比较项与学习任务" : "Return to comparison and learning task") : paperReturnView === "memory" ? t.memory : paperReturnView === "threads" ? t.threads : paperReturnView === "learn" ? t.learn : paperReturnView === "library" ? t.library : t.paperBack}</button>
            {paperReturnView === "workbook" && <p className="pi-workbook-error"><strong>{locale === "zh" ? "当前核查：" : "Current check: "}</strong><MathText>{workbookPaperFocus}</MathText></p>}
            <section className="v2-paper-head"><div className="v2-paper-top"><span className={`v2-tier-badge ${selectedMonitorPaper.qualityStage === "recommended" ? selectedMonitorPaper.recommendationTier || "browse" : selectedMonitorPaper.qualityStage === "reviewing" ? "reserve" : "browse"}`}>{selectedMonitorPaper.qualityStage === "recommended" ? recommendationTierLabel(selectedMonitorPaper.recommendationTier || "browse", locale) : selectedMonitorPaper.qualityStage === "reviewing" ? recommendationAuditPhaseLabel(selectedMonitorPaper, locale) : archiveQualityStagePresentation(selectedMonitorPaper.qualityStage, locale).label}</span>{isRecommendationQualityStage(selectedMonitorPaper.qualityStage) && <span>{readDepthLabel(selectedMonitorPaper.readDepth || "focused", locale)} · {selectedMonitorPaper.readMinutes || 15} min</span>}</div><h1><MathText inline>{selectedMonitorPaper.title}</MathText></h1><p>{selectedMonitorPaper.authors}</p><small>{selectedMonitorPaper.venue} · {formatPaperDate(selectedMonitorPaper.publishedAt, locale)}</small></section>
            {paperReturnView === "learn" && activeLearningState.path && (() => {
              const steps = activeLearningState.path.steps;
              const belongs = (step: LearningPathStep) => [...step.resources, ...(step.supplementaryResources || [])].some(resource => learningResourcePaperId(resource) === selectedMonitorPaper.id);
              const step = (activeLearningStep && belongs(activeLearningStep) ? activeLearningStep : steps.find(belongs));
              if (!step) return null;
              const focus = step.guidanceStatus === "grounded" && step.resources.some(resource => learningResourcePaperId(resource) === selectedMonitorPaper.id) ? (locale === "zh" ? step.readFocusZh : step.readFocusEn) : "";
              return <aside className="pi-paper-study-context"><span>{activeLearningState.path.target} / {locale === "zh" ? step.titleZh : step.titleEn}</span>{focus && <p><strong>{locale === "zh" ? "本次阅读重点：" : "Reading focus: "}</strong><MathText inline>{focus}</MathText></p>}<button type="button" onClick={() => navigate("learn")}>{locale === "zh" ? "返回学习阶段" : "Return to stage"} →</button></aside>;
            })()}
            <div className="pi-paper-toolbar"><PaperPanelNavigation locale={locale} value={paperPanel} onChange={changePaperPanel}/><div className="v2-paper-primary-actions"><a className="v2-original-link" href={selectedMonitorPaper.url || (selectedMonitorPaper.doi ? "https://doi.org/" + selectedMonitorPaper.doi : "#")} target="_blank" rel="noreferrer" onClick={() => recordPaperEngagement(selectedMonitorPaper, "original_click", { context: "paper_detail" })}>{t.openOriginal} ↗</a><button type="button" className="pi-paper-bookmark" aria-label={t.save} aria-pressed={Boolean(saved[activeSpace.id + ":" + selectedMonitorPaper.id] ?? selectedMonitorPaper.saved)} title={(saved[activeSpace.id + ":" + selectedMonitorPaper.id] ?? selectedMonitorPaper.saved) ? (locale === "zh" ? "取消收藏" : "Remove bookmark") : t.save} disabled={feedbackBusy} onClick={() => saveFeedback(selectedMonitorPaper, "save")}><InterfaceIcon name="bookmark" /></button><details className="v2-paper-more-actions"><summary aria-label={locale === "zh" ? "更多操作" : "More actions"} title={locale === "zh" ? "更多操作" : "More actions"}><InterfaceIcon name="more" /></summary><div>{selectedMonitorPaper.feedback && <button disabled={feedbackBusy} type="button" onClick={() => returnPaperToInbox(selectedMonitorPaper)}>{locale === "zh" ? "撤回相关性判断" : "Withdraw relevance feedback"}</button>}<button type="button" onClick={() => requestPaperDecision(selectedMonitorPaper, "relevant")}>{locale === "zh" ? "标记与我相关" : "Mark relevant to me"}</button><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "later")}>◷ {t.readLater}</button><button type="button" onClick={() => requestPaperDecision(selectedMonitorPaper, "not_relevant")}>× {t.notRelevant}</button><button type="button" onClick={() => shareSnapshot("paper", [selectedMonitorPaper])} disabled={Boolean(sharingSnapshot)}>↗ {sharingSnapshot === selectedMonitorPaper.id ? t.creatingShare : t.sharePaper}</button></div></details></div></div>
            <div className="v2-paper-detail-grid">
              <div className="pi-paper-panel" hidden={paperPanel!=="reading"}>
                {isRecommendationQualityStage(selectedMonitorPaper.qualityStage) && <section className="v2-content-section v2-paper-fit-summary"><p className="v2-kicker warm">{isRecommendationQualityStage(selectedMonitorPaper.qualityStage) ? (demo ? (locale === "zh" ? "阅读线索" : "Reading context") : t.whySuitable) : archiveQualityStagePresentation(selectedMonitorPaper.qualityStage, locale).kicker}</p><h2>{isRecommendationQualityStage(selectedMonitorPaper.qualityStage) ? ((locale === "zh" ? selectedMonitorPaper.whyReadZh : selectedMonitorPaper.whyReadEn) || (locale === "zh" ? "仍在共享质量队列中核对，尚未形成正式推荐。" : "Still under review in the shared quality queue; this is not yet a formal recommendation.")) : archiveQualityStagePresentation(selectedMonitorPaper.qualityStage, locale).note}</h2>{isRecommendationQualityStage(selectedMonitorPaper.qualityStage) && selectedMonitorPaper.researchProblemId && <details className="v2-paper-problem-impact"><summary><span>{locale === "zh" ? "对当前研究问题的影响" : "Impact on the active research problem"}</span><b>＋</b></summary><div><h3>{locale === "zh" ? selectedMonitorPaper.researchProblemImpactZh : selectedMonitorPaper.researchProblemImpactEn}</h3><p><small>{locale === "zh" ? "读完后应该决定" : "DECISION AFTER READING"}</small><strong>{locale === "zh" ? selectedMonitorPaper.researchDecisionZh : selectedMonitorPaper.researchDecisionEn}</strong></p></div></details>}<RecommendationMemoryLink locale={locale} example={demo ? selectedMonitorPaper.demoReadingContext : null} onPaper={id => void openRoutePaper(id, "memory")} onMemory={() => void openRecommendationMemory()} /><footer><span>{defaultSpaceName(activeSpace.name, locale)}</span>{!demo && selectedMonitorPaper.qualityStage === "recommended" && <strong>{t.qualityScore} {displayQualityScore(selectedMonitorPaper.qualityScore)}</strong>}</footer></section>}
                <DeferredWorkspacePanel locale={locale}><PaperReadingContent showReview={false} key={`${activeSpace.id}:${selectedMonitorPaper.id}`} spaceId={activeSpace.id} paperId={selectedMonitorPaper.id} locale={locale} stage={selectedMonitorPaper.qualityStage} reason={selectedMonitorPaper.screeningReason} onReviewStage={updateOpenedPaperReviewStage} onReviewUpdated={demo ? undefined : refreshOpenedPaperReview} /></DeferredWorkspacePanel>
                {Boolean(locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn) && <section className="v2-content-section"><h2>{locale==="zh"?"解读概述":"Saved overview"}</h2><p className="pi-paper-summary"><MathText>{locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn}</MathText></p></section>}
                {isRecommendationQualityStage(selectedMonitorPaper.qualityStage) && hasPaperGuide && <section className="v2-paper-analysis"><header><h2>{locale === "zh" ? "论文解读" : "Reading guide"}</h2><p>{locale === "zh" ? "基于已保存的评审内容，阅读时请结合原文核对。" : "Based on the saved review; check these points against the original paper."}</p></header><div>{[
                  [locale === "zh" ? "研究问题" : "Research question", locale === "zh" ? selectedMonitorPaper.problemZh : selectedMonitorPaper.problemEn],
                  [locale === "zh" ? "方法与证据" : "Method & evidence", locale === "zh" ? selectedMonitorPaper.methodZh : selectedMonitorPaper.methodEn],
                  [locale === "zh" ? "主要贡献" : "Contribution", locale === "zh" ? selectedMonitorPaper.contributionZh : selectedMonitorPaper.contributionEn],
                  [locale === "zh" ? "限制与不确定性" : "Limits & uncertainty", locale === "zh" ? selectedMonitorPaper.limitationsZh : selectedMonitorPaper.limitationsEn],
                  [locale === "zh" ? "阅读重点" : "Reading focus", locale === "zh" ? selectedMonitorPaper.readingFocusZh : selectedMonitorPaper.readingFocusEn],
                ].filter(([,text]) => text?.trim()).map(([label,text]) => <article key={label}><h3>{label}</h3><p><MathText>{text}</MathText></p></article>)}</div>{Boolean((locale === "zh" ? selectedMonitorPaper.researchQuestionsZh : selectedMonitorPaper.researchQuestionsEn)?.length) && <footer><h3>{locale === "zh" ? "继续思考" : "Questions to pursue"}</h3><ol>{(locale === "zh" ? selectedMonitorPaper.researchQuestionsZh : selectedMonitorPaper.researchQuestionsEn).map(question => <li key={question}><MathText inline>{question}</MathText></li>)}</ol></footer>}</section>}

              </div>

              <div className="pi-paper-panel" hidden={paperPanel!=="notes"}><section className="pi-paper-reading-tools"><header><h2>{locale === "zh" ? "我的笔记" : "My notes"}</h2></header><aside className="v2-detail-aside v2-real-detail-aside"><p className="v2-kicker">{locale === "zh" ? "阅读工作台" : "READING WORKBENCH"}</p><label className="v2-reading-field"><span>{locale === "zh" ? "阅读状态" : "Reading status"}</span><select disabled={readingSaving} value={selectedMonitorPaper.readingStatus || "unread"} onChange={(event) => void updateReadingProgress(selectedMonitorPaper, event.target.value as MonitorPaper["readingStatus"], paperNoteDraft)}><option value="unread">{readingStatusLabel("unread", locale)}</option><option value="queued">{readingStatusLabel("queued", locale)}</option><option value="reading">{readingStatusLabel("reading", locale)}</option><option value="read">{readingStatusLabel("read", locale)}</option><option value="mastered">{readingStatusLabel("mastered", locale)}</option><option value="cited">{readingStatusLabel("cited", locale)}</option></select></label><DraftRecovery key={noteDraftKey} storageKey={noteDraftKey} current={paperNoteDraft} base={selectedMonitorPaper.readingNote || ""} locale={locale} onRestore={editPaperNote} /><label className="v2-reading-field"><span>{locale === "zh" ? "我的阅读笔记" : "My reading note"}</span><textarea disabled={readingSaving} value={paperNoteDraft} maxLength={3000} onChange={(event) => editPaperNote(event.target.value)} placeholder={locale === "zh" ? "记录可复用的方法、疑问或与自己项目的连接…" : "Capture reusable methods, questions, or links to your work…"} /></label><small className="v2-memory-hint">{demo ? (locale === "zh" ? "修改后，原示例整理会失效；演示不生成新的整理。" : "Editing invalidates preset insights; the demo does not generate new ones.") : (locale === "zh" ? "保存笔记后即可在研究记忆中找到；选择让 Pi 整理，会进一步提取方法与疑问。" : "Saved notes appear in research memory. Ask Pi to organize them when you want methods and questions extracted.")}</small><p className="pi-save-state" role="status">{noteSaveError || (readingSaving ? (locale === "zh" ? "正在保存…" : "Saving…") : paperNoteDraft !== (selectedMonitorPaper.readingNote || "") ? (locale === "zh" ? "有未保存修改" : "Unsaved changes") : (locale === "zh" ? "与已保存内容一致" : "Matches saved content"))}{noteDraftUnavailable && (locale === "zh" ? " · 本标签页无法暂存，请保存后再离开。" : " · Draft storage unavailable. Save before leaving.")}</p>{!paperNoteDraft && selectedMonitorPaper.readingNote && <button type="button" disabled={readingSaving} onClick={() => editPaperNote(selectedMonitorPaper.readingNote)}>{locale === "zh" ? "撤销清空" : "Undo clearing"}</button>}<div className="pi-note-actions"><button type="button" disabled={readingSaving || paperNoteDraft === (selectedMonitorPaper.readingNote || "")} onClick={() => void updateReadingProgress(selectedMonitorPaper, selectedMonitorPaper.readingStatus || "queued", paperNoteDraft)}>{readingSaving && !readingMemoryAnalyzing ? (locale === "zh" ? "正在保存…" : "Saving…") : (locale === "zh" ? "保存笔记" : "Save note")}</button><button className="v2-save-note" type="button" title={demo ? (locale === "zh" ? "演示仅提供预设整理" : "Only preset insights are available in the demo") : undefined} disabled={demo || readingSaving || readingMemoryAnalyzing || !paperNoteDraft.trim()} onClick={() => void updateReadingProgress(selectedMonitorPaper, selectedMonitorPaper.readingStatus || "queued", paperNoteDraft, true)}>{readingMemoryAnalyzing ? (locale === "zh" ? "正在整理…" : "Synthesizing…") : (locale === "zh" ? "保存并让 Pi 整理" : "Save and organize with Pi")}</button></div><button type="button" onClick={() => askAboutMonitorPaper(selectedMonitorPaper)}>{t.askAboutPaper} →</button></aside></section>
                {savedReadingId === `${activeSpace.id}:${selectedMonitorPaper.id}` && !noteSaveError && !readingSaving && paperNoteDraft === (selectedMonitorPaper.readingNote || "") && <section className="pi-after-reading" aria-label={locale === "zh" ? "读后下一步" : "After reading"}><h2>{locale === "zh" ? "记录已保存，接下来" : "Saved. Next step"}</h2><p>{locale === "zh" ? "笔记与反馈供后续发现参考，当前推荐没有重新计算。" : "Notes and feedback can inform future discovery. Current recommendations have not been recalculated."}</p><div>{nextReadingId && <button type="button" onClick={() => void openRoutePaper(nextReadingId, "today")}>{locale === "zh" ? "继续下一篇推荐" : "Next recommended paper"} →</button>}<button type="button" onClick={() => {setResearchMapMode("papers");setGraphSurface("library");navigate("threads",workbookTrackId,{graph:"all"});}}>{locale === "zh" ? "选择材料进行比较" : "Choose papers to compare"}</button><button type="button" onClick={() => void openRecommendationMemory()}>{locale === "zh" ? "检查研究偏向" : "Review research interests"}</button></div></section>}
                {selectedMonitorPaper.qualityStage === "recommended" && paperReturnView !== "learn" && <DeferredWorkspacePanel locale={locale}><ResearchStart key={activeSpace.id+selectedMonitorPaper.id} spaceId={activeSpace.id} paperId={selectedMonitorPaper.id} locale={locale} onRead={() => {changePaperPanel("reading");requestAnimationFrame(()=>document.querySelector(".v2-paper-analysis")?.scrollIntoView({behavior:"smooth"}));}} onStart={startRecommendedResearch} /></DeferredWorkspacePanel>}

              </div>
              <div className="pi-paper-panel" hidden={paperPanel!=="record"}>
                <section className="v2-content-section"><h2>{locale==="zh"?"来源与核验":"Source & verification"}</h2><PaperDiscoverySourceBadge paper={selectedMonitorPaper} locale={locale}/><RecommendationVerificationBadge paper={selectedMonitorPaper} locale={locale}/></section>
                {monitorPaperRouteDiscovery(selectedMonitorPaper, locale)?.impact && <section className="v2-content-section v2-paper-record"><h2>{locale === "zh" ? "与路线的关联" : "Route connection"}</h2><RouteImpactNote paper={selectedMonitorPaper} locale={locale} /></section>}
                {!demo && <section className="v2-content-section v2-paper-record"><h2>{locale==="zh"?"发现与评审记录":"Discovery & review"}</h2><p>{archiveQualityStagePresentation(selectedMonitorPaper.qualityStage, locale).label}</p>{selectedMonitorPaper.screeningReason&&<p><MathText>{selectedMonitorPaper.screeningReason}</MathText></p>}<dl className="v2-real-signals"><div><dt>{t.relevanceScoreLabel}</dt><dd>{selectedMonitorPaper.relevanceScore}</dd></div>{selectedMonitorPaper.qualityStage === "recommended" && <div><dt>{t.qualityScore}</dt><dd>{displayQualityScore(selectedMonitorPaper.qualityScore)}</dd></div>}<div><dt>{t.citations}</dt><dd>{selectedMonitorPaper.citationCount}</dd></div><div><dt>{t.prioritySources}</dt><dd>{selectedMonitorPaper.priorityVenue ? t.priorityVenueLabel : "—"}</dd></div><div><dt>{t.sourceRecord}</dt><dd>{selectedMonitorPaper.discoverySources?.length ? selectedMonitorPaper.discoverySources.map((source) => locale === "zh" ? source.labelZh : source.labelEn).join(" · ") : selectedMonitorPaper.analysisSource === "deepseek" ? t.aiBrief : t.metadataBrief}</dd></div></dl></section>}
              <section className="v2-content-section v2-paper-record pi-bibliography"><h2>{locale === "zh" ? "书目信息" : "Bibliographic details"}</h2><dl><div><dt>{locale === "zh" ? "检索时间范围" : "Discovery horizon"}</dt><dd>{monitorPaperHorizonLabel(selectedMonitorPaper, locale)}</dd></div>{isRecommendationQualityStage(selectedMonitorPaper.qualityStage) ? <div><dt>{locale === "zh" ? "建议投入" : "Suggested time"}</dt><dd>{selectedMonitorPaper.readMinutes || 15} min · {readDepthLabel(selectedMonitorPaper.readDepth || "focused", locale)}</dd></div> : !demo && <div><dt>{locale === "zh" ? "评审状态" : "Review state"}</dt><dd>{archiveQualityStagePresentation(selectedMonitorPaper.qualityStage, locale).label}</dd></div>}<div><dt>{locale === "zh" ? "期刊与会议" : "Venue"}</dt><dd>{selectedMonitorPaper.venue || "—"}</dd></div><div><dt>{locale === "zh" ? "发表日期" : "Published"}</dt><dd>{formatPaperDate(selectedMonitorPaper.publishedAt, locale)}</dd></div>{selectedMonitorPaper.doi && <div><dt>DOI</dt><dd>{selectedMonitorPaper.doi}</dd></div>}</dl></section>
              </div>
            </div>
          </main>
        )}
      </div>

      {spaceDialog && (
        <div className="v2-modal pi-dialog-workspace" data-pi-dialog="space" tabIndex={-1} role="dialog" aria-modal="true" aria-label={t.spaceDialogTitle}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => setSpaceDialog(false)} />
          <div className="v2-space-modal">
            <div className="v2-modal-head"><div><h2>{t.spaceDialogTitle}</h2><p>{t.spaceDialogIntro}</p></div><button type="button" aria-label={t.close} onClick={() => setSpaceDialog(false)}>×</button></div>
            <nav className="pi-dialog-nav" aria-label={locale === "zh" ? "空间管理" : "Manage spaces"}>{[["existing", "切换空间", "Switch space"], ["new", "新建空间", "New space"], ["deleted", "已删除", "Deleted"], ["identity", "访问与恢复", "Access & recovery"]].map(([id, zh, en]) => <button type="button" key={id} aria-pressed={spaceSection === id} onClick={() => setSpaceSection(id)}>{locale === "zh" ? zh : en}{id==='deleted'&&deletedSpaces.length>0?` (${deletedSpaces.length})`:''}</button>)}</nav>
            {spaceSection==='identity'&&<WorkspaceAccess session={workspaceSession} locale={locale} demo={demo}/>}
            <div className="v2-space-list" hidden={spaceSection !== "existing"}>
              <SpaceManagementList spaces={spaces} activeId={activeSpace.id} locale={locale} available={spaceDeletionEnabled} onSelect={switchSpace} onChanged={changeSpaceList}/>
            </div>
            <div className="v2-space-list" hidden={spaceSection!=='deleted'}><SpaceManagementList spaces={deletedSpaces} locale={locale} removed available={spaceDeletionEnabled} onChanged={changeSpaceList}/></div>
            <form className="v2-new-space-form" hidden={spaceSection !== "new"} onSubmit={submitSpace}>
              <p className="v2-kicker">{t.createSpaceTitle}</p>
              {spaceCreateError && <p role="alert" className="pi-space-create-error">{spaceCreateError}</p>}
              <div><label><span>{t.spaceName}</span><input required value={newSpace.name} onChange={(event) => setNewSpace((current) => ({ ...current, name: event.target.value }))} placeholder={locale === "zh" ? "例如：量子信息" : "e.g. Quantum Information"} /></label><label><span>{t.memberName}</span><input value={newSpace.memberName} onChange={(event) => setNewSpace((current) => ({ ...current, memberName: event.target.value }))} placeholder={user.displayName} /></label></div>
              <label><span>{t.spaceScope}</span><textarea value={newSpace.description} onChange={(event) => setNewSpace((current) => ({ ...current, description: event.target.value }))} placeholder={locale === "zh" ? "这个空间只关注哪些具体问题？" : "Which specific questions belong in this space?"} /></label>
              <div className="v2-form-actions"><button type="button" onClick={() => setSpaceDialog(false)}>{t.cancel}</button><button type="submit" title={demo ? "请返回正式工作区创建空间" : undefined} disabled={demo || creatingSpace || !newSpace.name.trim()}>{creatingSpace ? t.creating : t.create} →</button></div>
            </form>
          </div>
        </div>
      )}

      {sourceSettingsOpen && monitor?.preferences && (
        <div className="v2-modal pi-dialog-workspace" data-pi-dialog="sources" tabIndex={-1} role="dialog" aria-modal="true" aria-label={t.sourceSettingsTitle}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => setSourceSettingsOpen(false)} />
          <div className="v2-source-settings">
            <div className="v2-modal-head"><div><p className="v2-kicker">{t.prioritySources}</p><h2>{locale === "zh" ? "关注来源" : "Followed sources"}</h2><p>{defaultSpaceName(activeSpace.name, locale)} · {locale === "zh" ? "保存后用于后续检索" : "Saved choices apply to future discovery"}</p></div><button type="button" aria-label={t.close} onClick={() => setSourceSettingsOpen(false)}>×</button></div>
            <form onSubmit={(event) => { event.preventDefault(); void saveSourceSettings(false); }}>
              <nav className="pi-dialog-nav" aria-label={locale === "zh" ? "来源设置" : "Source settings"}>{[["suggested", "建议来源", "Suggestions"], ["manual", "来源与作者", "Sources & authors"], ["range", "探索范围", "Exploration"]].map(([id, zh, en]) => <button type="button" key={id} aria-pressed={sourceSection === id} onClick={() => setSourceSection(id)}>{locale === "zh" ? zh : en}</button>)}</nav>
              <div hidden={sourceSection !== "suggested"}><div className="v2-detected-profile"><span>{t.detectedDomain}</span><strong>{locale === "zh" ? monitor.preferences.profileNameZh : monitor.preferences.profileNameEn}</strong><em>{monitor.preferences.userModified ? t.userCustomized : t.systemProvided}</em></div>
              <ResearchSourceSuggestions key={activeSpace.id} spaceId={activeSpace.id} locale={locale} selected={venueDraft.split(/\r?\n/).map(s => s.trim()).filter(Boolean)} onChange={titles => setVenueDraft(titles.join("\n"))} onOpenPaper={id => { setSourceSettingsOpen(false); void openRoutePaper(id, view === "paper-detail" ? paperReturnView : view); }} /></div>
              <fieldset hidden={sourceSection !== "range"} className="v2-exploration-mode"><legend>{locale === "zh" ? "每日探索强度" : "Daily exploration range"}</legend><div>{(["focused", "balanced", "open"] as const).map((mode) => <button type="button" key={mode} aria-pressed={explorationDraft === mode} className={explorationDraft === mode ? "active" : ""} onClick={() => setExplorationDraft(mode)}><strong>{mode === "focused" ? (locale === "zh" ? "聚焦" : "Focused") : mode === "balanced" ? (locale === "zh" ? "平衡" : "Balanced") : (locale === "zh" ? "开放" : "Open")}</strong><small>{mode === "focused" ? (locale === "zh" ? "紧贴核心方向" : "Core directions only") : mode === "balanced" ? (locale === "zh" ? "核心＋相邻线索" : "Core + adjacent leads") : (locale === "zh" ? "主动跨方向探索" : "Broader cross-field search")}</small></button>)}</div></fieldset>
              <section hidden={sourceSection !== "manual"} className="pi-source-manual"><label><span>{locale === "zh" ? "已选择的来源（可补充或直接编辑）" : "Selected sources (add or edit directly)"}</span><textarea value={venueDraft} onChange={(event) => setVenueDraft(event.target.value)} rows={10} /></label>
              <label><span>{locale === "zh" ? "持续追踪的作者（每行一位）" : "Tracked authors (one per line)"}</span><textarea value={authorDraft} onChange={(event) => setAuthorDraft(event.target.value)} rows={5} placeholder={locale === "zh" ? "例如：Terence Tao" : "e.g. Terence Tao"} /></label>
              {Boolean(monitor.suggestedAuthors?.length) && <div className="v2-author-suggestions"><span>{locale === "zh" ? "根据已接受论文建议" : "Suggested from accepted papers"}</span><div>{monitor.suggestedAuthors?.slice(0, 10).map((author) => <button type="button" key={author} onClick={() => setAuthorDraft((current) => Array.from(new Set([...current.split(/\r?\n/).filter(Boolean), author])).join("\n"))}>＋ {author}</button>)}</div></div>}
              </section><div className="v2-source-settings-actions"><button type="button" onClick={() => void saveSourceSettings(true)} disabled={savingPreferences}>{t.resetSources}</button><button type="button" title={demo ? (locale === "zh" ? "演示不执行扫描" : "Scanning is unavailable in the demo") : undefined} disabled={demo || savingPreferences || !venueDraft.trim() || scanIsActive} onClick={() => void saveSourceSettings(false, true)}>{locale === "zh" ? "保存并扫描" : "Save and scan"}</button><button type="submit" disabled={savingPreferences || !venueDraft.trim()}>{savingPreferences ? t.savingSources : (locale === "zh" ? "保存关注来源" : "Save sources")} →</button></div>
            </form>
          </div>
        </div>
      )}

      {modelSettingsOpen && (
        <div className="v2-modal pi-dialog-workspace" data-pi-dialog="model" tabIndex={-1} role="dialog" aria-modal="true" aria-label={locale === "zh" ? "AI 模型设置" : "AI model settings"}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={closeModelSettings} />
          <ModelSettingsPanel title={locale === "zh" ? "模型设置" : "Model settings"} locale={locale} demo={demo}
            model={modelDisplayName(connectedModel || "deepseek-flash")} status={modelConnectionCopy.modal} connected={modelConnectionState === "connected"}
            credentialSource={modelCredentialSource} busy={checkingModel} apiKey={modelApiKey} error={modelSettingsError}
            recovered={credentialFailureRecovered} recoveryDetail={locale === "zh" ? `${monitor?.scanJob?.discoveredCount || 0} 篇候选和 ${monitor?.scanJob?.reviewedCount || 0}/${monitor?.scanJob?.candidateCount || 0} 篇筛选进度均已保留。` : `${monitor?.scanJob?.discoveredCount || 0} candidates and ${monitor?.scanJob?.reviewedCount || 0}/${monitor?.scanJob?.candidateCount || 0} screening progress retained.`}
            onClose={closeModelSettings} onCheck={() => void refreshModelStatus()} onKey={value => { setModelApiKey(value); setModelSettingsError(""); }}
            onSave={() => void saveModelCredential()} onRemove={() => void removeBrowserModelCredential()} onResume={resumeAfterModelConnection} />
        </div>
      )}

      {feedbackPrompt && (
        <div className="v2-modal pi-dialog-workspace" data-pi-dialog="feedback" tabIndex={-1} role="dialog" aria-modal="true" aria-label={locale === "zh" ? "反馈原因" : "Feedback reason"}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => setFeedbackPrompt(null)} />
          <div className="v2-feedback-reason">
            <div className="v2-modal-head"><div><p className="v2-kicker">{locale === "zh" ? "偏好反馈" : "PREFERENCE FEEDBACK"}</p><h2>{feedbackPrompt.kind === "relevant" ? (locale === "zh" ? "为什么适合？" : "Why is this useful?") : (locale === "zh" ? "为什么不适合？" : "Why is this not useful?")}</h2><p>{feedbackPrompt.paper.title}</p></div><button type="button" aria-label={t.close} onClick={() => setFeedbackPrompt(null)}>×</button></div>
            <label><span>{locale === "zh" ? "可选：补充一句具体原因" : "Optional: add a specific note"}</span><textarea disabled={feedbackBusy} value={feedbackNote} maxLength={500} onChange={(event) => setFeedbackNote(event.target.value)} placeholder={locale === "zh" ? "例如：这个证明策略正好可用于我正在处理的边界情形。" : "For example: this proof strategy fits the boundary case I am working on."} /></label>
            <div className="v2-feedback-options">{(feedbackPrompt.kind === "relevant" ? [
              ["topic_fit", "主题正好相关", "Strong topic fit"], ["method_fit", "方法值得借鉴", "Useful method"], ["solves_question", "回应了我的问题", "Addresses my question"], ["foundational", "是重要基础工作", "Important foundation"], ["surprising", "带来新方向或反直觉结果", "Surprising new direction"],
            ] : [
              ["topic_drift", "偏离我的研究范围", "Outside my scope"], ["too_shallow", "内容太浅或增量太小", "Too shallow or incremental"], ["weak_evidence", "证据或方法不够可靠", "Weak evidence or method"], ["duplicate_known", "内容很好，但我已掌握", "Valuable, but already mastered"], ["wrong_type", "不是我需要的论文类型", "Wrong kind of paper"],
            ]).map(([code, zh, en]) => <button type="button" key={code} disabled={feedbackBusy} onClick={() => chooseFeedbackReason(code)}><span>{feedbackPrompt.kind === "relevant" ? "＋" : "—"}</span><strong>{locale === "zh" ? zh : en}</strong><b>→</b></button>)}</div>

            <small>{feedbackPrompt.kind === "relevant" && (feedbackPrompt.paper.discoveryOrigin || feedbackPrompt.paper.discoveryTrack)
              ? (locale === "zh"
                ? "确认后，已通过质量核验的论文会按最终证据归属加入对应路线，并触发路线重新判断。"
                : "After confirmation, a quality-verified paper is assigned to its evidence-supported route and triggers reassessment.")
              : (locale === "zh" ? "选择后会写入当前研究空间；明确反馈不会与其他研究方向混用。" : "Your choice is stored only in this research space.")}</small>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="v2-modal pi-dialog-workspace" data-pi-dialog="import" tabIndex={-1} role="dialog" aria-modal="true" aria-label={t.importResearch}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => { if (!analyzingImport && !savingImport) setImportOpen(false); }} />
          <div className="v2-import-modal">
            <div className="v2-modal-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {t.privateSpace}</p><h2>{importDraft ? t.importDraftTitle : t.importResearch}</h2><p>{importDraft ? t.importDraftNote : (demo ? (locale === "zh" ? "演示可预览导入界面；分析资料请前往正式工作区。" : "Preview importing here; analyze materials in your workspace.") : (locale === "zh" ? "选择资料，生成草稿，再审阅确认。" : "Choose materials, generate a draft, then review and confirm."))}</p></div><button type="button" aria-label={t.close} disabled={analyzingImport || savingImport} onClick={() => setImportOpen(false)}>×</button></div>

            {!importDraft ? <div className="v2-import-body">
              <section className="v2-import-warning"><b>!</b><div><h3>{t.importSafetyTitle}</h3><p>{t.importSafetyBody}</p><small>{t.importSafetyProcess}</small></div></section>

              <div className="v2-import-kind" role="group" aria-label={locale === "zh" ? "资料类型" : "Material type"}>
                {(["chat", "published_paper", "public_project", "mixed"] as ImportSourceKind[]).map((kind) => <button type="button" key={kind} aria-pressed={importSourceKind === kind} className={importSourceKind === kind ? "active" : ""} onClick={() => setImportSourceKind(kind)}>{kind === "chat" ? (locale === "zh" ? "AI 项目 / 聊天" : "AI project / chats") : kind === "published_paper" ? (locale === "zh" ? "已发表论文" : "Published papers") : kind === "public_project" ? (locale === "zh" ? "公开项目材料" : "Public project material") : (locale === "zh" ? "混合资料" : "Mixed materials")}</button>)}
              </div>

              <div className="v2-import-pickers">
                <input ref={fileInputRef} hidden type="file" multiple accept=".pdf,.docx,.json,.md,.markdown,.txt,.html,.htm,.csv" onChange={(event) => void addMaterialFiles(event.target.files)} />
                <input ref={(node) => { folderInputRef.current = node; if (node) { node.setAttribute("webkitdirectory", ""); node.setAttribute("directory", ""); } }} hidden type="file" multiple onChange={(event) => void addMaterialFiles(event.target.files)} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={parsingMaterials || importFiles.length >= MATERIAL_FILE_LIMIT}><span>□</span><strong>{t.singleFile}</strong><small>PDF · DOCX · JSON · MD · TXT</small></button>
                <button type="button" onClick={() => folderInputRef.current?.click()} disabled={parsingMaterials || importFiles.length >= MATERIAL_FILE_LIMIT}><span>▦</span><strong>{t.folderUpload}</strong><small>{locale === "zh" ? "逐个提取可读文件" : "Extract readable files"}</small></button>
              </div>
              <p className="v2-import-support">{parsingMaterials ? (locale === "zh" ? "正在浏览器中提取文本…" : "Extracting text in your browser…") : t.supportedFiles}</p>

              <section className="v2-import-file-list"><div><h3>{t.selectedMaterials}</h3><span>{importFiles.length}/{MATERIAL_FILE_LIMIT}</span></div>{importFiles.length ? importFiles.map((file, index) => <div key={`${file.name}-${index}`}><span>□</span><p><strong>{file.name}</strong><small>{file.chars.toLocaleString()} {locale === "zh" ? "字符" : "characters"}{file.truncated ? ` · ${locale === "zh" ? "已截取" : "trimmed"}` : ""}</small></p><button type="button" aria-label={locale === "zh" ? "移除文件" : "Remove file"} onClick={() => setImportFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>) : <p>{t.noMaterials}</p>}</section>

              <label className="v2-import-paste"><span>{t.pasteConversation}</span><textarea value={pastedMaterial} maxLength={MATERIAL_CHAR_LIMIT} onChange={(event) => setPastedMaterial(event.target.value)} placeholder={locale === "zh" ? "粘贴与当前研究空间有关的部分；先删除个人信息和不应外发的内容。" : "Paste only the part relevant to this space; remove personal or non-shareable content first."} /></label>

              <div className="v2-import-attestation"><input id="pi-import-safety" type="checkbox" aria-label={t.confirmPublic} checked={safetyConfirmed} onChange={(event) => setSafetyConfirmed(event.target.checked)} /><label htmlFor="pi-import-safety"><strong>{t.confirmPublic}</strong><small>{t.rawNotStored}</small></label></div>
              <div className="v2-import-actions"><button type="button" disabled={analyzingImport || parsingMaterials} onClick={() => setImportOpen(false)}>{t.cancel}</button><button type="button" onClick={() => void analyzeResearchImport()} title={demo ? (locale === "zh" ? "请在正式工作区分析资料" : "Analyze materials in your workspace") : undefined} disabled={demo || analyzingImport || parsingMaterials || !safetyConfirmed || (!importFiles.length && !pastedMaterial.trim())}>{analyzingImport ? t.analyzingMaterials : t.analyzeMaterials} →</button></div>
              {analyzingImport && <div className="v2-import-progress" role="status" aria-live="polite"><InterfaceIcon name="loading" className="pi-state-mark" /><div><strong>{t.analyzingMaterials}</strong><small>{locale === "zh" ? "正在整理研究方向、已有知识与开放问题。" : "Organizing research directions, existing knowledge, and open questions."}</small><i><b /></i></div></div>}
            </div> : <div className="v2-profile-draft">
              <p className="pi-review-meta">{t.rawNotStored} · {importDraft.fileNames.length} {locale === "zh" ? "个来源" : "sources"} · {modelDisplayName(importDraft.analysisModel)}</p>
              <ImportProfileReview key={importDraft.id} draft={importDraft} locale={locale} disabled={savingImport} onEdit={editImportAnalysis} />
              <div className="v2-import-actions"><button type="button" onClick={() => void saveImportDecision("discard")} disabled={savingImport}>{t.discardDraft}</button><button type="button" onClick={() => void saveImportDecision("confirm")} disabled={savingImport || !importDraft.analysis.researchOpportunities.length}>{savingImport ? t.savingSources : t.confirmProfile} →</button></div>
            </div>}
          </div>
        </div>
      )}

      {askVisible && (
        <div className={`v2-modal v2-ask-modal ${compactAsk ? "pi-ask-compact" : "pi-ask-docked"}`} data-pi-dialog="ask" tabIndex={-1} role="dialog" aria-modal={compactAsk || undefined} aria-label={t.askTitle}>
          {compactAsk && <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => setAskOpen(false)} />}
          <div className="v2-ask-panel">
            <div className="v2-modal-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {t.privateSpace}</p><h2>{t.askTitle}</h2><p>{t.askScope}</p></div><button type="button" aria-label={t.close} onClick={() => setAskOpen(false)}>×</button></div>
            {demo && <p className="pi-demo-action-note">演示可试写问题和切换上下文；发送需返回正式工作区，演示不调用模型。</p>}
            <DraftRecovery key={sessionDraftKey(user.userId, activeSpace.id, "ask")} storageKey={sessionDraftKey(user.userId, activeSpace.id, "ask")} current={JSON.stringify({ question, context: askContext })} base="" locale={locale} onRestore={value => { try { const draft = JSON.parse(value); if (typeof draft.question === "string" && draft.context && Object.entries(draft.context).every(([key, id]) => ["paperId", "trackId", "routePaperId"].includes(key) && typeof id === "string")) { setQuestion(draft.question); setAskContext(draft.context); } } catch { setAskError(locale === "zh" ? "草稿暂时无法读取" : "Draft unavailable"); } }} /><form onSubmit={submitQuestion}><textarea aria-label={locale === "zh" ? "向 Pi 提问" : "Your question for Pi"} value={question} onChange={(event) => { setQuestion(event.target.value); if (!writeSessionDraft(sessionDraftKey(user.userId, activeSpace.id, "ask"), "", JSON.stringify({ question: event.target.value, context: askContext }))) setAskError(locale === "zh" ? "无法暂存问题，请在离开前复制保留。" : "Draft storage unavailable. Copy your question before leaving."); }} placeholder={t.askExample} /><div><span className={"v2-space-avatar tiny " + activeSpace.accent}>{initials(activeSpace.name)}</span><small>{defaultSpaceName(activeSpace.name, locale)} · {activeSpace.memberName}</small><button type="submit" disabled={demo || !question.trim() || asking}>{asking ? "···" : t.send + " ↑"}</button></div></form>
            {asking && <div className="v2-thinking"><InterfaceIcon name="loading" className="pi-state-mark" /><p>{t.thinking}<i><b /><b /><b /></i></p></div>}
            {(askContext.trackId || askContext.paperId) && <p className="pi-ask-context">{locale === "zh" ? "当前关联：" : "Attached: "}{askContext.paperId ? (historyPapers.find(paper => paper.id === askContext.paperId)?.title || (selectedMonitorPaper?.id === askContext.paperId ? selectedMonitorPaper.title : (locale === "zh" ? "所选论文" : "Selected paper"))) : (() => { const route = researchMap.tracks.find(track => track.id === askContext.trackId); const paper = route?.papers.find(item => item.id === askContext.routePaperId); return paper?.title || (route ? locale === "zh" ? route.titleZh : route.titleEn : locale === "zh" ? "所选路线" : "Selected route"); })()} <button type="button" disabled={asking} onClick={attachCurrentAskContext}>{locale === "zh" ? "改用当前页面" : "Use current page"}</button> <button type="button" disabled={asking} onClick={() => setAskContext({})}>{locale === "zh" ? "移除" : "Remove"}</button></p>}
            {askError && <div className="pi-ask-error" role="alert"><p>{askError}</p><button type="button" disabled={asking} onClick={() => void submitQuestion()}>{locale === "zh" ? "重新回答" : "Retry"}</button></div>}
            {answer && <div className="v2-answer"><div><InterfaceIcon name="synthesis" className="pi-state-mark" /><p className="v2-kicker">{answerMode === "deepseek" ? t.modelAnswer : t.previewMode}</p><small>{answerMode === "deepseek" ? modelDisplayName(answerModel || connectedModel) : t.setupRequired}</small></div><Suspense fallback={<p role="status">{locale === "zh" ? "正在排版回答…" : "Formatting answer…"}</p>}><AnswerMarkdown>{answer}</AnswerMarkdown></Suspense><div><i />{t.isolated}</div></div>}
            {!answer && !asking && !askError && <div className="v2-ask-suggestions">{[t.askExample, locale === "zh" ? "这篇论文与我收藏的结果有什么直接关系？" : "How does this paper relate to results I saved?", locale === "zh" ? "这个方向最近真正改变了什么？" : "What actually changed in this field recently?"].map((item) => <button type="button" key={item} onClick={() => setQuestion(item)}>↗ {item}</button>)}</div>}
          </div>
        </div>
      )}

      {mobileNav && <button className="v2-mobile-backdrop" type="button" aria-label={t.close} onClick={() => setMobileNav(false)} />}
      {feedbackReceipt?.spaceId === activeSpace.id && <aside className="pi-feedback-receipt" role="status"><button className="pi-receipt-close" aria-label={locale === "zh" ? "关闭反馈回执" : "Close feedback receipt"} onClick={() => setFeedbackReceipt(null)}>×</button><strong>{locale === "zh" ? "反馈已记录" : "Feedback saved"}</strong><p>{feedbackReceipt.title}</p><small>{feedbackReceipt.effect}</small>{feedbackReceipt.error && <p role="alert">{feedbackReceipt.error}</p>}<div className="pi-receipt-actions">{nextReadingId && nextReadingId !== feedbackReceipt.paper.id && <button type="button" onClick={() => {setFeedbackReceipt(null);void openRoutePaper(nextReadingId,"today");}}>{locale === "zh" ? "继续下一篇推荐" : "Next recommended paper"} →</button>}<button disabled={feedbackBusy} onClick={() => saveFeedback(feedbackReceipt.paper, feedbackReceipt.kind, undefined, "", false)}>{feedbackBusy ? (locale === "zh" ? "保存中…" : "Saving…") : (locale === "zh" ? (feedbackReceipt.kind === "save" ? "撤销收藏" : "撤回判断") : "Withdraw feedback")}</button><button onClick={() => void openRecommendationMemory()}>{locale === "zh" ? "查看研究偏向" : "View research interests"} →</button></div></aside>}
      {toast && !feedbackReceipt && <div className="v2-toast"><span>✓</span>{toast}</div>}
    </div>
  );
}

