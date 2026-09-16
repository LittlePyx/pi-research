import {ensureSchema,getApiUser,getDatabase} from '../../../db/repository';
import {fetchSemanticScholar} from '../../../lib/semantic-scholar';
import {emptyLibraryGraph,graphIdentifier,type LibraryGraphResult} from '../../../lib/library-graph';
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
  const {db,paper}=c,now=Date.now(),token=crypto.randomUUID();
  await db.prepare("INSERT OR IGNORE INTO library_graph_checks(paper_id,space_id,result_json) VALUES (?,?,?)").bind(paper.id,b.spaceId,JSON.stringify(emptyLibraryGraph())).run();
  const lock=await db.prepare('UPDATE library_graph_checks SET lock_token=?,lease_until=? WHERE paper_id=? AND space_id=? AND lease_until<=? AND retry_at<=?').bind(token,now+65000,paper.id,b.spaceId,now,now).run();
  if(!lock.meta.changes)return Response.json({...await projection(db,b.spaceId,paper.id),focusTitle:paper.title},{status:202});
  const saved=await projection(db,b.spaceId,paper.id);const result:LibraryGraphResult={items:saved.items,offsets:saved.offsets,errors:[],limited:saved.limited};
  const identifier=graphIdentifier(paper);let success=0;
  if(identifier&&!result.limited) {
    if(result.offsets.references<0&&result.offsets.citations<0)result.offsets={references:0,citations:0};
    for(const kind of ['references','citations'] as const) {
      if(result.offsets[kind]<0)continue;
      const url=new URL(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(identifier)}/${kind}`);
      url.searchParams.set('fields','paperId,externalIds,title,authors,url,year');url.searchParams.set('limit','50');url.searchParams.set('offset',String(result.offsets[kind]));
      try {
        const r=await fetchSemanticScholar(url,{signal:AbortSignal.timeout(20000)},{database:db,spaceId:b.spaceId,scopeKey:`library-graph:${paper.id}`,feature:'research-map',featureDailyLimit:48});
        if(!r.ok)throw new Error(String(r.status));
        const data=await r.json() as {next?:number;data?:Array<{citedPaper?:Record<string,unknown>;citingPaper?:Record<string,unknown>}>};
        if(!Array.isArray(data.data))throw new Error('invalid_response');
        if(result.offsets[kind]===0)result.items=result.items.filter(item=>item.kind!==(kind==='references'?'reference':'citation'));
        for(const relation of data.data) {
          const p=kind==='references'?relation.citedPaper:relation.citingPaper;if(!p||typeof p.title!=='string'||!p.title.trim())continue;
          const ids=p.externalIds as {DOI?:string;ArXiv?:string}|undefined;
          const canonicalId=ids?.DOI?`doi:${ids.DOI.toLowerCase()}`:ids?.ArXiv?`arxiv:${ids.ArXiv.toLowerCase()}`:typeof p.paperId==='string'?`s2:${p.paperId}`:'';
          if(!canonicalId||canonicalId.toLowerCase()===paper.canonical_id.toLowerCase())continue;
          const relationKind=kind==='references'?'reference':'citation';
          if(result.items.some(i=>i.canonicalId===canonicalId&&i.kind===relationKind))continue;
          result.items.push({canonicalId,title:p.title.slice(0,1000),authors:Array.isArray(p.authors)?p.authors.map(a=>String(a.name||'')).join(', ').slice(0,1000):'',url:ids?.DOI?`https://doi.org/${ids.DOI}`:typeof p.url==='string'&&/^https?:\/\//.test(p.url)?p.url:'',year:String(p.year||''),kind:relationKind,provider:'Semantic Scholar'});
        }
        result.offsets[kind]=typeof data.next==='number'&&data.next>result.offsets[kind]?data.next:-1;success++;
      }catch{result.errors.push(kind);}
    }
  }
  result.limited=result.items.length>=400;
  const status=!identifier?'missing_id':result.errors.length?(result.items.length?'partial':'error'):result.limited||Object.values(result.offsets).some(n=>n>=0)?'partial':result.items.length?'ready':'empty';
  await db.prepare('UPDATE library_graph_checks SET status=?,result_json=?,checked_at=CASE WHEN ? > 0 THEN ? ELSE checked_at END,retry_at=?,lease_until=0,lock_token=NULL WHERE paper_id=? AND lock_token=?').bind(status,JSON.stringify(result),success,new Date().toISOString(),Date.now()+(result.errors.length?300000:60000),paper.id,token).run();
  return Response.json({...await projection(db,b.spaceId,paper.id),focusTitle:paper.title});
}
