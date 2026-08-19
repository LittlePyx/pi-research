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

/**
 * @param {{relevanceScore: number, qualityScore: number}} screen
 */
export function deepCandidateScore(screen) {
  return screen.relevanceScore * 0.62 + screen.qualityScore * 0.38;
}
