import {workspaceFetch} from './workspace-request';
import type {WorkspaceSession} from './workspace-identity';

export async function initializeWorkspaceSession(demo: boolean, signal?: AbortSignal): Promise<WorkspaceSession|null> {
  if (demo) return null;
  // Preserve the legacy browser token as a fallback. A server cookie wins over it after account recovery.
  let legacyWorkspaceId: string | undefined;
  try {
    legacyWorkspaceId = localStorage.getItem('pi-anonymous-workspace') || '';
    if (!/^[a-zA-Z0-9-]{20,64}$/.test(legacyWorkspaceId)) {
      legacyWorkspaceId = crypto.randomUUID();
      localStorage.setItem('pi-anonymous-workspace', legacyWorkspaceId);
    }
  } catch { legacyWorkspaceId = undefined; }
  const response = await workspaceFetch('/api/workspace-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'initialize',legacyWorkspaceId}),signal});
  if (!response.ok) throw Error('Workspace access unavailable');
  const session = await response.json() as WorkspaceSession;
  if (!['browser','account','locked'].includes(session.mode)) throw Error('Invalid workspace access response');
  return session;
}
