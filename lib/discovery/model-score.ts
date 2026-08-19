export type ModelScoreScale = "percent" | "unit";

const STRONG_FIT_REASON = /\b(?:direct(?:ly)? relevant|direct fit|strong(?:ly)? relevant|highly relevant|core match)\b|直接相关|高度相关|核心匹配/i;

function finiteScore(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function inferModelScoreScale(records: Array<{ relevanceScore?: unknown; qualityScore?: unknown; screeningReason?: unknown }>): ModelScoreScale {
  const values = records
    .flatMap((record) => [finiteScore(record.relevanceScore), finiteScore(record.qualityScore)])
    .filter((value): value is number => value !== null);
  const positive = values.filter((value) => value > 0);
  if (!positive.length || !values.every((value) => value >= 0 && value <= 1)) return "percent";
  const strongFitUsesUnitMaximum = records.some((record) => STRONG_FIT_REASON.test(String(record.screeningReason || ""))
    && finiteScore(record.relevanceScore) === 1);
  return positive.some((value) => !Number.isInteger(value)) || positive.length >= 4 || strongFitUsesUnitMaximum ? "unit" : "percent";
}

export function normalizeModelScore(value: unknown, scale: ModelScoreScale = "percent") {
  const numeric = finiteScore(value);
  if (numeric === null) return 0;
  const normalized = scale === "unit" ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

export function hasStrongFitScoreContradiction(score: number, reason: string) {
  return score <= 5 && STRONG_FIT_REASON.test(reason);
}
