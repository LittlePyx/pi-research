import {arxivIdFromUrl} from './discovery/arxiv.ts';

export type LibraryGraphNeighbor={canonicalId:string;title:string;authors:string;url:string;year:string;kind:'reference'|'citation';provider:string;paperId?:string;libraryCanonicalId?:string};
export type LibraryGraphResult={items:LibraryGraphNeighbor[];offsets:{references:number;citations:number};errors:string[];limited:boolean};
export type RouteCitationSnapshot = {
  focusId:string;
  libraryPaperId:string|null;
  canQueryLibrary:boolean;
  libraryStatus:string|null;
  libraryRetryAt:number;
  libraryBusy:boolean;
  networkStatus?:string|null;
  checkedAt:string|null;
  items:LibraryGraphNeighbor[];
  capped:boolean;
};
export type RouteCitationPaper = LibraryGraphNeighbor & {routePaperId?:string;inRoute:boolean;sources:string[]};

export function mergeRouteCitations(
  items:LibraryGraphNeighbor[],
  papers:ReadonlyMap<string,{id:string;inRoute:boolean}>,
):RouteCitationPaper[] {
  const unique=new Map<string,RouteCitationPaper>();
  const aliases=new Map(items.filter(item=>item.libraryCanonicalId).map(item=>[item.canonicalId.toLowerCase(),item.libraryCanonicalId!]));
  for(const item of items){
    const canonicalId=aliases.get(item.canonicalId.toLowerCase())||item.canonicalId;
    const id=canonicalId.toLowerCase(),key=item.kind+':'+id;
    const route=papers.get(id)||papers.get(item.canonicalId.toLowerCase()),previous=unique.get(key);
    if(previous){
      if(!previous.sources.includes(item.provider))previous.sources.push(item.provider);
      previous.paperId ||= item.paperId;
      previous.url ||= item.url;
      previous.routePaperId ||= route?.id;
      previous.inRoute ||= Boolean(route?.inRoute);
      continue;
    }
    unique.set(key,{...item,canonicalId,routePaperId:route?.id,inRoute:Boolean(route?.inRoute),sources:[item.provider]});
  }
  return Array.from(unique.values()).sort((a,b)=>Number(b.inRoute)-Number(a.inRoute));
}
export function graphIdentifier(p:{doi:string|null;canonical_id:string;url?:string}) {
  if(p.doi)return `DOI:${p.doi}`;
  const c=p.canonical_id;
  if(c.startsWith('doi:'))return `DOI:${c.slice(4)}`;
  if(c.startsWith('arxiv:'))return `ARXIV:${c.slice(6)}`;
  if(c.startsWith('s2:'))return c.slice(3);
  const arxiv=p.url&&/^https?:\/\/(?:www\.|export\.)?arxiv\.org\//i.test(p.url)?arxivIdFromUrl(p.url):'';
  return arxiv?`ARXIV:${arxiv}`:'';
}
export function citationSourceHref(paper:{url:string;canonicalId:string}) {
  if(/^https?:\/\//i.test(paper.url))return paper.url;
  if(paper.canonicalId.startsWith('doi:'))return 'https://doi.org/'+encodeURI(paper.canonicalId.slice(4));
  if(paper.canonicalId.startsWith('arxiv:'))return 'https://arxiv.org/abs/'+encodeURI(paper.canonicalId.slice(6));
  return '';
}
export function emptyLibraryGraph():LibraryGraphResult {return {items:[],offsets:{references:0,citations:0},errors:[],limited:false};}
export function focusCitationRelations<T extends {sourcePaperId:string;targetPaperId:string}>(edges:T[],focus:string) {
  const direct=edges.filter(e=>e.sourcePaperId===focus||e.targetPaperId===focus);
  const neighbors=new Set(direct.flatMap(e=>[e.sourcePaperId,e.targetPaperId]));neighbors.delete(focus);
  const indirect=edges.filter(e=>!direct.includes(e)&&(neighbors.has(e.sourcePaperId)||neighbors.has(e.targetPaperId)));
  const others=edges.filter(e=>!direct.includes(e)&&!indirect.includes(e));
  return {direct,indirect,others};
}
