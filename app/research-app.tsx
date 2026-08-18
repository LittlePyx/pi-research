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
type Paper = {
  id: string;
  title: string;
  authors: string;
  venue: string;
  date: Localized;
  thread: Localized;
  level: "must" | "worth";
  readTime: string;
  why: Localized;
  novelty: Localized;
  noveltyType: Localized;
  core: Localized[];
};
type Thread = {
  id: string;
  title: Localized;
  question: Localized;
  status: "active" | "learning" | "watching";
  updates: Localized;
  priority: "high" | "medium" | "low";
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
    reviewed: "Pi 已审阅 1,248 篇新论文",
    matched: "其中 18 篇与你当前的研究空间相关。",
    attention: "篇值得你今天关注",
    briefTime: "预计 6 分钟读完",
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
    agentNote: "Pi 的判断",
    agentNoteBody: "今天不是高更新日。真正值得注意的是：两个结果都在削弱你主线问题中的高斯假设，而不是单纯提高数值指标。",
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
    reviewed: "Pi reviewed 1,248 new papers",
    matched: "Eighteen matched this research space.",
    attention: "deserve your attention today",
    briefTime: "About 6 minutes to review",
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
    agentNote: "Pi's judgment",
    agentNoteBody: "This is not a high-volume update day. What matters is that two results weaken Gaussian assumptions in your main question, rather than merely improving benchmarks.",
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
  },
} as const;

const fallbackSpaces: Space[] = [
  { id: "space-info-theory", name: "Information Theory", memberName: "Yilin", description: "Gaussian extremality, rate-distortion theory, and transport converses", accent: "blue" },
  { id: "space-applied-math", name: "Applied Mathematics", memberName: "Ming", description: "Functional inequalities, stochastic localization, and optimal transport", accent: "umber" },
  { id: "space-ml-reading", name: "ML Reading", memberName: "Sarah", description: "Foundation models, efficient learning, and generative compression", accent: "sage" },
];

const papers: Paper[] = [
  {
    id: "gaussian-distortion",
    title: "Gaussian Extremality Beyond Quadratic Distortion",
    authors: "M. Courtade, J. Liu & T. Weissman",
    venue: "arXiv:2608.04192",
    date: { zh: "今天", en: "Today" },
    thread: { zh: "高斯极值与率失真", en: "Gaussian Extremality" },
    level: "must",
    readTime: "12 min",
    why: {
      zh: "它放松了你已收藏的两篇论文共同依赖的凸性假设，并直接触及当前线索中的非欧失真问题。",
      en: "It relaxes a convexity assumption shared by two papers in your library and directly touches the non-Euclidean distortion question in this thread.",
    },
    novelty: {
      zh: "给出一个新的极值定理，把高斯最优性扩展到更广的非二次可分失真函数。",
      en: "A new extremality theorem extends Gaussian optimality to a wider class of separable, non-quadratic distortion measures.",
    },
    noveltyType: { zh: "新定理", en: "New theorem" },
    core: [
      { zh: "证明一类非二次可分失真下的高斯最优性。", en: "Proves Gaussian optimality for a class of non-quadratic separable distortions." },
      { zh: "用更弱的位移条件替代标准凸性条件。", en: "Replaces standard convexity with a weaker displacement condition." },
      { zh: "给出可迁移到非欧设置的逆向证明模板。", en: "Provides a converse template that may transfer to non-Euclidean settings." },
    ],
  },
  {
    id: "transport-sdpi",
    title: "Transport Proofs for Strong Data Processing Inequalities",
    authors: "A. Gozlan & Y. Polyanskiy",
    venue: "IEEE Transactions on Information Theory",
    date: { zh: "昨天", en: "Yesterday" },
    thread: { zh: "最优传输 × 信息论", en: "OT × Information Theory" },
    level: "must",
    readTime: "18 min",
    why: {
      zh: "它补上了你一篇种子论文中猜想所缺失的传输论证，并且等号情形与高斯稳定性相连。",
      en: "It supplies the missing transport argument behind a conjecture in one seed paper and connects equality to Gaussian stability.",
    },
    novelty: {
      zh: "用耦合构造而非泛函不等式，推出了对数凹信道的尖锐 SDPI 常数。",
      en: "It derives a sharp SDPI constant for log-concave channels using a coupling construction rather than functional inequalities.",
    },
    noveltyType: { zh: "新证明", en: "New proof" },
    core: [
      { zh: "建立基于耦合的尖锐 SDPI 证明。", en: "Builds a coupling-based proof of a sharp SDPI." },
      { zh: "识别控制收缩的精确传输代价。", en: "Identifies the exact transport cost controlling contraction." },
      { zh: "刻画与高斯稳定性相关的等号条件。", en: "Characterizes an equality case tied to Gaussian stability." },
    ],
  },
  {
    id: "rd-stability",
    title: "Existence and Stability in Abstract Rate–Distortion Problems",
    authors: "E. C. Posner & L. Tam",
    venue: "Information and Inference",
    date: { zh: "8 月 17 日", en: "Aug 17" },
    thread: { zh: "率失真存在性", en: "Rate-Distortion Existence" },
    level: "worth",
    readTime: "9 min",
    why: {
      zh: "紧性论证可以直接复用到你当前草稿的存在性部分。",
      en: "The compactness argument is directly reusable in the existence section of your current draft.",
    },
    novelty: {
      zh: "证明源分布弱收敛下最优测试信道的稳定性。",
      en: "A stability result for optimal test channels under weak convergence of sources.",
    },
    noveltyType: { zh: "稳定性界", en: "Stability bound" },
    core: [
      { zh: "把存在性从紧致字母表推广到更弱的紧性条件。", en: "Extends existence beyond compact alphabets using a weaker tightness condition." },
      { zh: "量化源扰动下最优值的连续性。", en: "Quantifies continuity of the optimum under source perturbations." },
    ],
  },
  {
    id: "log-concave",
    title: "Stability of Gaussian Inequalities Under Log-Concave Perturbations",
    authors: "N. Eldan, R. Eldan & J. Lehec",
    venue: "Annals of Probability",
    date: { zh: "8 月 15 日", en: "Aug 15" },
    thread: { zh: "高斯极值与率失真", en: "Gaussian Extremality" },
    level: "worth",
    readTime: "14 min",
    why: {
      zh: "这个稳定性估计可能量化你主线问题中的近似高斯区域。",
      en: "The stability estimate may quantify the approximately Gaussian regime in your main thread.",
    },
    novelty: {
      zh: "通过随机局部化得到显式依赖维数的余项。",
      en: "A dimension-aware remainder term derived through stochastic localization.",
    },
    noveltyType: { zh: "新方法", en: "New method" },
    core: [
      { zh: "给出经典高斯不等式的定量稳定版本。", en: "Gives a quantitative stability form of a classical Gaussian inequality." },
      { zh: "显式追踪维数依赖。", en: "Tracks dimensional dependence explicitly." },
    ],
  },
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

function PaperBadge({ level, locale }: { level: Paper["level"]; locale: Locale }) {
  return <span className={"v2-paper-badge " + level}><i />{level === "must" ? copy[locale].mustRead : copy[locale].worthReading}</span>;
}

export default function ResearchApp({ user }: { user: User }) {
  const [locale, setLocale] = useState<Locale>("zh");
  const [view, setView] = useState<View>("today");
  const [spaces, setSpaces] = useState<Space[]>(fallbackSpaces);
  const [activeSpaceId, setActiveSpaceId] = useState(fallbackSpaces[0].id);
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpace, setNewSpace] = useState({ name: "", memberName: "", description: "" });
  const [selectedPaper, setSelectedPaper] = useState<Paper>(papers[0]);
  const [selectedThread, setSelectedThread] = useState<Thread>(threads[0]);
  const [modelConfigured, setModelConfigured] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerMode, setAnswerMode] = useState<"deepseek" | "preview" | null>(null);
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const t = copy[locale];
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) || spaces[0] || fallbackSpaces[0];
  const spaceIndex = Math.max(0, spaces.findIndex((space) => space.id === activeSpace.id));
  const visiblePapers = useMemo(() => {
    if (spaceIndex % 3 === 1) return [papers[3], papers[1], papers[2], papers[0]];
    if (spaceIndex % 3 === 2) return [papers[2], papers[3], papers[1], papers[0]];
    return papers;
  }, [spaceIndex]);

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
    setQuestion("");
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
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeSpace.id, question, locale }),
      });
      const data = await response.json() as { answer?: string; mode?: "deepseek" | "preview"; error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error || "ask failed");
      setAnswer(data.answer);
      setAnswerMode(data.mode || "preview");
      if (data.mode === "deepseek") setModelConfigured(true);
    } catch {
      setAnswer(locale === "zh" ? "暂时无法连接 Pi。你的问题仍停留在当前研究空间，没有写入其他方向。" : "Pi could not connect just now. Your question remains scoped to this research space and was not written into any other direction.");
      setAnswerMode("preview");
    } finally {
      setAsking(false);
    }
  };

  const saveFeedback = (paper: Paper, kind: "save" | "relevant" | "not_relevant") => {
    const key = activeSpace.id + ":" + paper.id;
    if (kind === "save") setSaved((current) => ({ ...current, [key]: !current[key] }));
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId: activeSpace.id, paperId: paper.id, kind, value: kind === "save" ? !saved[key] : true }),
    }).catch(() => undefined);
    setToast(t.feedbackSaved);
  };

  const openPaper = (paper: Paper) => {
    setSelectedPaper(paper);
    navigate("paper-detail");
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
              <span>{item.mark}</span>{item.label}{item.id === "today" && <b>3</b>}
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
          <div className={"v2-openai-state " + (modelConfigured ? "live" : "pending")}><i /><span><strong>{modelConfigured ? t.connected : t.setupRequired}</strong><small>{modelConfigured ? "DeepSeek V4 Flash" : "Safe preview mode"}</small></span></div>
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
              <div className="v2-attention-number"><strong>3</strong><span>{t.attention}</span><small>{t.briefTime}</small></div>
            </section>

            <div className="v2-dashboard-grid">
              <div className="v2-feed">
                <div className="v2-section-title"><div><p className="v2-kicker warm">HIGH SIGNAL</p><h2>{t.mustRead}</h2></div><span>2 / 18</span></div>
                <article className="v2-primary-paper">
                  <div className="v2-paper-top"><PaperBadge level={visiblePapers[0].level} locale={locale} /><span>{visiblePapers[0].date[locale]}</span><span>{visiblePapers[0].readTime}</span></div>
                  <button type="button" className="v2-title-link" onClick={() => openPaper(visiblePapers[0])}><h2>{visiblePapers[0].title}</h2></button>
                  <p className="v2-paper-meta">{visiblePapers[0].authors} <span>·</span> {visiblePapers[0].venue}</p>
                  <div className="v2-paper-intelligence">
                    <div><p>{t.whyYou}</p><strong>{visiblePapers[0].why[locale]}</strong></div>
                    <div><p>{t.actuallyNew}</p><strong>{visiblePapers[0].novelty[locale]}</strong><span>{visiblePapers[0].noveltyType[locale]}</span></div>
                  </div>
                  <div className="v2-paper-footer">
                    <span>{t.relevantTo} <b>{visiblePapers[0].thread[locale]}</b></span>
                    <div><button className={saved[activeSpace.id + ":" + visiblePapers[0].id] ? "active" : ""} type="button" onClick={() => saveFeedback(visiblePapers[0], "save")}>{saved[activeSpace.id + ":" + visiblePapers[0].id] ? "★ " + t.saved : "☆ " + t.save}</button><button type="button" onClick={() => saveFeedback(visiblePapers[0], "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => saveFeedback(visiblePapers[0], "not_relevant")}>× {t.notRelevant}</button></div>
                    <button className="v2-open-paper" type="button" onClick={() => openPaper(visiblePapers[0])}>{t.openAnalysis} →</button>
                  </div>
                </article>

                <article className="v2-secondary-paper">
                  <div><PaperBadge level={visiblePapers[1].level} locale={locale} /><button type="button" onClick={() => openPaper(visiblePapers[1])}><h3>{visiblePapers[1].title}</h3></button><p>{visiblePapers[1].authors} · {visiblePapers[1].venue}</p></div>
                  <div><p>{t.whyYou}</p><span>{visiblePapers[1].why[locale]}</span></div>
                  <button type="button" onClick={() => openPaper(visiblePapers[1])}>→</button>
                </article>

                <div className="v2-section-title v2-worth-title"><div><h2>{t.worthReading}</h2></div><span>2</span></div>
                <div className="v2-compact-list">
                  {visiblePapers.slice(2).map((paper) => (
                    <button type="button" key={paper.id} onClick={() => openPaper(paper)}>
                      <span className="v2-paper-index">{paper.noveltyType[locale]}</span>
                      <span><strong>{paper.title}</strong><small>{paper.authors} · {paper.date[locale]}</small></span>
                      <span className="v2-thread-chip">{paper.thread[locale]}</span>
                      <b>→</b>
                    </button>
                  ))}
                </div>

                <section className="v2-quiet">
                  <span>—</span><div><p className="v2-kicker">{t.quietThreads}</p><h3>{t.noUpdates}</h3><small>{t.quietPromise}</small></div>
                  <div><strong>{threads[2].title[locale]}</strong><small>{threads[2].updates[locale]}</small></div>
                </section>
              </div>

              <aside className="v2-right-rail">
                <section className="v2-agent-note"><div><span>π</span><p className="v2-kicker">{t.agentNote}</p></div><p>{t.agentNoteBody}</p><button type="button" onClick={() => setAskOpen(true)}>{t.askPi} →</button></section>
                <section className="v2-pulse">
                  <div className="v2-rail-heading"><p className="v2-kicker">{t.spacePulse}</p><span className={"v2-space-avatar small " + activeSpace.accent}>{initials(activeSpace.name)}</span></div>
                  <dl><div><dt>{t.activeThreads}</dt><dd>{4 + (spaceIndex % 2)}</dd></div><div><dt>{t.savedPapers}</dt><dd>{27 + spaceIndex * 6}</dd></div><div><dt>{t.memorySignals}</dt><dd>{146 + spaceIndex * 38}</dd></div></dl>
                  <div className="v2-memory-bars"><span><i style={{ width: "86%" }} /></span><span><i style={{ width: "67%" }} /></span><span><i style={{ width: "42%" }} /></span></div>
                  <p>{activeSpace.description}</p>
                </section>
                <section className="v2-change-log"><div className="v2-rail-heading"><p className="v2-kicker">{t.recentChanges}</p><span>{t.last24h}</span></div><div><i className="blue" /><p><strong>{threads[0].title[locale]}</strong><span>{locale === "zh" ? "一个关键假设被削弱" : "A key assumption was weakened"}</span></p><small>08:42</small></div><div><i className="umber" /><p><strong>{threads[1].title[locale]}</strong><span>{locale === "zh" ? "新增一个尖锐传输界" : "A new sharp transport bound"}</span></p><small>07:10</small></div></section>
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
                <section className="v2-content-section"><p className="v2-kicker">{t.developments}</p>{visiblePapers.slice(0, 2).map((paper) => <button className="v2-development-row" type="button" key={paper.id} onClick={() => openPaper(paper)}><span>{paper.noveltyType[locale]}</span><strong>{paper.title}</strong><small>{paper.date[locale]}</small><b>→</b></button>)}</section>
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
            <div className="v2-library-tabs"><button className="active" type="button">{t.all}<span>27</span></button><button type="button">{t.mustRead}<span>4</span></button><button type="button">{t.reading}<span>3</span></button><button type="button">{t.finished}<span>11</span></button></div>
            <div className="v2-library-list">
              {visiblePapers.map((paper, index) => (
                <button type="button" key={paper.id} onClick={() => openPaper(paper)}>
                  <span className="v2-doc-icon">□</span><span><strong>{paper.title}</strong><small>{paper.authors} · {paper.venue}</small></span><span><small>{t.relevantTo}</small><strong>{paper.thread[locale]}</strong></span><span><small>{t.added}</small><strong>{index === 0 ? paper.date[locale] : "Aug " + (17 - index)}</strong></span><PaperBadge level={paper.level} locale={locale} /><b>→</b>
                </button>
              ))}
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

        {view === "paper-detail" && (
          <main className="v2-page v2-paper-detail">
            <button className="v2-back" type="button" onClick={() => navigate("today")}>← {t.paperBack}</button>
            <section className="v2-paper-head"><div className="v2-paper-top"><PaperBadge level={selectedPaper.level} locale={locale} /><span>{selectedPaper.noveltyType[locale]}</span><span>{selectedPaper.readTime}</span></div><h1>{selectedPaper.title}</h1><p>{selectedPaper.authors}</p><small>{selectedPaper.venue} · {selectedPaper.date[locale]}</small><div><button type="button" onClick={() => saveFeedback(selectedPaper, "save")}>☆ {t.save}</button><button type="button" onClick={() => saveFeedback(selectedPaper, "relevant")}>✓ {t.relevant}</button><button type="button" onClick={() => setAskOpen(true)}>π {t.askAboutPaper}</button></div></section>
            <div className="v2-paper-detail-grid">
              <div>
                <section className="v2-content-section v2-recommendation"><p className="v2-kicker warm">{t.recommendation}</p><h2>{selectedPaper.level === "must" ? t.mustRead : t.worthReading}</h2><div><span>{t.relevantTo}</span><strong>{selectedPaper.thread[locale]}</strong><span>{t.whyYou}</span><strong>{selectedPaper.why[locale]}</strong></div></section>
                <section className="v2-content-section"><p className="v2-kicker">{t.coreContribution}</p><ol className="v2-core-list">{selectedPaper.core.map((item, index) => <li key={item.en}><span>0{index + 1}</span><p>{item[locale]}</p></li>)}</ol></section>
                <section className="v2-content-section"><p className="v2-kicker">{t.actuallyNew} · {selectedPaper.noveltyType[locale]}</p><h2>{selectedPaper.novelty[locale]}</h2></section>
                <section className="v2-content-section"><p className="v2-kicker">{t.relation}</p><div className="v2-relation"><div><small>{t.currentSpace}</small><strong>{defaultSpaceName(activeSpace.name, locale)}</strong></div><i>→</i><div><small>Smith et al. · 2025</small><strong>{locale === "zh" ? "仅高斯噪声" : "Gaussian-only result"}</strong></div><i>→</i><div className="current"><small>{locale === "zh" ? "本文" : "This paper"}</small><strong>{locale === "zh" ? "推广到对数凹噪声" : "Extends to log-concave noise"}</strong></div></div></section>
              </div>
              <aside className="v2-reading-plan"><p className="v2-kicker">{t.suggestedReading}</p><ol><li><span>04 min</span><strong>Introduction</strong><small>{locale === "zh" ? "问题与范围" : "Problem and scope"}</small></li><li><span>07 min</span><strong>Theorem 2</strong><small>{locale === "zh" ? "主要结果" : "Main result"}</small></li><li><span>09 min</span><strong>Section 4</strong><small>{locale === "zh" ? "证明思路" : "Proof idea"}</small></li></ol><button type="button" onClick={() => setAskOpen(true)}>{t.askAboutPaper} →</button></aside>
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

      {askOpen && (
        <div className="v2-modal v2-ask-modal" role="dialog" aria-modal="true" aria-label={t.askTitle}>
          <button className="v2-modal-backdrop" type="button" aria-label={t.close} onClick={() => setAskOpen(false)} />
          <div className="v2-ask-panel">
            <div className="v2-modal-head"><div><p className="v2-kicker">{defaultSpaceName(activeSpace.name, locale)} · {t.privateSpace}</p><h2>{t.askTitle}</h2><p>{t.askScope}</p></div><button type="button" onClick={() => setAskOpen(false)}>×</button></div>
            <form onSubmit={submitQuestion}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t.askExample} /><div><span className={"v2-space-avatar tiny " + activeSpace.accent}>{initials(activeSpace.name)}</span><small>{defaultSpaceName(activeSpace.name, locale)} · {activeSpace.memberName}</small><button type="submit" disabled={!question.trim() || asking}>{asking ? "···" : t.send + " ↑"}</button></div></form>
            {asking && <div className="v2-thinking"><span>π</span><p>{t.thinking}<i><b /><b /><b /></i></p></div>}
            {answer && <div className="v2-answer"><div><span>π</span><p className="v2-kicker">{answerMode === "deepseek" ? t.modelAnswer : t.previewMode}</p><small>{answerMode === "deepseek" ? "DeepSeek V4 Flash · Chat API" : t.setupRequired}</small></div><p>{answer}</p><div><i />{t.isolated}</div></div>}
            {!answer && !asking && <div className="v2-ask-suggestions">{[t.askExample, locale === "zh" ? "这篇论文与我收藏的结果有什么直接关系？" : "How does this paper relate to results I saved?", locale === "zh" ? "这个方向最近真正改变了什么？" : "What actually changed in this field recently?"].map((item) => <button type="button" key={item} onClick={() => setQuestion(item)}>↗ {item}</button>)}</div>}
          </div>
        </div>
      )}

      {mobileNav && <button className="v2-mobile-backdrop" type="button" aria-label={t.close} onClick={() => setMobileNav(false)} />}
      {toast && <div className="v2-toast"><span>✓</span>{toast}</div>}
    </div>
  );
}
