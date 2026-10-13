import {ensureSchema, getDatabase, getApiUser} from '../../../db/repository';
import {anonymousWorkspaceId, accountCookie, platformUser, workspaceCookies} from '../../../lib/workspace-identity';
import type {WorkspaceSession} from '../../../lib/workspace-identity';

const privateHeaders = {'Cache-Control': 'private, no-store'};
async function context(request: Request) {
  const db = getDatabase(); await ensureSchema(db);
  const account = platformUser(request);
  const available = Boolean(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_accounts'").first());
  const linked = available && account ? await db.prepare('SELECT owner_user_id FROM workspace_accounts WHERE account_id=?').bind(account.id).first<{owner_user_id:string}>() : null;
  return {db, account, available, linked};
}
async function state(request: Request, ctx: Awaited<ReturnType<typeof context>>, id: string | null, restored=false): Promise<WorkspaceSession> {
  const locked = Boolean(!restored && accountCookie(request) && accountCookie(request) !== ctx.account?.id);
  const owner = id ? 'anonymous:' + id : '';
  const count = !locked && owner ? await ctx.db.prepare('SELECT COUNT(*) AS n FROM research_spaces WHERE owner_user_id=?').bind(owner).first<{n:number}>() : null;
  return {mode: locked ? 'locked' : ctx.linked?.owner_user_id === owner ? 'account' : 'browser', signedIn: Boolean(ctx.account), accountLabel: ctx.account?.label || null, linked: Boolean(ctx.linked), differentWorkspace: Boolean(!locked && ctx.linked && ctx.linked.owner_user_id !== owner), spaceCount: count?.n || 0, accountAvailable: ctx.available};
}
export async function GET(request: Request) {
  try { const ctx = await context(request); return Response.json(await state(request,ctx,anonymousWorkspaceId(request)),{headers:privateHeaders}); }
  catch { return Response.json({error:'Workspace access unavailable'},{status:503,headers:privateHeaders}); }
}
async function browserAccess(ctx:Awaited<ReturnType<typeof context>>,legacy:string|null,current:string,next:WorkspaceSession) {
  if(!legacy||legacy===current)return next;
  const owner='anonymous:'+legacy;
  const row=ctx.available?await ctx.db.prepare('SELECT account_id FROM workspace_accounts WHERE owner_user_id=?').bind(owner).first<{account_id:string}>():null;
  const exists=await ctx.db.prepare('SELECT id FROM research_spaces WHERE owner_user_id=? LIMIT 1').bind(owner).first();
  return {...next,canReturnToBrowser:Boolean(exists&&(!row||row.account_id===ctx.account?.id))};
}
export async function POST(request: Request) {
  // JSON + same-origin prevents a third-party form from linking or switching an identity.
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || origin && origin !== new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error:'Same-origin JSON required'},{status:403,headers:privateHeaders});
  try {
    const body = await request.json() as {action?:string;legacyWorkspaceId?:string};
    if (!['initialize','connect','restore','browser'].includes(body.action || '')) return Response.json({error:'Unknown action'},{status:400,headers:privateHeaders});
    const ctx = await context(request), current = anonymousWorkspaceId(request);
    const legacy = typeof body.legacyWorkspaceId === 'string' && /^[a-zA-Z0-9-]{20,64}$/.test(body.legacyWorkspaceId) ? body.legacyWorkspaceId : null;
    if (body.action === 'initialize') {
      if (accountCookie(request) && accountCookie(request) !== ctx.account?.id) return Response.json(await browserAccess(ctx,legacy,current||'',await state(request,ctx,current)),{headers:privateHeaders});
      let id = current || legacy || crypto.randomUUID();
      let next = await state(request,ctx,id);
      // A fresh browser can recover a previously connected workspace. Existing local spaces never switch silently.
      if (ctx.linked && (!next.spaceCount || ctx.linked.owner_user_id === 'anonymous:' + id)) {
        id = ctx.linked.owner_user_id.slice('anonymous:'.length);
        next = {...await state(request,ctx,id),mode:'account'};
        return Response.json(await browserAccess(ctx,legacy,id,next),{headers:workspaceCookies(request,id,ctx.account!.id)});
      }
      return Response.json(next,{headers:workspaceCookies(request,id)});
    }
    if(body.action==='browser'){
      if(!legacy)return Response.json({error:'Original browser identity unavailable'},{status:404,headers:privateHeaders});
      const owner='anonymous:'+legacy;
      const bound=ctx.available?await ctx.db.prepare('SELECT account_id FROM workspace_accounts WHERE owner_user_id=?').bind(owner).first<{account_id:string}>():null;
      if(bound&&bound.account_id!==ctx.account?.id)return Response.json({error:'Sign in with the original connected account'},{status:401,headers:privateHeaders});
      if(!await ctx.db.prepare('SELECT id FROM research_spaces WHERE owner_user_id=? LIMIT 1').bind(owner).first())return Response.json({error:'Original browser workspace not found'},{status:404,headers:privateHeaders});
      return Response.json(await state(request,ctx,legacy,true),{headers:workspaceCookies(request,legacy,bound?.account_id,true)});
    }
    if (!ctx.account) return Response.json({error:'Sign in with ChatGPT first'},{status:401,headers:privateHeaders});
    if (!ctx.available) return Response.json({error:'Account connection unavailable'},{status:503,headers:privateHeaders});
    if (body.action === 'connect') {
      const user = getApiUser(request);
      if (!user || !current) return Response.json({error:'Current workspace unavailable'},{status:401,headers:privateHeaders});
      // No data transfer, overwrite or merge: a stable account points at the existing owner namespace.
      await ctx.db.prepare('INSERT INTO workspace_accounts(account_id,owner_user_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(ctx.account.id,user.userId).run();
      const row = await ctx.db.prepare('SELECT owner_user_id FROM workspace_accounts WHERE account_id=?').bind(ctx.account.id).first<{owner_user_id:string}>();
      if (row?.owner_user_id !== user.userId) return Response.json({error:'This account or workspace is already connected elsewhere'},{status:409,headers:privateHeaders});
      ctx.linked = row;
      return Response.json({...await state(request,ctx,current),mode:'account'},{headers:workspaceCookies(request,current,ctx.account.id)});
    }
    if (!ctx.linked) return Response.json({error:'No connected workspace found. Connect from the original browser first.'},{status:404,headers:privateHeaders});
    const id = ctx.linked.owner_user_id.slice('anonymous:'.length);
    return Response.json({...await state(request,ctx,id,true),mode:'account'},{headers:workspaceCookies(request,id,ctx.account.id)});
  } catch { return Response.json({error:'Workspace access could not be updated; existing data is preserved'},{status:503,headers:privateHeaders}); }
}
