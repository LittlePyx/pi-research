import type { WorkbookState } from './research-workbook';

export type RouteComparison = {
  id: string; status: Exclude<WorkbookState['status'], 'empty'>; stale: boolean;
  question: string; papers: Array<{ id: string; title: string }>;
  savedRevision: number; savedAt: string | null; decision: string; unresolved: string; observationCount: number;
};
export type RouteOverview = {
  spaceId: string; trackId: string; question: string;
  eligibleCount: number; routeEligibleCount: number;
  comparisons: RouteComparison[]; savedJudgment: RouteComparison | null;
};

/** Collection membership alone never establishes comparison eligibility. */
export function routeNextAction(overview: RouteOverview | null) {
  const latest = overview?.comparisons[0];
  if (latest) return latest.stale ? 'check' : latest.status === 'ready'
    ? latest.savedRevision ? 'saved' : 'record' : latest.status === 'rejected' ? 'check' : 'resume';
  return overview && overview.eligibleCount >= 2 ? 'compare' : 'read';
}
