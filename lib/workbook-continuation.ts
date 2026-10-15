import { readWorkspaceLocation, workspaceHash, type WorkspaceLocation } from './workspace-navigation.ts';

export const continuationKey = (user: string, space: string) => `pi-comparison-location-v1:${JSON.stringify([user, space])}`;

/** A bookmark is a location, never a second copy of the comparison or its notes. */
export function comparisonLocation(hash: string, space: string): { location: WorkspaceLocation; workbook: WorkspaceLocation } | null {
  if (!hash.startsWith('#') || hash.length > 8000) return null;
  const location = readWorkspaceLocation(hash);
  if (location.space !== space) return null;
  const workbook = location.view === 'workbook' ? location : location.view === 'paper-detail' && location.from === 'workbook' && location.returnTo ? readWorkspaceLocation(location.returnTo) : null;
  if (!workbook || workbook.view !== 'workbook' || workbook.space !== space || !workbook.workbookId) return null;
  return { location, workbook };
}

export function rememberComparison(user: string, space: string, hash: string) {
  const parsed = comparisonLocation(hash, space);
  if (!parsed) return;
  try { localStorage.setItem(continuationKey(user, space), workspaceHash(parsed.location)); } catch { /* Server-saved comparisons remain available. */ }
}

export function readComparisonLocation(user: string, space: string): string {
  try {
    const hash = localStorage.getItem(continuationKey(user, space)) || '';
    const parsed = comparisonLocation(hash, space);
    return parsed ? workspaceHash(parsed.location) : '';
  } catch { return ''; }
}

export type ComparisonContinuation = { hash: string; titleZh: string; titleEn: string; status: 'draft' | 'verifying' | 'ready' | 'retryable' | 'rejected'; savedRevision: number; sourceCount: number };
export function decodeContinuation(value: unknown): { continuation: ComparisonContinuation | null } {
  const result = value as { continuation?: ComparisonContinuation } | null;
  if (!result || !('continuation' in result)) throw Error('Missing continuation');
  if (result.continuation === null) return { continuation: null };
  const item = result.continuation;
  if (!item || typeof item.hash !== 'string' || typeof item.titleZh !== 'string' || typeof item.titleEn !== 'string' || !['draft', 'verifying', 'ready', 'retryable', 'rejected'].includes(item.status) || !Number.isInteger(item.savedRevision) || item.savedRevision < 0 || !Number.isInteger(item.sourceCount) || item.sourceCount < 0) throw Error('Invalid continuation');
  return { continuation: item };
}
