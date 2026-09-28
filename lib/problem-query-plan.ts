export const PROBLEM_QUERY_POLICY = 'problem-horizons-v1';
export type ProblemQueries = { problemId: string; trackId: string; days: string; months: string; years: string };
const horizons = ['days', 'months', 'years'] as const;

export function parseProblemQueries(value: unknown, expected?: { id: string; track_id: string }): ProblemQueries | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.problemId !== 'string' || !row.problemId || typeof row.trackId !== 'string' || !row.trackId) return undefined;
  if (expected && (row.problemId !== expected.id || row.trackId !== expected.track_id)) return undefined;
  const query = (key: string) => typeof row[key] === 'string' ? (row[key] as string).trim().replace(/\s+/g, ' ') : '';
  if (horizons.some(h => query(h).length < 8 || query(h).length > 320 || !/^[\x20-\x7e]+$/.test(query(h)))) return undefined;
  return { problemId: row.problemId, trackId: row.trackId, days: query('days'), months: query('months'), years: query('years') };
}

export function protectProblemQueries(queries: Record<'days'|'months'|'years', string[]>, problem: ProblemQueries | undefined, limit: number) {
  if (!problem) return queries;
  return Object.fromEntries(horizons.map(h => [h, [problem[h], ...queries[h].filter(q => q.toLowerCase() !== problem[h].toLowerCase())].slice(0, limit)])) as typeof queries;
}

export function problemSourceKey(problemId: string, horizon: string) {
  return `crossref:problem:${problemId}:${horizon}`;
}
