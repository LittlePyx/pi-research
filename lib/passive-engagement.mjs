export const PASSIVE_ENGAGEMENT_WEIGHTS = Object.freeze({
  engaged_view: 1,
  detail_open: 2,
  revisit: 3,
  detail_dwell: 3,
  original_click: 5,
  share: 4,
  ask_pi: 6,
});

export function passiveEngagementWeight(kind, dwellMs = 0) {
  const base = PASSIVE_ENGAGEMENT_WEIGHTS[kind] || 0;
  if (!base) return 0;
  if (kind === "engaged_view" && dwellMs < 8_000) return 0;
  if (kind === "detail_dwell" && dwellMs < 12_000) return 0;
  return base;
}

export function passiveBranchBoost(input) {
  if (!input.engagedPapers || !input.papers) return 0;
  const engagementRate = Math.min(1, input.engagedPapers / Math.max(1, input.papers));
  const depth = Math.min(6, input.engagementWeight / Math.max(1, input.engagedPapers) * 0.8);
  return Math.min(12, Math.round(engagementRate * 6 + depth));
}

export function passiveInterestConfidence(weight) {
  return Math.max(46, Math.min(84, Math.round(42 + Math.sqrt(Math.max(0, weight)) * 8)));
}
