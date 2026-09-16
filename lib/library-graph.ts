export type LibraryGraphNeighbor={canonicalId:string;title:string;authors:string;url:string;year:string;kind:'reference'|'citation';provider:string;paperId?:string};
export type LibraryGraphResult={items:LibraryGraphNeighbor[];offsets:{references:number;citations:number};errors:string[];limited:boolean};
export function graphIdentifier(p:{doi:string|null;canonical_id:string}) { if(p.doi)return `DOI:${p.doi}`;const c=p.canonical_id;if(c.startsWith('doi:'))return `DOI:${c.slice(4)}`;if(c.startsWith('arxiv:'))return `ARXIV:${c.slice(6)}`;if(c.startsWith('s2:'))return c.slice(3);return ''; }
export function emptyLibraryGraph():LibraryGraphResult {return {items:[],offsets:{references:0,citations:0},errors:[],limited:false};}
export function focusCitationRelations<T extends {sourcePaperId:string;targetPaperId:string}>(edges:T[],focus:string) {
  const direct=edges.filter(e=>e.sourcePaperId===focus||e.targetPaperId===focus);
  const neighbors=new Set(direct.flatMap(e=>[e.sourcePaperId,e.targetPaperId]));neighbors.delete(focus);
  const indirect=edges.filter(e=>!direct.includes(e)&&(neighbors.has(e.sourcePaperId)||neighbors.has(e.targetPaperId)));
  const others=edges.filter(e=>!direct.includes(e)&&!indirect.includes(e));
  return {direct,indirect,others};
}
