/** Reuse verified findings for legacy/process-only briefs without inventing a cross-paper conclusion. */
export function briefEditorial(brief, findings, locale='zh') {
 const suffix=locale==='zh'?'Zh':'En';
 const overview=brief['overview'+suffix]||'';
 if(brief.model!=='evidence-summary')return {overview};
 if(!findings.length)return brief.metrics?{overview:locale==='zh'?'本期暂无可展示的已核验发现。可继续阅读下方既有推荐，或在发现进度查看未入选与待核验材料。':'No verified finding is available to display in this edition. Continue with saved recommendations below, or inspect unselected and pending materials in Discovery.',process:overview}:{overview};
 const sources=findings.slice(0,2);
 const excerpt=text=>{
  const limit=locale==='zh'?220:440;
  const value=text.trim();
  if(value.length<=limit)return value;
  const boundary=value.slice(0,limit).search(/[。！？](?=[^。！？]*$)|[.!?](?=\s[A-Z][^.!?]*$)/);
  return boundary>=40?value.slice(0,boundary+1):value.slice(0,limit)+'…';
 };
 return {overview:sources.map((f,i)=>`[${i+1}] ${excerpt(f.text)}`).join('\n\n'),overviewSources:sources.map(f=>({id:f.id,title:f.title})),process:overview};
}
