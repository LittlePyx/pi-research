export type WorkspaceSession = {
  mode: 'browser' | 'account' | 'locked';
  signedIn: boolean;
  accountLabel: string | null;
  linked: boolean;
  differentWorkspace: boolean;
  spaceCount: number;
  accountAvailable: boolean;
  canReturnToBrowser?: boolean;
};

export function cookieValue(request: Request, name: string) {
  return (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
}
export function anonymousWorkspaceId(request: Request) {
  const id = cookieValue(request, 'pi_anonymous_workspace');
  return /^[a-zA-Z0-9-]{20,64}$/.test(id) ? id : null;
}
/** These headers are supplied by the existing Sites sign-in boundary. */
export function platformUser(request: Request) {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (!id || !email || id.length > 256) return null;
  let name = request.headers.get('oai-authenticated-user-full-name');
  if (name && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = decodeURIComponent(name); } catch { name = null; }
  }
  return {id, label: name || email};
}
export function accountCookie(request: Request) {
  const value = cookieValue(request, 'pi_workspace_account');
  try { return decodeURIComponent(value); } catch { return 'invalid'; }
}
export function workspaceCookies(request: Request, id: string, accountId?: string, clearAccount=false) {
  const suffix = `; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
  const headers = new Headers({'Cache-Control': 'private, no-store'});
  headers.append('Set-Cookie', `pi_anonymous_workspace=${id}${suffix}`);
  if (accountId) headers.append('Set-Cookie', `pi_workspace_account=${encodeURIComponent(accountId)}${suffix}`);
  else if(clearAccount) headers.append('Set-Cookie', `pi_workspace_account=${suffix.replace('Max-Age=31536000','Max-Age=0')}`);
  return headers;
}
