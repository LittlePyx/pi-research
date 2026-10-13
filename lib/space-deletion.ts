import {accountCookie,anonymousWorkspaceId,platformUser} from './workspace-identity';
const ready=new WeakSet<D1Database>();
export async function spaceDeletionAvailable(db:D1Database){
 if(ready.has(db))return true;
 const found=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='research_space_deletions'").first();
 if(found)ready.add(db);return Boolean(found);
}
/** The same owner boundary applies to HTTP and internally dispatched scheduler requests. */
export async function deletedSpaceRequest(request:Request,db:D1Database){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/')||['/api/spaces','/api/workspace-session'].includes(url.pathname))return false;
 const bound=accountCookie(request),id=anonymousWorkspaceId(request);
 if(!id||(bound&&platformUser(request)?.id!==bound))return false;
 const ids=new Set([...url.searchParams.getAll('spaceId'),...url.searchParams.getAll('space')].map(value=>value.trim()));
 if(!['GET','HEAD'].includes(request.method)){
  const body=await request.clone().json().catch(()=>null) as {spaceId?:unknown}|null;
  if(typeof body?.spaceId==='string')ids.add(body.spaceId.trim());
 }
 if(!ids.size||!await spaceDeletionAvailable(db))return false;
 for(const spaceId of ids)if(await db.prepare('SELECT s.id FROM research_spaces s JOIN research_space_deletions d ON d.space_id=s.id WHERE s.id=? AND s.owner_user_id=?').bind(spaceId,'anonymous:'+id).first())return true;
 return false;
}
