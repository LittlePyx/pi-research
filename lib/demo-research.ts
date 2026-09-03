export type DemoPaperRole = "foundation" | "milestone" | "frontier";

export type DemoPaper = {
  id: string;
  title: string;
  authors: string;
  year: string;
  venue: string;
  role: DemoPaperRole;
  route: "geometry" | "information";
  note: string;
  href?: string;
};

export const DEMO_PAPERS: readonly DemoPaper[] = Object.freeze([
  {
    id: "cheeger-laplacian",
    title: "A Lower Bound for the Smallest Eigenvalue of the Laplacian",
    authors: "Jeff Cheeger",
    year: "1970",
    venue: "Problems in Analysis",
    role: "foundation",
    route: "geometry",
    note: "建立等周常数与谱隙之间的基础联系，是理解 KLS 路线的第一块地基。",
  },
  {
    id: "kls-localization",
    title: "Isoperimetric Problems for Convex Bodies and a Localization Lemma",
    authors: "Ravi Kannan · László Lovász · Miklós Simonovits",
    year: "1995",
    venue: "Discrete & Computational Geometry",
    role: "foundation",
    route: "geometry",
    note: "提出 KLS 框架并给出 localization lemma，固定了问题与后续研究语言。",
    href: "https://doi.org/10.1007/BF02574061",
  },
  {
    id: "logconcave-geometry",
    title: "The Geometry of Logconcave Functions and Sampling Algorithms",
    authors: "László Lovász · Santosh Vempala",
    year: "2007",
    venue: "Random Structures & Algorithms",
    role: "foundation",
    route: "geometry",
    note: "连接 log-concave 几何、采样算法与等周问题，补齐算法侧基础。",
  },
  {
    id: "eldan-thin-shell",
    title: "Thin Shell Implies Spectral Gap up to Polylog via a Stochastic Localization Scheme",
    authors: "Ronen Eldan",
    year: "2013",
    venue: "Geometric and Functional Analysis",
    role: "milestone",
    route: "geometry",
    note: "引入随机局部化，把薄壳与谱隙问题连接起来，改变了 KLS 的主要技术路线。",
    href: "https://doi.org/10.1007/s00039-013-0214-y",
  },
  {
    id: "lee-vempala-localization",
    title: "Eldan's Stochastic Localization and the KLS Conjecture: Isoperimetry, Concentration and Mixing",
    authors: "Yin Tat Lee · Santosh Vempala",
    year: "2024",
    venue: "Annals of Mathematics",
    role: "milestone",
    route: "geometry",
    note: "系统化随机局部化对等周、集中与混合时间的影响，是进入近期进展的桥梁。",
    href: "https://doi.org/10.4007/annals.2024.199.3.2",
  },
  {
    id: "chen-kls",
    title: "An Almost Constant Lower Bound of the Isoperimetric Coefficient in the KLS Conjecture",
    authors: "Yuansi Chen",
    year: "2020",
    venue: "arXiv",
    role: "milestone",
    route: "geometry",
    note: "把 KLS 等周系数下界推进到近常数尺度，是随机局部化路线的重要突破。",
    href: "https://arxiv.org/abs/2011.13661",
  },
  {
    id: "klartag-lehec-slicing",
    title: "Bourgain's Slicing Problem and KLS Isoperimetry up to Polylog",
    authors: "Bo'az Klartag · Joseph Lehec",
    year: "2022",
    venue: "arXiv",
    role: "frontier",
    route: "geometry",
    note: "把 slicing 与 KLS 的 polylog 进展放进统一脉络，适合用于判断当前证据边界。",
    href: "https://arxiv.org/abs/2203.15551",
  },
  {
    id: "shannon-fidelity",
    title: "Coding Theorems for a Discrete Source With a Fidelity Criterion",
    authors: "Claude E. Shannon",
    year: "1959",
    venue: "IRE National Convention Record",
    role: "foundation",
    route: "information",
    note: "率失真理论的原始基础，定义了有损压缩中速率与保真度的核心权衡。",
  },
  {
    id: "wyner-ziv",
    title: "The Rate-Distortion Function for Source Coding with Side Information at the Decoder",
    authors: "Aaron D. Wyner · Jacob Ziv",
    year: "1976",
    venue: "IEEE Transactions on Information Theory",
    role: "foundation",
    route: "information",
    note: "把解码端边信息纳入率失真问题，奠定分布式有损编码的经典模型。",
  },
  {
    id: "costa-epi",
    title: "A New Entropy Power Inequality",
    authors: "Max H. M. Costa",
    year: "1985",
    venue: "IEEE Transactions on Information Theory",
    role: "foundation",
    route: "information",
    note: "为高斯扰动下的熵功率提供关键凹性工具，支撑高斯极值与信息不等式研究。",
  },
  {
    id: "information-bottleneck",
    title: "The Information Bottleneck Method",
    authors: "Naftali Tishby · Fernando C. Pereira · William Bialek",
    year: "1999",
    venue: "Allerton Conference",
    role: "milestone",
    route: "information",
    note: "把压缩与任务相关信息保留统一为一个变分问题，连接经典信息论与表征学习。",
    href: "https://arxiv.org/abs/physics/0004057",
  },
  {
    id: "i-mmse",
    title: "Mutual Information and Minimum Mean-Square Error in Gaussian Channels",
    authors: "Dongning Guo · Shlomo Shamai · Sergio Verdú",
    year: "2005",
    venue: "IEEE Transactions on Information Theory",
    role: "milestone",
    route: "information",
    note: "建立互信息与 MMSE 的精确关系，成为高斯信道和估计论之间的核心桥梁。",
    href: "https://arxiv.org/abs/cs/0412108",
  },
  {
    id: "finite-blocklength",
    title: "Channel Coding Rate in the Finite Blocklength Regime",
    authors: "Yury Polyanskiy · H. Vincent Poor · Sergio Verdú",
    year: "2010",
    venue: "IEEE Transactions on Information Theory",
    role: "milestone",
    route: "information",
    note: "把有限码长下的可靠通信刻画为可计算的非渐近问题，是现代 coding limits 的基准。",
    href: "https://doi.org/10.1109/TIT.2010.2043769",
  },
  {
    id: "strong-data-processing",
    title: "Strong Data Processing Inequalities and Φ-Sobolev Inequalities for Discrete Channels",
    authors: "Maxim Raginsky",
    year: "2016",
    venue: "IEEE Transactions on Information Theory",
    role: "frontier",
    route: "information",
    note: "把强数据处理不等式与函数不等式连接起来，形成跨路线的可研究接口。",
    href: "https://arxiv.org/abs/1411.3575",
  },
]);

export const DEMO_TODAY_IDS = ["chen-kls", "eldan-thin-shell", "kls-localization"] as const;

export const DEMO_LEARNING_STEPS = Object.freeze([
  { number: "01", title: "固定问题语言", detail: "先读 Cheeger 与 KLS 原始工作，弄清等周常数、谱隙和 localization lemma。", paperIds: ["cheeger-laplacian", "kls-localization"] },
  { number: "02", title: "进入随机局部化", detail: "理解 Eldan 如何把薄壳问题转化为谱隙控制，并记录关键随机过程。", paperIds: ["eldan-thin-shell"] },
  { number: "03", title: "追踪近常数突破", detail: "对照 Lee–Vempala 与 Chen，辨认 polylog、维数依赖和方法改进。", paperIds: ["lee-vempala-localization", "chen-kls"] },
  { number: "04", title: "连接相邻问题", detail: "把 KLS 与 slicing、采样和信息不等式放入同一张可验证的研究路线。", paperIds: ["klartag-lehec-slicing", "strong-data-processing"] },
]);
