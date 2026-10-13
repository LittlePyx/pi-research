const sources:Record<string,[string,string]>={crossref:['Crossref','Crossref'],openalex:['OpenAlex','OpenAlex'],springer:['Springer','Springer'],datacite:['DataCite','DataCite'],arxiv:['arXiv','arXiv']};
const outcomes:Record<string,[string,string]>={not_found:['未返回匹配摘要','no matching abstract'],too_short:['内容不足','insufficient content'],placeholder:['只有占位说明','placeholder only'],rate_limited:['限流中','rate limited'],cooldown:['等待来源恢复','cooling down'],timeout:['请求超时','request timed out'],source_error:['暂不可访问','unavailable'],unknown:['结果未记录','result not recorded']};
export function abstractRecoverySummary(value:string,locale:'zh'|'en'){
 let rows:Array<{source:string;outcome:string}>;
 try{const parsed=JSON.parse(value);if(!Array.isArray(parsed))return '';rows=parsed.map(row=>typeof row==='string'?{source:row,outcome:'unknown'}:row).filter(row=>row&&typeof row.source==='string'&&typeof row.outcome==='string')}catch{return ''}
 const index=locale==='zh'?0:1,result=new Map<string,string>();
 for(const row of rows){if(!Object.hasOwn(sources,row.source)||!Object.hasOwn(outcomes,row.outcome))continue;const name=sources[row.source][index];if(!result.has(name)||!['not_found','too_short','unknown'].includes(row.outcome))result.set(name,outcomes[row.outcome][index])}
 return [...result].map(([source,outcome])=>`${source}${locale==='zh'?'：':': '}${outcome}`).join(' · ');
}
