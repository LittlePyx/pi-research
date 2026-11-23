'use client';

import { useEffect, useRef, useState } from 'react';
import type { ResearchTrack, ResearchTrackPaper } from '../../lib/research-map';
import type { LibraryPaper } from '../../lib/library-catalog';
import type { GraphRelevance } from '../../lib/graph-task';
import { comparisonEligibilityText } from '../../lib/comparison-eligibility';
import { researchRoleLabel } from '../../lib/research-workspace-presentation';
import type { RouteMaterialLocation } from '../../lib/workspace-navigation';
import { workspaceFetch } from '../../lib/workspace-request';
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

function reviewedAssessment(paper:LibraryPaper):GraphRelevance|null{
  if(!paper.assessmentJson)return null;
  try{
    return JSON.parse(paper.assessmentJson);
  }catch{return null;}
}

export function RouteComparisonQuestion({spaceId,trackId,locale,selection,showEditor}:{
  spaceId:string;trackId:string;locale:'zh'|'en';selection:RouteSelection;showEditor:boolean;
}) {
  const zh=locale==='zh';
  const key=spaceId+':'+trackId;
  const {data,error,reload}=useSavedRead(key,'/api/research-problem?'+new URLSearchParams({spaceId,trackId}),decodeQuestion);
  const problem=data?.problemState.problem;
  const question=problem?.status==='active'?problem.question:'';
  const questionEditor=useRef<HTMLDetailsElement>(null);
  const needsQuestion=showEditor&&!selection.value.question&&selection.value.papers.length>0;
  useEffect(()=>{if(question)selection.seedQuestion(question,true);},[key,question,selection]);
  useEffect(()=>{
    if(needsQuestion&&questionEditor.current)questionEditor.current.open=true;
  },[needsQuestion]);

  if(!showEditor)return null;
  return <div className="pi-materials-context">
    {error&&<p className="pi-materials-notice" role="status">{zh?'研究问题暂未载入。':'Could not load the research question.'} <button type="button" onClick={reload}>{zh?'重试':'Retry'}</button></p>}
    <details className="pi-materials-edit-question" ref={questionEditor}>
      <summary>{zh?'本次比较问题':'Comparison question'}</summary>
      <label>{zh?'本次比较问题':'Comparison question'}<textarea maxLength={1000} rows={2}
        value={selection.value.question} onChange={event=>selection.change({...selection.value,question:event.target.value})}
        placeholder={zh?'这些论文要回答什么问题？':'What should these papers help you answer?'} /></label>
    </details>
  </div>;
}

export function RouteMaterials({spaceId,track,locale,selection,location,active,onLocation,onLibrary,onRead,onRelations,relationPaperIds,onDeactivate,curationBusy,demo}:{
  spaceId:string;track:ResearchTrack;locale:'zh'|'en';selection:RouteSelection;location:RouteMaterialLocation;active:boolean;
  onLocation:(patch:RouteMaterialLocation,history:'push'|'replace')=>void;
  onLibrary:()=>void;onRead:(id:string)=>void;onRelations:(id:string)=>void;relationPaperIds:Map<string,string>;
  onDeactivate:(paper:ResearchTrackPaper)=>void;curationBusy:boolean;demo:boolean;
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
  const paperIds=track.papers.map(paper=>paper.id).join(',');
  const {data,dataUrl,error,loading,reload}=useSavedRead(spaceId+':'+track.id+':'+paperIds,url,decodeCatalog,active);
  const result=dataUrl===url&&settledQuery===query?data:null;
  const byCanonical=new Map(track.papers.map(paper=>[paper.canonicalId.toLowerCase(),paper]));
  const [saving,setSaving]=useState('');
  const [saveError,setSaveError]=useState('');
  const save=async(paper:LibraryPaper,status:'included'|'excluded',category:string)=>{
    setSaving(paper.id);setSaveError('');
    try{
      const response=await workspaceFetch('/api/library-catalog',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({spaceId,trackId:track.id,paperId:paper.id,status,category})});
      if(!response.ok)throw Error('Could not save material');
      reload();
    }catch{setSaveError(zh?'材料状态暂未保存，请重试。':'Could not save the paper. Try again.');}
    finally{setSaving('');}
  };

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
      <button type="button" className="pi-material-library-link" onClick={onLibrary}>{zh?'从论文库补充':'Add from the library'}</button>
    </div>
    {error&&<p className="pi-materials-notice" role="alert">{zh?'路线材料暂未载入。':'Could not load route materials.'} <button type="button" onClick={reload}>{zh?'重试':'Retry'}</button></p>}
    {saveError&&<p className="pi-materials-notice" role="alert">{saveError}</p>}
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
        const assessment=reviewedAssessment(paper);
        const reason=(zh?routePaper?.rationaleZh:routePaper?.rationaleEn)||(zh?assessment?.reasonZh:assessment?.reasonEn);
        const category=routePaper?researchRoleLabel(routePaper.role,locale):paper.membership==='included'?(zh?'已收录':'Added to route'):
          paper.membership==='excluded'?(zh?'已排除':'Excluded'):paper.relevance==='direct'?(zh?'已核对 · 直接相关':'Reviewed · directly related'):
          paper.relevance==='partial'?(zh?'已核对 · 部分相关':'Reviewed · partially related'):(zh?'论文库材料':'Library paper');
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
            {assessment?.quote&&<details className="pi-material-details"><summary>{zh?'摘要依据':'Abstract evidence'}</summary><blockquote>{assessment.quote}</blockquote><p>{zh?assessment.limitationZh:assessment.limitationEn}</p></details>}
          </div>
          <div className="pi-material-actions">
            {(paper.comparisonEligibility==='eligible'||selected)&&<GraphPaperChoice paper={paper} locale={locale} selection={selection}/>}
            {paper.comparisonEligibility!=='eligible'&&<small>{comparisonEligibilityText(paper.comparisonEligibility,zh)}</small>}
            {relationshipId&&<button type="button" className="pi-material-relations" onClick={()=>{onLocation({materialPaper:paper.id},'replace');onRelations(relationshipId);}}>
              {zh?'查看论文关系':'View paper relations'} →</button>}
            {!demo&&(routePaper?routePaper.provenance!=='user_confirmed':!paper.routeOnly)&&<details className="pi-material-details">
              <summary>{zh?'管理':'Manage'}</summary>
              {routePaper?<button type="button" disabled={curationBusy} onClick={()=>onDeactivate(routePaper)}>{zh?'从本路线移除':'Remove from this route'}</button>:<>
                <select aria-label={zh?'归类并加入文献集合':'Classify and add to collection'} disabled={Boolean(saving)} value={paper.membership==='included'?paper.category||'related':''} onChange={event=>{if(event.target.value)void save(paper,'included',event.target.value);}}>
                  <option value="">{zh?'加入文献集合…':'Add to collection…'}</option>
                  <option value="related">{zh?'相关研究':'Related work'}</option><option value="method">{zh?'方法':'Method'}</option>
                  <option value="background">{zh?'背景':'Background'}</option><option value="evidence">{zh?'待核对证据':'Evidence to examine'}</option>
                </select>
                <button type="button" disabled={Boolean(saving)||paper.membership==='excluded'} onClick={()=>void save(paper,'excluded',paper.category||'related')}>{zh?'从集合排除':'Exclude from collection'}</button>
              </>}
            </details>}
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
