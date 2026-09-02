/**
 * Select from a ranked list while giving every represented research branch a
 * chance before one prolific branch consumes the whole budget.
 *
 * @template T
 * @param {T[]} rankedItems
 * @param {(item: T) => string} groupKey
 * @param {number} limit
 * @returns {T[]}
 */
export function selectBalancedByGroup(rankedItems, groupKey, limit) {
  const selected = [];
  const selectedSet = new Set();
  const groupCounts = new Map();
  const add = (item) => {
    if (selected.length >= limit || selectedSet.has(item)) return false;
    selected.push(item);
    selectedSet.add(item);
    const group = groupKey(item);
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    return true;
  };

  for (const item of rankedItems) {
    if (!(groupCounts.get(groupKey(item)) || 0)) add(item);
  }
  for (const item of rankedItems) {
    if ((groupCounts.get(groupKey(item)) || 0) < 2) add(item);
  }
  for (const item of rankedItems) add(item);
  return selected;
}

/**
 * The fast pass is deliberately permissive enough to preserve subtle papers
 * for evidence enrichment. The final recommendation gate remains stricter.
 *
 * @param {{isPaper: boolean, relevanceScore: number, qualityScore: number}} screen
 */
export function isPrimaryDeepCandidate(screen) {
  return screen.isPaper && screen.relevanceScore >= 68 && screen.qualityScore >= 55;
}

/**
 * Near-miss papers can receive one evidence-backed rescue review. This does
 * not recommend them; it only lets the stronger final review make the call.
 *
 * @param {{isPaper: boolean, relevanceScore: number, qualityScore: number}} screen
 */
export function isRescueDeepCandidate(screen) {
  return screen.isPaper
    && screen.relevanceScore >= 55
    && screen.qualityScore >= 45
    && !isPrimaryDeepCandidate(screen);
}

/**
 * A long-running research monitor must not permanently discard every paper
 * that missed a fast-pass score by a few points. These candidates are never
 * recommended automatically; they only receive the slower evidence review
 * that can distinguish a subtle methodological or foundational connection
 * from a genuinely irrelevant record.
 *
 * @param {{isPaper: boolean, relevanceScore: number, qualityScore: number}} screen
 */
export function isContinuityDeepCandidate(screen) {
  return screen.isPaper
    && screen.relevanceScore >= 45
    && screen.qualityScore >= 48
    && !isPrimaryDeepCandidate(screen)
    && !isRescueDeepCandidate(screen);
}

const GUARDED_FALLBACK_PROFILES = {
  applied_mathematics: { minRelevance: 38, minQuality: 45, minCombined: 48 },
  information_theory: { minRelevance: 42, minQuality: 44, minCombined: 50 },
  general_research: { minRelevance: 45, minQuality: 45, minCombined: 52 },
};

/**
 * If an otherwise healthy fast-screen batch produces no deep-review candidate,
 * one or two evidence-ready papers may receive the slower review. Mathematical
 * work gets a little more tolerance for indirect methodological fit because a
 * title often does not repeat the active problem's vocabulary. This is only a
 * review handoff: it never changes the formal recommendation gate.
 *
 * @param {{isPaper: boolean, relevanceScore: number, qualityScore: number}} screen
 * @param {string} profileKey
 */
export function isGuardedFallbackDeepCandidate(screen, profileKey = "general_research") {
  if (!screen?.isPaper || isPrimaryDeepCandidate(screen) || isRescueDeepCandidate(screen) || isContinuityDeepCandidate(screen)) return false;
  const profile = GUARDED_FALLBACK_PROFILES[profileKey] || GUARDED_FALLBACK_PROFILES.general_research;
  return Number(screen.relevanceScore) >= profile.minRelevance
    && Number(screen.qualityScore) >= profile.minQuality
    && deepCandidateScore(screen) >= profile.minCombined;
}

/**
 * @param {{relevanceScore: number, qualityScore: number}} screen
 */
export function deepCandidateScore(screen) {
  return screen.relevanceScore * 0.62 + screen.qualityScore * 0.38;
}

/**
 * Allocate the expensive review budget without allowing a large historical
 * backlog to crowd out papers first discovered in the current scan. Route
 * candidates remain protected, and evidence-ready records win ties so model
 * calls are spent on papers that can actually clear the final evidence gate.
 *
 * @template {{
 *  canonicalId: string,
 *  score: number,
 *  isCurrentDiscovery: boolean,
 *  isRouteOrigin: boolean,
 *  routeKey: string,
 *  directionKey: string,
 *  evidenceReady: boolean,
 *  horizon?: "days" | "months" | "years",
 * }} T
 * @param {T[]} items
 * @param {{limit?: number, freshRatio?: number, routeRatio?: number, backlogRatio?: number, newestTarget?: number, pinnedIds?: Iterable<string>}} [options]
 * @returns {T[]}
 */
export function selectBudgetedDeepReviewCandidates(items, options = {}) {
  const limit = Math.max(0, Math.floor(options.limit ?? 8));
  if (!limit) return [];
  const freshTarget = Math.min(limit, Math.max(1, Math.ceil(limit * (options.freshRatio ?? 0.6))));
  const routeTarget = Math.min(limit, Math.max(1, Math.round(limit * (options.routeRatio ?? 0.25))));
  const backlogTarget = Math.min(limit, Math.max(1, Math.round(limit * (options.backlogRatio ?? 0.15))));
  const newestTarget = Math.min(limit, Math.max(1, Math.round(options.newestTarget ?? Math.min(2, limit * 0.25))));
  const maxBacklog = Math.max(backlogTarget, limit - freshTarget);
  const unique = new Map();
  for (const item of items) {
    const current = unique.get(item.canonicalId);
    if (!current || Number(item.score) > Number(current.score)) unique.set(item.canonicalId, item);
  }
  const ranked = [...unique.values()].sort((left, right) =>
    Number(right.evidenceReady) - Number(left.evidenceReady)
      || Number(right.score) - Number(left.score)
      || left.canonicalId.localeCompare(right.canonicalId));
  const selected = [];
  const selectedIds = new Set();
  const add = (item) => {
    if (!item || selected.length >= limit || selectedIds.has(item.canonicalId)) return false;
    selected.push(item);
    selectedIds.add(item.canonicalId);
    return true;
  };
  const addBalanced = (pool, count, groupKey = (item) => item.directionKey) => {
    const remaining = Math.max(0, count);
    for (const item of selectBalancedByGroup(pool.filter((candidate) => !selectedIds.has(candidate.canonicalId)), groupKey, remaining)) add(item);
  };

  for (const canonicalId of options.pinnedIds || []) add(unique.get(canonicalId));

  // Reserve real review capacity for the newest horizon before older high-citation
  // work can consume every slot. This changes review order, never the final gate.
  addBalanced(ranked.filter((item) => item.horizon === "days" && item.isCurrentDiscovery), newestTarget);

  // Prefer a current-scan route paper when route evidence is otherwise equal;
  // this lets graph exploration improve today's fresh recommendations directly.
  const routeRanked = ranked.filter((item) => item.isRouteOrigin).sort((left, right) =>
    Number(right.isCurrentDiscovery) - Number(left.isCurrentDiscovery)
      || Number(right.evidenceReady) - Number(left.evidenceReady)
      || Number(right.score) - Number(left.score));
  addBalanced(routeRanked, routeTarget, (item) => item.routeKey || item.directionKey);

  const currentCount = () => selected.filter((item) => item.isCurrentDiscovery).length;
  addBalanced(ranked.filter((item) => item.isCurrentDiscovery), freshTarget - currentCount());

  const backlogCount = () => selected.filter((item) => !item.isCurrentDiscovery).length;
  addBalanced(ranked.filter((item) => !item.isCurrentDiscovery), backlogTarget - backlogCount());

  // Fill remaining capacity by quality while preserving the fresh-paper floor.
  // A second unrestricted pass only activates when the fresh pool is too small,
  // so available review capacity is never wasted.
  for (const item of ranked) {
    if (selected.length >= limit) break;
    if (!item.isCurrentDiscovery && backlogCount() >= maxBacklog
      && ranked.some((candidate) => candidate.isCurrentDiscovery && !selectedIds.has(candidate.canonicalId))) continue;
    add(item);
  }
  for (const item of ranked) add(item);
  return selected;
}

/**
 * Build one mutually exclusive, internal-only reason per screened candidate.
 * These counts are calibration evidence; they never weaken the publication
 * gate and are not intended for the researcher-facing interface.
 *
 * @param {{
 *  candidates: Array<{canonicalId: string, evidenceReady: boolean}>,
 *  screens: Array<{canonicalId: string, isPaper: boolean, relevanceScore: number, qualityScore: number}>,
 *  selectedIds: Iterable<string>,
 *  duplicateCount?: number,
 * }} input
 */
export function summarizeDeepSelectionOutcomes(input) {
  const screens = new Map(input.screens.map((screen) => [screen.canonicalId, screen]));
  const selected = new Set(input.selectedIds);
  const counts = {};
  const add = (reason, amount = 1) => {
    if (amount > 0) counts[reason] = (counts[reason] || 0) + amount;
  };
  add("duplicate", Math.max(0, Number(input.duplicateCount) || 0));
  for (const candidate of input.candidates) {
    if (selected.has(candidate.canonicalId)) continue;
    const screen = screens.get(candidate.canonicalId);
    const reason = !screen ? "screening_unavailable"
      : !screen.isPaper ? "not_research_paper"
        : screen.relevanceScore < 45 ? "topic_mismatch"
          : screen.qualityScore < 45 ? "low_quality"
            : !candidate.evidenceReady ? "insufficient_abstract_evidence"
              : !isPrimaryDeepCandidate(screen) && !isRescueDeepCandidate(screen) && !isContinuityDeepCandidate(screen)
                ? "below_review_gate"
                : "review_budget_not_selected";
    add(reason);
  }
  return counts;
}

/**
 * Decide how many additional papers deserve a quality-preserving review wave
 * after evidence checks. The target is a useful daily queue, not a quota: this
 * function only schedules more review and never promotes or lowers the final
 * recommendation threshold.
 *
 * @param {{
 *  published: number,
 *  reviewed: number,
 *  maxReviews: number,
 *  availableCandidates: number,
 *  minTarget?: number,
 *  maxPerWave?: number,
 * }} input
 */
export function formalRecommendationRescueSize(input) {
  const minTarget = Math.max(1, input.minTarget ?? 3);
  if (input.published >= minTarget) return 0;
  const reviewCapacity = Math.max(0, input.maxReviews - input.reviewed);
  const candidateCapacity = Math.max(0, input.availableCandidates);
  const shortfall = minTarget - Math.max(0, input.published);
  return Math.min(
    reviewCapacity,
    candidateCapacity,
    Math.max(1, input.maxPerWave ?? 4),
    Math.max(2, shortfall * 2),
  );
}

/**
 * Rescue waves run only after the full candidate pool already received its
 * metadata-enrichment pass. Candidates that still lack reviewable evidence
 * must remain in the durable queue for a future source refresh instead of
 * bouncing the current run between enrichment and deep review.
 *
 * @template {{canonicalId: string}} T
 * @param {T[]} candidates
 * @param {Iterable<string>} excludedIds
 * @param {(candidate: T) => boolean} [hasReviewableEvidence]
 * @returns {T[]}
 */
export function evidenceReadyRescueCandidates(
  candidates,
  excludedIds,
  hasReviewableEvidence = (candidate) => candidate.evidenceReady === true,
) {
  const excluded = new Set(excludedIds || []);
  return candidates.filter((candidate) =>
    !excluded.has(candidate.canonicalId) && hasReviewableEvidence(candidate));
}
