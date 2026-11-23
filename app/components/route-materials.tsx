'use client';

import { useEffect, useState } from 'react';
import type { ResearchTrack } from '../../lib/research-map';
import type { LibraryPaper } from '../../lib/library-catalog';
import { comparisonEligibilityText } from '../../lib/comparison-eligibility';
import { researchRoleLabel } from '../../lib/research-workspace-presentation';
import type { RouteMaterialLocation } from '../../lib/workspace-navigation';
import { GraphPaperChoice } from './graph-paper-choice';
import { MathText } from './math-text';
import { useSavedRead } from './use-saved-read';
import type { RouteSelection } from './use-route-selection';
import './route-materials.css';

type Catalog = { items:LibraryPaper[]; total:number; nextOffset:number|null };
type RouteQuestion = { problemState:{ problem:{ question:string; status:string }|null } };

function decodeCatalog(value:unknown):Catalog {
  const data=value as Catalog;
  if(!Array.isArray(data?.items)||!Number.isInteger(data.total))throw Error('Invalid material list');
  return data;
}

function decodeQuestion(value:unknown):RouteQuestion {
  const data=value as RouteQuestion;
  if(!data?.problemState)throw Error('Invalid research question');
  return data;
}

function reviewedReason(paper:LibraryPaper,locale:'zh'|'en'){
  if(!paper.assessmentJson)return '';
  try{
    const reason=JSON.parse(paper.assessmentJson);
    const text=locale==='zh'?reason.reasonZh:reason.reasonEn;
    return typeof text==='string'?text:'';
  }catch{return '';}
}

export function RouteMaterialsContext({spaceId,track,tracks,locale,selection,onTrack,showEditor}:{
  spaceId:string;track:ResearchTrack;tracks:ResearchTrack[];locale:'zh'|'en';selection:RouteSelection;
  onTrack:(id:string)=>void;showEditor:boolean;
}) {
  const zh=locale==='zh';
  const key=spaceId+':'+track.id;
  const {data,error,reload}=useSavedRead(key,'/api/research-problem?'+new URLSearchParams({spaceId,trackId:track.id}),decodeQuestion);
  const problem=data?.problemState.problem;
  const question=problem?.status==='active'?problem.question:'';
  useEffect(()=>{if(question)selection.seedQuestion(question,true);},[key,question,selection]);

  return <div className="pi-materials-context">
    <label>{zh?'当前路线':'Current route'}
      <select value={track.id} onChange={event=>onTrack(event.target.value)}>
        {tracks.map(item=><option key={item.id} value={item.id}>{zh?item.titleZh:item.titleEn}</option>)}
      </select>
    </label>
    {question&&<div className="pi-materials-question"><small>{zh?'研究问题':'Research question'}</small><p><MathText inline>{question}</MathText></p></div>}
    {error&&<p className="pi-materials-notice" role="status">{zh?'研究问题暂未载入。':'Could not load the research question.'} <button type="button" onClick={reload}>{zh?'重试':'Retry'}</button></p>}
    {showEditor&&<details className="pi-materials-edit-question" open={!selection.value.question&&selection.value.papers.length>0||undefined}>
      <summary>{selection.value.question&&selection.value.question!==question?(zh?'查看本次比较问题':'View the comparison question'):(zh?'设置本次比较问题':'Set the comparison question')}</summary>
      <label>{zh?'本次比较问题':'Comparison question'}<textarea maxLength={1000} rows={2}
        value={selection.value.question} onChange={event=>selection.change({...selection.value,question:event.target.value})}
        placeholder={zh?'这些论文要回答什么问题？':'What should these papers help you answer?'} /></label>
    </details>}
  </div>;
}

export function RouteMaterials({spaceId,track,locale,selection,location,active,onLocation,onRead,onRelations,relationPaperIds}:{
  spaceId:string;track:ResearchTrack;locale:'zh'|'en';selection:RouteSelection;location:RouteMaterialLocation;active:boolean;
  onLocation:(patch:RouteMaterialLocation,history:'push'|'replace')=>void;
  onRead:(id:string)=>void;onRelations:(id:string)=>void;relationPaperIds:Map<string,string>;
}){
  const zh=locale==='zh';
  const query=location.materialQuery||'';
  const [settledQuery,setSettledQuery]=useState(query);
  useEffect(()=>{
    const timer=setTimeout(()=>setSettledQuery(query),180);
    return ()=>clearTimeout(timer);
  },[query]);
  const page=location.materialPage||1;
  const group=location.materialGroup||'';
  const groupLabels={all:zh?'全部材料':'All materials',backbone:zh?'路线主干':'Route papers',supplement:zh?'补充材料':'Supplementary'};
  const url='/api/library-catalog?'+new URLSearchParams({spaceId,trackId:track.id,view:'route-materials',q:settledQuery,group,offset:String((page-1)*24)});
  const {data,dataUrl,error,loading,reload}=useSavedRead(spaceId+':'+track.id,url,decodeCatalog,active);
  const result=dataUrl===url&&settledQuery===query?data:null;
  const byCanonical=new Map(track.papers.map(paper=>[paper.canonicalId.toLowerCase(),paper]));

  useEffect(()=>{
    if(!active||!result||!location.materialPaper)return;
    const resultPaper=result.items.find(item=>item.id===location.materialPaper);
    if(!resultPaper)return;
    const frame=requestAnimationFrame(()=>{
      document.getElementById('route-material-'+resultPaper.id)?.scrollIntoView({block:'nearest',behavior:'auto'});
    });
    return ()=>cancelAnimationFrame(frame);
  },[active,result,location.materialPaper]);

  const update=(patch:RouteMaterialLocation,history:'push'|'replace')=>onLocation({...patch,materialPaper:undefined},history);
  return <section className="pi-materials-list" aria-label={zh?'路线论文列表':'Route paper list'}>
    <div className="pi-materials-search">
      <label>{zh?'搜索路线材料':'Search route materials'}
        <input type="search" value={query} maxLength={160} onChange={event=>update({materialQuery:event.target.value||undefined,materialPage:undefined},'replace')}
          placeholder={zh?'论文标题、作者或摘要':'Title, author, or abstract'} />
      </label>
      <div className="pi-materials-groups" role="group" aria-label={zh?'材料范围':'Material scope'}>
        {(['all','backbone','supplement'] as const).map(item=><button key={item} type="button" aria-pressed={(group||'all')===item}
          onClick={()=>update({materialGroup:item==='all'?undefined:item,materialPage:undefined},'push')}>{groupLabels[item]}</button>)}
      </div>
    </div>
    {error&&<p className="pi-materials-notice" role="alert">{zh?'路线材料暂未载入。':'Could not load route materials.'} <button type="button" onClick={reload}>{zh?'重试':'Retry'}</button></p>}
    {!result&&!error&&(loading||settledQuery!==query)&&<p className="pi-materials-notice" role="status">{zh?'正在载入论文…':'Loading papers…'}</p>}
    {result&&<>
      <p className="pi-materials-count" role="status">{zh?`${result.total} 篇论文`:`${result.total} papers`}</p>
      {!result.items.length&&<div className="pi-materials-empty">
        <strong>{query?(zh?'没有匹配的论文':'No matching papers'):group?(zh?'此分类暂无材料':'No papers in this group'):(zh?'这条路线还没有材料':'No materials on this route yet')}</strong>
        <div>{query&&<button type="button" onClick={()=>update({materialQuery:undefined,materialPage:undefined},'replace')}>{zh?'清除搜索':'Clear search'}</button>}
        {group&&<button type="button" onClick={()=>update({materialGroup:undefined,materialPage:undefined},'push')}>{zh?'查看全部材料':'Show all materials'}</button>}
        {page>1&&<button type="button" onClick={()=>update({materialPage:undefined},'push')}>{zh?'返回第一页':'Back to first page'}</button>}</div>
      </div>}
      <ul className="pi-materials-results">{result.items.map(paper=>{
        const canonical=paper.canonicalId.toLowerCase();
        const routePaper=byCanonical.get(canonical);
        const relationshipId=relationPaperIds.get(canonical);
        const reason=(zh?routePaper?.rationaleZh:routePaper?.rationaleEn)||reviewedReason(paper,locale);
        const category=routePaper?researchRoleLabel(routePaper.role,locale):paper.membership==='included'?(zh?'已收录':'Added to route'):
          paper.relevance==='direct'?(zh?'已核对 · 直接相关':'Reviewed · directly related'):(zh?'已核对 · 部分相关':'Reviewed · partially related');
        const selected=selection.value.papers.some(item=>item.canonicalId.toLowerCase()===canonical);
        const source=/^https?:\/\//i.test(paper.url)?paper.url:paper.doi?`https://doi.org/${encodeURI(paper.doi)}`:'';
        const read=()=>{onLocation({materialPaper:paper.id},'replace');onRead(paper.id);};
        return <li key={paper.id} id={'route-material-'+paper.id} className="pi-material-row" data-selected={selected}>
          <div className="pi-material-main">
            <div className="pi-material-meta"><span>{category}</span>{paper.publishedAt&&<span>{paper.publishedAt.slice(0,4)}</span>}</div>
            <h3>{!paper.routeOnly?<button type="button" onClick={read}><MathText inline>{paper.title}</MathText></button>:
              source?<a href={source} target="_blank" rel="noreferrer"><MathText inline>{paper.title}</MathText> ↗</a>:<MathText inline>{paper.title}</MathText>}</h3>
            <p className="pi-material-authors">{[paper.authors,paper.venue].filter(Boolean).join(' · ')}</p>
            {reason&&<p className="pi-material-reason"><MathText inline>{reason}</MathText></p>}
          </div>
          <div className="pi-material-actions">
            {(paper.comparisonEligibility==='eligible'||selected)&&<GraphPaperChoice paper={paper} locale={locale} selection={selection}/>}
            {paper.comparisonEligibility!=='eligible'&&<small>{comparisonEligibilityText(paper.comparisonEligibility,zh)}</small>}
            {relationshipId&&<button type="button" className="pi-material-relations" onClick={()=>{onLocation({materialPaper:paper.id},'replace');onRelations(relationshipId);}}>
              {zh?'查看论文关系':'View paper relations'} →</button>}
          </div>
        </li>;
      })}</ul>
      {(page>1||result.nextOffset!==null)&&<nav className="pi-materials-pages" aria-label={zh?'路线材料分页':'Route material pages'}>
        <button type="button" disabled={page<2} onClick={()=>update({materialPage:page-1},'push')}>{zh?'上一页':'Previous'}</button>
        <span>{page} / {Math.max(1,Math.ceil(result.total/24))}</span>
        <button type="button" disabled={result.nextOffset===null} onClick={()=>update({materialPage:page+1},'push')}>{zh?'下一页':'Next'}</button>
      </nav>}
    </>}
  </section>;
}
