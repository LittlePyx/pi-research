"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { ImportSourceKind, ResearchImportRecord, ResearchProfileAnalysis } from "../lib/research-profile";
import type { ResearchDirectionRole, ResearchMapState, ResearchTrack, ResearchTrackPaper, ResearchTrackRole } from "../lib/research-map";
import type { LearningPathState, LearningPathStep, LearningStepKind } from "../lib/learning-path";

type Locale = "zh" | "en";
type View = "today" | "threads" | "thread-detail" | "learn" | "library" | "memory" | "paper-detail";
type LibraryFilter = "inbox" | "accepted" | "all" | "dismissed";
type InboxFilter = "all" | "unseen" | "seen" | "snoozed";
type LibrarySort = "priority" | "newest" | "quality";
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
};
type MonitorPreferences = {
  profileKey: string;
  profileNameZh: string;
  profileNameEn: string;
  priorityVenues: string[];
  userModified: boolean;
};
type MonitorStatus = "idle" | "scanning" | "discovering_days" | "discovering_months" | "discovering_years" | "deduplicating" | "reviewing" | "saving" | "ready" | "error";
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
  source: string;
  horizons: string[];
  preferences?: MonitorPreferences;
  papers: MonitorPaper[];
  historyPapers?: MonitorPaper[];
  historyCounts?: { all: number; inbox: number; unseen: number; seen: number; snoozed: number; accepted: number; saved: number; dismissed: number };
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
    briefTime: "Crossref 负责发现；DeepSeek Pro 负责筛选与撰写，未通过评审的论文不会展示",
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
    monitorIntro: "Crossref 提供候选，DeepSeek Pro 按研究空间逐篇判断、淘汰不相关记录，并撰写论文介绍和适读理由。",
    daysHorizon: "近 14 天",
    monthsHorizon: "近 6 个月",
    yearsHorizon: "近 5 年",
    daysFocus: "主打最新：快速捕捉刚出现的问题、结果和方法。",
    monthsFocus: "新且高质量：兼顾时效、相关性、来源质量与早期引用信号。",
    yearsFocus: "高质量且有用：优先可复用、能指导方法或研究路线的工作。",
    autoVisit: "自动扫描：每个研究空间每 24 小时最多一次，在到期后的首次访问时触发。无人访问时不会在后台运行。",
    lastScan: "上次扫描",
    nextScan: "下次可扫描",
    neverScanned: "尚未扫描",
    scanning: "正在扫描 Crossref",
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
    briefTime: "Crossref discovers candidates; DeepSeek Pro screens and writes every recommendation, and rejected papers never appear",
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
    monitorIntro: "Crossref supplies candidates; DeepSeek Pro judges each one against this research space, rejects weak matches, and writes the introduction and reading rationale.",
    daysHorizon: "Past 14 days",
    monthsHorizon: "Past 6 months",
    yearsHorizon: "Past 5 years",
    daysFocus: "Newest first: catch problems, results, and methods that just appeared.",
    monthsFocus: "New and high quality: balance recency, relevance, venue quality, and early citation signals.",
    yearsFocus: "High quality and useful: prioritize reusable work that guides methods or research direction.",
    autoVisit: "Automatic scan: at most once per research space every 24 hours, triggered by the first visit after it is due. It does not run in the background without a visit.",
    lastScan: "Last scan",
    nextScan: "Next eligible scan",
    neverScanned: "Not scanned yet",
    scanning: "Scanning Crossref",
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
  };
}

const monitorProgressByStatus: Record<MonitorStatus, number> = {
  idle: 0,
  scanning: 4,
  discovering_days: 12,
  discovering_months: 24,
  discovering_years: 38,
  deduplicating: 48,
  reviewing: 58,
  saving: 88,
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
    reviewing: { zh: "DeepSeek Pro 正在逐篇筛选并撰写", en: "DeepSeek Pro is screening and writing each brief" },
    saving: { zh: "正在保存推荐与淘汰记录", en: "Saving recommendations and rejected records" },
    ready: { zh: "扫描完成", en: "Scan complete" },
    error: { zh: "扫描暂时失败", en: "Scan temporarily failed" },
  };
  return labels[status || "idle"][locale];
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

export default function ResearchApp({ user }: { user: User }) {
  const [locale, setLocale] = useState<Locale>("zh");
  const [view, setView] = useState<View>("today");
  const [spaces, setSpaces] = useState<Space[]>(fallbackSpaces);
  const [activeSpaceId, setActiveSpaceId] = useState(fallbackSpaces[0].id);
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpace, setNewSpace] = useState({ name: "", memberName: "", description: "" });
  const [selectedMonitorPaper, setSelectedMonitorPaper] = useState<MonitorPaper | null>(null);
  const [researchMap, setResearchMap] = useState<ResearchMapState>({ tracks: [], edges: [], model: "deepseek-v4-pro", generated: false });
  const [selectedThread, setSelectedThread] = useState<ResearchTrack | null>(null);
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
  const [sourceSettingsOpen, setSourceSettingsOpen] = useState(false);
  const [venueDraft, setVenueDraft] = useState("");
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("inbox");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("priority");
  const [paperReturnView, setPaperReturnView] = useState<"today" | "library">("today");
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
    () => [...(monitor?.papers || [])].sort((first, second) => second.qualityScore - first.qualityScore),
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
  const scanProgress = scanIsActive ? monitorProgressByStatus[effectiveScanStatus] : monitor?.status === "ready" ? 100 : 0;
  const scanPhase = monitorPhaseLabel(scanIsActive ? effectiveScanStatus : monitor?.status, locale);
  const latestConfirmedImport = useMemo(() => researchImports.find((item) => item.status === "confirmed") || null, [researchImports]);
  const confirmedProfile = latestConfirmedImport?.analysis || null;

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
        body: JSON.stringify({ spaceId: activeSpace.id }),
      })
        .then((response) => response.json() as Promise<{ monitor?: MonitorState }>)
        .then((data) => {
          if (!cancelled && data.monitor) setMonitor(data.monitor);
        })
        .catch(() => {
          if (!cancelled) setMonitor({
            status: "error", lastRunAt: null, nextRunAt: null, newCount: 0, scannedCount: 0,
            knownCount: 0, error: "unavailable", cadenceHours: 24, source: "Crossref",
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
    if (monitoring || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    setMonitoring(true);
    const stopPolling = startMonitorPolling(activeSpace.id, setMonitor);
    try {
      const response = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, force: true }),
      });
      const data = await response.json() as { monitor?: MonitorState };
      if (data.monitor) {
        setMonitor(data.monitor);
        if (data.monitor.throttled) setToast(t.manualCooling);
      }
    } finally {
      stopPolling();
      setMonitoring(false);
    }
  };

  const openSourceSettings = () => {
    setVenueDraft((monitor?.preferences?.priorityVenues || []).join("\n"));
    setSourceSettingsOpen(true);
  };

  const saveSourceSettings = async (reset = false) => {
    if (savingPreferences || activeSpace.id.startsWith("space-") || activeSpace.id.startsWith("local-")) return;
    const priorityVenues = venueDraft.split(/\r?\n/).map((venue) => venue.trim()).filter(Boolean);
    if (!reset && !priorityVenues.length) return;
    setSavingPreferences(true);
    let stopPolling: (() => void) | null = null;
    try {
      const response = await fetch("/api/monitor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, priorityVenues, reset }),
      });
      const data = await response.json() as { monitor?: MonitorState };
      if (!response.ok || !data.monitor) throw new Error("preference update failed");
      setMonitor(data.monitor);
      setVenueDraft((data.monitor.preferences?.priorityVenues || []).join("\n"));
      setSourceSettingsOpen(false);
      setToast(t.sourcesSaved);
      setMonitoring(true);
      stopPolling = startMonitorPolling(activeSpace.id, setMonitor);
      const scanResponse = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id }),
      });
      const scanData = await scanResponse.json() as { monitor?: MonitorState };
      if (scanData.monitor) setMonitor(scanData.monitor);
    } finally {
      stopPolling?.();
      setMonitoring(false);
      setSavingPreferences(false);
    }
  };

  const saveFeedback = (paper: MonitorPaper, kind: "save" | "relevant" | "not_relevant" | "later") => {
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
      body: JSON.stringify({ spaceId: activeSpace.id, paperId: paper.id, kind, value }),
    }).catch(() => undefined);
    setToast(kind === "later" ? t.remindLater : t.feedbackSaved);
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

  const openMonitorPaper = (paper: MonitorPaper) => {
    const openedPaper = { ...paper, openedAt: new Date().toISOString(), userState: paper.userState === "unseen" ? "seen" as const : paper.userState };
    setPaperReturnView(view === "library" ? "library" : "today");
    setSelectedMonitorPaper(openedPaper);
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
          <div className={"v2-openai-state " + (modelConfigured ? "live" : "pending")}><i /><span><strong>{modelConfigured ? t.connected : t.setupRequired}</strong><small>{modelConfigured ? modelDisplayName(connectedModel) : "Safe preview mode"}</small></span></div>
          <button className="v2-account" type="button" onClick={() => navigate("memory")}><span>◎</span><span><strong>Pi Workspace</strong><small>{t.workspaceLabel}</small></span><b>•••</b></button>
        </div>
      </aside>

      <div className="v2-main">
        <header className="v2-topbar">
          <button className="v2-mobile-menu" type="button" aria-label="Menu" onClick={() => setMobileNav(true)}>≡</button>
          <div className="v2-breadcrumb"><span>{defaultSpaceName(activeSpace.name, locale)}</span><b>/</b><strong>{navItems.find((item) => item.id === activeNav)?.label}</strong></div>
          <button className="v2-ask-trigger" type="button" onClick={() => setAskOpen(true)}><span>⌕</span><span>{t.askPlaceholder}</span><kbd>⌘ K</kbd></button>
          <div className="v2-top-actions">
            <div className="v2-language"><button className={locale === "zh" ? "active" : ""} type="button" onClick={() => setLocale("zh")}>中</button><button className={locale === "en" ? "active" : ""} type="button" onClick={() => setLocale("en")}>EN</button></div>
            <button className="v2-ask-button" type="button" onClick={() => setAskOpen(true)}><span>π</span>{t.askPi}</button>
          </div>
        </header>

        {view === "today" && (
          <main className="v2-page v2-today">
            <section className="v2-today-hero">
              <div><p className="v2-kicker">{t.todayDate}</p><h1>{t.goodMorning}，{activeSpace.memberName}。</h1></div>
              <div className="v2-attention-number"><strong>{rankedMonitorPapers.length || "—"}</strong><span>{locale === "zh" ? "篇待看" : "to review"}</span><button className="v2-share-action v2-today-share" type="button" onClick={() => shareSnapshot("daily", rankedMonitorPapers.slice(0, 6))} disabled={!rankedMonitorPapers.length || Boolean(sharingSnapshot)}>{sharingSnapshot === "daily" ? t.creatingShare : t.shareDaily} ↗</button></div>
            </section>

            <section className="v2-monitor-panel">
              <div className="v2-monitor-head">
                <div><p className="v2-kicker">{t.liveMonitor}</p><h2>{locale === "zh" ? "三层扫描，严格筛选" : "Three horizons, strictly screened"}</h2></div>
                <div className="v2-monitor-actions">
                  <span className={"v2-monitor-status " + (scanIsActive ? "scanning" : monitor?.status || "idle")}><i />{scanIsActive ? scanPhase : monitor?.status === "error" ? t.scanError : monitor?.status === "ready" ? t.scanReady : t.neverScanned}</span>
                  <button className="secondary" type="button" onClick={openSourceSettings} disabled={!monitor?.preferences || scanIsActive}>{t.editSources}</button>
                  <button type="button" onClick={runManualMonitor} disabled={scanIsActive}>{scanIsActive ? `${t.scanningButton} ${scanProgress}%` : t.scanNow}</button>
                </div>
              </div>
              {scanIsActive && (
                <div className="v2-scan-progress" role="status" aria-live="polite" aria-label={`${scanPhase} ${scanProgress}%`}>
                  <div><span>{scanPhase}</span><strong>{scanProgress}%</strong></div>
                  <i><b style={{ width: `${scanProgress}%` }} /></i>
                  <small>{monitor?.scannedCount || 0} {t.scannedPapers} · {locale === "zh" ? "页面其他功能仍可继续使用" : "The rest of the page remains available"}</small>
                </div>
              )}
              <button className="v2-inbox-summary" type="button" onClick={() => { setLibraryFilter("inbox"); setInboxFilter("all"); navigate("library"); }}>
                <span>◎</span><div><strong>{monitor?.historyCounts?.inbox || 0} {t.inbox}</strong><small>{monitor?.historyCounts?.unseen || 0} {t.unseen} · {locale === "zh" ? "没有处理的论文不会消失" : "Unresolved papers will not disappear"}</small></div><b>→</b>
              </button>
              <div className="v2-horizon-strip">
                {(["days", "months", "years"] as const).map((horizon) => <span key={horizon}><b>{monitor?.papers.filter((paper) => paper.horizon === horizon).length || 0}</b>{horizon === "days" ? t.daysHorizon : horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span>)}
              </div>
              <details className="v2-scan-details">
                <summary>{locale === "zh" ? "扫描范围与来源" : "Scan scope & sources"}<b>＋</b></summary>
                <div className="v2-source-profile"><div><span>{t.detectedDomain}</span><strong>{locale === "zh" ? monitor?.preferences?.profileNameZh : monitor?.preferences?.profileNameEn}</strong><em>{monitor?.preferences?.userModified ? t.userCustomized : t.systemProvided}</em></div><div><span>{t.prioritySources}</span><p>{monitor?.preferences?.priorityVenues.slice(0, 6).map((venue) => <i key={venue}>{venue}</i>)}</p></div></div>
                <dl className="v2-monitor-metrics"><div><dt>{t.lastScan}</dt><dd>{formatMonitorDate(monitor?.lastRunAt || null, locale)}</dd></div><div><dt>{t.nextScan}</dt><dd>{formatMonitorDate(monitor?.nextRunAt || null, locale)}</dd></div><div><dt>{locale === "zh" ? "持续探索轮次" : "Exploration round"}</dt><dd>#{monitor?.explorationRound || 0}</dd></div><div><dt>{monitor?.knownCount || 0} {t.knownPapers}</dt><dd>{monitor?.scannedCount || 0} {t.scannedPapers}</dd></div></dl>
                <p>{t.autoVisit}</p>
              </details>
            </section>

            <div className="v2-dashboard-grid">
              <div className="v2-feed">
                <div className="v2-section-title"><div><p className="v2-kicker warm">{t.realBrief}</p><h2>{t.topRecommendation}</h2><small>{t.realBriefIntro}</small></div><span>{rankedMonitorPapers.length} {t.realPapers}</span></div>
                {rankedMonitorPapers[0] ? (
                  <article className="v2-primary-paper" data-paper-impression={rankedMonitorPapers[0].id}>
                    <div className="v2-paper-top">
                      {rankedMonitorPapers[0].priorityVenue && <span className="v2-real-badge">◆ {t.priorityVenueLabel}</span>}
                      <span>{rankedMonitorPapers[0].analysisSource === "deepseek" ? "π " + t.aiBrief : t.metadataBrief}</span>
                      <span>{formatPaperDate(rankedMonitorPapers[0].publishedAt, locale)}</span>
                    </div>
                    <button type="button" className="v2-title-link" onClick={() => openMonitorPaper(rankedMonitorPapers[0])}><h2>{rankedMonitorPapers[0].title}</h2></button>
                    <p className="v2-paper-meta">{rankedMonitorPapers[0].authors} <span>·</span> {rankedMonitorPapers[0].venue}</p>
                    <div className="v2-paper-intelligence">
                      <div><p>{t.whySuitable}</p><strong>{locale === "zh" ? rankedMonitorPapers[0].whyReadZh : rankedMonitorPapers[0].whyReadEn}</strong></div>
                      <div><p>{t.introLabel}</p><strong>{locale === "zh" ? rankedMonitorPapers[0].summaryZh : rankedMonitorPapers[0].summaryEn}</strong></div>
                    </div>
                    <div className="v2-paper-footer">
                      <span>{rankedMonitorPapers[0].horizon === "days" ? t.daysHorizon : rankedMonitorPapers[0].horizon === "months" ? t.monthsHorizon : t.yearsHorizon} · {t.relevanceScoreLabel} <b>{rankedMonitorPapers[0].relevanceScore}</b> · {t.qualityScore} {rankedMonitorPapers[0].qualityScore} · {t.citations} {rankedMonitorPapers[0].citationCount}</span>
                      <div><button className={(saved[activeSpace.id + ":" + rankedMonitorPapers[0].id] ?? rankedMonitorPapers[0].saved) ? "active" : ""} type="button" onClick={() => saveFeedback(rankedMonitorPapers[0], "save")}>{(saved[activeSpace.id + ":" + rankedMonitorPapers[0].id] ?? rankedMonitorPapers[0].saved) ? "★ " + t.saved : "☆ " + t.save}</button><button type="button" onClick={() => saveFeedback(rankedMonitorPapers[0], "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => saveFeedback(rankedMonitorPapers[0], "later")}>◷ {t.readLater}</button><button type="button" onClick={() => saveFeedback(rankedMonitorPapers[0], "not_relevant")}>× {t.notRelevant}</button><button type="button" onClick={() => shareSnapshot("paper", [rankedMonitorPapers[0]])} disabled={Boolean(sharingSnapshot)}>↗ {sharingSnapshot === rankedMonitorPapers[0].id ? t.creatingShare : t.sharePaper}</button></div>
                      <button className="v2-open-paper" type="button" onClick={() => openMonitorPaper(rankedMonitorPapers[0])}>{t.openAnalysis} →</button>
                    </div>
                  </article>
                ) : <p className="v2-monitor-empty">{scanIsActive ? scanPhase : t.noLivePapers}</p>}

                <div className="v2-section-title v2-worth-title"><div><h2>{t.moreRealPapers}</h2></div><span>{Math.max(0, rankedMonitorPapers.length - 1)}</span></div>
                <div className="v2-compact-list">
                  {rankedMonitorPapers.slice(1).map((paper) => (
                    <button type="button" key={paper.id} data-paper-impression={paper.id} onClick={() => openMonitorPaper(paper)}>
                      <span className="v2-paper-index">{paper.horizon === "days" ? t.daysHorizon : paper.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span>
                      <span><strong>{paper.title}</strong><small>{paper.authors} · {formatPaperDate(paper.publishedAt, locale)}</small></span>
                      <span className="v2-thread-chip">{t.qualityScore} {paper.qualityScore}</span>
                      <b>→</b>
                    </button>
                  ))}
                </div>

              </div>
            </div>
          </main>
        )}

        {view === "threads" && (
          <main className="v2-page v2-map-page">
            <section className="v2-page-head v2-map-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {modelDisplayName(researchMap.model)}</p><h1>{locale === "zh" ? "领域发展地图" : "Field development map"}</h1><p>{locale === "zh" ? "沿着真实论文看清奠基工作、关键转折与近年前沿。" : "Follow real papers from foundations through decisive milestones to the recent frontier."}</p></div><span className="v2-map-total"><strong>{researchMap.tracks.reduce((sum, track) => sum + track.papers.length, 0)}</strong>{locale === "zh" ? "篇代表作" : "representative works"}</span></section>
            {mapLoading ? (
              <section className="v2-map-loading v2-outline-loading" role="status"><span>π</span><div><strong>{locale === "zh" ? "先建立可浏览的方向骨架" : "Building a browsable direction outline first"}</strong><p>{mapOutlineLabels[mapOutlinePhase]}</p><i><b style={{ width: `${22 + mapOutlinePhase * 21}%` }} /></i><small>{locale === "zh" ? "骨架出现后，你可以立即浏览；真实论文会逐条路线继续补充。" : "You can browse as soon as the outline appears while real papers continue filling each route."}</small></div></section>
            ) : researchMap.tracks.length ? (
              <>
                {(researchMap.buildProgress?.pendingTrackIds.length || mapBuildTrackId) ? <section className="v2-map-build-progress" role="status"><div><span className={mapBuildTrackId ? "working" : "paused"}><i /></span><div><strong>{mapBuildTrackId ? (locale === "zh" ? `正在补充第 ${(researchMap.buildProgress?.ready || 0) + 1} / ${researchMap.buildProgress?.total || researchMap.tracks.length} 条路线` : `Filling route ${(researchMap.buildProgress?.ready || 0) + 1} of ${researchMap.buildProgress?.total || researchMap.tracks.length}`) : (locale === "zh" ? `还有 ${researchMap.buildProgress?.pendingTrackIds.length || 0} 条路线等待补充` : `${researchMap.buildProgress?.pendingTrackIds.length || 0} routes are waiting to be filled`)}</strong><p>{currentBuildTrack ? (locale === "zh" ? currentBuildTrack.titleZh : currentBuildTrack.titleEn) : (locale === "zh" ? "已完成的部分已经保存，可以打开路线浏览或选择失败方向重试。" : "Completed work is saved; browse ready routes or retry a pending direction.")}</p></div></div><i><b style={{ width: `${researchMap.buildProgress?.total ? Math.round((researchMap.buildProgress.ready / researchMap.buildProgress.total) * 100) : 0}%` }} /></i><small>{locale === "zh" ? "切换页面不会丢失已经完成的内容，下次进入会从未完成处继续。" : "Completed work will not be lost if you leave; the next visit resumes unfinished routes."}</small></section> : null}
                {(researchMap.intelligenceProgress?.pendingTrackIds.length || mapIntelligenceTrackId) ? <section className="v2-map-build-progress v2-intelligence-progress" role="status"><div><span className={mapIntelligenceTrackId ? "working" : "paused"}><i>π</i></span><div><strong>{mapIntelligenceTrackId ? (locale === "zh" ? "DeepSeek Pro 正在形成方向研判" : "DeepSeek Pro is forming a direction assessment") : (locale === "zh" ? "部分方向等待 Pi 研判" : "Some directions await Pi's assessment")}</strong><p>{currentIntelligenceTrack ? (locale === "zh" ? currentIntelligenceTrack.titleZh : currentIntelligenceTrack.titleEn) : (locale === "zh" ? "路线和论文已经可以正常浏览，研判将在下次进入时继续。" : "Routes and papers remain available; interpretation resumes on the next visit.")}</p></div></div><i><b style={{ width: `${researchMap.intelligenceProgress?.total ? Math.round((researchMap.intelligenceProgress.ready / researchMap.intelligenceProgress.total) * 100) : 0}%` }} /></i><small>{locale === "zh" ? "Pi 会给出当前判断、关键机会和应关注的变化信号，并绑定真实论文证据。" : "Pi adds a current assessment, key opportunity, and watch signal grounded in real paper evidence."}</small></section> : null}
                <section className="v2-field-network">
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
                {researchMap.edges.length ? <section className="v2-network-links"><header><p className="v2-kicker">{locale === "zh" ? "方向关联" : "Cross-direction links"}</p><h2>{locale === "zh" ? "主干之外的桥接关系" : "Bridges beyond the backbone"}</h2></header><div>{researchMap.edges.map((edge) => { const source = researchMap.tracks.find((track) => track.id === edge.sourceTrackId); const target = researchMap.tracks.find((track) => track.id === edge.targetTrackId); if (!source || !target) return null; return <button type="button" key={edge.id} onClick={() => openThread(target)}><span>{locale === "zh" ? source.titleZh : source.titleEn}</span><i>{edge.kind === "bridges" ? "⇄" : "→"}</i><span>{locale === "zh" ? target.titleZh : target.titleEn}</span><small>{locale === "zh" ? edge.relationshipZh : edge.relationshipEn}</small><b>{edge.strength}</b></button>; })}</div></section> : null}
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
              {selectedThread.intelligence ? <section className="v2-direction-intelligence"><header><div><span>π</span><div><p className="v2-kicker">{locale === "zh" ? "PI 方向研判" : "PI DIRECTION INTELLIGENCE"}</p><h2>{locale === "zh" ? "基于当前真实论文的研究判断" : "Research judgment grounded in current papers"}</h2></div></div><div><b>{selectedThread.intelligence.confidence}%</b><small>{locale === "zh" ? "证据置信度" : "evidence confidence"}</small><button type="button" onClick={() => void refreshDirectionIntelligence(selectedThread)} disabled={Boolean(mapAction || mapBuildTrackId || mapIntelligenceTrackId)}>{mapAction === `interpret:${selectedThread.id}` ? (locale === "zh" ? "更新中…" : "Refreshing…") : (locale === "zh" ? "重新研判" : "Refresh")}</button></div></header><div><article><small>{locale === "zh" ? "当前判断" : "Current assessment"}</small><p>{locale === "zh" ? selectedThread.intelligence.assessmentZh : selectedThread.intelligence.assessmentEn}</p></article><article><small>{locale === "zh" ? "关键机会" : "Key opportunity"}</small><p>{locale === "zh" ? selectedThread.intelligence.opportunityZh : selectedThread.intelligence.opportunityEn}</p></article><article><small>{locale === "zh" ? "观察信号" : "Watch signal"}</small><p>{locale === "zh" ? selectedThread.intelligence.watchSignalZh : selectedThread.intelligence.watchSignalEn}</p></article></div><footer><span>{modelDisplayName(selectedThread.intelligence.model)}</span><span>{locale === "zh" ? `${selectedThread.intelligence.evidenceCanonicalIds.length} 篇路线论文作为证据` : `${selectedThread.intelligence.evidenceCanonicalIds.length} route papers used as evidence`}</span></footer></section> : null}
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
            <section className="v2-page-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)}</p><h1>{t.libraryTitle}</h1><p>{t.historyPromise}</p></div><button type="button" onClick={() => navigate("today")}>← {locale === "zh" ? "今日推荐" : "Today"}</button></section>
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
                    <div className="v2-library-paper-flags"><span className={"v2-history-state " + paper.userState}>{paper.userState === "unseen" ? t.unseen : paper.userState === "accepted" ? t.accepted : paper.userState === "dismissed" ? t.ignored : paper.userState === "snoozed" ? t.snoozed : t.seenPending}</span><span>{paper.horizon === "days" ? t.daysHorizon : paper.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span><span>{t.qualityScore} {paper.qualityScore}</span></div>
                    <h2>{paper.title}</h2><p className="v2-library-paper-meta">{paper.authors} · {paper.venue} · {formatPaperDate(paper.publishedAt, locale)}</p>
                    <p className="v2-library-paper-why"><b>{t.whySuitable}</b>{locale === "zh" ? paper.whyReadZh : paper.whyReadEn}</p>
                    <footer><span>◎ {reminderLabel(paper, locale)}</span><span>{t.relevanceScoreLabel} {paper.relevanceScore}</span><b>{t.viewAnalysis} →</b></footer>
                  </button>
                  <div className="v2-library-paper-actions">
                    {!["accepted", "dismissed"].includes(paper.userState) ? <><button type="button" onClick={() => saveFeedback(paper, "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => saveFeedback(paper, "later")}>◷ {t.readLater}</button><button type="button" onClick={() => saveFeedback(paper, "not_relevant")}>× {t.notRelevant}</button></> : <button type="button" onClick={() => returnPaperToInbox(paper)}>↶ {t.returnPending}</button>}
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
            <div className="v2-memory-grid">
              <section><span>01</span><h2>{t.interestMemory}</h2><p>{locale === "zh" ? "由用户确认的持续关注、子方向与检索主题。" : "User-confirmed sustained interests, subdirections, and discovery topics."}</p><div className="v2-tags">{confirmedProfile ? [...confirmedProfile.subdirections, ...confirmedProfile.interests].slice(0, 10).map((item, index) => <i key={index}>{locale === "zh" ? item.labelZh : item.labelEn}</i>) : <><i>Gaussian extremality</i><i>Rate-distortion</i><i>Optimal transport</i></>}</div></section>
              <section><span>02</span><h2>{t.knowledgeMemory}</h2><p>{locale === "zh" ? "Pi 只把有材料证据的内容当作已有知识。" : "Pi treats a topic as known only when the imported material supports it."}</p><div className="v2-knowledge-lines">{confirmedProfile?.knowledge.length ? confirmedProfile.knowledge.slice(0, 5).map((item, index) => <div key={index}><b>{locale === "zh" ? item.labelZh : item.labelEn}</b><i><em style={{ width: `${item.confidence}%` }} /></i></div>) : <><div><b>Information Theory</b><i><em style={{ width: "92%" }} /></i></div><div><b>Optimal Transport</b><i><em style={{ width: "78%" }} /></i></div><div><b>Stochastic Analysis</b><i><em style={{ width: "38%" }} /></i></div></>}</div></section>
              <section><span>03</span><h2>{t.activityMemory}</h2><p>{locale === "zh" ? "资料导入与论文反馈共同构成当前空间的记忆。" : "Material imports and paper feedback jointly shape this space's memory."}</p><dl><div><dt>{locale === "zh" ? "已确认导入" : "Confirmed imports"}</dt><dd>{researchImports.filter((item) => item.status === "confirmed").length}</dd></div><div><dt>{t.profileSources}</dt><dd>{latestConfirmedImport?.fileNames.length || 0}</dd></div></dl></section>
              <section><span>04</span><h2>{t.preferenceMemory}</h2><p>{locale === "zh" ? "尚未解决的问题会影响论文筛选和适读理由。" : "Unresolved questions influence screening and reading rationales."}</p><div className="v2-preferences">{confirmedProfile?.openQuestions.length ? confirmedProfile.openQuestions.slice(0, 4).map((item, index) => <i key={index}><b>{item.confidence}%</b> {locale === "zh" ? item.labelZh : item.labelEn}</i>) : <><i><b>Theory</b> &gt; application</i><i><b>New theorem</b> &gt; benchmark</i><i><b>Fundamental</b> &gt; optimization</i></>}</div></section>
            </div>
            {confirmedProfile?.researchOpportunities.length ? <section className="v2-memory-opportunities"><div className="v2-section-title"><div><p className="v2-kicker warm">{t.futureDirections}</p><h2>{locale === "zh" ? "从已有工作向外延伸" : "Extensions grounded in existing work"}</h2></div><span>{confirmedProfile.researchOpportunities.length}</span></div><div>{confirmedProfile.researchOpportunities.map((item, index) => <article key={index}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{locale === "zh" ? item.titleZh : item.titleEn}</h3><p>{locale === "zh" ? item.rationaleZh : item.rationaleEn}</p><ul>{(locale === "zh" ? item.startingPointsZh : item.startingPointsEn).slice(0, 3).map((point) => <li key={point}>{point}</li>)}</ul><small>{t.evidenceConfidence} {item.confidence}% · {item.evidenceFiles.join(" · ")}</small></div></article>)}</div></section> : null}
            <section className="v2-isolation-card"><div><span>◎</span><div><p className="v2-kicker">{t.isolationBoundary}</p><h2>{defaultSpaceName(activeSpace.name, locale)}</h2></div></div><p>{t.isolationBody}</p><small>{t.accountNote}</small><button type="button" onClick={() => setSpaceDialog(true)}>{t.switchSpace} →</button></section>
            <footer className="v2-lab-attribution"><span>{locale === "zh" ? "研究团队" : "Research team"}</span><Image src="/pi-lab-logo.png" width={78} height={25} alt="P&amp;I Lab" /></footer>
          </main>
        )}

        {view === "paper-detail" && selectedMonitorPaper && (
          <main className="v2-page v2-paper-detail">
            <button className="v2-back" type="button" onClick={() => navigate(paperReturnView)}>← {paperReturnView === "library" ? t.library : t.paperBack}</button>
            <section className="v2-paper-head"><div className="v2-paper-top">{selectedMonitorPaper.priorityVenue && <span className="v2-real-badge">◆ {t.priorityVenueLabel}</span>}<span>{selectedMonitorPaper.horizon === "days" ? t.daysHorizon : selectedMonitorPaper.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span><span>{selectedMonitorPaper.analysisSource === "deepseek" ? "π " + t.aiBrief : t.metadataBrief}</span></div><h1>{selectedMonitorPaper.title}</h1><p>{selectedMonitorPaper.authors}</p><small>{selectedMonitorPaper.venue} · {formatPaperDate(selectedMonitorPaper.publishedAt, locale)}</small><div><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "save")}>{(saved[activeSpace.id + ":" + selectedMonitorPaper.id] ?? selectedMonitorPaper.saved) ? "★ " + t.saved : "☆ " + t.save}</button><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "later")}>◷ {t.readLater}</button><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "not_relevant")}>× {t.notRelevant}</button><button type="button" onClick={() => askAboutMonitorPaper(selectedMonitorPaper)}>π {t.askAboutPaper}</button><button type="button" onClick={() => shareSnapshot("paper", [selectedMonitorPaper])} disabled={Boolean(sharingSnapshot)}>↗ {sharingSnapshot === selectedMonitorPaper.id ? t.creatingShare : t.sharePaper}</button><a className="v2-original-link" href={selectedMonitorPaper.url || (selectedMonitorPaper.doi ? "https://doi.org/" + selectedMonitorPaper.doi : "#")} target="_blank" rel="noreferrer">{t.openOriginal} ↗</a></div></section>
            <div className="v2-paper-detail-grid">
              <div>
                <section className="v2-content-section v2-recommendation"><p className="v2-kicker warm">{t.whySuitable}</p><h2>{locale === "zh" ? selectedMonitorPaper.whyReadZh : selectedMonitorPaper.whyReadEn}</h2><div><span>{t.currentSpace}</span><strong>{defaultSpaceName(activeSpace.name, locale)}</strong><span>{t.qualityScore}</span><strong>{selectedMonitorPaper.qualityScore}</strong></div></section>
                <section className="v2-content-section"><p className="v2-kicker">{t.introLabel}</p><h2>{locale === "zh" ? selectedMonitorPaper.summaryZh : selectedMonitorPaper.summaryEn}</h2></section>
                <section className="v2-content-section"><p className="v2-kicker">{t.recommendationSignals}</p><dl className="v2-real-signals"><div><dt>{t.relevanceScoreLabel}</dt><dd>{selectedMonitorPaper.relevanceScore}</dd></div><div><dt>{t.qualityScore}</dt><dd>{selectedMonitorPaper.qualityScore}</dd></div><div><dt>{t.citations}</dt><dd>{selectedMonitorPaper.citationCount}</dd></div><div><dt>{t.prioritySources}</dt><dd>{selectedMonitorPaper.priorityVenue ? t.priorityVenueLabel : "—"}</dd></div><div><dt>{t.sourceRecord}</dt><dd>{selectedMonitorPaper.analysisSource === "deepseek" ? t.aiBrief : t.metadataBrief}</dd></div></dl></section>
              </div>
              <aside className="v2-detail-aside v2-real-detail-aside"><p className="v2-kicker">{t.publicationInfo}</p><dl><div><dt>{t.currentSpaceFit}</dt><dd>{selectedMonitorPaper.horizon === "days" ? t.daysHorizon : selectedMonitorPaper.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</dd></div><div><dt>{t.status}</dt><dd>{selectedMonitorPaper.venue}</dd></div><div><dt>{t.added}</dt><dd>{formatPaperDate(selectedMonitorPaper.publishedAt, locale)}</dd></div>{selectedMonitorPaper.doi && <div><dt>DOI</dt><dd>{selectedMonitorPaper.doi}</dd></div>}</dl><a className="v2-original-link wide" href={selectedMonitorPaper.url || (selectedMonitorPaper.doi ? "https://doi.org/" + selectedMonitorPaper.doi : "#")} target="_blank" rel="noreferrer">{t.openOriginal} ↗</a><button type="button" onClick={() => askAboutMonitorPaper(selectedMonitorPaper)}>{t.askAboutPaper} →</button></aside>
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
              <label><span>{t.venuesLabel}</span><textarea value={venueDraft} onChange={(event) => setVenueDraft(event.target.value)} rows={10} /></label>
              <div className="v2-source-settings-actions"><button type="button" onClick={() => void saveSourceSettings(true)} disabled={savingPreferences}>{t.resetSources}</button><button type="submit" disabled={savingPreferences || !venueDraft.trim()}>{savingPreferences ? t.savingSources : t.saveSources} →</button></div>
            </form>
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
