import type { ResearchTrackRole } from "./research-map";

export type ResearchClassicSeed = {
  id: string;
  title: string;
  aliases?: string[];
  role: Exclude<ResearchTrackRole, "frontier">;
  signals: string[];
};

export type ResearchClassicSeedTopic = {
  titleEn: string;
  summaryEn?: string;
  searchQueries: string[];
};

/**
 * This catalog contains bibliographic search anchors, not recommendations or
 * formal route evidence. Runtime retrieval must still return a matching real
 * record, and that record must pass the shared quality queue before Today can
 * surface it.
 */
export const RESEARCH_CLASSIC_SEEDS: readonly ResearchClassicSeed[] = Object.freeze([
  {
    id: "kls-localization-lemma",
    title: "Isoperimetric problems for convex bodies and a localization lemma",
    role: "foundation",
    signals: ["kls conjecture", "kannan lovasz simonovits", "stochastic localization", "isoperimetric coefficient", "log concave"],
  },
  {
    id: "cheeger-laplacian-lower-bound",
    title: "A lower bound for the smallest eigenvalue of the Laplacian",
    role: "foundation",
    signals: ["cheeger inequality", "cheeger constant", "isoperimetric coefficient", "spectral gap", "kls conjecture"],
  },
  {
    id: "eldan-thin-shell-localization",
    title: "Thin shell implies spectral gap up to polylog via a stochastic localization scheme",
    role: "milestone",
    signals: ["stochastic localization", "kls conjecture", "thin shell", "spectral gap", "log concave"],
  },
  {
    id: "chen-almost-constant-kls",
    title: "An Almost Constant Lower Bound of the Isoperimetric Coefficient in the KLS Conjecture",
    role: "milestone",
    signals: ["kls conjecture", "stochastic localization", "isoperimetric coefficient", "log concave", "chen"],
  },
  {
    id: "shannon-fidelity-criterion",
    title: "Coding Theorems for a Discrete Source With a Fidelity Criterion",
    role: "foundation",
    signals: ["rate distortion", "lossy source coding", "distortion theory", "source coding foundations"],
  },
  {
    id: "wyner-ziv-side-information",
    title: "The Rate-Distortion Function for Source Coding with Side Information at the Decoder",
    role: "foundation",
    signals: ["wyner ziv", "side information", "rate distortion", "lossy source coding"],
  },
  {
    id: "information-bottleneck-method",
    title: "The Information Bottleneck Method",
    role: "foundation",
    signals: ["information bottleneck", "semantic compression", "task oriented compression", "sufficiency"],
  },
  {
    id: "finite-blocklength-channel-coding",
    title: "Channel Coding Rate in the Finite Blocklength Regime",
    role: "milestone",
    signals: ["finite blocklength", "channel coding rate", "coding limits", "dispersion bounds"],
  },
  {
    id: "i-mmse-gaussian-channels",
    title: "Mutual Information and Minimum Mean-Square Error in Gaussian Channels",
    role: "milestone",
    signals: ["gaussian extremality", "i mmse", "mutual information", "gaussian channels", "minimum mean square error"],
  },
  {
    id: "costa-new-entropy-power",
    title: "A New Entropy Power Inequality",
    role: "foundation",
    signals: ["entropy power inequality", "gaussian extremality", "gaussian inequalities"],
  },
  {
    id: "information-theoretic-inequalities",
    title: "Information Theoretic Inequalities",
    aliases: ["Information-theoretic inequalities"],
    role: "foundation",
    signals: ["information theoretic inequalities", "entropy power inequality", "gaussian extremality"],
  },
]);

export function normalizeResearchClassicTitle(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function signalScore(corpus: string, signal: string) {
  const normalized = normalizeResearchClassicTitle(signal);
  if (!normalized || !corpus.includes(normalized)) return 0;
  const wordCount = normalized.split(/\s+/).length;
  return 4 + Math.min(6, wordCount);
}

export function selectResearchClassicSeeds(
  topic: ResearchClassicSeedTopic,
  limit = 4,
) {
  const corpus = normalizeResearchClassicTitle([
    topic.titleEn,
    topic.summaryEn || "",
    ...topic.searchQueries,
  ].join(" "));
  return RESEARCH_CLASSIC_SEEDS.map((seed, index) => ({
    seed,
    index,
    score: seed.signals.reduce((total, signal) => total + signalScore(corpus, signal), 0),
  })).filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(0, Math.floor(limit)))
    .map((item) => item.seed);
}

/**
 * Rescue admission is deliberately stricter than ordinary topic retrieval.
 * A keyword-near paper never inherits the identity of a classical seed.
 */
export function matchesResearchClassicSeedTitle(seed: ResearchClassicSeed, candidateTitle: string) {
  const candidate = normalizeResearchClassicTitle(candidateTitle);
  return [seed.title, ...(seed.aliases || [])]
    .some((title) => normalizeResearchClassicTitle(title) === candidate);
}

export function preferredResearchClassicCandidate<T extends {
  abstractText: string;
  citationCount: number;
  classicRescueSeedId?: string;
}>(current: T | undefined, incoming: T) {
  if (!current) return incoming;
  // A record reloaded through the protected baseline has completed the shared
  // review loop. It must replace its still-pending rescue copy even when the
  // provider copy happens to contain a longer abstract.
  if (current.classicRescueSeedId && !incoming.classicRescueSeedId) return incoming;
  if (!current.classicRescueSeedId && incoming.classicRescueSeedId) return current;
  return incoming.abstractText.length > current.abstractText.length
    || incoming.citationCount > current.citationCount ? incoming : current;
}
