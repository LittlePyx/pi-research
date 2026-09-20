// Source-based paraphrases, checked 2026-09-20; not verbatim abstracts or review evidence.
export const DEMO_READING_SUMMARIES: Record<string, { zh: string; en: string; sourceUrl: string; kind: "overview" | "abstract-summary" }> = {
  "kls-survey": {
    "zh": "综述 KLS 猜想的来源、几何与算法后果以及当时的主要界，适合先建立术语和方法地图。",
    "en": "A survey of the origins, consequences and techniques surrounding KLS, providing context for the bounds known at the time.",
    "sourceUrl": "https://arxiv.org/abs/1807.03465",
    "kind": "abstract-summary"
  },
  "convex-clt": {
    "zh": "研究高维凸体上均匀分布的一维投影何时接近高斯分布，提供从凸几何理解中心极限定理的入口。",
    "en": "Studies approximately Gaussian one-dimensional marginals of uniform distributions on high-dimensional convex sets.",
    "sourceUrl": "https://arxiv.org/abs/math/0605014",
    "kind": "abstract-summary"
  },
  "convex-clt-rates": {
    "zh": "进一步研究凸体中心极限定理的定量逼近，以幂次尺度刻画误差，为比较定性结论和定量速率提供材料。",
    "en": "Develops quantitative power-law estimates for Gaussian approximation in the central limit theorem for convex sets.",
    "sourceUrl": "https://arxiv.org/abs/math/0611577",
    "kind": "abstract-summary"
  },
  "moment-maps": {
    "zh": "通过矩映射研究 Poincaré 不等式，并将凸体中心极限定理扩展到一类非凸区域，适合核对几何条件的作用。",
    "en": "Uses moment maps to study Poincare inequalities and extend convex-body central limit phenomena to certain nonconvex domains.",
    "sourceUrl": "https://arxiv.org/abs/1104.2791",
    "kind": "abstract-summary"
  },
  "kls-logarithmic": {
    "zh": "借助改进的对数凹 Lichnerowicz 不等式，将切片和 KLS 等周问题的因子控制在维数对数的平方根尺度。",
    "en": "An improved log-concave Lichnerowicz inequality yields square-root logarithmic losses for slicing and KLS isoperimetry.",
    "sourceUrl": "https://arxiv.org/abs/2303.14938",
    "kind": "abstract-summary"
  },
  "localization-diffusions": {
    "zh": "从采样角度解释扩散过程与随机局部化的联系，讨论算法化局部化及不同过程带来的启发。",
    "en": "Explains connections between diffusion-based sampling and stochastic localization, including algorithmic constructions and alternative processes.",
    "sourceUrl": "https://arxiv.org/abs/2305.10690",
    "kind": "abstract-summary"
  },
  "slips": {
    "zh": "提出通过迭代后验采样近似随机局部化动力学的方法，使用 MCMC 估计去噪器，并在多峰分布等任务中实验。",
    "en": "Approximates stochastic localization through iterative posterior sampling, using MCMC denoiser estimates and experiments on multimodal targets.",
    "sourceUrl": "https://arxiv.org/abs/2402.10758",
    "kind": "abstract-summary"
  },
  "parallel-thin-shell": {
    "zh": "该预印本以平行耦合方法给出各向同性对数凹随机向量的常数级薄壳界；2026 年修订版可用于追踪证明细节。",
    "en": "The preprint proves a constant thin-shell bound using a coupling related to stochastic localization; its revised version supports further proof checking.",
    "sourceUrl": "https://arxiv.org/abs/2507.15495",
    "kind": "abstract-summary"
  },
  "lossy-finite": {
    "zh": "在有限码长与超额失真概率约束下刻画有损源编码的最低速率，适合与信道编码的错误概率和色散并列核对。",
    "en": "Characterizes finite-length lossy source coding under an excess-distortion constraint, allowing comparison with channel-coding dispersion.",
    "sourceUrl": "https://arxiv.org/abs/1102.3944",
    "kind": "abstract-summary"
  },
  "joint-finite": {
    "zh": "研究有限码长下联合信源信道编码的界，展示非渐近情形中联合设计相对于分离设计的性能优势。",
    "en": "Gives finite-blocklength bounds for joint source-channel coding and quantifies advantages over separate designs in nonasymptotic settings.",
    "sourceUrl": "https://arxiv.org/abs/1209.1317",
    "kind": "abstract-summary"
  },
  "low-distortion": {
    "zh": "针对无记忆源的低失真压缩，给出控制超额失真概率所需速率的显式近似，连接高分辨率与有限码长分析。",
    "en": "Develops explicit low-distortion approximations for finite-blocklength compression rates under an excess-distortion probability constraint.",
    "sourceUrl": "https://arxiv.org/abs/1510.02190",
    "kind": "abstract-summary"
  },
  "gaussian-memory": {
    "zh": "研究带记忆高斯源及更一般源的有限码长有损压缩，刻画率失真项和二阶色散项；作为近期预印本待进一步阅读。",
    "en": "Studies finite-length lossy compression for Gaussian sources with memory and broader sources, characterizing rate-distortion and dispersion terms.",
    "sourceUrl": "https://arxiv.org/abs/2602.09176",
    "kind": "abstract-summary"
  },
  "sdpi-networks": {
    "zh": "从单信道的收缩系数出发，研究如何组合成贝叶斯网络的端到端信息收缩界，并讨论不同散度和反馈信道。",
    "en": "Relates single-channel contraction coefficients to end-to-end bounds in Bayesian networks, covering several divergences and feedback settings.",
    "sourceUrl": "https://arxiv.org/abs/1508.06025",
    "kind": "abstract-summary"
  },
  "conditional-dispersion": {
    "zh": "刻画编码和解码两端都有边信息时的二阶有损编码速率，讨论离散无记忆、高斯与马尔可夫源，须区别于 Wyner–Ziv 设置。",
    "en": "Characterizes second-order lossy coding when both terminals have side information, treating discrete, Gaussian and Markov sources.",
    "sourceUrl": "https://arxiv.org/abs/1410.2687",
    "kind": "abstract-summary"
  },
  "interactive-simulation": {
    "zh": "研究双终端在有限双向通信和共享随机性下模拟联合分布，给出多轮交互问题的可计算刻画。",
    "en": "Characterizes multiround channel simulation with limited two-way communication and shared randomness between two terminals.",
    "sourceUrl": "https://arxiv.org/abs/1203.3217",
    "kind": "abstract-summary"
  },
  "gaussian-bottleneck": {
    "zh": "研究联合高斯变量的信息瓶颈问题，把保留相关信息与压缩表示之间的权衡联系到线性投影和协方差结构。",
    "en": "Studies the information bottleneck for jointly Gaussian variables, connecting relevance-preserving compression with projections and covariance structure.",
    "sourceUrl": "https://jmlr.csail.mit.edu/papers/volume6/chechik05a/chechik05a.pdf",
    "kind": "abstract-summary"
  }
,
  "kls-localization": {
    "zh": "研究如何以较小的分割边界把凸体分成两部分，并用凸体中点到重心的平均距离控制等周系数。论文给出上下界，并猜想其中的上界在常数因子内刻画真实值。主要工具是局部化引理：把高维积分不等式化为单变量问题，并发展便于应用的变体。",
    "en": "The paper bounds the isoperimetric coefficient of a convex body using its average distance from the centroid. It proposes a constant-factor characterization and develops localization tools that reduce high-dimensional integral inequalities to one-dimensional ones.",
    "sourceUrl": "https://www.math.cmu.edu/~af1p/Teaching/MCC17/Papers/KannanLovSimIso.pdf",
    "kind": "abstract-summary"
  },
  "eldan-thin-shell": {
    "zh": "研究高维各向同性凸体的等周问题，建立薄壳猜想与 KLS 猜想之间的定量联系：相应的最优界只相差对数因子。证明依赖为对数凹测度构造的随机局部化过程，并讨论薄壳猜想对一种 Brunn–Minkowski 不等式维数依赖的影响。",
    "en": "A stochastic localization process for log-concave measures relates the thin-shell and KLS bounds up to logarithmic losses. The paper also derives a consequence for dimension dependence in a formulation of the Brunn–Minkowski inequality.",
    "sourceUrl": "https://arxiv.org/abs/1203.0893",
    "kind": "abstract-summary"
  },
  "logconcave-geometry": {
    "zh": "研究对数凹函数的几何性质及相关等周不等式，并将这些结果用于随机采样算法。针对高维对数凹分布，分析无需密度局部光滑性假设的采样方法，说明适当预处理后如何得到近似服从目标分布的样本。",
    "en": "Geometric and isoperimetric properties of log-concave functions support efficient random sampling. The algorithms work without assuming local smoothness of the density and use preprocessing to obtain approximate samples efficiently.",
    "sourceUrl": "https://faculty.cc.gatech.edu/~vempala/papers/logcon.pdf",
    "kind": "abstract-summary"
  },
  "lee-vempala-localization": {
    "zh": "发展 Eldan 的随机局部化方法，研究对数凹密度的 Poincaré 与对数 Sobolev 常数。论文改进各向同性情形的 Poincaré 界，并给出与支撑直径相关的对数 Sobolev 界；由此得到薄壳、等周、随机游走混合时间和 Lipschitz 函数集中性质的改进结果。",
    "en": "Developing stochastic localization yields improved Poincaré estimates and diameter-dependent log-Sobolev bounds for log-concave densities. Consequences concern thin shells, isoperimetry, random-walk mixing and concentration of Lipschitz functions.",
    "sourceUrl": "https://annals.math.princeton.edu/2024/199-3/p02",
    "kind": "abstract-summary"
  },
  "chen-kls": {
    "zh": "把 KLS 猜想中等周系数的维数依赖下界推进到接近常数的尺度，在高维时优于此前的四分之一次幂界。结果进一步改善切片问题、薄壳问题、对数凹测度下的集中不等式及相关 MCMC 采样混合时间界。",
    "en": "The isoperimetric lower bound has subpolynomial dimension dependence, improving the previous quarter-power dependence in sufficiently high dimension. Applications include slicing, thin shells, concentration and mixing bounds for log-concave sampling.",
    "sourceUrl": "https://arxiv.org/abs/2011.13661",
    "kind": "abstract-summary"
  },
  "klartag-lehec-slicing": {
    "zh": "证明 Bourgain 超平面猜想和 KLS 等周猜想在允许一个随维数呈多对数增长的因子时成立。该结果给出多对数尺度的控制，并非已经得到猜想要求的维数无关常数界。",
    "en": "The hyperplane and KLS conjectures are established with a polylogarithmic loss in dimension. This gives polylogarithmic control, rather than the dimension-independent constants requested by the conjectures.",
    "sourceUrl": "https://arxiv.org/abs/2203.15551",
    "kind": "abstract-summary"
  },
  "shannon-fidelity": {
    "zh": "针对具有给定失真准则的离散信息源，研究允许有损重建时所需的编码速率。以率失真函数刻画可容忍失真与信息速率的关系，讨论计算方法和基本性质，并扩展到遍历源、连续源及涉及符号块的失真准则。",
    "en": "A distortion criterion allows source coding to trade reconstruction accuracy for rate. The work characterizes this tradeoff through the rate-distortion function, discusses its computation and extends the framework beyond single-letter discrete settings.",
    "sourceUrl": "https://ieeexplore.ieee.org/document/5311476",
    "kind": "abstract-summary"
  },
  "wyner-ziv": {
    "zh": "研究只有解码器能够获得相关边信息的有损源编码。对于独立重复抽取的相关随机变量及给定失真准则，刻画达到目标平均失真所需的最小渐近编码速率，并与编码器也能使用边信息的情形比较。",
    "en": "For repeated draws of correlated variables, the decoder observes side information unavailable to the encoder. The paper characterizes the minimum asymptotic rate for a prescribed average distortion and compares it with side information available at both ends.",
    "sourceUrl": "https://web.mit.edu/6.962/www/www_fall_2001/kusuma/wynerziv.pdf",
    "kind": "abstract-summary"
  },
  "information-bottleneck": {
    "zh": "把输入中与另一变量有关的信息作为需要保留的内容，寻找尽可能压缩输入、同时保留相关信息的表示。论文将这一权衡写成变分优化问题，导出编码规则的自洽方程及迭代求解方法，并说明其与率失真理论的联系。",
    "en": "A compressed representation is optimized to retain information about a relevant variable. The variational formulation produces self-consistency equations and an iterative solution method, connecting relevance-based compression with rate-distortion theory.",
    "sourceUrl": "https://arxiv.org/abs/physics/0004057",
    "kind": "abstract-summary"
  },
  "i-mmse": {
    "zh": "研究任意有限功率输入经过加性高斯噪声信道后的互信息与最小均方估计误差。以自然对数计量互信息时，其对信噪比的导数等于 MMSE 的一半。关系涵盖标量和向量情形，并给出连续时间因果滤波与非因果平滑误差之间的联系。",
    "en": "For finite-power inputs in Gaussian noise, the derivative of mutual information measured in nats with respect to SNR equals half the MMSE. Scalar, vector and continuous-time settings are treated, with a further connection between filtering and smoothing errors.",
    "sourceUrl": "https://arxiv.org/abs/cs/0412108",
    "kind": "abstract-summary"
  },
  "finite-blocklength": {
    "zh": "在码长和允许错误概率固定时，研究信道可达到的最大编码速率。论文给出非渐近可达界与逆界，并以信道容量和信道色散描述有限码长的主要损失，从而为有限长度编码提供比单看渐近容量更具体的性能参照。",
    "en": "New achievability and converse bounds describe the maximum rate at a fixed blocklength and error probability. Capacity and channel dispersion provide useful approximations to the finite-length penalty and benchmarks for practical codes.",
    "sourceUrl": "https://people.lids.mit.edu/yp/homepage/data/finite_block.pdf",
    "kind": "abstract-summary"
  },
  "strong-data-processing": {
    "zh": "系统研究离散信道中强数据处理不等式的最优常数，用输入输出之间散度的收缩刻画信道的信息损失。内容包括变分刻画、上下界、乘积概率空间中的结构性质，以及这些不等式与 Φ-Sobolev 不等式之间的联系。",
    "en": "Optimal contraction constants for discrete-channel divergences are studied through variational formulas, bounds and product-space structure. The work connects strong data processing with Φ-Sobolev inequalities and applications in information theory and probability.",
    "sourceUrl": "https://arxiv.org/abs/1411.3575",
    "kind": "abstract-summary"
  },
  "cheeger-laplacian": {
    "zh": "这篇经典工作研究拉普拉斯算子最小特征值的下界，是本路线理解等周几何与谱隙关系的基础阅读。此处提供文献简介；原章节的具体条件与证明请在来源中核对。",
    "en": "This classic chapter studies a lower bound for the smallest Laplacian eigenvalue. It provides background for the route from isoperimetric geometry to spectral gaps; consult the chapter for precise assumptions and proofs.",
    "sourceUrl": "https://www.degruyterbrill.com/document/doi/10.1515/9781400869312-013/html",
    "kind": "overview"
  },
  "costa-epi": {
    "zh": "Costa 的结果研究加入独立高斯噪声后熵功率如何变化：熵功率关于噪声方差具有凹性。此处为文献简介，所附来源是讨论该结果的后续研究，便于核对这一结论及原始文献引用。",
    "en": "Costa’s result concerns the concavity of entropy power as independent Gaussian noise variance increases. This overview links to subsequent research that discusses the result and cites the original paper.",
    "sourceUrl": "https://people.eecs.berkeley.edu/~courtade/pdfs/ConcavityEntropy_ISIT2017.pdf",
    "kind": "overview"
  }
};
