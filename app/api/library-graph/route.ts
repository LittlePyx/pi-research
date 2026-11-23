import {ensureSchema,getApiUser,getDatabase} from '../../../db/repository';
import {refreshLibraryGraph} from '../../../lib/library-graph-refresh';
import {emptyLibraryGraph,graphIdentifier,type LibraryGraphResult,type LibraryGraphNeighbor,type RouteCitationSnapshot} from '../../../lib/library-graph';
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
  return {status:row?.status||'pending',checkedAt:row?.checked_at,retryAt:row?.retry_at||0,busy:(row?.lease_until||0)>Date.now(),...result,items:await linkLibraryPapers(db,spaceId,result.items)};
}

async function linkLibraryPapers(db:D1Database,spaceId:string,items:LibraryGraphNeighbor[]){
  if(!items.length)return items;
  const keys=JSON.stringify([...new Set(items.map(item=>item.canonicalId.toLowerCase()))]);
  const links=await db.prepare(`SELECT id,canonical_id,doi FROM monitored_papers WHERE space_id=? AND (
    lower(canonical_id) IN (SELECT value FROM json_each(?)) OR 'doi:'||lower(doi) IN (SELECT value FROM json_each(?))) ORDER BY id`)
    .bind(spaceId,keys,keys).all<{id:string;canonical_id:string;doi:string|null}>();
  const byId=new Map(links.results.map(paper=>[paper.canonical_id.toLowerCase(),paper]));
  for(const paper of links.results){
    const doi=paper.doi?'doi:'+paper.doi.toLowerCase():'';
    if(doi&&!byId.has(doi))byId.set(doi,paper);
  }
  return items.map(item=>{
    const match=byId.get(item.canonicalId.toLowerCase());
    return match?{...item,paperId:match.id,libraryCanonicalId:match.canonical_id}:item;
  });
}

async function routeCitations(request:Request,spaceId:string,routePaperId:string) {
  const user=getApiUser(request);
  if(!user)return Response.json({error:'Paper not found'},{status:404});
  const db=getDatabase();await ensureSchema(db);
  const seed=await db.prepare(`SELECT rp.id,rp.canonical_id,rp.doi FROM research_track_papers rp
    JOIN research_spaces s ON s.id=rp.space_id
    WHERE rp.id=? AND rp.space_id=? AND s.owner_user_id=? AND rp.curation_status='active'`)
    .bind(routePaperId,spaceId,user.userId).first<{id:string;canonical_id:string;doi:string|null}>();
  if(!seed)return Response.json({error:'Paper not found'},{status:404});
  const [library,edges,checked]=await Promise.all([
    db.prepare(`SELECT p.id,p.canonical_id,p.doi,p.title,p.authors,p.published_at,p.url FROM monitored_papers p
      WHERE p.space_id=? AND (lower(p.canonical_id)=lower(?) OR (?<>'' AND lower(p.doi)=lower(?)))
      ORDER BY (lower(p.canonical_id)=lower(?)) DESC,p.id LIMIT 1`)
      .bind(spaceId,seed.canonical_id,seed.doi||'',seed.doi||'',seed.canonical_id).first<LibraryGraphPaper>(),
    db.prepare(`SELECT c.canonical_id AS canonicalId,c.title,c.authors,c.url,substr(c.published_at,1,4) AS year,e.kind,e.evidence_source AS source
      FROM research_network_candidate_edges e
      JOIN research_track_papers rp ON rp.id=e.seed_paper_id AND rp.space_id=e.space_id AND rp.curation_status='active'
      JOIN research_network_candidates c ON c.id=e.candidate_id AND c.space_id=e.space_id
      WHERE e.space_id=? AND rp.canonical_id=? AND ((e.kind='reference' AND e.direction='seed_cites_candidate')
        OR (e.kind='citation' AND e.direction='candidate_cites_seed'))
        AND e.evidence_source IN ('openalex','semantic-scholar')
      GROUP BY c.id,e.kind,e.evidence_source ORDER BY MAX(e.last_seen_at) DESC,c.id LIMIT 401`)
      .bind(spaceId,seed.canonical_id).all<LibraryGraphNeighbor&{source:string}>(),
    db.prepare(`SELECT n.last_expanded_at AS checkedAt,n.status
      FROM research_network_seed_expansion_states n JOIN research_track_papers rp ON rp.id=n.seed_paper_id AND rp.space_id=n.space_id
      WHERE n.space_id=? AND rp.canonical_id=? ORDER BY n.last_expanded_at DESC LIMIT 1`).bind(spaceId,seed.canonical_id).first<{checkedAt:string|null;status:string}>(),
  ]);
  const stored=library?await projection(db,spaceId,library.id):null;
  const found=edges.results.slice(0,400).map(({source,...item})=>({...item,provider:source==='openalex'?'OpenAlex':'Semantic Scholar'}));
  const result:RouteCitationSnapshot={
    focusId:seed.id,libraryPaperId:library?.id||null,canQueryLibrary:Boolean(library&&graphIdentifier(library)),
    libraryStatus:stored?.status||null,libraryRetryAt:stored?.retryAt||0,libraryBusy:Boolean(stored?.busy),
    checkedAt:stored?.checkedAt||checked?.checkedAt||null,networkStatus:checked?.status||null,
    items:[...(stored?.items||[]),...await linkLibraryPapers(db,spaceId,found)],
    capped:Boolean(stored?.limited||edges.results.length>400),
  };
  return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
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
  const routePaper=u.searchParams.get('routePaperId');
  if(routePaper)return routeCitations(request,s,routePaper);
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
