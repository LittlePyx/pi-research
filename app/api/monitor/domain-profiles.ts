export type DomainProfile = {
  key: string;
  nameZh: string;
  nameEn: string;
  keywords: string[];
  venues: string[];
};

export const DOMAIN_PROFILES: DomainProfile[] = [
  {
    key: "information_theory",
    nameZh: "信息论与通信",
    nameEn: "Information theory & communications",
    keywords: ["information theory", "rate-distortion", "entropy", "channel coding", "source coding", "mutual information", "信息论", "率失真", "信道编码"],
    venues: [
      "IEEE Transactions on Information Theory",
      "IEEE International Symposium on Information Theory",
      "IEEE Information Theory Workshop",
      "IEEE Journal on Selected Areas in Information Theory",
      "Allerton Conference on Communication, Control, and Computing",
    ],
  },
  {
    key: "machine_learning",
    nameZh: "机器学习与人工智能",
    nameEn: "Machine learning & AI",
    keywords: ["machine learning", "deep learning", "foundation model", "neural network", "generative", "representation learning", "机器学习", "深度学习", "大模型", "生成模型"],
    venues: [
      "Advances in Neural Information Processing Systems",
      "International Conference on Machine Learning",
      "International Conference on Learning Representations",
      "Journal of Machine Learning Research",
      "Transactions on Machine Learning Research",
      "AAAI Conference on Artificial Intelligence",
    ],
  },
  {
    key: "applied_mathematics",
    nameZh: "应用数学与分析",
    nameEn: "Applied mathematics & analysis",
    keywords: ["applied mathematics", "optimal transport", "functional inequality", "partial differential", "stochastic", "calculus of variations", "应用数学", "最优传输", "偏微分", "随机分析"],
    venues: [
      "Communications on Pure and Applied Mathematics",
      "Archive for Rational Mechanics and Analysis",
      "Journal of Functional Analysis",
      "SIAM Journal on Mathematical Analysis",
      "Calculus of Variations and Partial Differential Equations",
      "Annals of Probability",
      "Inventiones Mathematicae",
    ],
  },
  {
    key: "statistics",
    nameZh: "统计学与概率",
    nameEn: "Statistics & probability",
    keywords: ["statistics", "statistical", "bayesian", "causal inference", "probability", "high-dimensional", "统计", "贝叶斯", "因果推断", "概率"],
    venues: [
      "Annals of Statistics",
      "Journal of the American Statistical Association",
      "Biometrika",
      "Journal of the Royal Statistical Society Series B",
      "Annals of Probability",
      "Bernoulli",
    ],
  },
  {
    key: "theoretical_computer_science",
    nameZh: "理论计算机科学",
    nameEn: "Theoretical computer science",
    keywords: ["theoretical computer", "algorithm", "computational complexity", "cryptography", "combinatorics", "算法", "计算复杂性", "密码学", "组合数学"],
    venues: [
      "ACM Symposium on Theory of Computing",
      "IEEE Symposium on Foundations of Computer Science",
      "ACM-SIAM Symposium on Discrete Algorithms",
      "Journal of the ACM",
      "SIAM Journal on Computing",
      "Theory of Computing",
    ],
  },
  {
    key: "computer_vision_nlp",
    nameZh: "计算机视觉与自然语言处理",
    nameEn: "Computer vision & NLP",
    keywords: ["computer vision", "natural language", "language model", "image generation", "multimodal", "计算机视觉", "自然语言", "语言模型", "多模态"],
    venues: [
      "IEEE/CVF Conference on Computer Vision and Pattern Recognition",
      "International Conference on Computer Vision",
      "European Conference on Computer Vision",
      "Annual Meeting of the Association for Computational Linguistics",
      "Empirical Methods in Natural Language Processing",
      "Transactions of the Association for Computational Linguistics",
    ],
  },
  {
    key: "physics",
    nameZh: "物理学",
    nameEn: "Physics",
    keywords: ["physics", "quantum", "condensed matter", "particle", "cosmology", "物理", "量子", "凝聚态", "粒子", "宇宙学"],
    venues: [
      "Physical Review Letters",
      "Nature Physics",
      "Physical Review X",
      "Reviews of Modern Physics",
      "Journal of High Energy Physics",
      "Nature Communications",
    ],
  },
  {
    key: "biomedicine",
    nameZh: "生命科学与医学",
    nameEn: "Life sciences & medicine",
    keywords: ["biomedical", "medicine", "clinical", "genomics", "biology", "drug", "医学", "临床", "基因组", "生物", "药物"],
    venues: [
      "New England Journal of Medicine",
      "The Lancet",
      "JAMA",
      "Nature Medicine",
      "Cell",
      "Nature Biotechnology",
      "Science Translational Medicine",
    ],
  },
  {
    key: "general_research",
    nameZh: "综合研究",
    nameEn: "General research",
    keywords: [],
    venues: ["Nature", "Science", "Proceedings of the National Academy of Sciences", "Nature Communications", "Science Advances"],
  },
];

export function inferDomainProfile(name: string, description: string) {
  const haystack = `${name} ${description}`.toLocaleLowerCase();
  let best = DOMAIN_PROFILES[DOMAIN_PROFILES.length - 1];
  let bestScore = 0;
  for (const profile of DOMAIN_PROFILES.slice(0, -1)) {
    const score = profile.keywords.reduce((total, keyword) => {
      return total + (haystack.includes(keyword.toLocaleLowerCase()) ? Math.max(1, keyword.split(/\s+/).length) : 0);
    }, 0);
    if (score > bestScore) {
      best = profile;
      bestScore = score;
    }
  }
  return best;
}

export function getDomainProfile(key: string) {
  return DOMAIN_PROFILES.find((profile) => profile.key === key) || DOMAIN_PROFILES[DOMAIN_PROFILES.length - 1];
}
