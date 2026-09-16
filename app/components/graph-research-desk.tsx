'use client';
import { useEffect, useRef, useState } from 'react';
import type { GraphRelevance, GraphTaskContext } from '../../lib/graph-task';

export type GraphDeskPaper = { id:string;canonicalId:string;title:string;authors:string;url:string;year:string;external:boolean;abstractText:string;relations:string[];direct:boolean };
export function GraphResearchDesk({spaceId,mode,papers,origins,originId,context,onContext,onOrigin,onFocus,onExpand,onCompare,onLearn,locale,expanding,discoveryNotice}: {
  spaceId:string;mode:'similarity'|'citations';papers:GraphDeskPaper[];origins:GraphDeskPaper[];originId:string;
  context:GraphTaskContext;onContext:(context:GraphTaskContext)=>void;onOrigin:(id:string)=>void;onFocus:(id:string)=>void;
  onExpand:()=>void;onCompare:()=>void;onLearn:()=>void;locale:'zh'|'en';expanding:boolean;discoveryNotice?:string;
}) {
  const zh=locale==='zh'; const [limit,setLimit]=useState(8);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [review,setReview]=useState<{key:string;items:GraphRelevance[]}|null>(null);const abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>{abort.current?.abort();abort.current=null;},[]);
  const relevant=mode==='citations'?papers.filter(p=>p.direct):papers;
  const key=JSON.stringify([spaceId,originId,context.question,relevant.map(p=>[p.canonicalId,p.title,p.abstractText])]);
  const items=review?.key===key?review.items:[];
  const ranks={direct:0,partial:1,insufficient:2,unrelated:3};
  const ranked=[...relevant].sort((a,b)=>{
    const left=items.find(i=>i.canonicalId.toLowerCase()===a.canonicalId.toLowerCase());const right=items.find(i=>i.canonicalId.toLowerCase()===b.canonicalId.toLowerCase());
    return (left?ranks[left.relevance]:2)-(right?ranks[right.relevance]:2);
  });
  const toggle=(p:GraphDeskPaper)=>{const included=context.papers.some(x=>x.canonicalId===p.canonicalId);if(!included&&context.papers.length>=3)return;onContext({...context,papers:included?context.papers.filter(x=>x.canonicalId!==p.canonicalId):[...context.papers,{canonicalId:p.canonicalId,title:p.title}]});};
  const assess=async()=>{
    abort.current?.abort();const controller=new AbortController();abort.current=controller;setBusy(true);setError('');
    try{const r=await fetch('/api/graph-relevance',{method:'POST',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]),headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,question:context.question,canonicalIds:relevant.slice(0,12).map(p=>p.canonicalId)})});
      if(!r.ok)throw new Error(String(r.status));const data=await r.json() as {assessments:GraphRelevance[];missing?:string[]};if(abort.current===controller)setReview({key,items:[...data.assessments,...(data.missing || []).map(canonicalId=>({canonicalId,relevance:'insufficient' as const,reasonZh:'当前没有可用于核对的摘要。',reasonEn:'No abstract is available for review.',quote:'',limitationZh:'不能据题名判断问题适配性。',limitationEn:'The title alone cannot establish relevance.'}))]});
    }catch(e){if(!controller.signal.aborted)setError(zh?(e instanceof Error&&e.message==='428'?'请先连接模型，再核对问题相关性。':'本次核对未完成，已有论文仍可浏览。'):'Review did not finish. Check the model connection and retry.');}
    finally{if(abort.current===controller)setBusy(false);}
  };
  return <section className="pi-graph-desk">
    <div className="pi-graph-question"><label>{zh?'围绕哪篇论文展开':'Starting paper'}<select value={originId} onChange={e=>onOrigin(e.target.value)}><option value="" disabled>{zh?'选择起点':'Choose a starting paper'}</option>{origins.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
      <label>{zh?'这次想解决什么问题':'What are you trying to find out?'}<textarea rows={2} maxLength={1000} value={context.question} onChange={e=>{abort.current?.abort();abort.current=null;setBusy(false);onContext({...context,question:e.target.value});}} placeholder={zh?'例如：这些方法对协方差矩阵分别有什么限制？':'For example: how do their covariance assumptions differ?'} /></label>
      <div className="pi-graph-desk-actions"><button type="button" className="primary" disabled={!originId||expanding} onClick={onExpand}>{expanding?(zh?'正在读取邻近论文…':'Loading neighbors…'):mode==='citations'?(zh?'展开外部引用邻居':'Expand external citation neighbors'):(zh?'发现相关论文':'Discover related papers')}</button><button type="button" onClick={()=>void assess()} disabled={busy||context.question.trim().length<6||!relevant.length}>{busy?(zh?'正在核对摘要…':'Reviewing abstracts…'):(zh?'按问题核对前 12 篇':'Review first 12 against question')}</button></div>
    </div>
    <aside className="pi-graph-selection"><strong>{zh?'本次研究选择':'Selected for this task'} · {context.papers.length}/3</strong>{context.papers.length?<ol>{context.papers.map(p=><li key={p.canonicalId}><span>{p.title}</span><button type="button" onClick={()=>onContext({...context,papers:context.papers.filter(x=>x.canonicalId!==p.canonicalId)})} aria-label={`${zh?'移除':'Remove'} ${p.title}`}>×</button></li>)}</ol>:<p>{zh?'从下面选择论文，也可以加入起点。选择不会改变收录或阅读状态。':'Select papers below, including the starting paper. Selection does not change collection or reading status.'}</p>}
      {origins.find(p=>p.id===originId)&&<button type="button" disabled={context.papers.length>=3||context.papers.some(p=>p.canonicalId===origins.find(o=>o.id===originId)?.canonicalId)} onClick={()=>toggle(origins.find(p=>p.id===originId)!)}>{zh?'加入起点论文':'Include starting paper'}</button>}
      <div><button type="button" disabled={context.papers.length<2} onClick={onCompare}>{zh?'比较已选论文':'Compare selected papers'}</button><button type="button" disabled={!context.papers.length} onClick={onLearn}>{zh?'规划这些论文的学习':'Plan learning for these papers'}</button></div>
    </aside>
    <section className="pi-graph-results"><header><h3>{mode==='citations'?(zh?'引用邻居':'Citation neighbors'):(zh?'可进一步阅读的论文':'Papers to examine')}</h3><span>{relevant.length} {zh?'篇':'papers'}</span></header><p className="pi-graph-result-note">{items.length?(zh?'按已独立核对的问题相关性排序；这是摘要范围的判断，不是质量推荐。':'Ordered by independently reviewed relevance, limited to abstracts; this is not quality approval.'):(zh?'目前按与起点的已有关系展示；点击“按问题核对”后才会按你的问题重新排序。':'Ordered by existing links to the starting paper. Review against your question to reorder.')}</p>
      {discoveryNotice&&<p role="status">{discoveryNotice}</p>}{error&&<p role="alert">{error}</p>}{!relevant.length&&<p>{zh?'当前范围还没有邻居结果。可展开外部引用；未收录的论文也可以查看。':'No neighbors in this scope yet. Expand external citations to inspect papers outside the collection.'}</p>}
      {ranked.slice(0,limit).map(p=>{const assessment=items.find(a=>a.canonicalId.toLowerCase()===p.canonicalId.toLowerCase());const selected=context.papers.some(x=>x.canonicalId===p.canonicalId);return <article key={p.canonicalId}><div className="pi-graph-paper-head"><label><input type="checkbox" checked={selected} disabled={!selected&&context.papers.length>=3} onChange={()=>toggle(p)} /><span>{zh?'选择':'Select'}</span></label><span>{p.external?(zh?'外部候选 · 未代表质量通过':'External candidate · not quality approved'):(zh?'已在路线中':'In a research route')}{p.year?' · '+p.year:''}</span></div><h4>{p.title}</h4><p className="authors">{p.authors}</p><div className="pi-graph-relations">{p.relations.map((r,i)=><span key={i}>{r}</span>)}</div>
        {assessment&&<div className="pi-graph-fit"><strong>{({direct:zh?'直接相关':'Directly relevant',partial:zh?'部分相关':'Partly relevant',unrelated:zh?'与当前问题不匹配':'Does not match this question',insufficient:zh?'依据不足':'Insufficient evidence'})[assessment.relevance]}</strong><p>{zh?assessment.reasonZh:assessment.reasonEn}</p>{assessment.quote&&<blockquote>{assessment.quote}</blockquote>}<p>{zh?'尚不能确定：':'Not established: '}{zh?assessment.limitationZh:assessment.limitationEn}</p></div>}
        {!assessment&&p.abstractText&&<details><summary>{zh?'查看已有摘要':'Read available abstract'}</summary><p>{p.abstractText}</p></details>}
        <footer><button type="button" onClick={()=>onFocus(p.id)}>{zh?'在关系图中定位':'Locate in graph'}</button>{/^https?:\/\//i.test(p.url)&&<a href={p.url} target="_blank" rel="noreferrer">{zh?'原文':'Original'} ↗</a>}</footer></article>;})}
      {ranked.length>limit&&<button type="button" onClick={()=>setLimit(n=>n+8)}>{zh?'再显示 8 篇':'Show 8 more'}</button>}
    </section>
  </section>;
}
