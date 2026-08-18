"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Locale = "zh" | "en";
type View = "today" | "threads" | "thread-detail" | "learn" | "library" | "memory" | "paper-detail";
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
type Thread = {
  id: string;
  title: Localized;
  question: Localized;
  status: "active" | "learning" | "watching";
  updates: Localized;
  priority: "high" | "medium" | "low";
};
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
  error: string | null;
  cadenceHours: number;
  source: string;
  horizons: string[];
  preferences?: MonitorPreferences;
  papers: MonitorPaper[];
  cached?: boolean;
  throttled?: boolean;
};

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
    relevant: "相关",
    notRelevant: "不相关",
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
    libraryTitle: "共享论文记忆",
    libraryIntro: "只保存会影响研究判断的论文，不做文献管理器。",
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
    dedupeNote: "按 DOI 或标题指纹去重；只有尚未评审的新候选会送入 DeepSeek Pro。模型判定不相关、非论文或不值得推荐的记录会被保留用于去重，但绝不会出现在推荐列表。",
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
    realBriefIntro: "以下内容全部来自当前研究空间最近一次真实扫描。",
    topRecommendation: "本轮首要推荐",
    moreRealPapers: "更多真实推荐",
    realPapers: "篇真实论文",
    scanCandidates: "入选候选",
    aiAnalyzed: "已由 Pi 解读",
    recentDiscoveries: "最近发现",
    publicationInfo: "论文信息",
    recommendationSignals: "推荐信号",
    sourceRecord: "来源记录",
    currentSpaceFit: "当前空间匹配",
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
    relevant: "Relevant",
    notRelevant: "Not relevant",
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
    libraryTitle: "Shared paper memory",
    libraryIntro: "Keep papers that affect research judgment—not a citation manager.",
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
    dedupeNote: "Deduplicated by DOI or title fingerprint. Only previously unreviewed candidates go to DeepSeek Pro. Irrelevant, non-paper, or non-recommended records remain stored for deduplication but never appear in recommendations.",
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
    realBriefIntro: "Everything below comes from the latest real scan of this research space.",
    topRecommendation: "Top recommendation this scan",
    moreRealPapers: "More real recommendations",
    realPapers: "real papers",
    scanCandidates: "shortlisted candidates",
    aiAnalyzed: "analyzed by Pi",
    recentDiscoveries: "Recent discoveries",
    publicationInfo: "Publication information",
    recommendationSignals: "Recommendation signals",
    sourceRecord: "Source record",
    currentSpaceFit: "Current space match",
  },
} as const;

const fallbackSpaces: Space[] = [
  { id: "space-info-theory", name: "Information Theory", memberName: "Yilin", description: "Gaussian extremality, rate-distortion theory, and transport converses", accent: "blue" },
  { id: "space-applied-math", name: "Applied Mathematics", memberName: "Ming", description: "Functional inequalities, stochastic localization, and optimal transport", accent: "umber" },
  { id: "space-ml-reading", name: "ML Reading", memberName: "Sarah", description: "Foundation models, efficient learning, and generative compression", accent: "sage" },
];

const threads: Thread[] = [
  {
    id: "gaussian",
    title: { zh: "高斯极值与率失真", en: "Gaussian Extremality for Rate-Distortion" },
    question: { zh: "在超出二次失真的情形下，哪些结构条件仍能保证高斯源或测试信道的极值性？", en: "Which structural conditions preserve Gaussian extremality beyond quadratic distortion?" },
    status: "active",
    updates: { zh: "本周 3 个重要进展", en: "3 important updates this week" },
    priority: "high",
  },
  {
    id: "ot-info",
    title: { zh: "最优传输 × 信息论", en: "Optimal Transport × Information Theory" },
    question: { zh: "传输与耦合方法能否给出新的逆向界和强数据处理不等式？", en: "Can transport and coupling methods yield new converses and SDPIs?" },
    status: "active",
    updates: { zh: "2 篇值得阅读", en: "2 papers worth reading" },
    priority: "high",
  },
  {
    id: "rd-existence",
    title: { zh: "一般空间上的率失真存在性", en: "Rate-Distortion Existence on General Spaces" },
    question: { zh: "最优测试信道存在性所需的最弱紧性与连续性条件是什么？", en: "What are the weakest tightness and continuity conditions for existence?" },
    status: "active",
    updates: { zh: "今天无重要进展", en: "No significant updates today" },
    priority: "medium",
  },
  {
    id: "bridge",
    title: { zh: "薛定谔桥", en: "Schrödinger Bridge" },
    question: { zh: "如何从最优传输背景进入现代薛定谔桥理论？", en: "How can an optimal transport background bridge into modern Schrödinger theory?" },
    status: "learning",
    updates: { zh: "学习路径完成 35%", en: "Learning path · 35%" },
    priority: "medium",
  },
];

const pathItems = [
  {
    stage: "01",
    label: { zh: "先修知识", en: "Prerequisites" },
    title: "Stochastic Differential Equations — selected notes",
    why: { zh: "只补齐进入动态表述所缺的一块基础。", en: "Fills the one gap needed for the dynamic formulation." },
    read: { zh: "弱解与 Girsanov 定理", en: "Weak solutions and Girsanov's theorem" },
  },
  {
    stage: "02",
    label: { zh: "第一篇", en: "First read" },
    title: "Schrödinger’s Problem and Entropic Transport",
    why: { zh: "与你已有的最优传输背景衔接最直接。", en: "The shortest bridge from your optimal transport background." },
    read: { zh: "第 1–3 节", en: "Sections 1–3" },
  },
  {
    stage: "03",
    label: { zh: "现代框架", en: "Modern formulation" },
    title: "Entropic Interpolations and Displacement Convexity",
    why: { zh: "把概率表述与你熟悉的几何结构连接起来。", en: "Connects the probabilistic view to geometry you already know." },
    read: { zh: "引言与第 3–4 节", en: "Introduction and Sections 3–4" },
  },
  {
    stage: "04",
    label: { zh: "研究前沿", en: "Current frontier" },
    title: "Mean-Field Schrödinger Problems: A Survey",
    why: { zh: "用一篇综述定位 2026 年的开放问题与活跃簇。", en: "Maps open questions and active clusters in 2026." },
    read: { zh: "第 1、6、7 节", en: "Sections 1, 6, and 7" },
  },
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

export default function ResearchApp({ user }: { user: User }) {
  const [locale, setLocale] = useState<Locale>("zh");
  const [view, setView] = useState<View>("today");
  const [spaces, setSpaces] = useState<Space[]>(fallbackSpaces);
  const [activeSpaceId, setActiveSpaceId] = useState(fallbackSpaces[0].id);
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpace, setNewSpace] = useState({ name: "", memberName: "", description: "" });
  const [selectedMonitorPaper, setSelectedMonitorPaper] = useState<MonitorPaper | null>(null);
  const [selectedThread, setSelectedThread] = useState<Thread>(threads[0]);
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

  const t = copy[locale];
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) || spaces[0] || fallbackSpaces[0];
  const rankedMonitorPapers = useMemo(
    () => [...(monitor?.papers || [])].sort((first, second) => second.qualityScore - first.qualityScore),
    [monitor?.papers],
  );
  const priorityPaperCount = rankedMonitorPapers.filter((paper) => paper.priorityVenue).length;
  const aiBriefCount = rankedMonitorPapers.filter((paper) => paper.analysisSource === "deepseek").length;
  const scanIsActive = monitoring || isMonitorScanning(monitor?.status);
  const effectiveScanStatus: MonitorStatus = monitoring && !isMonitorScanning(monitor?.status) ? "scanning" : monitor?.status || "idle";
  const scanProgress = scanIsActive ? monitorProgressByStatus[effectiveScanStatus] : monitor?.status === "ready" ? 100 : 0;
  const scanPhase = monitorPhaseLabel(scanIsActive ? effectiveScanStatus : monitor?.status, locale);

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
    setView(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const switchSpace = (space: Space) => {
    setActiveSpaceId(space.id);
    window.localStorage.setItem("pi-active-space", space.id);
    setSpaceDialog(false);
    setView("today");
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

  const saveFeedback = (paper: { id: string }, kind: "save" | "relevant" | "not_relevant") => {
    const key = activeSpace.id + ":" + paper.id;
    if (kind === "save") setSaved((current) => ({ ...current, [key]: !current[key] }));
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId: activeSpace.id, paperId: paper.id, kind, value: kind === "save" ? !saved[key] : true }),
    }).catch(() => undefined);
    setToast(t.feedbackSaved);
  };

  const openMonitorPaper = (paper: MonitorPaper) => {
    setSelectedMonitorPaper(paper);
    navigate("paper-detail");
  };

  const askAboutMonitorPaper = (paper: MonitorPaper) => {
    setQuestion(locale === "zh" ? `请结合当前研究空间分析这篇论文：${paper.title}` : `Analyze this paper in the context of the current research space: ${paper.title}`);
    setAskOpen(true);
  };

  const openThread = (thread: Thread) => {
    setSelectedThread(thread);
    navigate("thread-detail");
  };

  const navItems: Array<{ id: View; label: string; mark: string }> = [
    { id: "today", label: t.today, mark: "01" },
    { id: "threads", label: t.threads, mark: "02" },
    { id: "learn", label: t.learn, mark: "03" },
    { id: "library", label: t.library, mark: "04" },
    { id: "memory", label: t.memory, mark: "05" },
  ];
  const activeNav = view === "paper-detail" ? "today" : view === "thread-detail" ? "threads" : view;

  return (
    <div className="v2-app">
      <aside className={"v2-sidebar " + (mobileNav ? "open" : "")}>
        <div className="v2-logo"><span>π</span><div><strong>Pi Research</strong><small>RESEARCH AGENT</small></div><button type="button" aria-label={t.close} onClick={() => setMobileNav(false)}>×</button></div>
        <button className="v2-space-switch" type="button" onClick={() => setSpaceDialog(true)}>
          <span className={"v2-space-avatar " + activeSpace.accent}>{initials(activeSpace.name)}</span>
          <span><small>{t.currentSpace}</small><strong>{defaultSpaceName(activeSpace.name, locale)}</strong><em>{activeSpace.memberName}</em></span>
          <b>⌄</b>
        </button>
        <div className="v2-isolation"><i />{t.isolated}</div>

        <nav className="v2-nav" aria-label="Primary navigation">
          <p>{t.researchRadar}</p>
          {navItems.slice(0, 2).map((item) => (
            <button type="button" key={item.id} className={activeNav === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
              <span>{item.mark}</span>{item.label}{item.id === "today" && Boolean(monitor?.newCount || rankedMonitorPapers.length) && <b>{Math.min(99, monitor?.newCount || rankedMonitorPapers.length)}</b>}
            </button>
          ))}
          <p>{t.knowledge}</p>
          {navItems.slice(2).map((item) => (
            <button type="button" key={item.id} className={activeNav === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
              <span>{item.mark}</span>{item.label}
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
              <div><p className="v2-kicker">{t.todayDate}</p><h1>{t.goodMorning}，{activeSpace.memberName}。</h1><p><strong>{t.reviewed}</strong> · {t.matched}</p></div>
              <div className="v2-attention-number"><strong>{monitor ? monitor.newCount : "—"}</strong><span>{t.attention}</span><small>{t.briefTime}</small></div>
            </section>

            <section className="v2-monitor-panel">
              <div className="v2-monitor-head">
                <div><p className="v2-kicker">{t.liveMonitor}</p><h2>{t.monitorIntro}</h2></div>
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
              <div className="v2-source-profile">
                <div><span>{t.detectedDomain}</span><strong>{locale === "zh" ? monitor?.preferences?.profileNameZh : monitor?.preferences?.profileNameEn}</strong><em>{monitor?.preferences?.userModified ? t.userCustomized : t.systemProvided}</em></div>
                <div><span>{t.prioritySources}</span><p>{monitor?.preferences?.priorityVenues.slice(0, 5).map((venue) => <i key={venue}>{venue}</i>)}{(monitor?.preferences?.priorityVenues.length || 0) > 5 && <b>+{(monitor?.preferences?.priorityVenues.length || 0) - 5}</b>}</p></div>
              </div>
              <div className="v2-horizon-logic">
                <article><span>01 · {t.daysHorizon}</span><p>{t.daysFocus}</p></article>
                <article><span>02 · {t.monthsHorizon}</span><p>{t.monthsFocus}</p></article>
                <article><span>03 · {t.yearsHorizon}</span><p>{t.yearsFocus}</p></article>
              </div>
              <p className="v2-monitor-explainer">{t.autoVisit}</p>
              <dl className="v2-monitor-metrics">
                <div><dt>{t.lastScan}</dt><dd>{formatMonitorDate(monitor?.lastRunAt || null, locale)}</dd></div>
                <div><dt>{t.nextScan}</dt><dd>{formatMonitorDate(monitor?.nextRunAt || null, locale)}</dd></div>
                <div><dt>{monitor?.knownCount || 0} {t.knownPapers}</dt><dd>{monitor?.scannedCount || 0} {t.scannedPapers}</dd></div>
              </dl>
              {monitor?.papers?.length ? (
                <div className="v2-paper-horizons">
                  {(["days", "months", "years"] as const).map((horizon) => {
                    const label = horizon === "days" ? t.daysHorizon : horizon === "months" ? t.monthsHorizon : t.yearsHorizon;
                    const focus = horizon === "days" ? t.daysFocus : horizon === "months" ? t.monthsFocus : t.yearsFocus;
                    const horizonPapers = monitor.papers.filter((paper) => paper.horizon === horizon);
                    return (
                      <section key={horizon} className={"v2-paper-horizon " + horizon}>
                        <header><span>{label}</span><p>{focus}</p></header>
                        {horizonPapers.length ? horizonPapers.map((paper) => (
                          <article className="v2-research-card" key={paper.id}>
                            <div className="v2-research-card-badges">
                              {paper.priorityVenue && <span className="priority">◆ {t.priorityVenueLabel}</span>}
                              <span>{paper.analysisSource === "deepseek" ? "π " + t.aiBrief : t.metadataBrief}</span>
                            </div>
                            <h3>{paper.title}</h3>
                            <p className="v2-research-meta">{[paper.authors, paper.venue, paper.publishedAt].filter(Boolean).join(" · ")}</p>
                            <div className="v2-paper-intro"><span>{t.introLabel}</span><p>{locale === "zh" ? paper.summaryZh : paper.summaryEn}</p></div>
                            <div className="v2-paper-why"><span>{t.whySuitable}</span><p>{locale === "zh" ? paper.whyReadZh : paper.whyReadEn}</p></div>
                            <footer><span>{t.relevanceScoreLabel} {paper.relevanceScore}</span><span>{t.qualityScore} {paper.qualityScore}</span><span>{t.citations} {paper.citationCount}</span><a href={paper.url || (paper.doi ? "https://doi.org/" + paper.doi : "#")} target="_blank" rel="noreferrer">{t.openOriginal} ↗</a></footer>
                          </article>
                        )) : <p className="v2-horizon-empty">{t.noHorizonPaper}</p>}
                      </section>
                    );
                  })}
                </div>
              ) : <p className="v2-monitor-empty">{scanIsActive ? scanPhase : t.noLivePapers}</p>}
              <p className="v2-dedupe-note">◎ {t.dedupeNote}</p>
            </section>

            <div className="v2-dashboard-grid">
              <div className="v2-feed">
                <div className="v2-section-title"><div><p className="v2-kicker warm">{t.realBrief}</p><h2>{t.topRecommendation}</h2><small>{t.realBriefIntro}</small></div><span>{rankedMonitorPapers.length} {t.realPapers}</span></div>
                {rankedMonitorPapers[0] ? (
                  <article className="v2-primary-paper">
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
                      <div><button className={saved[activeSpace.id + ":" + rankedMonitorPapers[0].id] ? "active" : ""} type="button" onClick={() => saveFeedback(rankedMonitorPapers[0], "save")}>{saved[activeSpace.id + ":" + rankedMonitorPapers[0].id] ? "★ " + t.saved : "☆ " + t.save}</button><button type="button" onClick={() => saveFeedback(rankedMonitorPapers[0], "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => saveFeedback(rankedMonitorPapers[0], "not_relevant")}>× {t.notRelevant}</button></div>
                      <button className="v2-open-paper" type="button" onClick={() => openMonitorPaper(rankedMonitorPapers[0])}>{t.openAnalysis} →</button>
                    </div>
                  </article>
                ) : <p className="v2-monitor-empty">{scanIsActive ? scanPhase : t.noLivePapers}</p>}

                {rankedMonitorPapers[1] && <article className="v2-secondary-paper">
                  <div><span className="v2-real-badge">{rankedMonitorPapers[1].horizon === "days" ? t.daysHorizon : rankedMonitorPapers[1].horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span><button type="button" onClick={() => openMonitorPaper(rankedMonitorPapers[1])}><h3>{rankedMonitorPapers[1].title}</h3></button><p>{rankedMonitorPapers[1].authors} · {rankedMonitorPapers[1].venue}</p></div>
                  <div><p>{t.whySuitable}</p><span>{locale === "zh" ? rankedMonitorPapers[1].whyReadZh : rankedMonitorPapers[1].whyReadEn}</span></div>
                  <button type="button" onClick={() => openMonitorPaper(rankedMonitorPapers[1])}>→</button>
                </article>}

                <div className="v2-section-title v2-worth-title"><div><h2>{t.moreRealPapers}</h2></div><span>{Math.max(0, rankedMonitorPapers.length - 2)}</span></div>
                <div className="v2-compact-list">
                  {rankedMonitorPapers.slice(2).map((paper) => (
                    <button type="button" key={paper.id} onClick={() => openMonitorPaper(paper)}>
                      <span className="v2-paper-index">{paper.horizon === "days" ? t.daysHorizon : paper.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span>
                      <span><strong>{paper.title}</strong><small>{paper.authors} · {formatPaperDate(paper.publishedAt, locale)}</small></span>
                      <span className="v2-thread-chip">{t.qualityScore} {paper.qualityScore}</span>
                      <b>→</b>
                    </button>
                  ))}
                </div>

                <section className="v2-quiet">
                  <span>◎</span><div><p className="v2-kicker">{t.sourceRecord}</p><h3>{monitor?.source || "Crossref"}</h3><small>{t.dedupeNote}</small></div>
                  <div><strong>{formatMonitorDate(monitor?.lastRunAt || null, locale)}</strong><small>{monitor?.knownCount || 0} {t.knownPapers}</small></div>
                </section>
              </div>

              <aside className="v2-right-rail">
                <section className="v2-agent-note"><div><span>π</span><p className="v2-kicker">{t.agentNote}</p></div><p>{locale === "zh" ? `本轮从 ${monitor?.scannedCount || 0} 条入选候选中保留 ${rankedMonitorPapers.length} 篇真实论文，其中 ${priorityPaperCount} 篇来自重点来源，${aiBriefCount} 篇已经完成 Pi 批量解读。` : `This scan kept ${rankedMonitorPapers.length} real papers from ${monitor?.scannedCount || 0} shortlisted candidates. ${priorityPaperCount} came from priority venues and ${aiBriefCount} received Pi batch analysis.`}</p><button type="button" onClick={() => setAskOpen(true)}>{t.askPi} →</button></section>
                <section className="v2-pulse">
                  <div className="v2-rail-heading"><p className="v2-kicker">{t.spacePulse}</p><span className={"v2-space-avatar small " + activeSpace.accent}>{initials(activeSpace.name)}</span></div>
                  <dl><div><dt>{t.realPapers}</dt><dd>{rankedMonitorPapers.length}</dd></div><div><dt>{t.knownPapers}</dt><dd>{monitor?.knownCount || 0}</dd></div><div><dt>{t.scanCandidates}</dt><dd>{monitor?.scannedCount || 0}</dd></div></dl>
                  <p>{activeSpace.description}</p>
                </section>
                <section className="v2-change-log"><div className="v2-rail-heading"><p className="v2-kicker">{t.recentDiscoveries}</p><span>{formatMonitorDate(monitor?.lastRunAt || null, locale)}</span></div>{rankedMonitorPapers.slice(0, 2).map((paper, index) => <button type="button" key={paper.id} onClick={() => openMonitorPaper(paper)}><i className={index === 0 ? "blue" : "umber"} /><p><strong>{paper.title}</strong><span>{paper.venue}</span></p><small>{formatPaperDate(paper.publishedAt, locale)}</small></button>)}</section>
              </aside>
            </div>
          </main>
        )}

        {view === "threads" && (
          <main className="v2-page">
            <section className="v2-page-head"><div><p className="v2-kicker">{t.currentSpace} · {defaultSpaceName(activeSpace.name, locale)}</p><h1>{t.allThreads}</h1><p>{t.threadSubtitle}</p></div><button type="button" onClick={() => setToast(locale === "zh" ? "研究线索创建器将在下一步接入" : "Thread creator is ready for the next step")}>＋ {t.createThread}</button></section>
            <div className="v2-thread-table">
              {threads.map((thread, index) => (
                <button type="button" key={thread.id} onClick={() => openThread(thread)}>
                  <span className={"v2-thread-status " + thread.status} />
                  <span className="v2-thread-number">0{index + 1}</span>
                  <span><strong>{thread.title[locale]}</strong><small>{thread.question[locale]}</small></span>
                  <span className="v2-thread-update">{thread.updates[locale]}</span>
                  <span className={"v2-priority " + thread.priority}>{thread.priority}</span>
                  <b>→</b>
                </button>
              ))}
            </div>
          </main>
        )}

        {view === "thread-detail" && (
          <main className="v2-page v2-detail-page">
            <button className="v2-back" type="button" onClick={() => navigate("threads")}>← {t.backThreads}</button>
            <section className="v2-detail-head"><div><span className={"v2-priority " + selectedThread.priority}>{selectedThread.priority}</span><span className={"v2-status-pill " + selectedThread.status}>{selectedThread.status}</span><h1>{selectedThread.title[locale]}</h1><p>{selectedThread.question[locale]}</p></div><button type="button" onClick={() => navigate("learn")}>{t.buildPath} →</button></section>
            <div className="v2-detail-layout">
              <div>
                <section className="v2-content-section"><p className="v2-kicker">{t.researchQuestion}</p><h2>{selectedThread.question[locale]}</h2></section>
                <section className="v2-content-section"><p className="v2-kicker">{t.understands}</p><div className="v2-understanding"><div><h3>{t.interested}</h3><ul><li>{locale === "zh" ? "理论极值结果" : "Theoretical extremality results"}</li><li>{locale === "zh" ? "逆向方法与信息不等式" : "Converse methods and information inequalities"}</li><li>{locale === "zh" ? "最优传输论证" : "Optimal transport arguments"}</li></ul></div><div><h3>{t.lessInterested}</h3><ul><li>{locale === "zh" ? "仅有基准测试的论文" : "Benchmark-only work"}</li><li>{locale === "zh" ? "工程实现与系统优化" : "Engineering implementations"}</li></ul></div></div></section>
                <section className="v2-content-section"><p className="v2-kicker">{t.developments}</p>{rankedMonitorPapers.slice(0, 2).map((paper) => <button className="v2-development-row" type="button" key={paper.id} onClick={() => openMonitorPaper(paper)}><span>{paper.horizon === "days" ? t.daysHorizon : paper.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span><strong>{paper.title}</strong><small>{formatPaperDate(paper.publishedAt, locale)}</small><b>→</b></button>)}</section>
              </div>
              <aside className="v2-detail-aside"><p className="v2-kicker">{t.monitoring}</p><dl><div><dt>{t.status}</dt><dd>{selectedThread.status}</dd></div><div><dt>Priority</dt><dd>{selectedThread.priority}</dd></div><div><dt>Cadence</dt><dd>{t.cadence}</dd></div><div><dt>Space</dt><dd>{defaultSpaceName(activeSpace.name, locale)}</dd></div></dl><div className="v2-boundary-mini"><i />{t.isolated}</div></aside>
            </div>
          </main>
        )}

        {view === "learn" && (
          <main className="v2-page v2-learn-page">
            <section className="v2-learn-head"><p className="v2-kicker">RAMP UP · {defaultSpaceName(activeSpace.name, locale)}</p><h1>{t.learnTitle}</h1><p>{t.learnIntro}</p><div><input defaultValue={locale === "zh" ? "薛定谔桥" : "Schrödinger Bridge"} aria-label={t.learnTitle} /><button type="button" onClick={() => setToast(locale === "zh" ? "学习路径已根据当前空间生成" : "Learning path generated from this space")}>{t.buildPath} →</button></div></section>
            <section className="v2-learning-path"><div className="v2-section-title"><div><p className="v2-kicker">{t.suggested}</p><h2>{locale === "zh" ? "薛定谔桥：从最优传输到研究前沿" : "Schrödinger Bridge: from OT to the frontier"}</h2></div><span>≈ 9.5 h</span></div>
              {pathItems.map((item, index) => (
                <article key={item.stage}><div className="v2-path-marker"><span>{item.stage}</span>{index < pathItems.length - 1 && <i />}</div><div><p>{item.label[locale]}</p><h3>{item.title}</h3><div><span><b>{t.whyRead}</b>{item.why[locale]}</span><span><b>{t.readSections}</b>{item.read[locale]}</span></div></div><button type="button">○</button></article>
              ))}
              <button className="v2-start-path" type="button" onClick={() => setToast(locale === "zh" ? "学习进度将写入当前空间" : "Progress will be saved to this space")}>{t.startPath} →</button>
            </section>
          </main>
        )}

        {view === "library" && (
          <main className="v2-page">
            <section className="v2-page-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)}</p><h1>{t.libraryTitle}</h1><p>{t.libraryIntro}</p></div><button type="button">＋ {locale === "zh" ? "添加论文" : "Add paper"}</button></section>
            <div className="v2-library-tabs"><button className="active" type="button">{t.all}<span>{monitor?.knownCount || rankedMonitorPapers.length}</span></button><button type="button">{t.priorityVenueLabel}<span>{priorityPaperCount}</span></button><button type="button">{t.aiBrief}<span>{aiBriefCount}</span></button><button type="button">{t.recentDiscoveries}<span>{rankedMonitorPapers.length}</span></button></div>
            <div className="v2-library-list">
              {rankedMonitorPapers.map((paper) => (
                <button type="button" key={paper.id} onClick={() => openMonitorPaper(paper)}>
                  <span className="v2-doc-icon">□</span><span><strong>{paper.title}</strong><small>{paper.authors} · {paper.venue}</small></span><span><small>{t.currentSpaceFit}</small><strong>{paper.horizon === "days" ? t.daysHorizon : paper.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</strong></span><span><small>{t.added}</small><strong>{formatPaperDate(paper.publishedAt, locale)}</strong></span><span className="v2-real-badge">{t.qualityScore} {paper.qualityScore}</span><b>→</b>
                </button>
              ))}
              {!rankedMonitorPapers.length && <p className="v2-monitor-empty">{scanIsActive ? scanPhase : t.noLivePapers}</p>}
            </div>
          </main>
        )}

        {view === "memory" && (
          <main className="v2-page">
            <section className="v2-page-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {activeSpace.memberName}</p><h1>{t.memoryTitle}</h1><p>{t.memoryIntro}</p></div><span className="v2-updated">{locale === "zh" ? "4 分钟前更新" : "Updated 4 min ago"}</span></section>
            <div className="v2-memory-grid">
              <section><span>01</span><h2>{t.interestMemory}</h2><p>{locale === "zh" ? "关心的问题、方法、作者与会议。" : "Questions, methods, authors, and venues you care about."}</p><div className="v2-tags"><i>Gaussian extremality</i><i>Rate-distortion</i><i>Optimal transport</i></div></section>
              <section><span>02</span><h2>{t.knowledgeMemory}</h2><p>{locale === "zh" ? "Pi 在解释新工作时假设你已掌握的内容。" : "What Pi assumes you know when explaining new work."}</p><div className="v2-knowledge-lines"><div><b>Information Theory</b><i><em style={{ width: "92%" }} /></i></div><div><b>Optimal Transport</b><i><em style={{ width: "78%" }} /></i></div><div><b>Stochastic Analysis</b><i><em style={{ width: "38%" }} /></i></div></div></section>
              <section><span>03</span><h2>{t.activityMemory}</h2><p>{locale === "zh" ? "最近打开、收藏和反馈过的研究内容。" : "Research content recently opened, saved, and rated."}</p><dl><div><dt>{locale === "zh" ? "本周反馈" : "Feedback this week"}</dt><dd>18</dd></div><div><dt>{locale === "zh" ? "完成阅读" : "Finished reads"}</dt><dd>4</dd></div></dl></section>
              <section><span>04</span><h2>{t.preferenceMemory}</h2><p>{locale === "zh" ? "Pi 从反馈中学到的内容偏好。" : "Content preferences Pi learned from feedback."}</p><div className="v2-preferences"><i><b>Theory</b> &gt; application</i><i><b>New theorem</b> &gt; benchmark</i><i><b>Fundamental</b> &gt; optimization</i></div></section>
            </div>
            <section className="v2-isolation-card"><div><span>◎</span><div><p className="v2-kicker">{t.isolationBoundary}</p><h2>{defaultSpaceName(activeSpace.name, locale)}</h2></div></div><p>{t.isolationBody}</p><small>{t.accountNote}</small><button type="button" onClick={() => setSpaceDialog(true)}>{t.switchSpace} →</button></section>
          </main>
        )}

        {view === "paper-detail" && selectedMonitorPaper && (
          <main className="v2-page v2-paper-detail">
            <button className="v2-back" type="button" onClick={() => navigate("today")}>← {t.paperBack}</button>
            <section className="v2-paper-head"><div className="v2-paper-top">{selectedMonitorPaper.priorityVenue && <span className="v2-real-badge">◆ {t.priorityVenueLabel}</span>}<span>{selectedMonitorPaper.horizon === "days" ? t.daysHorizon : selectedMonitorPaper.horizon === "months" ? t.monthsHorizon : t.yearsHorizon}</span><span>{selectedMonitorPaper.analysisSource === "deepseek" ? "π " + t.aiBrief : t.metadataBrief}</span></div><h1>{selectedMonitorPaper.title}</h1><p>{selectedMonitorPaper.authors}</p><small>{selectedMonitorPaper.venue} · {formatPaperDate(selectedMonitorPaper.publishedAt, locale)}</small><div><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "save")}>{saved[activeSpace.id + ":" + selectedMonitorPaper.id] ? "★ " + t.saved : "☆ " + t.save}</button><button type="button" onClick={() => saveFeedback(selectedMonitorPaper, "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => askAboutMonitorPaper(selectedMonitorPaper)}>π {t.askAboutPaper}</button><a className="v2-original-link" href={selectedMonitorPaper.url || (selectedMonitorPaper.doi ? "https://doi.org/" + selectedMonitorPaper.doi : "#")} target="_blank" rel="noreferrer">{t.openOriginal} ↗</a></div></section>
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
