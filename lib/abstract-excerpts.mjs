// Exact source slices: no whitespace normalization, paraphrase or model quotes.
// Long sentences are split at whitespace; IDs are scoped to a single paper.
export function abstractExcerpts(abstract, prefix) {
 if(typeof abstract!=='string'||typeof prefix!=='string')throw new Error('invalid_abstract');
 const chunks=[];
 for(const sentence of abstract.split(/(?<=[.!?。！？])\s+(?=[A-Z\u4e00-\u9fff])/u)) {
  let rest=sentence.trim();
  while(rest.length>400){
   const boundary=rest.slice(0,381).lastIndexOf(' ');
   const cut=boundary>=200?boundary:380;
   chunks.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();
  }
  if(rest.length>=20)chunks.push(rest);
 }
 return chunks.map((text,index)=>({id:`${prefix}:s${index+1}`,text}));
}
