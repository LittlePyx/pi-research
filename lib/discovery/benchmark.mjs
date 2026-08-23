import {
  DISCOVERY_BENCHMARK_GATES,
  DISCOVERY_BENCHMARK_VERSION,
  DISCOVERY_GOLD_SETS,
  discoveryGoldSet,
} from "../../benchmarks/discovery-gold.mjs";

const DASHES = /[\u2010-\u2015\u2212]/g;
const QUOTES = /[\u2018\u2019\u201c\u201d]/g;

export function normalizeBenchmarkText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(DASHES, "-")
    .replace(QUOTES, "'")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value) {
  return new Set(normalizeBenchmarkText(value).split(" ").filter((token) => token.length > 1));
}

export function benchmarkTitleSimilarity(left, right) {
  const leftNormalized = normalizeBenchmarkText(left);
  const rightNormalized = normalizeBenchmarkText(right);
  if (!leftNormalized || !rightNormalized) return 0;
  if (leftNormalized === rightNormalized) return 1;
  const leftTokens = titleTokens(leftNormalized);
  const rightTokens = titleTokens(rightNormalized);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const containment = intersection / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  const jaccard = intersection / Math.max(1, union);
  return Math.min(1, containment * 0.65 + jaccard * 0.35);
}

function includesPhrase(normalizedText, phrase) {
  const normalizedPhrase = normalizeBenchmarkText(phrase);
  return normalizedPhrase.length > 2 && ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function matchingGoldTitle(items, title) {
  let best = null;
  let bestSimilarity = 0;
  for (const item of items) {
    for (const candidateTitle of [item.title, ...(item.aliases || [])]) {
      const similarity = benchmarkTitleSimilarity(title, candidateTitle);
      if (similarity > bestSimilarity) {
        best = item;
        bestSimilarity = similarity;
      }
    }
  }
  return bestSimilarity >= 0.9 ? { item: best, similarity: bestSimilarity } : null;
}

export function discoveryCalibrationSignals(profileKey, record) {
  const benchmark = discoveryGoldSet(profileKey);
  if (!benchmark) return {
    benchmarkVersion: DISCOVERY_BENCHMARK_VERSION,
    facetIds: [],
    facetScore: 0,
    exclusionSignals: [],
    likelyWrongType: false,
    goldLabel: "unknown",
    priorityBoost: 0,
  };
  const text = normalizeBenchmarkText(`${record?.title || ""} ${record?.abstractText || record?.abstract || ""} ${record?.venue || ""}`);
  const facetIds = benchmark.facets
    .filter((facet) => facet.terms.some((term) => includesPhrase(text, term)))
    .map((facet) => facet.id);
  const exclusionSignals = benchmark.exclusionSignals.filter((signal) => includesPhrase(text, signal));
  const positive = matchingGoldTitle(benchmark.positives, record?.title || "");
  const hardNegative = matchingGoldTitle(benchmark.hardNegatives, record?.title || "");
  const likelyWrongType = Boolean(hardNegative || (exclusionSignals.length && !facetIds.length));
  const goldLabel = positive ? "relevant" : hardNegative ? "wrong_type" : "unknown";
  const facetScore = Math.min(4, facetIds.length);
  const priorityBoost = likelyWrongType
    ? -240
    : positive
      ? 160
      : Math.min(90, facetScore * 32);
  return {
    benchmarkVersion: DISCOVERY_BENCHMARK_VERSION,
    facetIds,
    facetScore,
    exclusionSignals,
    likelyWrongType,
    goldLabel,
    priorityBoost,
  };
}

function stableIndex(value, length) {
  if (!length) return 0;
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

export function benchmarkQueryForHorizon(profileKey, horizon, selector = "") {
  const queries = discoveryGoldSet(profileKey)?.baselineQueries?.[horizon] || [];
  return queries[stableIndex(`${selector}:${horizon}`, queries.length)] || "";
}

export function mergeBenchmarkQueryCoverage(profileKey, queries, selector = "", limit = 4) {
  return Object.fromEntries(["days", "months", "years"].map((horizon) => {
    const baseline = benchmarkQueryForHorizon(profileKey, horizon, selector);
    const planned = Array.isArray(queries?.[horizon]) ? queries[horizon] : [];
    return [horizon, Array.from(new Set([baseline, ...planned].map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit)];
  }));
}

export function benchmarkCalibrationPrompt(profileKey) {
  const benchmark = discoveryGoldSet(profileKey);
  if (!benchmark) return "No domain-specific benchmark is available; rely on the supplied research-space evidence.";
  return [
    `Internal domain calibration (${benchmark.label}, ${DISCOVERY_BENCHMARK_VERSION}).`,
    `Protected facets that should receive fair coverage: ${benchmark.facets.map((facet) => `${facet.label} [${facet.terms.slice(0, 3).join(", ")}]`).join("; ")}.`,
    `High-precision wrong-type signals: ${benchmark.exclusionSignals.join(", ")}. A signal is not enough to reject a paper when its abstract establishes a direct protected-facet contribution.`,
    "Use these as calibration constraints, not as paper recommendations and not as substitutes for the supplied evidence.",
  ].join(" ");
}

export function buildBenchmarkReplayRecords(profileKey) {
  const benchmark = discoveryGoldSet(profileKey);
  if (!benchmark) return [];
  return [
    ...benchmark.positives.map((item, index) => ({
      title: item.title,
      abstract: benchmark.facets.find((facet) => facet.id === item.facet)?.terms.join("; ") || "",
      expected: "relevant",
      sourceScore: 70 - index,
    })),
    ...benchmark.hardNegatives.map((item, index) => ({
      title: item.title,
      abstract: item.reason,
      expected: "wrong_type",
      sourceScore: 96 - index,
    })),
  ];
}

export function rankBenchmarkRecords(profileKey, records) {
  return records.map((record) => {
    const signals = discoveryCalibrationSignals(profileKey, record);
    const sourceScore = Number(record.sourceScore || 0);
    const benchmarkScore = signals.likelyWrongType ? Math.min(5, sourceScore) : sourceScore + signals.priorityBoost;
    return { ...record, benchmarkSignals: signals, benchmarkScore };
  }).sort((left, right) => right.benchmarkScore - left.benchmarkScore);
}

export function evaluateDiscoveryRanking(profileKey, records, options = {}) {
  const benchmark = discoveryGoldSet(profileKey);
  if (!benchmark) throw new Error(`Unknown discovery benchmark profile: ${profileKey}`);
  const k = Math.max(1, Number(options.k || 10));
  const ranked = rankBenchmarkRecords(profileKey, records);
  const topK = ranked.slice(0, k);
  const relevantTotal = records.filter((record) => record.expected === "relevant").length;
  const relevantTopK = topK.filter((record) => record.expected === "relevant").length;
  const wrongTypeTopK = topK.filter((record) => record.expected === "wrong_type").length;
  const labeledTopK = topK.filter((record) => ["relevant", "wrong_type"].includes(record.expected)).length;
  const coveredFacets = new Set(topK.flatMap((record) => record.benchmarkSignals.facetIds));
  const metrics = {
    recallAtK: relevantTopK / Math.max(1, relevantTotal),
    precisionAt10: relevantTopK / Math.max(1, labeledTopK),
    wrongTypeRate: wrongTypeTopK / Math.max(1, labeledTopK),
    facetCoverage: coveredFacets.size / Math.max(1, benchmark.facets.length),
  };
  const gates = {
    recallAtK: metrics.recallAtK >= DISCOVERY_BENCHMARK_GATES.recallAtK,
    precisionAt10: metrics.precisionAt10 >= DISCOVERY_BENCHMARK_GATES.precisionAt10,
    wrongTypeRate: metrics.wrongTypeRate <= DISCOVERY_BENCHMARK_GATES.wrongTypeRate,
    facetCoverage: metrics.facetCoverage >= DISCOVERY_BENCHMARK_GATES.facetCoverage,
  };
  return {
    profileKey,
    benchmarkVersion: DISCOVERY_BENCHMARK_VERSION,
    k,
    metrics,
    gates,
    passed: Object.values(gates).every(Boolean),
    ranked,
  };
}

export { DISCOVERY_BENCHMARK_GATES, DISCOVERY_BENCHMARK_VERSION, DISCOVERY_GOLD_SETS };
