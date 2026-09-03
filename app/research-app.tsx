"use client";

import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ImportSourceKind, ResearchImportRecord, ResearchProfileAnalysis } from "../lib/research-profile";
import { emptyResearchMapState, researchLeadActionableGap, researchRouteLearningSignal, researchRouteOperationalStatus, selectResearchRouteAttention, type ResearchDirectionRole, type ResearchLeadGapOrigin, type ResearchMapState, type ResearchPaperEdge, type ResearchRouteAttentionKind, type ResearchRoutePortfolio, type ResearchTrack, type ResearchTrackPaper, type ResearchTrackRole } from "../lib/research-map";
import { learningResourceHref, learningResourceTitleKey, type LearningPathState, type LearningPathStep, type LearningResource, type LearningStepKind } from "../lib/learning-path";
import { isDatabaseVerifiedCitationEdge, isVerifiableSimilarityNeighborEdge, paperNetworkEdgeKey, selectBalancedMultiSeedEdges, selectMultiOriginCandidates, selectPaperNetworkActiveNodeIds, selectVerifiableOneHopEdges, type MultiOriginIntent } from "../lib/paper-network";
import type { ResearchNetworkCandidate, ResearchNetworkExpandResponse, ResearchNetworkSeed, ResearchNetworkSimilarityEdge, ResearchNetworkSourceStatus } from "../lib/research-network";
import { archiveQualityStagePresentation, isRecommendationQualityStage, routeDiscoveryPresentation } from "../lib/discovery-archive-semantics.mjs";
import { shouldReclaimMonitorLease } from "../lib/monitor-follower-control.mjs";
import { shouldBlockManualMonitorStart } from "../lib/monitor-runtime-control.mjs";

type Locale = "zh" | "en";
type ModelConnectionState = "unconfigured" | "checking" | "connected" | "invalid";
type View = "today" | "threads" | "thread-detail" | "learn" | "library" | "memory" | "paper-detail";
type LibraryFilter = "inbox" | "accepted" | "all" | "dismissed";
type InboxFilter = "all" | "unseen" | "seen" | "snoozed";
type LibraryStageFilter = "all" | "evaluated";
type LibrarySort = "priority" | "newest" | "quality";
type ResearchMapMode = "directions" | "papers";
type ResearchRouteTab = "problem" | "assessment" | "evidence" | "gaps" | "agenda";
type PaperNetworkMode = "similarity" | "citations" | "path";
type PaperNetworkScope = "all" | "one-hop" | "multi-seed";
type PaperDiscoveryTab = "similar" | "prior" | "derivative";
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
  qualityStage?: "queued" | "discovered" | "reviewed" | "reviewing" | "recommended" | null;
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
    pauseReason?: "unattended_runs" | "inactive" | "daily_budget" | "model_unavailable" | null;
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
    threads: "研究线索",
    learn: "学习路径",
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
    briefTime: "主题、重点期刊与学术图谱共同发现；DeepSeek Pro 负责筛选与撰写",
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
    learnTitle: "你想进入哪个研究方向？",
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
    accountNote: "无需登录。数据通过此浏览器的匿名工作区保存；清除浏览器数据后会生成一个新的工作区。",
    paperBack: "返回今日简报",
    recommendation: "推荐判断",
    coreContribution: "核心贡献",
    relation: "与你研究的关系",
    suggestedReading: "如果只有 20 分钟",
    askAboutPaper: "围绕这篇论文提问",
    spaceDialogTitle: "你的研究空间",
    spaceDialogIntro: "每个空间代表一个独立研究方向，记忆和回答不会与其他方向混用。",
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
    liveMonitor: "DeepSeek Pro 审核后的真实论文",
    monitorIntro: "主题、重点期刊、arXiv、OpenAlex、Semantic Scholar 与引用网络共同补充候选，DeepSeek Pro 按研究空间逐篇判断并撰写论文介绍和适读理由。",
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
    noLivePapers: "当前没有通过 DeepSeek Pro 严格评审的论文，Pi 不会用不相关结果填满列表。",
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
    aiBrief: "DeepSeek Pro 评审",
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
    importSafetyProcess: "文件仅在本次分析中提取文本并发送给 DeepSeek Pro；Pi 不保存原文件或原始正文。生成的画像草稿会暂存，放弃即删除，确认后才用于推荐。",
    singleFile: "选择单个或多个文件",
    folderUpload: "选择文件夹",
    pasteConversation: "也可以粘贴聊天记录",
    analyzeMaterials: "生成研究画像草稿",
    analyzingMaterials: "DeepSeek Pro 正在分析资料",
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
    threads: "Threads",
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
    briefTime: "Topics, priority journals, and academic graphs discover candidates; DeepSeek Pro screens and writes every recommendation",
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
    learnTitle: "What research direction do you want to enter?",
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
    accountNote: "No sign-in is required. Data is saved through this browser's anonymous workspace; clearing browser data creates a new workspace.",
    paperBack: "Back to today's brief",
    recommendation: "Recommendation",
    coreContribution: "Core contribution",
    relation: "Relation to your research",
    suggestedReading: "If you only have 20 minutes",
    askAboutPaper: "Ask about this paper",
    spaceDialogTitle: "Your research spaces",
    spaceDialogIntro: "Each space represents one research direction, with memory and answers kept separate from every other direction.",
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
    liveMonitor: "Real papers approved by DeepSeek Pro",
    monitorIntro: "Topics, priority journals, arXiv, OpenAlex, Semantic Scholar, and citation frontiers supply candidates; DeepSeek Pro judges each one against this research space and writes the briefing.",
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
    noLivePapers: "No paper passed DeepSeek Pro's strict review in this scan; Pi will not fill the list with weak matches.",
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
    aiBrief: "DeepSeek Pro review",
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
    importSafetyProcess: "Text is extracted for this analysis and sent to DeepSeek Pro. Pi stores neither original files nor raw text. The profile draft is held until you discard or confirm it, and affects recommendations only after confirmation.",
    singleFile: "Choose files",
    folderUpload: "Choose folder",
    pasteConversation: "Or paste conversation text",
    analyzeMaterials: "Generate profile draft",
    analyzingMaterials: "DeepSeek Pro is analyzing the materials",
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
  { id: "space-info-theory", name: "Information Theory", memberName: "Yilin", description: "Gaussian extremality, rate-distortion theory, and transport converses", accent: "blue" },
  { id: "space-applied-math", name: "Applied Mathematics", memberName: "Ming", description: "Functional inequalities, stochastic localization, and optimal transport", accent: "umber" },
  { id: "space-ml-reading", name: "ML Reading", memberName: "Sarah", description: "Foundation models, efficient learning, and generative compression", accent: "sage" },
];

function initials(value: string) {
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function ensureAnonymousWorkspace() {
  const storageKey = "pi-anonymous-workspace";
  let workspaceId = window.localStorage.getItem(storageKey) ?? "";
  if (!/^[a-zA-Z0-9-]{20,64}$/.test(workspaceId)) {
    workspaceId = window.crypto.randomUUID();
    window.localStorage.setItem(storageKey, workspaceId);
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `pi_anonymous_workspace=${workspaceId}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
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

function researchRoleLabel(role: ResearchTrackRole, locale: Locale) {
  const labels: Record<ResearchTrackRole, Localized> = {
    foundation: { zh: "奠基", en: "Foundation" },
    milestone: { zh: "发展节点", en: "Milestone" },
    frontier: { zh: "近年前沿", en: "Frontier" },
  };
  return labels[role][locale];
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
  return <span className="v2-paper-discovery-source" title={labels.join(" · ")}><i />{labels[0]}{labels.length > 1 ? ` +${labels.length - 1}` : ""}</span>;
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
  return <p className={`v2-route-learning-note ${signal}`}><span>π</span><strong>{locale === "zh" ? "路线学习" : "Route learning"}</strong><small>{copy[signal][locale]}</small></p>;
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

function researchRouteAttentionTitle(kind: ResearchRouteAttentionKind, locale: Locale) {
  const labels: Record<ResearchRouteAttentionKind, Localized> = {
    recover: { zh: "先恢复证据不足的路线", en: "Recover the route with insufficient evidence" },
    today: { zh: "先处理今日中的路线论文", en: "Handle route papers in Today first" },
    quality_review: { zh: "等待共享质量队列完成评估", en: "Let the shared quality queue finish reviewing" },
    confirm_evidence: { zh: "确认待回流的路线证据", en: "Confirm route evidence awaiting feedback" },
    evidence_gap: { zh: "把关键证据缺口变成下一轮检索", en: "Turn the key evidence gap into the next search" },
    maintain: { zh: "继续轮换深挖稳定路线", en: "Continue rotating discovery on the stable route" },
  };
  return labels[kind][locale];
}

function RoutePortfolioOverview({
  portfolio,
  todayCount,
  attentionKind,
  attentionTrack,
  locale,
  onAction,
}: {
  portfolio: ResearchRoutePortfolio;
  todayCount: number;
  attentionKind: ResearchRouteAttentionKind;
  attentionTrack: ResearchTrack;
  locale: Locale;
  onAction: () => void;
}) {
  const inReview = portfolio.queuedCount + portfolio.reviewingCount;
  const status = portfolio.degradedRouteCount > 0
    ? (locale === "zh" ? `${portfolio.degradedRouteCount} 条路线待补证据` : `${portfolio.degradedRouteCount} routes need evidence`)
    : portfolio.pausedRouteCount > 0
      ? (locale === "zh" ? `${portfolio.pausedRouteCount} 条路线已暂停，其余继续运行` : `${portfolio.pausedRouteCount} routes paused; the rest keep running`)
    : inReview > 0
      ? (locale === "zh" ? `${inReview} 篇等待或正在质量评估` : `${inReview} awaiting or in quality review`)
      : todayCount > 0
        ? (locale === "zh" ? `今日有 ${todayCount} 篇路线推荐` : `${todayCount} route papers in Today`)
        : (locale === "zh" ? "路线闭环持续运行" : "Route loop is running");
  const actionCopy: Record<ResearchRouteAttentionKind, { labelZh: string; labelEn: string; bodyZh: string; bodyEn: string }> = {
    recover: {
      labelZh: "重试补充", labelEn: "Retry evidence",
      bodyZh: "这条路线证据不足或来源曾降级；现有节点和候选会保留，补齐前不会假装完成。",
      bodyEn: "This route lacks enough evidence or had a degraded source. Existing nodes remain, and it will not appear complete before recovery.",
    },
    today: {
      labelZh: "前往今日", labelEn: "Open Today",
      bodyZh: "已有路线论文通过质量门槛，等待你的阅读与判断；确认后才回流正式路线证据。",
      bodyEn: "Route papers passed the quality gate and await your judgment. Only confirmation feeds formal route evidence.",
    },
    quality_review: {
      labelZh: "查看路线", labelEn: "Review route",
      bodyZh: "候选正在共享质量队列中后台评估，不需要你逐篇确认；通过后才会出现在今日。",
      bodyEn: "Candidates are being reviewed in the shared quality queue without requiring approval. Only passing papers reach Today.",
    },
    confirm_evidence: {
      labelZh: "前往今日", labelEn: "Open Today",
      bodyZh: "这条路线已有待确认论文；你的接受、保存或完成阅读会决定是否写入正式证据。",
      bodyEn: "This route has papers awaiting confirmation. Accepting, saving, or completing them determines formal evidence updates.",
    },
    evidence_gap: {
      labelZh: "查看证据缺口", labelEn: "Review evidence gap",
      bodyZh: "当前最值得推进的是把 Pi 识别出的关键不确定性变成下一轮可核验检索。",
      bodyEn: "The best next step is turning Pi's key uncertainty into the next verifiable search.",
    },
    maintain: {
      labelZh: "继续深挖", labelEn: "Mine deeper",
      bodyZh: "路线当前稳定，可继续轮换前沿、奠基文献、证据缺口和引用网络。",
      bodyEn: "This route is stable and can continue rotating frontier, foundation, gap, and citation-network discovery.",
    },
  }[attentionKind];
  return <section className="v2-route-portfolio compact" aria-label={locale === "zh" ? "当前路线优先事项" : "Current route priority"}>
    <header><div><p className="v2-kicker">{locale === "zh" ? "当前优先事项" : "CURRENT PRIORITY"}</p><h2>{researchRouteAttentionTitle(attentionKind, locale)}</h2></div><span className={portfolio.degradedRouteCount > 0 ? "degraded" : portfolio.pausedRouteCount > 0 ? "paused" : "healthy"}><i />{status}</span></header>
    <aside><div><strong>{locale === "zh" ? attentionTrack.titleZh : attentionTrack.titleEn}</strong><p>{actionCopy[locale === "zh" ? "bodyZh" : "bodyEn"]}</p></div><button type="button" onClick={onAction}>{actionCopy[locale === "zh" ? "labelZh" : "labelEn"]} →</button></aside>
    <footer><span>{portfolio.discoveredCount} {locale === "zh" ? "候选" : "candidates"}</span><span>{inReview} {locale === "zh" ? "评估中" : "in review"}</span><span>{todayCount} {locale === "zh" ? "今日" : "in Today"}</span><span>{portfolio.formalEvidenceCount} {locale === "zh" ? "正式证据" : "formal evidence"}</span></footer>
  </section>;
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
  return <section className="v2-research-decision-panel" aria-labelledby={`research-decision-${track.id}`}>
    <header><div><p className="v2-kicker">{locale === "zh" ? "当前研究判断" : "CURRENT RESEARCH JUDGMENT"}</p><h2 id={`research-decision-${track.id}`}>{decision}</h2></div></header>
    <div className="v2-research-decision-grid">
      <article className="decision"><small>{locale === "zh" ? "关键不确定性" : "KEY UNCERTAINTY"}</small><p>{uncertainty}</p></article>
      <article className={`action ${shouldScanGap ? "actionable" : ""}`}><small>{locale === "zh" ? "下一步" : "NEXT"}</small><h3>{nextAction}</h3>{shouldScanGap && <ResearchGapDiscoveryStatus track={track} locale={locale} />}</article>
    </div>
    <footer><div className="v2-research-decision-actions">{shouldScanGap && actionableGap ? <button type="button" className="primary" disabled={gapScanBlocked} onClick={() => onScanGap(actionableGap.origin)}>{gapScanning ? (locale === "zh" ? "正在补证据…" : "Finding evidence…") : (locale === "zh" ? "立即提前检索" : "Run search now")} →</button> : <button type="button" className="primary" onClick={() => onOpenWorkspace(primaryTab)}>{primaryLabel} →</button>}{(unresolvedToday > 0 || track.pendingEvidenceCount > 0) && <button type="button" onClick={onOpenToday}>{locale === "zh" ? `处理今日待决 ${Math.max(unresolvedToday, track.pendingEvidenceCount)}` : `Review ${Math.max(unresolvedToday, track.pendingEvidenceCount)} in Today`}</button>}<button type="button" onClick={onOpenLearning}>{locale === "zh" ? "学习路径" : "Learning path"}</button></div></footer>
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
  const [open, setOpen] = useState(needsAttention);
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

function RouteEvolutionWorkbench({
  track,
  locale,
  action,
  onPropose,
  onDecision,
}: {
  track: ResearchTrack;
  locale: Locale;
  action: string | null;
  onPropose: () => void;
  onDecision: (revisionId: string, decision: "confirm" | "dismiss") => void;
}) {
  const revisions = track.routeRevisions || [];
  const proposed = revisions.find((revision) => revision.status === "proposed") || null;
  const history = revisions.filter((revision) => revision.status !== "proposed");
  const currentFormal = revisions.find((revision) => revision.status === "confirmed") || null;
  const effectiveness = currentFormal?.effectiveness || null;
  const shadowExperiment = effectiveness?.shadowExperiment || null;
  const busy = Boolean(action?.startsWith("evolution-"));
  const statusLabel = (revision: (typeof revisions)[number]) => revision.model === "system-baseline"
    ? (locale === "zh" ? "初始正式基线" : "Initial formal baseline")
    : revision.status === "confirmed"
      ? (locale === "zh" ? "当前正式版本" : "Current formal version")
      : revision.status === "dismissed"
      ? (locale === "zh" ? "已驳回" : "Dismissed")
      : revision.status === "superseded"
        ? (locale === "zh" ? "历史版本" : "Historical version")
        : (locale === "zh" ? "待确认" : "Awaiting confirmation");
  return <section className="v2-route-evolution">
    <header><div><p className="v2-kicker">{locale === "zh" ? "证据驱动的路线版本" : "EVIDENCE-DRIVEN ROUTE VERSIONS"}</p><h2>{locale === "zh" ? "先看变化依据，再决定是否更新正式路线" : "Review the evidence before changing the formal route"}</h2><p>{locale === "zh" ? "Pi 只使用已确认且通过独立核对的推荐论文，并明确区分论文证据与 Pi 的跨论文综合。" : "Pi uses only confirmed recommendations that passed independent verification, while keeping paper evidence distinct from Pi's cross-paper synthesis."}</p></div><button type="button" onClick={onPropose} disabled={busy || track.confirmedEvidenceCount < 1}>{action === `evolution-propose:${track.id}` ? (locale === "zh" ? "正在形成提案…" : "Drafting proposal…") : proposed ? (locale === "zh" ? "依据变化后重新生成" : "Regenerate after evidence changes") : (locale === "zh" ? "根据当前证据形成提案" : "Propose from current evidence")}</button></header>
    {proposed ? <article className="v2-route-evolution-proposal">
      <div className="v2-route-evolution-status"><span>v{proposed.version}</span><strong>{locale === "zh" ? "待你确认" : "Awaiting your confirmation"}</strong><small>{proposed.confidence}% {locale === "zh" ? "提案置信度" : "proposal confidence"}</small></div>
      <div className="v2-route-evolution-diff">
        <section><small>{locale === "zh" ? "当前正式路线" : "CURRENT FORMAL ROUTE"}</small><h3>{locale === "zh" ? proposed.previousTitleZh : proposed.previousTitleEn}</h3><p>{locale === "zh" ? proposed.previousSummaryZh : proposed.previousSummaryEn}</p><div>{proposed.previousSearchQueries.map((query) => <code key={query}>{query}</code>)}</div></section>
        <i>→</i>
        <section className="next"><small>{locale === "zh" ? "提议的新版本" : "PROPOSED NEXT VERSION"}</small><h3>{locale === "zh" ? proposed.titleZh : proposed.titleEn}</h3><p>{locale === "zh" ? proposed.summaryZh : proposed.summaryEn}</p><div>{proposed.searchQueries.map((query) => <code key={query}>{query}</code>)}</div></section>
      </div>
      <div className="v2-route-evolution-reason"><small>{locale === "zh" ? "为什么建议变化" : "WHY THIS CHANGE IS PROPOSED"}</small><p>{locale === "zh" ? proposed.rationaleZh : proposed.rationaleEn}</p></div>
      <div className="v2-route-evolution-sources"><section><header><strong>{locale === "zh" ? "已确认论文证据" : "Confirmed paper evidence"}</strong><span>{proposed.sourcePapers.length}</span></header>{proposed.sourcePapers.map((paper) => <div key={paper.paperId}><b>✓</b><span><strong>{paper.title}</strong><small>{[paper.authors, paper.venue, paper.publishedAt?.slice(0, 4)].filter(Boolean).join(" · ")}</small></span></div>)}</section><section className="pi-synthesis"><header><strong>{locale === "zh" ? "Pi 跨论文综合（推断）" : "Pi cross-paper synthesis (inferred)"}</strong><span>{proposed.sourceStatements.length}</span></header>{proposed.sourceStatements.map((statement) => <div key={statement.statementId}><b>π</b><span><strong>{locale === "zh" ? statement.titleZh : statement.titleEn}</strong><small>{locale === "zh" ? statement.textZh : statement.textEn}</small></span></div>)}{!proposed.sourceStatements.length && <p>{locale === "zh" ? "本提案只使用论文证据，没有引用额外综合结论。" : "This proposal relies on paper evidence without additional synthesis statements."}</p>}</section></div>
      <footer><p>{locale === "zh" ? "确认后才会替换正式路线描述和下一轮检索词；驳回不会删除证据或历史。" : "Only confirmation replaces the formal route definition and future queries. Dismissal removes no evidence or history."}</p><div><button type="button" className="secondary" onClick={() => onDecision(proposed.id, "dismiss")} disabled={busy}>{action === `evolution-dismiss:${proposed.id}` ? "…" : (locale === "zh" ? "驳回并保留记录" : "Dismiss and retain")}</button><button type="button" onClick={() => onDecision(proposed.id, "confirm")} disabled={busy}>{action === `evolution-confirm:${proposed.id}` ? "…" : (locale === "zh" ? "确认更新正式路线" : "Confirm formal route update")}</button></div></footer>
    </article> : <div className="v2-route-evolution-empty"><span>△</span><div><strong>{track.confirmedEvidenceCount > 0 ? (locale === "zh" ? "正式证据已有变化时，可以形成下一版路线提案" : "A new route proposal can be formed when formal evidence changes") : (locale === "zh" ? "还没有足够的正式证据" : "Not enough formal evidence yet")}</strong><p>{track.confirmedEvidenceCount > 0 ? (locale === "zh" ? "提案生成后仍需你确认，不会自动改写路线。" : "The proposal still requires your confirmation and never rewrites the route automatically.") : (locale === "zh" ? "论文先通过共享质量队列和证据核对，再由你的接受或完成阅读确认进入路线。" : "A paper must pass shared quality review and evidence verification, then be confirmed by your acceptance or completed reading.")}</p></div></div>}
    {effectiveness && <section className={`v2-route-effectiveness ${effectiveness.verdict}`}>
      <header><div><small>{locale === "zh" ? `v${effectiveness.version} · 正式版本成效` : `v${effectiveness.version} · FORMAL VERSION OUTCOME`}</small><strong>{effectiveness.verdict === "retain" ? (locale === "zh" ? "建议保留当前版本" : "Retain the current version") : effectiveness.verdict === "reconsider" ? (locale === "zh" ? "建议人工考虑上一版本" : "Consider the prior version") : (locale === "zh" ? "继续观察，不下结论" : "Keep observing")}</strong></div><span>{effectiveness.confidence}% {locale === "zh" ? "判断置信度" : "decision confidence"}</span></header>
      <div className="v2-route-effectiveness-window"><span>{locale === "zh" ? "观察窗口" : "Observation window"}</span><time>{formatNotificationTime(effectiveness.windowStartedAt, locale)}</time><i>→</i><time>{effectiveness.windowEndedAt ? formatNotificationTime(effectiveness.windowEndedAt, locale) : (locale === "zh" ? "现在" : "now")}</time></div>
      <dl>
        <div><dt>{locale === "zh" ? "路线候选" : "Candidates"}</dt><dd>{effectiveness.candidateCount}</dd><small>{locale === "zh" ? "按首次发现归属版本" : "attributed at first discovery"}</small></div>
        <div><dt>{locale === "zh" ? "进入深评" : "Deep reviewed"}</dt><dd>{effectiveness.deepReviewedCount}</dd><small>{effectiveness.candidateCount ? `${effectiveness.deepReviewRate}%` : "—"}</small></div>
        <div><dt>{locale === "zh" ? "正式推荐" : "Recommended"}</dt><dd>{effectiveness.recommendedCount}</dd><small>{effectiveness.deepReviewedCount ? `${effectiveness.recommendationRate}%` : "—"}{effectiveness.recommendationRateDelta !== null ? ` · ${effectiveness.recommendationRateDelta > 0 ? "+" : ""}${effectiveness.recommendationRateDelta}pp` : ""}</small></div>
        <div><dt>{locale === "zh" ? "接受 / 完读" : "Accepted / completed"}</dt><dd>{effectiveness.acceptedCount} / {effectiveness.readingCompletedCount}</dd><small>{effectiveness.recommendedCount ? `${effectiveness.acceptanceRate}% ${locale === "zh" ? "接受率" : "acceptance"}` : "—"}</small></div>
        <div><dt>{locale === "zh" ? "正式路线证据" : "Formal evidence"}</dt><dd>{effectiveness.formalEvidenceCount}</dd><small>{effectiveness.readingStartedCount} {locale === "zh" ? "篇开始阅读" : "started reading"}</small></div>
        <div><dt>{locale === "zh" ? "研究判断变化" : "Research changes"}</dt><dd>{effectiveness.problemAssessmentCount + effectiveness.synthesisUpdateCount}</dd><small>{locale === "zh" ? `${effectiveness.problemAssessmentCount} 次问题评估 · ${effectiveness.synthesisUpdateCount} 次综合` : `${effectiveness.problemAssessmentCount} problem · ${effectiveness.synthesisUpdateCount} synthesis`}</small></div>
      </dl>
      {shadowExperiment && <section className={`v2-route-shadow-experiment ${shadowExperiment.status}`}>
        <header><div><small>{locale === "zh" ? "上一版受控对照" : "PRIOR-VERSION CONTROL"}</small><strong>{shadowExperiment.verdict === "retain_current" ? (locale === "zh" ? "对照支持保留当前版" : "Control supports the current version") : shadowExperiment.verdict === "consider_previous" ? (locale === "zh" ? "建议人工复核上一版" : "Manually review the prior version") : (locale === "zh" ? "样本积累中，不下结论" : "Collecting evidence; no conclusion")}</strong></div><span>{locale === "zh" ? `上限 ${shadowExperiment.maxShadowAttempts} 轮 × ${shadowExperiment.maxResultsPerAttempt} 条` : `Cap ${shadowExperiment.maxShadowAttempts} runs × ${shadowExperiment.maxResultsPerAttempt}`}</span></header>
        <div className="v2-route-shadow-arms">{[
          { key: "current", label: locale === "zh" ? `当前正式版 v${shadowExperiment.current.version}` : `Current formal v${shadowExperiment.current.version}`, arm: shadowExperiment.current },
          { key: "shadow", label: locale === "zh" ? `上一版对照 v${shadowExperiment.shadow.version}` : `Prior control v${shadowExperiment.shadow.version}`, arm: shadowExperiment.shadow },
        ].map(({ key, label, arm }) => <article className={key} key={key}><header><strong>{label}</strong><small>{arm.attemptCount} {locale === "zh" ? "轮发现" : "discovery runs"}</small></header><dl><div><dt>{locale === "zh" ? "候选" : "Candidates"}</dt><dd>{arm.candidateCount}</dd></div><div><dt>{locale === "zh" ? "深评" : "Reviewed"}</dt><dd>{arm.deepReviewedCount}</dd></div><div><dt>{locale === "zh" ? "推荐" : "Recommended"}</dt><dd>{arm.recommendedCount}</dd></div><div><dt>{locale === "zh" ? "接受 / 完读" : "Accepted / read"}</dt><dd>{arm.acceptedCount} / {arm.readingCompletedCount}</dd></div></dl></article>)}</div>
        <footer><p>{locale === "zh" ? shadowExperiment.summaryZh : shadowExperiment.summaryEn}</p>{shadowExperiment.recommendationRateDelta !== null && <small>{locale === "zh" ? `上一版相对当前版推荐率：${shadowExperiment.recommendationRateDelta > 0 ? "+" : ""}${shadowExperiment.recommendationRateDelta}pp` : `Prior-versus-current recommendation rate: ${shadowExperiment.recommendationRateDelta > 0 ? "+" : ""}${shadowExperiment.recommendationRateDelta}pp`}</small>}</footer>
      </section>}
      {effectiveness.sourceFailureCount > 0 && <aside><b>!</b><p>{locale === "zh" ? `窗口内记录到 ${effectiveness.sourceFailureCount} 次路线来源降级；Pi 不会把低产出误判成路线质量下降。` : `${effectiveness.sourceFailureCount} route-source degradations occurred in this window. Pi will not mistake low yield for lower route quality.`}</p></aside>}
      <footer><p>{locale === "zh" ? effectiveness.summaryZh : effectiveness.summaryEn}</p><small>{locale === "zh" ? "建议只依据真实候选、质量审计、反馈、阅读和正式证据；不会自动回退，也不会降低质量门槛。" : "The recommendation uses real candidates, quality audits, feedback, reading and formal evidence only. It never rolls back automatically or lowers the quality gate."}</small></footer>
    </section>}
    {history.length > 0 && <details className="v2-route-evolution-history"><summary><span><strong>{locale === "zh" ? "路线版本历史" : "Route version history"}</strong><small>{locale === "zh" ? "所有确认、驳回和旧版本均保留" : "Confirmed, dismissed, and prior versions are retained"}</small></span><b>{history.length}</b></summary><div>{history.map((revision) => <article className={`${revision.status} ${revision.model === "system-baseline" ? "baseline" : ""}`} key={revision.id}><header><span>v{revision.version}</span><strong>{statusLabel(revision)}</strong><time>{formatNotificationTime(revision.decidedAt || revision.updatedAt, locale)}</time></header><h3>{locale === "zh" ? revision.titleZh : revision.titleEn}</h3><p>{locale === "zh" ? revision.rationaleZh : revision.rationaleEn}</p><small>{revision.model === "system-baseline" ? (locale === "zh" ? "原样快照 · 未改写路线" : "Exact snapshot · route unchanged") : <>{revision.sourcePaperIds.length} {locale === "zh" ? "篇论文证据" : "paper sources"} · {revision.sourceStatementIds.length} {locale === "zh" ? "条 Pi 综合" : "Pi synthesis statements"}{revision.effectiveness ? ` · ${revision.effectiveness.recommendedCount} ${locale === "zh" ? "篇正式推荐" : "recommended"}` : ""}</>}</small></article>)}</div></details>}
  </section>;
}

function directionRelationshipLabel(kind: ResearchMapState["edges"][number]["kind"], locale: Locale) {
  const labels: Record<ResearchMapState["edges"][number]["kind"], Localized> = {
    builds_on: { zh: "发展承接", en: "Builds on" },
    bridges: { zh: "跨向桥接", en: "Bridges" },
    supports: { zh: "方法支撑", en: "Supports" },
  };
  return labels[kind][locale];
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

function learningKindLabel(kind: LearningStepKind, locale: Locale) {
  const labels: Record<LearningStepKind, Localized> = {
    prerequisite: { zh: "必要先修", en: "Prerequisite" },
    foundation: { zh: "奠基工作", en: "Foundation" },
    method: { zh: "方法进阶", en: "Methods" },
    milestone: { zh: "关键里程碑", en: "Milestone" },
    frontier: { zh: "研究前沿", en: "Frontier" },
    project: { zh: "独立研究", en: "Research exercise" },
  };
  return labels[kind][locale];
}

function learningTime(minutes: number, locale: Locale) {
  if (minutes < 60) return locale === "zh" ? `${minutes} 分钟` : `${minutes} min`;
  const hours = Math.round(minutes / 6) / 10;
  return locale === "zh" ? `约 ${hours} 小时` : `≈ ${hours} h`;
}

function researchPaperYear(paper: ResearchTrackPaper) {
  return paper.publishedAt?.slice(0, 4) || "—";
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

function readingStatusLabel(status: MonitorPaper["readingStatus"], locale: Locale) {
  const labels: Record<MonitorPaper["readingStatus"], Localized> = {
    unread: { zh: "未加入阅读", en: "Not queued" },
    queued: { zh: "待读", en: "Queued" },
    reading: { zh: "阅读中", en: "Reading" },
    read: { zh: "已读", en: "Read" },
    mastered: { zh: "已掌握", en: "Mastered" },
    cited: { zh: "已引用", en: "Cited" },
  };
  return labels[status || "unread"][locale];
}

function learningResourceSourceLabel(source: LearningResource["source"], locale: Locale) {
  if (source === "research-map+daily-scan") return locale === "zh" ? "路线证据 · 今日评审" : "Route evidence · Daily review";
  if (source === "daily-scan") return locale === "zh" ? "今日质量评审" : "Daily quality review";
  if (source === "research-map") return locale === "zh" ? "研究路线证据" : "Research-route evidence";
  return locale === "zh" ? "已保存真实论文" : "Saved real paper";
}

function learningResourceSignals(resource: LearningResource, locale: Locale) {
  return [
    resource.qualification === "quality_approved" ? (locale === "zh" ? "质量已通过" : "Quality approved") : "",
    learningResourceSourceLabel(resource.source, locale),
    resource.readingStatus && resource.readingStatus !== "unread" ? readingStatusLabel(resource.readingStatus, locale) : "",
  ].filter(Boolean);
}

function learningEvidenceLabel(step: LearningPathStep, locale: Locale) {
  const labels = {
    ready: { zh: "材料已就绪", en: "Evidence ready" },
    searching: { zh: "正在补证", en: "Finding evidence" },
    awaiting_quality: { zh: "候选正在质量评估", en: "Candidates in quality review" },
    retryable: { zh: "来源暂不可用 · 将重试", en: "Source unavailable · retry pending" },
    degraded: { zh: "本轮来源降级", en: "Sources degraded in this round" },
    insufficient: { zh: "本轮没有候选通过", en: "No candidate passed this round" },
    missing: { zh: "尚缺可靠材料", en: "Reliable evidence missing" },
  } as const;
  return labels[step.evidenceStatus][locale];
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
    screening: { zh: "DeepSeek Pro 正在快速筛选候选", en: "DeepSeek Pro is triaging candidates" },
    deep_reviewing: { zh: "高潜力论文正在并行深度解读", en: "High-potential papers are being interpreted in parallel" },
    reviewing: { zh: "DeepSeek Pro 正在逐篇筛选并撰写", en: "DeepSeek Pro is screening and writing each brief" },
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
  const message = monitorErrorText(error);
  return /deepseek_insufficient_balance|deepseek_credential_invalid|insufficient\s+balance|invalid\s+(?:api\s*)?key|authentication|unauthorized/i.test(message);
}

function monitorFailureMessage(error: unknown, locale: Locale) {
  const message = monitorErrorText(error);
  if (/deepseek_insufficient_balance|insufficient\s+balance|余额不足/i.test(message)) {
    return locale === "zh"
      ? "DeepSeek 账户余额不足。候选论文和已完成的筛选进度都已保存；充值或更换可用 Key 后可以从断点继续。"
      : "The DeepSeek account has insufficient balance. Candidates and completed screening progress are saved; top up or use another key to resume.";
  }
  if (/deepseek_credential_invalid|invalid\s+(?:api\s*)?key|authentication|unauthorized/i.test(message)) {
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

function routeChangeKindLabel(kind: string) {
  const labels: Record<string, { zh: string; en: string; symbol: string }> = {
    new_evidence: { zh: "新增证据", en: "New evidence", symbol: "＋" },
    route_initialized: { zh: "新建路线", en: "Route created", symbol: "◎" },
    node_added: { zh: "节点扩展", en: "Nodes added", symbol: "↗" },
    evidence_refined: { zh: "证据补强", en: "Evidence refined", symbol: "◆" },
  };
  return labels[kind] || { zh: "路线更新", en: "Route update", symbol: "＋" };
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

function startMonitorPolling(spaceId: string, onUpdate: (monitor: MonitorState) => void) {
  let stopped = false;
  let polling = false;
  const poll = async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      const response = await fetch("/api/monitor?spaceId=" + encodeURIComponent(spaceId));
      const data = await response.json() as { monitor?: MonitorState };
      if (!stopped && response.ok && data.monitor) onUpdate(data.monitor);
    } catch {
      // The long-running scan remains authoritative; the next poll can recover.
    } finally {
      polling = false;
    }
  };
  void poll();
  const timer = window.setInterval(() => void poll(), 1500);
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
) {
  let current = initialMonitor;
  let lastReclaimAttemptAt = 0;
  for (let step = 0; step < 400 && !isCancelled() && !["ready", "error"].includes(current.status); step += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    if (isCancelled()) break;
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
) {
  let current = initialMonitor;
  for (let step = 0; step < 64 && !isCancelled(); step += 1) {
    if (["ready", "error"].includes(current.status)) break;
    const response = await fetch("/api/monitor", {
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
    const data = await response.json().catch(() => ({})) as { monitor?: MonitorState; error?: string };
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
    ? { zh: "已撤销这次判断，论文回到待处理状态。", en: "Decision removed; the paper is pending again." }
    : kind === "later"
      ? { zh: "已推迟 3 天，不会降低研究偏好。", en: "Snoozed for three days without lowering your preferences." }
      : reasonCode === "duplicate_known"
        ? { zh: "已掌握：减少同类入门内容，继续寻找更深或更新的论文。", en: "Mastered: Pi will seek deeper or newer work instead of similar introductions." }
        : kind === "not_relevant"
          ? { zh: "已降低相似检索分支，不会删除历史论文。", en: "Similar discovery branches were deprioritized; history stays intact." }
          : kind === "relevant"
            ? { zh: "已加强相关主题、方法或问题的下一轮检索。", en: "The related topic, method, or question will guide the next scan." }
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

type NetworkPaperNode = {
  paper: ResearchTrackPaper;
  track: ResearchTrack;
  trackIds: string[];
  external?: ResearchNetworkCandidate;
};

const paperNetworkPalette = ["#2f6650", "#9b6848", "#416c83", "#745f8c", "#8a7b3e"];
const paperNetworkYearPalette = ["#d1c4ad", "#b2b9aa", "#88a694", "#5d8975", "#2f6650"];
const PAPER_NETWORK_ACTIVE_NODE_LIMIT = 72;

function buildNetworkPaperNodes(map: ResearchMapState) {
  const unique = new Map<string, NetworkPaperNode>();
  for (const track of map.tracks) {
    for (const paper of track.papers) {
      const previous = unique.get(paper.canonicalId);
      if (!previous) {
        unique.set(paper.canonicalId, { paper, track, trackIds: [track.id] });
        continue;
      }
      const trackIds = Array.from(new Set([...previous.trackIds, track.id]));
      if ((!previous.paper.doi && paper.doi) || paper.citationCount > previous.paper.citationCount) {
        unique.set(paper.canonicalId, { paper, track, trackIds });
      } else {
        unique.set(paper.canonicalId, { ...previous, trackIds });
      }
    }
  }
  return Array.from(unique.values());
}

function normalizedNetworkDirection(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, "-");
}

function researchNetworkOriginKey(originCanonicalIds: string[]) {
  return Array.from(new Set(originCanonicalIds.map((id) => id.trim()).filter(Boolean))).sort().join("|");
}

function candidateBelongsToTab(candidate: ResearchNetworkCandidate, tab: PaperDiscoveryTab) {
  if (tab === "similar") return true;
  const directions = candidate.relations.map((relation) => normalizedNetworkDirection(relation.direction));
  if (tab === "prior") return directions.some((direction) => ["prior", "reference", "references", "backward", "outgoing", "cited", "seed-cites-candidate"].includes(direction));
  return directions.some((direction) => ["derivative", "citation", "citing", "forward", "incoming", "cited-by", "candidate-cites-seed"].includes(direction));
}

function clampNetworkStrength(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function networkCandidateFitLabel(score: number, locale: Locale) {
  if (score >= 82) return locale === "zh" ? "高相关候选" : "High-relevance candidate";
  if (score >= 68) return locale === "zh" ? "较相关候选" : "Relevant candidate";
  return locale === "zh" ? "探索候选" : "Exploratory candidate";
}

function currentOriginEvidenceCount(candidate: ResearchNetworkCandidate, originCanonicalIds: string[]) {
  const originSet = new Set(originCanonicalIds);
  return new Set(candidate.relations
    .filter((relation) => relation.kind !== "recommendation")
    .map((relation) => relation.seedCanonicalId)
    .filter((id) => originSet.has(id))).size;
}

type ResearchNetworkDisplaySourceStatus = ResearchNetworkSourceStatus[keyof ResearchNetworkSourceStatus] | "empty" | "no_matches";

function researchNetworkSourceLabel(status: ResearchNetworkDisplaySourceStatus, locale: Locale) {
  const labels: Record<ResearchNetworkDisplaySourceStatus, Localized> = {
    ok: { zh: "已更新", en: "updated" },
    partial: { zh: "部分可用", en: "partial" },
    unavailable: { zh: "暂不可用", en: "unavailable" },
    cached: { zh: "缓存", en: "cached" },
    not_attempted: { zh: "未调用", en: "not used" },
    empty: { zh: "已检查，暂无新结果", en: "checked, no new results" },
    no_matches: { zh: "已检查，未匹配到新论文", en: "checked, no matching papers" },
  };
  return labels[status][locale];
}

function isResearchNetworkExpandResponse(value: unknown): value is ResearchNetworkExpandResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.status === "string"
    && Array.isArray(record.seeds)
    && Array.isArray(record.candidates)
    && Array.isArray(record.similarityEdges)
    && Boolean(record.sourceStatus && typeof record.sourceStatus === "object");
}

function researchNetworkHasNoNewCandidates(response: ResearchNetworkExpandResponse) {
  const responseStatus = String(response.status);
  const sourceStatuses = Object.values(response.sourceStatus).map(String);
  const incomplete = response.externalUnavailable
    || sourceStatuses.some((status) => status === "partial" || status === "unavailable");
  return responseStatus === "no_matches" && response.candidates.length === 0 && !incomplete;
}

function researchNetworkIssueSummary(response: ResearchNetworkExpandResponse, locale: Locale) {
  const codes = new Set(response.issues.map((issue) => issue.code));
  if (researchNetworkHasNoNewCandidates(response)) return "";
  if (codes.has("quota_exhausted")) return locale === "zh"
    ? "今日外部发现额度已用完；现有论文与关系已保留，明日可继续。"
    : "Today's external discovery budget is used up. Existing papers and links are preserved; continue tomorrow.";
  if (response.status === "rate_limited" || codes.has("rate_limited")) {
    const seconds = response.retryAfterSeconds || Math.max(0, ...response.issues.map((issue) => issue.retryAfterSeconds || 0));
    const waitLabel = seconds > 0
      ? locale === "zh"
        ? seconds >= 60 ? `约 ${Math.ceil(seconds / 60)} 分钟后` : `约 ${seconds} 秒后`
        : seconds >= 60 ? `in about ${Math.ceil(seconds / 60)} minute(s)` : `in about ${seconds} seconds`
      : locale === "zh" ? "稍后" : "later";
    return locale === "zh"
      ? `Semantic Scholar 正在限流；现有论文与关系已保留，可${waitLabel}继续发现。`
      : `Semantic Scholar is rate-limiting requests. Existing papers and links are preserved; try discovery again ${waitLabel}.`;
  }
  if (codes.has("seed_unresolved")) return locale === "zh"
    ? "部分起始论文暂未匹配到外部数据库；已展示其余可核验结果。"
    : "Some origin papers could not be matched in the external database; other verified results are shown.";
  if (response.issues.length || response.errors.length) return locale === "zh"
    ? "部分外部证据暂未刷新；已展示并保留当前可核验结果。"
    : "Some external evidence could not refresh; current verified results remain available.";
  if (response.status === "partial" && response.candidates.length === 0) return locale === "zh"
    ? "部分来源本轮未完成，暂未返回新的可核验候选；现有研究地图不受影响。"
    : "Some sources did not complete this pass, so no new verifiable candidates were returned; the saved research map is unaffected.";
  return "";
}

function paperNetworkStateLabel(state: MonitorPaper["userState"] | undefined, locale: Locale) {
  if (!state) return "";
  const labels: Record<MonitorPaper["userState"], Localized> = {
    unseen: { zh: "未查看", en: "unseen" },
    seen: { zh: "已浏览", en: "seen" },
    snoozed: { zh: "稍后处理", en: "snoozed" },
    accepted: { zh: "已接受", en: "accepted" },
    dismissed: { zh: "已忽略", en: "dismissed" },
  };
  return labels[state][locale];
}

function buildExternalNetworkPaperNodes(map: ResearchMapState, candidates: ResearchNetworkCandidate[]) {
  const internalNodes = buildNetworkPaperNodes(map);
  const internalCanonicalIds = new Set(internalNodes.map((node) => node.paper.canonicalId));
  const internalByCanonicalId = new Map(internalNodes.map((node) => [node.paper.canonicalId, node]));
  const fallbackTrack = map.tracks[0];
  if (!fallbackTrack) return [] as NetworkPaperNode[];
  return candidates.filter((candidate) => !internalCanonicalIds.has(candidate.canonicalId)).map((candidate, index) => {
    const relatedTracks = Array.from(new Set(candidate.relations.flatMap((relation) => internalByCanonicalId.get(relation.seedCanonicalId)?.trackIds || [])));
    const verifiedRelationCount = candidate.relations.filter((relation) => relation.kind !== "recommendation").length;
    const track = map.tracks.find((item) => relatedTracks.includes(item.id)) || fallbackTrack;
    return {
      external: candidate,
      track,
      trackIds: relatedTracks.length ? relatedTracks : [track.id],
      paper: {
        id: `ghost:${candidate.canonicalId}`,
        canonicalId: candidate.canonicalId,
        doi: candidate.canonicalId.startsWith("doi:") ? candidate.canonicalId.slice(4) : null,
        title: candidate.title,
        authors: candidate.authors,
        venue: candidate.venue,
        url: candidate.url,
        publishedAt: candidate.publishedAt,
        citationCount: candidate.citationCount,
        role: "frontier" as ResearchTrackRole,
        summaryZh: candidate.abstractText || "这是一篇尚未收入研究地图的外部候选论文。",
        summaryEn: candidate.abstractText || "This external candidate has not been added to the research map yet.",
        rationaleZh: `外部图谱将其列为${networkCandidateFitLabel(candidate.score, "zh")}；其中 ${verifiedRelationCount} 条引用关系经数据库核验，其余仅作为推荐线索。`,
        rationaleEn: `The external graph marks it as a ${networkCandidateFitLabel(candidate.score, "en").toLocaleLowerCase()}; ${verifiedRelationCount} citation relation(s) are database-verified and the rest remain recommendation leads.`,
        position: 1000 + index,
      },
    } satisfies NetworkPaperNode;
  });
}

function externalNetworkEdges(nodes: NetworkPaperNode[], candidates: NetworkPaperNode[], similarityEdges: ResearchNetworkSimilarityEdge[]) {
  const nodeByCanonicalId = new Map(nodes.map((node) => [node.paper.canonicalId, node]));
  const edges: ResearchPaperEdge[] = [];
  for (const relation of similarityEdges) {
    const source = nodeByCanonicalId.get(relation.sourceCanonicalId);
    const target = nodeByCanonicalId.get(relation.targetCanonicalId);
    if (!source || !target || source.paper.id === target.paper.id) continue;
    const coupling = relation.kind === "bibliographic_coupling" && relation.sharedReferences > 0;
    edges.push({
      id: `external-${coupling ? "coupling" : "discovery"}:${source.paper.id}:${target.paper.id}`,
      sourcePaperId: source.paper.id,
      targetPaperId: target.paper.id,
      kind: "similarity",
      relationKind: coupling ? "bibliographic_coupling" : "verified_discovery",
      relationshipZh: coupling ? `共享 ${relation.sharedReferences} 篇可核验参考文献。` : "数据库确认两篇论文存在引用发现关系；这不代表文献耦合强度。",
      relationshipEn: coupling ? `${relation.sharedReferences} verified references in common.` : "A database-verified citation relation supports discovery here; it is not a bibliographic-coupling score.",
      confidence: clampNetworkStrength(relation.weight),
      evidenceSource: relation.evidenceSource || "semantic-scholar",
    });
  }
  for (const node of candidates) {
    if (!node.external) continue;
    for (const relation of node.external.relations) {
      const kind = normalizedNetworkDirection(relation.kind);
      if (!["similarity", "similar", "recommendation", "recommended", "reference", "citation"].includes(kind)) continue;
      const seed = nodeByCanonicalId.get(relation.seedCanonicalId);
      if (!seed || seed.paper.id === node.paper.id) continue;
      if (edges.some((edge) => (edge.sourcePaperId === node.paper.id && edge.targetPaperId === seed.paper.id) || (edge.targetPaperId === node.paper.id && edge.sourcePaperId === seed.paper.id))) continue;
      const verifiedDiscovery = kind === "reference" || kind === "citation";
      edges.push({
        id: `external:${node.paper.id}:${seed.paper.id}:${kind}`,
        sourcePaperId: node.paper.id,
        targetPaperId: seed.paper.id,
        kind: "similarity",
        relationKind: verifiedDiscovery ? "verified_discovery" : "recommendation_discovery",
        relationshipZh: verifiedDiscovery ? "数据库确认的引用或参考文献发现关系；不作为文献耦合强度。" : `推荐发现线索 · ${relation.evidenceSource}；不代表引用或文献耦合。`,
        relationshipEn: verifiedDiscovery ? "A database-verified citation or reference discovery link; not a bibliographic-coupling score." : `Recommendation lead · ${relation.evidenceSource}; this is neither a citation nor bibliographic coupling.`,
        confidence: clampNetworkStrength(node.external.score),
        evidenceSource: relation.evidenceSource || "research-network",
      });
    }
  }
  return edges;
}

function networkRelationLabel(edge: ResearchPaperEdge, locale: Locale) {
  if (edge.kind === "citation") return locale === "zh" ? "真实引用" : "Verified citation";
  if (edge.kind === "similarity") {
    if (edge.relationKind === "verified_discovery") return locale === "zh" ? "引用发现线索" : "Citation discovery link";
    if (edge.relationKind === "recommendation_discovery") return locale === "zh" ? "推荐发现线索" : "Recommendation lead";
    return locale === "zh" ? "文献耦合" : "Bibliographic coupling";
  }
  const labels: Record<string, Localized> = {
    extends: { zh: "扩展", en: "Extends" }, challenges: { zh: "挑战", en: "Challenges" }, applies: { zh: "应用", en: "Applies" },
    unifies: { zh: "统一", en: "Unifies" }, bridges: { zh: "桥接", en: "Bridges" }, reframes: { zh: "重构", en: "Reframes" },
    prepares: { zh: "铺垫", en: "Prepares" }, advances: { zh: "推进", en: "Advances" },
  };
  return labels[edge.relationKind]?.[locale] || (locale === "zh" ? "语义关联" : "Semantic link");
}

function citationEvidenceProviderLabel(evidenceSource: string) {
  return evidenceSource.trim().toLocaleLowerCase() === "openalex" ? "OpenAlex" : "Semantic Scholar";
}

function networkEvidenceLabel(edge: ResearchPaperEdge, locale: Locale) {
  if (edge.kind === "citation") return locale === "zh" ? "数据库核验" : "Database verified";
  if (edge.kind === "similarity") {
    if (edge.relationKind === "verified_discovery") return locale === "zh" ? "数据库核验线索" : "Database-verified lead";
    if (edge.relationKind === "recommendation_discovery") return locale === "zh" ? "推荐线索" : "Recommendation lead";
    return locale === "zh" ? `耦合强度 ${edge.confidence}` : `Coupling strength ${edge.confidence}`;
  }
  return locale === "zh" ? `Pi 推断 · 强度 ${edge.confidence}` : `Pi inference · strength ${edge.confidence}`;
}

function paperNetworkSourceNotice(network: ResearchMapState["paperNetwork"], locale: Locale) {
  const error = network.error || "";
  const verifiedCount = network.citationEdgeCount + network.similarityEdgeCount;
  const citationFailed = /citation:|semantic scholar|citation lookup/i.test(error);
  const citationCache = network.sources.includes("semantic-scholar-cache");
  if (!citationFailed) return null;
  return locale === "zh"
    ? { title: citationCache ? "引用关系暂沿用上次版本" : "引用关系本轮未更新", body: `当前仍保留 ${verifiedCount} 条数据库关系；论文节点不受影响。`, action: "重试引用更新" }
    : { title: citationCache ? "Citations are using the saved version" : "Citations did not update this run", body: `${verifiedCount} database links remain available; paper nodes are unaffected.`, action: "Retry citations" };
}

function stableNetworkUnit(value: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return ((hash >>> 0) % 10000) / 10000;
}

function relaxSimilarityPositions(
  nodes: NetworkPaperNode[],
  edges: ResearchPaperEdge[],
  positions: Map<string, { x: number; y: number; radius: number; trackId: string; color: string }>,
  originPaperIds: string[],
  width: number,
  height: number,
) {
  const velocities = new Map(nodes.map((node) => [node.paper.id, { x: 0, y: 0 }]));
  const originSet = new Set(originPaperIds);
  const originSpacing = originPaperIds.length >= 3 ? 240 : 280;
  for (let iteration = 0; iteration < 150; iteration += 1) {
    const cooling = 1 - iteration / 180;
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      const left = positions.get(nodes[leftIndex].paper.id)!;
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const right = positions.get(nodes[rightIndex].paper.id)!;
        const dx = right.x - left.x || 0.01;
        const dy = right.y - left.y || 0.01;
        const distanceSquared = Math.max(140, dx * dx + dy * dy);
        const force = 1150 / distanceSquared;
        const distance = Math.sqrt(distanceSquared);
        const fx = dx / distance * force;
        const fy = dy / distance * force;
        velocities.get(nodes[leftIndex].paper.id)!.x -= fx;
        velocities.get(nodes[leftIndex].paper.id)!.y -= fy;
        velocities.get(nodes[rightIndex].paper.id)!.x += fx;
        velocities.get(nodes[rightIndex].paper.id)!.y += fy;
      }
    }
    for (const edge of edges) {
      const source = positions.get(edge.sourcePaperId);
      const target = positions.get(edge.targetPaperId);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const desired = edge.kind === "similarity" ? 92 : edge.kind === "citation" ? 125 : 145;
      const strength = (edge.kind === "similarity" ? 0.025 : 0.014) * Math.max(0.45, edge.confidence / 100);
      const force = (distance - desired) * strength;
      const fx = dx / distance * force;
      const fy = dy / distance * force;
      velocities.get(edge.sourcePaperId)!.x += fx;
      velocities.get(edge.sourcePaperId)!.y += fy;
      velocities.get(edge.targetPaperId)!.x -= fx;
      velocities.get(edge.targetPaperId)!.y -= fy;
    }
    nodes.forEach((node, index) => {
      const position = positions.get(node.paper.id)!;
      const velocity = velocities.get(node.paper.id)!;
      const originIndex = originPaperIds.indexOf(node.paper.id);
      const targetX = originIndex >= 0 ? width * 0.5 + (originIndex - (originPaperIds.length - 1) / 2) * originSpacing : width * 0.5;
      const targetY = originIndex >= 0 ? height * 0.5 : 84 + (index % Math.max(1, Math.ceil(Math.sqrt(nodes.length)))) * ((height - 168) / Math.max(1, Math.ceil(Math.sqrt(nodes.length)) - 1));
      velocity.x += (targetX - position.x) * (originSet.has(node.paper.id) ? 0.085 : 0.0017);
      velocity.y += (targetY - position.y) * (originSet.has(node.paper.id) ? 0.085 : 0.0011);
      velocity.x *= 0.72;
      velocity.y *= 0.72;
      position.x = Math.max(44, Math.min(width - 44, position.x + velocity.x * cooling));
      position.y = Math.max(58, Math.min(height - 48, position.y + velocity.y * cooling));
    });
  }
}

type NetworkNodePosition = { x: number; y: number; radius: number; trackId: string; color: string };

function readingPathLayout(nodes: NetworkPaperNode[], edges: ResearchPaperEdge[]) {
  const ids = new Set(nodes.map((node) => node.paper.id));
  const nodeById = new Map(nodes.map((node) => [node.paper.id, node]));
  const indegree = new Map(Array.from(ids).map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!ids.has(edge.sourcePaperId) || !ids.has(edge.targetPaperId)) continue;
    outgoing.set(edge.sourcePaperId, [...(outgoing.get(edge.sourcePaperId) || []), edge.targetPaperId]);
    indegree.set(edge.targetPaperId, (indegree.get(edge.targetPaperId) || 0) + 1);
  }
  const roleRank: Record<ResearchTrackRole, number> = { foundation: 0, milestone: 1, frontier: 2 };
  const compare = (leftId: string, rightId: string) => {
    const left = nodeById.get(leftId)!;
    const right = nodeById.get(rightId)!;
    return roleRank[left.paper.role] - roleRank[right.paper.role]
      || Number(researchPaperYear(left.paper)) - Number(researchPaperYear(right.paper))
      || left.paper.position - right.paper.position;
  };
  const queue = Array.from(ids).filter((id) => !indegree.get(id)).sort(compare);
  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const targetId of outgoing.get(id) || []) {
      indegree.set(targetId, (indegree.get(targetId) || 1) - 1);
      if (!indegree.get(targetId)) {
        queue.push(targetId);
        queue.sort(compare);
      }
    }
  }
  for (const id of Array.from(ids).filter((id) => !ordered.includes(id)).sort(compare)) ordered.push(id);
  const depthById = new Map(ordered.map((id) => [id, 0]));
  for (const id of ordered) for (const targetId of outgoing.get(id) || []) {
    depthById.set(targetId, Math.max(depthById.get(targetId) || 0, (depthById.get(id) || 0) + 1));
  }
  return {
    stepById: new Map(ordered.map((id, index) => [id, index + 1])),
    depthById,
    maxDepth: Math.max(0, ...Array.from(depthById.values())),
  };
}

function clippedPaperNetworkPath(edge: ResearchPaperEdge, positions: Map<string, NetworkNodePosition>, hasArrow: boolean) {
  const storedSource = positions.get(edge.sourcePaperId);
  const storedTarget = positions.get(edge.targetPaperId);
  if (!storedSource || !storedTarget) return "";
  const source = edge.kind === "citation" ? storedTarget : storedSource;
  const target = edge.kind === "citation" ? storedSource : storedTarget;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const unitX = dx / distance;
  const unitY = dy / distance;
  const startPadding = source.radius + 4;
  const endPadding = target.radius + (hasArrow ? 6 : 4);
  const startX = source.x + unitX * startPadding;
  const startY = source.y + unitY * startPadding;
  const endX = target.x - unitX * endPadding;
  const endY = target.y - unitY * endPadding;
  const middle = (startX + endX) / 2;
  return `M ${startX} ${startY} C ${middle} ${startY}, ${middle} ${endY}, ${endX} ${endY}`;
}

function PaperNetworkGraph({
  map,
  mode,
  scope,
  multiOriginIntent,
  trackFilter,
  locale,
  selectedPaperId,
  hoveredPaperId,
  originPaperIds,
  externalNodes,
  externalSimilarityEdges,
  paperStates,
  onSelect,
  onHover,
}: {
  map: ResearchMapState;
  mode: PaperNetworkMode;
  scope: PaperNetworkScope;
  multiOriginIntent: MultiOriginIntent;
  trackFilter: string;
  locale: Locale;
  selectedPaperId: string | null;
  hoveredPaperId: string | null;
  originPaperIds: string[];
  externalNodes: NetworkPaperNode[];
  externalSimilarityEdges: ResearchNetworkSimilarityEdge[];
  paperStates: Record<string, MonitorPaper["userState"]>;
  onSelect: (paperId: string) => void;
  onHover: (paperId: string | null) => void;
}) {
  const layout = useMemo(() => {
    const internalNodes = buildNetworkPaperNodes(map);
    const mergedNodes = Array.from(new Map([...internalNodes, ...externalNodes].map((node) => [node.paper.canonicalId, node])).values());
    const filteredNodes = mergedNodes.filter((node) => trackFilter === "all" || node.trackIds.includes(trackFilter));
    const filteredIds = new Set(filteredNodes.map((node) => node.paper.id));
    const discoveredEdges = externalNetworkEdges(mergedNodes, externalNodes, externalSimilarityEdges);
    let edges = [...map.paperEdges, ...discoveredEdges].filter((edge) => filteredIds.has(edge.sourcePaperId) && filteredIds.has(edge.targetPaperId)
      && (mode === "citations" ? isDatabaseVerifiedCitationEdge(edge) : mode === "path" ? edge.kind === "path" : edge.kind === "similarity"));
    const activeNodeIds = new Set(selectPaperNetworkActiveNodeIds(
      filteredNodes.map((node) => ({
        id: node.paper.id,
        citationCount: node.paper.citationCount,
        external: mode === "similarity" && Boolean(node.external),
      })),
      edges,
      originPaperIds,
      selectedPaperId,
      PAPER_NETWORK_ACTIVE_NODE_LIMIT,
    ));
    let nodes = filteredNodes.filter((node) => activeNodeIds.has(node.paper.id));
    edges = edges.filter((edge) => activeNodeIds.has(edge.sourcePaperId) && activeNodeIds.has(edge.targetPaperId));
    if (mode === "path" || mode === "citations") {
      const connectedIds = new Set(edges.flatMap((edge) => [edge.sourcePaperId, edge.targetPaperId]));
      nodes = nodes.filter((node) => connectedIds.has(node.paper.id));
    }
    const completePathLayout = mode === "path" ? readingPathLayout(nodes, edges) : null;
    const availableIds = new Set(nodes.map((node) => node.paper.id));
    const visibleOriginIds = originPaperIds.filter((id) => availableIds.has(id)).slice(0, 3);
    const multiSeedActive = mode === "similarity" && scope === "multi-seed" && visibleOriginIds.length >= 2;
    const oneHopActive = scope === "one-hop" && Boolean(selectedPaperId && availableIds.has(selectedPaperId));
    if (oneHopActive && selectedPaperId) {
      edges = selectVerifiableOneHopEdges(edges, selectedPaperId);
      const hopIds = new Set([selectedPaperId, ...edges.flatMap((edge) => [edge.sourcePaperId, edge.targetPaperId])]);
      nodes = nodes.filter((node) => hopIds.has(node.paper.id));
    } else if (multiSeedActive) {
      if (multiOriginIntent === "union") edges = selectBalancedMultiSeedEdges(edges, visibleOriginIds);
      else {
        const independentEdges = edges.filter(isVerifiableSimilarityNeighborEdge);
        const connectionCount = new Map<string, number>();
        for (const node of nodes) {
          if (visibleOriginIds.includes(node.paper.id)) continue;
          connectionCount.set(node.paper.id, visibleOriginIds.filter((originId) => independentEdges.some((edge) => (edge.sourcePaperId === originId && edge.targetPaperId === node.paper.id) || (edge.targetPaperId === originId && edge.sourcePaperId === node.paper.id))).length);
        }
        const eligibleIds = new Set(nodes.filter((node) => visibleOriginIds.includes(node.paper.id)
          || (connectionCount.get(node.paper.id) || 0) >= 2).map((node) => node.paper.id));
        edges = independentEdges.filter((edge) => eligibleIds.has(edge.sourcePaperId) && eligibleIds.has(edge.targetPaperId));
      }
      const hopIds = new Set([...visibleOriginIds, ...edges.flatMap((edge) => [edge.sourcePaperId, edge.targetPaperId])]);
      nodes = nodes.filter((node) => hopIds.has(node.paper.id));
    }
    const visibleIds = new Set(nodes.map((node) => node.paper.id));
    edges = edges.filter((edge) => visibleIds.has(edge.sourcePaperId) && visibleIds.has(edge.targetPaperId));
    const activeTracks = map.tracks.filter((track) => nodes.some((node) => node.trackIds.includes(track.id)));
    const laneIndex = new Map(activeTracks.map((track, index) => [track.id, index]));
    const laneHeight = trackFilter === "all" ? (mode === "path" ? 132 : 112) : 320;
    const height = mode === "similarity" ? 610 : Math.max(500, activeTracks.length * laneHeight + 96);
    const width = 1120;
    const years = nodes.map((node) => Number(researchPaperYear(node.paper))).filter(Number.isFinite);
    const minYear = years.length ? Math.min(...years) : new Date().getFullYear() - 5;
    const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();
    const yearSpan = Math.max(1, maxYear - minYear);
    const pathLayout = completePathLayout || readingPathLayout(nodes, edges);
    const pathGroups = new Map<string, NetworkPaperNode[]>();
    for (const node of nodes) {
      const effectiveTrackId = trackFilter !== "all" && node.trackIds.includes(trackFilter) ? trackFilter : node.track.id;
      const key = `${effectiveTrackId}:${pathLayout.depthById.get(node.paper.id) || 0}`;
      pathGroups.set(key, [...(pathGroups.get(key) || []), node]);
    }
    const positions = new Map<string, NetworkNodePosition>();
    const oneHopNeighbors = nodes.filter((node) => node.paper.id !== selectedPaperId);
    nodes.forEach((node, index) => {
      const effectiveTrackId = trackFilter !== "all" && node.trackIds.includes(trackFilter) ? trackFilter : node.track.id;
      const lane = laneIndex.get(effectiveTrackId) || 0;
      const baseY = 76 + lane * laneHeight + laneHeight / 2;
      const year = Number(researchPaperYear(node.paper));
      let x = 95 + stableNetworkUnit(node.paper.id, 11) * 930;
      let y = 70 + stableNetworkUnit(node.paper.id, 29) * (height - 130);
      if (mode === "similarity" && scope === "one-hop" && selectedPaperId) {
        if (node.paper.id === selectedPaperId) {
          x = width / 2;
          y = height / 2;
        } else {
          const neighborIndex = Math.max(0, oneHopNeighbors.findIndex((item) => item.paper.id === node.paper.id));
          const ring = Math.floor(neighborIndex / 10);
          const ringSize = Math.min(10, oneHopNeighbors.length - ring * 10);
          const angle = -Math.PI / 2 + (neighborIndex % 10) / Math.max(1, ringSize) * Math.PI * 2;
          const radius = 178 + ring * 92;
          x = width / 2 + Math.cos(angle) * radius;
          y = height / 2 + Math.sin(angle) * radius;
        }
      } else if (mode === "citations") {
        x = 150 + ((Number.isFinite(year) ? year : maxYear) - minYear) / yearSpan * 820;
        y = baseY + ((index % 5) - 2) * 15;
      } else if (mode === "path") {
        const depth = pathLayout.depthById.get(node.paper.id) || 0;
        x = pathLayout.maxDepth ? 150 + depth / pathLayout.maxDepth * 820 : width / 2;
        const group = pathGroups.get(`${effectiveTrackId}:${depth}`) || [node];
        const groupIndex = Math.max(0, group.findIndex((item) => item.paper.id === node.paper.id));
        y = baseY + (groupIndex - (group.length - 1) / 2) * 32;
      }
      const radius = mode === "path" ? 15 : 8 + Math.min(7, Math.log10(Math.max(1, node.paper.citationCount + 1)) * 2.4);
      const trackPosition = Math.max(0, map.tracks.findIndex((track) => track.id === effectiveTrackId));
      const yearColorIndex = Math.max(0, Math.min(paperNetworkYearPalette.length - 1, Math.round(((Number.isFinite(year) ? year : minYear) - minYear) / yearSpan * (paperNetworkYearPalette.length - 1))));
      positions.set(node.paper.id, { x, y, radius, trackId: effectiveTrackId, color: mode === "similarity" ? paperNetworkYearPalette[yearColorIndex] : paperNetworkPalette[trackPosition % paperNetworkPalette.length] });
    });
    if (mode === "similarity" && !oneHopActive) relaxSimilarityPositions(nodes, edges, positions, visibleOriginIds, width, height);
    const seedConnections = new Map<string, Set<string>>();
    if (multiSeedActive) {
      for (const edge of edges.filter(isVerifiableSimilarityNeighborEdge)) {
        for (const originId of visibleOriginIds) {
          if (edge.sourcePaperId === originId && edge.targetPaperId !== originId) seedConnections.set(edge.targetPaperId, new Set([...(seedConnections.get(edge.targetPaperId) || []), originId]));
          if (edge.targetPaperId === originId && edge.sourcePaperId !== originId) seedConnections.set(edge.sourcePaperId, new Set([...(seedConnections.get(edge.sourcePaperId) || []), originId]));
        }
      }
    }
    const seedConnectionCount = new Map(Array.from(seedConnections.entries()).map(([id, origins]) => [id, origins.size]));
    const labelIds = new Set<string>();
    if (mode === "path" || scope === "one-hop") nodes.forEach((node) => labelIds.add(node.paper.id));
    else if (multiSeedActive) {
      visibleOriginIds.forEach((id) => labelIds.add(id));
      for (const [id, count] of seedConnectionCount) if (count >= 2) labelIds.add(id);
      for (const originId of visibleOriginIds) {
        edges.filter((edge) => edge.sourcePaperId === originId || edge.targetPaperId === originId).slice(0, 2)
          .forEach((edge) => labelIds.add(edge.sourcePaperId === originId ? edge.targetPaperId : edge.sourcePaperId));
      }
    }
    else for (const track of activeTracks) for (const role of ["foundation", "milestone", "frontier"] as ResearchTrackRole[]) {
      const candidate = nodes.filter((node) => node.trackIds.includes(track.id) && node.paper.role === role)
        .sort((left, right) => right.paper.citationCount - left.paper.citationCount)[0];
      if (candidate) labelIds.add(candidate.paper.id);
    }
    const yearTicks = Array.from(new Set(Array.from({ length: 5 }, (_, index) => Math.round(minYear + yearSpan * index / 4))));
    return { nodes, edges, positions, activeTracks, height, width, minYear, maxYear, yearTicks, pathLayout, labelIds, laneHeight, multiSeedActive, seedConnectionCount };
  }, [externalNodes, externalSimilarityEdges, map, mode, multiOriginIntent, scope, trackFilter, originPaperIds, selectedPaperId]);

  const originSet = new Set(originPaperIds);
  const interactionPaperId = hoveredPaperId || selectedPaperId;
  const focusedPaperIds = interactionPaperId ? new Set([interactionPaperId]) : layout.multiSeedActive ? originSet : new Set<string>();
  const connectedToSelection = new Set<string>(focusedPaperIds);
  for (const focusPaperId of focusedPaperIds) {
    for (const edge of layout.edges) {
      if (edge.sourcePaperId === focusPaperId) connectedToSelection.add(edge.targetPaperId);
      if (edge.targetPaperId === focusPaperId) connectedToSelection.add(edge.sourcePaperId);
    }
  }
  const nodeById = new Map(layout.nodes.map((node) => [node.paper.id, node]));
  const emptyMessage = mode === "path"
    ? (locale === "zh" ? "Pi 暂未形成有充分依据的阅读路径。可先浏览引用关系，或重试 Pi 分析。" : "Pi has not formed a defensible reading path yet. Explore citations or retry Pi analysis.")
    : mode === "citations"
      ? (locale === "zh" ? "当前论文库中还没有数据库确认的互引关系。" : "No database-verified citation links are available in this library yet.")
      : (locale === "zh" ? "这个方向还没有足够的真实论文节点。" : "This direction does not yet have enough real paper nodes.");

  return (
    <div className={`v2-paper-network-canvas ${mode}`} aria-label={locale === "zh" ? "论文关系网络" : "Paper relationship network"}>
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img">
        <title>{mode === "citations" ? (locale === "zh" ? "知识引用流" : "Knowledge citation flow") : mode === "path" ? (locale === "zh" ? "建议阅读路径" : "Suggested reading path") : (locale === "zh" ? "论文相似性地图" : "Paper similarity map")}</title>
        <desc>{mode === "citations" ? (locale === "zh" ? "箭头从被引工作指向后续引用它的工作。" : "Arrows run from cited work to later work that cites it.") : mode === "path" ? (locale === "zh" ? "编号表示建议阅读顺序。" : "Numbers show the suggested reading order.") : (locale === "zh" ? "选择论文只会联动列表和详情；可核验一跳只显示文献耦合或数据库核验的引用发现关系。" : "Selecting a paper only links the graph, list, and details; verified one-hop shows only bibliographic coupling or provider-verified citation discovery.")}</desc>
        <defs>
          <marker id="v2-paper-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 1 L 9 5 L 0 9 z" /></marker>
          <marker id="v2-path-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 1 L 9 5 L 0 9 z" /></marker>
        </defs>
        {mode !== "similarity" && layout.activeTracks.map((track, index) => {
          const y = 76 + index * layout.laneHeight;
          return <g className="v2-paper-network-lane" key={track.id}><rect x="18" y={y} width="1084" height={layout.laneHeight - 8} rx="12" /><text x="35" y={y + 24}>{locale === "zh" ? track.titleZh : track.titleEn}</text></g>;
        })}
        {mode === "path" ? <g className="v2-paper-network-columns path-columns">
          <text x="150" y="39">{locale === "zh" ? "01 起点" : "01 Start"}</text><text x="560" y="39" textAnchor="middle">{locale === "zh" ? "核心推进" : "Core progression"}</text><text x="970" y="39" textAnchor="end">{locale === "zh" ? "延伸前沿 →" : "Frontier →"}</text>
        </g> : mode === "citations" ? <g className="v2-paper-network-columns citation-columns">
          {layout.yearTicks.map((year) => { const x = 150 + (year - layout.minYear) / Math.max(1, layout.maxYear - layout.minYear) * 820; return <g key={year}><line x1={x} x2={x} y1="51" y2={layout.height - 24} /><text x={x} y="39" textAnchor="middle">{year}</text></g>; })}
        </g> : null}
        <g className="v2-paper-network-edges">
          {layout.edges.map((edge, index) => {
            const hasArrow = edge.kind === "path" || (edge.kind === "citation" && mode === "citations");
            const path = clippedPaperNetworkPath(edge, layout.positions, hasArrow);
            if (!path) return null;
            const selectedEdge = Array.from(focusedPaperIds).some((id) => id === edge.sourcePaperId || id === edge.targetPaperId);
            const key = paperNetworkEdgeKey(edge);
            const sourceTitle = nodeById.get(edge.sourcePaperId)?.paper.title || "";
            const targetTitle = nodeById.get(edge.targetPaperId)?.paper.title || "";
            const title = edge.kind === "citation"
              ? (locale === "zh" ? `知识流：${targetTitle} → ${sourceTitle}` : `Knowledge flow: ${targetTitle} → ${sourceTitle}`)
              : `${networkRelationLabel(edge, locale)} · ${locale === "zh" ? edge.relationshipZh : edge.relationshipEn}`;
            const discoveryGuide = edge.kind === "similarity" && ["verified_discovery", "recommendation_discovery"].includes(edge.relationKind);
            const className = `${edge.kind} ${discoveryGuide ? "discovery-fallback" : ""} ${focusedPaperIds.size ? selectedEdge ? "focused" : "muted" : ""}`;
            const delay = `${Math.min(index, 24) * 75}ms`;
            const similarityStrokeWidth = edge.kind === "similarity" ? discoveryGuide ? 1.25 : 1 + Math.max(0, Math.min(100, edge.confidence)) / 100 * 1.8 : undefined;
            return <g key={key} className="v2-paper-network-edge-group">
              {(edge.kind === "citation" || edge.kind === "path") && <path className={`edge-halo ${className}`} d={path} style={{ animationDelay: delay }} />}
              <path className={`edge-line revealing ${className}`} d={path} style={{ animationDelay: delay, strokeWidth: similarityStrokeWidth }} markerEnd={edge.kind === "path" ? "url(#v2-path-arrow)" : edge.kind === "citation" && mode === "citations" ? "url(#v2-paper-arrow)" : undefined}><title>{title}</title></path>
            </g>;
          })}
        </g>
        <g className="v2-paper-network-nodes">
          {layout.nodes.map((node) => {
            const position = layout.positions.get(node.paper.id);
            if (!position) return null;
            const selected = selectedPaperId === node.paper.id;
            const hovered = hoveredPaperId === node.paper.id;
            const state = paperStates[node.paper.canonicalId];
            const stateLabel = paperNetworkStateLabel(state, locale);
            const origin = originSet.has(node.paper.id);
            const muted = Boolean(scope === "all" && selectedPaperId && !connectedToSelection.has(node.paper.id));
            const sharedBridge = layout.multiSeedActive && !origin && (layout.seedConnectionCount.get(node.paper.id) || 0) >= 2;
            const showLabel = selected || origin || layout.labelIds.has(node.paper.id);
            const label = node.paper.title.length > 30 ? node.paper.title.slice(0, 29) + "…" : node.paper.title;
            const step = mode === "path" ? layout.pathLayout.stepById.get(node.paper.id) : undefined;
            const sharedCount = layout.seedConnectionCount.get(node.paper.id) || 0;
            return <g key={node.paper.id} className={`v2-paper-network-node ${mode === "path" ? "path-step" : ""} ${node.external ? "external-ghost" : ""} ${selected ? "selected" : ""} ${hovered ? "hovered" : ""} ${origin ? "origin" : ""} ${sharedBridge ? "shared-bridge" : ""} ${muted ? "muted" : ""} ${state || ""}`} transform={`translate(${position.x} ${position.y})`} role="button" tabIndex={0} aria-pressed={selected} aria-label={`${step ? `${locale === "zh" ? "第" : "Step "}${step}${locale === "zh" ? "步，" : ", "}` : ""}${node.paper.title}${origin ? (locale === "zh" ? "，起始论文" : ", origin paper") : ""}${selected ? (locale === "zh" ? "，已选中" : ", selected") : ""}${stateLabel ? `，${stateLabel}` : ""}${sharedBridge ? (locale === "zh" ? `，连接 ${sharedCount} 个种子` : `, shared by ${sharedCount} origins`) : ""}`} onPointerEnter={() => onHover(node.paper.id)} onPointerLeave={() => onHover(null)} onFocus={() => onHover(node.paper.id)} onBlur={() => onHover(null)} onClick={() => onSelect(node.paper.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.paper.id); } }}>
              {selected && <circle className="selection-ring" r={position.radius + 15}><title>{locale === "zh" ? "当前聚焦论文" : "Currently focused paper"}</title></circle>}
              {sharedBridge && <circle className="shared-ring" r={position.radius + 10}><title>{locale === "zh" ? `连接 ${sharedCount} 个种子的共同邻居` : `Neighbor shared by ${sharedCount} origins`}</title></circle>}
              <circle className="state-ring" r={position.radius + 5} />
              <circle className="paper-dot" r={position.radius} style={{ fill: position.color }} />
              {(state === "seen" || state === "snoozed") && <circle className="reading-state-marker" cx={position.radius * .72} cy={-position.radius * .72} r="3.2" aria-hidden="true" />}
              {mode === "path" ? <text className="path-step-number" textAnchor="middle" y="3.5">{step}</text> : <circle className="paper-core" r="3" />}
              {showLabel && <text className="v2-paper-node-label" y={-(position.radius + 9)} textAnchor="middle">{label}</text>}
              <title>{node.paper.title} · {researchPaperYear(node.paper)} · {node.paper.citationCount} {locale === "zh" ? "次引用" : "citations"}{stateLabel ? ` · ${stateLabel}` : ""}</title>
            </g>;
          })}
        </g>
      </svg>
      {!layout.nodes.length && <div className="v2-paper-network-empty">{emptyMessage}</div>}
    </div>
  );
}

function CitationFlowWorkbench({
  map,
  trackFilter,
  locale,
  selectedPaperId,
  onSelect,
  onExpandFocus,
  onOpenFocus,
  onAskFocus,
  expanding,
}: {
  map: ResearchMapState;
  trackFilter: string;
  locale: Locale;
  selectedPaperId: string | null;
  onSelect: (paperId: string) => void;
  onExpandFocus: (node: NetworkPaperNode) => void;
  onOpenFocus: (node: NetworkPaperNode) => void;
  onAskFocus: (node: NetworkPaperNode) => void;
  expanding: boolean;
}) {
  const model = useMemo(() => {
    const nodes = buildNetworkPaperNodes(map).filter((node) => trackFilter === "all" || node.trackIds.includes(trackFilter));
    const nodeById = new Map(nodes.map((node) => [node.paper.id, node]));
    const edges = map.paperEdges.filter((edge) => isDatabaseVerifiedCitationEdge(edge)
      && nodeById.has(edge.sourcePaperId) && nodeById.has(edge.targetPaperId));
    const connectedIds = new Set(edges.flatMap((edge) => [edge.sourcePaperId, edge.targetPaperId]));
    const connectedNodes = nodes.filter((node) => connectedIds.has(node.paper.id));
    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.sourcePaperId, (degree.get(edge.sourcePaperId) || 0) + 1);
      degree.set(edge.targetPaperId, (degree.get(edge.targetPaperId) || 0) + 1);
    }
    const focus = selectedPaperId && connectedIds.has(selectedPaperId)
      ? nodeById.get(selectedPaperId) || null
      : [...connectedNodes].sort((left, right) => (degree.get(right.paper.id) || 0) - (degree.get(left.paper.id) || 0)
        || right.paper.citationCount - left.paper.citationCount)[0] || null;
    const rankRelations = (relations: ResearchPaperEdge[], otherId: (edge: ResearchPaperEdge) => string) => relations
      .map((edge) => ({ edge, node: nodeById.get(otherId(edge)) }))
      .filter((item): item is { edge: ResearchPaperEdge; node: NetworkPaperNode } => Boolean(item.node))
      .sort((left, right) => Number(researchPaperYear(left.node.paper)) - Number(researchPaperYear(right.node.paper))
        || right.node.paper.citationCount - left.node.paper.citationCount);
    const priorAll = focus ? rankRelations(edges.filter((edge) => edge.sourcePaperId === focus.paper.id), (edge) => edge.targetPaperId) : [];
    const laterAll = focus ? rankRelations(edges.filter((edge) => edge.targetPaperId === focus.paper.id), (edge) => edge.sourcePaperId) : [];
    const years = connectedNodes.map((node) => Number(researchPaperYear(node.paper))).filter(Number.isFinite);
    const ledger = [...edges].sort((left, right) => {
      const leftLater = nodeById.get(left.sourcePaperId);
      const rightLater = nodeById.get(right.sourcePaperId);
      return (leftLater ? Number(researchPaperYear(leftLater.paper)) : 0) - (rightLater ? Number(researchPaperYear(rightLater.paper)) : 0);
    });
    const providerCounts = new Map<string, number>();
    for (const edge of edges) {
      const provider = citationEvidenceProviderLabel(edge.evidenceSource);
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
    }
    return {
      focus,
      prior: priorAll.slice(0, 8),
      later: laterAll.slice(0, 8),
      priorAll,
      laterAll,
      ledger,
      nodeById,
      connectedNodes,
      providers: Array.from(providerCounts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
      yearStart: years.length ? Math.min(...years) : null,
      yearEnd: years.length ? Math.max(...years) : null,
    };
  }, [map, selectedPaperId, trackFilter]);

  useEffect(() => {
    if (model.focus && selectedPaperId !== model.focus.paper.id) onSelect(model.focus.paper.id);
  }, [model.focus, onSelect, selectedPaperId]);

  if (!model.focus) return <div className="v2-specialized-network-empty citation"><span>↗</span><div><strong>{locale === "zh" ? "当前范围还没有可核验的引用链" : "No verified citation chain in this scope"}</strong><p>{locale === "zh" ? "先核验已有论文关系。没有数据库证据时，Pi 不会用推断连线代替真实引用。" : "Verify saved paper links first. Pi will not replace missing database evidence with inferred citations."}</p></div></div>;

  const relationCard = (item: { edge: ResearchPaperEdge; node: NetworkPaperNode }, side: "prior" | "later") => <button
    type="button"
    className="v2-citation-paper-card"
    key={item.edge.id}
    onClick={() => onSelect(item.node.paper.id)}
  >
    <small>{side === "prior" ? (locale === "zh" ? "本论文引用" : "Cited by focus") : (locale === "zh" ? "后续引用本论文" : "Cites the focus")}</small>
    <strong>{item.node.paper.title}</strong>
    <span className="authors">{item.node.paper.authors || (locale === "zh" ? "作者信息未提供" : "Authors unavailable")}</span>
    <span>{[researchPaperYear(item.node.paper), item.node.paper.venue, `${item.node.paper.citationCount} ${locale === "zh" ? "次被引" : "citations"}`].filter(Boolean).join(" · ")}</span>
    <em>{locale === "zh" ? `直接引用 · ${citationEvidenceProviderLabel(item.edge.evidenceSource)} 核验` : `Direct citation · verified by ${citationEvidenceProviderLabel(item.edge.evidenceSource)}`}</em>
  </button>;

  return <section className="v2-citation-workbench" aria-label={locale === "zh" ? "知识引用流工作台" : "Citation flow workbench"}>
    <header className="v2-specialized-network-head"><div><p>{locale === "zh" ? "数据库核验的知识传递" : "DATABASE-VERIFIED KNOWLEDGE TRANSFER"}</p><h3>{locale === "zh" ? "看清一篇论文从哪里来，又影响了谁" : "See where a paper came from and what it influenced"}</h3><span>{locale === "zh" ? "选择任意节点作为焦点；这里只展示当前论文库内已确认的直接引用。" : "Choose any node as the focus. Only direct citations verified inside the current library are shown."}</span></div><dl><div><dt>{locale === "zh" ? "真实引用" : "Verified links"}</dt><dd>{model.ledger.length}</dd></div><div><dt>{locale === "zh" ? "链上论文" : "Papers in flow"}</dt><dd>{model.connectedNodes.length}</dd></div><div><dt>{locale === "zh" ? "时间跨度" : "Coverage"}</dt><dd>{model.yearStart && model.yearEnd ? `${model.yearStart}–${model.yearEnd}` : "—"}</dd></div><div><dt>{locale === "zh" ? "核验来源" : "Providers"}</dt><dd>{model.providers.length}</dd></div></dl></header>
    <div className="v2-citation-source-summary"><strong>{locale === "zh" ? "只包含数据库确认的直接引用" : "Direct citations confirmed by scholarly databases only"}</strong><span>{model.providers.map(([provider, count]) => `${provider} · ${count}`).join("  /  ")}</span></div>
    <div className="v2-citation-lineage-grid">
      <section className="prior"><header><span>01</span><div><h4>{locale === "zh" ? "前置知识" : "Prior knowledge"}</h4><small>{locale === "zh" ? "焦点论文直接引用的工作" : "Work directly cited by the focus"}</small></div><b>{model.priorAll.length > model.prior.length ? `${model.prior.length}/${model.priorAll.length}` : model.priorAll.length}</b></header><div>{model.prior.length ? <>{model.prior.map((item) => relationCard(item, "prior"))}{model.priorAll.length > model.prior.length && <details className="v2-citation-more"><summary>{locale === "zh" ? `展开其余 ${model.priorAll.length - model.prior.length} 篇` : `Show ${model.priorAll.length - model.prior.length} more`}</summary><div>{model.priorAll.slice(model.prior.length).map((item) => relationCard(item, "prior"))}</div></details>}</> : <p className="v2-citation-gap">{locale === "zh" ? "当前库内尚未核验到它的前置引用。" : "No prior citation has been verified in the current library."}</p>}</div></section>
      <article className="v2-citation-focus-card"><span>{locale === "zh" ? "当前焦点" : "CURRENT FOCUS"}</span><em>{researchRoleLabel(model.focus.paper.role, locale)} · {researchPaperYear(model.focus.paper)}</em><h4>{model.focus.paper.title}</h4><div className="v2-citation-focus-meta"><span>{model.focus.paper.authors || (locale === "zh" ? "作者信息未提供" : "Authors unavailable")}</span><small>{model.focus.paper.venue || (locale === "zh" ? "来源待核对" : "Venue unavailable")}</small></div><p>{locale === "zh" ? model.focus.paper.rationaleZh : model.focus.paper.rationaleEn}</p><dl><div><dt>{locale === "zh" ? "向前承接" : "Prior"}</dt><dd>{model.priorAll.length}</dd></div><div><dt>{locale === "zh" ? "向后影响" : "Later"}</dt><dd>{model.laterAll.length}</dd></div><div><dt>{locale === "zh" ? "总被引" : "Citations"}</dt><dd>{model.focus.paper.citationCount}</dd></div></dl><div className="v2-citation-focus-actions"><a href={model.focus.paper.url || (model.focus.paper.doi ? `https://doi.org/${model.focus.paper.doi}` : "#")} target="_blank" rel="noreferrer" onClick={() => onOpenFocus(model.focus!)}>{locale === "zh" ? "打开原文" : "Open original"} ↗</a><button type="button" onClick={() => onAskFocus(model.focus!)}>{locale === "zh" ? "让 Pi 解释" : "Ask Pi"}</button></div><button type="button" disabled={expanding} onClick={() => onExpandFocus(model.focus!)}>{expanding ? (locale === "zh" ? "正在寻找前后论文…" : "Discovering nearby papers…") : (locale === "zh" ? "到论文发现扩展前后 1-hop" : "Expand 1-hop in paper discovery")} →</button><small>{locale === "zh" ? "扩展候选会进入共享质量评估；只有评审通过才可能出现在今日，只有你收录确认后才进入正式路线与引用流。" : "Expanded candidates enter the shared quality review. Only papers that pass can reach Today, and only your explicit addition confirms formal route and citation-flow evidence."}</small></article>
      <section className="later"><header><span>03</span><div><h4>{locale === "zh" ? "后续发展" : "Later development"}</h4><small>{locale === "zh" ? "直接引用焦点论文的工作" : "Work that directly cites the focus"}</small></div><b>{model.laterAll.length > model.later.length ? `${model.later.length}/${model.laterAll.length}` : model.laterAll.length}</b></header><div>{model.later.length ? <>{model.later.map((item) => relationCard(item, "later"))}{model.laterAll.length > model.later.length && <details className="v2-citation-more"><summary>{locale === "zh" ? `展开其余 ${model.laterAll.length - model.later.length} 篇` : `Show ${model.laterAll.length - model.later.length} more`}</summary><div>{model.laterAll.slice(model.later.length).map((item) => relationCard(item, "later"))}</div></details>}</> : <p className="v2-citation-gap">{locale === "zh" ? "当前库内尚未核验到后续引用。" : "No later citation has been verified in the current library."}</p>}</div></section>
    </div>
    <section className="v2-citation-ledger"><header><div><strong>{locale === "zh" ? "完整已核验引用清单" : "Complete verified citation ledger"}</strong><small>{locale === "zh" ? "箭头始终表示知识流向：被引工作 → 后续论文" : "Arrows always show knowledge flow: cited work → later paper"}</small></div><span>{model.ledger.length}</span></header><div>{model.ledger.map((edge) => { const prior = model.nodeById.get(edge.targetPaperId); const later = model.nodeById.get(edge.sourcePaperId); if (!prior || !later) return null; return <article key={edge.id}><button type="button" onClick={() => onSelect(prior.paper.id)}><small>{researchPaperYear(prior.paper)}</small><strong>{prior.paper.title}</strong></button><span aria-label={locale === "zh" ? "知识流向" : "knowledge flows to"}>→<small>{citationEvidenceProviderLabel(edge.evidenceSource)}</small></span><button type="button" onClick={() => onSelect(later.paper.id)}><small>{researchPaperYear(later.paper)}</small><strong>{later.paper.title}</strong></button></article>; })}</div></section>
  </section>;
}

function ReadingOrderWorkbench({
  map,
  trackFilter,
  locale,
  selectedPaperId,
  learningState,
  learningLoading,
  learningError,
  learningAction,
  onSelect,
  onToggleStep,
  onGenerate,
  onRetry,
}: {
  map: ResearchMapState;
  trackFilter: string;
  locale: Locale;
  selectedPaperId: string | null;
  learningState: LearningPathState;
  learningLoading: boolean;
  learningError: string;
  learningAction: string | null;
  onSelect: (paperId: string) => void;
  onToggleStep: (step: LearningPathStep) => void;
  onGenerate: (track: ResearchTrack | null) => void;
  onRetry: () => void;
}) {
  const allNodes = useMemo(() => buildNetworkPaperNodes(map), [map]);
  const nodes = useMemo(() => allNodes.filter((node) => trackFilter === "all" || node.trackIds.includes(trackFilter)), [allNodes, trackFilter]);
  const nodeByTrackPaperId = useMemo(() => new Map(allNodes.map((node) => [`track:${node.paper.id}`, node])), [allNodes]);
  const nodeByCanonicalId = useMemo(() => new Map(allNodes.map((node) => [node.paper.canonicalId.trim().toLocaleLowerCase(), node])), [allNodes]);
  const nodeByTitleKey = useMemo(() => {
    const unique = new Map<string, NetworkPaperNode | null>();
    for (const node of allNodes) {
      const key = learningResourceTitleKey(node.paper.title);
      if (!key) continue;
      unique.set(key, unique.has(key) ? null : node);
    }
    return new Map(Array.from(unique).filter((entry): entry is [string, NetworkPaperNode] => Boolean(entry[1])));
  }, [allNodes]);
  const selectedTrack = trackFilter === "all" ? null : map.tracks.find((track) => track.id === trackFilter) || null;
  const path = learningState.path;
  const pathTrack = path?.targetTrackId ? map.tracks.find((track) => track.id === path.targetTrackId) || null : null;
  const pathDirectionMismatch = Boolean(path && selectedTrack && path.targetTrackId !== selectedTrack.id);

  if (learningLoading && !path) return <div className="v2-specialized-network-empty path loading"><span>π</span><div><strong>{locale === "zh" ? "正在载入已保存的学习路径" : "Loading the saved learning path"}</strong><p>{locale === "zh" ? "路线论文仍然可浏览，进度载入不会重建路径。" : "Route papers remain available; loading progress will not rebuild the path."}</p></div></div>;

  if (learningError && !path) return <div className="v2-specialized-network-empty path error" role="alert"><span>!</span><div><strong>{locale === "zh" ? "学习路径暂时无法载入" : "The learning path could not be loaded"}</strong><p>{learningError}</p><button type="button" onClick={onRetry}>{locale === "zh" ? "重新载入" : "Retry"}</button></div></div>;

  if (!path) {
    const roleGroups = (["foundation", "milestone", "frontier"] as ResearchTrackRole[]).map((role) => ({ role, nodes: nodes.filter((node) => node.paper.role === role) }));
    return <section className="v2-reading-order-workbench fallback" aria-label={locale === "zh" ? "尚未生成个性化阅读顺序" : "Personalized reading order not generated"}>
      <header className="v2-specialized-network-head"><div><p>{locale === "zh" ? "真实论文的阶段整理" : "STAGE-BASED ORGANIZATION OF REAL PAPERS"}</p><h3>{locale === "zh" ? "尚未形成个性化阅读顺序" : "No personalized reading order yet"}</h3><span>{locale === "zh" ? "下面只按路线角色整理真实论文，不表示严格先后，也不会把 Pi 图谱边冒充可执行计划。" : "The papers below are grouped by route role only. This is not a strict order, and graph hints are not presented as an executable plan."}</span></div><dl><div><dt>{locale === "zh" ? "可用论文" : "Available"}</dt><dd>{nodes.length}</dd></div><div><dt>{locale === "zh" ? "建议阶段" : "Suggested stages"}</dt><dd>{roleGroups.filter((group) => group.nodes.length).length}</dd></div><div><dt>{locale === "zh" ? "状态" : "Status"}</dt><dd>—</dd></div></dl></header>
      <div className="v2-reading-fallback-groups">{roleGroups.map((group) => <section key={group.role}><header><strong>{researchRoleLabel(group.role, locale)}</strong><small>{group.role === "foundation" ? (locale === "zh" ? "定义问题与基础工具" : "Problems and foundational tools") : group.role === "milestone" ? (locale === "zh" ? "理解关键转折与方法" : "Key turns and methods") : (locale === "zh" ? "接近当前问题与前沿" : "Current problems and frontier")}</small><b>{group.nodes.length}</b></header><div>{group.nodes.slice(0, 6).map((node) => <button type="button" className={selectedPaperId === node.paper.id ? "selected" : ""} key={node.paper.id} onClick={() => onSelect(node.paper.id)}><small>{researchPaperYear(node.paper)} · {node.paper.venue}</small><strong>{node.paper.title}</strong><span>{locale === "zh" ? node.paper.rationaleZh : node.paper.rationaleEn}</span></button>)}{!group.nodes.length && <p>{locale === "zh" ? "这一阶段还缺少真实代表作。" : "This stage still lacks a real representative work."}</p>}</div></section>)}</div>
      <footer className="v2-reading-order-create"><div><strong>{selectedTrack ? (locale === "zh" ? "生成可推进的五阶段路径" : "Build a five-stage path") : (locale === "zh" ? "先在上方选择一个研究方向" : "Choose one research direction above")}</strong><p>{locale === "zh" ? "缺少经典文献时会自动补证；候选通过共享质量评估后才成为正式材料。" : "Missing classics trigger evidence search; candidates become formal materials only after shared quality review."}</p></div><button type="button" disabled={Boolean(learningAction) || !selectedTrack} onClick={() => onGenerate(selectedTrack)}>{learningAction ? (locale === "zh" ? "Pi 正在规划…" : "Pi is planning…") : (locale === "zh" ? "生成学习路径" : "Build learning path")}</button></footer>
    </section>;
  }

  const completedPercent = Math.round(path.completedSteps / Math.max(1, path.steps.length) * 100);
  const activeStep = path.steps.find((step) => step.status === "active") || path.steps.find((step) => step.status !== "completed") || null;
  const renderResource = (resource: LearningResource) => {
    const canonicalKey = resource.canonicalId?.trim().toLocaleLowerCase();
    const node = (canonicalKey ? nodeByCanonicalId.get(canonicalKey) : undefined) || nodeByTrackPaperId.get(resource.id) || nodeByTitleKey.get(learningResourceTitleKey(resource.title));
    const href = learningResourceHref(resource);
    const content = <><small>{node ? researchPaperYear(node.paper) : resource.publishedAt?.slice(0, 4) || "—"} · {resource.venue}</small><strong>{resource.title}</strong><em className="v2-learning-resource-signals">{learningResourceSignals(resource, locale).map((signal) => <i key={signal}>{signal}</i>)}</em></>;
    return node ? <button type="button" className={selectedPaperId === node.paper.id ? "selected" : ""} key={resource.id} onClick={() => onSelect(node.paper.id)}>{content}</button> : href ? <a href={href} target="_blank" rel="noreferrer" key={resource.id}>{content}</a> : <div className="unavailable" key={resource.id}>{content}</div>;
  };
  return <section className="v2-reading-order-workbench compact" aria-label={locale === "zh" ? "建议阅读顺序工作台" : "Suggested reading order workbench"}>
    {learningError && <div className="v2-reading-order-warning" role="status"><span>!</span><p>{locale === "zh" ? "上次更新没有完成；已保存路径仍保留。" : "The last update did not finish; the saved path remains."} {learningError}</p><button type="button" onClick={onRetry}>{locale === "zh" ? "重试" : "Retry"}</button></div>}
    {pathDirectionMismatch && <div className="v2-reading-order-warning direction" role="status"><span>↔</span><p>{locale === "zh" ? `当前路径属于“${pathTrack?.titleZh || path.target}”。` : `This path belongs to “${pathTrack?.titleEn || path.target}”.`}</p><button type="button" disabled={Boolean(learningAction)} onClick={() => onGenerate(selectedTrack)}>{locale === "zh" ? "按当前方向规划" : "Plan this direction"}</button></div>}
    <header className="v2-specialized-network-head"><div><p>{locale === "zh" ? `学习路径 · 第 ${path.revision} 版` : `LEARNING PATH · REVISION ${path.revision}`}</p><h3>{locale === "zh" ? path.titleZh : path.titleEn}</h3><span>{locale === "zh" ? `当前目标：${path.target}` : `Target: ${path.target}`}</span></div><dl><div><dt>{locale === "zh" ? "进度" : "Progress"}</dt><dd>{path.completedSteps}/{path.steps.length}</dd></div><div><dt>{locale === "zh" ? "已通过材料" : "Approved papers"}</dt><dd>{path.steps.reduce((sum, step) => sum + step.resources.length, 0)}</dd></div><div><dt>{locale === "zh" ? "待评估" : "In review"}</dt><dd>{learningState.waitingQualityCount}</dd></div></dl></header>
    <div className="v2-reading-progress"><div><strong>{activeStep ? (locale === "zh" ? `现在：${activeStep.titleZh}` : `Now: ${activeStep.titleEn}`) : (locale === "zh" ? "路径已完成" : "Path completed")}</strong><span>{activeStep ? learningEvidenceLabel(activeStep, locale) : (locale === "zh" ? "可以据此收敛研究问题" : "Ready to refine the research question")}</span></div><i><b style={{ width: `${completedPercent}%` }} /></i><button type="button" disabled={Boolean(learningAction)} onClick={() => onGenerate(selectedTrack)}>{locale === "zh" ? "根据新证据更新" : "Update from new evidence"}</button></div>
    {activeStep && <section className={`v2-learning-now ${activeStep.evidenceStatus}`}><header><span>{learningKindLabel(activeStep.kind, locale)}</span><b>{learningEvidenceLabel(activeStep, locale)}</b></header><h4>{locale === "zh" ? activeStep.goalZh : activeStep.goalEn}</h4>{activeStep.resources.length ? <div className="v2-learning-stage-resources">{activeStep.resources.map(renderResource)}</div> : <div className="v2-learning-evidence-gap"><strong>{locale === "zh" ? "还没有可作为正式材料的论文" : "No paper is ready as formal material"}</strong><p>{locale === "zh" ? "Pi 已按这个缺口补证；候选先经过共享质量评估，不会为了填满路径而降低门槛。" : "Pi is searching this gap. Candidates pass through the shared quality review; the bar is not lowered to fill the path."}</p></div>}<div className="v2-learning-now-guidance"><article><small>{locale === "zh" ? "为什么" : "WHY"}</small><p>{locale === "zh" ? activeStep.whyZh : activeStep.whyEn}</p></article><article><small>{locale === "zh" ? "读什么" : "READ"}</small><p>{locale === "zh" ? activeStep.readFocusZh : activeStep.readFocusEn}</p></article><article><small>{locale === "zh" ? "如何决定" : "DECIDE"}</small><p>{locale === "zh" ? activeStep.checkpointZh : activeStep.checkpointEn}</p></article></div><footer><span>{learningTime(activeStep.estimatedMinutes, locale)}</span><button type="button" disabled={Boolean(learningAction) || (!activeStep.resources.length && activeStep.status !== "completed")} onClick={() => onToggleStep(activeStep)}>{learningAction === activeStep.id ? "…" : activeStep.status === "completed" ? (locale === "zh" ? "恢复" : "Restore") : (locale === "zh" ? "完成本阶段" : "Complete stage")}</button></footer></section>}
    <div className="v2-learning-roadmap">{path.steps.map((step, index) => <article className={`${step.status} ${step.evidenceStatus}`} key={step.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{locale === "zh" ? step.titleZh : step.titleEn}</strong><small>{learningEvidenceLabel(step, locale)} · {step.resources.length} {locale === "zh" ? "篇" : "papers"}</small></div><b>{step.status === "completed" ? "✓" : step.status === "active" ? (locale === "zh" ? "现在" : "Now") : ""}</b></article>)}</div>
  </section>;
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

function DirectionPathMap({
  map,
  locale,
  selectedTrackId,
  focusedEdgeId,
  onSelect,
  onClear,
}: {
  map: ResearchMapState;
  locale: Locale;
  selectedTrackId: string | null;
  focusedEdgeId: string | null;
  onSelect: (trackId: string) => void;
  onClear: () => void;
}) {
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const width = 1180;
  const laneHeight = 118;
  const top = 78;
  const height = Math.max(390, top + map.tracks.length * laneHeight + 34);
  const stageX: Record<ResearchTrackRole, number> = { foundation: 390, milestone: 690, frontier: 970 };
  const trackY = new Map(map.tracks.map((track, index) => [track.id, top + index * laneHeight + laneHeight / 2]));
  const activeTrackId = hoveredTrackId || selectedTrackId;
  const visibleEdges = (focusedEdgeId
    ? map.edges.filter((edge) => edge.id === focusedEdgeId)
    : activeTrackId ? map.edges.filter((edge) => edge.sourceTrackId === activeTrackId || edge.targetTrackId === activeTrackId) : [])
    .sort((left, right) => right.strength - left.strength).slice(0, focusedEdgeId ? 1 : 4);
  const connectedTrackIds = new Set(visibleEdges.flatMap((edge) => [edge.sourceTrackId, edge.targetTrackId]));
  const hasRelationshipPreview = visibleEdges.length > 0;
  return <div className="v2-direction-path-canvas">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={locale === "zh" ? "研究方向发展路径" : "Research direction development paths"}>
      <title>{locale === "zh" ? "研究方向发展路径" : "Research direction development paths"}</title>
      <desc>{locale === "zh" ? "每条横线从理论奠基经过关键推进走向当前前沿。悬停或点击方向时才显示跨方向关系。" : "Each horizontal line runs from foundations through milestones to the frontier. Cross-direction links appear only when a direction is hovered or selected."}</desc>
      <defs>
        <marker id="v2-direction-build-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 Z" /></marker>
        <marker id="v2-direction-bridge-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 Z" /></marker>
        <marker id="v2-direction-support-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 Z" /></marker>
      </defs>
      <g className="v2-direction-stage-headings">
        <text x="390" y="38" textAnchor="middle">{locale === "zh" ? "理论奠基" : "Foundations"}</text>
        <text x="690" y="38" textAnchor="middle">{locale === "zh" ? "关键推进" : "Milestones"}</text>
        <text x="970" y="38" textAnchor="middle">{locale === "zh" ? "当前前沿" : "Frontier"}</text>
        <text x="1110" y="38" textAnchor="middle">{locale === "zh" ? "证据缺口" : "Evidence gap"}</text>
        {[390, 690, 970, 1110].map((x) => <line key={x} x1={x} x2={x} y1="53" y2={height - 18} />)}
      </g>
      {map.tracks.map((track, trackIndex) => {
        const y = trackY.get(track.id)!;
        const selected = selectedTrackId === track.id;
        const previewed = hoveredTrackId === track.id;
        const related = connectedTrackIds.has(track.id);
        const muted = hasRelationshipPreview && !related;
        const color = paperNetworkPalette[trackIndex % paperNetworkPalette.length];
        const grouped = new Map<ResearchTrackRole, ResearchTrackPaper[]>();
        for (const paper of track.papers) grouped.set(paper.role, [...(grouped.get(paper.role) || []), paper]);
        const stations = track.papers.map((paper) => {
          const siblings = grouped.get(paper.role) || [paper];
          const index = siblings.findIndex((item) => item.id === paper.id);
          const offset = (index - (siblings.length - 1) / 2) * 34;
          return { paper, x: stageX[paper.role] + offset };
        });
        const trackTitle = locale === "zh" ? track.titleZh : track.titleEn;
        return <g key={track.id} className={`v2-direction-lane ${selected ? "selected" : ""} ${previewed ? "previewed" : ""} ${related ? "related" : ""} ${muted ? "muted" : ""} ${track.buildStatus}`} role="button" tabIndex={0} aria-pressed={selected} aria-label={locale === "zh" ? `${trackTitle}，${directionRoleLabel(track.userRole, locale)}，${track.papers.length} 篇论文，研究深度 ${track.depthScore}` : `${trackTitle}, ${directionRoleLabel(track.userRole, locale)}, ${track.papers.length} papers, depth ${track.depthScore}`} onPointerEnter={() => setHoveredTrackId(track.id)} onPointerLeave={() => setHoveredTrackId(null)} onFocus={() => setHoveredTrackId(track.id)} onBlur={() => setHoveredTrackId(null)} onClick={() => onSelect(track.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(track.id); } else if (event.key === "Escape") { event.preventDefault(); setHoveredTrackId(null); onClear(); } }}>
          <rect className="lane-hit" x="12" y={y - 48} width="1154" height="96" rx="12" />
          <text className="lane-role" x="32" y={y - 18}>{directionRoleLabel(track.userRole, locale)} · {directionHeatLabel(track.heatLevel, locale)}</text>
          <text className="lane-title" x="32" y={y + 8}>{trackTitle.slice(0, 26)}</text>
          <text className="lane-depth" x="32" y={y + 31}>{locale === "zh" ? `研究深度 ${track.depthScore}` : `Depth ${track.depthScore}`}{track.recentPaperCount ? locale === "zh" ? ` · ${track.recentPaperCount} 篇近期证据` : ` · ${track.recentPaperCount} recent` : ""}</text>
          <path className="route-line" style={{ stroke: color, strokeWidth: 2.4 + track.depthScore / 24 }} d={`M 300 ${y} C 440 ${y}, 800 ${y}, 1012 ${y}`} />
          <g className="route-chevrons" style={{ stroke: color }} aria-hidden="true">
            <path d={`M 535 ${y - 5} L 542 ${y} L 535 ${y + 5}`} />
            <path d={`M 835 ${y - 5} L 842 ${y} L 835 ${y + 5}`} />
          </g>
          <path className="gap-line" d={`M 1012 ${y} L 1092 ${y}`} />
          {stations.map(({ paper, x }) => <g className={`v2-direction-station ${paper.role}`} key={paper.id} transform={`translate(${x} ${y})`}>
            <circle r={paper.role === "frontier" ? 10 : 8} style={{ fill: color }} />
            <circle className="station-core" r="3" />
            <title>{paper.title} · {researchPaperYear(paper)} · {paper.citationCount} {locale === "zh" ? "次引用" : "citations"}</title>
          </g>)}
          <path className="gap-node" transform={`translate(1110 ${y})`} d="M 0 -9 L 9 0 L 0 9 L -9 0 Z"><title>{track.intelligence ? locale === "zh" ? track.intelligence.evidenceGapZh : track.intelligence.evidenceGapEn : locale === "zh" ? "等待更多真实证据" : "Awaiting more evidence"}</title></path>
        </g>;
      })}
      <g className={`v2-direction-live-relations ${focusedEdgeId ? "single" : "grouped"}`} aria-hidden="true">
        {visibleEdges.map((edge, index) => {
          const sourceY = trackY.get(edge.sourceTrackId);
          const targetY = trackY.get(edge.targetTrackId);
          if (sourceY == null || targetY == null) return null;
          const bendX = 342 + index * 8;
          const middleY = (sourceY + targetY) / 2;
          const direction = targetY > sourceY ? 1 : -1;
          const startY = sourceY + direction * 11;
          const endY = targetY - direction * 13;
          const path = `M 302 ${startY} C ${bendX} ${startY}, ${bendX} ${endY}, 302 ${endY}`;
          const marker = edge.kind === "builds_on" ? "url(#v2-direction-build-arrow)" : edge.kind === "supports" ? "url(#v2-direction-support-arrow)" : undefined;
          return <g className={`v2-direction-live-relation ${edge.kind}`} key={edge.id}>
            <path className="relation-halo" d={path} />
            <path className="relation-path" pathLength="100" d={path} markerEnd={marker} />
            <circle className="relation-end source" cx="302" cy={sourceY} r="7" />
            <circle className="relation-end target" cx="302" cy={targetY} r="7" />
            <g className="relation-label" transform={`translate(${bendX - 66} ${middleY})`}>
              <rect x="-4" y="-11" width={locale === "zh" ? 58 : 72} height="22" rx="11" />
              <text x={locale === "zh" ? 25 : 32} y="3" textAnchor="middle">{directionRelationshipLabel(edge.kind, locale)}</text>
            </g>
          </g>;
        })}
      </g>
    </svg>
    <span className="v2-sr-only" aria-live="polite">{focusedEdgeId && visibleEdges[0] ? (locale === "zh" ? `正在预览${directionRelationshipLabel(visibleEdges[0].kind, locale)}关系，Pi 推断强度 ${visibleEdges[0].strength}%` : `Previewing a ${directionRelationshipLabel(visibleEdges[0].kind, locale)} relationship with ${visibleEdges[0].strength}% Pi confidence`) : ""}</span>
  </div>;
}

function ResearchSynthesisWorkbench({
  track, synthesis, loading, error, locale, onRefresh, onScanGap, onExplain,
}: {
  track: ResearchTrack;
  synthesis: ResearchSynthesis | null;
  loading: boolean;
  error: string;
  locale: Locale;
  onRefresh: () => void;
  onScanGap: () => void;
  onExplain: () => void;
}) {
  const ready = Boolean(synthesis && ["ready", "partial"].includes(synthesis.status) && synthesis.statements.length);
  const availablePapers = synthesis?.availablePaperCount || 0;
  const searchSourceStatement = synthesis?.nextSearchSourceStatementId
    ? synthesis.statements.find((statement) => statement.id === synthesis.nextSearchSourceStatementId) || null : null;
  return <section className="v2-route-workspace-panel v2-research-synthesis" role="tabpanel">
    <header><div><p className="v2-kicker">π {locale === "zh" ? "可追溯的跨论文证据综合" : "TRACEABLE CROSS-PAPER SYNTHESIS"}</p><h2>{locale === "zh" ? "哪些判断已经站稳，哪些仍然相互冲突" : "What is stable, what conflicts, and what remains unresolved"}</h2><span className="v2-sr-only">这条路线目前可以怎样判断</span></div><div><span>{ready ? synthesis!.confidence : track.intelligence?.confidence || 0}%<small>{locale === "zh" ? "综合置信度" : "confidence"}</small></span><button type="button" onClick={onRefresh} disabled={loading || !synthesis?.canGenerate}>{loading ? (locale === "zh" ? "Pi 正在综合…" : "Synthesizing…") : ready ? (locale === "zh" ? "按最新证据更新" : "Refresh from evidence") : (locale === "zh" ? "生成跨论文综合" : "Build synthesis")}</button></div></header>
    {ready ? <>
      <div className="v2-synthesis-overview"><div><small>{locale === "zh" ? "这组论文共同回答的问题" : "QUESTION SHARED BY THESE PAPERS"}</small><h3>{locale === "zh" ? synthesis!.questionZh : synthesis!.questionEn}</h3><p>{locale === "zh" ? synthesis!.overviewZh : synthesis!.overviewEn}</p>{(locale === "zh" ? synthesis!.changeSummaryZh : synthesis!.changeSummaryEn) && <aside><b>↗</b><span><strong>{locale === "zh" ? "相较上一版，发生了什么" : "What changed since the previous revision"}</strong>{locale === "zh" ? synthesis!.changeSummaryZh : synthesis!.changeSummaryEn}</span></aside>}</div></div>
      <footer className="v2-synthesis-next"><div><small>{locale === "zh" ? "综合识别出的下一项关键验证" : "NEXT HIGH-VALUE TEST FROM THE SYNTHESIS"}</small><strong>{synthesis!.nextSearchQuery || (locale === "zh" ? "当前综合尚未形成安全的定向检索式" : "No safe targeted query is ready yet")}</strong>{searchSourceStatement && <em>{locale === "zh" ? `来自证据缺口：“${searchSourceStatement.titleZh}”` : `From evidence gap: “${searchSourceStatement.titleEn}”`}</em>}<p>{locale === "zh" ? "新检索会自动排入有上限的后台补证；此按钮可提前执行。只有通过共享质量门槛的真实论文才会回到今日推荐和路线待确认证据。" : "New queries are automatically queued as bounded background evidence tasks; this button runs one early. Only real papers that pass the shared quality gate return to Today and the route evidence queue."}</p></div><button type="button" onClick={onScanGap} disabled={!synthesis!.nextSearchQuery || synthesis!.stale}>{locale === "zh" ? "立即提前检索" : "Run search now"} →</button></footer>
      <details className="v2-synthesis-evidence-detail"><summary><span><small>{locale === "zh" ? "证据判断与来源" : "EVIDENCE JUDGMENTS & SOURCES"}</small><strong>{locale === "zh" ? `${synthesis!.sourcePaperCount} 篇已核验 · ${synthesis!.claimCount} 条判断 · ${synthesis!.availablePaperCount} 篇可用` : `${synthesis!.sourcePaperCount} grounded · ${synthesis!.claimCount} claims · ${synthesis!.availablePaperCount} available`}</strong></span><b>{locale === "zh" ? "展开核对 ↓" : "Inspect evidence ↓"}</b></summary><div className="v2-synthesis-statement-list">{synthesis!.statements.map((statement, index) => <details className={statement.kind} key={statement.id}><summary><span>{String(index + 1).padStart(2, "0")}</span><div><small>{researchSynthesisKindLabel(statement.kind, locale)}</small><h3>{locale === "zh" ? statement.titleZh : statement.titleEn}</h3><p>{locale === "zh" ? statement.textZh : statement.textEn}</p></div><b>{statement.confidence}%<i>＋</i></b></summary><div className="v2-synthesis-sources"><header><strong>{locale === "zh" ? "回到来源核对" : "Verify in the source"}</strong><span>{statement.sources.length} {locale === "zh" ? "条证据" : "claims"}</span></header>{statement.sources.map((source) => <article key={source.claimId}><div><span>{researchEvidenceLevelLabel(source.evidenceLevel, locale)}</span><strong>{source.title}</strong><small>{[source.authors, source.publishedAt?.slice(0, 4), source.venue].filter(Boolean).join(" · ")}</small></div><blockquote>{source.evidenceQuote}</blockquote><footer><em>{source.locator || (locale === "zh" ? "来源定位待补全" : "Locator pending")} · claim {source.claimId}</em>{source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">{locale === "zh" ? "打开来源" : "Open source"} ↗</a>}</footer></article>)}</div></details>)}</div></details>
    </> : loading ? <div className="v2-route-panel-empty v2-synthesis-loading"><span>π</span><div><strong>{locale === "zh" ? "Pi 正在逐条比对论文证据" : "Pi is comparing claim-level evidence"}</strong><p>{locale === "zh" ? "正在区分共同结论、条件差异、真正冲突和方法演进。" : "Separating shared conclusions, conditional differences, real conflicts, and method lineage."}</p></div></div> : <div className="v2-route-panel-empty v2-synthesis-empty"><span>◎</span><div><strong>{availablePapers < 2 ? (locale === "zh" ? "还需要至少两篇已确认且可核验的论文" : "At least two confirmed, grounded papers are needed") : (locale === "zh" ? "这条路线还没有形成跨论文综合" : "This route has no cross-paper synthesis yet")}</strong><p>{availablePapers < 2 ? (locale === "zh" ? `目前有 ${availablePapers} 篇论文具备逐条证据。Pi 不会用标题相似或单篇摘要冒充共识与分歧。` : `${availablePapers} paper(s) currently have claim-level evidence. Pi will not turn title similarity or one abstract into consensus.`) : (locale === "zh" ? "现有证据已足够，可以让 Pi 生成带原文定位的综合。" : "Enough evidence is available for a source-linked synthesis.")}</p>{track.intelligence && <small>{locale === "zh" ? `路线级初步研判：${track.intelligence.assessmentZh}` : `Preliminary route assessment: ${track.intelligence.assessmentEn}`}</small>}{error && <em>{error}</em>}</div>{availablePapers >= 2 ? <button type="button" onClick={onRefresh}>{locale === "zh" ? "开始综合" : "Build synthesis"} →</button> : <button type="button" onClick={onExplain}>{locale === "zh" ? "让 Pi 解释还缺什么" : "Ask Pi what is missing"} →</button>}</div>}
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
    : `Trace ${statements.length} synthesis statement(s) · ${sourcePaperCount} paper(s)`} ＋</summary><div>{statements.map((statement) => <article key={statement.id}><header><span>{researchSynthesisKindLabel(statement.kind, locale)}</span><strong>{locale === "zh" ? statement.titleZh : statement.titleEn}</strong><small>{statement.confidence}%</small></header><p>{locale === "zh" ? statement.textZh : statement.textEn}</p><footer>{statement.sources.map((source) => source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" key={source.claimId}><strong>{source.title}</strong><small>{researchEvidenceLevelLabel(source.evidenceLevel, locale)} · claim {source.claimId}</small></a> : <span key={source.claimId}><strong>{source.title}</strong><small>{researchEvidenceLevelLabel(source.evidenceLevel, locale)} · claim {source.claimId}</small></span>)}</footer></article>)}</div></details>;
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
  if (run.status === "queued" || run.status === "running") return <section className="v2-action-run-progress" role="status" aria-live="polite"><div><span>π</span><strong>{researchActionStageLabel(run.stage, locale)}</strong><b>{Math.max(8, run.progress)}%</b></div><i><b style={{ width: `${Math.max(8, run.progress)}%` }} /></i><small>{locale === "zh" ? "执行状态已保存；离开页面后回来仍可继续查看。" : "Progress is saved and remains available after you leave this page."}</small></section>;
  if (run.status === "failed") return <section className="v2-action-run-failed"><div><strong>{researchActionStageLabel(run.stage, locale)}</strong><p>{run.error || (locale === "zh" ? "已有研究内容没有受到影响。" : "Existing research content was not affected.")}</p></div><button type="button" disabled={busy} onClick={onExecute}>{locale === "zh" ? "重新执行" : "Retry"}</button></section>;
  const steps = run.deliverable.steps || [];
  const rows = run.deliverable.comparisonRows || [];
  const trustworthy = run.verificationStatus === "verified" || run.verificationStatus === "revised";
  const verificationLabel = run.verificationStatus === "verified" ? (locale === "zh" ? "内容已逐条核验" : "Evidence verified")
    : run.verificationStatus === "revised" ? (locale === "zh" ? "核验后已自动修订" : "Verified after revision")
      : (locale === "zh" ? "证据不足，原结论未发布" : "Insufficient evidence; draft withheld");
  return <section className={`v2-action-run-ready verification-${run.verificationStatus}`}><header><div><small>π {locale === "zh" ? "Pi 已执行" : "PI EXECUTED"} · {verificationLabel}</small><h4>{locale === "zh" ? run.headlineZh : run.headlineEn}</h4></div><span>{trustworthy ? "✓" : "!"}</span></header><p>{locale === "zh" ? run.resultZh : run.resultEn}</p>{rows.length > 0 && <div className="v2-action-comparison">{rows.map((row, index) => <article key={`${row.dimensionEn}:${index}`}><strong>{locale === "zh" ? row.dimensionZh : row.dimensionEn}</strong><p>{locale === "zh" ? row.findingZh : row.findingEn}</p><small>{row.paperIds.length} {locale === "zh" ? "篇论文" : "papers"} · {row.claimIds.length} {locale === "zh" ? "条证据" : "claims"}</small></article>)}</div>}{steps.length > 0 && <ol className="v2-action-steps">{steps.map((step, index) => <li key={`${step.titleEn}:${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{locale === "zh" ? step.titleZh : step.titleEn}</strong><p>{locale === "zh" ? step.detailZh : step.detailEn}</p></div></li>)}</ol>}<div className="v2-action-run-judgment"><article><small>{locale === "zh" ? "现在可以作出的判断" : "DECISION NOW"}</small><strong>{locale === "zh" ? run.decisionZh : run.decisionEn}</strong></article><article><small>{locale === "zh" ? "证据边界" : "EVIDENCE BOUNDARY"}</small><p>{locale === "zh" ? run.limitationsZh : run.limitationsEn}</p></article></div>{run.searchQuery && <code className="v2-action-query">{run.searchQuery}</code>}{run.sourcePapers.length > 0 && <details className="v2-action-sources"><summary>{locale === "zh" ? `${run.sourcePapers.length} 篇来源论文` : `${run.sourcePapers.length} source papers`} ＋</summary><div>{run.sourcePapers.map((paper) => <a href={paper.url || "#"} target={paper.url ? "_blank" : undefined} rel="noreferrer" key={paper.id}><strong>{paper.title}</strong><small>{[paper.authors, paper.publishedAt?.slice(0, 4), paper.venue].filter(Boolean).join(" · ")}</small></a>)}</div></details>}<footer>{completed ? <em>✓ {locale === "zh" ? "已形成长期研究记录" : "Saved to research history"}</em> : trustworthy && <button type="button" disabled={busy} onClick={onDone}>{locale === "zh" ? "确认完成" : "Mark complete"}</button>}{!completed && <button type="button" disabled={busy} onClick={onExecute}>{trustworthy ? (locale === "zh" ? "按最新证据重做" : "Rerun with latest evidence") : (locale === "zh" ? "补证据后重试" : "Retry after adding evidence")}</button>}</footer></section>;
}

function ResearchProblemWorkbench({
  state, synthesis, loading, action, error, locale, onDraft, onConfirm, onAssess, onScanProblem, onUpdateAction, onExecuteAction,
}: {
  state: ResearchProblemState | null;
  synthesis: ResearchSynthesis | null;
  loading: boolean;
  action: string | null;
  error: string;
  locale: Locale;
  onDraft: () => void;
  onConfirm: (draft: { question: string; objective: string; scope: string; successCriteria: string; stage: ResearchProblemStage; hypotheses: Array<{ statement: string; rationale: string; confidence: number; sourceStatementIds: string[] }> }) => void;
  onAssess: () => void;
  onScanProblem: () => void;
  onUpdateAction: (actionId: string, status: "accepted" | "done" | "dismissed") => void;
  onExecuteAction: (action: ResearchProblemAction) => void;
}) {
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
  if (loading && !state) return <section className="v2-route-workspace-panel v2-route-panel-empty v2-problem-loading" role="tabpanel"><span>π</span><div><strong>{locale === "zh" ? "Pi 正在读取当前研究问题" : "Pi is reading the current research problem"}</strong><p>{locale === "zh" ? "核对已确认问题、假设和最新证据变化。" : "Checking the confirmed problem, hypotheses, and latest evidence changes."}</p></div></section>;
  if (!state?.problem) return <section className="v2-route-workspace-panel v2-route-panel-empty v2-problem-empty" role="tabpanel"><span>◎</span><div><strong>{locale === "zh" ? "把宽泛方向收紧为一个能被推进的问题" : "Turn this broad direction into an answerable problem"}</strong><p>{state?.evidence.canDraft ? (locale === "zh" ? "Pi 会依据当前跨论文证据起草问题、范围、成功标准和可检验假设；确认前不会影响推荐。" : "Pi will draft a question, scope, success criteria, and testable hypotheses from the current synthesis. Nothing guides recommendations until you confirm it.") : (locale === "zh" ? "先形成跨论文综合，Pi 才会依据真实证据起草研究问题。" : "Build the cross-paper synthesis before Pi drafts a problem from real evidence.")}</p>{error && <em>{error}</em>}</div><button type="button" disabled={Boolean(action) || !state?.evidence.canDraft} onClick={onDraft}>{action === "draft" ? (locale === "zh" ? "Pi 正在起草…" : "Drafting…") : (locale === "zh" ? "让 Pi 起草" : "Ask Pi to draft")} →</button></section>;
  const active = state.problem.status === "active";
  if (!active) return <section className="v2-route-workspace-panel v2-research-problem" role="tabpanel"><header><div><p className="v2-kicker">π {locale === "zh" ? "Pi 起草 · 用户确认后生效" : "PI DRAFT · ACTIVE ONLY AFTER CONFIRMATION"}</p><h2>{locale === "zh" ? "把研究方向写成可检验的工作问题" : "Shape the direction into a testable working problem"}</h2></div><span>{locale === "zh" ? "草稿" : "Draft"}</span></header><div className="v2-problem-editor"><label className="question"><span>{locale === "zh" ? "当前要回答的问题" : "Question to answer"}</span><textarea value={draft.question} maxLength={520} onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))} /></label><label><span>{locale === "zh" ? "研究目标" : "Objective"}</span><textarea value={draft.objective} maxLength={700} onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))} /></label><label><span>{locale === "zh" ? "范围与边界" : "Scope and boundary"}</span><textarea value={draft.scope} maxLength={700} onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value }))} /></label><label><span>{locale === "zh" ? "怎样才算推进" : "Success criterion"}</span><textarea value={draft.successCriteria} maxLength={700} onChange={(event) => setDraft((current) => ({ ...current, successCriteria: event.target.value }))} /></label><label className="stage"><span>{locale === "zh" ? "当前阶段" : "Current stage"}</span><select value={draft.stage} onChange={(event) => setDraft((current) => ({ ...current, stage: event.target.value as typeof current.stage }))}>{(["literature", "theory", "method", "experiment", "writing"] as const).map((stage) => <option value={stage} key={stage}>{researchProblemStageLabel(stage, locale)}</option>)}</select></label></div><section className="v2-problem-hypotheses"><header><strong>{locale === "zh" ? "待确认假设" : "Hypotheses to confirm"}</strong><small>{locale === "zh" ? "你可以直接修改；Pi 只保留提案身份" : "Edit freely; Pi keeps these as proposals until confirmation"}</small></header>{hypotheses.map((hypothesis, index) => <article key={index}><span>H{index + 1}</span><div><textarea value={hypothesis.statement} maxLength={520} onChange={(event) => setHypotheses((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, statement: event.target.value } : item))} /><p>{hypothesis.rationale}</p></div><button type="button" onClick={() => setHypotheses((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></article>)}<button className="add" type="button" onClick={() => setHypotheses((current) => [...current, { statement: "", rationale: "", confidence: 0, sourceStatementIds: [] }])}>＋ {locale === "zh" ? "增加一个自己的假设" : "Add your own hypothesis"}</button></section><footer className="v2-problem-confirm"><div><strong>{locale === "zh" ? "确认后才会指导扫描" : "Guides discovery only after confirmation"}</strong><p>{locale === "zh" ? "之后 Pi 可以提出证据影响和修改建议，但不会自动改写这些内容。" : "Pi may suggest evidence impacts and revisions later, but never silently rewrites these fields."}</p></div><button type="button" disabled={Boolean(action) || !draft.question.trim() || !draft.objective.trim() || !draft.scope.trim() || !draft.successCriteria.trim()} onClick={() => onConfirm({ ...draft, hypotheses: hypotheses.filter((item) => item.statement.trim()) })}>{action === "confirm" ? (locale === "zh" ? "正在确认…" : "Confirming…") : (locale === "zh" ? "确认并用于研究" : "Confirm for research")} →</button></footer></section>;
  const assessment = state.assessment;
  const acceptedActions = state.actions.filter((item) => item.status === "accepted");
  return <section className="v2-route-workspace-panel v2-research-problem active" role="tabpanel">
    <header><div><p className="v2-kicker">π {locale === "zh" ? "用户确认的研究问题" : "USER-CONFIRMED RESEARCH PROBLEM"}</p><h2>{state.problem.question}</h2></div><span>{researchProblemStageLabel(state.problem.stage, locale)}</span></header>
    {assessment ? <section className={`v2-problem-assessment ${assessment.stale ? "stale" : ""}`}><header><div><small>{locale === "zh" ? "最新证据对问题的影响" : "LATEST EVIDENCE IMPACT"}</small><strong>{assessment.confidence}% {locale === "zh" ? "当前判断置信度" : "current confidence"}</strong></div><button type="button" disabled={Boolean(action)} onClick={onAssess}>{action === "assess" ? (locale === "zh" ? "Pi 正在研判…" : "Assessing…") : assessment.stale ? (locale === "zh" ? "按最新证据更新" : "Refresh from evidence") : (locale === "zh" ? "重新研判" : "Reassess")}</button></header><p>{locale === "zh" ? assessment.summaryZh : assessment.summaryEn}</p>{(locale === "zh" ? assessment.changeZh : assessment.changeEn) && <blockquote><b>↗</b><span><strong>{locale === "zh" ? "本次改变" : "What changed"}</strong>{locale === "zh" ? assessment.changeZh : assessment.changeEn}</span></blockquote>}<ResearchStatementTrace statementIds={assessment.sourceStatementIds} synthesis={synthesis} locale={locale} /><div><article><small>{locale === "zh" ? "最关键的不确定性" : "KEY UNCERTAINTY"}</small><p>{locale === "zh" ? assessment.uncertaintyZh : assessment.uncertaintyEn}</p></article><article><small>{locale === "zh" ? "下一项需要作出的判断" : "NEXT DECISION"}</small><p>{locale === "zh" ? assessment.nextDecisionZh : assessment.nextDecisionEn}</p></article></div>{assessment.nextSearchQuery && <section className="v2-problem-next-search"><div><small>{locale === "zh" ? "由当前研判生成的定向检索" : "TARGETED SEARCH FROM THIS ASSESSMENT"}</small><code>{assessment.nextSearchQuery}</code><p>{assessment.stale ? (locale === "zh" ? "证据已经变化，请先更新研判；旧检索不会继续供稿。" : "Evidence has changed. Refresh the assessment before this query can supply candidates.") : (locale === "zh" ? "Pi 已自动安排一次有上限的补证；此按钮可提前执行。候选进入今日共用的质量评估队列，不会直接改写路线或假设。" : "Pi has automatically scheduled one bounded evidence search; this button runs it early. Candidates enter Today's shared quality queue and do not directly rewrite the route or hypotheses.")}</p></div><button type="button" disabled={Boolean(action) || assessment.stale} onClick={onScanProblem}>{action === "scan-problem" ? (locale === "zh" ? "正在寻找论文…" : "Discovering papers…") : (locale === "zh" ? "立即提前检索" : "Run search now")} →</button></section>}</section> : <section className="v2-problem-assessment empty"><div><strong>{locale === "zh" ? "问题已经确认，等待第一次证据研判" : "The problem is confirmed and ready for its first evidence assessment"}</strong><p>{locale === "zh" ? "Pi 会把跨论文证据映射到你的假设，只提出影响，不修改问题。" : "Pi maps cross-paper evidence to your hypotheses and suggests impacts without changing the problem."}</p></div><button type="button" disabled={Boolean(action) || !state.evidence.canAssess} onClick={onAssess}>{action === "assess" ? (locale === "zh" ? "Pi 正在研判…" : "Assessing…") : (locale === "zh" ? "开始证据研判" : "Assess evidence")} →</button></section>}
    <section className="v2-problem-actions"><header><div><strong>{locale === "zh" ? "接下来推进什么" : "What moves the problem forward"}</strong><small>{locale === "zh" ? "接受后由 Pi 执行；结果带来源并长期保存" : "Pi executes accepted actions and saves source-linked results"}</small></div><span>{acceptedActions.length} {locale === "zh" ? "进行中" : "active"}</span></header>
      {state.actions.map((item, index) => <article className={`${item.status} ${item.run?.status || "not-run"}`} key={item.id}><span>{item.status === "done" ? "✓" : String(index + 1).padStart(2, "0")}</span><div className="v2-action-body"><small>{item.kind.toUpperCase()}</small><strong>{locale === "zh" ? item.titleZh : item.titleEn}</strong><p>{locale === "zh" ? item.rationaleZh : item.rationaleEn}</p>{item.status !== "proposed" && <ResearchActionRunOutput item={item} locale={locale} busy={Boolean(action)} completed={item.status === "done"} onExecute={() => onExecuteAction(item)} onDone={() => onUpdateAction(item.id, "done")} />}</div>{item.status === "proposed" && <footer><button type="button" disabled={Boolean(action)} onClick={() => onExecuteAction(item)}>{locale === "zh" ? "接受并让 Pi 执行" : "Accept & execute"}</button><button type="button" disabled={Boolean(action)} onClick={() => onUpdateAction(item.id, "dismissed")}>{locale === "zh" ? "暂不做" : "Dismiss"}</button></footer>}</article>)}
      {!state.actions.length && <p className="v2-problem-no-actions">{locale === "zh" ? "完成一次证据研判后，Pi 会提出 1–3 项具体行动。" : "After an evidence assessment, Pi will propose 1–3 concrete moves."}</p>}
    </section>
    <details className="v2-problem-context"><summary><span><small>{locale === "zh" ? "已确认的问题上下文" : "CONFIRMED PROBLEM CONTEXT"}</small><strong>{locale === "zh" ? `目标、边界、推进标准与 ${state.hypotheses.filter((item) => item.status === "confirmed").length} 个假设` : `Objective, scope, success criterion, and ${state.hypotheses.filter((item) => item.status === "confirmed").length} hypotheses`}</strong></span><b>{locale === "zh" ? "展开查看 ↓" : "Inspect context ↓"}</b></summary><div className="v2-problem-definition"><article><small>{locale === "zh" ? "当前目标" : "OBJECTIVE"}</small><p>{state.problem.objective}</p></article><article><small>{locale === "zh" ? "范围边界" : "SCOPE"}</small><p>{state.problem.scope}</p></article><article><small>{locale === "zh" ? "推进标准" : "SUCCESS CRITERION"}</small><p>{state.problem.successCriteria}</p></article></div><section className="v2-problem-confirmed-hypotheses"><header><strong>{locale === "zh" ? "当前假设" : "Current hypotheses"}</strong><span>{state.hypotheses.filter((item) => item.status === "confirmed").length}</span></header>{state.hypotheses.filter((item) => item.status === "confirmed").map((hypothesis, index) => { const impacts = assessment?.hypothesisImpacts.filter((item) => item.hypothesisId === hypothesis.id) || []; return <article key={hypothesis.id}><span>H{index + 1}</span><div><h3>{hypothesis.statement}</h3><p>{hypothesis.rationale}</p><ResearchStatementTrace statementIds={hypothesis.sourceStatementIds} synthesis={synthesis} locale={locale} userDefined={!hypothesis.sourceStatementIds.length} />{impacts.map((impact) => <aside className={impact.relation} key={`${impact.hypothesisId}:${impact.relation}`}><b>{researchProblemRelationLabel(impact.relation, locale)}</b><span>{locale === "zh" ? impact.explanationZh : impact.explanationEn}</span><em>{impact.confidence}%</em><ResearchStatementTrace statementIds={impact.sourceStatementIds} synthesis={synthesis} locale={locale} /></aside>)}</div></article>; })}</section></details>
    {error && <div className="v2-problem-error">{error}</div>}
  </section>;
}

export default function ResearchApp({ user }: { user: User }) {
  const [locale, setLocale] = useState<Locale>("zh");
  const [view, setView] = useState<View>("today");
  const [spaces, setSpaces] = useState<Space[]>(fallbackSpaces);
  const [activeSpaceId, setActiveSpaceId] = useState(fallbackSpaces[0].id);
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpace, setNewSpace] = useState({ name: "", memberName: "", description: "" });
  const [selectedMonitorPaper, setSelectedMonitorPaper] = useState<MonitorPaper | null>(null);
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
  const [directionOverviewId, setDirectionOverviewId] = useState<string | null>(null);
  const [directionRelationFocusId, setDirectionRelationFocusId] = useState<string | null>(null);
  const [directionPinnedRelationId, setDirectionPinnedRelationId] = useState<string | null>(null);
  const [researchMapMode, setResearchMapMode] = useState<ResearchMapMode>("directions");
  const [researchRouteTab, setResearchRouteTab] = useState<ResearchRouteTab>("problem");
  const [paperNetworkMode, setPaperNetworkMode] = useState<PaperNetworkMode>("similarity");
  const [paperNetworkScope, setPaperNetworkScope] = useState<PaperNetworkScope>("all");
  const [paperDiscoveryTab, setPaperDiscoveryTab] = useState<PaperDiscoveryTab>("similar");
  const [multiOriginIntent, setMultiOriginIntent] = useState<MultiOriginIntent>("shared");
  const [paperNetworkTrackId, setPaperNetworkTrackId] = useState("all");
  const [paperNetworkOriginCanonicalIds, setPaperNetworkOriginCanonicalIds] = useState<string[]>([]);
  const [selectedNetworkPaperId, setSelectedNetworkPaperId] = useState<string | null>(null);
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
  const [learningState, setLearningState] = useState<LearningPathState>({ path: null, suggestedTarget: "", availablePaperCount: 0, waitingQualityCount: 0, model: "deepseek-v4-pro" });
  const [learningTarget, setLearningTarget] = useState("");
  const [learningTargetTrackId, setLearningTargetTrackId] = useState<string | null>(null);
  const [learningScopeDirty, setLearningScopeDirty] = useState(false);
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningAction, setLearningAction] = useState<string | null>(null);
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
  const [showModelApiKey, setShowModelApiKey] = useState(false);
  const [modelSettingsError, setModelSettingsError] = useState("");
  const [askOpen, setAskOpen] = useState(false);
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
  const [scanElapsedSeconds, setScanElapsedSeconds] = useState(0);
  const [sourceSettingsOpen, setSourceSettingsOpen] = useState(false);
  const [venueDraft, setVenueDraft] = useState("");
  const [authorDraft, setAuthorDraft] = useState("");
  const [explorationDraft, setExplorationDraft] = useState<"focused" | "balanced" | "open">("balanced");
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [feedbackPrompt, setFeedbackPrompt] = useState<{ paper: MonitorPaper; kind: "relevant" | "not_relevant" } | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [libraryStageFilter, setLibraryStageFilter] = useState<LibraryStageFilter>("all");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("priority");
  const [libraryVisibleCount, setLibraryVisibleCount] = useState(60);
  const [paperReturnView, setPaperReturnView] = useState<"today" | "library">("today");
  const [paperNoteDraft, setPaperNoteDraft] = useState("");
  const [readingMemoryAnalyzing, setReadingMemoryAnalyzing] = useState(false);
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
  const activeSpaceSupportsLearning = !activeSpace.id.startsWith("space-") && !activeSpace.id.startsWith("local-");
  const activeLearningReady = learningLoadedSpaceId === activeSpace.id;
  const activeLearningState: LearningPathState = activeLearningReady
    ? learningState
    : { path: null, suggestedTarget: "", availablePaperCount: 0, waitingQualityCount: 0, model: "deepseek-v4-pro" };
  const activeLearningLoading = learningLoading || (activeSpaceSupportsLearning && !activeLearningReady);
  const activeLearningError = activeLearningReady ? learningError : "";
  const activeLearningTargetTrack = learningTargetTrackId ? researchMap.tracks.find((track) => track.id === learningTargetTrackId) || null : null;
  const activeLearningPathDirectionMismatch = Boolean(activeLearningState.path
    && (learningTargetTrackId
      ? activeLearningState.path.targetTrackId !== learningTargetTrackId
      : learningScopeDirty && activeLearningState.path.targetTrackId !== null));
  const activeLearningStep = activeLearningState.path?.steps.find((step) => step.status === "active")
    || activeLearningState.path?.steps.find((step) => step.status !== "completed") || null;
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
    const qualityStageRank: Record<NonNullable<MonitorPaper["qualityStage"]>, number> = { recommended: 0, reviewing: 1, reviewed: 2, discovered: 3, queued: 4 };
    return historyPapers.filter((paper) => {
      const belongsToRecommendationInbox = paper.qualityStage === "recommended" || paper.qualityStage === "reviewing"
        || paper.saved || Boolean(paper.feedback) || paper.readingStatus !== "unread";
      if (libraryStageFilter === "evaluated" && !["reviewed", "reviewing", "recommended"].includes(paper.qualityStage || "")) return false;
      if (libraryFilter === "inbox" && !belongsToRecommendationInbox) return false;
      if (libraryFilter === "inbox" && ["accepted", "dismissed"].includes(paper.userState)) return false;
      if (libraryFilter === "accepted" && paper.userState !== "accepted") return false;
      if (libraryFilter === "dismissed" && paper.userState !== "dismissed") return false;
      if (libraryFilter === "inbox" && inboxFilter !== "all" && paper.userState !== inboxFilter) return false;
      if (!query) return true;
      return [paper.title, paper.authors, paper.venue, paper.summaryZh, paper.summaryEn, paper.whyReadZh, paper.whyReadEn]
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
  }, [historyPapers, inboxFilter, libraryFilter, librarySearch, librarySort, libraryStageFilter]);
  const visibleLibraryPapers = useMemo(() => libraryPapers.slice(0, libraryVisibleCount), [libraryPapers, libraryVisibleCount]);
  const scanIsActive = monitoring || isMonitorScanning(monitor?.status);
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
  const scanProgress = scanIsActive
    ? Math.max(monitorProgressByStatus[effectiveScanStatus], activeScanJob?.progress || 0)
    : monitor?.status === "ready" ? 100 : 0;
  const baseScanPhase = verificationInProgress
    ? (locale === "zh" ? "正在核对推荐依据" : "Checking recommendation evidence")
    : monitorPhaseLabel(scanIsActive ? effectiveScanStatus : monitor?.status, locale);
  const scanPhase = scanIsActive && activeScanJob?.currentSource ? `${baseScanPhase} · ${activeScanJob.currentSource}` : baseScanPhase;
  const currentRunHasDiscovery = Boolean(activeScanJob && (activeScanJob.discoveredCount > 0
    || activeScanJob.horizonStats?.some((item) => item.candidates !== null)));
  const healthyCoverageCount = !scanIsActive || currentRunHasDiscovery
    ? monitor?.coverage?.filter((source) => source.healthy).length || 0
    : 0;
  const displayScanElapsedSeconds = scanElapsedSeconds <= 3_600 ? scanElapsedSeconds : 0;
  const restoredOldScan = scanElapsedSeconds > 3_600;
  const scanHorizonStats = (["days", "months", "years"] as const).map((horizon) => monitor?.scanJob?.horizonStats?.find((item) => item.horizon === horizon) || {
    horizon,
    status: monitor?.status === "ready" || monitor?.status === "error" ? "complete" as const : monitor?.scanJob?.currentHorizon === horizon ? "searching" as const : "pending" as const,
    candidates: null,
    rawCandidates: null,
    newCandidates: null,
    queued: null,
    screened: 0,
  });
  const mustReadCount = rankedMonitorPapers.filter((paper) => paper.recommendationTier === "must_read").length;
  const todayNavigationCount = rankedMonitorPapers.length;
  const activeReadingCount = (monitor?.historyCounts?.reading?.queued || 0) + (monitor?.historyCounts?.reading?.reading || 0);
  const dailyBriefPapers = useMemo(() => {
    const ids = new Set(monitor?.dailyBrief?.paperIds || []);
    const byId = new Map(historyPapers.filter((paper) => ids.has(paper.id)).map((paper) => [paper.id, paper]));
    return (monitor?.dailyBrief?.paperIds || []).flatMap((id) => {
      const paper = byId.get(id);
      return paper ? [paper] : [];
    });
  }, [historyPapers, monitor?.dailyBrief?.paperIds]);
  const dailyFreshnessCounts = useMemo(() => ({
    days: dailyBriefPapers.filter((paper) => paper.horizon === "days").length,
    months: dailyBriefPapers.filter((paper) => paper.horizon === "months").length,
    years: dailyBriefPapers.filter((paper) => !["days", "months"].includes(paper.horizon || "")).length,
  }), [dailyBriefPapers]);
  const dailySignals = monitor?.dailyBrief ? (locale === "zh" ? monitor.dailyBrief.signalsZh : monitor.dailyBrief.signalsEn) : [];
  const dailyReadingPlan = monitor?.dailyBrief ? (locale === "zh" ? monitor.dailyBrief.readingPlanZh : monitor.dailyBrief.readingPlanEn) : [];
  const dailyBriefEntryCount = Math.min(6, Math.max(dailyBriefPapers.length, dailySignals.length, dailyReadingPlan.length));
  const latestQuickScreenedCount = monitor?.scanJob?.reviewedCount || monitor?.dailyBrief?.metrics.screened || monitor?.dailyBrief?.metrics.reviewed || 0;
  const latestDeepReviewedCount = monitor?.scanJob?.deepCompletedCount || monitor?.dailyBrief?.metrics.deepReviewed || Math.min(monitor?.dailyBrief?.metrics.reviewed || 0, 8);
  const latestDeepDeferredCount = monitor?.scanJob?.deepDeferredCount || monitor?.dailyBrief?.metrics.deepDeferred || 0;
  const dailyBriefPaperIds = new Set(monitor?.dailyBrief?.paperIds || []);
  const additionalTodayPapers = rankedMonitorPapers.filter((paper) => !dailyBriefPaperIds.has(paper.id)).slice(0, 6);
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
  const explicitPreferenceSignals = useMemo(() => (monitor?.preferenceSignals || []).filter((signal) => signal.layer === "explicit"), [monitor?.preferenceSignals]);
  const inferredPreferenceSignals = useMemo(() => (monitor?.preferenceSignals || []).filter((signal) => signal.layer === "inferred"), [monitor?.preferenceSignals]);
  const paperStateByCanonicalId = useMemo(() => {
    const states: Record<string, MonitorPaper["userState"]> = {};
    for (const paper of historyPapers) if (paper.doi) states["doi:" + paper.doi.trim().toLocaleLowerCase()] = paper.userState;
    return states;
  }, [historyPapers]);
  const networkPaperNodes = useMemo(() => buildNetworkPaperNodes(researchMap), [researchMap]);
  const directionOverviewTrack = useMemo(() => researchMap.tracks.find((track) => track.id === directionOverviewId)
    || researchMap.tracks.find((track) => track.userRole === "core") || researchMap.tracks[0] || null, [researchMap.tracks, directionOverviewId]);
  const directionOverviewRelations = useMemo(() => {
    if (!directionOverviewTrack) return [];
    const trackById = new Map(researchMap.tracks.map((track) => [track.id, track]));
    const relations: Array<{ edge: ResearchMapState["edges"][number]; source: ResearchTrack; target: ResearchTrack; other: ResearchTrack }> = [];
    for (const edge of researchMap.edges) {
      if (edge.sourceTrackId !== directionOverviewTrack.id && edge.targetTrackId !== directionOverviewTrack.id) continue;
      const source = trackById.get(edge.sourceTrackId);
      const target = trackById.get(edge.targetTrackId);
      if (!source || !target) continue;
      relations.push({ edge, source, target, other: source.id === directionOverviewTrack.id ? target : source });
    }
    return relations.sort((left, right) => right.edge.strength - left.edge.strength).slice(0, 6);
  }, [directionOverviewTrack, researchMap.edges, researchMap.tracks]);
  const researchTracksByRole = useMemo(() => {
    const ranked = [...researchMap.tracks].sort((left, right) => Number(left.monitoringStatus === "paused") - Number(right.monitoringStatus === "paused")
      || right.depthScore - left.depthScore
      || right.recentPaperCount - left.recentPaperCount || right.papers.length - left.papers.length);
    return {
      core: ranked.filter((track) => track.userRole === "core"),
      support: ranked.filter((track) => track.userRole === "support"),
      explore: ranked.filter((track) => track.userRole === "explore"),
    } satisfies Record<ResearchDirectionRole, ResearchTrack[]>;
  }, [researchMap.tracks]);
  const routePortfolio = researchMap.routePortfolio;
  const routeQualityBacklogCount = routePortfolio.queuedCount + routePortfolio.reviewingCount;
  const monitorReadyLabel = routeQualityBacklogCount > 0
    ? (locale === "zh"
      ? `来源扫描已完成 · ${routeQualityBacklogCount} 篇路线候选等待或正在质量评估`
      : `Source scan complete · ${routeQualityBacklogCount} route candidates awaiting or in quality review`)
    : (locale === "zh" ? "今日扫描与当前质量队列已完成" : "Today's scan and current quality queue are complete");
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
  const selectedModeNetworkRelations = useMemo(() => selectedNetworkRelations.filter((edge) => paperNetworkMode === "citations"
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
        ? (locale === "zh" ? "共同领域" : "Shared territory")
        : multiOriginIntent === "bridge" ? (locale === "zh" ? "跨域桥接" : "Cross-domain bridges") : (locale === "zh" ? "并集比较" : "Union comparison"),
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

  async function expandResearchNetwork(originCanonicalIds = effectiveNetworkOriginNodes.map((node) => node.paper.canonicalId), force = false) {
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
    setPaperNetworkMode("similarity");
    setPaperDiscoveryTab("similar");
    setPaperNetworkOriginCanonicalIds(origins);
    setPaperNetworkScope(origins.length >= 2 ? "multi-seed" : "all");
    try {
      const response = await fetch("/api/research-network", {
        method: "POST",
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
  }, [effectiveNetworkOriginNodes, explicitNetworkOriginNodes, paperNetworkScope]);

  useEffect(() => {
    ensureAnonymousWorkspace();
    const hydrationTimer = window.setTimeout(() => {
      const savedLocale = window.localStorage.getItem("pi-locale");
      if (savedLocale === "en" || savedLocale === "zh") setLocale(savedLocale);
      const savedSpace = window.localStorage.getItem("pi-active-space");
      if (savedSpace) setActiveSpaceId(savedSpace);
    }, 0);

    fetch("/api/spaces")
      .then(async (response) => {
        if (!response.ok) throw new Error("spaces unavailable");
        return response.json() as Promise<{
          spaces?: Space[];
          modelConfigured?: boolean;
          model?: string | null;
          modelCredentialSource?: "browser" | "server" | null;
        }>;
      })
      .then((data) => {
        if (data.spaces?.length) {
          setSpaces(data.spaces);
          const savedSpace = window.localStorage.getItem("pi-active-space");
          if (!savedSpace || !data.spaces.some((space) => space.id === savedSpace)) {
            setActiveSpaceId(data.spaces[0].id);
          }
        }
        const credentialPresent = Boolean(data.modelConfigured);
        setModelConnectionState(credentialPresent ? "checking" : "unconfigured");
        setConnectedModel(data.model || null);
        setModelCredentialSource(data.modelCredentialSource || null);
        if (credentialPresent) {
          setCheckingModel(true);
          void fetch("/api/model-settings?verify=1", { cache: "no-store" })
            .then(async (response) => {
              const status = await response.json() as { configured?: boolean; source?: "browser" | "server" | null; model?: string | null; error?: string };
              if (!response.ok || !status.configured) throw new Error(status.error || "model status unavailable");
              setModelConnectionState("connected");
              setConnectedModel(status.model || null);
              setModelCredentialSource(status.source || null);
            })
            .catch((error) => {
              setModelConnectionState(isModelCredentialFailure(error) ? "invalid" : "checking");
            })
            .finally(() => setCheckingModel(false));
        }
      })
      .catch(() => {
        setSpaces(fallbackSpaces);
        setModelConnectionState("checking");
      });

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    window.localStorage.setItem("pi-locale", locale);
  }, [locale]);

  useEffect(() => {
    const mainViews = new Set<View>(["today", "threads", "learn", "library", "memory"]);
    const restoreView = () => {
      const candidate = window.location.hash.slice(1) as View;
      if (mainViews.has(candidate)) setView(candidate);
    };
    restoreView();
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);

  useEffect(() => {
    if (activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    let cancelled = false;
    let stopPolling: () => void = () => undefined;
    const timer = window.setTimeout(() => {
      setMonitor(null);
      setMonitoring(true);
      stopPolling = startMonitorPolling(activeSpace.id, (nextMonitor) => {
        if (!cancelled) setMonitor(nextMonitor);
      });
      fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, trigger: "visit", action: "start" }),
      })
        .then(async (response) => {
          const data = await response.json() as { monitor?: MonitorState; error?: string };
          if (data.monitor && !cancelled) setMonitor(data.monitor);
          if (!response.ok || !data.monitor) throw new Error(data.error || data.monitor?.error || data.monitor?.scanJob?.error || "monitor unavailable");
          if (!data.monitor.throttled && data.monitor.leaseOwner !== false
            && !data.monitor.alreadyRunning && !["ready", "error"].includes(data.monitor.status)) {
            await advanceMonitorPipeline(activeSpace.id, data.monitor, (nextMonitor) => { if (!cancelled) setMonitor(nextMonitor); }, () => cancelled);
          } else if (!data.monitor.throttled && !["ready", "error"].includes(data.monitor.status)) {
            stopPolling();
            await followMonitorPipeline(activeSpace.id, data.monitor, (nextMonitor) => { if (!cancelled) setMonitor(nextMonitor); }, () => cancelled);
          }
        })
        .catch((error) => {
          if (!cancelled) setMonitor((current) => current || {
            status: "error", lastRunAt: null, nextRunAt: null, newCount: 0, scannedCount: 0,
            knownCount: 0, error: monitorErrorText(error) || "unavailable", cadenceHours: 24, source: "Crossref · priority journals · arXiv · OpenAlex · Semantic Scholar · citation frontier",
            horizons: ["days", "months", "years"], papers: [],
          });
        })
        .finally(() => {
          stopPolling();
          if (!cancelled) setMonitoring(false);
        });
    }, 0);
    return () => { cancelled = true; stopPolling(); window.clearTimeout(timer); };
  }, [activeSpace.id]);

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
    const update = () => setScanElapsedSeconds(Math.max(1, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
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
    const outdated = researchMap.paperNetwork.model !== "deepseek-v4-pro+coupling-v2";
    if (researchMapMode !== "papers" || researchMap.paperNetwork.paperCount < 2
      || paperNetworkLoading || (!stale && !outdated && !["idle", "building"].includes(researchMap.paperNetwork.status))) return;
    const spaceId = activeSpace.id;
    const attemptKey = `${spaceId}:${researchMap.paperNetwork.paperRevision || researchMap.paperNetwork.paperCount}:deepseek-v4-pro+coupling-v2`;
    if (paperNetworkAutoAttemptRef.current.has(attemptKey)) return;
    paperNetworkAutoAttemptRef.current.add(attemptKey);
    const resumePi = researchMap.paperNetwork.status === "building"
      && researchMap.paperNetwork.sources.some((source) => source.startsWith("semantic-scholar"));
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
        setPaperNetworkBuildPhase("pi");
        const curated = await requestPaperNetworkBuildPhase(spaceId, "pi", false);
        if (paperNetworkSpaceRef.current === spaceId) setResearchMap(curated);
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
    if (view !== "thread-detail" || researchRouteTab !== "assessment" || !selectedThread
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
    if (view !== "thread-detail" || researchRouteTab !== "problem" || !selectedThread
      || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    let cancelled = false;
    const spaceId = activeSpace.id;
    const trackId = selectedThread.id;
    const run = async () => {
      setResearchProblemState(null);
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
          setLearningState({ path: null, suggestedTarget: "", availablePaperCount: 0, waitingQualityCount: 0, model: "deepseek-v4-pro" });
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
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
  }, []);

  const navigate = (next: View) => {
    const hash = next === "paper-detail" ? "paper" : next === "thread-detail" ? "thread" : next;
    if (window.location.hash !== "#" + hash) window.history.pushState({ piView: next }, "", "#" + hash);
    setView(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const switchSpace = (space: Space) => {
    paperNetworkSpaceRef.current = space.id;
    learningRequestRef.current += 1;
    resetResearchNetworkExpansion([], space.id);
    setActiveSpaceId(space.id);
    // Fail closed at the workspace boundary. If the target workspace cannot be
    // loaded or initialized, no route, synthesis, or problem from the previous
    // workspace may remain visible.
    setMonitor(null);
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
    setResearchRouteTab("problem");
    setDirectionRelationFocusId(null);
    setDirectionPinnedRelationId(null);
    setPaperNetworkLoading(false);
    setPaperNetworkBuildPhase(null);
    setSelectedNetworkPaperId(null);
    setHoveredNetworkPaperId(null);
    setPaperNetworkScope("all");
    setPaperDiscoveryTab("similar");
    setMultiOriginIntent("shared");
    setPaperNetworkTrackId("all");
    setPaperNetworkOriginCanonicalIds([]);
    setDirectionOverviewId(null);
    setLearningState({ path: null, suggestedTarget: "", availablePaperCount: 0, waitingQualityCount: 0, model: "deepseek-v4-pro" });
    setLearningTarget("");
    setLearningTargetTrackId(null);
    setLearningScopeDirty(false);
    learningIntentRef.current = null;
    setLearningLoadedSpaceId(null);
    setLearningError("");
    setLearningLoading(false);
    setLearningAction(null);
    window.localStorage.setItem("pi-active-space", space.id);
    setSpaceDialog(false);
    navigate("today");
    setAnswer("");
    setAnswerModel(null);
    setQuestion("");
    setSelectedMonitorPaper(null);
  };

  const submitSpace = async (event: FormEvent) => {
    event.preventDefault();
    if (!newSpace.name.trim()) return;
    setCreatingSpace(true);
    try {
      const response = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newSpace, preferredLocale: locale }),
      });
      if (!response.ok) throw new Error("create failed");
      const data = await response.json() as { space: Space };
      setSpaces((current) => [...current, data.space]);
      setNewSpace({ name: "", memberName: "", description: "" });
      switchSpace(data.space);
    } catch {
      const localSpace: Space = {
        id: "local-" + crypto.randomUUID(),
        name: newSpace.name,
        memberName: newSpace.memberName || user.displayName,
        description: newSpace.description,
        accent: "plum",
      };
      setSpaces((current) => [...current, localSpace]);
      setNewSpace({ name: "", memberName: "", description: "" });
      switchSpace(localSpace);
    } finally {
      setCreatingSpace(false);
    }
  };

  const submitQuestion = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer("");
    setAnswerMode(null);
    setAnswerModel(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, question, locale }),
      });
      const data = await response.json() as { answer?: string; mode?: "deepseek" | "preview"; model?: string | null; error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error || "ask failed");
      setAnswer(data.answer);
      setAnswerMode(data.mode || "preview");
      setAnswerModel(data.model || null);
      if (data.mode === "deepseek") {
        setModelConnectionState("connected");
        setConnectedModel(data.model || connectedModel);
      }
    } catch {
      setAnswer(locale === "zh" ? "暂时无法连接 Pi。你的问题仍停留在当前研究空间，没有写入其他方向。" : "Pi could not connect just now. Your question remains scoped to this research space and was not written into any other direction.");
      setAnswerMode("preview");
    } finally {
      setAsking(false);
    }
  };

  const runManualMonitor = async () => {
    if (monitoring || manualCooldownBlocked) return;
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
        setModelConnectionState("invalid");
        setModelSettingsError(message);
        setModelSettingsOpen(true);
      }
    };
    try {
      const response = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, force: true, trigger: "manual", action: "start" }),
      });
      const data = await response.json().catch(() => ({})) as { monitor?: MonitorState; error?: string };
      if (data.monitor) setMonitor(data.monitor);
      if (!response.ok || !data.monitor) throw new Error(data.error || data.monitor?.error || data.monitor?.scanJob?.error || "scan unavailable");
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
    setVenueDraft((monitor?.preferences?.priorityVenues || []).join("\n"));
    setAuthorDraft((monitor?.preferences?.trackedAuthors || []).join("\n"));
    setExplorationDraft(monitor?.preferences?.explorationMode || "balanced");
    setSourceSettingsOpen(true);
  };

  const saveSourceSettings = async (reset = false) => {
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
        body: JSON.stringify({ spaceId: activeSpace.id, priorityVenues, trackedAuthors, explorationMode: explorationDraft, reset }),
      });
      const data = await response.json() as { monitor?: MonitorState };
      if (!response.ok || !data.monitor) throw new Error("preference update failed");
      setMonitor(data.monitor);
      setVenueDraft((data.monitor.preferences?.priorityVenues || []).join("\n"));
      setAuthorDraft((data.monitor.preferences?.trackedAuthors || []).join("\n"));
      setSourceSettingsOpen(false);
      setToast(t.sourcesSaved);
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
    } finally {
      stopPolling?.();
      setMonitoring(false);
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
    if (target === "library") { setLibraryFilter("inbox"); setLibraryStageFilter("all"); setInboxFilter("all"); }
    navigate(target);
  };

  const saveFeedback = (paper: MonitorPaper, kind: "save" | "relevant" | "not_relevant" | "later", reasonCode?: string, note = "") => {
    const spaceId = activeSpace.id;
    const key = spaceId + ":" + paper.id;
    const currentSaved = saved[key] ?? paper.saved;
    const value = kind === "save" ? !currentSaved : true;
    const nextState: MonitorPaper["userState"] = kind === "not_relevant" ? "dismissed"
      : kind === "later" ? "snoozed"
        : kind === "save" && !value ? paper.feedback === "relevant" ? "accepted" : "seen" : "accepted";
    if (kind === "save") setSaved((current) => ({ ...current, [key]: value }));
    if (kind === "not_relevant") setSaved((current) => ({ ...current, [key]: false }));
    setMonitor((current) => {
      if (!current) return current;
      const updatePaper = (item: MonitorPaper): MonitorPaper => item.id !== paper.id ? item : {
        ...item,
        userState: nextState,
        readingStatus: reasonCode === "duplicate_known" ? "mastered" : item.readingStatus,
        saved: kind === "not_relevant" ? false : kind === "save" ? value : item.saved,
        feedback: kind === "relevant" ? "relevant" : kind === "not_relevant" ? "not_relevant" : item.feedback,
        snoozedUntil: kind === "later" ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() : null,
      };
      const historyPapers = (current.historyPapers || current.papers).map(updatePaper);
      return {
        ...current,
        papers: ["accepted", "dismissed", "snoozed"].includes(nextState) ? current.papers.filter((item) => item.id !== paper.id) : current.papers.map(updatePaper),
        historyPapers,
        historyCounts: historyCountsFor(historyPapers),
      };
    });
    setToast(feedbackEffectCopy(kind, value, reasonCode, locale));
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
        const authoritativeEffect = locale === "zh" ? result.effect?.zh : result.effect?.en;
        if (authoritativeEffect) setToast(authoritativeEffect);
        if (result.routeEvidence?.changed) {
          const refreshedMap = await readResearchMapState(spaceId).catch(() => null);
          if (refreshedMap && paperNetworkSpaceRef.current === spaceId) {
            setResearchMap(refreshedMap);
            setSelectedThread((current) => refreshedMap.tracks.find((track) => track.id === current?.id)
              || refreshedMap.tracks.find((track) => track.id === result.routeEvidence?.trackId)
              || refreshedMap.tracks[0] || null);
          }
        }
        if (reasonCode) {
          const refreshed = await fetch(`/api/monitor?spaceId=${encodeURIComponent(spaceId)}`).catch(() => null);
          const data = refreshed?.ok ? await refreshed.json() as { monitor?: MonitorState } : null;
          if (data?.monitor && paperNetworkSpaceRef.current === spaceId) setMonitor(data.monitor);
        }
      } catch {
        setToast(locale === "zh" ? "反馈保存失败，已恢复服务器中的真实状态" : "Feedback could not be saved; restoring server state");
        const refreshed = await fetch(`/api/monitor?spaceId=${encodeURIComponent(spaceId)}`).catch(() => null);
        const data = refreshed?.ok ? await refreshed.json() as { monitor?: MonitorState } : null;
        if (data?.monitor && paperNetworkSpaceRef.current === spaceId) setMonitor(data.monitor);
      }
    })();
  };

  const requestPaperDecision = (paper: MonitorPaper, kind: "relevant" | "not_relevant") => {
    setFeedbackNote("");
    setFeedbackPrompt({ paper, kind });
  };

  const chooseFeedbackReason = (reasonCode: string) => {
    if (!feedbackPrompt) return;
    saveFeedback(feedbackPrompt.paper, feedbackPrompt.kind, reasonCode, feedbackNote);
    setFeedbackPrompt(null);
    setFeedbackNote("");
  };

  const dismissInferredSignal = (signalId: string) => {
    setMonitor((current) => current ? { ...current, preferenceSignals: (current.preferenceSignals || []).filter((signal) => signal.id !== signalId) } : current);
    fetch("/api/preference-signals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId: activeSpace.id, signalId, active: false }),
    }).catch(() => undefined);
    setToast(locale === "zh" ? "已停止使用这条推断" : "This inference will no longer be used");
  };

  const returnPaperToInbox = (paper: MonitorPaper) => {
    const kind = paper.userState === "dismissed" ? "not_relevant" : paper.feedback === "relevant" ? "relevant" : "save";
    setMonitor((current) => {
      if (!current) return current;
      const updatePaper = (item: MonitorPaper): MonitorPaper => item.id === paper.id ? {
        ...item,
        userState: "seen",
        saved: kind === "save" ? false : item.saved,
        feedback: null,
        snoozedUntil: null,
      } : item;
      const historyPapers = (current.historyPapers || current.papers).map(updatePaper);
      return { ...current, historyPapers, historyCounts: historyCountsFor(historyPapers) };
    });
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId: activeSpace.id, paperId: paper.id, kind, value: false }),
    }).catch(() => undefined);
    setToast(t.returnPending);
  };

  const updateReadingProgress = async (paper: MonitorPaper, status: MonitorPaper["readingStatus"], note = paper.readingNote || "", analyze = false) => {
    const updatePaper = (item: MonitorPaper): MonitorPaper => item.id === paper.id ? { ...item, readingStatus: status, readingNote: note } : item;
    setSelectedMonitorPaper((current) => current?.id === paper.id ? updatePaper(current) : current);
    setMonitor((current) => {
      if (!current) return current;
      const papers = current.papers.map(updatePaper);
      const historyPapers = (current.historyPapers || current.papers).map(updatePaper);
      return { ...current, papers, historyPapers, historyCounts: historyCountsFor(historyPapers) };
    });
    if (analyze) setReadingMemoryAnalyzing(true);
    try {
      const response = await fetch("/api/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, paperId: paper.id, status, note, analyze }),
      });
      if (!response.ok) throw new Error("reading progress update failed");
      const result = await response.json() as { memoryAnalysis?: { status?: string } | null };
      if (analyze) {
        const refreshed = await fetch(`/api/monitor?spaceId=${encodeURIComponent(activeSpace.id)}`);
        const data = refreshed.ok ? await refreshed.json() as { monitor?: MonitorState } : null;
        if (data?.monitor) setMonitor(data.monitor);
        setToast(result.memoryAnalysis?.status === "ready"
          ? (locale === "zh" ? "阅读笔记已由 Pi 沉淀到研究记忆" : "Pi added this note to research memory")
          : result.memoryAnalysis?.status === "needs_more_context"
            ? (locale === "zh" ? "笔记已保存；再写具体一些后即可让 Pi 沉淀" : "Note saved; add more detail for Pi to synthesize it")
            : (locale === "zh" ? "笔记已保存，智能沉淀暂未完成" : "Note saved; memory synthesis is pending"));
      } else {
        setToast(locale === "zh" ? `阅读状态已更新为“${readingStatusLabel(status, locale)}”` : `Reading status updated to ${readingStatusLabel(status, locale)}`);
      }
    } catch {
      const response = await fetch(`/api/monitor?spaceId=${encodeURIComponent(activeSpace.id)}`).catch(() => null);
      const data = response?.ok ? await response.json() as { monitor?: MonitorState } : null;
      if (data?.monitor) setMonitor(data.monitor);
      setToast(locale === "zh" ? "阅读状态保存失败，请重试" : "Could not save reading status");
    } finally {
      if (analyze) setReadingMemoryAnalyzing(false);
    }
  };

  const openMonitorPaper = (paper: MonitorPaper) => {
    const openedPaper = { ...paper, openedAt: new Date().toISOString(), userState: paper.userState === "unseen" ? "seen" as const : paper.userState };
    setPaperReturnView(view === "library" ? "library" : "today");
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
        context: view === "library" ? "library" : "today",
      }),
    }).catch(() => undefined);
    navigate("paper-detail");
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

  const removeProfileItem = (key: "subdirections" | "interests" | "knowledge" | "openQuestions" | "exclusions", index: number) => {
    editImportAnalysis((analysis) => ({ ...analysis, [key]: analysis[key].filter((_, itemIndex) => itemIndex !== index) }));
  };

  const removeOpportunity = (index: number) => {
    editImportAnalysis((analysis) => ({ ...analysis, researchOpportunities: analysis.researchOpportunities.filter((_, itemIndex) => itemIndex !== index) }));
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
    recordPaperEngagement(paper, "ask_pi", { context: "paper_detail" });
    setQuestion(locale === "zh" ? `请结合当前研究空间分析这篇论文：${paper.title}` : `Analyze this paper in the context of the current research space: ${paper.title}`);
    setAskOpen(true);
  };

  const openThread = (thread: ResearchTrack, tab: ResearchRouteTab = "problem") => {
    setSelectedThread(thread);
    setResearchRouteTab(tab);
    navigate("thread-detail");
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

  const refreshPaperNetwork = async (refreshMode: "all" | "verified" | "pi" = "all") => {
    if (paperNetworkLoading || researchMap.paperNetwork.paperCount < 2) return;
    const spaceId = activeSpace.id;
    paperNetworkAutoAttemptRef.current.add(`${spaceId}:${researchMap.paperNetwork.paperRevision || researchMap.paperNetwork.paperCount}:deepseek-v4-pro+coupling-v2`);
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
    setQuestion(locale === "zh"
      ? `请结合当前研究空间，解释《${node.paper.title}》在“${node.track.titleZh}”发展路线中的位置，以及它与前后代表论文的关键关系。`
      : `Explain where “${node.paper.title}” sits in the “${node.track.titleEn}” development route and its key relationships to representative work before and after it.`);
    setAskOpen(true);
  };

  const askAboutResearchRoute = (thread: ResearchTrack, focus: "assessment" | "gap" | "agenda" = "assessment") => {
    const title = locale === "zh" ? thread.titleZh : thread.titleEn;
    const focusPrompt = focus === "gap"
      ? (locale === "zh" ? `请基于当前真实论文，分析“${title}”的证据缺口，解释还缺什么证据，并给出下一步可核验的检索和阅读建议。` : `Using the current real papers, analyze the evidence gap in “${title}” and propose a verifiable next search and reading plan.`)
      : focus === "agenda"
        ? (locale === "zh" ? `请把“${title}”当前的关键机会、观察信号和证据缺口拆成一个可执行的研究议程，并明确每一步应核对哪些论文证据。` : `Turn the current opportunity, watch signal, and evidence gap for “${title}” into an actionable research agenda with paper evidence to verify at every step.`)
        : (locale === "zh" ? `请基于“${title}”路线中的真实论文解释当前判断、关键机会和主要不确定性，并明确区分用户确认纳入的论文、Pi 策展材料与已完成书目和摘要证据核对的推荐。` : `Explain the current assessment, key opportunity, and main uncertainty for “${title}” using its real papers, separating user-confirmed route papers, Pi-curated material, and recommendations that passed bibliographic and abstract evidence checks.`);
    setQuestion(focusPrompt);
    setAskOpen(true);
  };

  const askAboutRoutePaper = (thread: ResearchTrack, paper: ResearchTrackPaper) => {
    setQuestion(locale === "zh"
      ? `请结合“${thread.titleZh}”这条研究路线，解释《${paper.title}》为什么位于“${researchRoleLabel(paper.role, locale)}”阶段，它支撑了什么判断，还留下了什么问题。`
      : `In the “${thread.titleEn}” route, explain why “${paper.title}” belongs to the ${researchRoleLabel(paper.role, locale)} stage, what assessment it supports, and what questions remain.`);
    setAskOpen(true);
  };

  const openRouteLearningPath = (thread: ResearchTrack) => {
    const target = locale === "zh" ? thread.titleZh : thread.titleEn;
    learningIntentRef.current = { spaceId: activeSpace.id, trackId: thread.id, target };
    setLearningTarget(target);
    setLearningTargetTrackId(thread.id);
    setLearningScopeDirty(false);
    navigate("learn");
  };

  const addNetworkPaperToLearningPath = (node: NetworkPaperNode) => {
    const target = locale === "zh" ? node.track.titleZh : node.track.titleEn;
    learningIntentRef.current = { spaceId: activeSpace.id, trackId: node.track.id, target };
    setLearningTarget(target);
    setLearningTargetTrackId(node.track.id);
    setLearningScopeDirty(false);
    setSelectedNetworkPaperId(null);
    navigate("learn");
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

  const generateLearningPath = async (targetOverride?: string, trackIdOverride: string | null | undefined = undefined) => {
    const target = targetOverride?.trim() || learningTarget.trim();
    if (learningAction || !target || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    const spaceId = activeSpace.id;
    const targetTrackId = trackIdOverride === undefined ? learningTargetTrackId : trackIdOverride;
    const requestId = ++learningRequestRef.current;
    setLearningAction("generate");
    setLearningError("");
    try {
      const response = await fetch("/api/learning-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, target, trackId: targetTrackId }),
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
      setToast(locale === "zh" ? `已用 ${data.availablePaperCount} 篇真实论文构建学习路径` : `Built from ${data.availablePaperCount} real papers`);
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

  const navItems: Array<{ id: View; label: string; mark: string }> = [
    { id: "today", label: t.today, mark: "01" },
    { id: "threads", label: t.threads, mark: "02" },
    { id: "learn", label: t.learn, mark: "03" },
    { id: "library", label: t.library, mark: "04" },
    { id: "memory", label: t.memory, mark: "05" },
  ];
  const activeNav = view === "paper-detail" ? paperReturnView : view === "thread-detail" ? "threads" : view;
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
      const response = await fetch("/api/model-settings?verify=1", { cache: "no-store" });
      const data = await response.json() as { configured?: boolean; source?: "browser" | "server" | null; model?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "model status unavailable");
      setModelConnectionState(data.configured ? "connected" : "unconfigured");
      setConnectedModel(data.model || null);
      setModelCredentialSource(data.source || null);
      setToast(data.configured
        ? (locale === "zh" ? "DeepSeek Pro 已连接" : "DeepSeek Pro is connected")
        : (locale === "zh" ? "当前浏览器还没有可用的 API Key" : "This browser does not have a usable API key yet"));
    } catch (error) {
      const message = monitorFailureMessage(error, locale);
      setModelConnectionState(isModelCredentialFailure(error) ? "invalid" : "checking");
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
      const response = await fetch("/api/model-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await response.json() as { configured?: boolean; source?: "browser" | "server" | null; model?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "DeepSeek connection failed");
      setModelConnectionState("connected");
      setConnectedModel(data.model || "deepseek-v4-pro");
      setModelCredentialSource("browser");
      setModelApiKey("");
      setShowModelApiKey(false);
      setToast(locale === "zh" ? "API Key 已验证并保存到当前浏览器" : "The API key was verified and saved in this browser");
    } catch (error) {
      setModelConnectionState(isModelCredentialFailure(error) ? "invalid" : "checking");
      setModelSettingsError(monitorFailureMessage(error, locale));
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
      const response = await fetch("/api/model-settings", { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not remove the key");
      setModelApiKey("");
      setShowModelApiKey(false);
      const statusResponse = await fetch("/api/model-settings?verify=1", { cache: "no-store" });
      const status = await statusResponse.json() as { configured?: boolean; source?: "browser" | "server" | null; model?: string | null };
      setModelConnectionState(status.configured ? "connected" : "unconfigured");
      setConnectedModel(status.model || null);
      setModelCredentialSource(status.source || null);
      setToast(locale === "zh" ? "当前浏览器保存的 API Key 已删除" : "The browser-stored API key was removed");
    } catch (error) {
      setModelConnectionState(isModelCredentialFailure(error) ? "invalid" : "checking");
      setModelSettingsError(error instanceof Error ? error.message : (locale === "zh" ? "暂时无法删除 API Key" : "Could not remove the API key"));
    } finally {
      setCheckingModel(false);
    }
  };

  const modelConnectionCopy = modelConnectionState === "connected"
    ? { title: t.connected, detail: modelDisplayName(connectedModel), modal: locale === "zh" ? "已验证" : "Verified" }
    : modelConnectionState === "checking"
      ? { title: locale === "zh" ? "AI 模型待检测" : "AI model check pending", detail: checkingModel ? (locale === "zh" ? "正在验证当前 Key" : "Verifying the current key") : (locale === "zh" ? "正在确认连接可用性" : "Confirming availability"), modal: checkingModel ? (locale === "zh" ? "检测中" : "Checking") : (locale === "zh" ? "待检测" : "Check pending") }
      : modelConnectionState === "invalid"
        ? { title: locale === "zh" ? "AI 模型连接失效" : "AI model connection expired", detail: locale === "zh" ? "打开更换或重新检测" : "Open to replace or check", modal: locale === "zh" ? "已失效" : "Invalid" }
        : { title: t.setupRequired, detail: locale === "zh" ? "打开配置" : "Open setup", modal: locale === "zh" ? "尚未连接" : "Not connected" };
  const credentialFailureRecovered = Boolean(modelConnectionState === "connected" && monitor?.status === "error" && isModelCredentialFailure(failedScanError));
  const closeModelSettings = () => {
    setModelSettingsOpen(false);
    setModelApiKey("");
    setModelSettingsError("");
    setShowModelApiKey(false);
  };
  const resumeAfterModelConnection = () => {
    closeModelSettings();
    window.setTimeout(() => void runManualMonitor(), 0);
  };
  const handleRouteAttention = () => {
    if (!routeAttention || !routeAttentionTrack) return;
    if (["today", "confirm_evidence"].includes(routeAttention.kind)) navigate("today");
    else if (routeAttention.kind === "evidence_gap") openThread(routeAttentionTrack, "gaps");
    else if (routeAttention.kind === "quality_review") openThread(routeAttentionTrack);
    else void expandResearchTrack(routeAttentionTrack);
  };

  return (
    <div className="v2-app">
      <aside className={"v2-sidebar " + (mobileNav ? "open" : "")}>
        <div className="v2-logo"><span className="v2-product-mark"><Image src="/pi-research-mark.png" width={38} height={32} alt="Pi Research logo" priority /></span><div><strong>Pi Research</strong><small>RESEARCH AGENT</small></div><button type="button" aria-label={t.close} onClick={() => setMobileNav(false)}>×</button></div>
        <button className="v2-space-switch" type="button" onClick={() => setSpaceDialog(true)}>
          <span className={"v2-space-avatar " + activeSpace.accent}>{initials(activeSpace.name)}</span>
          <span><small>{t.currentSpace}</small><strong>{defaultSpaceName(activeSpace.name, locale)}</strong><em>{activeSpace.memberName}</em></span>
          <b>⌄</b>
        </button>
        <nav className="v2-nav" aria-label="Primary navigation">
          <p>{t.researchRadar}</p>
          {navItems.slice(0, 2).map((item) => (
            <button type="button" key={item.id} className={activeNav === item.id ? "active" : ""} aria-current={activeNav === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>
              <span>{item.mark}</span>{item.label}{item.id === "today" && Boolean(todayNavigationCount) && <b>{Math.min(99, todayNavigationCount)}</b>}
            </button>
          ))}
          <p>{t.knowledge}</p>
          {navItems.slice(2).map((item) => (
            <button type="button" key={item.id} className={activeNav === item.id ? "active" : ""} aria-current={activeNav === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>
              <span>{item.mark}</span>{item.label}{item.id === "library" && Boolean(historyPapers.length) && <b title={locale === "zh" ? `${historyPapers.length} 篇已保存论文` : `${historyPapers.length} saved papers`}>{compactNavCount(historyPapers.length)}</b>}
            </button>
          ))}
        </nav>

        <div className="v2-sidebar-bottom">
          <Link className="v2-demo-entry" href="/demo"><span>◌</span><strong>{locale === "zh" ? "查看演示空间" : "View demo workspace"}</strong><b>↗</b></Link>
          <button className={`v2-openai-state ${modelConnectionState}`} type="button" onClick={() => setModelSettingsOpen(true)} aria-label={locale === "zh" ? "打开 AI 模型设置" : "Open AI model settings"}><i /><span><strong>{modelConnectionCopy.title}</strong><small>{modelConnectionCopy.detail}</small></span><b>›</b></button>
          <button className="v2-account" type="button" onClick={() => navigate("memory")}><span>◎</span><span><strong>Pi Workspace</strong><small>{t.workspaceLabel}</small></span><b>•••</b></button>
        </div>
      </aside>

      <div className="v2-main">
        <header className="v2-topbar">
          <button className="v2-mobile-menu" type="button" aria-label="Menu" onClick={() => setMobileNav(true)}>≡</button>
          <div className="v2-breadcrumb"><span>{defaultSpaceName(activeSpace.name, locale)}</span><b>/</b><strong>{navItems.find((item) => item.id === activeNav)?.label}</strong></div>
          <button className="v2-ask-trigger v2-command-trigger" type="button" aria-label={t.askPi} onClick={() => setAskOpen(true)}><span className="v2-command-mark" aria-hidden="true"><Image src="/pi-research-mark.png" width={31} height={27} alt="" priority /></span><span className="v2-command-copy"><strong>{t.askPi}</strong></span><kbd>⌘ K</kbd></button>
          <div className="v2-top-actions">
            {pendingActionNotifications.length > 0 && <button className="v2-alert-link" type="button" onClick={() => { navigate("today"); setNotificationsExpanded(false); window.setTimeout(() => document.querySelector(".v2-action-inbox")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}><span>{locale === "zh" ? "研究提醒" : "Alerts"}</span><b>{Math.min(99, pendingActionNotifications.length)}</b></button>}
            <div className="v2-language"><button className={locale === "zh" ? "active" : ""} type="button" onClick={() => setLocale("zh")}>中</button><button className={locale === "en" ? "active" : ""} type="button" onClick={() => setLocale("en")}>EN</button></div>
          </div>
        </header>

        {view === "today" && (
          <main className="v2-page v2-today">
            <section className="v2-today-hero">
              <div className="v2-today-hero-copy"><p className="v2-kicker">{formatTodayDate(locale)}</p><h1>{locale === "zh" ? "今天先处理什么" : "What to handle today"}</h1></div>
              <div className="v2-today-hero-actions status-only"><span className={"v2-monitor-status " + (scanIsActive ? "scanning" : monitor?.status || "idle")}><i />{scanIsActive ? scanPhase : monitor?.status === "ready" ? monitorReadyLabel : monitor?.status === "error" ? t.scanError : t.neverScanned}</span></div>
              <section className="v2-today-briefing" aria-label={locale === "zh" ? "今日科研简报" : "Today's research briefing"}>
                <button type="button" onClick={() => rankedMonitorPapers[0] && openMonitorPaper(rankedMonitorPapers[0])} disabled={!rankedMonitorPapers.length}><span>01</span><strong>{mustReadCount}</strong><div><b>{locale === "zh" ? "今日必读" : "Must read"}</b></div><i>→</i></button>
                <button type="button" onClick={() => navigate("threads")}><span>02</span><strong>{monitor ? monitor.mapChanges?.length || 0 : "—"}</strong><div><b>{locale === "zh" ? "路线变化" : "Route changes"}</b></div><i>→</i></button>
                <button type="button" onClick={() => { setLibraryFilter("accepted"); setLibraryStageFilter("all"); navigate("library"); }}><span>03</span><strong>{activeReadingCount}</strong><div><b>{locale === "zh" ? "待读与在读" : "Reading queue"}</b></div><i>→</i></button>
              </section>
            </section>

            {monitor?.dailyBrief && <section className={`v2-ai-daily-brief ${monitor.dailyBrief.status}`}>
              <div className="v2-daily-brief-lead">
                <header><p className="v2-kicker">π {monitor.dailyBrief.isCurrent ? (locale === "zh" ? "今日研究判断" : "TODAY'S RESEARCH JUDGMENT") : (locale === "zh" ? "最近一次研究判断" : "LATEST RESEARCH JUDGMENT")}</p><span>{monitor.dailyBrief.date} · {monitor.dailyBrief.model === "evidence-summary" ? (locale === "zh" ? "可核验证据简报" : "Evidence-first brief") : monitor.dailyBrief.status === "degraded" ? (locale === "zh" ? "证据摘要" : "Evidence summary") : modelDisplayName(monitor.dailyBrief.model)}</span></header>
                <h2>{locale === "zh" ? monitor.dailyBrief.headlineZh : monitor.dailyBrief.headlineEn}</h2>
                {!monitor.dailyBrief.isCurrent && <p className="v2-daily-brief-stale">{locale === "zh" ? `这是 ${monitor.dailyBrief.date} 的最近一次简报，不计入当前“今日必读”数量。上方今日计数只反映今天仍可处理的正式推荐。` : `This is the latest brief from ${monitor.dailyBrief.date}; it is not included in the current Today's picks count. The count above reflects only formal recommendations still actionable today.`}</p>}
                <p className="v2-daily-brief-overview">{locale === "zh" ? monitor.dailyBrief.overviewZh : monitor.dailyBrief.overviewEn}</p>
                <dl className="v2-daily-brief-metrics"><div><dt>{locale === "zh" ? "候选" : "Candidates"}</dt><dd>{monitor.dailyBrief.metrics.scanned || 0}</dd></div><div><dt>{locale === "zh" ? "快速筛选" : "Screened"}</dt><dd>{latestQuickScreenedCount}</dd></div><div><dt>{locale === "zh" ? "深度解读" : "Deep review"}</dt><dd>{latestDeepReviewedCount}</dd></div><div><dt>{locale === "zh" ? "入选" : "Selected"}</dt><dd>{monitor.dailyBrief.metrics.recommended || 0}</dd></div></dl>
                {Boolean(dailyBriefPapers.length) && <footer><button type="button" onClick={() => openMonitorPaper(dailyBriefPapers[0])}>{locale === "zh" ? "从第一篇开始" : "Start with the first paper"} →</button><button className="secondary" type="button" onClick={() => shareSnapshot("daily", dailyBriefPapers)} disabled={Boolean(sharingSnapshot)}>↗ {sharingSnapshot === "daily" ? t.creatingShare : t.shareDaily}</button></footer>}
              </div>
              <div className="v2-daily-paper-queue">
                <header><div><strong>{monitor.dailyBrief.isCurrent ? (locale === "zh" ? "今日阅读队列" : "Today's reading queue") : (locale === "zh" ? `${monitor.dailyBrief.date} 阅读队列` : `${monitor.dailyBrief.date} reading queue`)}</strong><small>{locale === "zh" ? "先看书目信息，点击后再展开解读" : "Review the record first, then expand the interpretation"}</small></div><span>{dailyBriefEntryCount} {locale === "zh" ? "篇" : "papers"}</span></header>
                {Boolean(dailyBriefPapers.length) && <div className="v2-daily-freshness-summary"><span className="days">{locale === "zh" ? "近 14 天新论文" : "New · 14 days"} <b>{dailyFreshnessCounts.days}</b></span><span className="months">{locale === "zh" ? "近期优质" : "Recent quality"} <b>{dailyFreshnessCounts.months}</b></span><span className="years">{locale === "zh" ? "核心补读" : "Core catch-up"} <b>{dailyFreshnessCounts.years}</b></span></div>}
                <div className="v2-daily-brief-list">
                  {Array.from({ length: dailyBriefEntryCount }, (_, index) => {
                    const paper = dailyBriefPapers[index];
                    const signal = dailySignals[index];
                    const readingAction = dailyReadingPlan[index];
                    return <details key={paper?.id || `${index}:${signal || readingAction}`}>
                      <summary><span>{String(index + 1).padStart(2, "0")}</span><div>{paper && <div className="v2-daily-paper-flags"><i className={`v2-tier-badge ${paper.recommendationTier || "browse"}`}>{recommendationTierLabel(paper.recommendationTier || "browse", locale)}</i><PaperFreshnessBadge paper={paper} locale={locale} /><PaperDiscoverySourceBadge paper={paper} locale={locale} /></div>}<h3>{paper?.title || (locale === "zh" ? `第 ${index + 1} 篇入选论文` : `Selected paper ${index + 1}`)}</h3>{paper && <><p className="v2-daily-paper-authors"><span>{paper.authors || (locale === "zh" ? "作者信息未提供" : "Authors unavailable")}</span></p><div className="v2-daily-paper-publication"><span>{formatPaperDate(paper.publishedAt, locale)}</span><span>{paper.venue || (locale === "zh" ? "来源待核对" : "Source pending")}</span><span>{paper.citationCount || 0} {locale === "zh" ? "被引" : "citations"}</span><span>{paper.readMinutes || 15} {locale === "zh" ? "分钟" : "min"}</span></div></>}</div><b aria-hidden="true">＋</b></summary>
                      <div className="v2-daily-paper-analysis">{paper?.researchProblemId && <section className="research-problem-impact"><strong>{locale === "zh" ? "对当前研究问题的影响" : "Impact on the active problem"}</strong><p>{locale === "zh" ? paper.researchProblemImpactZh : paper.researchProblemImpactEn}</p><small>{locale === "zh" ? "读后需要判断" : "Decision after reading"}</small><b>{locale === "zh" ? paper.researchDecisionZh : paper.researchDecisionEn}</b></section>}{paper && <RouteImpactNote paper={paper} locale={locale} />}{signal && <section><strong>{locale === "zh" ? "它带来了什么" : "What changed"}</strong><p>{signal}</p></section>}{readingAction && <section><strong>{locale === "zh" ? "建议怎么读" : "How to read it"}</strong><p>{readingAction}</p></section>}{paper && <footer><button type="button" onClick={() => openMonitorPaper(paper)}>{locale === "zh" ? "查看解读" : "Open analysis"} →</button><button className="positive" type="button" onClick={() => requestPaperDecision(paper, "relevant")}>✓ {locale === "zh" ? "适合" : "Useful"}</button><button type="button" onClick={() => requestPaperDecision(paper, "not_relevant")}>× {locale === "zh" ? "不相关" : "Not relevant"}</button><button type="button" onClick={() => saveFeedback(paper, "not_relevant", "duplicate_known")}>◎ {locale === "zh" ? "已掌握" : "Mastered"}</button><button type="button" onClick={() => saveFeedback(paper, "later")}>◷ {locale === "zh" ? "稍后" : "Later"}</button></footer>}</div>
                    </details>;
                  })}
                </div>
                {!dailyBriefEntryCount && <div className="v2-daily-zero-state"><strong>{locale === "zh" ? "为什么今天没有推荐？" : "Why are there no recommendations today?"}</strong><p>{locale === "zh" ? `${latestQuickScreenedCount} 篇论文完成快速筛选，${latestDeepReviewedCount} 篇完成逐篇深度解读${latestDeepDeferredCount ? `，另有 ${latestDeepDeferredCount} 篇响应较慢已延后` : ""}；已完成论文没有同时通过研究相关性、论文质量、证据完整度与模型明确推荐四项门槛。` : `${latestQuickScreenedCount} papers passed fast screening and ${latestDeepReviewedCount} completed paper-by-paper deep review${latestDeepDeferredCount ? `; ${latestDeepDeferredCount} slow papers were deferred` : ""}. The completed papers did not clear all four gates for research fit, quality, evidence completeness, and an explicit model recommendation.`}</p><small>{locale === "zh" ? "Pi 不会为了填满页面降低标准；正式入选不足 3 篇时会继续评审期刊、作者、引用网络与路线缺口候选，直到候选耗尽或达到本轮成本上限。" : "Pi will not lower the bar to fill the page. When fewer than three papers clear the final gate, it continues reviewing journal, author, citation-network, and route-gap candidates until the pool or run budget is exhausted."}</small></div>}
                {Boolean((locale === "zh" ? monitor.dailyBrief.watchlistZh : monitor.dailyBrief.watchlistEn).length) && <aside><strong>{locale === "zh" ? "继续观察" : "Keep watching"}</strong><ul>{(locale === "zh" ? monitor.dailyBrief.watchlistZh : monitor.dailyBrief.watchlistEn).map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul></aside>}
              </div>
            </section>}

            {Boolean(monitor?.savedCandidatePapers?.length) && <section className="v2-background-review-status" role="status"><i /><div><strong>{monitor?.savedCandidatePapers?.length || 0} {locale === "zh" ? "篇候选正在质量评估" : "candidates in quality review"}</strong><small>{locale === "zh" ? "通过后会自动进入今日；现在无需处理。" : "Passing papers enter Today automatically; no action is needed now."}</small></div></section>}

            {monitor?.weeklyReview && <details className={`v2-weekly-review ${monitor.weeklyReview.status}`}>
              <summary><span><p className="v2-kicker">7D {locale === "zh" ? "阶段研究回顾" : "RESEARCH REVIEW"}</p><strong>{locale === "zh" ? monitor.weeklyReview.titleZh : monitor.weeklyReview.titleEn}</strong><small>{locale === "zh" ? `来自 ${monitor.weeklyReview.sourceDays} 天真实记录` : `Based on ${monitor.weeklyReview.sourceDays} days of real activity`}</small></span><b>＋</b></summary>
              <div className="v2-weekly-review-body"><p>{locale === "zh" ? monitor.weeklyReview.overviewZh : monitor.weeklyReview.overviewEn}</p><div><article><h3>{locale === "zh" ? "已经获得" : "What advanced"}</h3><ul>{(locale === "zh" ? monitor.weeklyReview.gainsZh : monitor.weeklyReview.gainsEn).map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>{locale === "zh" ? "仍有缺口" : "Remaining gaps"}</h3><ul>{(locale === "zh" ? monitor.weeklyReview.gapsZh : monitor.weeklyReview.gapsEn).map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>{locale === "zh" ? "下一步行动" : "Next moves"}</h3><ol>{(locale === "zh" ? monitor.weeklyReview.nextStepsZh : monitor.weeklyReview.nextStepsEn).map((item) => <li key={item}>{item}</li>)}</ol></article></div></div>
            </details>}

            <div className="v2-research-utilities">
            <section className="v2-monitor-panel v2-monitor-compact">
              <div className="v2-monitor-head">
                <div className="v2-monitor-intro"><p className="v2-kicker">{locale === "zh" ? "论文发现" : "PAPER DISCOVERY"}</p><h2>{locale === "zh" ? "三个时间窗，持续向前挖掘" : "Three horizons, continuously explored"}</h2><p>{locale === "zh" ? "14 天看新变化，6 个月看新且优质，5 年补核心成果。" : "14 days for change, 6 months for recent quality, and 5 years for durable core work."}</p></div>
                <div className="v2-monitor-actions">
                  <span className={"v2-monitor-status " + (scanIsActive ? "scanning" : monitor?.status || "idle")}><i />{scanIsActive ? scanPhase : monitor?.status === "error" ? t.scanError : monitor?.status === "ready" ? monitorReadyLabel : t.neverScanned}</span>
                  <button className="secondary" type="button" onClick={openSourceSettings} disabled={!monitor?.preferences || scanIsActive}>{t.editSources}</button>
                  <button type="button" onClick={runManualMonitor} disabled={scanIsActive || analysisBudgetBlocked || manualCooldownBlocked}>{scanIsActive ? `${t.scanningButton} ${scanProgress}%` : analysisBudgetBlocked ? (locale === "zh" ? "明日额度刷新后继续" : "Resume after tomorrow's reset") : manualCooldownBlocked ? (locale === "zh" ? `约 ${monitor?.retryAfterMinutes || 1} 分钟后可再扫描` : `Scan again in about ${monitor?.retryAfterMinutes || 1} min`) : resumeAvailable ? (locale === "zh" ? "从断点继续" : "Resume") : compactScanAvailable ? (locale === "zh" ? "扫描近 14 天" : "Scan latest 14 days") : monitor?.scanJob?.needsRefresh ? (locale === "zh" ? "用新版重新扫描" : "Rescan with new method") : t.scanNow}</button>
                </div>
              </div>
              {analysisBudgetBlocked && !scanIsActive && <div className="v2-scan-budget-note"><span>◷</span><p>{locale === "zh" ? "今天的完整扫描额度已用完；Pi 会在刷新后继续，现有论文、偏好与断点均已保留。" : "Today's full-scan budget is exhausted. Pi will continue after the reset; papers, preferences, and checkpoints are preserved."}</p></div>}
              {backgroundAutomationDeferred && !analysisBudgetBlocked && <div className="v2-scan-budget-note" role="status"><span>◷</span><p>{locale === "zh" ? "无人操作的后台扫描已待机以控制费用；你现在仍可手动扫描，已有候选、论文与进度都会保留。" : "Unattended background scanning is on standby to control cost. You can still scan manually now, and existing candidates, papers, and progress are preserved."}</p></div>}
              {compactScanAvailable && !manualCooldownBlocked && <div className="v2-scan-budget-note" role="status"><span>↗</span><p>{locale === "zh" ? "今天适合先看最新变化：本轮只扫描近 14 天并完成最多 2 篇严格判断；半年和五年窗口会在额度刷新后自动继续，论文与偏好不会丢失。" : "Start with the newest changes today: this pass scans the latest 14 days and strictly evaluates up to two papers. Six-month and five-year horizons continue after the reset, with papers and preferences preserved."}</p></div>}
              {manualCooldownBlocked && !scanIsActive && <div className="v2-scan-cooldown-note" role="status"><span>◷</span><div><strong>{locale === "zh" ? "刚才没有启动重复扫描" : "A duplicate scan was not started"}</strong><p>{locale === "zh" ? `上次扫描仍在费用保护期，约 ${monitor?.retryAfterMinutes || 1} 分钟后可再次运行；现有推荐、论文库和进度都没有变化。` : `The previous scan is still inside its cost-protection window. Try again in about ${monitor?.retryAfterMinutes || 1} minutes; recommendations, library papers, and progress remain unchanged.`}</p></div></div>}
              {monitor?.scanJob?.needsRefresh && !scanIsActive && !compactScanAvailable && <div className="v2-scan-upgrade-note"><span>π</span><div><strong>{locale === "zh" ? "当前结果来自旧版筛选方法" : "These results use the previous screening method"}</strong><p>{locale === "zh" ? "新版会先完成近 14 天新论文的优先判断，再继续半年与五年补读；按研究方向保留名额，质量门槛不变。此次升级重扫不受本小时冷却限制。" : "The new method decides on papers from the latest 14 days first, then continues with six-month and five-year catch-up. Research directions keep protected slots and the quality gate is unchanged. This upgrade rescan bypasses the hourly cooldown."}</p></div></div>}
              {monitor?.status === "error" && credentialFailureRecovered && (
                <div className="v2-scan-credential-restored" role="status"><span>✓</span><div><strong>{locale === "zh" ? "模型连接已恢复，扫描断点仍在" : "Model connection restored; checkpoint preserved"}</strong><p>{locale === "zh" ? "无需重新检索候选；使用上方“从断点继续”即可恢复。" : "Candidates will not be retrieved again; use Resume above to continue."}</p></div></div>
              )}
              {monitor?.status === "error" && !credentialFailureRecovered && (
                <details className={`v2-scan-failure ${isModelCredentialFailure(failedScanError) ? "credential" : ""}`} role="alert">
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
                <div className="v2-scan-progress" role="status" aria-live="polite" aria-label={`${scanPhase} ${scanProgress}%`}>
                  <div><span>{scanPhase}</span><strong>{scanProgress}%</strong></div>
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
              <div className="v2-monitor-meta"><button className="v2-inbox-summary" type="button" onClick={() => { setLibraryFilter("inbox"); setLibraryStageFilter("all"); setInboxFilter("all"); navigate("library"); }}><span>{monitor?.historyCounts?.inbox || 0} {t.inbox}</span><small>{monitor?.historyCounts?.unseen || 0} {t.unseen} · {locale === "zh" ? "未处理内容会保留" : "Unresolved papers stay here"}</small><b>→</b></button>
              <details className="v2-scan-details">
                <summary>{locale === "zh" ? "扫描范围与来源" : "Scan scope & sources"}<b>＋</b></summary>
                <div className="v2-source-profile"><div><span>{t.detectedDomain}</span><strong>{locale === "zh" ? monitor?.preferences?.profileNameZh : monitor?.preferences?.profileNameEn}</strong><em>{monitor?.preferences?.userModified ? t.userCustomized : t.systemProvided}</em></div><div><span>{t.prioritySources}</span><p>{monitor?.preferences?.priorityVenues.slice(0, 6).map((venue) => <i key={venue}>{venue}</i>)}</p></div>{Boolean(monitor?.preferences?.trackedAuthors?.length) && <div><span>{locale === "zh" ? "追踪作者" : "Tracked authors"}</span><p>{monitor?.preferences?.trackedAuthors.slice(0, 6).map((author) => <i key={author}>{author}</i>)}</p></div>}</div>
                {SHOW_INTERNAL_QUALITY_UI && monitor?.queryPlan && <div className="v2-query-plan"><span>π</span><div><strong>{locale === "zh" ? "研究线索驱动的今日检索" : "Today's route-guided discovery"} · {monitor.queryPlan.queryCount} {locale === "zh" ? "组查询" : "queries"}</strong><p>{locale === "zh" ? monitor.queryPlan.rationaleZh : monitor.queryPlan.rationaleEn}</p></div></div>}
                <dl className="v2-monitor-metrics">
                  <div><dt>{t.lastScan}</dt><dd>{formatMonitorDate(monitor?.lastRunAt || null, locale)}</dd></div>
                  <div><dt>{t.nextScan}</dt><dd>{monitor?.automation?.paused ? (locale === "zh" ? "等待你处理后恢复" : "Waiting for your return") : formatMonitorDate(monitor?.nextRunAt || null, locale)}</dd></div>
                  <div>
                    <dt>{locale === "zh" ? "自动监控" : "Automatic monitoring"}</dt>
                    <dd title={locale === "zh" ? monitor?.automation?.pauseMessageZh : monitor?.automation?.pauseMessageEn}>
                      {monitor?.automation?.paused
                        ? `${locale === "zh" ? "已待机" : "On standby"} · ${monitor.automation.pauseReason === "daily_budget" ? (locale === "zh" ? "今日预算已用完" : "daily budget used") : monitor.automation.pauseReason === "model_unavailable" ? (locale === "zh" ? "模型待恢复" : "model unavailable") : (locale === "zh" ? "下次打开后恢复" : "resumes next visit")}`
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
                {!!monitor?.coverage?.length && <div className="v2-coverage-ledger"><span>{locale === "zh" ? "探索覆盖" : "Discovery coverage"}</span><div>{monitor.coverage.slice(0, 8).map((source) => <i className={source.healthy ? "healthy" : "degraded"} key={source.sourceKey}><b />{source.sourceKey.replace(/_/g, " ")}<small>+{source.newCandidates}</small></i>)}</div></div>}
                <p>{t.autoVisit}</p>
              </details>
              </div>
            </section>

            {Boolean(monitor?.notifications?.length) && <section className={`v2-research-catchup v2-action-inbox ${pendingActionNotifications.length ? "has-items" : "is-empty"}`}>
              <header><div><p className="v2-kicker warm">{locale === "zh" ? "研究提醒" : "RESEARCH ALERTS"}</p><h2>{pendingActionNotifications.length ? (locale === "zh" ? `${pendingActionNotifications.length} 项需要你处理` : `${pendingActionNotifications.length} items need your attention`) : (locale === "zh" ? "今天没有待处理事项" : "Nothing needs attention today")}</h2></div>{pendingActionNotifications.length > 0 && <button type="button" onClick={() => void markNotificationsRead()}>{locale === "zh" ? "全部处理" : "Handle all"}</button>}</header>
              <div className="v2-action-inbox-list">
                {pendingActionNotifications.slice(0, 4).map((notification) => <article className={notification.kind} key={notification.id}><span>{notification.kind === "weekly_review" ? "7D" : notification.kind === "route_change" ? "↗" : notification.kind === "must_read" ? "!" : "◷"}</span><div><small>{notification.kind === "must_read" ? (locale === "zh" ? "优先阅读" : "Priority reading") : notification.kind === "route_change" ? (locale === "zh" ? "路线变化" : "Route change") : notification.kind === "weekly_review" ? (locale === "zh" ? "阶段回顾" : "Research review") : (locale === "zh" ? "阅读提醒" : "Reading reminder")} · {formatNotificationTime(notification.createdAt, locale)}</small><strong>{locale === "zh" ? notification.titleZh : notification.titleEn}</strong><p>{locale === "zh" ? notification.bodyZh : notification.bodyEn}</p></div><button type="button" onClick={() => openResearchNotification(notification)}>{notificationActionLabel(notification.kind, locale)} →</button></article>)}
                {!pendingActionNotifications.length && <div className="v2-action-inbox-empty"><span>✓</span><p>{locale === "zh" ? "新的必读论文、路线变化和阅读提醒会出现在这里。" : "New must-reads, route changes, and reading reminders will appear here."}</p></div>}
              </div>
              {Boolean(activityGroups.length) && <details className="v2-activity-log" open={notificationsExpanded} onToggle={(event) => setNotificationsExpanded(event.currentTarget.open)}><summary><span><strong>{locale === "zh" ? "Pi 运行记录" : "Pi activity"}</strong><small>{locale === "zh" ? "扫描和恢复信息，不计入待处理" : "Scan activity, not an action item"}</small></span><b>{notificationsExpanded ? (locale === "zh" ? "收起" : "Close") : (locale === "zh" ? "查看" : "View")} ＋</b></summary><div>{activityGroups.slice(0, 7).map((activity, index) => <article key={activity.key}><span>✓</span><div><strong>{locale === "zh" ? "扫描完成" : "Scan complete"}{activity.recovered ? (locale === "zh" ? " · 已从断点续跑" : " · resumed from checkpoint") : ""}</strong><p>{index === 0 && monitor?.dailyBrief ? (locale === "zh" ? `${monitor.dailyBrief.metrics.scanned || 0} 篇候选 → ${latestQuickScreenedCount} 篇快筛 → ${latestDeepReviewedCount} 篇深度解读 → ${monitor.dailyBrief.metrics.recommended || 0} 篇入选` : `${monitor.dailyBrief.metrics.scanned || 0} candidates → ${latestQuickScreenedCount} screened → ${latestDeepReviewedCount} deeply reviewed → ${monitor.dailyBrief.metrics.recommended || 0} selected`) : (locale === "zh" ? activity.primary.bodyZh : activity.primary.bodyEn)}</p><small>{formatNotificationTime(activity.primary.createdAt, locale)}</small></div><button type="button" onClick={() => document.querySelector(".v2-monitor-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{locale === "zh" ? "扫描详情" : "Scan details"} →</button></article>)}</div></details>}
            </section>}
            </div>

            {SHOW_INTERNAL_QUALITY_UI && monitor?.pilotEvaluation && <section className="v2-pilot-evaluation"><header><div><p className="v2-kicker warm">π {locale === "zh" ? "7 天真实试运行" : "7-DAY LIVE PILOT"}</p><h2>{monitor.pilotEvaluation.complete ? (locale === "zh" ? "试运行周期已完成" : "Pilot period complete") : (locale === "zh" ? `第 ${monitor.pilotEvaluation.elapsedDays || 0} / 7 天` : `Day ${monitor.pilotEvaluation.elapsedDays || 0} of 7`)}</h2></div><strong>{monitor.pilotEvaluation.succeeded}/{monitor.pilotEvaluation.attempts}<small>{locale === "zh" ? "成功扫描" : "successful scans"}</small></strong></header><div>{monitor.pilotEvaluation.criteria.map((criterion) => <article className={criterion.status} key={criterion.id}><span>{criterion.status === "pass" ? "✓" : criterion.status === "watch" ? "!" : "·"}</span><div><strong>{pilotCriterionLabel(criterion.id, locale)}</strong><small>{criterion.id === "paperQuality" ? (locale === "zh" ? `${criterion.value} 次错误类型反馈` : `${criterion.value} wrong-type reports`) : criterion.id === "horizons" ? `${criterion.value}/3` : criterion.id === "deduplication" ? (locale === "zh" ? `${criterion.value} 次重复已避免` : `${criterion.value} duplicates avoided`) : `${criterion.value}%`}</small></div><b>{criterion.status === "pass" ? (locale === "zh" ? "达标" : "Pass") : criterion.status === "watch" ? (locale === "zh" ? "观察" : "Watch") : (locale === "zh" ? "等待数据" : "Waiting")}</b></article>)}</div><footer><span>{locale === "zh" ? `可靠性 ${monitor.pilotEvaluation.summary.reliability}% · 接受率 ${monitor.pilotEvaluation.summary.acceptanceRate}% · 每篇有效推荐约 ${monitor.pilotEvaluation.summary.tokensPerRecommendation || 0} token` : `${monitor.pilotEvaluation.summary.reliability}% reliability · ${monitor.pilotEvaluation.summary.acceptanceRate}% acceptance · ${monitor.pilotEvaluation.summary.tokensPerRecommendation || 0} tokens per useful recommendation`}</span></footer></section>}

            {SHOW_INTERNAL_QUALITY_UI && monitor?.operationsDashboard && <section className="v2-operations-dashboard"><header><div><p className="v2-kicker">π {locale === "zh" ? "发现质量" : "DISCOVERY QUALITY"}</p><h2>{locale === "zh" ? "每次扫描是否真的带来新的、有用的论文" : "Whether each scan finds genuinely new, useful work"}</h2></div><small>{locale === "zh" ? `近 ${monitor.operationsDashboard.periodDays} 天真实运行数据` : `Last ${monitor.operationsDashboard.periodDays} days of real activity`}</small></header><div className="v2-operations-metrics"><article><span>{locale === "zh" ? "新候选" : "New candidates"}</span><strong>{monitor.operationsDashboard.totals.newCandidates}</strong><small>{monitor.operationsDashboard.totals.candidates} {locale === "zh" ? "篇独立候选" : "unique candidates"}</small></article><article><span>{locale === "zh" ? "去重节省" : "Duplicates avoided"}</span><strong>{monitor.operationsDashboard.totals.duplicatesAvoided}</strong><small>{monitor.operationsDashboard.totals.duplicateAvoidanceRate}% {locale === "zh" ? "无需重复交给 LLM" : "kept away from the LLM"}</small></article><article><span>{locale === "zh" ? "深审入选率" : "Review yield"}</span><strong>{monitor.operationsDashboard.totals.recommendationYield}%</strong><small>{monitor.operationsDashboard.totals.recommended} / {monitor.operationsDashboard.totals.reviewed} {locale === "zh" ? "篇入选" : "selected"}</small></article><article><span>{locale === "zh" ? "用户接受率" : "Acceptance"}</span><strong>{monitor.operationsDashboard.totals.acceptanceRate}%</strong><small>{monitor.operationsDashboard.totals.tokensPerRecommendation ? `${Math.round(monitor.operationsDashboard.totals.tokensPerRecommendation / 100) / 10}k token / ${locale === "zh" ? "推荐" : "recommendation"}` : (locale === "zh" ? "等待更多反馈" : "Awaiting feedback")}</small></article></div><div className="v2-operations-body"><div className="v2-scan-trend"><h3>{locale === "zh" ? "每日发现趋势" : "Daily discovery trend"}</h3>{monitor.operationsDashboard.daily.length ? monitor.operationsDashboard.daily.map((day) => <div key={day.date}><time>{day.date.slice(5)}</time><i><b style={{ width: `${Math.max(3, day.candidates / operationsMaxCandidates * 100)}%` }} /></i><span>+{day.newCandidates}</span><em>{day.recommended} {locale === "zh" ? "入选" : "selected"}</em></div>) : <p>{locale === "zh" ? "完成第一轮新版本扫描后，这里会开始记录趋势。" : "Trend data will appear after the first scan on this version."}</p>}</div><div className="v2-horizon-performance"><h3>{locale === "zh" ? "三层覆盖效率" : "Three-horizon efficiency"}</h3>{monitor.operationsDashboard.horizons.map((item) => <article key={item.horizon}><span>{item.horizon === "days" ? t.daysHorizon : item.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span><strong>{item.discoveryYield}%</strong><small>{item.branches} {locale === "zh" ? "条分支" : "branches"} · {item.cooling} {locale === "zh" ? "条降频" : "cooling"}</small></article>)}</div></div>{Boolean(monitor.explorationLedger?.length) && <details className="v2-exploration-ledger"><summary><span><b>{locale === "zh" ? "持续探索账本" : "Continuous exploration ledger"}</b><small>{locale === "zh" ? "Pi 记录每条检索分支的位置；低收益分支自动降频，之后再回访。" : "Pi remembers each branch position, cools low-yield paths, and revisits them later."}</small></span><strong>{monitor.explorationLedger?.length} →</strong></summary><div>{monitor.explorationLedger?.slice(0, 16).map((branch) => <article className={branch.status} key={`${branch.horizon}:${branch.id}`}><header><span>{branch.horizon === "days" ? t.daysHorizon : branch.horizon === "months" ? t.monthsHorizon : t.yearsHorizon} · {branch.channel}</span><b>{explorationStatusLabel(branch.status, locale)}</b></header><p>{branch.queryText || branch.sourceKey.replace(/_/g, " ")}</p><footer><span>{locale === "zh" ? "游标" : "cursor"} {branch.nextCursor}</span><span>{branch.attempts} {locale === "zh" ? "轮" : "rounds"}</span><span>{branch.newCandidates}/{branch.candidates} {locale === "zh" ? "新发现" : "new"}</span><strong>{branch.discoveryYield}%</strong></footer></article>)}</div></details>}</section>}

            {!!monitor?.mapChanges?.length && <section className="v2-route-changes"><header><div><p className="v2-kicker warm">π {locale === "zh" ? "研究路线变化" : "Research route changes"}</p><h2>{locale === "zh" ? "路线、证据与论文节点最近发生了什么" : "What changed across routes, evidence, and paper nodes"}</h2></div><button type="button" onClick={() => navigate("threads")}>{locale === "zh" ? "打开地图" : "Open map"} →</button></header><div>{monitor.mapChanges.slice(0, 3).map((change) => { const kind = routeChangeKindLabel(change.kind); return <article key={change.id}><span>{kind.symbol}</span><div><small>{locale === "zh" ? change.trackTitleZh : change.trackTitleEn} · {locale === "zh" ? kind.zh : kind.en}{change.kind === "new_evidence" ? ` · ${change.confidence}%` : ""}</small><h3>{change.kind === "new_evidence" ? change.paperTitle : locale === "zh" ? change.titleZh : change.titleEn}</h3><p>{locale === "zh" ? change.summaryZh : change.summaryEn}</p></div></article>; })}</div></section>}

            {Boolean(additionalTodayPapers.length) && <section className="v2-today-more">
              <header><div><p className="v2-kicker warm">{locale === "zh" ? "更多推荐" : "MORE RECOMMENDATIONS"}</p><h2>{locale === "zh" ? "不在今日主队列，但仍值得保留" : "Worth keeping beyond the main queue"}</h2></div><span>{additionalTodayPapers.length} {locale === "zh" ? "篇" : "papers"}</span></header>
              <div className="v2-compact-list">{additionalTodayPapers.map((paper) => <button type="button" key={paper.id} data-paper-impression={paper.id} onClick={() => openMonitorPaper(paper)}><span className={`v2-tier-badge ${paper.recommendationTier || "browse"}`}>{recommendationTierLabel(paper.recommendationTier || "browse", locale)}</span><span><strong>{paper.title}</strong><small>{paper.authors || (locale === "zh" ? "作者信息未提供" : "Authors unavailable")} · {formatPaperDate(paper.publishedAt, locale)} · {paper.citationCount || 0} {t.citations}</small><PaperFreshnessBadge paper={paper} locale={locale} /><PaperDiscoverySourceBadge paper={paper} locale={locale} /><RecommendationVerificationBadge paper={paper} locale={locale} /><RouteDiscoveryBadge paper={paper} locale={locale} /></span><span className="v2-thread-chip">{paper.readMinutes || 15} min</span><b>→</b></button>)}</div>
            </section>}

          </main>
        )}

        {view === "threads" && (
          <main className="v2-page v2-map-page">
              <section className="v2-page-head v2-map-head v2-route-page-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {modelDisplayName(researchMap.model)}</p><h1>{researchMapMode === "directions" ? (locale === "zh" ? "研究路线" : "Research routes") : (locale === "zh" ? "高级图谱探索" : "Advanced graph explorer")}</h1><p>{researchMapMode === "directions" ? (locale === "zh" ? "看清当前研究到哪里、哪里发生变化，以及下一步最值得做什么。" : "See where your research stands, what changed, and the next most useful action.") : (locale === "zh" ? "按需追溯引用、寻找相似工作和生成阅读顺序；日常路线不会被复杂图谱打断。" : "Trace citations, find related work, and build reading orders on demand without interrupting daily route work.")}</p></div><div className="v2-map-head-actions">{researchMapMode === "papers" ? <button className="v2-route-back-overview" type="button" onClick={() => { setResearchMapMode("directions"); setSelectedNetworkPaperId(null); }}>{locale === "zh" ? "← 返回路线总览" : "← Back to route overview"}</button> : <><span className="v2-map-total"><strong>{researchMap.tracks.length}</strong>{locale === "zh" ? "条研究路线" : "research routes"}</span><button className="v2-route-head-explorer" type="button" onClick={() => setResearchMapMode("papers")}>{locale === "zh" ? "高级图谱探索" : "Advanced graph explorer"} →</button></>}</div></section>
            {mapLoading ? (
              <section className="v2-map-loading v2-outline-loading" role="status"><span>π</span><div><strong>{locale === "zh" ? "先建立可浏览的方向骨架" : "Building a browsable direction outline first"}</strong><p>{mapOutlineLabels[mapOutlinePhase]}</p><i><b style={{ width: `${22 + mapOutlinePhase * 21}%` }} /></i><small>{locale === "zh" ? "骨架出现后，你可以立即浏览；真实论文会逐条路线继续补充。" : "You can browse as soon as the outline appears while real papers continue filling each route."}</small></div></section>
            ) : researchMap.tracks.length ? (
              <>
                {researchMapMode === "directions" ? <>
                  {(researchMap.buildProgress?.pendingTrackIds.length || mapBuildTrackId) ? <section className="v2-map-build-progress v2-route-build-progress" role="status"><div><span className={mapBuildTrackId ? "working" : "paused"}><i /></span><div><strong>{mapBuildTrackId ? (locale === "zh" ? `正在补充第 ${(researchMap.buildProgress?.ready || 0) + 1} / ${researchMap.buildProgress?.total || researchMap.tracks.length} 条路线` : `Filling route ${(researchMap.buildProgress?.ready || 0) + 1} of ${researchMap.buildProgress?.total || researchMap.tracks.length}`) : (locale === "zh" ? `${researchMap.buildProgress?.pendingTrackIds.length || 0} 条路线等待补充` : `${researchMap.buildProgress?.pendingTrackIds.length || 0} routes await evidence`)}</strong><p>{currentBuildTrack ? (locale === "zh" ? currentBuildTrack.titleZh : currentBuildTrack.titleEn) : (locale === "zh" ? "已完成内容已经保存" : "Completed work is saved")}</p></div></div><i><b style={{ width: `${researchMap.buildProgress?.total ? Math.round((researchMap.buildProgress.ready / researchMap.buildProgress.total) * 100) : 0}%` }} /></i></section> : null}
                  {((researchMap.intelligenceProgress && researchMap.intelligenceProgress.ready < researchMap.intelligenceProgress.total) || mapIntelligenceTrackId) ? <section className="v2-map-build-progress v2-intelligence-progress v2-route-build-progress" role="status"><div><span className={mapIntelligenceTrackId ? "working" : "paused"}><i>π</i></span><div><strong>{mapIntelligenceTrackId ? (locale === "zh" ? "Pi 正在形成方向研判" : "Pi is forming a direction assessment") : (locale === "zh" ? "部分方向等待 Pi 刷新" : "Some direction assessments await refresh")}</strong><p>{currentIntelligenceTrack ? (locale === "zh" ? currentIntelligenceTrack.titleZh : currentIntelligenceTrack.titleEn) : (locale === "zh" ? "旧研判和已有路线继续保留" : "Saved assessments and existing routes remain available")}</p></div></div><i><b style={{ width: `${researchMap.intelligenceProgress?.total ? Math.round((researchMap.intelligenceProgress.ready / researchMap.intelligenceProgress.total) * 100) : 0}%` }} /></i></section> : null}
                  {Boolean((researchMap.buildProgress?.partialTrackIds?.length || 0) + (researchMap.buildProgress?.emptyTrackIds?.length || 0) + (researchMap.buildProgress?.failedTrackIds?.length || 0)) && <section className="v2-map-build-progress v2-route-build-degraded" role="status"><div><span className="paused"><i>!</i></span><div><strong>{locale === "zh" ? "部分路线处于诚实降级状态" : "Some routes are honestly degraded"}</strong><p>{locale === "zh" ? "已有论文和候选均已保留；没有可见证据的路线不会标记为完成。" : "Existing papers and candidates are retained; routes without visible evidence are never marked complete."}</p></div></div></section>}

                  {routeAttention && routeAttentionTrack && <RoutePortfolioOverview portfolio={routePortfolio} todayCount={routeTodayPaperCount} attentionKind={routeAttention.kind} attentionTrack={routeAttentionTrack} locale={locale} onAction={handleRouteAttention} />}

                  <section className="v2-route-groups">
                    <header><div><p className="v2-kicker">{locale === "zh" ? "我的研究布局" : "MY RESEARCH PORTFOLIO"}</p><h2>{locale === "zh" ? "主攻、辅助与探索方向" : "Core, supporting, and exploratory directions"}</h2></div></header>
                    {(["core", "support", "explore"] as ResearchDirectionRole[]).map((role) => researchTracksByRole[role].length ? <section className={`v2-route-group ${role}`} key={role}>
                      <header><span>{directionRoleLabel(role, locale)}</span><small>{role === "core" ? (locale === "zh" ? "你投入最深、需要持续维护的主线" : "Your deepest, continuously maintained work") : role === "support" ? (locale === "zh" ? "为主线提供方法、理论或证据" : "Methods, theory, or evidence that supports the core") : (locale === "zh" ? "保留少量预算验证的新方向" : "New directions receiving a bounded exploration budget")}</small><b>{researchTracksByRole[role].length}</b></header>
                      <div>{researchTracksByRole[role].map((thread) => <article className={`${thread.buildStatus} ${thread.monitoringStatus}`} key={thread.id}>
                        <header><span className={`v2-direction-heat ${thread.heatLevel}`} title={directionHeatTitle(thread, locale)}><i />{directionHeatLabel(thread.heatLevel, locale)}</span><RouteOperationalBadge track={thread} locale={locale} /><small>{researchTrackBuildSummary(thread, locale)}</small></header>
                        <button className="v2-route-card-main" type="button" onClick={() => openThread(thread)}><h3>{locale === "zh" ? thread.titleZh : thread.titleEn}</h3><p>{thread.intelligence ? (locale === "zh" ? thread.intelligence.assessmentZh : thread.intelligence.assessmentEn) : (locale === "zh" ? thread.summaryZh : thread.summaryEn)}</p></button>
                        <dl><div><dt>{locale === "zh" ? "深度" : "Depth"}</dt><dd>{thread.depthScore}</dd></div><div><dt>{locale === "zh" ? "近期" : "Recent"}</dt><dd>{thread.recentPaperCount}</dd></div><div><dt>{locale === "zh" ? "置信" : "Confidence"}</dt><dd>{thread.intelligence?.confidence || "—"}{thread.intelligence ? "%" : ""}</dd></div></dl>
                        {thread.latestChange && <p className="v2-route-latest-change"><span>{locale === "zh" ? "最近变化" : "Latest change"}</span>{locale === "zh" ? thread.latestChange.summaryZh : thread.latestChange.summaryEn}<time>{formatNotificationTime(thread.latestChange.createdAt, locale)}</time></p>}
                        {(thread.intelligence?.evidenceGapZh || thread.intelligence?.evidenceGapEn) && <button className="v2-route-gap-link" type="button" onClick={() => openThread(thread, "gaps")}><span>{locale === "zh" ? "证据缺口" : "Evidence gap"}</span><p>{locale === "zh" ? thread.intelligence.evidenceGapZh : thread.intelligence.evidenceGapEn}</p><b>→</b></button>}
                        <footer><button type="button" onClick={() => openThread(thread)}>{locale === "zh" ? "进入工作区" : "Open workspace"} →</button><button type="button" onClick={() => void expandResearchTrack(thread)} disabled={Boolean(mapAction || mapBuildTrackId || thread.monitoringStatus === "paused")}>{mapAction === thread.id ? (locale === "zh" ? "挖掘中…" : "Mining…") : thread.monitoringStatus === "paused" ? (locale === "zh" ? "已暂停" : "Paused") : ["queued", "retryable", "empty", "failed"].includes(thread.buildStatus) ? (locale === "zh" ? "重试补充" : "Retry evidence") : thread.buildStatus === "partial" ? (locale === "zh" ? "补全路线" : "Complete route") : (locale === "zh" ? "继续深挖" : "Mine deeper")}</button></footer>
                      </article>)}</div>
                    </section> : null)}
                  </section>

                  <details className="v2-route-map-assist">
                    <summary><span><small>{locale === "zh" ? "辅助视图" : "SUPPORTING VIEW"}</small><strong>{locale === "zh" ? "查看方向之间的演化与关系" : "Explore evolution and cross-direction relationships"}</strong><p>{locale === "zh" ? "需要理解全局结构时再展开；Pi 推断关系与真实论文证据保持区分。" : "Expand only when you need the global structure; Pi-inferred links remain separate from paper evidence."}</p></span><b>{researchMap.edges.length} {locale === "zh" ? "条关系" : "links"} ＋</b></summary>
                    <section className={`v2-direction-path-panel ${directionOverviewTrack ? "has-inspector" : ""}`}>
                      <header><div><p className="v2-kicker">{locale === "zh" ? "领域演化" : "FIELD EVOLUTION"}</p><h2>{locale === "zh" ? "从理论奠基走到当前前沿" : "From foundations to the current frontier"}</h2><p>{locale === "zh" ? "点击方向查看解释；悬停或聚焦关系时再显示发展承接、跨向桥接与方法支撑。" : "Select a direction for context; inferred builds-on, bridge, and support links appear only on focus."}</p></div><div className="v2-direction-path-legend"><span><i className="solid" />{locale === "zh" ? "方向主线" : "Direction"}</span><span><i className="paper" />{locale === "zh" ? "真实论文" : "Real paper"}</span><span><i className="gap" />{locale === "zh" ? "待补证据" : "Evidence gap"}</span></div></header>
                      <div className="v2-direction-path-stage">
                        <DirectionPathMap map={researchMap} locale={locale} selectedTrackId={directionOverviewId} focusedEdgeId={directionRelationFocusId || directionPinnedRelationId} onSelect={(trackId) => { setDirectionOverviewId(trackId); setDirectionRelationFocusId(null); setDirectionPinnedRelationId(null); }} onClear={() => { setDirectionOverviewId(null); setDirectionRelationFocusId(null); setDirectionPinnedRelationId(null); }} />
                        {directionOverviewTrack && <aside className="v2-direction-path-inspector"><div><span className={`v2-direction-heat ${directionOverviewTrack.heatLevel}`}><i />{directionHeatLabel(directionOverviewTrack.heatLevel, locale)}</span><small>{directionRoleLabel(directionOverviewTrack.userRole, locale)}</small></div><h2>{locale === "zh" ? directionOverviewTrack.titleZh : directionOverviewTrack.titleEn}</h2><p>{locale === "zh" ? directionOverviewTrack.summaryZh : directionOverviewTrack.summaryEn}</p><dl><div><dt>{locale === "zh" ? "研究深度" : "Depth"}</dt><dd>{directionOverviewTrack.depthScore}</dd></div><div><dt>{locale === "zh" ? "路线论文" : "Papers"}</dt><dd>{directionOverviewTrack.papers.length}</dd></div><div><dt>{locale === "zh" ? "近期证据" : "Recent"}</dt><dd>{directionOverviewTrack.recentPaperCount}</dd></div></dl>
                          {directionOverviewRelations.length > 0 && <section className="v2-direction-relations"><header><div><strong>{locale === "zh" ? "与其他方向的关系" : "Links to other directions"}</strong><small>{locale === "zh" ? "悬停预览，点击固定 · Pi 推断，不代表真实引用" : "Hover to preview, click to pin · Pi-inferred, not a citation claim"}</small></div><span>{directionOverviewRelations.length}</span></header><div>{directionOverviewRelations.map(({ edge, source, target }) => { const sourceTitle = locale === "zh" ? source.titleZh : source.titleEn; const targetTitle = locale === "zh" ? target.titleZh : target.titleEn; const clearPreview = () => setDirectionRelationFocusId((current) => current === edge.id ? null : current); const pinned = directionPinnedRelationId === edge.id; return <button type="button" className={`${directionRelationFocusId === edge.id ? "previewing" : ""} ${pinned ? "pinned" : ""}`} key={edge.id} onPointerEnter={() => setDirectionRelationFocusId(edge.id)} onPointerLeave={clearPreview} onFocus={() => setDirectionRelationFocusId(edge.id)} onBlur={clearPreview} onClick={() => { setDirectionPinnedRelationId((current) => current === edge.id ? null : edge.id); setDirectionRelationFocusId(null); }} aria-pressed={pinned}><span><b>{directionRelationshipLabel(edge.kind, locale)}</b><em>{pinned ? (locale === "zh" ? "已固定" : "Pinned") : `Pi · ${edge.strength}%`}</em></span><strong>{sourceTitle}<i>{edge.kind === "bridges" ? "↔" : "→"}</i>{targetTitle}</strong><small>{locale === "zh" ? edge.relationshipZh : edge.relationshipEn}</small></button>; })}</div></section>}
                          {directionOverviewTrack.intelligence && <blockquote><small>{locale === "zh" ? "Pi 当前判断" : "Pi assessment"}</small><p>{locale === "zh" ? directionOverviewTrack.intelligence.assessmentZh : directionOverviewTrack.intelligence.assessmentEn}</p></blockquote>}<footer><button type="button" onClick={() => openThread(directionOverviewTrack)}>{locale === "zh" ? "进入方向工作区" : "Open route workspace"} →</button><button type="button" onClick={() => void expandResearchTrack(directionOverviewTrack)} disabled={Boolean(mapAction || mapBuildTrackId || directionOverviewTrack.monitoringStatus === "paused")}>{directionOverviewTrack.monitoringStatus === "paused" ? (locale === "zh" ? "已暂停" : "Paused") : (locale === "zh" ? "继续深挖" : "Mine deeper")} ＋</button></footer></aside>}
                      </div>
                    </section>
                  </details>

                  <section className="v2-route-explorer-entry"><div><span>◎</span><div><small>{locale === "zh" ? "高级工具" : "ADVANCED TOOL"}</small><h2>{locale === "zh" ? "需要追溯引用、寻找相似工作或比较多篇论文？" : "Need citation tracing, similar work, or multi-paper comparison?"}</h2><p>{locale === "zh" ? "论文图谱保留为按需使用的探索空间，不干扰日常路线管理。" : "The paper graph remains an on-demand exploration space, separate from daily route management."}</p></div></div><dl><div><dt>{locale === "zh" ? "论文" : "Papers"}</dt><dd>{researchMap.paperNetwork.paperCount || networkPaperNodes.length}</dd></div><div><dt>{locale === "zh" ? "真实关系" : "Verified links"}</dt><dd>{researchMap.paperNetwork.citationEdgeCount + researchMap.paperNetwork.similarityEdgeCount}</dd></div></dl><button type="button" onClick={() => { setResearchMapMode("papers"); setSelectedNetworkPaperId(null); }}>{locale === "zh" ? "打开高级图谱探索" : "Open advanced graph explorer"} →</button></section>
                </> : <section className="v2-paper-network-panel">
                  <header className="v2-paper-network-toolbar">
                    <div className="v2-paper-network-mode" role="group" aria-label={locale === "zh" ? "论文网络模式" : "Paper network mode"}>
                      <button type="button" aria-pressed={paperNetworkMode === "similarity"} className={paperNetworkMode === "similarity" ? "active" : ""} onClick={() => { setPaperNetworkMode("similarity"); setPaperNetworkScope("all"); }}><span>{locale === "zh" ? "相似论文" : "Similar papers"}</span><b>{researchMap.paperNetwork.similarityEdgeCount + rankedResearchNetworkCandidates.length}</b></button>
                      <button type="button" aria-pressed={paperNetworkMode === "citations"} className={paperNetworkMode === "citations" ? "active" : ""} onClick={() => { setPaperNetworkMode("citations"); setPaperNetworkScope("all"); }}><span>{locale === "zh" ? "知识引用流" : "Citation flow"}</span><b>{visibleCitationEdgeCount}</b></button>
                      <button type="button" aria-pressed={paperNetworkMode === "path"} className={paperNetworkMode === "path" ? "active" : ""} onClick={() => { setPaperNetworkMode("path"); setPaperNetworkScope("all"); }}><span>{locale === "zh" ? "建议阅读顺序" : "Reading order"}</span><b>{activeLearningState.path?.steps.length || 0}</b></button>
                    </div>
                    <div className="v2-paper-network-filters">{paperNetworkMode === "similarity" && <div className="v2-paper-network-scope" role="group" aria-label={locale === "zh" ? "网络范围" : "Network scope"}><button type="button" className={paperNetworkScope === "all" ? "active" : ""} onClick={() => setPaperNetworkScope("all")}>{locale === "zh" ? "完整图谱" : "Full graph"}</button><button type="button" className={paperNetworkScope === "one-hop" ? "active" : ""} disabled={!selectedNetworkPaperId} onClick={() => setPaperNetworkScope("one-hop")}>{locale === "zh" ? "可核验一跳" : "Verified one-hop"}</button>{explicitNetworkOriginNodes.length >= 2 && <button type="button" className={paperNetworkScope === "multi-seed" ? "active" : ""} onClick={() => setPaperNetworkScope("multi-seed")}>{locale === "zh" ? "联合种子" : "Multi-origin"}</button>}</div>}<label><span>{locale === "zh" ? "方向" : "Direction"}</span><select value={paperNetworkTrackId} onChange={(event) => { setPaperNetworkTrackId(event.target.value); setSelectedNetworkPaperId(null); setPaperNetworkOriginCanonicalIds([]); resetResearchNetworkExpansion([]); setPaperNetworkScope("all"); }}><option value="all">{locale === "zh" ? "全部方向" : "All directions"}</option>{researchMap.tracks.map((track) => <option value={track.id} key={track.id}>{locale === "zh" ? track.titleZh : track.titleEn}</option>)}</select></label>{paperNetworkMode === "similarity" && <button type="button" className="primary" onClick={() => void expandResearchNetwork(undefined, true)} disabled={researchNetworkLoading || !effectiveNetworkOriginNodes.length}>{researchNetworkLoading ? (locale === "zh" ? "寻找中…" : "Discovering…") : researchNetworkCandidates.length ? (locale === "zh" ? "继续发现" : "Discover more") : (locale === "zh" ? "发现更多论文" : "Discover papers")}</button>}{paperNetworkMode !== "path" && <button type="button" onClick={() => void refreshPaperNetwork("verified")} disabled={paperNetworkLoading || researchMap.paperNetwork.paperCount < 2}>{paperNetworkLoading ? (locale === "zh" ? "核验中…" : "Verifying…") : paperNetworkMode === "citations" ? (locale === "zh" ? "核验引用关系" : "Verify citations") : (locale === "zh" ? "核验耦合与引用" : "Verify coupling and citations")}</button>}</div>
                  </header>
                  {paperNetworkMode === "similarity" && <div className={`v2-paper-network-context ${paperNetworkMode} ${paperNetworkScope}`}><strong>{paperNetworkContext.title}</strong><span>{paperNetworkContext.body}</span></div>}
                  {paperNetworkMode === "similarity" && <><div className="v2-network-origin-bar"><span>{locale === "zh" ? "起始论文" : "Origin papers"}<b>{effectiveNetworkOriginNodes.length}/3</b></span><div>{effectiveNetworkOriginNodes.map((node, index) => <span className="v2-network-origin-chip" key={node.paper.canonicalId}><button className="v2-network-origin-select" type="button" aria-pressed={selectedNetworkPaperId === node.paper.id} onClick={() => setSelectedNetworkPaperId(node.paper.id)}><b>{index + 1}</b><span>{node.paper.title.slice(0, 44)}</span></button>{explicitNetworkOriginNodes.length > 0 && <button className="v2-network-origin-remove" type="button" onClick={() => removeNetworkOrigin(node.paper.canonicalId)} aria-label={locale === "zh" ? `移除种子：${node.paper.title}` : `Remove origin: ${node.paper.title}`}>×</button>}</span>)}</div><small>{locale === "zh" ? "金环只表示起始论文；深绿外环表示当前聚焦。点击只查看，生成新图是独立操作。" : "Gold rings only mark origins; a dark-green outer ring marks the current focus. Selection only inspects; rebuilding is separate."}</small></div>{explicitNetworkOriginNodes.length >= 2 && <div className="v2-multi-origin-intents" role="group" aria-label={locale === "zh" ? "多种子意图" : "Multi-origin intent"}>{(["shared", "bridge", "union"] as MultiOriginIntent[]).map((intent) => <button type="button" key={intent} className={multiOriginIntent === intent ? "active" : ""} onClick={() => { setMultiOriginIntent(intent); setPaperNetworkScope("multi-seed"); }}>{intent === "shared" ? (locale === "zh" ? "共同领域" : "Shared territory") : intent === "bridge" ? (locale === "zh" ? "跨域桥接" : "Bridges") : (locale === "zh" ? "并集比较" : "Union comparison")}</button>)}</div>}</>}
                  {paperNetworkMode !== "path" && (paperNetworkLoading || researchMap.paperNetwork.status === "building") && <div className="v2-paper-network-progress" role="status"><span><i /></span><div><strong>{paperNetworkBuildPhase === "pi" ? (locale === "zh" ? "真实关系已可浏览" : "Verified links are ready") : (locale === "zh" ? "正在核验真实引用" : "Verifying real citations")}</strong><p>{paperNetworkBuildPhase === "pi" ? (locale === "zh" ? `Pi 正在逐条补充语义关系；当前已有 ${researchMap.paperNetwork.citationEdgeCount + researchMap.paperNetwork.similarityEdgeCount} 条真实关系。建议阅读顺序由已保存的学习路径独立维护。` : `Pi is adding semantic links; ${researchMap.paperNetwork.citationEdgeCount + researchMap.paperNetwork.similarityEdgeCount} verified links are already visible. Reading order is maintained by the saved learning path.`) : (locale === "zh" ? "真实引用与文献耦合一旦核验完成，就会先出现在图上。" : "Verified citations and coupling links will appear before Pi analysis finishes.")}</p></div></div>}
                  {paperNetworkMode !== "path" && !paperNetworkLoading && ["partial", "error"].includes(researchMap.paperNetwork.status) && (() => { const notice = paperNetworkSourceNotice(researchMap.paperNetwork, locale); return notice ? <div className="v2-paper-network-note" role="status"><span /><div><strong>{notice.title}</strong><p>{notice.body}</p></div><button type="button" onClick={() => void refreshPaperNetwork("verified")}>{notice.action}</button></div> : null; })()}
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
                  <div className={`v2-paper-network-stage ${paperNetworkMode === "similarity" ? "discovery-mode" : "analysis-mode"} ${showNetworkPaperDrawer ? "has-drawer" : ""}`}>
                    {paperNetworkMode === "similarity" && <aside className="v2-paper-discovery-list" aria-label={locale === "zh" ? "论文发现列表" : "Paper discovery list"}>
                      <div className="v2-paper-discovery-tabs" role="group" aria-label={locale === "zh" ? "发现类型" : "Discovery type"}>{(["similar", "prior", "derivative"] as PaperDiscoveryTab[]).map((tab) => <button type="button" key={tab} aria-pressed={paperDiscoveryTab === tab} className={paperDiscoveryTab === tab ? "active" : ""} onClick={() => setPaperDiscoveryTab(tab)}><span>{tab === "similar" ? (locale === "zh" ? "相似论文" : "Similar") : tab === "prior" ? (locale === "zh" ? "前置奠基" : "Prior") : (locale === "zh" ? "后续发展" : "Derivative")}</span><b>{networkDiscoveryNodesByTab[tab].length}</b></button>)}</div>
                      <div className="v2-paper-discovery-scroll">{networkDiscoveryNodes.length ? networkDiscoveryNodes.map((node) => { const candidate = node.external; const decision = candidate ? researchNetworkDecisions[candidate.canonicalId] : undefined; const origin = effectiveNetworkOriginIds.includes(node.paper.id); const evidenceCount = candidate ? currentOriginEvidenceCount(candidate, effectiveNetworkOriginCanonicalIds) : 0; return <article key={node.paper.id} className={`${selectedNetworkPaperId === node.paper.id ? "selected" : ""} ${candidate ? "ghost" : "saved"}`} onPointerEnter={() => setHoveredNetworkPaperId(node.paper.id)} onPointerLeave={() => setHoveredNetworkPaperId(null)}><button type="button" className="v2-paper-discovery-select" onClick={() => setSelectedNetworkPaperId(node.paper.id)}><span>{origin ? (locale === "zh" ? "起点" : "Origin") : candidate ? decision === "accepted" ? (locale === "zh" ? "已收录" : "Added") : (locale === "zh" ? "待收录" : "Candidate") : (locale === "zh" ? "地图内" : "In map")}</span><strong>{node.paper.title}</strong><small>{[node.paper.authors, researchPaperYear(node.paper), node.paper.venue].filter(Boolean).join(" · ")}</small>{candidate && <em>{networkCandidateFitLabel(candidate.score, locale)} · {locale === "zh" ? `${evidenceCount} 个当前起点有独立关系证据` : `${evidenceCount} active origin(s) with independent relation evidence`}</em>}</button>{candidate && decision !== "accepted" && <footer><button type="button" disabled={decision === "saving"} onClick={() => void decideResearchNetworkCandidate(candidate, "accept")}>{decision === "saving" ? "…" : (locale === "zh" ? "收录" : "Add")}</button><button type="button" disabled={decision === "saving"} onClick={() => void decideResearchNetworkCandidate(candidate, "dismiss")}>{locale === "zh" ? "忽略" : "Dismiss"}</button></footer>}</article>; }) : <div className="v2-paper-discovery-empty"><strong>{researchNetworkResponse && researchNetworkHasNoNewCandidates(researchNetworkResponse) ? (locale === "zh" ? "本轮没有新的可推荐论文" : "No new papers to recommend in this pass") : paperDiscoveryTab === "prior" ? (locale === "zh" ? "暂无共同前置工作" : "No common prior works yet") : paperDiscoveryTab === "derivative" ? (locale === "zh" ? "暂无共同后续工作" : "No common derivative works yet") : (locale === "zh" ? "尚未发现外部候选" : "No external candidates yet")}</strong><p>{researchNetworkResponse && researchNetworkHasNoNewCandidates(researchNetworkResponse) ? (locale === "zh" ? "Pi 已检查当前起点周边；现有图谱和历史论文不会因此丢失。" : "Pi checked the current neighborhood; saved map papers remain available.") : (locale === "zh" ? "可以从起始论文继续发现，现有论文不会丢失。" : "Discover from an origin; saved papers remain intact.")}</p></div>}</div>
                    </aside>}
                    <div className="v2-paper-network-main">
                      {paperNetworkMode === "similarity" ? <><PaperNetworkGraph map={researchMap} mode="similarity" scope={paperNetworkScope} multiOriginIntent={multiOriginIntent} trackFilter={paperNetworkTrackId} locale={locale} selectedPaperId={selectedNetworkPaperId} hoveredPaperId={hoveredNetworkPaperId} originPaperIds={effectiveNetworkOriginIds} externalNodes={externalNetworkPaperNodes} externalSimilarityEdges={researchNetworkSimilarityEdges} paperStates={paperStateByCanonicalId} onSelect={(paperId) => setSelectedNetworkPaperId(paperId)} onHover={setHoveredNetworkPaperId} /><footer className="v2-paper-network-legend"><span><i className="focus" />{locale === "zh" ? "深绿外环：当前聚焦" : "Dark-green outer ring: current focus"}</span><span><i className="origin" />{locale === "zh" ? "金环：起始论文" : "Gold ring: origin paper"}</span><span><i className="similarity" />{locale === "zh" ? "距离 / 线宽：文献耦合强度" : "Distance / line width: bibliographic coupling"}</span><span><i className="discovery-fallback" />{locale === "zh" ? "中性虚线：引用或推荐发现线索（非耦合）" : "Neutral dashed line: citation or recommendation lead (not coupling)"}</span><span><i className="node-size" />{locale === "zh" ? "节点大小：被引量" : "Node size: citations"}</span><span><i className="year" />{locale === "zh" ? "颜色：发表年份（旧 → 新）" : "Color: publication year (older → newer)"}</span><span><i className="ghost" />{locale === "zh" ? "虚边节点：尚未收录" : "Dashed node: not yet added"}</span>{paperNetworkScope === "multi-seed" && <span><i className="shared-neighbor" />{locale === "zh" ? "双环：多个种子的共同邻居" : "Double ring: neighbor shared by multiple origins"}</span>}</footer></> : paperNetworkMode === "citations" ? <CitationFlowWorkbench map={researchMap} trackFilter={paperNetworkTrackId} locale={locale} selectedPaperId={selectedNetworkPaperId} onSelect={setSelectedNetworkPaperId} onExpandFocus={(node) => void generateResearchNetworkFrom(node)} onOpenFocus={(node) => recordMapPaperOpen(node.track.id)} onAskFocus={askAboutNetworkPaper} expanding={researchNetworkLoading} /> : <ReadingOrderWorkbench map={researchMap} trackFilter={paperNetworkTrackId} locale={locale} selectedPaperId={selectedNetworkPaperId} learningState={activeLearningState} learningLoading={activeLearningLoading} learningError={activeLearningError} learningAction={learningAction} onSelect={setSelectedNetworkPaperId} onToggleStep={(step) => void updateLearningStep(step)} onGenerate={(track) => void (track ? generateLearningPath(locale === "zh" ? track.titleZh : track.titleEn, track.id) : activeLearningState.path ? generateLearningPath(activeLearningState.path.target, activeLearningState.path.targetTrackId) : generateLearningPath(learningTarget))} onRetry={() => setLearningReloadNonce((current) => current + 1)} />}
                    </div>
                    {showNetworkPaperDrawer && selectedNetworkNode && <aside className="v2-paper-network-drawer" aria-label={locale === "zh" ? "论文详情" : "Paper details"}>
                      <button className="v2-paper-drawer-close" type="button" onClick={() => setSelectedNetworkPaperId(null)} aria-label={t.close}>×</button>
                      <p className="v2-kicker">{selectedNetworkNode.external ? (locale === "zh" ? "外部候选 · 尚未收入地图" : "External candidate · not in map") : researchRoleLabel(selectedNetworkNode.paper.role, locale)} · {researchPaperYear(selectedNetworkNode.paper)}</p>
                      <div className="v2-paper-drawer-state"><span className="focused">{locale === "zh" ? "当前聚焦" : "Current focus"}</span>{effectiveNetworkOriginIds.includes(selectedNetworkNode.paper.id) && <span className="origin">{locale === "zh" ? "起始论文" : "Origin paper"}</span>}{paperNetworkScope === "one-hop" && <span>{selectedVerifiableOneHopCount} {locale === "zh" ? "条可核验一跳" : "verified one-hop"}</span>}</div>
                      <h2>{selectedNetworkNode.paper.title}</h2>
                      <small>{[selectedNetworkNode.paper.authors, selectedNetworkNode.paper.venue, `${selectedNetworkNode.paper.citationCount} ${t.citations}`].filter(Boolean).join(" · ")}</small>
                      <div className="v2-paper-drawer-copy"><b>{t.introLabel}</b><p>{locale === "zh" ? selectedNetworkNode.paper.summaryZh : selectedNetworkNode.paper.summaryEn}</p><b>{locale === "zh" ? "路线位置" : "Place in the route"}</b><p>{locale === "zh" ? selectedNetworkNode.paper.rationaleZh : selectedNetworkNode.paper.rationaleEn}</p></div>
                      {selectedNetworkNode.external && <div className="v2-paper-candidate-decision"><span>{networkCandidateFitLabel(selectedNetworkNode.external.score, locale)} · {locale === "zh" ? `${currentOriginEvidenceCount(selectedNetworkNode.external, effectiveNetworkOriginCanonicalIds)} 个当前起点有独立关系证据` : `${currentOriginEvidenceCount(selectedNetworkNode.external, effectiveNetworkOriginCanonicalIds)} active origin(s) with independent relation evidence`}</span><div><button type="button" disabled={researchNetworkDecisions[selectedNetworkNode.external.canonicalId] === "saving" || researchNetworkDecisions[selectedNetworkNode.external.canonicalId] === "accepted"} onClick={() => void decideResearchNetworkCandidate(selectedNetworkNode.external!, "accept")}>{researchNetworkDecisions[selectedNetworkNode.external.canonicalId] === "accepted" ? (locale === "zh" ? "已收录" : "Added") : (locale === "zh" ? "收录到地图" : "Add to map")}</button><button type="button" disabled={researchNetworkDecisions[selectedNetworkNode.external.canonicalId] === "saving"} onClick={() => void decideResearchNetworkCandidate(selectedNetworkNode.external!, "dismiss")}>{locale === "zh" ? "忽略" : "Dismiss"}</button></div></div>}
                      {selectedModeNetworkRelations.length > 0 && <div className="v2-paper-drawer-relations"><b>{paperNetworkMode === "citations" ? (locale === "zh" ? "已核验引用" : "Verified citations") : (locale === "zh" ? "关键关系" : "Key relationships")}</b>{selectedModeNetworkRelations.map((edge) => { const outgoingCitation = edge.kind === "citation" && edge.sourcePaperId === selectedNetworkNode.paper.id; const otherId = edge.sourcePaperId === selectedNetworkNode.paper.id ? edge.targetPaperId : edge.sourcePaperId; const other = allNetworkPaperNodes.find((node) => node.paper.id === otherId); if (!other) return null; const relationLabel = edge.kind === "citation" ? outgoingCitation ? (locale === "zh" ? "本论文引用了" : "This paper cites") : (locale === "zh" ? "后续论文引用了本论文" : "Later paper cites this work") : networkRelationLabel(edge, locale); return <button type="button" key={edge.id} onClick={() => setSelectedNetworkPaperId(other.paper.id)}><span>{relationLabel} · {networkEvidenceLabel(edge, locale)}</span><strong>{other.paper.title}</strong><small>{locale === "zh" ? edge.relationshipZh : edge.relationshipEn}</small></button>; })}</div>}
                      {paperNetworkMode === "similarity" && <div className="v2-paper-origin-actions"><button type="button" className={paperNetworkScope === "one-hop" ? "active" : ""} onClick={() => setPaperNetworkScope(paperNetworkScope === "one-hop" ? "all" : "one-hop")}>{paperNetworkScope === "one-hop" ? (locale === "zh" ? "返回完整图谱" : "Back to full graph") : (locale === "zh" ? "查看可核验一跳" : "View verified one-hop")}</button><button type="button" onClick={() => void generateResearchNetworkFrom(selectedNetworkNode)} disabled={researchNetworkLoading || Boolean(selectedNetworkNode.external && researchNetworkDecisions[selectedNetworkNode.external.canonicalId] !== "accepted")}>{selectedNetworkNode.external && researchNetworkDecisions[selectedNetworkNode.external.canonicalId] !== "accepted" ? (locale === "zh" ? "收录后可生成新图" : "Add before rebuilding") : (locale === "zh" ? "以此生成新图" : "Build new graph from this")}</button><button type="button" onClick={() => addMultiNetworkOrigin(selectedNetworkNode)} disabled={effectiveNetworkOriginIds.includes(selectedNetworkNode.paper.id) || explicitNetworkOriginNodes.length >= 3 || Boolean(selectedNetworkNode.external && researchNetworkDecisions[selectedNetworkNode.external.canonicalId] !== "accepted")}>{effectiveNetworkOriginIds.includes(selectedNetworkNode.paper.id) ? (locale === "zh" ? "已是起点" : "Already an origin") : (locale === "zh" ? "加入联合种子" : "Add as origin")}</button></div>}
                      <footer><a href={selectedNetworkNode.paper.url || (selectedNetworkNode.paper.doi ? "https://doi.org/" + selectedNetworkNode.paper.doi : "#")} target="_blank" rel="noreferrer" onClick={() => recordMapPaperOpen(selectedNetworkNode.track.id)}>{t.openOriginal} ↗</a><button type="button" onClick={() => askAboutNetworkPaper(selectedNetworkNode)}>{locale === "zh" ? "让 Pi 解释" : "Ask Pi"}</button><button type="button" onClick={() => addNetworkPaperToLearningPath(selectedNetworkNode)}>{locale === "zh" ? "以此方向规划路径" : "Plan from this direction"}</button></footer>
                    </aside>}
                  </div>
                </section>}
              </>
            ) : <section className="v2-map-empty"><span>◎</span><h2>{locale === "zh" ? "暂时没有可展示的真实路线" : "No real route is available yet"}</h2><p>{locale === "zh" ? "Pi 不会用演示论文填充这里。稍后重新进入即可再次尝试。" : "Pi will not fill this area with demo papers. Return later to retry."}</p></section>}
          </main>
        )}

        {view === "thread-detail" && (
          <main className="v2-page v2-detail-page v2-map-detail v2-route-workspace">
            <button className="v2-back" type="button" onClick={() => navigate("threads")}>← {locale === "zh" ? "返回路线总览" : "Back to route overview"}</button>
            {selectedThread ? <>
              <section className="v2-route-workspace-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {directionRoleLabel(selectedThread.userRole, locale)}</p><h1>{locale === "zh" ? selectedThread.titleZh : selectedThread.titleEn}</h1><p>{locale === "zh" ? selectedThread.summaryZh : selectedThread.summaryEn}</p><div className="v2-route-workspace-meta"><span className={`v2-direction-heat ${selectedThread.heatLevel}`} title={directionHeatTitle(selectedThread, locale)}><i />{directionHeatLabel(selectedThread.heatLevel, locale)}</span><RouteOperationalBadge track={selectedThread} locale={locale} />{selectedThread.buildStatus !== "ready" && <span>{selectedThread.buildStatus === "partial" ? (locale === "zh" ? "部分可用" : "Partially available") : researchTrackBuildSummary(selectedThread, locale)}</span>}<span>{confirmedRouteEvidenceCount(selectedThread)} {locale === "zh" ? "篇已确认纳入" : "confirmed in route"}</span>{pendingRouteEvidenceCount(selectedThread) > 0 && <span>{pendingRouteEvidenceCount(selectedThread)} {locale === "zh" ? "篇待确认" : "pending"}</span>}</div></div></section>

              <ResearchLeadDecisionPanel track={selectedThread} problemState={researchProblemState} synthesis={researchSynthesis} locale={locale} onOpenWorkspace={setResearchRouteTab} onOpenToday={() => navigate("today")} onOpenLearning={() => openRouteLearningPath(selectedThread)} onScanGap={(origin) => void scanResearchRouteSignal(selectedThread, origin)} gapScanning={mapAction === `gap:${selectedThread.id}` || mapAction === `problem:${selectedThread.id}`} gapScanBlocked={Boolean(mapAction || mapBuildTrackId || mapIntelligenceTrackId || selectedThread.monitoringStatus === "paused")} />

              <div className="v2-route-workspace-tabs" role="group" aria-label={locale === "zh" ? "方向工作区" : "Route workspace"}>{(["problem", "assessment", "evidence", "gaps", "agenda"] as ResearchRouteTab[]).map((tab, tabIndex) => <button type="button" aria-pressed={researchRouteTab === tab} className={researchRouteTab === tab ? "active" : ""} key={tab} onClick={() => setResearchRouteTab(tab)}><span>{String(tabIndex + 1).padStart(2, "0")}</span><strong>{tab === "problem" ? (locale === "zh" ? "研究问题" : "Research problem") : tab === "assessment" ? (locale === "zh" ? "综合研判" : "Synthesis") : tab === "evidence" ? (locale === "zh" ? "证据链" : "Evidence chain") : tab === "gaps" ? (locale === "zh" ? "缺口与发现" : "Gaps & discovery") : (locale === "zh" ? "研究议程" : "Research agenda")}</strong>{tab === "problem" && researchProblemState?.problem?.status === "active" && <b>✓</b>}{tab === "evidence" && <b>{confirmedRouteEvidenceCount(selectedThread)}</b>}{tab === "gaps" && pendingRouteEvidenceCount(selectedThread) > 0 && <b>{pendingRouteEvidenceCount(selectedThread)}</b>}</button>)}</div>

              {researchRouteTab === "problem" && <ResearchProblemWorkbench key={`${selectedThread.id}:${researchProblemState?.problem?.id || "empty"}:${researchProblemState?.problem?.updatedAt || "pending"}`} state={researchProblemState} synthesis={researchSynthesis} loading={researchProblemLoading} action={researchProblemAction || (mapAction === `problem:${selectedThread.id}` ? "scan-problem" : null)} error={researchProblemError} locale={locale} onDraft={() => void draftResearchProblem()} onConfirm={(draft) => void confirmResearchProblem(draft)} onAssess={() => void assessResearchProblem()} onScanProblem={() => void scanResearchProblemGap(selectedThread)} onUpdateAction={(actionId, status) => void updateResearchProblemAction(actionId, status)} onExecuteAction={(item) => void executeResearchProblemAction(item)} />}
              {researchRouteTab === "assessment" && <ResearchSynthesisWorkbench track={selectedThread} synthesis={researchSynthesis} loading={researchSynthesisLoading} error={researchSynthesisError} locale={locale} onRefresh={() => void refreshResearchSynthesis(selectedThread)} onScanGap={() => void scanResearchRouteGap(selectedThread)} onExplain={() => askAboutResearchRoute(selectedThread, "gap")} />}

              {researchRouteTab === "evidence" && <section className="v2-route-workspace-panel v2-route-evidence-panel" role="tabpanel">
                <header><div><p className="v2-kicker">{locale === "zh" ? "路线论文与证据状态" : "ROUTE PAPERS & EVIDENCE STATUS"}</p><h2>{locale === "zh" ? "从奠基、转折走到当前前沿" : "From foundations and turning points to the frontier"}</h2></div><div className="v2-route-stage-counts">{(["foundation", "milestone", "frontier"] as ResearchTrackRole[]).map((role) => <span className={role} key={role}><i />{researchRoleLabel(role, locale)}<b>{selectedThread.papers.filter((paper) => paper.role === role).length}</b></span>)}</div></header>
                <div className="v2-route-evidence-chain">{(["foundation", "milestone", "frontier"] as ResearchTrackRole[]).map((role, roleIndex) => <section className={role} key={role}><header><span>{String(roleIndex + 1).padStart(2, "0")}</span><div><strong>{researchRoleLabel(role, locale)}</strong><small>{role === "foundation" ? (locale === "zh" ? "定义问题与基本工具" : "Defines the question and core tools") : role === "milestone" ? (locale === "zh" ? "改变路线走向的关键节点" : "Turning points that changed the route") : (locale === "zh" ? "当前活跃问题与方法" : "Current active questions and methods")}</small></div></header><div>{selectedThread.papers.filter((paper) => paper.role === role).map((paper) => <article key={paper.id}><header><span>{researchPaperYear(paper)}</span><small>{[paper.venue, `${paper.citationCount} ${t.citations}`].filter(Boolean).join(" · ")}</small></header><em className={`v2-route-provenance ${paper.provenance || "system_curated"}`}>{paper.provenance === "user_confirmed" ? (locale === "zh" ? "用户确认纳入" : "User confirmed in route") : (locale === "zh" ? "Pi 策展代表作" : "Pi-curated representative")}</em><h3>{paper.title}</h3><p>{locale === "zh" ? paper.rationaleZh : paper.rationaleEn}</p><footer><button type="button" onClick={() => askAboutRoutePaper(selectedThread, paper)}>{locale === "zh" ? "让 Pi 解释位置" : "Ask Pi about its place"}</button><a href={paper.url || (paper.doi ? "https://doi.org/" + paper.doi : "#")} target="_blank" rel="noreferrer" onClick={() => recordMapPaperOpen(selectedThread.id)}>{t.openOriginal} ↗</a>{paper.provenance !== "user_confirmed" && <button className="v2-route-node-deactivate" type="button" disabled={Boolean(mapAction)} onClick={() => void curateResearchTrackPaperNode(selectedThread, paper, "deactivated")}>{mapAction === `curate:${paper.id}` ? "…" : (locale === "zh" ? "跑题，停用节点" : "Off-topic · deactivate")}</button>}</footer></article>)}{!selectedThread.papers.some((paper) => paper.role === role) && <div className="v2-route-chain-empty"><span>＋</span><p>{locale === "zh" ? "这个阶段仍缺少有代表性的真实论文。" : "This stage still lacks a representative real paper."}</p><button type="button" onClick={() => { setResearchRouteTab("gaps"); }}>{locale === "zh" ? "去补证据" : "Fill the gap"} →</button></div>}</div></section>)}</div>
                {(selectedThread.deactivatedPapers || []).length > 0 && <details className="v2-route-deactivated-nodes"><summary><span><small>{locale === "zh" ? "保留在审计历史中" : "RETAINED IN AUDIT HISTORY"}</small><strong>{locale === "zh" ? "已停用路线节点" : "Deactivated route nodes"}</strong></span><b>{selectedThread.deactivatedPapers?.length || 0}</b></summary><div>{(selectedThread.deactivatedPapers || []).map((paper) => <article key={paper.id}><header><span>{locale === "zh" ? "不参与路线供稿" : "Excluded from active route supply"}</span><small>{paper.curationUpdatedAt ? formatNotificationTime(paper.curationUpdatedAt, locale) : ""}</small></header><h3>{paper.title}</h3><p>{locale === "zh" ? paper.curationReasonZh : paper.curationReasonEn}</p><footer><span>{routePaperCurationSourceLabel(paper, locale)} · {(paper.curationEvidence || []).length} {locale === "zh" ? "条审计证据" : "audit signals"}</span><button type="button" disabled={Boolean(mapAction)} onClick={() => void curateResearchTrackPaperNode(selectedThread, paper, "active")}>{mapAction === `curate:${paper.id}` ? "…" : (locale === "zh" ? "恢复节点" : "Restore node")}</button></footer></article>)}</div></details>}
              </section>}

                    {researchRouteTab === "gaps" && <section className="v2-route-workspace-panel v2-route-gap-panel" role="tabpanel"><header><div><p className="v2-kicker">{locale === "zh" ? "证据缺口" : "EVIDENCE GAP"}</p><h2>{locale === "zh" ? "缺什么，就继续找什么" : "Search only for what is missing"}</h2></div><div className="v2-route-evidence-status"><span><strong>{confirmedRouteEvidenceCount(selectedThread)}</strong>{locale === "zh" ? "已纳入" : "in route"}</span><span className={pendingRouteEvidenceCount(selectedThread) ? "pending" : ""}><strong>{pendingRouteEvidenceCount(selectedThread)}</strong>{locale === "zh" ? "待确认" : "pending"}</span></div></header>{selectedThread.intelligence ? <div className="v2-route-gap-layout"><article className="v2-route-gap-primary"><small>{locale === "zh" ? "主要缺口" : "PRIMARY GAP"}</small><h3>{locale === "zh" ? selectedThread.intelligence.evidenceGapZh : selectedThread.intelligence.evidenceGapEn}</h3><ResearchGapDiscoveryStatus track={selectedThread} locale={locale} />{selectedThread.intelligence.nextSearchQuery && <details className="v2-gap-query"><summary>{locale === "zh" ? "查看定向检索式" : "View targeted query"}<b>＋</b></summary><code>{selectedThread.intelligence.nextSearchQuery}</code></details>}<footer><button type="button" onClick={() => void scanResearchRouteGap(selectedThread)} disabled={Boolean(mapAction || mapBuildTrackId || selectedThread.monitoringStatus === "paused" || !selectedThread.intelligence.nextSearchQuery)}>{mapAction === `gap:${selectedThread.id}` ? (locale === "zh" ? "正在扫描…" : "Scanning…") : selectedThread.monitoringStatus === "paused" ? (locale === "zh" ? "恢复后扫描" : "Resume to scan") : (locale === "zh" ? "立即提前扫描" : "Run scan now")} →</button><button type="button" onClick={() => askAboutResearchRoute(selectedThread, "gap")}>{locale === "zh" ? "让 Pi 解释" : "Ask Pi"}</button></footer></article><aside><header><strong>{locale === "zh" ? "前沿代表作" : "Frontier representatives"}</strong><span>{selectedThread.papers.filter((paper) => paper.role === "frontier").length}</span></header>{selectedThread.papers.filter((paper) => paper.role === "frontier").slice(0, 3).map((paper) => <button type="button" key={paper.id} onClick={() => askAboutRoutePaper(selectedThread, paper)}><span>{researchPaperYear(paper)}</span><strong>{paper.title}</strong></button>)}{!selectedThread.papers.some((paper) => paper.role === "frontier") && <p>{locale === "zh" ? "当前还没有前沿代表作。" : "No frontier representative yet."}</p>}</aside></div> : <div className="v2-route-panel-empty"><span>◎</span><div><strong>{locale === "zh" ? "还没有可执行的证据缺口" : "No actionable evidence gap yet"}</strong><p>{locale === "zh" ? "先形成方向研判。" : "Build the direction assessment first."}</p></div><button type="button" onClick={() => void refreshDirectionIntelligence(selectedThread)} disabled={!selectedThread.papers.length || selectedThread.monitoringStatus === "paused"}>{selectedThread.monitoringStatus === "paused" ? (locale === "zh" ? "恢复后研判" : "Resume to assess") : (locale === "zh" ? "形成研判" : "Build assessment")} →</button></div>}</section>}

              {researchRouteTab === "agenda" && <section className="v2-route-workspace-panel v2-route-agenda-panel" role="tabpanel"><header><div><p className="v2-kicker">{locale === "zh" ? "由当前证据生成" : "GENERATED FROM CURRENT EVIDENCE"}</p><h2>{locale === "zh" ? "接下来可以阅读、追踪和验证什么" : "What to read, track, and verify next"}</h2></div><button type="button" onClick={() => askAboutResearchRoute(selectedThread, "agenda")}>{locale === "zh" ? "让 Pi 拆解成行动" : "Ask Pi to break it into actions"} →</button></header>{selectedThread.intelligence ? <div className="v2-route-agenda-grid"><article><span>01</span><small>{locale === "zh" ? "深入机会" : "DEEPEN"}</small><h3>{locale === "zh" ? selectedThread.intelligence.opportunityZh : selectedThread.intelligence.opportunityEn}</h3><button type="button" onClick={() => void expandResearchTrack(selectedThread)} disabled={Boolean(mapAction || mapBuildTrackId || selectedThread.monitoringStatus === "paused")}>{selectedThread.monitoringStatus === "paused" ? (locale === "zh" ? "恢复路线后深挖" : "Resume route to mine") : (locale === "zh" ? "继续深挖这条路线" : "Mine this route deeper")} →</button></article><article><span>02</span><small>{locale === "zh" ? "持续观察" : "WATCH"}</small><h3>{locale === "zh" ? selectedThread.intelligence.watchSignalZh : selectedThread.intelligence.watchSignalEn}</h3><button type="button" onClick={() => navigate("today")}>{locale === "zh" ? "去今日发现" : "Open today's discovery"} →</button></article><article><span>03</span><small>{locale === "zh" ? "补齐基础" : "BUILD KNOWLEDGE"}</small><h3>{locale === "zh" ? "把当前路线整理成循序渐进的真实论文学习路径" : "Turn this route into a progressive learning path of real papers"}</h3><button type="button" onClick={() => openRouteLearningPath(selectedThread)}>{locale === "zh" ? "生成学习路径" : "Build learning path"} →</button></article></div> : <div className="v2-route-panel-empty"><span>π</span><div><strong>{locale === "zh" ? "研判完成后才会生成研究议程" : "A research agenda appears after assessment"}</strong><p>{locale === "zh" ? "Pi 不会在没有路线证据时填充通用任务。" : "Pi will not fill this space with generic tasks without route evidence."}</p></div><button type="button" onClick={() => setResearchRouteTab("assessment")}>{locale === "zh" ? "回到当前研判" : "Open assessment"} →</button></div>}{selectedThreadChanges.length > 0 && <section className="v2-route-change-log"><header><strong>{locale === "zh" ? "这条路线最近的已确认变化" : "Recent confirmed changes in this route"}</strong><span>{selectedThreadChanges.length}</span></header>{selectedThreadChanges.map((change) => <article key={change.id}><span>{routeChangeKindLabel(change.kind).symbol}</span><div><small>{formatNotificationTime(change.createdAt, locale)}</small><strong>{change.kind === "new_evidence" ? change.paperTitle : (locale === "zh" ? change.titleZh : change.titleEn)}</strong><p>{locale === "zh" ? change.summaryZh : change.summaryEn}</p></div></article>)}</section>}</section>}

              <RouteManagementDrawer key={`${selectedThread.id}:${routeManagementNeedsAttention(selectedThread) ? "attention" : "quiet"}`} track={selectedThread} locale={locale}>
                <section className={`v2-route-role-strip ${selectedThread.userRole} ${selectedThread.monitoringStatus}`}><div><small>{locale === "zh" ? "当前定位" : "CURRENT ROLE"}</small><strong>{directionRoleLabel(selectedThread.userRole, locale)}</strong><p>{locale === "zh" ? "定位会改变后续扫描预算和路线优先级；暂停只停止新发现，不清除任何历史。" : "This role changes future discovery budget and priority; pausing only stops new discovery and clears no history."}</p></div><div className="v2-direction-role-control" role="group" aria-label={locale === "zh" ? "设置方向定位" : "Set direction role"}>{(["core", "support", "explore"] as ResearchDirectionRole[]).map((role) => <button type="button" className={selectedThread.userRole === role ? "active" : ""} key={role} onClick={() => void setResearchDirectionRole(selectedThread, role)} disabled={Boolean(mapAction)}>{directionRoleLabel(role, locale)}</button>)}<button type="button" className={`monitor-toggle ${selectedThread.monitoringStatus}`} onClick={() => void setResearchDirectionMonitoring(selectedThread, selectedThread.monitoringStatus === "paused" ? "active" : "paused")} disabled={Boolean(mapAction)}>{mapAction === `monitoring:${selectedThread.id}` ? "…" : selectedThread.monitoringStatus === "paused" ? (locale === "zh" ? "恢复路线" : "Resume route") : (locale === "zh" ? "暂停路线" : "Pause route")}</button></div><dl><div><dt>{locale === "zh" ? "研究深度" : "Depth"}</dt><dd>{selectedThread.depthScore}</dd></div><div><dt>{locale === "zh" ? "辅助价值" : "Support"}</dt><dd>{selectedThread.supportScore}</dd></div><div><dt>{locale === "zh" ? "近期证据" : "Recent"}</dt><dd>{selectedThread.recentPaperCount}</dd></div></dl></section>
                <div className="v2-route-management-actions"><button type="button" onClick={() => askAboutResearchRoute(selectedThread)}>{locale === "zh" ? "让 Pi 解释这条路线" : "Ask Pi about this route"}</button><button type="button" onClick={() => void expandResearchTrack(selectedThread)} disabled={Boolean(mapAction || mapBuildTrackId || selectedThread.monitoringStatus === "paused")}>{mapAction === selectedThread.id ? (locale === "zh" ? "正在补充…" : "Filling…") : selectedThread.monitoringStatus === "paused" ? (locale === "zh" ? "已暂停自动发现" : "Automatic discovery paused") : ["queued", "retryable", "empty", "failed"].includes(selectedThread.buildStatus) ? (locale === "zh" ? "重试补充这条路线" : "Retry this route") : selectedThread.buildStatus === "partial" ? (locale === "zh" ? "补全这条路线" : "Complete this route") : (locale === "zh" ? "继续填充这条路线" : "Continue this route")} ＋</button></div>
                <RouteDiscoveryLoop track={selectedThread} locale={locale} />
                <RouteEvolutionWorkbench track={selectedThread} locale={locale} action={mapAction} onPropose={() => void proposeResearchRouteEvolution(selectedThread)} onDecision={(revisionId, decision) => void decideResearchRouteEvolution(selectedThread, revisionId, decision)} />
              </RouteManagementDrawer>
            </> : <section className="v2-map-loading"><span>π</span><div><strong>{locale === "zh" ? "正在载入研究路线" : "Loading the research route"}</strong></div></section>}
          </main>
        )}

        {view === "learn" && (
          <main className="v2-page v2-learn-page">
            <section className="v2-learn-head"><h1>{t.learnTitle}</h1><div className="v2-learning-target-form"><input value={learningTarget} onChange={(event) => setLearningTarget(event.target.value)} placeholder={activeLearningState.suggestedTarget || (locale === "zh" ? "输入想进入的方向" : "Enter a research direction")} aria-label={t.learnTitle} /><button type="button" onClick={() => void generateLearningPath()} disabled={Boolean(learningAction) || activeLearningLoading || !learningTarget.trim()}>{learningAction === "generate" ? (locale === "zh" ? "Pi 正在规划…" : "Pi is planning…") : activeLearningState.path ? (locale === "zh" ? "按新证据更新" : "Update from evidence") : t.buildPath} →</button></div>{learningTargetTrackId && <div className="v2-learning-target-scope"><span>{locale === "zh" ? "当前方向" : "Current direction"}</span><strong>{researchMap.tracks.find((track) => track.id === learningTargetTrackId)?.[locale === "zh" ? "titleZh" : "titleEn"] || learningTarget}</strong><button type="button" onClick={() => { setLearningTargetTrackId(null); setLearningScopeDirty(true); learningIntentRef.current = null; }}>{locale === "zh" ? "使用全空间" : "Use full workspace"}</button></div>}<small>{activeLearningState.availablePaperCount} {locale === "zh" ? "篇质量已通过" : "quality-approved papers"}{activeLearningState.waitingQualityCount > 0 ? ` · ${activeLearningState.waitingQualityCount} ${locale === "zh" ? "篇评估中" : "in review"}` : ""}</small></section>
            {activeLearningLoading ? <section className="v2-learning-loading" role="status"><span>π</span><div><strong>{locale === "zh" ? "正在读取你的研究基础" : "Reading your research foundation"}</strong><p>{locale === "zh" ? "核对研究画像、方向深度与已收录论文。" : "Checking your research profile, direction depth, and collected papers."}</p><i><b /></i></div></section> : activeLearningError && !activeLearningState.path ? <div className="v2-learning-empty error" role="alert"><span>!</span><h2>{locale === "zh" ? "当前空间的学习路径没有载入" : "This space's learning path did not load"}</h2><p>{activeLearningError}</p><button type="button" onClick={() => setLearningReloadNonce((current) => current + 1)}>{locale === "zh" ? "重新载入" : "Retry"} →</button></div> : activeLearningState.path ? (
              <section className="v2-learning-path">
                {activeLearningPathDirectionMismatch && <div className="v2-reading-order-warning direction" role="status"><span>↔</span><p>{!learningTargetTrackId && learningScopeDirty ? (locale === "zh" ? `下面的旧路径限定于“${activeLearningState.path.target}”；你已切换为从全空间论文中规划。重新规划前，旧进度不会被冒充为全空间结果。` : `The saved path below is scoped to “${activeLearningState.path.target}”; you have switched to planning from the full workspace. Existing progress will not be presented as a workspace-wide result before replanning.`) : (locale === "zh" ? `下面是此前保存的“${activeLearningState.path.target}”路径；你现在准备规划“${activeLearningTargetTrack?.titleZh || learningTarget}”。点击重新规划前，旧进度不会被冒充为当前范围。` : `The path below was saved for “${activeLearningState.path.target}”; you are now preparing “${activeLearningTargetTrack?.titleEn || learningTarget}”. Existing progress will not be presented as the selected scope before replanning.`)}</p><button type="button" disabled={Boolean(learningAction)} onClick={() => void generateLearningPath(undefined, learningTargetTrackId)}>{learningTargetTrackId ? (locale === "zh" ? "按当前方向重新规划" : "Replan this direction") : (locale === "zh" ? "按全空间重新规划" : "Replan across the workspace")}</button></div>}
                {activeLearningError && <div className="v2-reading-order-warning" role="status"><span>!</span><p>{locale === "zh" ? "上次更新没有完成；下面仍是当前空间中已保存的版本。" : "The last update did not finish; the saved version for this space remains below."} {activeLearningError}</p><button type="button" onClick={() => setLearningReloadNonce((current) => current + 1)}>{locale === "zh" ? "重新载入" : "Reload"}</button></div>}
                <header className="v2-learning-summary"><div><p className="v2-kicker">{locale === "zh" ? `第 ${activeLearningState.path.revision} 版 · 证据驱动` : `REVISION ${activeLearningState.path.revision} · EVIDENCE DRIVEN`}</p><h2>{locale === "zh" ? activeLearningState.path.titleZh : activeLearningState.path.titleEn}</h2><p>{activeLearningStep ? (locale === "zh" ? `现在：${activeLearningStep.titleZh}` : `Now: ${activeLearningStep.titleEn}`) : (locale === "zh" ? "五个阶段已完成" : "All five stages are complete")}</p></div><div><strong>{activeLearningState.path.completedSteps}<small>/{activeLearningState.path.steps.length}</small></strong><span>{locale === "zh" ? "阶段完成" : "stages complete"}</span><i><b style={{ width: `${activeLearningState.path.steps.length ? Math.round(activeLearningState.path.completedSteps / activeLearningState.path.steps.length * 100) : 0}%` }} /></i><small>{activeLearningState.path.steps.reduce((sum, step) => sum + step.resources.length, 0)} {locale === "zh" ? "篇正式材料" : "formal papers"}</small></div></header>
                {activeLearningStep && <section className={`v2-learning-now page ${activeLearningStep.evidenceStatus}`}><header><span>{learningKindLabel(activeLearningStep.kind, locale)}</span><b>{learningEvidenceLabel(activeLearningStep, locale)}</b></header><h3>{locale === "zh" ? activeLearningStep.titleZh : activeLearningStep.titleEn}</h3><p className="v2-learning-goal">{locale === "zh" ? activeLearningStep.goalZh : activeLearningStep.goalEn}</p>{activeLearningStep.resources.length ? <div className="v2-learning-resources"><small>{locale === "zh" ? "现在读" : "READ NOW"}</small>{activeLearningStep.resources.map((resource) => { const href = learningResourceHref(resource); const content = <><span><strong>{resource.title}</strong><small>{[resource.authors, resource.venue, resource.publishedAt?.slice(0, 4)].filter(Boolean).join(" · ")}</small><em className="v2-learning-resource-signals">{learningResourceSignals(resource, locale).map((signal) => <i key={signal}>{signal}</i>)}</em></span><b>{href ? "↗" : "—"}</b></>; return href ? <a key={resource.id} href={href} target="_blank" rel="noreferrer">{content}</a> : <div className="unavailable" key={resource.id}>{content}</div>; })}</div> : <div className="v2-learning-evidence-gap"><strong>{locale === "zh" ? "这个阶段还缺少可靠论文" : "This stage still lacks reliable papers"}</strong><p>{locale === "zh" ? "已自动按缺口检索。来源失败会重试；候选通过共享质量评估后才会出现在这里。" : "Evidence search is automatic. Source failures retry; candidates appear here only after shared quality review."}</p></div>}<div className="v2-learning-now-guidance"><article><small>{locale === "zh" ? "为什么" : "WHY"}</small><p>{locale === "zh" ? activeLearningStep.whyZh : activeLearningStep.whyEn}</p></article><article><small>{locale === "zh" ? "读什么" : "READ"}</small><p>{locale === "zh" ? activeLearningStep.readFocusZh : activeLearningStep.readFocusEn}</p></article><article><small>{locale === "zh" ? "如何决定" : "DECIDE"}</small><p>{locale === "zh" ? activeLearningStep.checkpointZh : activeLearningStep.checkpointEn}</p></article></div><footer><span>{learningTime(activeLearningStep.estimatedMinutes, locale)}</span><button type="button" disabled={Boolean(learningAction) || (!activeLearningStep.resources.length && activeLearningStep.status !== "completed")} onClick={() => void updateLearningStep(activeLearningStep)}>{learningAction === activeLearningStep.id ? "…" : activeLearningStep.status === "completed" ? (locale === "zh" ? "恢复" : "Restore") : (locale === "zh" ? "完成本阶段" : "Complete stage")}</button></footer></section>}
                <div className="v2-learning-roadmap page">{activeLearningState.path.steps.map((step, index) => <article className={`${step.status} ${step.evidenceStatus}`} key={step.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{locale === "zh" ? step.titleZh : step.titleEn}</strong><small>{learningEvidenceLabel(step, locale)} · {step.resources.length} {locale === "zh" ? "篇" : "papers"}</small></div>{step.status === "completed" ? <button type="button" disabled={Boolean(learningAction)} onClick={() => void updateLearningStep(step)}>{locale === "zh" ? "恢复" : "Restore"}</button> : <b>{step.status === "active" ? (locale === "zh" ? "现在" : "Now") : ""}</b>}</article>)}</div>
                <footer className="v2-learning-footer"><button type="button" onClick={() => navigate("threads")}>{locale === "zh" ? "查看研究路线" : "Open research routes"} →</button></footer>
              </section>
            ) : <section className="v2-learning-empty"><span>◎</span><h2>{locale === "zh" ? "还没有学习路径" : "No learning path yet"}</h2><p>{locale === "zh" ? "输入研究方向即可开始。即使经典文献尚未齐全，Pi 也会先建立诚实的五阶段骨架，并自动补证。" : "Enter a direction to begin. Even when classic papers are missing, Pi creates an honest five-stage structure and searches the gaps."}</p></section>}
          </main>
        )}

        {view === "library" && (
          <main className="v2-page v2-library-page">
            <section className="v2-page-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)}</p><h1>{t.libraryTitle}</h1></div><div className="v2-library-head-actions"><a href={`/api/library?spaceId=${encodeURIComponent(activeSpace.id)}&format=bibtex&scope=accepted`}>BibTeX ↓</a><a href={`/api/library?spaceId=${encodeURIComponent(activeSpace.id)}&format=ris&scope=accepted`}>RIS / Zotero ↓</a></div></section>
            <div className="v2-library-tabs">
              <button className={libraryFilter === "inbox" ? "active" : ""} type="button" onClick={() => { setLibraryFilter("inbox"); setLibraryStageFilter("all"); setInboxFilter("all"); }}>{t.inbox}<span>{monitor?.historyCounts?.inbox || 0}</span></button>
              <button className={libraryFilter === "accepted" ? "active" : ""} type="button" onClick={() => { setLibraryFilter("accepted"); setLibraryStageFilter("all"); }}>{t.accepted}<span>{monitor?.historyCounts?.accepted || 0}</span></button>
              <button className={libraryFilter === "dismissed" ? "active" : ""} type="button" onClick={() => { setLibraryFilter("dismissed"); setLibraryStageFilter("all"); }}>{t.ignored}<span>{monitor?.historyCounts?.dismissed || 0}</span></button>
              <button className={libraryFilter === "all" && libraryStageFilter === "all" ? "active" : ""} type="button" onClick={() => { setLibraryFilter("all"); setLibraryStageFilter("all"); }}>{locale === "zh" ? "全部发现" : "All discoveries"}<span>{historyPapers.length}</span></button>
            </div>
            <div className="v2-library-toolbar">
              <label><span>⌕</span><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder={t.historySearch} aria-label={t.historySearch} /></label>
              <select value={librarySort} onChange={(event) => setLibrarySort(event.target.value as LibrarySort)} aria-label={locale === "zh" ? "历史记录排序" : "Sort history"}>
                <option value="priority">{t.sortPriority}</option><option value="newest">{t.sortNewest}</option><option value="quality">{t.sortQuality}</option>
              </select>
            </div>
            <div className="v2-library-list">
              {visibleLibraryPapers.map((paper) => (
                <article className={"v2-library-paper " + paper.userState} key={paper.id}>
                  <button className="v2-library-paper-main" type="button" onClick={() => openMonitorPaper(paper)}>
                    <div className="v2-library-paper-flags"><span className={"v2-history-state " + paper.userState}>{paper.userState === "unseen" ? t.unseen : paper.userState === "accepted" ? t.accepted : paper.userState === "dismissed" ? t.ignored : paper.userState === "snoozed" ? t.snoozed : t.seenPending}</span><span className={`v2-tier-badge ${paper.qualityStage === "recommended" ? paper.recommendationTier || "browse" : paper.qualityStage === "reviewing" ? "reserve" : "browse"}`}>{paper.qualityStage === "recommended" ? recommendationTierLabel(paper.recommendationTier || "browse", locale) : paper.qualityStage === "reviewing" ? recommendationAuditPhaseLabel(paper, locale) : archiveQualityStagePresentation(paper.qualityStage, locale).label}</span><span>{readingStatusLabel(paper.readingStatus || "unread", locale)}</span><PaperDiscoverySourceBadge paper={paper} locale={locale} /></div>
                    <h2>{paper.title}</h2><p className="v2-library-paper-meta">{paper.authors} · {paper.venue} · {formatPaperDate(paper.publishedAt, locale)}</p>
                    <p className="v2-library-paper-why"><b>{isRecommendationQualityStage(paper.qualityStage) ? t.whySuitable : locale === "zh" ? "归档说明" : "Archive note"}</b>{isRecommendationQualityStage(paper.qualityStage) ? ((locale === "zh" ? paper.whyReadZh : paper.whyReadEn) || (locale === "zh" ? "正在共享质量队列中核对，尚未形成正式推荐。" : "This candidate is still being checked in the shared quality queue and is not yet a formal recommendation.")) : archiveQualityStagePresentation(paper.qualityStage, locale).note}</p>
                    <footer><b>{t.viewAnalysis} →</b></footer>
                  </button>
                  <div className="v2-library-paper-actions">
                    <select value={paper.readingStatus || "unread"} onChange={(event) => void updateReadingProgress(paper, event.target.value as MonitorPaper["readingStatus"])} aria-label={locale === "zh" ? "阅读状态" : "Reading status"}><option value="unread">{readingStatusLabel("unread", locale)}</option><option value="queued">{readingStatusLabel("queued", locale)}</option><option value="reading">{readingStatusLabel("reading", locale)}</option><option value="read">{readingStatusLabel("read", locale)}</option><option value="mastered">{readingStatusLabel("mastered", locale)}</option><option value="cited">{readingStatusLabel("cited", locale)}</option></select>
                    {!["accepted", "dismissed"].includes(paper.userState) ? <><button type="button" onClick={() => requestPaperDecision(paper, "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => saveFeedback(paper, "later")}>◷ {t.readLater}</button><button type="button" onClick={() => requestPaperDecision(paper, "not_relevant")}>× {t.notRelevant}</button></> : <button type="button" onClick={() => returnPaperToInbox(paper)}>↶ {t.returnPending}</button>}
                    <button type="button" onClick={() => shareSnapshot("paper", [paper])} disabled={Boolean(sharingSnapshot)}>↗ {t.sharePaper}</button>
                  </div>
                </article>
              ))}
              {visibleLibraryPapers.length < libraryPapers.length && <button className="v2-library-load-more" type="button" onClick={() => setLibraryVisibleCount((count) => count + 60)}>{locale === "zh" ? `继续显示（剩余 ${libraryPapers.length - visibleLibraryPapers.length} 篇）` : `Show more (${libraryPapers.length - visibleLibraryPapers.length} remaining)`}</button>}
              {!libraryPapers.length && <p className="v2-monitor-empty">{scanIsActive ? scanPhase : locale === "zh" ? "这个分类暂时没有论文。未处理的推荐不会因为错过一天而消失。" : "No papers are in this category yet. Pending recommendations do not disappear when you miss a day."}</p>}
            </div>
          </main>
        )}

        {view === "memory" && (
          <main className="v2-page">
            <section className="v2-page-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {activeSpace.memberName}</p><h1>{t.memoryTitle}</h1><p>{t.memoryIntro}</p></div><button type="button" onClick={openResearchImport}>＋ {t.importResearch}</button></section>
            <section className="v2-import-memory-card">
              <div><span>π</span><div><p className="v2-kicker">{t.importResearch}</p><h2>{confirmedProfile ? (locale === "zh" ? confirmedProfile.primaryDirectionZh : confirmedProfile.primaryDirectionEn) : t.importIntro}</h2></div></div>
              <p>{confirmedProfile ? (locale === "zh" ? confirmedProfile.summaryZh : confirmedProfile.summaryEn) : t.importIntro}</p>
              <div className="v2-import-safety-inline"><b>!</b><span><strong>{t.importSafetyTitle}</strong><small>{t.importSafetyBody}</small></span></div>
              <button type="button" onClick={openResearchImport}>{confirmedProfile ? (locale === "zh" ? "继续导入资料" : "Import more materials") : t.importResearch} →</button>
            </section>
            <section className="v2-layered-memory"><header><div><p className="v2-kicker">π {locale === "zh" ? "分层研究记忆" : "Layered research memory"}</p><h2>{locale === "zh" ? "你说过的，与 Pi 推断的，分开保存" : "What you said and what Pi inferred stay separate"}</h2></div><small>{locale === "zh" ? "有效阅读行为会形成可撤销假设；单纯曝光不计入" : "Qualified reading behavior forms revisable hypotheses; exposure alone does not count"}</small></header><div><section><h3>{locale === "zh" ? "明确偏好" : "Explicit evidence"}<span>{explicitPreferenceSignals.length}</span></h3>{explicitPreferenceSignals.slice(0, 8).map((signal) => <article key={signal.id}><div><strong>{locale === "zh" ? signal.labelZh : signal.labelEn}</strong><small>{signal.evidence}</small></div><b>{signal.effectiveConfidence}%</b></article>)}{!explicitPreferenceSignals.length && <p>{locale === "zh" ? "对论文标记“适合”或“不相关”时选择原因，这里会形成长期偏好。" : "Choose a reason when accepting or dismissing a paper to build durable preferences."}</p>}</section><section><h3>{locale === "zh" ? "Pi 的推断" : "Pi inferences"}<span>{inferredPreferenceSignals.length}</span></h3>{inferredPreferenceSignals.slice(0, 8).map((signal) => <article key={signal.id}><div><strong>{locale === "zh" ? signal.labelZh : signal.labelEn}</strong><small>{signal.evidence}</small></div><b>{signal.effectiveConfidence}%</b><button type="button" onClick={() => dismissInferredSignal(signal.id)} aria-label={locale === "zh" ? "停用这条推断" : "Disable this inference"}>×</button></article>)}{!inferredPreferenceSignals.length && <p>{locale === "zh" ? "深读、访问原文、向 Pi 提问或确认导入资料后，有证据的兴趣假设会出现在这里。" : "Grounded interest hypotheses appear after deeper reading, original-paper visits, questions to Pi, or confirmed imports."}</p>}</section></div></section>
            <section className="v2-reading-memory"><header><div><p className="v2-kicker warm">π {locale === "zh" ? "从阅读中沉淀" : "LEARNING FROM READING"}</p><h2>{locale === "zh" ? "读过的论文正在改变后续推荐" : "What you read is shaping future discovery"}</h2><p>{locale === "zh" ? "Pi 只在你主动保存阅读笔记时提取结论、方法、问题和研究连接；原笔记与 AI 推断分开保存。" : "Pi extracts conclusions, methods, questions, and research links only when you explicitly save a note. Your note remains separate from AI inference."}</p></div><strong>{monitor?.readingMemories?.filter((memory) => memory.analysisStatus === "ready").length || 0}</strong></header><div>{monitor?.readingMemories?.map((memory) => { const methods = locale === "zh" ? memory.methodsZh : memory.methodsEn; const questions = locale === "zh" ? memory.questionsZh : memory.questionsEn; const connections = locale === "zh" ? memory.connectionsZh : memory.connectionsEn; return <article className={memory.analysisStatus} key={memory.paperId}><header><span>{readingStatusLabel(memory.readingStatus as MonitorPaper["readingStatus"], locale)}</span><b>{memory.analysisStatus === "ready" ? "π " + modelDisplayName(memory.model) : memory.analysisStatus === "error" ? (locale === "zh" ? "待重试" : "Retry needed") : (locale === "zh" ? "等待分析" : "Pending")}</b></header><h3>{memory.title}</h3>{memory.analysisStatus === "ready" ? <><p>{locale === "zh" ? memory.takeawayZh : memory.takeawayEn}</p>{Boolean(methods.length) && <dl><dt>{locale === "zh" ? "可复用方法" : "Reusable methods"}</dt><dd>{methods.slice(0, 3).map((item) => <i key={item}>{item}</i>)}</dd></dl>}{Boolean(questions.length) && <dl><dt>{locale === "zh" ? "仍待解决" : "Open questions"}</dt><dd>{questions.slice(0, 2).map((item) => <i key={item}>{item}</i>)}</dd></dl>}{Boolean(connections.length) && <small>{locale === "zh" ? "与当前研究的连接：" : "Connection to your work: "}{connections[0]}</small>}</> : <p>{memory.noteExcerpt || (locale === "zh" ? "笔记已保存。配置可用模型后可重新沉淀。" : "The note is saved and can be synthesized when the model is available.")}</p>}<footer><span>{memory.venue}</span><button type="button" onClick={() => { const paper = historyPapers.find((item) => item.id === memory.paperId); if (paper) openMonitorPaper(paper); }}>{locale === "zh" ? "打开论文" : "Open paper"} →</button></footer></article>; })}{!monitor?.readingMemories?.length && <div className="v2-reading-memory-empty"><span>◎</span><p>{locale === "zh" ? "在论文详情中写下具体阅读笔记并点击“保存并沉淀”，这里就会形成可持续使用的研究记忆。" : "Write a concrete note in a paper detail and choose “Save to research memory” to build durable memory here."}</p></div>}</div></section>
            <div className="v2-memory-grid">
              <section><span>01</span><h2>{t.interestMemory}</h2><p>{locale === "zh" ? "由用户确认的持续关注、子方向与检索主题。" : "User-confirmed sustained interests, subdirections, and discovery topics."}</p><div className="v2-tags">{confirmedProfile ? [...confirmedProfile.subdirections, ...confirmedProfile.interests].slice(0, 10).map((item, index) => <i key={index}>{locale === "zh" ? item.labelZh : item.labelEn}</i>) : <small>{locale === "zh" ? "尚未导入已确认的研究资料" : "No confirmed research materials yet"}</small>}</div></section>
              <section><span>02</span><h2>{t.knowledgeMemory}</h2><p>{locale === "zh" ? "Pi 只把有材料证据的内容当作已有知识。" : "Pi treats a topic as known only when the imported material supports it."}</p><div className="v2-knowledge-lines">{confirmedProfile?.knowledge.length ? confirmedProfile.knowledge.slice(0, 5).map((item, index) => <div key={index}><b>{locale === "zh" ? item.labelZh : item.labelEn}</b><i><em style={{ width: `${item.confidence}%` }} /></i></div>) : <small>{locale === "zh" ? "等待有证据的知识画像" : "Waiting for evidence-backed knowledge"}</small>}</div></section>
              <section><span>03</span><h2>{t.activityMemory}</h2><p>{locale === "zh" ? "资料导入与论文反馈共同构成当前空间的记忆。" : "Material imports and paper feedback jointly shape this space's memory."}</p><dl><div><dt>{locale === "zh" ? "已确认导入" : "Confirmed imports"}</dt><dd>{researchImports.filter((item) => item.status === "confirmed").length}</dd></div><div><dt>{t.profileSources}</dt><dd>{latestConfirmedImport?.fileNames.length || 0}</dd></div></dl></section>
              <section><span>04</span><h2>{t.preferenceMemory}</h2><p>{locale === "zh" ? "尚未解决的问题会影响论文筛选和适读理由。" : "Unresolved questions influence screening and reading rationales."}</p><div className="v2-preferences">{confirmedProfile?.openQuestions.length ? confirmedProfile.openQuestions.slice(0, 4).map((item, index) => <i key={index}><b>{item.confidence}%</b> {locale === "zh" ? item.labelZh : item.labelEn}</i>) : <small>{locale === "zh" ? "尚无已确认的开放问题" : "No confirmed open questions yet"}</small>}</div></section>
            </div>
            {confirmedProfile?.researchOpportunities.length ? <section className="v2-memory-opportunities"><div className="v2-section-title"><div><p className="v2-kicker warm">{t.futureDirections}</p><h2>{locale === "zh" ? "从已有工作向外延伸" : "Extensions grounded in existing work"}</h2></div><span>{confirmedProfile.researchOpportunities.length}</span></div><div>{confirmedProfile.researchOpportunities.map((item, index) => <article key={index}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{locale === "zh" ? item.titleZh : item.titleEn}</h3><p>{locale === "zh" ? item.rationaleZh : item.rationaleEn}</p><ul>{(locale === "zh" ? item.startingPointsZh : item.startingPointsEn).slice(0, 3).map((point) => <li key={point}>{point}</li>)}</ul><small>{t.evidenceConfidence} {item.confidence}% · {item.evidenceFiles.join(" · ")}</small></div></article>)}</div></section> : null}
            <section className="v2-isolation-card"><div><span>◎</span><div><p className="v2-kicker">{t.isolationBoundary}</p><h2>{defaultSpaceName(activeSpace.name, locale)}</h2></div></div><p>{t.isolationBody}</p><small>{t.accountNote}</small><button type="button" onClick={() => setSpaceDialog(true)}>{t.switchSpace} →</button></section>
            <footer className="v2-lab-attribution"><span>{locale === "zh" ? "研究团队" : "Research team"}</span><Image src="/pi-lab-logo.png" width={78} height={25} alt="P&amp;I Lab" /></footer>
          </main>
        )}

        {view === "paper-detail" && selectedMonitorPaper && (
          <main className="v2-page v2-paper-detail">
            <button className="v2-back" type="button" onClick={() => navigate(paperReturnView)}>← {paperReturnView === "library" ? t.library : t.paperBack}</button>
            <section className="v2-paper-head"><div className="v2-paper-top"><span className={`v2-tier-badge ${selectedMonitorPaper.qualityStage === "recommended" ? selectedMonitorPaper.recommendationTier || "browse" : selectedMonitorPaper.qualityStage === "reviewing" ? "reserve" : "browse"}`}>{selectedMonitorPaper.qualityStage === "recommended" ? recommendationTierLabel(selectedMonitorPaper.recommendationTier || "browse", locale) : selectedMonitorPaper.qualityStage === "reviewing" ? recommendationAuditPhaseLabel(selectedMonitorPaper, locale) : archiveQualityStagePresentation(selectedMonitorPaper.qualityStage, locale).label}</span>{isRecommendationQualityStage(selectedMonitorPaper.qualityStage) && <span>{readDepthLabel(selectedMonitorPaper.readDepth || "focused", locale)} · {selectedMonitorPaper.readMinutes || 15} min</span>}{selectedMonitorPaper.priorityVenue && <span className="v2-real-badge">◆ {t.priorityVenueLabel}</span>}<span>{monitorPaperHorizonLabel(selectedMonitorPaper, locale)}</span><span>{selectedMonitorPaper.analysisSource === "deepseek" ? "π " + t.aiBrief : t.metadataBrief}</span><PaperDiscoverySourceBadge paper={selectedMonitorPaper} locale={locale} /><RecommendationVerificationBadge paper={selectedMonitorPaper} locale={locale} /><RouteDiscoveryBadge paper={selectedMonitorPaper} locale={locale} /></div><h1>{selectedMonitorPaper.title}</h1><p>{selectedMonitorPaper.authors}</p><small>{selectedMonitorPaper.venue} · {formatPaperDate(selectedMonitorPaper.publishedAt, locale)}</small><div><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "save")}>{(saved[activeSpace.id + ":" + selectedMonitorPaper.id] ?? selectedMonitorPaper.saved) ? "★ " + t.saved : "☆ " + t.save}</button><button type="button" onClick={() => requestPaperDecision(selectedMonitorPaper, "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "later")}>◷ {t.readLater}</button><button type="button" onClick={() => requestPaperDecision(selectedMonitorPaper, "not_relevant")}>× {t.notRelevant}</button><button type="button" onClick={() => askAboutMonitorPaper(selectedMonitorPaper)}>π {t.askAboutPaper}</button><button type="button" onClick={() => shareSnapshot("paper", [selectedMonitorPaper])} disabled={Boolean(sharingSnapshot)}>↗ {sharingSnapshot === selectedMonitorPaper.id ? t.creatingShare : t.sharePaper}</button><a className="v2-original-link" href={selectedMonitorPaper.url || (selectedMonitorPaper.doi ? "https://doi.org/" + selectedMonitorPaper.doi : "#")} target="_blank" rel="noreferrer" onClick={() => recordPaperEngagement(selectedMonitorPaper, "original_click", { context: "paper_detail" })}>{t.openOriginal} ↗</a></div></section>
            <div className="v2-paper-detail-grid">
              <div>
                <section className="v2-content-section v2-recommendation"><p className="v2-kicker warm">{isRecommendationQualityStage(selectedMonitorPaper.qualityStage) ? t.whySuitable : archiveQualityStagePresentation(selectedMonitorPaper.qualityStage, locale).kicker}</p><h2>{isRecommendationQualityStage(selectedMonitorPaper.qualityStage) ? ((locale === "zh" ? selectedMonitorPaper.whyReadZh : selectedMonitorPaper.whyReadEn) || (locale === "zh" ? "仍在共享质量队列中核对，尚未形成正式推荐。" : "Still under review in the shared quality queue; this is not yet a formal recommendation.")) : archiveQualityStagePresentation(selectedMonitorPaper.qualityStage, locale).note}</h2><div><span>{t.currentSpace}</span><strong>{defaultSpaceName(activeSpace.name, locale)}</strong>{selectedMonitorPaper.qualityStage === "recommended" && <><span>{t.qualityScore}</span><strong>{displayQualityScore(selectedMonitorPaper.qualityScore)}</strong></>}</div></section>
                <RouteImpactNote paper={selectedMonitorPaper} locale={locale} detail />
                {isRecommendationQualityStage(selectedMonitorPaper.qualityStage) && selectedMonitorPaper.researchProblemId && <section className="v2-content-section v2-paper-problem-impact"><header><p className="v2-kicker">π {locale === "zh" ? "与当前研究问题的关系" : "ACTIVE RESEARCH PROBLEM"}</p><div><span>{locale === "zh" ? "问题贴合" : "Problem fit"}<b>{selectedMonitorPaper.problemFitScore}</b></span><span>{locale === "zh" ? "降低不确定性" : "Uncertainty reduction"}<b>{selectedMonitorPaper.uncertaintyReductionScore}</b></span><span>{locale === "zh" ? "可行动性" : "Actionability"}<b>{selectedMonitorPaper.actionabilityScore}</b></span></div></header><h2>{locale === "zh" ? selectedMonitorPaper.researchProblemImpactZh : selectedMonitorPaper.researchProblemImpactEn}</h2><aside><small>{locale === "zh" ? "读完后应该决定" : "DECISION AFTER READING"}</small><strong>{locale === "zh" ? selectedMonitorPaper.researchDecisionZh : selectedMonitorPaper.researchDecisionEn}</strong></aside></section>}
                {Boolean(locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn) && <section className="v2-content-section"><p className="v2-kicker">{t.introLabel}</p><h2>{locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn}</h2></section>}
                {isRecommendationQualityStage(selectedMonitorPaper.qualityStage) && <section className="v2-paper-analysis"><header><p className="v2-kicker">π {locale === "zh" ? "深度阅读导航" : "DEEP READING GUIDE"}</p><h2>{locale === "zh" ? "先理解它解决了什么，再决定读到多深" : "Understand what it resolves before choosing how deeply to read"}</h2></header><div>
                  <article><small>{locale === "zh" ? "研究问题" : "Research problem"}</small><p>{(locale === "zh" ? selectedMonitorPaper.problemZh : selectedMonitorPaper.problemEn) || (locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn)}</p></article>
                  <article><small>{locale === "zh" ? "方法与证据" : "Method & evidence"}</small><p>{(locale === "zh" ? selectedMonitorPaper.methodZh : selectedMonitorPaper.methodEn) || (locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn)}</p></article>
                  <article><small>{locale === "zh" ? "主要贡献" : "Main contribution"}</small><p>{(locale === "zh" ? selectedMonitorPaper.contributionZh : selectedMonitorPaper.contributionEn) || (locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn)}</p></article>
                  <article className="caution"><small>{locale === "zh" ? "限制与不确定性" : "Limits & uncertainty"}</small><p>{(locale === "zh" ? selectedMonitorPaper.limitationsZh : selectedMonitorPaper.limitationsEn) || (locale === "zh" ? "当前元数据不足以支持更具体的限制判断，建议核对原文。" : "Available metadata is insufficient for a more specific limitation assessment; verify against the paper.")}</p></article>
                  <article className="focus"><small>{locale === "zh" ? "阅读时重点看" : "What to focus on"}</small><p>{(locale === "zh" ? selectedMonitorPaper.readingFocusZh : selectedMonitorPaper.readingFocusEn) || (locale === "zh" ? selectedMonitorPaper.whyReadZh : selectedMonitorPaper.whyReadEn)}</p></article>
                </div>{Boolean((locale === "zh" ? selectedMonitorPaper.researchQuestionsZh : selectedMonitorPaper.researchQuestionsEn)?.length) && <footer><small>{locale === "zh" ? "可以继续追问" : "Questions to pursue"}</small><ol>{(locale === "zh" ? selectedMonitorPaper.researchQuestionsZh : selectedMonitorPaper.researchQuestionsEn).map((question) => <li key={question}>{question}</li>)}</ol></footer>}</section>}
                <section className="v2-content-section"><p className="v2-kicker">{isRecommendationQualityStage(selectedMonitorPaper.qualityStage) ? t.recommendationSignals : locale === "zh" ? "发现与评审记录" : "DISCOVERY & REVIEW RECORD"}</p><dl className="v2-real-signals"><div><dt>{t.relevanceScoreLabel}</dt><dd>{selectedMonitorPaper.relevanceScore}</dd></div>{selectedMonitorPaper.qualityStage === "recommended" && <div><dt>{t.qualityScore}</dt><dd>{displayQualityScore(selectedMonitorPaper.qualityScore)}</dd></div>}{selectedMonitorPaper.qualityStage === "reviewed" && selectedMonitorPaper.screeningReason && <div><dt>{locale === "zh" ? "未入选原因" : "Why it was not selected"}</dt><dd>{selectedMonitorPaper.screeningReason}</dd></div>}<div><dt>{t.citations}</dt><dd>{selectedMonitorPaper.citationCount}</dd></div><div><dt>{t.prioritySources}</dt><dd>{selectedMonitorPaper.priorityVenue ? t.priorityVenueLabel : "—"}</dd></div><div><dt>{t.sourceRecord}</dt><dd>{selectedMonitorPaper.discoverySources?.length ? selectedMonitorPaper.discoverySources.map((source) => locale === "zh" ? source.labelZh : source.labelEn).join(" · ") : selectedMonitorPaper.analysisSource === "deepseek" ? t.aiBrief : t.metadataBrief}</dd></div></dl></section>
              </div>
              <aside className="v2-detail-aside v2-real-detail-aside"><p className="v2-kicker">{locale === "zh" ? "阅读工作台" : "READING WORKBENCH"}</p><label className="v2-reading-field"><span>{locale === "zh" ? "阅读状态" : "Reading status"}</span><select value={selectedMonitorPaper.readingStatus || "unread"} onChange={(event) => void updateReadingProgress(selectedMonitorPaper, event.target.value as MonitorPaper["readingStatus"], paperNoteDraft)}><option value="unread">{readingStatusLabel("unread", locale)}</option><option value="queued">{readingStatusLabel("queued", locale)}</option><option value="reading">{readingStatusLabel("reading", locale)}</option><option value="read">{readingStatusLabel("read", locale)}</option><option value="mastered">{readingStatusLabel("mastered", locale)}</option><option value="cited">{readingStatusLabel("cited", locale)}</option></select></label><label className="v2-reading-field"><span>{locale === "zh" ? "我的阅读笔记" : "My reading note"}</span><textarea value={paperNoteDraft} maxLength={3000} onChange={(event) => setPaperNoteDraft(event.target.value)} placeholder={locale === "zh" ? "记录可复用的方法、疑问或与自己项目的连接…" : "Capture reusable methods, questions, or links to your work…"} /></label><small className="v2-memory-hint">{locale === "zh" ? "保存时 Pi 会提取可复用结论、方法、问题与研究连接；相同笔记不会重复消耗 Token。" : "When saved, Pi extracts reusable conclusions, methods, questions, and research links. Identical notes are not analyzed twice."}</small><button className="v2-save-note" type="button" disabled={readingMemoryAnalyzing || !paperNoteDraft.trim()} onClick={() => void updateReadingProgress(selectedMonitorPaper, selectedMonitorPaper.readingStatus || "queued", paperNoteDraft, true)}>{readingMemoryAnalyzing ? (locale === "zh" ? "Pi 正在沉淀…" : "Pi is synthesizing…") : (locale === "zh" ? "保存并沉淀到研究记忆" : "Save to research memory")}</button><dl><div><dt>{t.currentSpaceFit}</dt><dd>{monitorPaperHorizonLabel(selectedMonitorPaper, locale)}</dd></div>{isRecommendationQualityStage(selectedMonitorPaper.qualityStage) ? <div><dt>{locale === "zh" ? "建议投入" : "Suggested time"}</dt><dd>{selectedMonitorPaper.readMinutes || 15} min · {readDepthLabel(selectedMonitorPaper.readDepth || "focused", locale)}</dd></div> : <div><dt>{locale === "zh" ? "评审状态" : "Review state"}</dt><dd>{archiveQualityStagePresentation(selectedMonitorPaper.qualityStage, locale).label}</dd></div>}<div><dt>{t.status}</dt><dd>{selectedMonitorPaper.venue}</dd></div><div><dt>{t.added}</dt><dd>{formatPaperDate(selectedMonitorPaper.publishedAt, locale)}</dd></div>{selectedMonitorPaper.doi && <div><dt>DOI</dt><dd>{selectedMonitorPaper.doi}</dd></div>}</dl><a className="v2-original-link wide" href={selectedMonitorPaper.url || (selectedMonitorPaper.doi ? "https://doi.org/" + selectedMonitorPaper.doi : "#")} target="_blank" rel="noreferrer" onClick={() => recordPaperEngagement(selectedMonitorPaper, "original_click", { context: "paper_detail" })}>{t.openOriginal} ↗</a><button type="button" onClick={() => askAboutMonitorPaper(selectedMonitorPaper)}>{t.askAboutPaper} →</button></aside>
            </div>
          </main>
        )}
      </div>

      {spaceDialog && (
        <div className="v2-modal" role="dialog" aria-modal="true" aria-label={t.spaceDialogTitle}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => setSpaceDialog(false)} />
          <div className="v2-space-modal">
            <div className="v2-modal-head"><div><p className="v2-kicker">{t.workspaceLabel}</p><h2>{t.spaceDialogTitle}</h2><p>{t.spaceDialogIntro}</p></div><button type="button" onClick={() => setSpaceDialog(false)}>×</button></div>
            <div className="v2-space-list">
              {spaces.map((space, index) => (
                <button type="button" key={space.id} className={space.id === activeSpace.id ? "active" : ""} onClick={() => switchSpace(space)}>
                  <span className={"v2-space-avatar " + space.accent}>{initials(space.name)}</span>
                  <span><strong>{defaultSpaceName(space.name, locale)}</strong><small>{space.memberName} · {index + 3} {t.threadsCount} · {17 + index * 5} {t.papersCount}</small><em>{space.description}</em></span>
                  <i>{space.id === activeSpace.id ? "✓" : "→"}</i>
                </button>
              ))}
            </div>
            <form className="v2-new-space-form" onSubmit={submitSpace}>
              <p className="v2-kicker">{t.createSpaceTitle}</p>
              <div><label><span>{t.spaceName}</span><input required value={newSpace.name} onChange={(event) => setNewSpace((current) => ({ ...current, name: event.target.value }))} placeholder={locale === "zh" ? "例如：量子信息" : "e.g. Quantum Information"} /></label><label><span>{t.memberName}</span><input value={newSpace.memberName} onChange={(event) => setNewSpace((current) => ({ ...current, memberName: event.target.value }))} placeholder={user.displayName} /></label></div>
              <label><span>{t.spaceScope}</span><textarea value={newSpace.description} onChange={(event) => setNewSpace((current) => ({ ...current, description: event.target.value }))} placeholder={locale === "zh" ? "这个空间只关注哪些具体问题？" : "Which specific questions belong in this space?"} /></label>
              <div className="v2-form-actions"><button type="button" onClick={() => setSpaceDialog(false)}>{t.cancel}</button><button type="submit" disabled={creatingSpace || !newSpace.name.trim()}>{creatingSpace ? t.creating : t.create} →</button></div>
            </form>
          </div>
        </div>
      )}

      {sourceSettingsOpen && monitor?.preferences && (
        <div className="v2-modal" role="dialog" aria-modal="true" aria-label={t.sourceSettingsTitle}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => setSourceSettingsOpen(false)} />
          <div className="v2-source-settings">
            <div className="v2-modal-head"><div><p className="v2-kicker">{t.prioritySources}</p><h2>{t.sourceSettingsTitle}</h2><p>{t.sourceSettingsIntro}</p></div><button type="button" onClick={() => setSourceSettingsOpen(false)}>×</button></div>
            <form onSubmit={(event) => { event.preventDefault(); void saveSourceSettings(false); }}>
              <div className="v2-detected-profile"><span>{t.detectedDomain}</span><strong>{locale === "zh" ? monitor.preferences.profileNameZh : monitor.preferences.profileNameEn}</strong><em>{monitor.preferences.userModified ? t.userCustomized : t.systemProvided}</em></div>
              <fieldset className="v2-exploration-mode"><legend>{locale === "zh" ? "每日探索强度" : "Daily exploration range"}</legend><div>{(["focused", "balanced", "open"] as const).map((mode) => <button type="button" key={mode} className={explorationDraft === mode ? "active" : ""} onClick={() => setExplorationDraft(mode)}><strong>{mode === "focused" ? (locale === "zh" ? "聚焦" : "Focused") : mode === "balanced" ? (locale === "zh" ? "平衡" : "Balanced") : (locale === "zh" ? "开放" : "Open")}</strong><small>{mode === "focused" ? (locale === "zh" ? "紧贴核心方向" : "Core directions only") : mode === "balanced" ? (locale === "zh" ? "核心＋相邻线索" : "Core + adjacent leads") : (locale === "zh" ? "主动跨方向探索" : "Broader cross-field search")}</small></button>)}</div></fieldset>
              <label><span>{t.venuesLabel}</span><textarea value={venueDraft} onChange={(event) => setVenueDraft(event.target.value)} rows={10} /></label>
              <label><span>{locale === "zh" ? "持续追踪的作者（每行一位）" : "Tracked authors (one per line)"}</span><textarea value={authorDraft} onChange={(event) => setAuthorDraft(event.target.value)} rows={5} placeholder={locale === "zh" ? "例如：Terence Tao" : "e.g. Terence Tao"} /></label>
              {Boolean(monitor.suggestedAuthors?.length) && <div className="v2-author-suggestions"><span>π {locale === "zh" ? "根据已接受论文建议" : "Suggested from accepted papers"}</span><div>{monitor.suggestedAuthors?.slice(0, 10).map((author) => <button type="button" key={author} onClick={() => setAuthorDraft((current) => Array.from(new Set([...current.split(/\r?\n/).filter(Boolean), author])).join("\n"))}>＋ {author}</button>)}</div></div>}
              <div className="v2-source-settings-actions"><button type="button" onClick={() => void saveSourceSettings(true)} disabled={savingPreferences}>{t.resetSources}</button><button type="submit" disabled={savingPreferences || !venueDraft.trim()}>{savingPreferences ? t.savingSources : t.saveSources} →</button></div>
            </form>
          </div>
        </div>
      )}

      {modelSettingsOpen && (
        <div className="v2-modal" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "AI 模型设置" : "AI model settings"}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={closeModelSettings} />
          <div className="v2-model-settings">
            <div className="v2-modal-head"><div><p className="v2-kicker">π {locale === "zh" ? "浏览器自带密钥" : "BRING YOUR OWN KEY"}</p><h2>{locale === "zh" ? "连接 DeepSeek" : "Connect DeepSeek"}</h2><p>{locale === "zh" ? "直接粘贴 API Key。Pi 会先验证连接，再把它安全保存在当前浏览器。" : "Paste an API key directly. Pi verifies the connection before saving it securely in this browser."}</p></div><button type="button" onClick={closeModelSettings}>×</button></div>
            <section className={`v2-model-status-card ${modelConnectionState}`} aria-live="polite"><span><i /></span><div><small>{locale === "zh" ? "当前状态" : "Current status"}</small><strong>{modelConnectionCopy.modal}</strong><p>DeepSeek · {modelDisplayName(connectedModel || "deepseek-v4-pro")}{modelCredentialSource ? ` · ${modelCredentialSource === "browser" ? (locale === "zh" ? "当前浏览器 Key" : "browser key") : (locale === "zh" ? "平台 Key" : "host key")}` : ""}</p></div><button type="button" onClick={() => void refreshModelStatus()} disabled={checkingModel}>{checkingModel ? (locale === "zh" ? "检测中…" : "Checking…") : (locale === "zh" ? "重新检测" : "Check again")}</button></section>
            {credentialFailureRecovered && <section className="v2-model-resume-card"><b>✓</b><div><strong>{locale === "zh" ? "连接已经恢复，扫描断点仍在" : "Connection restored; the scan checkpoint is intact"}</strong><p>{locale === "zh" ? `${monitor?.scanJob?.discoveredCount || 0} 篇候选和 ${monitor?.scanJob?.reviewedCount || 0}/${monitor?.scanJob?.candidateCount || 0} 篇筛选进度均已保留。` : `${monitor?.scanJob?.discoveredCount || 0} candidates and ${monitor?.scanJob?.reviewedCount || 0}/${monitor?.scanJob?.candidateCount || 0} screening progress are preserved.`}</p></div><button type="button" onClick={resumeAfterModelConnection}>{locale === "zh" ? "关闭并从断点继续" : "Close and resume"} →</button></section>}
            <form className="v2-model-key-form" onSubmit={(event) => { event.preventDefault(); void saveModelCredential(); }}>
              <label><span>{locale === "zh" ? (modelCredentialSource === "browser" ? "粘贴新 Key 以替换" : "DeepSeek API Key") : (modelCredentialSource === "browser" ? "Paste a new key to replace it" : "DeepSeek API key")}</span><div><input type={showModelApiKey ? "text" : "password"} value={modelApiKey} onChange={(event) => { setModelApiKey(event.target.value); setModelSettingsError(""); }} placeholder="sk-…" autoComplete="off" spellCheck={false} /><button type="button" onClick={() => setShowModelApiKey((current) => !current)}>{showModelApiKey ? (locale === "zh" ? "隐藏" : "Hide") : (locale === "zh" ? "显示" : "Show")}</button></div></label>
              {modelSettingsError && <p className="v2-model-key-error" role="alert">{modelSettingsError}</p>}
              <div className="v2-model-key-actions">{modelCredentialSource === "browser" ? <button className="remove" type="button" onClick={() => void removeBrowserModelCredential()} disabled={checkingModel}>{locale === "zh" ? "删除当前浏览器 Key" : "Remove browser key"}</button> : <span /> }<button className="save" type="submit" disabled={checkingModel || !modelApiKey.trim()}>{checkingModel ? (locale === "zh" ? "正在验证…" : "Verifying…") : (locale === "zh" ? "测试并保存" : "Test & save")} →</button></div>
            </form>
            <section className="v2-model-key-privacy"><b>✓</b><div><strong>{locale === "zh" ? "只保存在这个浏览器" : "Stored only in this browser"}</strong><p>{locale === "zh" ? "Key 使用 HttpOnly 安全 Cookie 保存，页面脚本无法读取，也不会写入论文数据库。关闭浏览器后仍可使用，30 天后自动失效。" : "The key is kept in an HttpOnly security cookie that page scripts cannot read. It never enters the paper database and expires automatically after 30 days."}</p><small>{locale === "zh" ? "网页发起的扫描和 AI 功能都会使用它；无人打开网页时的后台定时扫描仍需要平台 Key。" : "Browser-started scans and AI features use it. Unattended background scans still require a host key."}</small></div></section>
          </div>
        </div>
      )}

      {feedbackPrompt && (
        <div className="v2-modal" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "反馈原因" : "Feedback reason"}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => setFeedbackPrompt(null)} />
          <div className="v2-feedback-reason">
            <div className="v2-modal-head"><div><p className="v2-kicker">π {locale === "zh" ? "完善研究记忆" : "Improve research memory"}</p><h2>{feedbackPrompt.kind === "relevant" ? (locale === "zh" ? "它为什么适合你？" : "Why is this useful?") : (locale === "zh" ? "它为什么不适合？" : "Why is this not useful?")}</h2><p>{feedbackPrompt.paper.title}</p></div><button type="button" onClick={() => setFeedbackPrompt(null)}>×</button></div>
            <div className="v2-feedback-options">{(feedbackPrompt.kind === "relevant" ? [
              ["topic_fit", "主题正好相关", "Strong topic fit"], ["method_fit", "方法值得借鉴", "Useful method"], ["solves_question", "回应了我的问题", "Addresses my question"], ["foundational", "是重要基础工作", "Important foundation"], ["surprising", "带来新方向或反直觉结果", "Surprising new direction"],
            ] : [
              ["topic_drift", "偏离我的研究范围", "Outside my scope"], ["too_shallow", "内容太浅或增量太小", "Too shallow or incremental"], ["weak_evidence", "证据或方法不够可靠", "Weak evidence or method"], ["duplicate_known", "内容很好，但我已掌握", "Valuable, but already mastered"], ["wrong_type", "不是我需要的论文类型", "Wrong kind of paper"],
            ]).map(([code, zh, en]) => <button type="button" key={code} onClick={() => chooseFeedbackReason(code)}><span>{feedbackPrompt.kind === "relevant" ? "＋" : "—"}</span><strong>{locale === "zh" ? zh : en}</strong><b>→</b></button>)}</div>
            <label><span>{locale === "zh" ? "可选：补充一句具体原因" : "Optional: add a specific note"}</span><textarea value={feedbackNote} maxLength={500} onChange={(event) => setFeedbackNote(event.target.value)} placeholder={locale === "zh" ? "例如：这个证明策略正好可用于我正在处理的边界情形。" : "For example: this proof strategy fits the boundary case I am working on."} /></label>
            <small>{feedbackPrompt.kind === "relevant" && (feedbackPrompt.paper.discoveryOrigin || feedbackPrompt.paper.discoveryTrack)
              ? (locale === "zh"
                ? "确认后，已通过质量核验的论文会按最终证据归属加入对应路线，并触发路线重新判断。"
                : "After confirmation, a quality-verified paper is assigned to its evidence-supported route and triggers reassessment.")
              : (locale === "zh" ? "选择后会写入当前研究空间；明确反馈不会与其他研究方向混用。" : "Your choice is stored only in this research space.")}</small>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="v2-modal" role="dialog" aria-modal="true" aria-label={t.importResearch}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => { if (!analyzingImport && !savingImport) setImportOpen(false); }} />
          <div className="v2-import-modal">
            <div className="v2-modal-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {t.privateSpace}</p><h2>{importDraft ? t.importDraftTitle : t.importResearch}</h2><p>{importDraft ? t.importDraftNote : t.importIntro}</p></div><button type="button" disabled={analyzingImport || savingImport} onClick={() => setImportOpen(false)}>×</button></div>

            {!importDraft ? <div className="v2-import-body">
              <section className="v2-import-warning"><b>!</b><div><h3>{t.importSafetyTitle}</h3><p>{t.importSafetyBody}</p><small>{t.importSafetyProcess}</small></div></section>

              <div className="v2-import-kind" role="group" aria-label={locale === "zh" ? "资料类型" : "Material type"}>
                {(["chat", "published_paper", "public_project", "mixed"] as ImportSourceKind[]).map((kind) => <button type="button" key={kind} className={importSourceKind === kind ? "active" : ""} onClick={() => setImportSourceKind(kind)}>{kind === "chat" ? (locale === "zh" ? "AI 项目 / 聊天" : "AI project / chats") : kind === "published_paper" ? (locale === "zh" ? "已发表论文" : "Published papers") : kind === "public_project" ? (locale === "zh" ? "公开项目材料" : "Public project material") : (locale === "zh" ? "混合资料" : "Mixed materials")}</button>)}
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
              <div className="v2-import-actions"><button type="button" onClick={() => setImportOpen(false)}>{t.cancel}</button><button type="button" onClick={() => void analyzeResearchImport()} disabled={analyzingImport || parsingMaterials || !safetyConfirmed || (!importFiles.length && !pastedMaterial.trim())}>{analyzingImport ? t.analyzingMaterials : t.analyzeMaterials} →</button></div>
              {analyzingImport && <div className="v2-import-progress" role="status" aria-live="polite"><span>π</span><div><strong>{t.analyzingMaterials}</strong><small>{locale === "zh" ? "正在区分长期兴趣、已有知识、未解问题与临时提问，并寻找可继续研究的方向。" : "Separating sustained interests, demonstrated knowledge, unresolved questions, and transient prompts while finding grounded next directions."}</small><i><b /></i></div></div>}
            </div> : <div className="v2-profile-draft">
              <section className="v2-draft-status"><span>π</span><div><strong>{t.importDraftNote}</strong><small>{t.rawNotStored} · {importDraft.fileNames.length} {locale === "zh" ? "个来源" : "sources"} · {modelDisplayName(importDraft.analysisModel)}</small></div></section>
              <div className="v2-draft-edit-grid">
                <label><span>{t.mainDirection}</span><input value={locale === "zh" ? importDraft.analysis.primaryDirectionZh : importDraft.analysis.primaryDirectionEn} onChange={(event) => editImportAnalysis((analysis) => locale === "zh" ? { ...analysis, primaryDirectionZh: event.target.value } : { ...analysis, primaryDirectionEn: event.target.value })} /></label>
                <label><span>{t.profileSummary}</span><textarea value={locale === "zh" ? importDraft.analysis.summaryZh : importDraft.analysis.summaryEn} onChange={(event) => editImportAnalysis((analysis) => locale === "zh" ? { ...analysis, summaryZh: event.target.value } : { ...analysis, summaryEn: event.target.value })} /></label>
              </div>
              <section className="v2-draft-signals"><h3>{t.subdirectionsLabel}</h3><div>{importDraft.analysis.subdirections.map((item, index) => <span key={`sub-${index}`}>{locale === "zh" ? item.labelZh : item.labelEn}<small>{item.confidence}%</small><button type="button" onClick={() => removeProfileItem("subdirections", index)}>×</button></span>)}{importDraft.analysis.interests.map((item, index) => <span key={`interest-${index}`}>{locale === "zh" ? item.labelZh : item.labelEn}<small>{item.confidence}%</small><button type="button" onClick={() => removeProfileItem("interests", index)}>×</button></span>)}</div></section>
              <section className="v2-draft-signals questions"><h3>{t.openQuestionsLabel}</h3><div>{importDraft.analysis.openQuestions.map((item, index) => <span key={index}>{locale === "zh" ? item.labelZh : item.labelEn}<small>{item.confidence}%</small><button type="button" onClick={() => removeProfileItem("openQuestions", index)}>×</button></span>)}</div></section>
              <section className="v2-draft-opportunities"><h3>{t.futureDirections}</h3>{importDraft.analysis.researchOpportunities.map((item, index) => <article key={index}><span>{String(index + 1).padStart(2, "0")}</span><div><h4>{locale === "zh" ? item.titleZh : item.titleEn}</h4><p>{locale === "zh" ? item.rationaleZh : item.rationaleEn}</p><ul>{(locale === "zh" ? item.startingPointsZh : item.startingPointsEn).map((point) => <li key={point}>{point}</li>)}</ul><small>{t.evidenceConfidence} {item.confidence}% · {item.evidenceFiles.join(" · ")}</small></div><button type="button" aria-label={locale === "zh" ? "删除方向" : "Remove direction"} onClick={() => removeOpportunity(index)}>×</button></article>)}</section>
              <section className="v2-draft-sources"><h3>{t.profileSources}</h3>{importDraft.analysis.sourceAssessments.map((source) => <div key={source.fileName} className={source.used ? "used" : ""}><span>{source.used ? "✓" : "—"}</span><p><strong>{source.fileName}</strong><small>{locale === "zh" ? source.reasonZh : source.reasonEn}</small></p><b>{source.relevance}</b></div>)}</section>
              <div className="v2-import-actions"><button type="button" onClick={() => void saveImportDecision("discard")} disabled={savingImport}>{t.discardDraft}</button><button type="button" onClick={() => void saveImportDecision("confirm")} disabled={savingImport || !importDraft.analysis.researchOpportunities.length}>{savingImport ? t.savingSources : t.confirmProfile} →</button></div>
            </div>}
          </div>
        </div>
      )}

      {askOpen && (
        <div className="v2-modal v2-ask-modal" role="dialog" aria-modal="true" aria-label={t.askTitle}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => setAskOpen(false)} />
          <div className="v2-ask-panel">
            <div className="v2-modal-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {t.privateSpace}</p><h2>{t.askTitle}</h2><p>{t.askScope}</p></div><button type="button" onClick={() => setAskOpen(false)}>×</button></div>
            <form onSubmit={submitQuestion}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t.askExample} /><div><span className={"v2-space-avatar tiny " + activeSpace.accent}>{initials(activeSpace.name)}</span><small>{defaultSpaceName(activeSpace.name, locale)} · {activeSpace.memberName}</small><button type="submit" disabled={!question.trim() || asking}>{asking ? "···" : t.send + " ↑"}</button></div></form>
            {asking && <div className="v2-thinking"><span>π</span><p>{t.thinking}<i><b /><b /><b /></i></p></div>}
            {answer && <div className="v2-answer"><div><span>π</span><p className="v2-kicker">{answerMode === "deepseek" ? t.modelAnswer : t.previewMode}</p><small>{answerMode === "deepseek" ? modelDisplayName(answerModel || connectedModel) + " · Chat API" : t.setupRequired}</small></div><p>{answer}</p><div><i />{t.isolated}</div></div>}
            {!answer && !asking && <div className="v2-ask-suggestions">{[t.askExample, locale === "zh" ? "这篇论文与我收藏的结果有什么直接关系？" : "How does this paper relate to results I saved?", locale === "zh" ? "这个方向最近真正改变了什么？" : "What actually changed in this field recently?"].map((item) => <button type="button" key={item} onClick={() => setQuestion(item)}>↗ {item}</button>)}</div>}
          </div>
        </div>
      )}

      {mobileNav && <button className="v2-mobile-backdrop" type="button" aria-label={t.close} onClick={() => setMobileNav(false)} />}
      {toast && <div className="v2-toast"><span>✓</span>{toast}</div>}
    </div>
  );
}
