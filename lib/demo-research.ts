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
{"id": "kls-survey", "title": "The Kannan-Lovász-Simonovits Conjecture", "authors": "Yin Tat Lee · Santosh S. Vempala", "year": "2018", "venue": "arXiv", "role": "foundation", "route": "geometry", "note": "综述 KLS 猜想的来源、几何与算法后果以及当时的主要界，适合先建立术语和方法地图。", "href": "https://arxiv.org/abs/1807.03465"},{"id": "convex-clt", "title": "A Central Limit Theorem for Convex Sets", "authors": "Bo’az Klartag", "year": "2006", "venue": "arXiv", "role": "foundation", "route": "geometry", "note": "研究高维凸体上均匀分布的一维投影何时接近高斯分布，提供从凸几何理解中心极限定理的入口。", "href": "https://arxiv.org/abs/math/0605014"},{"id": "convex-clt-rates", "title": "Power-law estimates for the central limit theorem for convex sets", "authors": "Bo’az Klartag", "year": "2006", "venue": "arXiv", "role": "milestone", "route": "geometry", "note": "进一步研究凸体中心极限定理的定量逼近，以幂次尺度刻画误差，为比较定性结论和定量速率提供材料。", "href": "https://arxiv.org/abs/math/0611577"},{"id": "moment-maps", "title": "Poincare Inequalities and Moment Maps", "authors": "Bo’az Klartag", "year": "2011", "venue": "arXiv", "role": "milestone", "route": "geometry", "note": "通过矩映射研究 Poincaré 不等式，并将凸体中心极限定理扩展到一类非凸区域，适合核对几何条件的作用。", "href": "https://arxiv.org/abs/1104.2791"},{"id": "kls-logarithmic", "title": "Logarithmic bounds for isoperimetry and slices of convex sets", "authors": "Bo’az Klartag", "year": "2023", "venue": "arXiv", "role": "frontier", "route": "geometry", "note": "借助改进的对数凹 Lichnerowicz 不等式，将切片和 KLS 等周问题的因子控制在维数对数的平方根尺度。", "href": "https://arxiv.org/abs/2303.14938"},{"id": "localization-diffusions", "title": "Sampling, Diffusions, and Stochastic Localization", "authors": "Andrea Montanari", "year": "2023", "venue": "arXiv", "role": "milestone", "route": "geometry", "note": "从采样角度解释扩散过程与随机局部化的联系，讨论算法化局部化及不同过程带来的启发。", "href": "https://arxiv.org/abs/2305.10690"},{"id": "slips", "title": "Stochastic Localization via Iterative Posterior Sampling", "authors": "Louis Grenioux · Maxence Noble · Marylou Gabrié · Alain Oliviero Durmus", "year": "2024", "venue": "arXiv", "role": "frontier", "route": "geometry", "note": "提出通过迭代后验采样近似随机局部化动力学的方法，使用 MCMC 估计去噪器，并在多峰分布等任务中实验。", "href": "https://arxiv.org/abs/2402.10758"},{"id": "parallel-thin-shell", "title": "Thin-shell bounds via parallel coupling", "authors": "Boaz Klartag · Joseph Lehec", "year": "2025", "venue": "arXiv", "role": "frontier", "route": "geometry", "note": "该预印本以平行耦合方法给出各向同性对数凹随机向量的常数级薄壳界；2026 年修订版可用于追踪证明细节。", "href": "https://arxiv.org/abs/2507.15495"},{"id": "lossy-finite", "title": "Fixed-length lossy compression in the finite blocklength regime", "authors": "Victoria Kostina · Sergio Verdú", "year": "2011", "venue": "arXiv", "role": "milestone", "route": "information", "note": "在有限码长与超额失真概率约束下刻画有损源编码的最低速率，适合与信道编码的错误概率和色散并列核对。", "href": "https://arxiv.org/abs/1102.3944"},{"id": "joint-finite", "title": "Lossy joint source-channel coding in the finite blocklength regime", "authors": "Victoria Kostina · Sergio Verdú", "year": "2012", "venue": "arXiv", "role": "milestone", "route": "information", "note": "研究有限码长下联合信源信道编码的界，展示非渐近情形中联合设计相对于分离设计的性能优势。", "href": "https://arxiv.org/abs/1209.1317"},{"id": "low-distortion", "title": "Data compression with low distortion and finite blocklength", "authors": "Victoria Kostina", "year": "2015", "venue": "arXiv", "role": "milestone", "route": "information", "note": "针对无记忆源的低失真压缩，给出控制超额失真概率所需速率的显式近似，连接高分辨率与有限码长分析。", "href": "https://arxiv.org/abs/1510.02190"},{"id": "gaussian-memory", "title": "Dispersion of Gaussian Sources with Memory and an Extension to Abstract Sources", "authors": "Eyyup Tasci · Victoria Kostina", "year": "2026", "venue": "arXiv", "role": "frontier", "route": "information", "note": "研究带记忆高斯源及更一般源的有限码长有损压缩，刻画率失真项和二阶色散项；作为近期预印本待进一步阅读。", "href": "https://arxiv.org/abs/2602.09176"},{"id": "sdpi-networks", "title": "Strong data-processing inequalities for channels and Bayesian networks", "authors": "Yury Polyanskiy · Yihong Wu", "year": "2015", "venue": "arXiv", "role": "milestone", "route": "information", "note": "从单信道的收缩系数出发，研究如何组合成贝叶斯网络的端到端信息收缩界，并讨论不同散度和反馈信道。", "href": "https://arxiv.org/abs/1508.06025"},{"id": "conditional-dispersion", "title": "Second-Order Coding Rates for Conditional Rate-Distortion", "authors": "Sy-Quoc Le · Vincent Y. F. Tan · Mehul Motani", "year": "2014", "venue": "arXiv", "role": "milestone", "route": "information", "note": "刻画编码和解码两端都有边信息时的二阶有损编码速率，讨论离散无记忆、高斯与马尔可夫源，须区别于 Wyner–Ziv 设置。", "href": "https://arxiv.org/abs/1410.2687"},{"id": "interactive-simulation", "title": "Channel simulation via interactive communications", "authors": "Mohammad Hossein Yassaee · Amin Gohari · Mohammad Reza Aref", "year": "2012", "venue": "arXiv", "role": "frontier", "route": "information", "note": "研究双终端在有限双向通信和共享随机性下模拟联合分布，给出多轮交互问题的可计算刻画。", "href": "https://arxiv.org/abs/1203.3217"},{"id": "gaussian-bottleneck", "title": "Information Bottleneck for Gaussian Variables", "authors": "Gal Chechik · Amir Globerson · Naftali Tishby · Yair Weiss", "year": "2005", "venue": "JMLR", "role": "foundation", "route": "information", "note": "研究联合高斯变量的信息瓶颈问题，把保留相关信息与压缩表示之间的权衡联系到线性投影和协方差结构。", "href": "https://jmlr.csail.mit.edu/papers/volume6/chechik05a/chechik05a.pdf"},
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
