import type {WorkbookContent,WorkbookSource} from './research-workbook';

export function workbookEvidenceSelection(content:WorkbookContent|null|undefined,sources:WorkbookSource[],focus:string){
  if(!content)return null;
  for(const [index,dimension] of content.dimensions.entries()){
    const cell=dimension.cells.find(cell=>`${dimension.id}:${cell.paperId}`===focus);
    const source=sources.find(source=>source.id===cell?.paperId);
    if(cell&&source)return {dimension,cell,source,id:focus,index,total:content.dimensions.length};
  }
  return null;
}

export const inspectorOriginKey=(user:string,space:string,track:string,workbook:string)=>`pi-workbook-inspector-v1:${JSON.stringify([user,space,track,workbook])}`;
export function rememberInspectorOrigin(key:string,id:string,anchor:string){
  try{sessionStorage.setItem(key,JSON.stringify({id,anchor}));}catch{/* Focus still returns to the mounted trigger. */}
}
export function readInspectorOrigin(key:string):{id:string;anchor:string}|null{
  try{const value=JSON.parse(sessionStorage.getItem(key)||'null');return value&&typeof value.id==='string'&&value.id.length<1000&&typeof value.anchor==='string'&&value.anchor.length<1200?value:null;}catch{return null;}
}
export function clearInspectorOrigin(key:string){try{sessionStorage.removeItem(key);}catch{/* No durable research data is stored here. */}}
