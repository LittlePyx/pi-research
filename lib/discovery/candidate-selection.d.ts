export type CandidateScreen = {
  isPaper: boolean;
  relevanceScore: number;
  qualityScore: number;
};

export function selectBalancedByGroup<T>(rankedItems: T[], groupKey: (item: T) => string, limit: number): T[];
export function isPrimaryDeepCandidate(screen: CandidateScreen): boolean;
export function isRescueDeepCandidate(screen: CandidateScreen): boolean;
export function isContinuityDeepCandidate(screen: CandidateScreen): boolean;
export function deepCandidateScore(screen: Pick<CandidateScreen, "relevanceScore" | "qualityScore">): number;
