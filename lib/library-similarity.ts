import type { LibraryGraphNeighbor } from './library-graph';

export type SimilarityPaper = { id:string; canonicalId:string; title:string; authors:string; year:string; url:string; external?:boolean };
export type ProfiledPaper = SimilarityPaper & { links: LibraryGraphNeighbor[] };
export type SimilarityEdge = { from:string; to:string; weight:number; source:string; references?:number; citing?:number; examples?:string[]; explanationZh?:string; explanationEn?:string };
export type SimilarityMap = { origin:SimilarityPaper; papers:SimilarityPaper[]; edges:SimilarityEdge[] };
export type LibrarySimilaritySnapshot = { map:SimilarityMap; scanned:number; limit:number; originHasLinks:boolean };

export function citationProfile(links: LibraryGraphNeighbor[]) {
  const references=new Map<string,string>(),citing=new Map<string,string>();
  for(const item of links) {
    if(!item?.canonicalId||!item.title)continue;
    if(item.kind==='reference')references.set(item.canonicalId.toLowerCase(),item.title);
    if(item.kind==='citation')citing.set(item.canonicalId.toLowerCase(),item.title);
  }
  return {references,citing};
}

export function focusSimilarity(origin:SimilarityPaper,papers:SimilarityPaper[],edges:SimilarityEdge[],limit=12):SimilarityMap {
  const byId=new Map(papers.map(paper=>[paper.id,paper]));
  const distinct=new Map<string,SimilarityEdge>();
  for(const edge of edges){
    if(edge.from===edge.to)continue;
    const key=JSON.stringify([edge.from,edge.to].sort());
    const current=distinct.get(key);
    if(!current||current.weight<edge.weight)distinct.set(key,edge);
  }
  const links=[...distinct.values()];
  const neighbors=links.flatMap(edge=>{
    const other=edge.from===origin.id?edge.to:edge.to===origin.id?edge.from:'';
    return other&&other!==origin.id&&byId.has(other)?[{id:other,weight:edge.weight}]:[];
  }).sort((a,b)=>b.weight-a.weight||a.id.localeCompare(b.id));
  const ids=[...new Set(neighbors.map(item=>item.id))].slice(0,limit);
  const visible=new Set([origin.id,...ids]);
  return {origin,papers:ids.map(id=>byId.get(id)!),edges:links.filter(edge=>visible.has(edge.from)&&visible.has(edge.to))};
}

export function buildCitationSimilarity(seed:ProfiledPaper,candidates:ProfiledPaper[]):SimilarityMap {
  const paperRecords=[seed,...candidates].map(({links,...paper})=>({paper,profile:citationProfile(links)}));
  const edges:SimilarityEdge[]=[];
  for(let i=0;i<paperRecords.length;i++)for(let j=i+1;j<paperRecords.length;j++){
    const {paper:first,profile:a}=paperRecords[i],{paper:second,profile:b}=paperRecords[j];
    const references=[...a.references].filter(([id])=>b.references.has(id));
    const citing=[...a.citing].filter(([id])=>b.citing.has(id));
    const common=references.length+citing.length;
    if(common<2)continue;
    const sizeA=a.references.size+a.citing.size,sizeB=b.references.size+b.citing.size;
    const weight=common/Math.sqrt(sizeA*sizeB);
    edges.push({from:first.id,to:second.id,weight,references:references.length,citing:citing.length,
      examples:[...references,...citing].map(([,title])=>title).slice(0,6),source:'Semantic Scholar'});
  }
  const papers=paperRecords.map(({paper})=>paper);
  return focusSimilarity(papers[0],papers.slice(1),edges);
}

/** Independent groups use links among neighbors. Links to the origin do not merge groups. */
export function similarityGroups(map:SimilarityMap):SimilarityPaper[][]{
  const remaining=new Set(map.papers.map(paper=>paper.id));
  const groups:SimilarityPaper[][]=[];
  for(const paper of map.papers){
    if(!remaining.delete(paper.id))continue;
    const group=new Set([paper.id]);
    for(const id of group){
      for(const edge of map.edges){
        const other=edge.from===id?edge.to:edge.to===id?edge.from:'';
        if(remaining.delete(other))group.add(other);
      }
    }
    groups.push(map.papers.filter(item=>group.has(item.id)));
  }
  return groups;
}
