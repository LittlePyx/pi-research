'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {citationSourceHref,mergeRouteCitations,type LibraryGraphNeighbor,type RouteCitationPaper,type RouteCitationSnapshot} from '../../lib/library-graph';
import {isDatabaseVerifiedCitationEdge} from '../../lib/paper-network';
import type {ResearchMapState} from '../../lib/research-map';
import {researchPaperYear} from '../../lib/research-workspace-presentation';
import {workspaceFetch} from '../../lib/workspace-request';
import {GraphPaperChoice} from './graph-paper-choice';
import {MathText} from './math-text';
import {buildNetworkPaperNodes,citationEvidenceProviderLabel,type NetworkPaperNode} from './paper-network-graph';
import {ReadingOrderWorkbench} from './reading-order-workbench';
import {useSavedRead} from './use-saved-read';
import type {RouteSelection} from './use-route-selection';
import './route-citation-explorer.css';

type Locale='zh'|'en';
type FocusActions={
  spaceId:string;trackFilter:string;locale:Locale;mode:'citations'|'path';demo?:boolean;
  onSelect:(id:string)=>void;onRead:(id:string)=>void;onAgenda:()=>void;onCitations:()=>void;
  selection?:RouteSelection;
};

function decode(value:unknown):RouteCitationSnapshot {
  const snapshot=value as RouteCitationSnapshot|null;
  if(!snapshot?.focusId||!Array.isArray(snapshot.items))throw Error('Invalid citation snapshot');
  return snapshot;
}

export function CitationFlowWorkbench({map,selectedPaperId,...props}:FocusActions&{map:ResearchMapState;selectedPaperId:string|null}){
  const {trackFilter,spaceId,onSelect,locale}=props;
  const model=useMemo(()=>{
    const nodes=buildNetworkPaperNodes(map);
    const allowed=nodes.filter(node=>node.trackIds.includes(trackFilter));
    const focus=allowed.find(node=>node.paper.id===selectedPaperId)||allowed[0];
    const byId=new Map(map.tracks.flatMap(track=>track.papers.map(paper=>[paper.id,paper] as const)));
    const routePapers=new Map(nodes.map(node=>[node.paper.canonicalId.toLowerCase(),{id:node.paper.id,inRoute:node.trackIds.includes(trackFilter)}]));
    const local:LibraryGraphNeighbor[]=[];
    if(focus){
      const canonical=focus.paper.canonicalId.toLowerCase();
      for(const edge of map.paperEdges.filter(isDatabaseVerifiedCitationEdge)){
        const source=byId.get(edge.sourcePaperId),target=byId.get(edge.targetPaperId);
        const outward=source?.canonicalId.toLowerCase()===canonical;
        const inward=target?.canonicalId.toLowerCase()===canonical;
        const paper=outward?target:inward?source:undefined;
        if(!paper||paper.canonicalId.toLowerCase()===canonical)continue;
        local.push({canonicalId:paper.canonicalId,title:paper.title,authors:paper.authors,
          url:paper.url,year:researchPaperYear(paper),kind:outward?'reference':'citation',
          provider:citationEvidenceProviderLabel(edge.evidenceSource)});
      }
    }
    return {focus,routePapers,local};
  },[map,trackFilter,selectedPaperId]);
  const focusId=model.focus?.paper.id;
  useEffect(()=>{
    if(focusId&&focusId!==selectedPaperId)onSelect(focusId);
  },[focusId,selectedPaperId,onSelect]);
  if(!model.focus)return <p className="pi-citation-empty">{locale==='zh'?'这条路线暂无可作为起点的论文。':'This route has no starting papers yet.'}</p>;
  return <FocusCitations key={spaceId+':'+trackFilter+':'+focusId} {...props} focus={model.focus} routePapers={model.routePapers} local={model.local}/>;
}

function FocusCitations({focus,spaceId,locale,mode,demo,onSelect,onRead,onAgenda,onCitations,selection,routePapers,local}:
  FocusActions&{focus:NetworkPaperNode;routePapers:Map<string,{id:string;inRoute:boolean}>;local:LibraryGraphNeighbor[]}){
  const zh=locale==='zh',paper=focus.paper;
  const key=spaceId+':'+paper.id;
  const url='/api/library-graph?'+new URLSearchParams({spaceId,routePaperId:paper.id});
  const saved=useSavedRead(key,url,decode);
  const remote=saved.data?.focusId===paper.id?saved.data:null;
  const [scope,setScope]=useState<'all'|'route'>('all');
  const [lookup,setLookup]=useState<'library'|'expanded'|null>(null);
  const [message,setMessage]=useState('');
  const [alternate,setAlternate]=useState(false);
  const lookupRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>lookupRequest.current?.abort(),[]);
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{
    const delay=(remote?.libraryRetryAt||0)-Date.now();
    if(delay<=0)return;
    const timer=setTimeout(()=>setClock(Date.now()),delay+100);
    return ()=>clearTimeout(timer);
  },[remote?.libraryRetryAt]);
  const items=mergeRouteCitations([...local,...(remote?.items||[])],routePapers);
  const scoped=scope==='route'?items.filter(item=>item.inRoute):items;
  const cooling=Boolean(remote&&remote.libraryRetryAt>clock);
  const libraryOnly=Boolean(remote?.canQueryLibrary&&!alternate&&remote.libraryStatus!=='error'&&remote.libraryStatus!=='missing_id');
  const sourceStatus=demo?(zh?'演示显示已保存的示例引用。':'Showing saved example citations.'):
    remote?.libraryStatus==='partial'||remote?.networkStatus==='partial'?(zh?'部分来源已返回，可继续查询。':'Some sources have returned. You can continue checking.'):
    remote?.libraryStatus==='error'||remote?.networkStatus==='unavailable'?(zh?'部分来源暂不可查，已有引用仍可查看。':'Some providers are unavailable. Saved citations remain visible.'):
    remote?.checkedAt||remote?.items.length?(zh?'显示已查到的直接引用。':'Showing direct citations found so far.'):
    (zh?'库外引用尚未查询。':'External citations have not been checked yet.');
  const requestCitations=async(otherSource=false)=>{
    if(lookupRequest.current&&!lookupRequest.current.signal.aborted)return;
    const request=new AbortController();
    lookupRequest.current=request;
    const library=Boolean(libraryOnly&&!otherSource&&remote?.libraryPaperId);
    setLookup(library?'library':'expanded');setMessage('');
    try{
      if(library){
        const response=await workspaceFetch('/api/library-graph',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({spaceId,paperId:remote!.libraryPaperId}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(65000)])});
        if(!response.ok)throw Error('Citation provider unavailable');
        const data=await response.json() as {status:string;errors?:string[]};
        if(request.signal.aborted)return;
        if(response.status===202)setMessage(zh?'来源查询已在进行，可稍后刷新结果。':'Sources are already being checked. Refresh the results shortly.');
        if(['error','missing_id','empty'].includes(data.status)||data.errors?.length)setAlternate(true);
        if(data.status==='empty')setMessage(zh?'该来源未返回引用，可换其他来源。':'This provider returned no citations. You can try other sources.');
        if(data.errors?.length)setMessage(zh?'部分结果暂不可用，已保存的引用仍可查看。':'Some results are unavailable. Saved citations remain visible.');
      }else{
        const response=await workspaceFetch('/api/research-network',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'expand',spaceId,originCanonicalIds:[paper.canonicalId],limit:60,force:true}),
          signal:AbortSignal.any([request.signal,AbortSignal.timeout(120000)])});
        const result=await response.json() as {status?:string};
        if(request.signal.aborted)return;
        if(!result?.status||result.status==='unavailable'||result.status==='rate_limited')setMessage(zh?'部分来源暂不可查，可稍后再试。':'Some providers are temporarily unavailable. Try again later.');
        else if(result.status==='partial')setMessage(zh?'已读取可用结果，部分来源尚未返回。':'Available results loaded. Some providers have yet to respond.');
        else if(result.status==='no_matches')setMessage(zh?'本次来源没有返回新的直接引用。':'The providers returned no new direct citations.');
      }
    }catch{
      if(!request.signal.aborted){
        setMessage(zh?'查询未完成，已有引用仍可查看。':'The query did not complete. Saved citations remain visible.');
        if(library)setAlternate(true);
      }
    }finally{
      if(!request.signal.aborted){
        lookupRequest.current=null;
        setLookup(null);
        setClock(Date.now());
        saved.reload();
      }
    }
  };
  const groups=[
    {id:'reference',title:zh?'参考文献':'References',items:scoped.filter(item=>item.kind==='reference')},
    {id:'citation',title:zh?'引用本文的论文':'Citing papers',items:scoped.filter(item=>item.kind==='citation')},
  ] as const;
  const renderPaper=(item:RouteCitationPaper)=><li key={item.canonicalId}>
    <div className="pi-route-citation-meta"><span>{item.inRoute?(zh?'本路线':'On this route'):item.routePaperId?(zh?'其他路线':'Other route'):item.paperId?(zh?'论文库':'In library'):(zh?'库外':'Outside library')}</span>
      <span>{[item.year,item.sources.join(' / ')].filter(Boolean).join(' · ')}</span></div>
    <h5><MathText inline>{item.title}</MathText></h5>
    {item.authors&&<p>{item.authors}</p>}
    <div className="pi-route-citation-row-actions">
      {item.paperId&&<button type="button" onClick={()=>onRead(item.paperId!)}>{zh?'阅读':'Read'}</button>}
      {item.routePaperId&&item.inRoute&&<button type="button" onClick={()=>onSelect(item.routePaperId!)}>{zh?'设为焦点':'Set as focus'}</button>}
      {item.paperId&&<GraphPaperChoice paper={item} selection={selection} locale={locale}/>}
      {citationSourceHref(item)&&<a href={citationSourceHref(item)} target="_blank" rel="noreferrer">{zh?'原文':'Original'} ↗</a>}
    </div>
  </li>;
  return <section className="pi-route-citations" aria-label={zh?'知识引用流工作台':'Citation flow workbench'}>
    <article className="pi-route-citation-focus" id="citation-focus-paper">
      <h3><MathText inline>{paper.title}</MathText></h3>
      <p>{[paper.authors,paper.venue].filter(Boolean).join(' · ')}</p>
      <div className="pi-route-evidence-actions">
        {remote?.libraryPaperId&&<><button type="button" onClick={()=>onRead(remote.libraryPaperId!)}>{zh?'阅读论文':'Read paper'}</button>
          <GraphPaperChoice paper={paper} selection={selection} locale={locale}/></>}
        {citationSourceHref(paper)&&<a href={citationSourceHref(paper)} target="_blank" rel="noreferrer">{zh?'打开原文':'Open original'} ↗</a>}
      </div>
    </article>
    {mode==='path'?<ReadingOrderWorkbench focus={paper} references={items.filter(item=>item.kind==='reference')}
      citations={items.filter(item=>item.kind==='citation')} locale={locale} onOpen={onRead} onCitations={onCitations} onAgenda={onAgenda}/>:<>
      <div className="pi-route-citation-toolbar">
        <div role="group" aria-label={zh?'引用范围':'Citation scope'}>
          <button type="button" aria-pressed={scope==='all'} onClick={()=>setScope('all')}>{zh?'全部已查到':'All found'}</button>
          <button type="button" aria-pressed={scope==='route'} onClick={()=>setScope('route')}>{zh?'仅本路线':'This route'}</button>
        </div>
        {!demo&&<div className="pi-route-citation-lookup">
          <button type="button" disabled={Boolean(lookup)||saved.loading||Boolean(libraryOnly&&(cooling||remote?.libraryBusy))}
            onClick={()=>void requestCitations()}>
            {lookup?(zh?'正在查询…':'Checking…'):libraryOnly&&cooling?(zh?'等待可再次查询':'Waiting to retry'):
              remote?.canQueryLibrary&&!libraryOnly?(zh?'换其他来源查询':'Check other providers'):
              remote?.checkedAt?(zh?'继续查询上下游':'Find more upstream and downstream papers'):(zh?'查询上下游':'Find upstream and downstream papers')}
          </button>
          {libraryOnly&&Boolean(remote?.checkedAt)&&<button type="button" disabled={Boolean(lookup)} onClick={()=>void requestCitations(true)}>{zh?'扩展其他来源':'Check other providers'}</button>}
        </div>}
      </div>
      <p className="pi-route-citation-status" role="status">{saved.loading?(zh?'正在读取已保存的关系…':'Loading saved citations…'):
        message||sourceStatus}{remote?.capped&&(zh?' 已达到显示上限。':' Display limit reached.')}</p>
      {saved.error&&<p role="alert">{zh?'已保存的库外引用暂未载入。':'Saved external links could not load.'} <button type="button" onClick={saved.reload}>{zh?'重试':'Retry'}</button></p>}
      <div className="pi-route-citation-columns" role="region" aria-label={zh?'已核验引用关系':'Verified citation links'}>
        {groups.map(group=><section key={group.id} data-kind={group.id}><header><h4>{group.title}</h4><span>{group.items.length}</span></header>
          {group.items.length?<ul>{group.items.slice(0,5).map(renderPaper)}</ul>:
            <p>{zh?'这个范围暂无已查到的记录。':'No links found in this scope.'}</p>}
          {group.items.length>5&&<details><summary>{zh?`展开其余 ${group.items.length-5} 篇`:`Show ${group.items.length-5} more`}</summary><ul>{group.items.slice(5).map(renderPaper)}</ul></details>}
        </section>)}
      </div>
    </>}
  </section>;
}
