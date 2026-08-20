"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { ImportSourceKind, ResearchImportRecord, ResearchProfileAnalysis } from "../lib/research-profile";
import type { ResearchDirectionRole, ResearchMapState, ResearchPaperEdge, ResearchTrack, ResearchTrackPaper, ResearchTrackRole } from "../lib/research-map";
import type { LearningPathState, LearningPathStep, LearningStepKind } from "../lib/learning-path";
import { paperNetworkEdgeKey, selectBalancedMultiSeedEdges } from "../lib/paper-network";

type Locale = "zh" | "en";
type View = "today" | "threads" | "thread-detail" | "learn" | "library" | "memory" | "paper-detail";
type LibraryFilter = "inbox" | "accepted" | "all" | "dismissed";
type InboxFilter = "all" | "unseen" | "seen" | "snoozed";
type LibrarySort = "priority" | "newest" | "quality";
type ResearchMapMode = "directions" | "papers";
type PaperNetworkMode = "similarity" | "citations" | "path";
type PaperNetworkScope = "all" | "one-hop" | "multi-seed";
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
  summaryZh: string;
  summaryEn: string;
  whyReadZh: string;
  whyReadEn: string;
  qualityScore: number;
  priorityVenue: boolean;
  analysisSource: string;
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
  cadenceHours: number;
  lastTrigger?: string;
  automation?: { enabled: boolean; cadenceHours: number; schedulerCheckMinutes: number; errorRetryMinutes: number; singleRunLock: boolean };
  source: string;
  horizons: string[];
  preferences?: MonitorPreferences;
  papers: MonitorPaper[];
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
    needsRefresh?: boolean;
    attempt?: number;
    triggerSource?: string;
    resumeOfJobId?: string | null;
    checkpoint?: string;
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

function directionRelationshipLabel(kind: ResearchMapState["edges"][number]["kind"], locale: Locale) {
  const labels: Record<ResearchMapState["edges"][number]["kind"], Localized> = {
    builds_on: { zh: "发展承接", en: "Builds on" },
    bridges: { zh: "跨向桥接", en: "Bridges" },
    supports: { zh: "方法支撑", en: "Supports" },
  };
  return labels[kind][locale];
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

function learningKindLabel(kind: LearningStepKind, locale: Locale) {
  const labels: Record<LearningStepKind, Localized> = {
    prerequisite: { zh: "必要先修", en: "Prerequisite" },
    foundation: { zh: "奠基工作", en: "Foundation" },
    method: { zh: "方法进阶", en: "Methods" },
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

function reminderLabel(paper: MonitorPaper, locale: Locale) {
  if (paper.userState === "unseen") return copy[locale].neverViewed;
  if (paper.userState === "snoozed" && paper.snoozedUntil) {
    return locale === "zh"
      ? `${formatPaperDate(paper.snoozedUntil, locale)}再次提醒`
      : `Remind on ${formatPaperDate(paper.snoozedUntil, locale)}`;
  }
  if (paper.userState !== "seen") return "";
  const reminderDays = paper.showCount <= 1 ? 1 : paper.showCount === 2 ? 3 : 14;
  const dueAt = timeValue(paper.lastShownAt) + reminderDays * 24 * 60 * 60 * 1000;
  if (!paper.lastShownAt || dueAt <= Date.now()) return locale === "zh" ? "已进入再次推荐队列" : "Back in the recommendation queue";
  return locale === "zh"
    ? `${formatPaperDate(new Date(dueAt).toISOString(), locale)}${copy.zh.nextReminder}`
    : `${copy.en.nextReminder} ${formatPaperDate(new Date(dueAt).toISOString(), locale)}`;
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

function explorationStatusLabel(status: ExplorationBranch["status"], locale: Locale) {
  if (status === "cooling") return locale === "zh" ? "暂时降频" : "Cooling";
  if (status === "revisit") return locale === "zh" ? "一轮完成" : "Round complete";
  if (status === "error") return locale === "zh" ? "来源异常" : "Source error";
  return locale === "zh" ? "继续深挖" : "Exploring";
}

function historyCountsFor(papers: MonitorPaper[]) {
  const unresolved = papers.filter((paper) => !["accepted", "dismissed"].includes(paper.userState));
  return {
    all: papers.length,
    inbox: unresolved.length,
    unseen: unresolved.filter((paper) => paper.userState === "unseen").length,
    seen: unresolved.filter((paper) => paper.userState === "seen").length,
    snoozed: unresolved.filter((paper) => paper.userState === "snoozed").length,
    accepted: papers.filter((paper) => paper.userState === "accepted").length,
    saved: papers.filter((paper) => paper.saved).length,
    dismissed: papers.filter((paper) => paper.userState === "dismissed").length,
    reading: papers.reduce<Record<string, number>>((counts, paper) => {
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
  if (/budget reached/i.test(message)) {
    return locale === "zh" ? "今日智能筛选额度已达到上限，当前进度已保存，稍后可从断点继续。" : "Today's AI screening budget has been reached. Progress is saved and can be resumed later.";
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

function routeChangeKindLabel(kind: string, locale: Locale) {
  const labels: Record<string, { zh: string; en: string; symbol: string }> = {
    new_evidence: { zh: "新增证据", en: "New evidence", symbol: "＋" },
    route_initialized: { zh: "新建路线", en: "Route created", symbol: "◎" },
    node_added: { zh: "节点扩展", en: "Nodes added", symbol: "↗" },
  };
  return labels[kind] || { zh: "路线更新", en: "Route update", symbol: "＋" };
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

async function advanceMonitorPipeline(
  spaceId: string,
  initialMonitor: MonitorState,
  onUpdate: (monitor: MonitorState) => void,
  isCancelled: () => boolean = () => false,
) {
  let current = initialMonitor;
  for (let step = 0; step < 24 && !isCancelled(); step += 1) {
    if (["ready", "error"].includes(current.status)) break;
    const response = await fetch("/api/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId, action: "advance", jobId: current.scanJob?.id }),
    });
    const data = await response.json().catch(() => ({})) as { monitor?: MonitorState; error?: string };
    if (data.monitor) {
      current = data.monitor;
      if (!isCancelled()) onUpdate(current);
    }
    if (!response.ok || !data.monitor) throw new Error(data.error || data.monitor?.error || data.monitor?.scanJob?.error || "scan stage unavailable");
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
  return model || "DeepSeek";
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
};

const paperNetworkPalette = ["#2f6650", "#9b6848", "#416c83", "#745f8c", "#8a7b3e"];

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
  return Array.from(unique.values()).slice(0, 40);
}

function networkRelationLabel(edge: ResearchPaperEdge, locale: Locale) {
  if (edge.kind === "citation") return locale === "zh" ? "真实引用" : "Verified citation";
  if (edge.kind === "similarity") return locale === "zh" ? "文献耦合" : "Bibliographic coupling";
  const labels: Record<string, Localized> = {
    extends: { zh: "扩展", en: "Extends" }, challenges: { zh: "挑战", en: "Challenges" }, applies: { zh: "应用", en: "Applies" },
    unifies: { zh: "统一", en: "Unifies" }, bridges: { zh: "桥接", en: "Bridges" }, reframes: { zh: "重构", en: "Reframes" },
    prepares: { zh: "铺垫", en: "Prepares" }, advances: { zh: "推进", en: "Advances" },
  };
  return labels[edge.relationKind]?.[locale] || (locale === "zh" ? "语义关联" : "Semantic link");
}

function paperNetworkSourceNotice(network: ResearchMapState["paperNetwork"], locale: Locale) {
  const error = network.error || "";
  const verifiedCount = network.citationEdgeCount + network.similarityEdgeCount;
  const piCount = network.semanticEdgeCount + network.pathEdgeCount;
  const citationFailed = /citation:|semantic scholar|citation lookup/i.test(error);
  const piFailed = !citationFailed || /deepseek|empty research map|pi path analysis|insufficient balance/i.test(error);
  const citationCache = network.sources.includes("semantic-scholar-cache");
  const piCache = network.sources.some((source) => source.includes("deepseek") && source.endsWith("-cache"));
  if (citationFailed && piFailed) return locale === "zh"
    ? { title: "部分关系未能刷新", body: `已保留 ${verifiedCount + piCount} 条可用关系；论文节点不受影响。`, action: "稍后重试" }
    : { title: "Some links could not refresh", body: `${verifiedCount + piCount} available links are preserved; paper nodes are unaffected.`, action: "Retry later" };
  if (citationFailed) return locale === "zh"
    ? { title: citationCache ? "引用关系暂沿用上次版本" : "引用关系本轮未更新", body: `Pi 关系已生成 ${piCount} 条；论文节点${citationCache ? "和已保存引用" : ""}仍可浏览。`, action: "重试引用更新" }
    : { title: citationCache ? "Citations are using the saved version" : "Citations did not update this run", body: `${piCount} Pi links are available; paper nodes${citationCache ? " and saved citations" : ""} remain browsable.`, action: "Retry citations" };
  return locale === "zh"
    ? { title: piCache ? "Pi 分析暂沿用上次版本" : "Pi 关系本轮未生成", body: `真实引用与文献耦合已更新 ${verifiedCount} 条；论文节点${piCache ? "和已保存的语义关系" : ""}不受影响。`, action: "重试 Pi 分析" }
    : { title: piCache ? "Pi analysis is using the saved version" : "Pi links were not generated this run", body: `${verifiedCount} verified citation and coupling links are updated; paper nodes${piCache ? " and saved semantic links" : ""} are unaffected.`, action: "Retry Pi analysis" };
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

function clippedPaperNetworkPath(edge: ResearchPaperEdge, positions: Map<string, NetworkNodePosition>) {
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
  const endPadding = target.radius + (edge.kind === "citation" || edge.kind === "path" ? 11 : 4);
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
  trackFilter,
  locale,
  selectedPaperId,
  originPaperIds,
  paperStates,
  onSelect,
}: {
  map: ResearchMapState;
  mode: PaperNetworkMode;
  scope: PaperNetworkScope;
  trackFilter: string;
  locale: Locale;
  selectedPaperId: string | null;
  originPaperIds: string[];
  paperStates: Record<string, MonitorPaper["userState"]>;
  onSelect: (paperId: string) => void;
}) {
  const layout = useMemo(() => {
    const filteredNodes = buildNetworkPaperNodes(map).filter((node) => trackFilter === "all" || node.trackIds.includes(trackFilter));
    const filteredIds = new Set(filteredNodes.map((node) => node.paper.id));
    let edges = map.paperEdges.filter((edge) => filteredIds.has(edge.sourcePaperId) && filteredIds.has(edge.targetPaperId)
      && (mode === "citations" ? edge.kind === "citation" : mode === "path" ? edge.kind === "path" : edge.kind === "similarity" || edge.kind === "semantic" || edge.kind === "citation"));
    let nodes = filteredNodes;
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
      edges = edges.filter((edge) => edge.sourcePaperId === selectedPaperId || edge.targetPaperId === selectedPaperId)
        .sort((left, right) => right.confidence - left.confidence).slice(0, 16);
      const hopIds = new Set([selectedPaperId, ...edges.flatMap((edge) => [edge.sourcePaperId, edge.targetPaperId])]);
      nodes = nodes.filter((node) => hopIds.has(node.paper.id));
    } else if (multiSeedActive) {
      edges = selectBalancedMultiSeedEdges(edges, visibleOriginIds);
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
      positions.set(node.paper.id, { x, y, radius, trackId: effectiveTrackId, color: paperNetworkPalette[trackPosition % paperNetworkPalette.length] });
    });
    if (mode === "similarity" && !oneHopActive) relaxSimilarityPositions(nodes, edges, positions, visibleOriginIds, width, height);
    const seedConnections = new Map<string, Set<string>>();
    if (multiSeedActive) {
      for (const edge of edges) {
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
  }, [map, mode, scope, trackFilter, originPaperIds, selectedPaperId]);

  const originSet = new Set(originPaperIds);
  const focusedPaperIds = layout.multiSeedActive ? originSet : new Set(selectedPaperId ? [selectedPaperId] : []);
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
        <desc>{mode === "citations" ? (locale === "zh" ? "箭头从被引工作指向后续引用它的工作。" : "Arrows run from cited work to later work that cites it.") : mode === "path" ? (locale === "zh" ? "编号表示建议阅读顺序。" : "Numbers show the suggested reading order.") : (locale === "zh" ? "选择论文可聚焦当前论文库内的一跳直接关系。" : "Select a paper to focus its direct one-hop links in this library.")}</desc>
        <defs>
          <marker id="v2-paper-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
          <marker id="v2-path-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
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
            const path = clippedPaperNetworkPath(edge, layout.positions);
            if (!path) return null;
            const selectedEdge = Array.from(focusedPaperIds).some((id) => id === edge.sourcePaperId || id === edge.targetPaperId);
            const key = paperNetworkEdgeKey(edge);
            const sourceTitle = nodeById.get(edge.sourcePaperId)?.paper.title || "";
            const targetTitle = nodeById.get(edge.targetPaperId)?.paper.title || "";
            const title = edge.kind === "citation"
              ? (locale === "zh" ? `知识流：${targetTitle} → ${sourceTitle}` : `Knowledge flow: ${targetTitle} → ${sourceTitle}`)
              : `${networkRelationLabel(edge, locale)} · ${locale === "zh" ? edge.relationshipZh : edge.relationshipEn}`;
            const className = `${edge.kind} ${focusedPaperIds.size ? selectedEdge ? "focused" : "muted" : ""}`;
            const delay = `${Math.min(index, 24) * 75}ms`;
            return <g key={key} className="v2-paper-network-edge-group">
              {(edge.kind === "citation" || edge.kind === "path") && <path className={`edge-halo ${className}`} d={path} style={{ animationDelay: delay }} />}
              <path className={`edge-line revealing ${className}`} d={path} style={{ animationDelay: delay }} markerEnd={edge.kind === "path" ? "url(#v2-path-arrow)" : edge.kind === "citation" ? "url(#v2-paper-arrow)" : undefined}><title>{title}</title></path>
            </g>;
          })}
        </g>
        <g className="v2-paper-network-nodes">
          {layout.nodes.map((node) => {
            const position = layout.positions.get(node.paper.id);
            if (!position) return null;
            const selected = selectedPaperId === node.paper.id;
            const state = paperStates[node.paper.canonicalId];
            const origin = originSet.has(node.paper.id);
            const muted = Boolean(scope === "all" && selectedPaperId && !connectedToSelection.has(node.paper.id));
            const sharedBridge = layout.multiSeedActive && !origin && (layout.seedConnectionCount.get(node.paper.id) || 0) >= 2;
            const showLabel = selected || origin || layout.labelIds.has(node.paper.id);
            const label = node.paper.title.length > 30 ? node.paper.title.slice(0, 29) + "…" : node.paper.title;
            const step = layout.pathLayout.stepById.get(node.paper.id);
            const sharedCount = layout.seedConnectionCount.get(node.paper.id) || 0;
            return <g key={node.paper.id} className={`v2-paper-network-node ${mode === "path" ? "path-step" : ""} ${selected ? "selected" : ""} ${origin ? "origin" : ""} ${sharedBridge ? "shared-bridge" : ""} ${muted ? "muted" : ""} ${state || ""}`} transform={`translate(${position.x} ${position.y})`} role="button" tabIndex={0} aria-label={`${step ? `${locale === "zh" ? "第" : "Step "}${step}${locale === "zh" ? "步，" : ", "}` : ""}${node.paper.title}${sharedBridge ? (locale === "zh" ? `，连接 ${sharedCount} 个种子` : `, shared by ${sharedCount} origins`) : ""}`} onClick={() => onSelect(node.paper.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.paper.id); } }}>
              {sharedBridge && <circle className="shared-ring" r={position.radius + 10}><title>{locale === "zh" ? `连接 ${sharedCount} 个种子的共同邻居` : `Neighbor shared by ${sharedCount} origins`}</title></circle>}
              <circle className="state-ring" r={position.radius + 5} />
              <circle className="paper-dot" r={position.radius} style={{ fill: position.color }} />
              {mode === "path" ? <text className="path-step-number" textAnchor="middle" y="3.5">{step}</text> : <circle className="paper-core" r="3" />}
              {showLabel && <text className="v2-paper-node-label" y={-(position.radius + 9)} textAnchor="middle">{label}</text>}
              <title>{node.paper.title} · {researchPaperYear(node.paper)} · {node.paper.citationCount} {locale === "zh" ? "次引用" : "citations"}</title>
            </g>;
          })}
        </g>
      </svg>
      {!layout.nodes.length && <div className="v2-paper-network-empty">{emptyMessage}</div>}
    </div>
  );
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

export default function ResearchApp({ user }: { user: User }) {
  const [locale, setLocale] = useState<Locale>("zh");
  const [view, setView] = useState<View>("today");
  const [spaces, setSpaces] = useState<Space[]>(fallbackSpaces);
  const [activeSpaceId, setActiveSpaceId] = useState(fallbackSpaces[0].id);
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpace, setNewSpace] = useState({ name: "", memberName: "", description: "" });
  const [selectedMonitorPaper, setSelectedMonitorPaper] = useState<MonitorPaper | null>(null);
  const [researchMap, setResearchMap] = useState<ResearchMapState>({
    tracks: [], edges: [], paperEdges: [],
    paperNetwork: { status: "idle", paperCount: 0, builtPaperCount: 0, citationEdgeCount: 0, similarityEdgeCount: 0, semanticEdgeCount: 0, pathEdgeCount: 0, model: "", sources: [], updatedAt: null, error: null },
    model: "deepseek-v4-pro", generated: false,
  });
  const [selectedThread, setSelectedThread] = useState<ResearchTrack | null>(null);
  const [directionOverviewId, setDirectionOverviewId] = useState<string | null>(null);
  const [directionRelationFocusId, setDirectionRelationFocusId] = useState<string | null>(null);
  const [directionPinnedRelationId, setDirectionPinnedRelationId] = useState<string | null>(null);
  const [researchMapMode, setResearchMapMode] = useState<ResearchMapMode>("directions");
  const [paperNetworkMode, setPaperNetworkMode] = useState<PaperNetworkMode>("similarity");
  const [paperNetworkScope, setPaperNetworkScope] = useState<PaperNetworkScope>("all");
  const [paperNetworkTrackId, setPaperNetworkTrackId] = useState("all");
  const [paperNetworkOriginCanonicalIds, setPaperNetworkOriginCanonicalIds] = useState<string[]>([]);
  const [selectedNetworkPaperId, setSelectedNetworkPaperId] = useState<string | null>(null);
  const [paperNetworkLoading, setPaperNetworkLoading] = useState(false);
  const [paperNetworkBuildPhase, setPaperNetworkBuildPhase] = useState<PaperNetworkBuildPhase>(null);
  const paperNetworkSpaceRef = useRef(activeSpaceId);
  const paperNetworkAutoAttemptRef = useRef(new Set<string>());
  paperNetworkSpaceRef.current = activeSpaceId;
  const [mapLoading, setMapLoading] = useState(false);
  const [mapAction, setMapAction] = useState<string | null>(null);
  const [mapOutlinePhase, setMapOutlinePhase] = useState(0);
  const [mapBuildTrackId, setMapBuildTrackId] = useState<string | null>(null);
  const [mapBuildErrors, setMapBuildErrors] = useState<Record<string, boolean>>({});
  const [mapIntelligenceTrackId, setMapIntelligenceTrackId] = useState<string | null>(null);
  const [learningState, setLearningState] = useState<LearningPathState>({ path: null, suggestedTarget: "", availablePaperCount: 0, model: "deepseek-v4-pro" });
  const [learningTarget, setLearningTarget] = useState("");
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningAction, setLearningAction] = useState<string | null>(null);
  const [modelConfigured, setModelConfigured] = useState(false);
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
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("inbox");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("priority");
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

  const t = copy[locale];
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) || spaces[0] || fallbackSpaces[0];
  const mapViewActive = view === "threads" || view === "thread-detail";
  const rankedMonitorPapers = useMemo(
    () => {
      const tierRank: Record<MonitorPaper["recommendationTier"], number> = { must_read: 0, browse: 1, reserve: 2 };
      return [...(monitor?.papers || [])].sort((first, second) => (tierRank[first.recommendationTier || "browse"] - tierRank[second.recommendationTier || "browse"])
        || second.qualityScore - first.qualityScore || second.relevanceScore - first.relevanceScore);
    },
    [monitor?.papers],
  );
  const historyPapers = useMemo(() => monitor?.historyPapers || monitor?.papers || [], [monitor?.historyPapers, monitor?.papers]);
  const libraryPapers = useMemo(() => {
    const query = librarySearch.trim().toLocaleLowerCase();
    const stateRank: Record<MonitorPaper["userState"], number> = { unseen: 0, seen: 1, snoozed: 2, accepted: 3, dismissed: 4 };
    return historyPapers.filter((paper) => {
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
      return stateRank[first.userState] - stateRank[second.userState]
        || second.qualityScore - first.qualityScore
        || timeValue(first.firstShownAt) - timeValue(second.firstShownAt);
    });
  }, [historyPapers, inboxFilter, libraryFilter, librarySearch, librarySort]);
  const scanIsActive = monitoring || isMonitorScanning(monitor?.status);
  const effectiveScanStatus: MonitorStatus = monitoring && !isMonitorScanning(monitor?.status) ? "scanning" : monitor?.status || "idle";
  const activeScanJob = monitor?.scanJob && !["ready", "error"].includes(monitor.scanJob.status) ? monitor.scanJob : null;
  const failedScanJob = monitor?.status === "error" ? monitor.scanJob || null : null;
  const failedScanError = failedScanJob?.error || monitor?.error || "";
  const resumeAvailable = Boolean(failedScanJob && (failedScanJob.candidateCount || failedScanJob.reviewedCount || failedScanJob.checkpoint === "retry_pending"));
  const scanProgress = scanIsActive
    ? Math.max(monitorProgressByStatus[effectiveScanStatus], activeScanJob?.progress || 0)
    : monitor?.status === "ready" ? 100 : 0;
  const baseScanPhase = monitorPhaseLabel(scanIsActive ? effectiveScanStatus : monitor?.status, locale);
  const scanPhase = scanIsActive && activeScanJob?.currentSource ? `${baseScanPhase} · ${activeScanJob.currentSource}` : baseScanPhase;
  const healthyCoverageCount = monitor?.coverage?.filter((source) => source.healthy).length || 0;
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
  const activeReadingCount = (monitor?.historyCounts?.reading?.queued || 0) + (monitor?.historyCounts?.reading?.reading || 0);
  const dailyBriefPapers = useMemo(() => {
    const ids = new Set(monitor?.dailyBrief?.paperIds || []);
    const byId = new Map(historyPapers.filter((paper) => ids.has(paper.id)).map((paper) => [paper.id, paper]));
    return (monitor?.dailyBrief?.paperIds || []).flatMap((id) => {
      const paper = byId.get(id);
      return paper ? [paper] : [];
    });
  }, [historyPapers, monitor?.dailyBrief?.paperIds]);
  const dailySignals = monitor?.dailyBrief ? (locale === "zh" ? monitor.dailyBrief.signalsZh : monitor.dailyBrief.signalsEn) : [];
  const dailyReadingPlan = monitor?.dailyBrief ? (locale === "zh" ? monitor.dailyBrief.readingPlanZh : monitor.dailyBrief.readingPlanEn) : [];
  const dailyBriefEntryCount = Math.min(6, Math.max(dailyBriefPapers.length, dailySignals.length, dailyReadingPlan.length));
  const latestQuickScreenedCount = monitor?.scanJob?.reviewedCount || monitor?.dailyBrief?.metrics.screened || monitor?.dailyBrief?.metrics.reviewed || 0;
  const latestDeepReviewedCount = monitor?.scanJob?.deepCompletedCount || monitor?.dailyBrief?.metrics.deepReviewed || Math.min(monitor?.dailyBrief?.metrics.reviewed || 0, 8);
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
  const eligibleNetworkPaperNodes = useMemo(
    () => networkPaperNodes.filter((node) => paperNetworkTrackId === "all" || node.trackIds.includes(paperNetworkTrackId)),
    [networkPaperNodes, paperNetworkTrackId],
  );
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
  const citationLineage = useMemo(() => {
    if (!selectedNetworkPaperId) return { prior: [], derivative: [] };
    const nodeById = new Map(networkPaperNodes.map((node) => [node.paper.id, node]));
    const citationEdges = researchMap.paperEdges.filter((edge) => edge.kind === "citation");
    const rank = (ids: string[]) => Array.from(new Set(ids)).map((id) => nodeById.get(id))
      .filter((node): node is NetworkPaperNode => Boolean(node))
      .sort((left, right) => right.paper.citationCount - left.paper.citationCount).slice(0, 3);
    return {
      prior: rank(citationEdges.filter((edge) => edge.sourcePaperId === selectedNetworkPaperId).map((edge) => edge.targetPaperId)),
      derivative: rank(citationEdges.filter((edge) => edge.targetPaperId === selectedNetworkPaperId).map((edge) => edge.sourcePaperId)),
    };
  }, [networkPaperNodes, researchMap.paperEdges, selectedNetworkPaperId]);
  const selectedNetworkNode = useMemo(
    () => networkPaperNodes.find((node) => node.paper.id === selectedNetworkPaperId) || null,
    [networkPaperNodes, selectedNetworkPaperId],
  );
  const selectedNetworkRelations = useMemo(
    () => selectedNetworkNode ? researchMap.paperEdges.filter((edge) => edge.sourcePaperId === selectedNetworkNode.paper.id || edge.targetPaperId === selectedNetworkNode.paper.id).slice(0, 6) : [],
    [researchMap.paperEdges, selectedNetworkNode],
  );
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
      title: locale === "zh" ? "多种子联合邻域" : "Combined multi-origin neighborhood",
      body: locale === "zh"
        ? `合并 ${effectiveNetworkOriginNodes.length} 个种子的直接关系；优先保留每个种子的强关系和共同邻居。`
        : `Combining direct links around ${effectiveNetworkOriginNodes.length} origins, prioritizing strong links per origin and shared neighbors.`,
    };
    return {
      title: locale === "zh" ? "点击论文，聚焦直接关系" : "Select a paper to focus direct links",
      body: locale === "zh" ? "1-hop 只显示当前论文库内最多 16 条直接关系" : "1-hop shows up to 16 direct links already in this library",
    };
  }, [effectiveNetworkOriginNodes.length, locale, paperNetworkMode, paperNetworkScope]);

  function setSingleNetworkOrigin(node: NetworkPaperNode) {
    setPaperNetworkOriginCanonicalIds([node.paper.canonicalId]);
    setPaperNetworkMode("similarity");
    setSelectedNetworkPaperId(node.paper.id);
    setPaperNetworkScope("one-hop");
  }

  function addMultiNetworkOrigin(node: NetworkPaperNode) {
    const baseCanonicalIds = explicitNetworkOriginNodes.length
      ? explicitNetworkOriginNodes.map((origin) => origin.paper.canonicalId)
      : effectiveNetworkOriginNodes.map((origin) => origin.paper.canonicalId);
    setPaperNetworkOriginCanonicalIds(Array.from(new Set([...baseCanonicalIds, node.paper.canonicalId])).slice(0, 3));
    setPaperNetworkMode("similarity");
    setSelectedNetworkPaperId(null);
    setPaperNetworkScope("multi-seed");
  }

  function removeNetworkOrigin(canonicalId: string) {
    const remainingCanonicalIds = paperNetworkOriginCanonicalIds.filter((id) => id !== canonicalId);
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

  useEffect(() => {
    if (paperNetworkScope !== "multi-seed" || explicitNetworkOriginNodes.length >= 2) return;
    const fallback = explicitNetworkOriginNodes[0] || effectiveNetworkOriginNodes[0];
    setSelectedNetworkPaperId(fallback?.paper.id || null);
    setPaperNetworkScope(fallback ? "one-hop" : "all");
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
        setModelConfigured(Boolean(data.modelConfigured));
        setConnectedModel(data.model || null);
        setModelCredentialSource(data.modelCredentialSource || null);
      })
      .catch(() => {
        setSpaces(fallbackSpaces);
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
          if (!data.monitor.throttled && !["ready", "error"].includes(data.monitor.status)) {
            await advanceMonitorPipeline(activeSpace.id, data.monitor, (nextMonitor) => { if (!cancelled) setMonitor(nextMonitor); }, () => cancelled);
          }
        })
        .catch((error) => {
          if (!cancelled) setMonitor((current) => current?.status === "error" ? current : {
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
        let response = await fetch("/api/research-map?spaceId=" + encodeURIComponent(activeSpace.id));
        let data = await response.json() as ResearchMapState & { error?: string };
        if (!response.ok) throw new Error(data.error || "map unavailable");
        if (!data.generated) {
          setMapAction("initialize");
          response = await fetch("/api/research-map", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spaceId: activeSpace.id, action: "initialize" }),
          });
          data = await response.json() as ResearchMapState & { error?: string };
          if (!response.ok) throw new Error(data.error || "map generation failed");
        } else if (data.needsStructure) {
          setMapAction("structure");
          response = await fetch("/api/research-map", {
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
        for (const trackId of data.intelligenceProgress?.pendingTrackIds || []) {
          if (cancelled) break;
          setMapIntelligenceTrackId(trackId);
          try {
            const interpretationResponse = await fetch("/api/research-map", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ spaceId: activeSpace.id, action: "interpret", trackId }),
            });
            const interpreted = await interpretationResponse.json() as ResearchMapState & { error?: string };
            if (!interpretationResponse.ok) throw new Error(interpreted.error || "direction interpretation failed");
            if (!cancelled) {
              data = interpreted;
              setResearchMap(interpreted);
              setSelectedThread((current) => interpreted.tracks.find((track) => track.id === current?.id) || interpreted.tracks[0] || null);
            }
          } catch {
            // The direction remains usable and will be interpreted again on the next visit.
          }
        }
        if (!cancelled) {
          try {
            const reconciliationResponse = await fetch("/api/research-map", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ spaceId: activeSpace.id, action: "reconcile" }),
            });
            const reconciled = await reconciliationResponse.json() as ResearchMapState & { error?: string };
            if (reconciliationResponse.ok && !cancelled) {
              data = reconciled;
              setResearchMap(reconciled);
              setSelectedThread((current) => reconciled.tracks.find((track) => track.id === current?.id) || reconciled.tracks[0] || null);
            }
          } catch {
            // Route reconciliation is additive and must never block the usable map.
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
    const stale = researchMap.paperNetwork.builtPaperCount < researchMap.paperNetwork.paperCount;
    const outdated = researchMap.paperNetwork.model !== "deepseek-v4-pro+coupling-v2";
    if (researchMapMode !== "papers" || researchMap.paperNetwork.paperCount < 2
      || paperNetworkLoading || (!stale && !outdated && !["idle", "building"].includes(researchMap.paperNetwork.status))) return;
    const spaceId = activeSpace.id;
    const attemptKey = `${spaceId}:${researchMap.paperNetwork.paperCount}:deepseek-v4-pro+coupling-v2`;
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
  }, [activeSpace.id, locale, paperNetworkLoading, researchMap.paperNetwork.builtPaperCount, researchMap.paperNetwork.model, researchMap.paperNetwork.paperCount, researchMap.paperNetwork.sources, researchMap.paperNetwork.status, researchMapMode]);

  useEffect(() => {
    if (!mapLoading) return;
    const timer = window.setInterval(() => setMapOutlinePhase((current) => Math.min(3, current + 1)), 2600);
    return () => window.clearInterval(timer);
  }, [mapLoading]);

  useEffect(() => {
    if (view !== "learn" || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLearningLoading(true);
      fetch("/api/learning-path?spaceId=" + encodeURIComponent(activeSpace.id))
        .then(async (response) => {
          const data = await response.json() as LearningPathState & { error?: string };
          if (!response.ok) throw new Error(data.error || "learning path unavailable");
          return data;
        })
        .then((data) => {
          if (cancelled) return;
          setLearningState(data);
          setLearningTarget(data.path?.target || data.suggestedTarget);
        })
        .catch(() => {
          if (!cancelled) setToast(locale === "zh" ? "学习路径暂时无法载入" : "The learning path could not be loaded");
        })
        .finally(() => { if (!cancelled) setLearningLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeSpace.id, locale, view]);

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
    setActiveSpaceId(space.id);
    setPaperNetworkLoading(false);
    setPaperNetworkBuildPhase(null);
    setSelectedNetworkPaperId(null);
    setPaperNetworkScope("all");
    setPaperNetworkTrackId("all");
    setPaperNetworkOriginCanonicalIds([]);
    setDirectionOverviewId(null);
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
        id: "local-" + Date.now(),
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
        setModelConfigured(true);
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
    if (monitoring) return;
    if (activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) {
      setToast(locale === "zh" ? "研究空间尚未连接，请刷新页面后再试" : "The research space is not connected yet. Refresh the page and try again.");
      return;
    }
    setMonitoring(true);
    const stopPolling = startMonitorPolling(activeSpace.id, setMonitor);
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
      else if (!["ready", "error"].includes(data.monitor.status)) await advanceMonitorPipeline(activeSpace.id, data.monitor, setMonitor);
    } catch (error) {
      const message = monitorFailureMessage(error, locale);
      setToast(message);
      if (isModelCredentialFailure(error)) {
        setModelConfigured(false);
        setModelSettingsError(message);
        setModelSettingsOpen(true);
      }
    } finally {
      stopPolling();
      setMonitoring(false);
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
        if (!["ready", "error"].includes(scanData.monitor.status)) await advanceMonitorPipeline(activeSpace.id, scanData.monitor, setMonitor);
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
    if (target === "library") { setLibraryFilter("inbox"); setInboxFilter("all"); }
    navigate(target);
  };

  const saveFeedback = (paper: MonitorPaper, kind: "save" | "relevant" | "not_relevant" | "later", reasonCode?: string, note = "") => {
    const key = activeSpace.id + ":" + paper.id;
    const currentSaved = saved[key] ?? paper.saved;
    const value = kind === "save" ? !currentSaved : true;
    const nextState: MonitorPaper["userState"] = kind === "not_relevant" ? "dismissed"
      : kind === "later" ? "snoozed"
        : kind === "save" && !value ? paper.feedback === "relevant" ? "accepted" : "seen" : "accepted";
    if (kind === "save") setSaved((current) => ({ ...current, [key]: value }));
    if (kind === "later" || kind === "not_relevant") setSaved((current) => ({ ...current, [key]: false }));
    setMonitor((current) => {
      if (!current) return current;
      const updatePaper = (item: MonitorPaper): MonitorPaper => item.id !== paper.id ? item : {
        ...item,
        userState: nextState,
        saved: kind === "not_relevant" || kind === "later" ? false : kind === "save" ? value : item.saved,
        feedback: kind === "relevant" ? "relevant" : kind === "not_relevant" ? "not_relevant" : kind === "later" || (kind === "save" && value) ? null : item.feedback,
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
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId: activeSpace.id, paperId: paper.id, kind, value, reasonCode, note }),
    }).then((response) => {
      if (!response.ok || !reasonCode) return null;
      return fetch(`/api/monitor?spaceId=${encodeURIComponent(activeSpace.id)}`);
    }).then((response) => response?.json() as Promise<{ monitor?: MonitorState }> | undefined)
      .then((data) => { if (data?.monitor) setMonitor(data.monitor); })
      .catch(() => undefined);
    setToast(kind === "later" ? t.remindLater : t.feedbackSaved);
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
      body: JSON.stringify({ spaceId: activeSpace.id, paperId: paper.id, kind: "open", value: true }),
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
    setQuestion(locale === "zh" ? `请结合当前研究空间分析这篇论文：${paper.title}` : `Analyze this paper in the context of the current research space: ${paper.title}`);
    setAskOpen(true);
  };

  const openThread = (thread: ResearchTrack) => {
    setSelectedThread(thread);
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

  const refreshPaperNetwork = async () => {
    if (paperNetworkLoading || researchMap.paperNetwork.paperCount < 2) return;
    const spaceId = activeSpace.id;
    paperNetworkAutoAttemptRef.current.add(`${spaceId}:${researchMap.paperNetwork.paperCount}:deepseek-v4-pro+coupling-v2`);
    let failedPhase: Exclude<PaperNetworkBuildPhase, null> = "verified";
    setPaperNetworkLoading(true);
    try {
      setPaperNetworkBuildPhase("verified");
      const verified = await requestPaperNetworkBuildPhase(spaceId, "verified", true);
      if (paperNetworkSpaceRef.current !== spaceId) return;
      setResearchMap(verified);
      failedPhase = "pi";
      setPaperNetworkBuildPhase("pi");
      const curated = await requestPaperNetworkBuildPhase(spaceId, "pi", true);
      if (paperNetworkSpaceRef.current !== spaceId) return;
      setResearchMap(curated);
      setToast(locale === "zh" ? "论文网络已根据当前真实论文更新" : "The paper network now reflects the current real papers");
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

  const addNetworkPaperToLearningPath = (node: NetworkPaperNode) => {
    setLearningTarget(locale === "zh" ? node.track.titleZh : node.track.titleEn);
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

  const expandResearchTrack = async (thread: ResearchTrack) => {
    if (mapAction || mapBuildTrackId || mapIntelligenceTrackId || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setMapAction(thread.id);
    const isInitialFill = thread.buildStatus === "queued";
    try {
      const response = await fetch("/api/research-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, action: isInitialFill ? "hydrate" : "expand", trackId: thread.id }),
      });
      const data = await response.json() as ResearchMapState & { addedCount?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "expand failed");
      setResearchMap(data);
      const updated = data.tracks.find((item) => item.id === thread.id) || null;
      setSelectedThread(updated);
      setMapBuildErrors((current) => { const next = { ...current }; delete next[thread.id]; return next; });
      setToast(locale === "zh" ? (data.addedCount ? `${isInitialFill ? "路线已补充" : "新增"} ${data.addedCount} 篇代表性论文` : "本轮没有发现足够有代表性的新论文") : (data.addedCount ? `${isInitialFill ? "Route filled with" : "Added"} ${data.addedCount} representative papers` : "No sufficiently representative additions in this pass"));
    } catch {
      setToast(locale === "zh" ? "继续挖掘失败，请稍后重试" : "Could not continue mining this direction");
    } finally {
      setMapAction(null);
    }
  };

  const refreshDirectionIntelligence = async (thread: ResearchTrack) => {
    if (mapAction || mapBuildTrackId || mapIntelligenceTrackId || !thread.papers.length) return;
    setMapAction(`interpret:${thread.id}`);
    try {
      const response = await fetch("/api/research-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, action: "interpret", trackId: thread.id }),
      });
      const data = await response.json() as ResearchMapState & { error?: string };
      if (!response.ok) throw new Error(data.error || "direction interpretation failed");
      setResearchMap(data);
      setSelectedThread(data.tracks.find((item) => item.id === thread.id) || null);
      setToast(locale === "zh" ? "Pi 已基于当前证据更新方向研判" : "Pi refreshed the direction assessment from current evidence");
    } catch {
      setToast(locale === "zh" ? "方向研判暂时无法更新" : "The direction assessment could not be refreshed");
    } finally {
      setMapAction(null);
    }
  };

  const generateLearningPath = async () => {
    if (learningAction || !learningTarget.trim() || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setLearningAction("generate");
    try {
      const response = await fetch("/api/learning-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, target: learningTarget.trim() }),
      });
      const data = await response.json() as LearningPathState & { error?: string };
      if (!response.ok || !data.path) throw new Error(data.error || "path generation failed");
      setLearningState(data);
      setLearningTarget(data.path.target);
      setToast(locale === "zh" ? `已用 ${data.availablePaperCount} 篇真实论文构建学习路径` : `Built from ${data.availablePaperCount} real papers`);
    } catch (error) {
      setToast(error instanceof Error && error.message ? error.message : locale === "zh" ? "学习路径生成失败，请稍后重试" : "Could not build the learning path");
    } finally {
      setLearningAction(null);
    }
  };

  const updateLearningStep = async (step: LearningPathStep) => {
    const path = learningState.path;
    if (!path || learningAction) return;
    setLearningAction(step.id);
    try {
      const response = await fetch("/api/learning-path", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, pathId: path.id, stepId: step.id, completed: step.status !== "completed" }),
      });
      const data = await response.json() as LearningPathState & { error?: string };
      if (!response.ok || !data.path) throw new Error(data.error || "progress update failed");
      setLearningState(data);
      setToast(step.status === "completed" ? (locale === "zh" ? "已恢复为待学习" : "Returned to the learning queue") : (locale === "zh" ? "进度已保存到当前研究空间" : "Progress saved to this research space"));
    } catch {
      setToast(locale === "zh" ? "学习进度暂时无法保存" : "Could not save learning progress");
    } finally {
      setLearningAction(null);
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
    setModelSettingsError("");
    try {
      const response = await fetch("/api/model-settings?verify=1", { cache: "no-store" });
      const data = await response.json() as { configured?: boolean; source?: "browser" | "server" | null; model?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "model status unavailable");
      setModelConfigured(Boolean(data.configured));
      setConnectedModel(data.model || null);
      setModelCredentialSource(data.source || null);
      setToast(data.configured
        ? (locale === "zh" ? "DeepSeek Pro 已连接" : "DeepSeek Pro is connected")
        : (locale === "zh" ? "当前浏览器还没有可用的 API Key" : "This browser does not have a usable API key yet"));
    } catch (error) {
      const message = monitorFailureMessage(error, locale);
      if (isModelCredentialFailure(error)) setModelConfigured(false);
      setModelSettingsError(message);
    } finally {
      setCheckingModel(false);
    }
  };

  const saveModelCredential = async () => {
    const apiKey = modelApiKey.trim();
    if (!apiKey || checkingModel) return;
    setCheckingModel(true);
    setModelSettingsError("");
    try {
      const response = await fetch("/api/model-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await response.json() as { configured?: boolean; source?: "browser" | "server" | null; model?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "DeepSeek connection failed");
      setModelConfigured(true);
      setConnectedModel(data.model || "deepseek-v4-pro");
      setModelCredentialSource("browser");
      setModelApiKey("");
      setShowModelApiKey(false);
      setToast(locale === "zh" ? "API Key 已验证并保存到当前浏览器" : "The API key was verified and saved in this browser");
    } catch (error) {
      setModelSettingsError(monitorFailureMessage(error, locale));
    } finally {
      setCheckingModel(false);
    }
  };

  const removeBrowserModelCredential = async () => {
    if (checkingModel) return;
    setCheckingModel(true);
    setModelSettingsError("");
    try {
      const response = await fetch("/api/model-settings", { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not remove the key");
      setModelApiKey("");
      setShowModelApiKey(false);
      const statusResponse = await fetch("/api/model-settings", { cache: "no-store" });
      const status = await statusResponse.json() as { configured?: boolean; source?: "browser" | "server" | null; model?: string | null };
      setModelConfigured(Boolean(status.configured));
      setConnectedModel(status.model || null);
      setModelCredentialSource(status.source || null);
      setToast(locale === "zh" ? "当前浏览器保存的 API Key 已删除" : "The browser-stored API key was removed");
    } catch (error) {
      setModelSettingsError(error instanceof Error ? error.message : (locale === "zh" ? "暂时无法删除 API Key" : "Could not remove the API key"));
    } finally {
      setCheckingModel(false);
    }
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
        <div className="v2-isolation"><i />{t.isolated}</div>

        <nav className="v2-nav" aria-label="Primary navigation">
          <p>{t.researchRadar}</p>
          {navItems.slice(0, 2).map((item) => (
            <button type="button" key={item.id} className={activeNav === item.id ? "active" : ""} aria-current={activeNav === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>
              <span>{item.mark}</span>{item.label}{item.id === "today" && Boolean(monitor?.newCount || rankedMonitorPapers.length) && <b>{Math.min(99, monitor?.newCount || rankedMonitorPapers.length)}</b>}
            </button>
          ))}
          <p>{t.knowledge}</p>
          {navItems.slice(2).map((item) => (
            <button type="button" key={item.id} className={activeNav === item.id ? "active" : ""} aria-current={activeNav === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>
              <span>{item.mark}</span>{item.label}{item.id === "library" && Boolean(monitor?.historyCounts?.inbox) && <b>{Math.min(99, monitor?.historyCounts?.inbox || 0)}</b>}
            </button>
          ))}
        </nav>

        <div className="v2-sidebar-bottom">
          <button className={"v2-openai-state " + (modelConfigured ? "live" : "pending")} type="button" onClick={() => setModelSettingsOpen(true)} aria-label={locale === "zh" ? "打开 AI 模型设置" : "Open AI model settings"}><i /><span><strong>{modelConfigured ? t.connected : t.setupRequired}</strong><small>{modelConfigured ? modelDisplayName(connectedModel) : (locale === "zh" ? "打开配置" : "Open setup")}</small></span><b>›</b></button>
          <button className="v2-account" type="button" onClick={() => navigate("memory")}><span>◎</span><span><strong>Pi Workspace</strong><small>{t.workspaceLabel}</small></span><b>•••</b></button>
        </div>
      </aside>

      <div className="v2-main">
        <header className="v2-topbar">
          <button className="v2-mobile-menu" type="button" aria-label="Menu" onClick={() => setMobileNav(true)}>≡</button>
          <div className="v2-breadcrumb"><span>{defaultSpaceName(activeSpace.name, locale)}</span><b>/</b><strong>{navItems.find((item) => item.id === activeNav)?.label}</strong></div>
          <button className="v2-ask-trigger v2-command-trigger" type="button" aria-label={t.askPi} onClick={() => setAskOpen(true)}><span className="v2-command-mark" aria-hidden="true"><Image src="/pi-research-mark.png" width={31} height={27} alt="" priority /></span><span className="v2-command-copy"><strong>{t.askPi}</strong><small>{locale === "zh" ? "基于当前论文、研究路线与研究记忆" : "Grounded in your papers, routes, and research memory"}</small></span><kbd>⌘ K</kbd></button>
          <div className="v2-top-actions">
            {pendingActionNotifications.length > 0 && <button className="v2-alert-link" type="button" onClick={() => { navigate("today"); setNotificationsExpanded(false); window.setTimeout(() => document.querySelector(".v2-action-inbox")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}><span>{locale === "zh" ? "研究提醒" : "Alerts"}</span><b>{Math.min(99, pendingActionNotifications.length)}</b></button>}
            <div className="v2-language"><button className={locale === "zh" ? "active" : ""} type="button" onClick={() => setLocale("zh")}>中</button><button className={locale === "en" ? "active" : ""} type="button" onClick={() => setLocale("en")}>EN</button></div>
          </div>
        </header>

        {view === "today" && (
          <main className="v2-page v2-today">
            <section className="v2-today-hero">
              <div className="v2-today-hero-copy"><p className="v2-kicker">{formatTodayDate(locale)}</p><h1>{locale === "zh" ? `${activeSpace.memberName}，先看今天最重要的变化。` : `${activeSpace.memberName}, start with today's most important changes.`}</h1><p>{locale === "zh" ? `Pi 已为“${defaultSpaceName(activeSpace.name, locale)}”整理阅读优先级；先做判断，再决定是否深读。` : `Pi has prioritized today's reading for “${defaultSpaceName(activeSpace.name, locale)}” so you can decide before reading deeply.`}</p></div>
              <div className="v2-today-hero-actions status-only"><span className={"v2-monitor-status " + (scanIsActive ? "scanning" : monitor?.status || "idle")}><i />{scanIsActive ? scanPhase : monitor?.status === "ready" ? (locale === "zh" ? "今日扫描已完成" : "Today's scan is ready") : monitor?.status === "error" ? t.scanError : t.neverScanned}</span></div>
              <section className="v2-today-briefing" aria-label={locale === "zh" ? "今日科研简报" : "Today's research briefing"}>
                <button type="button" onClick={() => rankedMonitorPapers[0] && openMonitorPaper(rankedMonitorPapers[0])} disabled={!rankedMonitorPapers.length}><span>01</span><strong>{mustReadCount}</strong><div><b>{locale === "zh" ? "今日必读" : "Must read"}</b><small>{locale === "zh" ? "最值得优先投入时间" : "Highest priority for your time"}</small></div><i>→</i></button>
                <button type="button" onClick={() => navigate("threads")}><span>02</span><strong>{monitor ? monitor.mapChanges?.length || 0 : "—"}</strong><div><b>{locale === "zh" ? "近 7 天路线变化" : "7-day route changes"}</b><small>{locale === "zh" ? "近期加入研究地图的证据" : "Recent evidence added to your map"}</small></div><i>→</i></button>
                <button type="button" onClick={() => { setLibraryFilter("accepted"); navigate("library"); }}><span>03</span><strong>{activeReadingCount}</strong><div><b>{locale === "zh" ? "待读与在读" : "Reading queue"}</b><small>{locale === "zh" ? "继续未完成的阅读" : "Continue unfinished reading"}</small></div><i>→</i></button>
              </section>
            </section>

            {monitor?.dailyBrief && <section className={`v2-ai-daily-brief ${monitor.dailyBrief.status}`}>
              <div className="v2-daily-brief-lead">
                <header><p className="v2-kicker">π {locale === "zh" ? "今日研究判断" : "TODAY'S RESEARCH JUDGMENT"}</p><span>{monitor.dailyBrief.date} · {monitor.dailyBrief.status === "degraded" ? (locale === "zh" ? "证据摘要" : "Evidence summary") : modelDisplayName(monitor.dailyBrief.model)}</span></header>
                <h2>{locale === "zh" ? monitor.dailyBrief.headlineZh : monitor.dailyBrief.headlineEn}</h2>
                <p className="v2-daily-brief-overview">{locale === "zh" ? monitor.dailyBrief.overviewZh : monitor.dailyBrief.overviewEn}</p>
                <dl className="v2-daily-brief-metrics"><div><dt>{locale === "zh" ? "候选" : "Candidates"}</dt><dd>{monitor.dailyBrief.metrics.scanned || 0}</dd></div><div><dt>{locale === "zh" ? "快速筛选" : "Screened"}</dt><dd>{latestQuickScreenedCount}</dd></div><div><dt>{locale === "zh" ? "深度解读" : "Deep review"}</dt><dd>{latestDeepReviewedCount}</dd></div><div><dt>{locale === "zh" ? "入选" : "Selected"}</dt><dd>{monitor.dailyBrief.metrics.recommended || 0}</dd></div></dl>
                {Boolean(dailyBriefPapers.length) && <footer><button type="button" onClick={() => openMonitorPaper(dailyBriefPapers[0])}>{locale === "zh" ? "从第一篇开始" : "Start with the first paper"} →</button><button className="secondary" type="button" onClick={() => shareSnapshot("daily", dailyBriefPapers)} disabled={Boolean(sharingSnapshot)}>↗ {sharingSnapshot === "daily" ? t.creatingShare : t.shareDaily}</button></footer>}
              </div>
              <div className="v2-daily-paper-queue">
                <header><div><strong>{locale === "zh" ? "今日阅读队列" : "Today's reading queue"}</strong><small>{locale === "zh" ? "先看书目信息，点击后再展开解读" : "Review the record first, then expand the interpretation"}</small></div><span>{dailyBriefEntryCount} {locale === "zh" ? "篇" : "papers"}</span></header>
                <div className="v2-daily-brief-list">
                  {Array.from({ length: dailyBriefEntryCount }, (_, index) => {
                    const paper = dailyBriefPapers[index];
                    const signal = dailySignals[index];
                    const readingAction = dailyReadingPlan[index];
                    return <details key={paper?.id || `${index}:${signal || readingAction}`}>
                      <summary><span>{String(index + 1).padStart(2, "0")}</span><div>{paper && <div className="v2-daily-paper-flags"><i className={`v2-tier-badge ${paper.recommendationTier || "browse"}`}>{recommendationTierLabel(paper.recommendationTier || "browse", locale)}</i>{paper.priorityVenue && <i>{locale === "zh" ? "重点来源" : "Priority source"}</i>}</div>}<h3>{paper?.title || (locale === "zh" ? `第 ${index + 1} 篇入选论文` : `Selected paper ${index + 1}`)}</h3>{paper && <><p className="v2-daily-paper-authors"><b>{locale === "zh" ? "作者" : "Authors"}</b><span>{paper.authors || (locale === "zh" ? "作者信息未提供" : "Authors unavailable")}</span></p><div className="v2-daily-paper-publication"><span><b>{locale === "zh" ? "发表" : "Published"}</b>{formatPaperDate(paper.publishedAt, locale)}</span><span><b>{locale === "zh" ? "期刊 / 会议" : "Venue"}</b>{paper.venue || (locale === "zh" ? "来源待核对" : "Source pending")}</span><span><b>{locale === "zh" ? "被引" : "Citations"}</b>{paper.citationCount || 0}</span><span><b>{locale === "zh" ? "预计阅读" : "Reading"}</b>{paper.readMinutes || 15} {locale === "zh" ? "分钟" : "min"}</span></div></>}</div><b aria-hidden="true">＋</b></summary>
                      <div className="v2-daily-paper-analysis">{signal && <section><strong>{locale === "zh" ? "它带来了什么" : "What changed"}</strong><p>{signal}</p></section>}{readingAction && <section><strong>{locale === "zh" ? "建议怎么读" : "How to read it"}</strong><p>{readingAction}</p></section>}{paper && <footer><button type="button" onClick={() => openMonitorPaper(paper)}>{locale === "zh" ? "查看完整解读" : "Open full analysis"} →</button><button type="button" onClick={() => saveFeedback(paper, "later")}>◷ {t.readLater}</button><button type="button" onClick={() => saveFeedback(paper, "save")}>{(saved[activeSpace.id + ":" + paper.id] ?? paper.saved) ? "★ " + t.saved : "☆ " + t.save}</button></footer>}</div>
                    </details>;
                  })}
                </div>
                {!dailyBriefEntryCount && <div className="v2-daily-zero-state"><strong>{locale === "zh" ? "为什么今天没有推荐？" : "Why are there no recommendations today?"}</strong><p>{locale === "zh" ? `${latestQuickScreenedCount} 篇论文完成快速筛选，其中 ${latestDeepReviewedCount} 篇进入逐篇深度解读；它们没有同时通过研究相关性、论文质量、证据完整度与模型明确推荐四项门槛。` : `${latestQuickScreenedCount} papers passed fast screening and ${latestDeepReviewedCount} received paper-by-paper deep review; none cleared all four gates for research fit, quality, evidence completeness, and an explicit model recommendation.`}</p><small>{locale === "zh" ? "Pi 不会为了填满页面降低标准；首批高潜力论文为零入选时，会在本轮补全证据并追加临界论文复审。" : "Pi will not lower the bar to fill the page. When the first high-potential batch yields nothing, the same scan enriches evidence and adds a near-miss review batch."}</small></div>}
                {Boolean((locale === "zh" ? monitor.dailyBrief.watchlistZh : monitor.dailyBrief.watchlistEn).length) && <aside><strong>{locale === "zh" ? "继续观察" : "Keep watching"}</strong><ul>{(locale === "zh" ? monitor.dailyBrief.watchlistZh : monitor.dailyBrief.watchlistEn).map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul></aside>}
              </div>
            </section>}

            {monitor?.weeklyReview && <details className={`v2-weekly-review ${monitor.weeklyReview.status}`}>
              <summary><span><p className="v2-kicker">7D {locale === "zh" ? "阶段研究回顾" : "RESEARCH REVIEW"}</p><strong>{locale === "zh" ? monitor.weeklyReview.titleZh : monitor.weeklyReview.titleEn}</strong><small>{locale === "zh" ? `来自 ${monitor.weeklyReview.sourceDays} 天真实记录` : `Based on ${monitor.weeklyReview.sourceDays} days of real activity`}</small></span><b>＋</b></summary>
              <div className="v2-weekly-review-body"><p>{locale === "zh" ? monitor.weeklyReview.overviewZh : monitor.weeklyReview.overviewEn}</p><div><article><h3>{locale === "zh" ? "已经获得" : "What advanced"}</h3><ul>{(locale === "zh" ? monitor.weeklyReview.gainsZh : monitor.weeklyReview.gainsEn).map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>{locale === "zh" ? "仍有缺口" : "Remaining gaps"}</h3><ul>{(locale === "zh" ? monitor.weeklyReview.gapsZh : monitor.weeklyReview.gapsEn).map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>{locale === "zh" ? "下一步行动" : "Next moves"}</h3><ol>{(locale === "zh" ? monitor.weeklyReview.nextStepsZh : monitor.weeklyReview.nextStepsEn).map((item) => <li key={item}>{item}</li>)}</ol></article></div></div>
            </details>}

            <div className="v2-research-utilities">
            <section className="v2-monitor-panel v2-monitor-compact">
              <div className="v2-monitor-head">
                <div className="v2-monitor-intro"><p className="v2-kicker">{locale === "zh" ? "论文发现" : "PAPER DISCOVERY"}</p><h2>{locale === "zh" ? "三个时间窗，持续向前挖掘" : "Three horizons, continuously explored"}</h2><p>{locale === "zh" ? "14 天看新变化，6 个月看新且优质，5 年补核心成果。" : "14 days for change, 6 months for recent quality, and 5 years for durable core work."}</p></div>
                <div className="v2-monitor-actions">
                  <span className={"v2-monitor-status " + (scanIsActive ? "scanning" : monitor?.status || "idle")}><i />{scanIsActive ? scanPhase : monitor?.status === "error" ? t.scanError : monitor?.status === "ready" ? t.scanReady : t.neverScanned}</span>
                  <button className="secondary" type="button" onClick={openSourceSettings} disabled={!monitor?.preferences || scanIsActive}>{t.editSources}</button>
                  <button type="button" onClick={runManualMonitor} disabled={scanIsActive}>{scanIsActive ? `${t.scanningButton} ${scanProgress}%` : resumeAvailable ? (locale === "zh" ? "从断点继续" : "Resume") : monitor?.scanJob?.needsRefresh ? (locale === "zh" ? "用新版重新扫描" : "Rescan with new method") : t.scanNow}</button>
                </div>
              </div>
              {monitor?.scanJob?.needsRefresh && !scanIsActive && <div className="v2-scan-upgrade-note"><span>π</span><div><strong>{locale === "zh" ? "当前结果来自旧版筛选方法" : "These results use the previous screening method"}</strong><p>{locale === "zh" ? "新版会先补全摘要、按研究方向分配名额，并在首批零入选时复审临界论文。重新扫描不受本小时冷却限制。" : "The new method enriches abstracts, allocates slots by research direction, and rechecks near-miss papers when the first batch yields nothing. This upgrade rescan bypasses the hourly cooldown."}</p></div></div>}
              {monitor?.status === "error" && (
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
                    {isModelCredentialFailure(failedScanError) && <button className="secondary" type="button" onClick={() => { setModelSettingsError(monitorFailureMessage(failedScanError, locale)); setModelSettingsOpen(true); }}>{locale === "zh" ? "检查 Key" : "Check key"}</button>}
                  </div>
                </details>
              )}
              {scanIsActive && (
                <div className="v2-scan-progress" role="status" aria-live="polite" aria-label={`${scanPhase} ${scanProgress}%`}>
                  <div><span>{scanPhase}</span><strong>{scanProgress}%</strong></div>
                  <i><b style={{ width: `${scanProgress}%` }} /></i>
                  <small>
                    {activeScanJob?.discoveredCount || monitor?.scannedCount || 0} {locale === "zh" ? "条候选" : "candidates"}
                    {["screening", "deep_reviewing", "reviewing"].includes(effectiveScanStatus) && <> · {activeScanJob?.reviewedCount || 0}{activeScanJob?.candidateCount ? ` / ${activeScanJob.candidateCount}` : ""} {locale === "zh" ? "篇已筛选保存" : "screened and saved"}</>}
                    {effectiveScanStatus === "deep_reviewing" && <> · {activeScanJob?.recommendedCount || 0} {locale === "zh" ? "篇已可阅读" : "ready to read"}</>}
                    {healthyCoverageCount > 0 && <> · {healthyCoverageCount} {locale === "zh" ? "类来源正常" : "source groups healthy"}</>}
                    {scanElapsedSeconds > 0 && <> · {scanElapsedSeconds < 60 ? `${scanElapsedSeconds}s` : `${Math.floor(scanElapsedSeconds / 60)}m ${scanElapsedSeconds % 60}s`}</>}
                    {locale === "zh" ? " · 上次推荐仍可继续阅读" : " · Previous recommendations remain readable"}
                  </small>
                  {["screening", "deep_reviewing"].includes(effectiveScanStatus) && <em className="v2-resume-note">✓ {locale === "zh" ? "每完成一批就会立即保存；推荐出现后可先阅读，无需等待整轮结束" : "Each completed batch is saved immediately. You can start reading before the full scan finishes."}</em>}
                  {activeScanJob?.resumeOfJobId && <em className="v2-resume-note">↻ {locale === "zh" ? `正在从已保存检查点续跑 · 第 ${activeScanJob.attempt || 2} 次尝试` : `Resuming from a saved checkpoint · attempt ${activeScanJob.attempt || 2}`}</em>}
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
              <div className="v2-monitor-meta"><button className="v2-inbox-summary" type="button" onClick={() => { setLibraryFilter("inbox"); setInboxFilter("all"); navigate("library"); }}><span>{monitor?.historyCounts?.inbox || 0} {t.inbox}</span><small>{monitor?.historyCounts?.unseen || 0} {t.unseen} · {locale === "zh" ? "未处理内容会保留" : "Unresolved papers stay here"}</small><b>→</b></button>
              <details className="v2-scan-details">
                <summary>{locale === "zh" ? "扫描范围与来源" : "Scan scope & sources"}<b>＋</b></summary>
                <div className="v2-source-profile"><div><span>{t.detectedDomain}</span><strong>{locale === "zh" ? monitor?.preferences?.profileNameZh : monitor?.preferences?.profileNameEn}</strong><em>{monitor?.preferences?.userModified ? t.userCustomized : t.systemProvided}</em></div><div><span>{t.prioritySources}</span><p>{monitor?.preferences?.priorityVenues.slice(0, 6).map((venue) => <i key={venue}>{venue}</i>)}</p></div>{Boolean(monitor?.preferences?.trackedAuthors?.length) && <div><span>{locale === "zh" ? "追踪作者" : "Tracked authors"}</span><p>{monitor?.preferences?.trackedAuthors.slice(0, 6).map((author) => <i key={author}>{author}</i>)}</p></div>}</div>
                {monitor?.queryPlan && <div className="v2-query-plan"><span>π</span><div><strong>{locale === "zh" ? "今日检索计划" : "Today's query plan"} · {monitor.queryPlan.queryCount} {locale === "zh" ? "组查询" : "queries"}</strong><p>{locale === "zh" ? monitor.queryPlan.rationaleZh : monitor.queryPlan.rationaleEn}</p><small>{monitor.queryPlan.degraded ? (locale === "zh" ? "智能规划暂不可用，已使用稳定检索策略" : "Stable fallback discovery is active") : modelDisplayName(monitor.queryPlan.model)}</small></div></div>}
                <dl className="v2-monitor-metrics"><div><dt>{t.lastScan}</dt><dd>{formatMonitorDate(monitor?.lastRunAt || null, locale)}</dd></div><div><dt>{t.nextScan}</dt><dd>{formatMonitorDate(monitor?.nextRunAt || null, locale)}</dd></div><div><dt>{locale === "zh" ? "自动监控" : "Automatic monitoring"}</dt><dd>{locale === "zh" ? `每 ${monitor?.automation?.cadenceHours || 24} 小时 · ${monitor?.automation?.schedulerCheckMinutes || 10} 分钟检查一次` : `Every ${monitor?.automation?.cadenceHours || 24}h · due check every ${monitor?.automation?.schedulerCheckMinutes || 10}m`}</dd></div><div><dt>{locale === "zh" ? "上次触发" : "Last trigger"}</dt><dd>{monitor?.lastTrigger === "scheduled" ? (locale === "zh" ? "后台定时" : "Scheduled") : monitor?.lastTrigger === "manual" ? (locale === "zh" ? "手动深挖" : "Manual deep dive") : (locale === "zh" ? "打开时补扫" : "Catch-up on visit")}</dd></div><div><dt>{locale === "zh" ? "持续探索轮次" : "Exploration round"}</dt><dd>#{monitor?.explorationRound || 0}</dd></div><div><dt>{monitor?.knownCount || 0} {t.knownPapers}</dt><dd>{monitor?.scannedCount || 0} {t.scannedPapers}</dd></div></dl>
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

            {!!monitor?.mapChanges?.length && <section className="v2-route-changes"><header><div><p className="v2-kicker warm">π {locale === "zh" ? "研究路线变化" : "Research route changes"}</p><h2>{locale === "zh" ? "路线、证据与论文节点最近发生了什么" : "What changed across routes, evidence, and paper nodes"}</h2></div><button type="button" onClick={() => navigate("threads")}>{locale === "zh" ? "打开地图" : "Open map"} →</button></header><div>{monitor.mapChanges.slice(0, 3).map((change) => { const kind = routeChangeKindLabel(change.kind, locale); return <article key={change.id}><span>{kind.symbol}</span><div><small>{locale === "zh" ? change.trackTitleZh : change.trackTitleEn} · {locale === "zh" ? kind.zh : kind.en}{change.kind === "new_evidence" ? ` · ${change.confidence}%` : ""}</small><h3>{change.kind === "new_evidence" ? change.paperTitle : locale === "zh" ? change.titleZh : change.titleEn}</h3><p>{locale === "zh" ? change.summaryZh : change.summaryEn}</p></div></article>; })}</div></section>}

            {Boolean(additionalTodayPapers.length) && <section className="v2-today-more">
              <header><div><p className="v2-kicker warm">{locale === "zh" ? "更多推荐" : "MORE RECOMMENDATIONS"}</p><h2>{locale === "zh" ? "不在今日主队列，但仍值得保留" : "Worth keeping beyond the main queue"}</h2></div><span>{additionalTodayPapers.length} {locale === "zh" ? "篇" : "papers"}</span></header>
              <div className="v2-compact-list">{additionalTodayPapers.map((paper) => <button type="button" key={paper.id} data-paper-impression={paper.id} onClick={() => openMonitorPaper(paper)}><span className={`v2-tier-badge ${paper.recommendationTier || "browse"}`}>{recommendationTierLabel(paper.recommendationTier || "browse", locale)}</span><span><strong>{paper.title}</strong><small>{paper.authors || (locale === "zh" ? "作者信息未提供" : "Authors unavailable")} · {formatPaperDate(paper.publishedAt, locale)} · {paper.citationCount || 0} {t.citations}</small></span><span className="v2-thread-chip">{paper.readMinutes || 15} min</span><b>→</b></button>)}</div>
            </section>}

          </main>
        )}

        {view === "threads" && (
          <main className="v2-page v2-map-page">
            <section className="v2-page-head v2-map-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {modelDisplayName(researchMap.model)}</p><h1>{locale === "zh" ? "研究地图" : "Research map"}</h1><p>{researchMapMode === "directions" ? (locale === "zh" ? "先看领域分支，再下钻到每篇论文。" : "See the field structure, then move down to individual papers.") : (locale === "zh" ? "真实引用与 Pi 策展路径分开呈现。" : "Verified citations and Pi-curated paths stay visibly distinct.")}</p></div><div className="v2-map-head-actions"><div className="v2-map-view-switch" role="tablist" aria-label={locale === "zh" ? "研究地图视图" : "Research map view"}><button type="button" role="tab" aria-selected={researchMapMode === "directions"} className={researchMapMode === "directions" ? "active" : ""} onClick={() => { setResearchMapMode("directions"); setSelectedNetworkPaperId(null); }}>{locale === "zh" ? "方向路径" : "Direction paths"}</button><button type="button" role="tab" aria-selected={researchMapMode === "papers"} className={researchMapMode === "papers" ? "active" : ""} onClick={() => setResearchMapMode("papers")}>{locale === "zh" ? "论文网络" : "Paper network"}</button></div><span className="v2-map-total"><strong>{researchMap.paperNetwork.paperCount || networkPaperNodes.length}</strong>{locale === "zh" ? "篇代表作" : "representative works"}</span></div></section>
            {mapLoading ? (
              <section className="v2-map-loading v2-outline-loading" role="status"><span>π</span><div><strong>{locale === "zh" ? "先建立可浏览的方向骨架" : "Building a browsable direction outline first"}</strong><p>{mapOutlineLabels[mapOutlinePhase]}</p><i><b style={{ width: `${22 + mapOutlinePhase * 21}%` }} /></i><small>{locale === "zh" ? "骨架出现后，你可以立即浏览；真实论文会逐条路线继续补充。" : "You can browse as soon as the outline appears while real papers continue filling each route."}</small></div></section>
            ) : researchMap.tracks.length ? (
              <>
                {researchMapMode === "directions" ? <>
                {(researchMap.buildProgress?.pendingTrackIds.length || mapBuildTrackId) ? <section className="v2-map-build-progress" role="status"><div><span className={mapBuildTrackId ? "working" : "paused"}><i /></span><div><strong>{mapBuildTrackId ? (locale === "zh" ? `正在补充第 ${(researchMap.buildProgress?.ready || 0) + 1} / ${researchMap.buildProgress?.total || researchMap.tracks.length} 条路线` : `Filling route ${(researchMap.buildProgress?.ready || 0) + 1} of ${researchMap.buildProgress?.total || researchMap.tracks.length}`) : (locale === "zh" ? `还有 ${researchMap.buildProgress?.pendingTrackIds.length || 0} 条路线等待补充` : `${researchMap.buildProgress?.pendingTrackIds.length || 0} routes are waiting to be filled`)}</strong><p>{currentBuildTrack ? (locale === "zh" ? currentBuildTrack.titleZh : currentBuildTrack.titleEn) : (locale === "zh" ? "已完成的部分已经保存，可以打开路线浏览或选择失败方向重试。" : "Completed work is saved; browse ready routes or retry a pending direction.")}</p></div></div><i><b style={{ width: `${researchMap.buildProgress?.total ? Math.round((researchMap.buildProgress.ready / researchMap.buildProgress.total) * 100) : 0}%` }} /></i><small>{locale === "zh" ? "切换页面不会丢失已经完成的内容，下次进入会从未完成处继续。" : "Completed work will not be lost if you leave; the next visit resumes unfinished routes."}</small></section> : null}
                {(researchMap.intelligenceProgress?.pendingTrackIds.length || mapIntelligenceTrackId) ? <section className="v2-map-build-progress v2-intelligence-progress" role="status"><div><span className={mapIntelligenceTrackId ? "working" : "paused"}><i>π</i></span><div><strong>{mapIntelligenceTrackId ? (locale === "zh" ? "DeepSeek Pro 正在形成方向研判" : "DeepSeek Pro is forming a direction assessment") : (locale === "zh" ? "部分方向等待 Pi 研判" : "Some directions await Pi's assessment")}</strong><p>{currentIntelligenceTrack ? (locale === "zh" ? currentIntelligenceTrack.titleZh : currentIntelligenceTrack.titleEn) : (locale === "zh" ? "路线和论文已经可以正常浏览，研判将在下次进入时继续。" : "Routes and papers remain available; interpretation resumes on the next visit.")}</p></div></div><i><b style={{ width: `${researchMap.intelligenceProgress?.total ? Math.round((researchMap.intelligenceProgress.ready / researchMap.intelligenceProgress.total) * 100) : 0}%` }} /></i><small>{locale === "zh" ? "Pi 会给出当前判断、关键机会和应关注的变化信号，并绑定真实论文证据。" : "Pi adds a current assessment, key opportunity, and watch signal grounded in real paper evidence."}</small></section> : null}
                <section className={`v2-direction-path-panel ${directionOverviewTrack ? "has-inspector" : ""}`}>
                  <header><div><p className="v2-kicker">{locale === "zh" ? "领域演化" : "FIELD EVOLUTION"}</p><h2>{locale === "zh" ? "从理论奠基走到当前前沿" : "From foundations to the current frontier"}</h2><p>{locale === "zh" ? "悬停方向可临时预览关系，点击可锁定；右侧会解释每条 Pi 推断的具体含义。" : "Hover a direction to preview its links, or click to pin them; the side panel explains every Pi-inferred relationship."}</p></div><div className="v2-direction-path-legend"><span><i className="solid" />{locale === "zh" ? "方向主线" : "Direction"}</span><span><i className="paper" />{locale === "zh" ? "真实论文" : "Real paper"}</span><span><i className="gap" />{locale === "zh" ? "待补证据" : "Evidence gap"}</span></div></header>
                  <div className="v2-direction-path-stage">
                    <DirectionPathMap map={researchMap} locale={locale} selectedTrackId={directionOverviewId} focusedEdgeId={directionRelationFocusId || directionPinnedRelationId} onSelect={(trackId) => { setDirectionOverviewId(trackId); setDirectionRelationFocusId(null); setDirectionPinnedRelationId(null); }} onClear={() => { setDirectionOverviewId(null); setDirectionRelationFocusId(null); setDirectionPinnedRelationId(null); }} />
                    {directionOverviewTrack && <aside className="v2-direction-path-inspector">
                      <div><span className={`v2-direction-heat ${directionOverviewTrack.heatLevel}`}><i />{directionHeatLabel(directionOverviewTrack.heatLevel, locale)}</span><small>{directionRoleLabel(directionOverviewTrack.userRole, locale)}</small></div>
                      <h2>{locale === "zh" ? directionOverviewTrack.titleZh : directionOverviewTrack.titleEn}</h2>
                      <p>{locale === "zh" ? directionOverviewTrack.summaryZh : directionOverviewTrack.summaryEn}</p>
                      <dl><div><dt>{locale === "zh" ? "研究深度" : "Depth"}</dt><dd>{directionOverviewTrack.depthScore}</dd></div><div><dt>{locale === "zh" ? "路线论文" : "Papers"}</dt><dd>{directionOverviewTrack.papers.length}</dd></div><div><dt>{locale === "zh" ? "近期证据" : "Recent"}</dt><dd>{directionOverviewTrack.recentPaperCount}</dd></div></dl>
                      {directionOverviewRelations.length > 0 && <section className="v2-direction-relations"><header><div><strong>{locale === "zh" ? "与其他方向的关系" : "Links to other directions"}</strong><small>{locale === "zh" ? "悬停预览，点击固定 · Pi 推断，不代表真实引用" : "Hover to preview, click to pin · Pi-inferred, not a citation claim"}</small></div><span>{directionOverviewRelations.length}</span></header><div>{directionOverviewRelations.map(({ edge, source, target }) => { const sourceTitle = locale === "zh" ? source.titleZh : source.titleEn; const targetTitle = locale === "zh" ? target.titleZh : target.titleEn; const clearPreview = () => setDirectionRelationFocusId((current) => current === edge.id ? null : current); const pinned = directionPinnedRelationId === edge.id; return <button type="button" className={`${directionRelationFocusId === edge.id ? "previewing" : ""} ${pinned ? "pinned" : ""}`} key={edge.id} onPointerEnter={() => setDirectionRelationFocusId(edge.id)} onPointerLeave={clearPreview} onFocus={() => setDirectionRelationFocusId(edge.id)} onBlur={clearPreview} onClick={() => { setDirectionPinnedRelationId((current) => current === edge.id ? null : edge.id); setDirectionRelationFocusId(null); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setDirectionRelationFocusId(null); setDirectionPinnedRelationId(null); } }} aria-pressed={pinned} aria-label={`${directionRelationshipLabel(edge.kind, locale)}: ${sourceTitle} ${edge.kind === "bridges" ? "↔" : "→"} ${targetTitle}. ${locale === "zh" ? edge.relationshipZh : edge.relationshipEn}`}><span><b>{directionRelationshipLabel(edge.kind, locale)}</b><em>{pinned ? (locale === "zh" ? "已固定" : "Pinned") : `Pi · ${edge.strength}%`}</em></span><strong>{sourceTitle}<i>{edge.kind === "bridges" ? "↔" : "→"}</i>{targetTitle}</strong><small>{locale === "zh" ? edge.relationshipZh : edge.relationshipEn}</small></button>; })}</div></section>}
                      {directionOverviewTrack.intelligence && <blockquote><small>{locale === "zh" ? "Pi 当前判断" : "Pi assessment"}</small><p>{locale === "zh" ? directionOverviewTrack.intelligence.assessmentZh : directionOverviewTrack.intelligence.assessmentEn}</p></blockquote>}
                      <footer><button type="button" onClick={() => openThread(directionOverviewTrack)}>{locale === "zh" ? "查看完整路径" : "Open full path"} →</button><button type="button" onClick={() => void expandResearchTrack(directionOverviewTrack)} disabled={Boolean(mapAction || mapBuildTrackId)}>{mapAction === directionOverviewTrack.id ? (locale === "zh" ? "正在深挖…" : "Mining…") : (locale === "zh" ? "继续深挖" : "Mine deeper")} ＋</button></footer>
                    </aside>}
                  </div>
                </section>
                <section className="v2-field-network v2-field-network-legacy" hidden>
                  <div className="v2-network-root"><span>π</span><div><small>{locale === "zh" ? "研究主干" : "Research backbone"}</small><strong>{defaultSpaceName(activeSpace.name, locale)}</strong><p>{activeSpace.description}</p></div></div>
                  <div className="v2-network-branches">
                    {[...researchMap.tracks].sort((left, right) => ({ core: 0, support: 1, explore: 2 })[left.userRole] - ({ core: 0, support: 1, explore: 2 })[right.userRole] || right.depthScore - left.depthScore).map((thread, index) => (
                      <article className={`v2-network-node ${thread.userRole} ${thread.buildStatus}`} key={thread.id}>
                        <header><span>{String(index + 1).padStart(2, "0")}</span><b>{directionRoleLabel(thread.userRole, locale)}</b>{thread.buildStatus === "ready" ? <em className={`v2-direction-heat ${thread.heatLevel}`} title={directionHeatTitle(thread, locale)}><i />{directionHeatLabel(thread.heatLevel, locale)}</em> : <em className={`v2-track-build-chip ${mapBuildTrackId === thread.id ? "working" : mapBuildErrors[thread.id] ? "error" : "queued"}`}><i />{mapBuildTrackId === thread.id ? (locale === "zh" ? "补充中" : "Filling") : mapBuildErrors[thread.id] ? (locale === "zh" ? "可重试" : "Retry") : (locale === "zh" ? "排队中" : "Queued")}</em>}<small>{thread.papers.length} {locale === "zh" ? "篇" : "papers"}</small></header>
                        <button className="v2-network-node-main" type="button" onClick={() => openThread(thread)}><h2>{locale === "zh" ? thread.titleZh : thread.titleEn}</h2><p>{locale === "zh" ? thread.summaryZh : thread.summaryEn}</p></button>
                        {thread.intelligence ? <div className="v2-direction-intelligence-line"><span>π</span><p>{locale === "zh" ? thread.intelligence.assessmentZh : thread.intelligence.assessmentEn}</p><b>{thread.intelligence.confidence}%</b></div> : thread.buildStatus === "ready" && thread.papers.length ? <div className="v2-direction-intelligence-line pending"><span>π</span><p>{locale === "zh" ? "Pi 正在基于路线证据形成研判" : "Pi is interpreting the route evidence"}</p></div> : null}
                        <div className="v2-direction-signals"><span><small>{locale === "zh" ? "研究深度" : "User depth"}</small><i><b style={{ width: `${thread.depthScore}%` }} /></i><strong>{thread.depthScore}</strong></span><span><small>{locale === "zh" ? "辅助价值" : "Support value"}</small><i><b style={{ width: `${thread.supportScore}%` }} /></i><strong>{thread.supportScore}</strong></span></div>
                        <div className="v2-direction-role-control" role="group" aria-label={locale === "zh" ? "设置方向定位" : "Set direction role"}>{(["core", "support", "explore"] as ResearchDirectionRole[]).map((role) => <button type="button" className={thread.userRole === role ? "active" : ""} key={role} onClick={() => void setResearchDirectionRole(thread, role)} disabled={Boolean(mapAction)}>{directionRoleLabel(role, locale)}</button>)}</div>
                        <footer><button type="button" onClick={() => openThread(thread)}>{thread.buildStatus === "queued" ? (locale === "zh" ? "先看方向" : "Preview direction") : (locale === "zh" ? "查看路径" : "Open path")} →</button><button type="button" onClick={() => void expandResearchTrack(thread)} disabled={Boolean(mapAction || mapBuildTrackId)}>{mapAction === thread.id ? (thread.buildStatus === "queued" ? (locale === "zh" ? "补充中…" : "Filling…") : (locale === "zh" ? "深挖中…" : "Mining…")) : thread.buildStatus === "queued" ? (mapBuildErrors[thread.id] ? (locale === "zh" ? "重试补充" : "Retry fill") : (locale === "zh" ? "等待补充" : "Waiting")) : (locale === "zh" ? "继续深挖" : "Mine deeper")}</button></footer>
                      </article>
                    ))}
                  </div>
                </section>
                {false && researchMap.edges.length ? <section className="v2-network-links"><header><p className="v2-kicker">{locale === "zh" ? "方向关联" : "Cross-direction links"}</p><h2>{locale === "zh" ? "主干之外的桥接关系" : "Bridges beyond the backbone"}</h2></header><div>{researchMap.edges.map((edge) => { const source = researchMap.tracks.find((track) => track.id === edge.sourceTrackId); const target = researchMap.tracks.find((track) => track.id === edge.targetTrackId); if (!source || !target) return null; return <button type="button" key={edge.id} onClick={() => openThread(target)}><span>{locale === "zh" ? source.titleZh : source.titleEn}</span><i>{edge.kind === "bridges" ? "⇄" : "→"}</i><span>{locale === "zh" ? target.titleZh : target.titleEn}</span><small>{locale === "zh" ? edge.relationshipZh : edge.relationshipEn}</small><b>{edge.strength}</b></button>; })}</div></section> : null}
                </> : <section className="v2-paper-network-panel">
                  <header className="v2-paper-network-toolbar">
                    <div className="v2-paper-network-mode" role="tablist" aria-label={locale === "zh" ? "论文网络模式" : "Paper network mode"}>
                      <button type="button" role="tab" aria-selected={paperNetworkMode === "similarity"} className={paperNetworkMode === "similarity" ? "active" : ""} onClick={() => { setPaperNetworkMode("similarity"); setSelectedNetworkPaperId(null); setPaperNetworkScope("all"); }}><span>{locale === "zh" ? "发现关联" : "Discover links"}</span><b>{researchMap.paperNetwork.similarityEdgeCount + researchMap.paperNetwork.semanticEdgeCount}</b></button>
                      <button type="button" role="tab" aria-selected={paperNetworkMode === "citations"} className={paperNetworkMode === "citations" ? "active" : ""} onClick={() => { setPaperNetworkMode("citations"); setSelectedNetworkPaperId(null); setPaperNetworkScope("all"); }}><span>{locale === "zh" ? "知识引用流" : "Citation flow"}</span><b>{researchMap.paperNetwork.citationEdgeCount}</b></button>
                      <button type="button" role="tab" aria-selected={paperNetworkMode === "path"} className={paperNetworkMode === "path" ? "active" : ""} onClick={() => { setPaperNetworkMode("path"); setSelectedNetworkPaperId(null); setPaperNetworkScope("all"); }}><span>{locale === "zh" ? "建议阅读顺序" : "Reading order"}</span><b>{researchMap.paperNetwork.pathEdgeCount}</b></button>
                    </div>
                    <div className="v2-paper-network-filters"><div className="v2-paper-network-scope" role="group" aria-label={locale === "zh" ? "网络范围" : "Network scope"}><button type="button" className={paperNetworkScope === "all" ? "active" : ""} onClick={() => setPaperNetworkScope("all")}>{locale === "zh" ? "全图" : "Overview"}</button><button type="button" className={paperNetworkScope === "one-hop" ? "active" : ""} disabled={!selectedNetworkPaperId} onClick={() => setPaperNetworkScope("one-hop")}>1-hop</button>{paperNetworkMode === "similarity" && <button type="button" className={paperNetworkScope === "multi-seed" ? "active" : ""} disabled={explicitNetworkOriginNodes.length < 2} onClick={() => { setSelectedNetworkPaperId(null); setPaperNetworkScope("multi-seed"); }}>{locale === "zh" ? "多种子" : "Multi-origin"}</button>}</div><label><span>{locale === "zh" ? "方向" : "Direction"}</span><select value={paperNetworkTrackId} onChange={(event) => { setPaperNetworkTrackId(event.target.value); setSelectedNetworkPaperId(null); setPaperNetworkOriginCanonicalIds([]); setPaperNetworkScope("all"); }}><option value="all">{locale === "zh" ? "全部方向" : "All directions"}</option>{researchMap.tracks.map((track) => <option value={track.id} key={track.id}>{locale === "zh" ? track.titleZh : track.titleEn}</option>)}</select></label><button type="button" onClick={() => void refreshPaperNetwork()} disabled={paperNetworkLoading || researchMap.paperNetwork.paperCount < 2}>{paperNetworkLoading ? (locale === "zh" ? "构建中…" : "Building…") : (locale === "zh" ? "更新关系" : "Refresh links")}</button></div>
                  </header>
                  <div className={`v2-paper-network-context ${paperNetworkMode} ${paperNetworkScope}`}><strong>{paperNetworkContext.title}</strong><span>{paperNetworkContext.body}</span></div>
                  {paperNetworkMode === "similarity" && <div className="v2-network-origin-bar"><span>{locale === "zh" ? "网络种子" : "Origins"}<b>{effectiveNetworkOriginNodes.length}/3</b></span><div>{effectiveNetworkOriginNodes.map((node, index) => <span className="v2-network-origin-chip" key={node.paper.canonicalId}><button className="v2-network-origin-select" type="button" aria-pressed={selectedNetworkPaperId === node.paper.id} onClick={() => { setSelectedNetworkPaperId(node.paper.id); setPaperNetworkScope(explicitNetworkOriginNodes.length >= 2 ? "multi-seed" : "one-hop"); }}><b>{index + 1}</b><span>{node.paper.title.slice(0, 44)}</span></button>{explicitNetworkOriginNodes.length > 0 && <button className="v2-network-origin-remove" type="button" onClick={() => removeNetworkOrigin(node.paper.canonicalId)} aria-label={locale === "zh" ? `移除种子：${node.paper.title}` : `Remove origin: ${node.paper.title}`}>×</button>}</span>)}</div><small>{explicitNetworkOriginNodes.length >= 2 ? (locale === "zh" ? "联合邻域优先保留每个种子的强关系" : "The combined view preserves strong links around every origin") : explicitNetworkOriginNodes.length ? (locale === "zh" ? "再加入一篇论文即可形成联合邻域" : "Add one more paper to form a combined neighborhood") : (locale === "zh" ? "Pi 默认中心；从论文详情可加入多种子" : "Pi default center; add origins from paper details")}</small></div>}
                  {paperNetworkMode === "citations" && (citationLineage.prior.length > 0 || citationLineage.derivative.length > 0) && <div className="v2-network-lineage"><section><span>{locale === "zh" ? "它承接的前置工作" : "Prior work it builds on"}</span>{citationLineage.prior.map((node) => <button type="button" key={node.paper.id} onClick={() => { setSelectedNetworkPaperId(node.paper.id); setPaperNetworkScope("one-hop"); }}>{node.paper.title}</button>)}</section><section><span>{locale === "zh" ? "后续引用它的工作" : "Later work citing it"}</span>{citationLineage.derivative.map((node) => <button type="button" key={node.paper.id} onClick={() => { setSelectedNetworkPaperId(node.paper.id); setPaperNetworkScope("one-hop"); }}>{node.paper.title}</button>)}</section></div>}
                  {(paperNetworkLoading || researchMap.paperNetwork.status === "building") && <div className="v2-paper-network-progress" role="status"><span><i /></span><div><strong>{paperNetworkBuildPhase === "pi" ? (locale === "zh" ? "真实关系已可浏览" : "Verified links are ready") : (locale === "zh" ? "正在核验真实引用" : "Verifying real citations")}</strong><p>{paperNetworkBuildPhase === "pi" ? (locale === "zh" ? `Pi 正在逐条补充语义关系与阅读路径；当前已有 ${researchMap.paperNetwork.citationEdgeCount + researchMap.paperNetwork.similarityEdgeCount} 条真实关系。` : `Pi is adding semantic links and reading paths; ${researchMap.paperNetwork.citationEdgeCount + researchMap.paperNetwork.similarityEdgeCount} verified links are already visible.`) : (locale === "zh" ? "真实引用与文献耦合一旦核验完成，就会先出现在图上。" : "Verified citations and coupling links will appear before Pi analysis finishes.")}</p></div></div>}
                  {!paperNetworkLoading && ["partial", "error"].includes(researchMap.paperNetwork.status) && (() => { const notice = paperNetworkSourceNotice(researchMap.paperNetwork, locale); return <div className="v2-paper-network-note" role="status"><span /><div><strong>{notice.title}</strong><p>{notice.body}</p></div><button type="button" onClick={() => void refreshPaperNetwork()}>{notice.action}</button></div>; })()}
                  <div className={`v2-paper-network-stage ${selectedNetworkNode ? "has-drawer" : ""}`}>
                    <div className="v2-paper-network-main">
                      <PaperNetworkGraph map={researchMap} mode={paperNetworkMode} scope={paperNetworkScope} trackFilter={paperNetworkTrackId} locale={locale} selectedPaperId={selectedNetworkPaperId} originPaperIds={paperNetworkMode === "similarity" ? effectiveNetworkOriginIds : []} paperStates={paperStateByCanonicalId} onSelect={(paperId) => { setSelectedNetworkPaperId(paperId); if (paperNetworkScope !== "multi-seed") setPaperNetworkScope("one-hop"); }} />
                      <footer className="v2-paper-network-legend">{paperNetworkMode === "similarity" ? <><span><i className="similarity" />{locale === "zh" ? "文献耦合：共享参考文献" : "Coupling: shared references"}</span><span><i className="semantic" />{locale === "zh" ? "虚线：Pi 解释的语义关系" : "Dashed: Pi semantic link"}</span><span><i className="citation" />{locale === "zh" ? "箭头：真实引用形成的知识流" : "Arrow: knowledge flow from verified citations"}</span>{paperNetworkScope === "multi-seed" && <span><i className="shared-neighbor" />{locale === "zh" ? "双环：多个种子的共同邻居" : "Double ring: neighbor shared by multiple origins"}</span>}</> : paperNetworkMode === "citations" ? <span><i className="citation" />{locale === "zh" ? "数据库确认的引用 · 被引论文 → 后续论文" : "Database-verified citation · cited paper → later paper"}</span> : <><span><i className="path" />{locale === "zh" ? "金线：Pi 推荐的先读 → 再读" : "Gold: Pi recommends read first → read next"}</span><span><i className="path-step-legend" />{locale === "zh" ? "圆内数字：阅读步骤" : "Number in node: reading step"}</span></>}</footer>
                    </div>
                    {selectedNetworkNode && <aside className="v2-paper-network-drawer" aria-label={locale === "zh" ? "论文详情" : "Paper details"}>
                      <button className="v2-paper-drawer-close" type="button" onClick={() => { setSelectedNetworkPaperId(null); if (paperNetworkScope !== "multi-seed") setPaperNetworkScope("all"); }} aria-label={t.close}>×</button>
                      <p className="v2-kicker">{researchRoleLabel(selectedNetworkNode.paper.role, locale)} · {researchPaperYear(selectedNetworkNode.paper)}</p>
                      <h2>{selectedNetworkNode.paper.title}</h2>
                      <small>{[selectedNetworkNode.paper.authors, selectedNetworkNode.paper.venue, `${selectedNetworkNode.paper.citationCount} ${t.citations}`].filter(Boolean).join(" · ")}</small>
                      <div className="v2-paper-drawer-copy"><b>{t.introLabel}</b><p>{locale === "zh" ? selectedNetworkNode.paper.summaryZh : selectedNetworkNode.paper.summaryEn}</p><b>{locale === "zh" ? "路线位置" : "Place in the route"}</b><p>{locale === "zh" ? selectedNetworkNode.paper.rationaleZh : selectedNetworkNode.paper.rationaleEn}</p></div>
                      {selectedNetworkRelations.length > 0 && <div className="v2-paper-drawer-relations"><b>{locale === "zh" ? "关键关系" : "Key relationships"}</b>{selectedNetworkRelations.map((edge) => { const outgoingCitation = edge.kind === "citation" && edge.sourcePaperId === selectedNetworkNode.paper.id; const otherId = edge.sourcePaperId === selectedNetworkNode.paper.id ? edge.targetPaperId : edge.sourcePaperId; const other = networkPaperNodes.find((node) => node.paper.id === otherId); if (!other) return null; const relationLabel = edge.kind === "citation" ? outgoingCitation ? (locale === "zh" ? "本论文引用了" : "This paper cites") : (locale === "zh" ? "后续论文引用了本论文" : "Later paper cites this work") : networkRelationLabel(edge, locale); return <button type="button" key={edge.id} onClick={() => { setSelectedNetworkPaperId(other.paper.id); if (paperNetworkScope !== "multi-seed") setPaperNetworkScope("one-hop"); }}><span>{relationLabel} · {edge.confidence}%</span><strong>{other.paper.title}</strong><small>{locale === "zh" ? edge.relationshipZh : edge.relationshipEn}</small></button>; })}</div>}
                      <div className="v2-paper-origin-actions"><button type="button" onClick={() => setSingleNetworkOrigin(selectedNetworkNode)}>{locale === "zh" ? "设为单一中心" : "Set as single origin"}</button><button type="button" onClick={() => addMultiNetworkOrigin(selectedNetworkNode)} disabled={effectiveNetworkOriginIds.includes(selectedNetworkNode.paper.id) || explicitNetworkOriginNodes.length >= 3}>{effectiveNetworkOriginIds.includes(selectedNetworkNode.paper.id) ? (locale === "zh" ? "已是种子" : "Already an origin") : (locale === "zh" ? "加入多种子" : "Add origin")}</button></div>
                      <footer><a href={selectedNetworkNode.paper.url || (selectedNetworkNode.paper.doi ? "https://doi.org/" + selectedNetworkNode.paper.doi : "#")} target="_blank" rel="noreferrer" onClick={() => recordMapPaperOpen(selectedNetworkNode.track.id)}>{t.openOriginal} ↗</a><button type="button" onClick={() => askAboutNetworkPaper(selectedNetworkNode)}>{locale === "zh" ? "让 Pi 解释" : "Ask Pi"}</button><button type="button" onClick={() => addNetworkPaperToLearningPath(selectedNetworkNode)}>{locale === "zh" ? "加入学习路径" : "Add to learning path"}</button></footer>
                    </aside>}
                  </div>
                </section>}
              </>
            ) : <section className="v2-map-empty"><span>◎</span><h2>{locale === "zh" ? "暂时没有可展示的真实路线" : "No real route is available yet"}</h2><p>{locale === "zh" ? "Pi 不会用演示论文填充这里。稍后重新进入即可再次尝试。" : "Pi will not fill this area with demo papers. Return later to retry."}</p></section>}
          </main>
        )}

        {view === "thread-detail" && (
          <main className="v2-page v2-detail-page v2-map-detail">
            <button className="v2-back" type="button" onClick={() => navigate("threads")}>← {t.backThreads}</button>
            {selectedThread ? <>
              <section className="v2-map-detail-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {selectedThread.papers.length} {locale === "zh" ? "篇代表作" : "representative works"}</p><h1>{locale === "zh" ? selectedThread.titleZh : selectedThread.titleEn}</h1><p>{locale === "zh" ? selectedThread.summaryZh : selectedThread.summaryEn}</p></div><button type="button" onClick={() => void expandResearchTrack(selectedThread)} disabled={Boolean(mapAction || mapBuildTrackId)}>{mapAction === selectedThread.id ? (locale === "zh" ? "正在补充…" : "Filling…") : selectedThread.buildStatus === "queued" ? (locale === "zh" ? "优先补充这条路线" : "Fill this route first") : (locale === "zh" ? "继续填充这条路线" : "Continue this route")} ＋</button></section>
              <section className={`v2-direction-profile ${selectedThread.userRole}`}><div><span>{directionRoleLabel(selectedThread.userRole, locale)}</span><em className={`v2-direction-heat ${selectedThread.heatLevel}`} title={directionHeatTitle(selectedThread, locale)}><i />{directionHeatLabel(selectedThread.heatLevel, locale)}</em><strong>{locale === "zh" ? "这条方向在你的研究地图中的位置" : "This direction's place in your research map"}</strong></div><div className="v2-direction-signals"><span><small>{locale === "zh" ? "研究深度" : "User depth"}</small><i><b style={{ width: `${selectedThread.depthScore}%` }} /></i><strong>{selectedThread.depthScore}</strong></span><span><small>{locale === "zh" ? "辅助价值" : "Support value"}</small><i><b style={{ width: `${selectedThread.supportScore}%` }} /></i><strong>{selectedThread.supportScore}</strong></span></div><div className="v2-direction-role-control">{(["core", "support", "explore"] as ResearchDirectionRole[]).map((role) => <button type="button" className={selectedThread.userRole === role ? "active" : ""} key={role} onClick={() => void setResearchDirectionRole(selectedThread, role)} disabled={Boolean(mapAction)}>{directionRoleLabel(role, locale)}</button>)}</div></section>
              {selectedThread.intelligence ? <section className="v2-direction-intelligence"><header><div><span>π</span><div><p className="v2-kicker">{locale === "zh" ? "PI 方向研判" : "PI DIRECTION INTELLIGENCE"}</p><h2>{locale === "zh" ? "基于当前真实论文的研究判断" : "Research judgment grounded in current papers"}</h2></div></div><div><b>{selectedThread.intelligence.confidence}%</b><small>{locale === "zh" ? "证据置信度" : "evidence confidence"}</small><button type="button" onClick={() => void refreshDirectionIntelligence(selectedThread)} disabled={Boolean(mapAction || mapBuildTrackId || mapIntelligenceTrackId)}>{mapAction === `interpret:${selectedThread.id}` ? (locale === "zh" ? "更新中…" : "Refreshing…") : (locale === "zh" ? "重新研判" : "Refresh")}</button></div></header><div><article><small>{locale === "zh" ? "当前判断" : "Current assessment"}</small><p>{locale === "zh" ? selectedThread.intelligence.assessmentZh : selectedThread.intelligence.assessmentEn}</p></article><article><small>{locale === "zh" ? "关键机会" : "Key opportunity"}</small><p>{locale === "zh" ? selectedThread.intelligence.opportunityZh : selectedThread.intelligence.opportunityEn}</p></article><article><small>{locale === "zh" ? "观察信号" : "Watch signal"}</small><p>{locale === "zh" ? selectedThread.intelligence.watchSignalZh : selectedThread.intelligence.watchSignalEn}</p></article>{Boolean(selectedThread.intelligence.evidenceGapZh || selectedThread.intelligence.evidenceGapEn) && <article className="gap"><small>{locale === "zh" ? "证据缺口" : "Evidence gap"}</small><p>{locale === "zh" ? selectedThread.intelligence.evidenceGapZh : selectedThread.intelligence.evidenceGapEn}</p>{selectedThread.intelligence.nextSearchQuery && <code>{selectedThread.intelligence.nextSearchQuery}</code>}</article>}</div><footer><span>{modelDisplayName(selectedThread.intelligence.model)}</span><span>{locale === "zh" ? `${selectedThread.intelligence.evidenceCanonicalIds.length} 篇路线论文作为证据` : `${selectedThread.intelligence.evidenceCanonicalIds.length} route papers used as evidence`}</span></footer></section> : null}
              <nav className="v2-map-legend">{(["foundation", "milestone", "frontier"] as ResearchTrackRole[]).map((role) => <span key={role} className={role}><i />{researchRoleLabel(role, locale)}<b>{selectedThread.papers.filter((paper) => paper.role === role).length}</b></span>)}</nav>
              <div className="v2-research-timeline">
                {(["foundation", "milestone", "frontier"] as ResearchTrackRole[]).map((role) => (
                  <section key={role} className={"v2-map-era " + role}>
                    <header><span>{researchRoleLabel(role, locale)}</span><p>{role === "foundation" ? (locale === "zh" ? "定义问题与基本工具" : "Defines the problem and core tools") : role === "milestone" ? (locale === "zh" ? "改变领域走向的关键节点" : "Decisive turns in the field") : (locale === "zh" ? "展示当前活跃方向" : "Shows the active frontier")}</p></header>
                    <div>
                      {selectedThread.papers.filter((paper) => paper.role === role).map((paper) => (
                        <article className="v2-map-paper" key={paper.id}>
                          <div className="v2-map-paper-year"><strong>{researchPaperYear(paper)}</strong><i /></div>
                          <div className="v2-map-paper-body"><p className="v2-kicker">{[paper.venue, `${paper.citationCount} ${t.citations}`].filter(Boolean).join(" · ")}</p><h2>{paper.title}</h2><small>{paper.authors}</small><div className="v2-map-paper-copy"><p><b>{t.introLabel}</b>{locale === "zh" ? paper.summaryZh : paper.summaryEn}</p><p><b>{locale === "zh" ? "路线位置" : "Place in the route"}</b>{locale === "zh" ? paper.rationaleZh : paper.rationaleEn}</p></div><a href={paper.url || (paper.doi ? "https://doi.org/" + paper.doi : "#")} target="_blank" rel="noreferrer" onClick={() => recordMapPaperOpen(selectedThread.id)}>{t.openOriginal} ↗</a></div>
                        </article>
                      ))}
                      {!selectedThread.papers.some((paper) => paper.role === role) && <p className="v2-map-era-empty">{locale === "zh" ? "这一阶段尚未找到足够有代表性的真实论文。" : "No sufficiently representative real paper has been found for this stage yet."}</p>}
                    </div>
                  </section>
                ))}
              </div>
            </> : <section className="v2-map-loading"><span>π</span><div><strong>{locale === "zh" ? "正在载入研究路线" : "Loading the research route"}</strong></div></section>}
          </main>
        )}

        {view === "learn" && (
          <main className="v2-page v2-learn-page">
            <section className="v2-learn-head"><p className="v2-kicker">PERSONAL RAMP-UP · {defaultSpaceName(activeSpace.name, locale)}</p><h1>{t.learnTitle}</h1><p>{t.learnIntro}</p><div><input value={learningTarget} onChange={(event) => setLearningTarget(event.target.value)} placeholder={learningState.suggestedTarget || (locale === "zh" ? "输入想进入的方向" : "Enter a research direction")} aria-label={t.learnTitle} /><button type="button" onClick={() => void generateLearningPath()} disabled={Boolean(learningAction) || learningLoading || !learningTarget.trim()}>{learningAction === "generate" ? (locale === "zh" ? "Pi 正在规划…" : "Pi is planning…") : learningState.path ? (locale === "zh" ? "重新规划" : "Rebuild") : t.buildPath} →</button></div><small>{locale === "zh" ? `可使用 ${learningState.availablePaperCount} 篇当前空间的真实论文；Pi 会跳过你已经掌握的部分。` : `${learningState.availablePaperCount} real papers are available in this space; Pi will skip what you already know.`}</small></section>
            {learningLoading ? <section className="v2-learning-loading" role="status"><span>π</span><div><strong>{locale === "zh" ? "正在读取你的研究基础" : "Reading your research foundation"}</strong><p>{locale === "zh" ? "核对研究画像、方向深度与已收录论文。" : "Checking your research profile, direction depth, and collected papers."}</p><i><b /></i></div></section> : learningState.path ? (
              <section className="v2-learning-path">
                <header className="v2-learning-summary"><div><p className="v2-kicker">{t.suggested} · {modelDisplayName(learningState.path.model)}</p><h2>{locale === "zh" ? learningState.path.titleZh : learningState.path.titleEn}</h2><p>{locale === "zh" ? learningState.path.rationaleZh : learningState.path.rationaleEn}</p></div><div><strong>{learningState.path.completedSteps}<small>/{learningState.path.steps.length}</small></strong><span>{locale === "zh" ? "阶段完成" : "stages complete"}</span><i><b style={{ width: `${learningState.path.steps.length ? Math.round(learningState.path.completedSteps / learningState.path.steps.length * 100) : 0}%` }} /></i><small>{learningTime(learningState.path.estimatedMinutes, locale)}</small></div></header>
                <div className="v2-learning-stages">
                  {learningState.path.steps.map((step, index) => (
                    <article className={`${step.status} ${step.kind}`} key={step.id}>
                      <div className="v2-path-marker"><button type="button" onClick={() => void updateLearningStep(step)} disabled={Boolean(learningAction)} aria-label={step.status === "completed" ? (locale === "zh" ? "恢复这一阶段" : "Restore this stage") : (locale === "zh" ? "标记这一阶段完成" : "Mark this stage complete")}>{step.status === "completed" ? "✓" : String(index + 1).padStart(2, "0")}</button>{index < learningState.path!.steps.length - 1 && <i />}</div>
                      <div className="v2-learning-stage-body"><header><span>{learningKindLabel(step.kind, locale)}</span><small>{learningTime(step.estimatedMinutes, locale)}</small>{step.status === "active" && <b>{locale === "zh" ? "当前阶段" : "Now"}</b>}</header><h3>{locale === "zh" ? step.titleZh : step.titleEn}</h3><p className="v2-learning-goal">{locale === "zh" ? step.goalZh : step.goalEn}</p><div className="v2-learning-guidance"><p><b>{locale === "zh" ? "为什么现在学" : "Why now"}</b>{locale === "zh" ? step.whyZh : step.whyEn}</p><p><b>{locale === "zh" ? "阅读重点" : "Reading focus"}</b>{locale === "zh" ? step.readFocusZh : step.readFocusEn}</p><p><b>{locale === "zh" ? "完成检查" : "Checkpoint"}</b>{locale === "zh" ? step.checkpointZh : step.checkpointEn}</p></div><div className="v2-learning-resources"><small>{locale === "zh" ? "真实学习材料" : "Real reading materials"}</small>{step.resources.map((resource) => <a key={resource.id} href={resource.url || "#"} target="_blank" rel="noreferrer"><span><strong>{resource.title}</strong><small>{[resource.authors, resource.venue, resource.publishedAt?.slice(0, 4)].filter(Boolean).join(" · ")}</small></span><b>↗</b></a>)}</div></div>
                    </article>
                  ))}
                </div>
                <footer className="v2-learning-footer"><span>{locale === "zh" ? "完成阶段会保存进度，并加深对应研究方向的用户信号。" : "Completing a stage saves progress and strengthens the corresponding direction signal."}</span><button type="button" onClick={() => navigate("threads")}>{locale === "zh" ? "查看领域地图" : "Open field map"} →</button></footer>
              </section>
            ) : <section className="v2-learning-empty"><span>◎</span><h2>{locale === "zh" ? "还没有真实学习路径" : "No real learning path yet"}</h2><p>{learningState.availablePaperCount >= 3 ? (locale === "zh" ? "输入一个研究方向，Pi 会结合研究画像、方向深度和真实论文生成路径，不会填充演示内容。" : "Enter a direction and Pi will build a path from your profile, direction depth, and real papers—without demo content.") : (locale === "zh" ? "当前空间的真实论文还不够。先完成扫描或在领域地图中继续深挖，再回来构建路径。" : "This space does not have enough real papers yet. Scan or deepen the field map first.")}</p>{learningState.availablePaperCount < 3 && <button type="button" onClick={() => navigate("threads")}>{locale === "zh" ? "去深挖研究路线" : "Mine the research map"} →</button>}</section>}
          </main>
        )}

        {view === "library" && (
          <main className="v2-page v2-library-page">
            <section className="v2-page-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)}</p><h1>{t.libraryTitle}</h1><p>{t.historyPromise}</p></div><div className="v2-library-head-actions"><a href={`/api/library?spaceId=${encodeURIComponent(activeSpace.id)}&format=bibtex&scope=accepted`}>BibTeX ↓</a><a href={`/api/library?spaceId=${encodeURIComponent(activeSpace.id)}&format=ris&scope=accepted`}>RIS / Zotero ↓</a><button type="button" onClick={() => navigate("today")}>← {locale === "zh" ? "今日推荐" : "Today"}</button></div></section>
            <section className="v2-library-overview" aria-label={t.historyOverview}>
              <div><p className="v2-kicker">{t.historyOverview}</p><h2>{locale === "zh" ? "每篇论文都有明确去处" : "Every paper has a clear place"}</h2><p>{t.libraryIntro}</p></div>
              <button className={libraryFilter === "inbox" && inboxFilter === "unseen" ? "active" : ""} type="button" onClick={() => { setLibraryFilter("inbox"); setInboxFilter("unseen"); }}><span>01</span><strong>{monitor?.historyCounts?.unseen || 0}</strong><b>{t.unseen}</b><small>{t.neverViewed}</small></button>
              <button className={libraryFilter === "inbox" && inboxFilter === "seen" ? "active" : ""} type="button" onClick={() => { setLibraryFilter("inbox"); setInboxFilter("seen"); }}><span>02</span><strong>{monitor?.historyCounts?.seen || 0}</strong><b>{t.seenPending}</b><small>{t.decisionNeeded}</small></button>
              <button className={libraryFilter === "inbox" && inboxFilter === "snoozed" ? "active" : ""} type="button" onClick={() => { setLibraryFilter("inbox"); setInboxFilter("snoozed"); }}><span>03</span><strong>{monitor?.historyCounts?.snoozed || 0}</strong><b>{t.snoozed}</b><small>{locale === "zh" ? "到期后自动回到推荐队列" : "Returns automatically when due"}</small></button>
            </section>
            <div className="v2-library-tabs">
              <button className={libraryFilter === "inbox" ? "active" : ""} type="button" onClick={() => { setLibraryFilter("inbox"); setInboxFilter("all"); }}>{t.inbox}<span>{monitor?.historyCounts?.inbox || 0}</span></button>
              <button className={libraryFilter === "accepted" ? "active" : ""} type="button" onClick={() => setLibraryFilter("accepted")}>{t.accepted}<span>{monitor?.historyCounts?.accepted || 0}</span></button>
              <button className={libraryFilter === "dismissed" ? "active" : ""} type="button" onClick={() => setLibraryFilter("dismissed")}>{t.ignored}<span>{monitor?.historyCounts?.dismissed || 0}</span></button>
              <button className={libraryFilter === "all" ? "active" : ""} type="button" onClick={() => setLibraryFilter("all")}>{t.all}<span>{monitor?.historyCounts?.all || historyPapers.length}</span></button>
            </div>
            <div className="v2-library-toolbar">
              <label><span>⌕</span><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder={t.historySearch} aria-label={t.historySearch} /></label>
              <select value={librarySort} onChange={(event) => setLibrarySort(event.target.value as LibrarySort)} aria-label={locale === "zh" ? "历史记录排序" : "Sort history"}>
                <option value="priority">{t.sortPriority}</option><option value="newest">{t.sortNewest}</option><option value="quality">{t.sortQuality}</option>
              </select>
            </div>
            <div className="v2-library-list">
              {libraryPapers.map((paper) => (
                <article className={"v2-library-paper " + paper.userState} key={paper.id}>
                  <button className="v2-library-paper-main" type="button" onClick={() => openMonitorPaper(paper)}>
                    <div className="v2-library-paper-flags"><span className={"v2-history-state " + paper.userState}>{paper.userState === "unseen" ? t.unseen : paper.userState === "accepted" ? t.accepted : paper.userState === "dismissed" ? t.ignored : paper.userState === "snoozed" ? t.snoozed : t.seenPending}</span><span className={`v2-tier-badge ${paper.recommendationTier || "browse"}`}>{recommendationTierLabel(paper.recommendationTier || "browse", locale)}</span><span>{readingStatusLabel(paper.readingStatus || "unread", locale)}</span><span>{t.qualityScore} {paper.qualityScore}</span></div>
                    <h2>{paper.title}</h2><p className="v2-library-paper-meta">{paper.authors} · {paper.venue} · {formatPaperDate(paper.publishedAt, locale)}</p>
                    <p className="v2-library-paper-why"><b>{t.whySuitable}</b>{locale === "zh" ? paper.whyReadZh : paper.whyReadEn}</p>
                    <footer><span>◎ {reminderLabel(paper, locale)}</span><span>{t.relevanceScoreLabel} {paper.relevanceScore}</span><b>{t.viewAnalysis} →</b></footer>
                  </button>
                  <div className="v2-library-paper-actions">
                    <select value={paper.readingStatus || "unread"} onChange={(event) => void updateReadingProgress(paper, event.target.value as MonitorPaper["readingStatus"])} aria-label={locale === "zh" ? "阅读状态" : "Reading status"}><option value="unread">{readingStatusLabel("unread", locale)}</option><option value="queued">{readingStatusLabel("queued", locale)}</option><option value="reading">{readingStatusLabel("reading", locale)}</option><option value="read">{readingStatusLabel("read", locale)}</option><option value="mastered">{readingStatusLabel("mastered", locale)}</option><option value="cited">{readingStatusLabel("cited", locale)}</option></select>
                    {!["accepted", "dismissed"].includes(paper.userState) ? <><button type="button" onClick={() => requestPaperDecision(paper, "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => saveFeedback(paper, "later")}>◷ {t.readLater}</button><button type="button" onClick={() => requestPaperDecision(paper, "not_relevant")}>× {t.notRelevant}</button></> : <button type="button" onClick={() => returnPaperToInbox(paper)}>↶ {t.returnPending}</button>}
                    <button type="button" onClick={() => shareSnapshot("paper", [paper])} disabled={Boolean(sharingSnapshot)}>↗ {t.sharePaper}</button>
                  </div>
                </article>
              ))}
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
            <section className="v2-layered-memory"><header><div><p className="v2-kicker">π {locale === "zh" ? "分层研究记忆" : "Layered research memory"}</p><h2>{locale === "zh" ? "你说过的，与 Pi 推断的，分开保存" : "What you said and what Pi inferred stay separate"}</h2></div><small>{locale === "zh" ? "推断会随时间衰减，也可以随时停用" : "Inferences decay over time and can be disabled"}</small></header><div><section><h3>{locale === "zh" ? "明确偏好" : "Explicit evidence"}<span>{explicitPreferenceSignals.length}</span></h3>{explicitPreferenceSignals.slice(0, 8).map((signal) => <article key={signal.id}><div><strong>{locale === "zh" ? signal.labelZh : signal.labelEn}</strong><small>{signal.evidence}</small></div><b>{signal.effectiveConfidence}%</b></article>)}{!explicitPreferenceSignals.length && <p>{locale === "zh" ? "对论文标记“适合”或“不相关”时选择原因，这里会形成长期偏好。" : "Choose a reason when accepting or dismissing a paper to build durable preferences."}</p>}</section><section><h3>{locale === "zh" ? "Pi 的推断" : "Pi inferences"}<span>{inferredPreferenceSignals.length}</span></h3>{inferredPreferenceSignals.slice(0, 8).map((signal) => <article key={signal.id}><div><strong>{locale === "zh" ? signal.labelZh : signal.labelEn}</strong><small>{signal.evidence}</small></div><b>{signal.effectiveConfidence}%</b><button type="button" onClick={() => dismissInferredSignal(signal.id)} aria-label={locale === "zh" ? "停用这条推断" : "Disable this inference"}>×</button></article>)}{!inferredPreferenceSignals.length && <p>{locale === "zh" ? "确认导入研究资料后，Pi 会把有证据的兴趣与问题放在这里。" : "After a research import is confirmed, grounded interests and questions appear here."}</p>}</section></div></section>
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
            <section className="v2-paper-head"><div className="v2-paper-top"><span className={`v2-tier-badge ${selectedMonitorPaper.recommendationTier || "browse"}`}>{recommendationTierLabel(selectedMonitorPaper.recommendationTier || "browse", locale)}</span><span>{readDepthLabel(selectedMonitorPaper.readDepth || "focused", locale)} · {selectedMonitorPaper.readMinutes || 15} min</span>{selectedMonitorPaper.priorityVenue && <span className="v2-real-badge">◆ {t.priorityVenueLabel}</span>}<span>{selectedMonitorPaper.horizon === "days" ? t.daysHorizon : selectedMonitorPaper.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span><span>{selectedMonitorPaper.analysisSource === "deepseek" ? "π " + t.aiBrief : t.metadataBrief}</span></div><h1>{selectedMonitorPaper.title}</h1><p>{selectedMonitorPaper.authors}</p><small>{selectedMonitorPaper.venue} · {formatPaperDate(selectedMonitorPaper.publishedAt, locale)}</small><div><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "save")}>{(saved[activeSpace.id + ":" + selectedMonitorPaper.id] ?? selectedMonitorPaper.saved) ? "★ " + t.saved : "☆ " + t.save}</button><button type="button" onClick={() => requestPaperDecision(selectedMonitorPaper, "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "later")}>◷ {t.readLater}</button><button type="button" onClick={() => requestPaperDecision(selectedMonitorPaper, "not_relevant")}>× {t.notRelevant}</button><button type="button" onClick={() => askAboutMonitorPaper(selectedMonitorPaper)}>π {t.askAboutPaper}</button><button type="button" onClick={() => shareSnapshot("paper", [selectedMonitorPaper])} disabled={Boolean(sharingSnapshot)}>↗ {sharingSnapshot === selectedMonitorPaper.id ? t.creatingShare : t.sharePaper}</button><a className="v2-original-link" href={selectedMonitorPaper.url || (selectedMonitorPaper.doi ? "https://doi.org/" + selectedMonitorPaper.doi : "#")} target="_blank" rel="noreferrer">{t.openOriginal} ↗</a></div></section>
            <div className="v2-paper-detail-grid">
              <div>
                <section className="v2-content-section v2-recommendation"><p className="v2-kicker warm">{t.whySuitable}</p><h2>{locale === "zh" ? selectedMonitorPaper.whyReadZh : selectedMonitorPaper.whyReadEn}</h2><div><span>{t.currentSpace}</span><strong>{defaultSpaceName(activeSpace.name, locale)}</strong><span>{t.qualityScore}</span><strong>{selectedMonitorPaper.qualityScore}</strong></div></section>
                <section className="v2-content-section"><p className="v2-kicker">{t.introLabel}</p><h2>{locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn}</h2></section>
                <section className="v2-paper-analysis"><header><p className="v2-kicker">π {locale === "zh" ? "深度阅读导航" : "DEEP READING GUIDE"}</p><h2>{locale === "zh" ? "先理解它解决了什么，再决定读到多深" : "Understand what it resolves before choosing how deeply to read"}</h2></header><div>
                  <article><small>{locale === "zh" ? "研究问题" : "Research problem"}</small><p>{(locale === "zh" ? selectedMonitorPaper.problemZh : selectedMonitorPaper.problemEn) || (locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn)}</p></article>
                  <article><small>{locale === "zh" ? "方法与证据" : "Method & evidence"}</small><p>{(locale === "zh" ? selectedMonitorPaper.methodZh : selectedMonitorPaper.methodEn) || (locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn)}</p></article>
                  <article><small>{locale === "zh" ? "主要贡献" : "Main contribution"}</small><p>{(locale === "zh" ? selectedMonitorPaper.contributionZh : selectedMonitorPaper.contributionEn) || (locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn)}</p></article>
                  <article className="caution"><small>{locale === "zh" ? "限制与不确定性" : "Limits & uncertainty"}</small><p>{(locale === "zh" ? selectedMonitorPaper.limitationsZh : selectedMonitorPaper.limitationsEn) || (locale === "zh" ? "当前元数据不足以支持更具体的限制判断，建议核对原文。" : "Available metadata is insufficient for a more specific limitation assessment; verify against the paper.")}</p></article>
                  <article className="focus"><small>{locale === "zh" ? "阅读时重点看" : "What to focus on"}</small><p>{(locale === "zh" ? selectedMonitorPaper.readingFocusZh : selectedMonitorPaper.readingFocusEn) || (locale === "zh" ? selectedMonitorPaper.whyReadZh : selectedMonitorPaper.whyReadEn)}</p></article>
                </div>{Boolean((locale === "zh" ? selectedMonitorPaper.researchQuestionsZh : selectedMonitorPaper.researchQuestionsEn)?.length) && <footer><small>{locale === "zh" ? "可以继续追问" : "Questions to pursue"}</small><ol>{(locale === "zh" ? selectedMonitorPaper.researchQuestionsZh : selectedMonitorPaper.researchQuestionsEn).map((question) => <li key={question}>{question}</li>)}</ol></footer>}</section>
                <section className="v2-content-section"><p className="v2-kicker">{t.recommendationSignals}</p><dl className="v2-real-signals"><div><dt>{t.relevanceScoreLabel}</dt><dd>{selectedMonitorPaper.relevanceScore}</dd></div><div><dt>{t.qualityScore}</dt><dd>{selectedMonitorPaper.qualityScore}</dd></div><div><dt>{t.citations}</dt><dd>{selectedMonitorPaper.citationCount}</dd></div><div><dt>{t.prioritySources}</dt><dd>{selectedMonitorPaper.priorityVenue ? t.priorityVenueLabel : "—"}</dd></div><div><dt>{t.sourceRecord}</dt><dd>{selectedMonitorPaper.analysisSource === "deepseek" ? t.aiBrief : t.metadataBrief}</dd></div></dl></section>
              </div>
              <aside className="v2-detail-aside v2-real-detail-aside"><p className="v2-kicker">{locale === "zh" ? "阅读工作台" : "READING WORKBENCH"}</p><label className="v2-reading-field"><span>{locale === "zh" ? "阅读状态" : "Reading status"}</span><select value={selectedMonitorPaper.readingStatus || "unread"} onChange={(event) => void updateReadingProgress(selectedMonitorPaper, event.target.value as MonitorPaper["readingStatus"], paperNoteDraft)}><option value="unread">{readingStatusLabel("unread", locale)}</option><option value="queued">{readingStatusLabel("queued", locale)}</option><option value="reading">{readingStatusLabel("reading", locale)}</option><option value="read">{readingStatusLabel("read", locale)}</option><option value="mastered">{readingStatusLabel("mastered", locale)}</option><option value="cited">{readingStatusLabel("cited", locale)}</option></select></label><label className="v2-reading-field"><span>{locale === "zh" ? "我的阅读笔记" : "My reading note"}</span><textarea value={paperNoteDraft} maxLength={3000} onChange={(event) => setPaperNoteDraft(event.target.value)} placeholder={locale === "zh" ? "记录可复用的方法、疑问或与自己项目的连接…" : "Capture reusable methods, questions, or links to your work…"} /></label><small className="v2-memory-hint">{locale === "zh" ? "保存时 Pi 会提取可复用结论、方法、问题与研究连接；相同笔记不会重复消耗 Token。" : "When saved, Pi extracts reusable conclusions, methods, questions, and research links. Identical notes are not analyzed twice."}</small><button className="v2-save-note" type="button" disabled={readingMemoryAnalyzing || !paperNoteDraft.trim()} onClick={() => void updateReadingProgress(selectedMonitorPaper, selectedMonitorPaper.readingStatus || "queued", paperNoteDraft, true)}>{readingMemoryAnalyzing ? (locale === "zh" ? "Pi 正在沉淀…" : "Pi is synthesizing…") : (locale === "zh" ? "保存并沉淀到研究记忆" : "Save to research memory")}</button><dl><div><dt>{t.currentSpaceFit}</dt><dd>{selectedMonitorPaper.horizon === "days" ? t.daysHorizon : selectedMonitorPaper.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</dd></div><div><dt>{locale === "zh" ? "建议投入" : "Suggested time"}</dt><dd>{selectedMonitorPaper.readMinutes || 15} min · {readDepthLabel(selectedMonitorPaper.readDepth || "focused", locale)}</dd></div><div><dt>{t.status}</dt><dd>{selectedMonitorPaper.venue}</dd></div><div><dt>{t.added}</dt><dd>{formatPaperDate(selectedMonitorPaper.publishedAt, locale)}</dd></div>{selectedMonitorPaper.doi && <div><dt>DOI</dt><dd>{selectedMonitorPaper.doi}</dd></div>}</dl><a className="v2-original-link wide" href={selectedMonitorPaper.url || (selectedMonitorPaper.doi ? "https://doi.org/" + selectedMonitorPaper.doi : "#")} target="_blank" rel="noreferrer">{t.openOriginal} ↗</a><button type="button" onClick={() => askAboutMonitorPaper(selectedMonitorPaper)}>{t.askAboutPaper} →</button></aside>
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
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => { setModelSettingsOpen(false); setModelApiKey(""); setModelSettingsError(""); setShowModelApiKey(false); }} />
          <div className="v2-model-settings">
            <div className="v2-modal-head"><div><p className="v2-kicker">π {locale === "zh" ? "浏览器自带密钥" : "BRING YOUR OWN KEY"}</p><h2>{locale === "zh" ? "连接 DeepSeek" : "Connect DeepSeek"}</h2><p>{locale === "zh" ? "直接粘贴 API Key。Pi 会先验证连接，再把它安全保存在当前浏览器。" : "Paste an API key directly. Pi verifies the connection before saving it securely in this browser."}</p></div><button type="button" onClick={() => { setModelSettingsOpen(false); setModelApiKey(""); setModelSettingsError(""); setShowModelApiKey(false); }}>×</button></div>
            <section className={"v2-model-status-card " + (modelConfigured ? "live" : "pending")}><span><i /></span><div><small>{locale === "zh" ? "当前状态" : "Current status"}</small><strong>{modelConfigured ? (locale === "zh" ? "已连接" : "Connected") : (locale === "zh" ? "尚未连接" : "Not connected")}</strong><p>DeepSeek · {modelDisplayName(connectedModel || "deepseek-v4-pro")}{modelConfigured ? ` · ${modelCredentialSource === "browser" ? (locale === "zh" ? "当前浏览器 Key" : "browser key") : (locale === "zh" ? "平台 Key" : "host key")}` : ""}</p></div><button type="button" onClick={() => void refreshModelStatus()} disabled={checkingModel}>{locale === "zh" ? "检测" : "Check"}</button></section>
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
            <small>{locale === "zh" ? "选择后会写入当前研究空间；明确反馈不会与其他研究方向混用。" : "Your choice is stored only in this research space."}</small>
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
