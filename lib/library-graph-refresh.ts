import {fetchSemanticScholar} from './semantic-scholar';
import {emptyLibraryGraph,graphIdentifier,type LibraryGraphResult} from './library-graph';
export async function refreshLibraryGraph(db:D1Database,spaceId:string,paper:{id:string;canonical_id:string;doi:string|null;title:string},refreshLimited=false) {
  const now=Date.now(),token=crypto.randomUUID();
  await db.prepare("INSERT OR IGNORE INTO library_graph_checks(paper_id,space_id,result_json) VALUES (?,?,?)").bind(paper.id,spaceId,JSON.stringify(emptyLibraryGraph())).run();
  const lock=await db.prepare('UPDATE library_graph_checks SET lock_token=?,lease_until=? WHERE paper_id=? AND space_id=? AND lease_until<=? AND retry_at<=?').bind(token,now+65000,paper.id,spaceId,now,now).run();
  if(!lock.meta.changes)return {claimed:false,status:'busy'};
  const row=await db.prepare('SELECT result_json FROM library_graph_checks WHERE paper_id=? AND space_id=?').bind(paper.id,spaceId).first<{result_json:string}>(); const saved:LibraryGraphResult=JSON.parse(row!.result_json);const result:LibraryGraphResult={items:saved.items,offsets:saved.offsets,errors:[],limited:saved.limited};
  const identifier=graphIdentifier(paper);let success=0;
  if(result.limited&&refreshLimited){result.offsets={references:0,citations:0};result.limited=false;}
  if(identifier&&!result.limited) {
    if(result.offsets.references<0&&result.offsets.citations<0)result.offsets={references:0,citations:0};
    for(const kind of ['references','citations'] as const) {
      if(result.offsets[kind]<0)continue;
      const url=new URL(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(identifier)}/${kind}`);
      url.searchParams.set('fields','paperId,externalIds,title,authors,url,year');url.searchParams.set('limit','50');url.searchParams.set('offset',String(result.offsets[kind]));
      try {
        const r=await fetchSemanticScholar(url,{signal:AbortSignal.timeout(20000)},{database:db,spaceId:spaceId,scopeKey:`library-graph:${paper.id}`,feature:'research-map',featureDailyLimit:48,maxRetries:0,maxInlineWaitMs:2000});
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
          if(result.items.length<400)result.items.push({canonicalId,title:p.title.slice(0,1000),authors:Array.isArray(p.authors)?p.authors.map(a=>String(a.name||'')).join(', ').slice(0,1000):'',url:ids?.DOI?`https://doi.org/${ids.DOI}`:typeof p.url==='string'&&/^https?:\/\//.test(p.url)?p.url:'',year:String(p.year||''),kind:relationKind,provider:'Semantic Scholar'});
        }
        result.offsets[kind]=typeof data.next==='number'&&data.next>result.offsets[kind]?data.next:-1;success++;
      }catch{result.errors.push(kind);}
    }
  }
  result.limited=result.items.length>=400;
  const status=!identifier?'missing_id':result.errors.length?(result.items.length?'partial':'error'):result.limited||Object.values(result.offsets).some(n=>n>=0)?'partial':result.items.length?'ready':'empty';
  const savedResult=await db.prepare('UPDATE library_graph_checks SET status=?,result_json=?,checked_at=CASE WHEN ? > 0 THEN ? ELSE checked_at END,retry_at=?,auto_next_at=?,lease_until=0,lock_token=NULL WHERE paper_id=? AND lock_token=?').bind(status,JSON.stringify(result),success,new Date().toISOString(),Date.now()+(result.errors.length?300000:60000),Date.now()+(result.errors.length?3600000:status==='partial'&&!result.limited?600000:604800000),paper.id,token).run();
  return {claimed:true,status:savedResult.meta.changes?status:'stale',relations:result.items.length,updated:!!savedResult.meta.changes&&success>0};
}
