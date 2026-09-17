import {ensureSchema,getApiUser,getDatabase} from '../../../db/repository';
import {refreshLibraryGraph} from '../../../lib/library-graph-refresh';
import {emptyLibraryGraph,type LibraryGraphResult} from '../../../lib/library-graph';
async function context(request:Request,spaceId:string,paperId:string) {
  const user=getApiUser(request);if(!user)return null;const db=getDatabase();await ensureSchema(db);
  const paper=await db.prepare(`SELECT p.id,p.canonical_id,p.doi,p.title FROM monitored_papers p JOIN research_spaces s ON s.id=p.space_id WHERE p.id=? AND s.id=? AND s.owner_user_id=?`).bind(paperId,spaceId,user.userId).first<{id:string;canonical_id:string;doi:string|null;title:string}>();
  return paper?{db,paper}:null;
}
async function projection(db:D1Database,spaceId:string,paperId:string) {
  const row=await db.prepare('SELECT status,result_json,checked_at,retry_at,lease_until FROM library_graph_checks WHERE paper_id=? AND space_id=?').bind(paperId,spaceId).first<{status:string;result_json:string;checked_at:string|null;retry_at:number;lease_until:number}>();
  const result:LibraryGraphResult=row?JSON.parse(row.result_json):emptyLibraryGraph();
  const links=await db.prepare(`SELECT id,canonical_id FROM monitored_papers WHERE space_id=? AND lower(canonical_id) IN (SELECT lower(value) FROM json_each(?))`).bind(spaceId,JSON.stringify(result.items.map(i=>i.canonicalId))).all<{id:string;canonical_id:string}>();
  const ids=new Map(links.results.map(p=>[p.canonical_id.toLowerCase(),p.id]));
  return {status:row?.status||'pending',checkedAt:row?.checked_at,retryAt:row?.retry_at||0,busy:(row?.lease_until||0)>Date.now(),...result,items:result.items.map(i=>({...i,paperId:ids.get(i.canonicalId.toLowerCase())}))};
}
export async function GET(request:Request) {const u=new URL(request.url),s=u.searchParams.get('spaceId')||'',p=u.searchParams.get('paperId')||'';const c=await context(request,s,p);if(!c)return Response.json({error:'Paper not found'},{status:404});return Response.json({...await projection(c.db,s,p),focusTitle:c.paper.title},{headers:{'Cache-Control':'private, no-store'}});}
export async function POST(request:Request) {
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origin mismatch'},{status:403});
  const raw=await request.json().catch(()=>({})) as Record<string,unknown>; const b={spaceId:String(raw.spaceId||''),trackId:String(raw.trackId||''),paperId:String(raw.paperId||''),status:String(raw.status||''),category:String(raw.category||''),action:String(raw.action||''),email:String(raw.email||''),sendTime:String(raw.sendTime||'10:00'),locale:String(raw.locale||'zh'),code:String(raw.code||''),enabled:raw.enabled===true};const c=await context(request,b.spaceId,b.paperId);if(!c)return Response.json({error:'Paper not found'},{status:404});
  const result=await refreshLibraryGraph(c.db,b.spaceId,c.paper,b.action==='refresh');
  return Response.json({...await projection(c.db,b.spaceId,c.paper.id),focusTitle:c.paper.title,updated:result.updated===true},{status:result.claimed?200:202});
}
