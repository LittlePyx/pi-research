import {ensureSchema,getApiUser,getDatabase} from '../../../db/repository';
import {refreshLibraryGraph} from '../../../lib/library-graph-refresh';
import {emptyLibraryGraph,type LibraryGraphResult} from '../../../lib/library-graph';
import {buildCitationSimilarity,citationProfile,type ProfiledPaper,type LibrarySimilaritySnapshot} from '../../../lib/library-similarity';

type LibraryGraphPaper={id:string;canonical_id:string;doi:string|null;title:string;authors:string;published_at:string|null;url:string};
async function context(request:Request,spaceId:string,paperId:string) {
  const user=getApiUser(request);if(!user)return null;const db=getDatabase();await ensureSchema(db);
  const paper=await db.prepare(`SELECT p.id,p.canonical_id,p.doi,p.title,p.authors,p.published_at,p.url FROM monitored_papers p JOIN research_spaces s ON s.id=p.space_id WHERE p.id=? AND s.id=? AND s.owner_user_id=?`).bind(paperId,spaceId,user.userId).first<LibraryGraphPaper>();
  return paper?{db,paper}:null;
}
async function projection(db:D1Database,spaceId:string,paperId:string) {
  const row=await db.prepare('SELECT status,result_json,checked_at,retry_at,lease_until FROM library_graph_checks WHERE paper_id=? AND space_id=?').bind(paperId,spaceId).first<{status:string;result_json:string;checked_at:string|null;retry_at:number;lease_until:number}>();
  const result:LibraryGraphResult=row?JSON.parse(row.result_json):emptyLibraryGraph();
  const links=await db.prepare(`SELECT id,canonical_id FROM monitored_papers WHERE space_id=? AND lower(canonical_id) IN (SELECT lower(value) FROM json_each(?))`).bind(spaceId,JSON.stringify(result.items.map(i=>i.canonicalId))).all<{id:string;canonical_id:string}>();
  const ids=new Map(links.results.map(p=>[p.canonical_id.toLowerCase(),p.id]));
  return {status:row?.status||'pending',checkedAt:row?.checked_at,retryAt:row?.retry_at||0,busy:(row?.lease_until||0)>Date.now(),...result,items:result.items.map(i=>({...i,paperId:ids.get(i.canonicalId.toLowerCase())}))};
}
const similarityScanLimit=240;
const cachedPaper=(paper:LibraryGraphPaper,links:ProfiledPaper['links']):ProfiledPaper=>({id:paper.id,canonicalId:paper.canonical_id,title:paper.title,authors:paper.authors,year:paper.published_at?.slice(0,4)||'',url:paper.url,links});
const savedLinks=(value:string|undefined):ProfiledPaper['links']=>{
  try{const result=JSON.parse(value||'{}');return Array.isArray(result.items)?result.items:[];}catch{return [];}
};

async function similarity(db:D1Database,spaceId:string,paper:LibraryGraphPaper):Promise<LibrarySimilaritySnapshot>{
  const saved=await db.prepare('SELECT result_json FROM library_graph_checks WHERE space_id=? AND paper_id=?').bind(spaceId,paper.id).first<{result_json:string}>();
  const origin=cachedPaper(paper,savedLinks(saved?.result_json));
  const profile=citationProfile(origin.links);
  const originHasLinks=Boolean(profile.references.size||profile.citing.size);
  if(!originHasLinks)return {map:buildCitationSimilarity(origin,[]),scanned:0,limit:similarityScanLimit,originHasLinks};
  const recent=`SELECT paper_id,result_json FROM library_graph_checks
    WHERE space_id=? AND paper_id<>? AND checked_at IS NOT NULL AND json_valid(result_json)
    ORDER BY checked_at DESC,paper_id LIMIT ?`;
  const scope=[spaceId,paper.id,similarityScanLimit];
  const [count,rows]=await Promise.all([
    db.prepare(`SELECT count(*) n FROM (${recent})`).bind(...scope).first<{n:number}>(),
    db.prepare(`WITH recent AS (${recent}), overlaps AS (
      SELECT r.paper_id,COUNT(DISTINCT (j.value->>'$.kind') || ':' || lower(j.value->>'$.canonicalId')) AS shared
      FROM recent r JOIN json_each(r.result_json,'$.items') j
      WHERE ((j.value->>'$.kind')='reference' AND lower(j.value->>'$.canonicalId') IN (SELECT value FROM json_each(?)))
         OR ((j.value->>'$.kind')='citation' AND lower(j.value->>'$.canonicalId') IN (SELECT value FROM json_each(?)))
      GROUP BY r.paper_id HAVING shared>=2 ORDER BY shared DESC,r.paper_id LIMIT 24
    ) SELECT p.id,p.canonical_id,p.doi,p.title,p.authors,p.published_at,p.url,r.result_json
      FROM overlaps m JOIN recent r ON r.paper_id=m.paper_id JOIN monitored_papers p ON p.id=m.paper_id AND p.space_id=?`)
      .bind(...scope,JSON.stringify([...profile.references.keys()]),JSON.stringify([...profile.citing.keys()]),spaceId).all<LibraryGraphPaper&{result_json:string}>(),
  ]);
  return {map:buildCitationSimilarity(origin,rows.results.map(row=>cachedPaper(row,savedLinks(row.result_json)))),scanned:count?.n||0,limit:similarityScanLimit,originHasLinks};
}

export async function GET(request:Request) {
  const u=new URL(request.url),s=u.searchParams.get('spaceId')||'',p=u.searchParams.get('paperId')||'';
  const c=await context(request,s,p);
  if(!c)return Response.json({error:'Paper not found'},{status:404});
  const headers={'Cache-Control':'private, no-store'};
  if(u.searchParams.get('mode')==='similarity')return Response.json(await similarity(c.db,s,c.paper),{headers});
  return Response.json({...await projection(c.db,s,p),focusTitle:c.paper.title,focusCanonicalId:c.paper.canonical_id},{headers});
}
export async function POST(request:Request) {
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origin mismatch'},{status:403});
  const raw=await request.json().catch(()=>({})) as Record<string,unknown>; const b={spaceId:String(raw.spaceId||''),trackId:String(raw.trackId||''),paperId:String(raw.paperId||''),status:String(raw.status||''),category:String(raw.category||''),action:String(raw.action||''),email:String(raw.email||''),sendTime:String(raw.sendTime||'10:00'),locale:String(raw.locale||'zh'),code:String(raw.code||''),enabled:raw.enabled===true};const c=await context(request,b.spaceId,b.paperId);if(!c)return Response.json({error:'Paper not found'},{status:404});
  const result=await refreshLibraryGraph(c.db,b.spaceId,c.paper,b.action==='refresh');
  return Response.json({...await projection(c.db,b.spaceId,c.paper.id),focusTitle:c.paper.title,focusCanonicalId:c.paper.canonical_id,updated:result.updated===true},{status:result.claimed?200:202});
}
