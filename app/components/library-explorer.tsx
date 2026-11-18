'use client';
import { workspaceFetch as fetch } from "../../lib/workspace-request";

import {useEffect,useRef,useState} from 'react';
import type {LibraryPaper} from '../../lib/library-catalog';
import {readComparisonInput,writeComparisonInput} from '../../lib/comparison-input';
import {ResearchMaintenance} from './research-maintenance';
import {MathText} from './math-text';
import type {GraphTaskContext,GraphTaskPaper,GraphRelevance} from '../../lib/graph-task';
import type {RouteSelection} from './use-route-selection';
import {comparisonEligibilityText} from '../../lib/comparison-eligibility';
import {LibraryCitationNeighborhood,type LibraryCitationSnapshot} from './library-citation-neighborhood';
import {LibrarySimilarityExplorer} from './library-similarity-explorer';
type Catalog={items:LibraryPaper[];total:number;nextOffset:number|null;coverage:{total:number;checked:number;noLinks:number;blocked:number};terms:string[]};
export type LibraryExploreState={query?:string;scope?:'related'|'all';page?:number;focusId?:string;neighbor?:string;display?:'list'};
export function LibraryExplorer({spaceId,trackId='',locale,onOpen,initialPaperId='',initialState={},onStateChange,routes=[],onCompare,inputStorageKey='',initialQuestion='',controlledSelection,compareTrackId,active=true,graphMode='citations',onGraphMode}:{spaceId:string;trackId?:string;inputStorageKey?:string;initialQuestion?:string;controlledSelection?:RouteSelection;locale:'zh'|'en';onOpen:(id:string)=>void;initialPaperId?:string;initialState?:LibraryExploreState;onStateChange?:(state:LibraryExploreState,history:'push'|'replace')=>void;routes?:{id:string;title:string}[];onCompare?:(trackId:string,context:GraphTaskContext)=>void;compareTrackId?:string;active?:boolean;graphMode?:'citations'|'similarity';onGraphMode?:(mode:'citations'|'similarity')=>void}) {
  const zh=locale==='zh', [query,setQuery]=useState(initialState.query||''),[all,setAll]=useState(initialState.scope==='all'),[offset,setOffset]=useState(Math.max(0,((initialState.page||1)-1)*24)),[reload,setReload]=useState(0),[data,setData]=useState<Catalog|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[saving,setSaving]=useState('');
  const initialFocusId=initialState.focusId||initialPaperId;
  const restoreKey=JSON.stringify([spaceId,initialPaperId,initialState.query,initialState.scope,initialState.page,initialState.focusId]);
  const [restoredViewKey,setRestoredViewKey]=useState(restoreKey);
  const [focus,setFocus]=useState<{id:string;title:string}|null>(initialFocusId?{id:initialFocusId,title:zh?'所选论文':'Selected paper'}:null),[graph,setGraph]=useState<LibraryCitationSnapshot|null>(null),[checking,setChecking]=useState(false),[graphError,setGraphError]=useState('');
  const [savedInput]=useState(()=>inputStorageKey?readComparisonInput(inputStorageKey,spaceId):undefined);
  const questionTouched=useRef(Boolean(savedInput));
  const [localSelection,setLocalSelection]=useState<GraphTaskPaper[]>(savedInput?.papers||[]),[localQuestion,setLocalQuestion]=useState(savedInput?.question??initialQuestion),[comparisonRoute,setComparisonRoute]=useState(trackId),[review,setReview]=useState<{key:string;items:GraphRelevance[]}|null>(null),[reviewing,setReviewing]=useState(false);
  const selection=controlledSelection?.value.papers || localSelection;
  const canSelect=Boolean(trackId||!controlledSelection||compareTrackId);
  const question=controlledSelection?.value.question ?? localQuestion;
  const setSelection=(update:GraphTaskPaper[]|((list:GraphTaskPaper[])=>GraphTaskPaper[]))=>{const papers=typeof update==='function'?update(selection):update; if(controlledSelection)controlledSelection.change({...controlledSelection.value,papers});else setLocalSelection(papers);};
  const setQuestion=(value:string)=>{if(controlledSelection)controlledSelection.change({...controlledSelection.value,question:value});else setLocalQuestion(value);};
  useEffect(()=>{if(!questionTouched.current&&initialQuestion){setQuestion(initialQuestion);questionTouched.current=true}},[initialQuestion]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Report an external storage failure without changing the user's selection.
  useEffect(()=>{if(inputStorageKey&&!writeComparisonInput(inputStorageKey,{spaceId,question,papers:selection}))setError(zh?"无法暂存比较选择，请保留当前页。":"Selection storage unavailable; keep this page open.")},[inputStorageKey,spaceId,question,selection,zh]);
  const reviewKey=JSON.stringify([spaceId,question,selection]);const reviewRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>reviewRequest.current?.abort(),[]);
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setReload(n=>n+1);},60000);return()=>clearInterval(timer);},[]);
  const toggle=(p:GraphTaskPaper)=>{if(!canSelect)return;reviewRequest.current?.abort();setReviewing(false);setSelection(list=>list.some(i=>i.canonicalId===p.canonicalId)?list.filter(i=>i.canonicalId!==p.canonicalId):list.length<3?[...list,p]:list);};
  const assess=async()=>{reviewRequest.current?.abort();const c=new AbortController();reviewRequest.current=c;setReviewing(true);setError('');try{const r=await fetch('/api/graph-relevance',{method:'POST',signal:AbortSignal.any([c.signal,AbortSignal.timeout(120000)]),headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,question,canonicalIds:selection.map(p=>p.canonicalId)})});if(!r.ok)throw Error();const d=await r.json() as {assessments:GraphRelevance[]};if(!c.signal.aborted)setReview({key:reviewKey,items:d.assessments});}catch{if(!c.signal.aborted)setError(zh?'相关性核对未完成，请检查模型连接后重试。':'Relevance review did not finish. Check the model connection and retry.');}finally{if(reviewRequest.current===c)setReviewing(false);}};
  const graphRequest=useRef<AbortController|null>(null); const focusElement=useRef<HTMLDivElement|null>(null); const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>()=>graphRequest.current?.abort(),[]);
  useEffect(()=>{const delay=(graph?.retryAt||0)-Date.now();if(delay<=0)return;const timer=setTimeout(()=>setNow(Date.now()),delay+50);return()=>clearTimeout(timer);},[graph?.retryAt]);
  const emitState=(next:Partial<LibraryExploreState>,history:'push'|'replace')=>onStateChange?.({query:query||undefined,scope:all?'all':'related',page:Math.floor(offset/24)+1,focusId:focus?.id,neighbor:initialState.neighbor,display:initialState.display,...next},history);
  const chooseFocus=(next:{id:string;title:string})=>{graphRequest.current?.abort();setGraph(null);setGraphError('');setChecking(false);setFocus(next);emitState({focusId:next.id,neighbor:undefined,display:undefined},'push');requestAnimationFrame(()=>{focusElement.current?.focus({preventScroll:true});focusElement.current?.scrollIntoView({behavior:'auto',block:'start'});});};
  if(restoredViewKey!==restoreKey){
    setRestoredViewKey(restoreKey);
    const nextQuery=initialState.query||'',nextAll=initialState.scope==='all',nextOffset=Math.max(0,((initialState.page||1)-1)*24),nextFocus=initialState.focusId||initialPaperId;
    if(nextQuery!==query||nextAll!==all||nextOffset!==offset){setQuery(nextQuery);setAll(nextAll);setOffset(nextOffset);setData(null);}
    if(nextFocus!==(focus?.id||'')){setGraph(null);setGraphError('');setChecking(false);setFocus(nextFocus?{id:nextFocus,title:zh?'所选论文':'Selected paper'}:null);}
  }
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{setLoading(true);setError('');fetch(`/api/library-catalog?spaceId=${encodeURIComponent(spaceId)}&trackId=${encodeURIComponent(trackId)}&q=${encodeURIComponent(query)}&scope=${all?'all':'related'}&offset=${offset}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(!controller.signal.aborted)setData(d as Catalog);}).catch(()=>{if(!controller.signal.aborted)setError(zh?'文献集合暂时无法读取，请重试。':'Could not load papers. Retry.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},200);return()=>{clearTimeout(timer);controller.abort();};},[spaceId,trackId,query,all,offset,reload,zh]);
  useEffect(()=>{
    if(trackId||!focus||checking||graphMode!=='citations')return;
    const controller=new AbortController();graphRequest.current?.abort();graphRequest.current=controller;
    fetch(`/api/library-graph?spaceId=${encodeURIComponent(spaceId)}&paperId=${encodeURIComponent(focus.id)}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])})
      .then(async response=>{if(!response.ok)throw Error();return response.json() as Promise<LibraryCitationSnapshot>;})
      .then(result=>{if(!controller.signal.aborted){setGraph(result);setGraphError('');setNow(Date.now());}})
      .catch(()=>{if(!controller.signal.aborted)setGraphError(zh?'暂时无法读取引用关系。':'Citation links could not load.');});
    return()=>controller.abort();
  },[focus,spaceId,trackId,zh,reload,checking,graphMode]);
  const save=async(p:LibraryPaper,status:string,category:string)=>{setSaving(p.id);setError('');try{const r=await fetch('/api/library-catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,trackId,paperId:p.id,status,category})});if(!r.ok)throw Error();setReload(n=>n+1);}catch{setError(zh?'保存失败，原状态未改变。':'Save failed. Original selection is preserved.');}finally{setSaving('');}};
  const check=async()=>{
    if(!focus||checking)return;
    graphRequest.current?.abort();const controller=new AbortController();graphRequest.current=controller;
    setChecking(true);setGraphError('');
    try{
      const response=await fetch('/api/library-graph',{method:'POST',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(65000)]),headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,paperId:focus.id})});
      if(!response.ok)throw Error();
      const result=await response.json() as LibraryCitationSnapshot;
      if(!controller.signal.aborted){setGraph(result);setNow(Date.now());}
    }catch{if(!controller.signal.aborted)setGraphError(zh?'本次查询未完成，已显示的引用仍保留。':'The query did not finish. Visible links are preserved.');}
    finally{if(graphRequest.current===controller&&!controller.signal.aborted)setChecking(false);}
  };
  const catalog=<>
    {!trackId&&data&&<details className="pi-processing-details"><summary>{zh?'引用查询详情':'Citation coverage details'}</summary><dl className="pi-library-coverage"><div><dt>{zh?'论文库':'Library'}</dt><dd>{data.coverage.total}</dd></div><div><dt>{zh?'已查询关系':'Queried'}</dt><dd>{data.coverage.checked||0}</dd></div><div><dt>{zh?'尚未完成查询':'Not completed'}</dt><dd>{data.coverage.total-(data.coverage.checked||0)}</dd></div><div><dt>{zh?'查询未返回关系':'No links returned'}</dt><dd>{data.coverage.noLinks||0}</dd></div></dl></details>}
    <div className="pi-library-controls"><label>{zh?'搜索题名、作者或摘要':'Search title, author or abstract'}<input type="search" value={query} onChange={e=>{const value=e.target.value;setQuery(value);setOffset(0);setData(null);emitState({query:value||undefined,page:1},'replace');}} /></label>{trackId&&<label><input type="checkbox" checked={all} onChange={e=>{const checked=e.target.checked;setAll(checked);setOffset(0);setData(null);emitState({scope:checked?'all':'related',page:1},'push');}} />{zh?'从整个论文库添加':'Add from all library papers'}</label>}</div>
    <details className="pi-library-selection" open={controlledSelection?undefined:selection.length>0?true:undefined}><summary>{controlledSelection?(zh?'调整问题或核对相关性':'Adjust question or review relevance'):(zh?'选择论文核对问题、继续比较':'Select papers to review a question and compare')} · {selection.length}/3</summary><p>{zh?'选择不改变论文的收录、推荐或阅读状态。每篇论文旁显示可比较状态，工作台会再次核对。':'Selection does not change acceptance, recommendation or reading status. Eligibility is shown beside each paper and rechecked in the comparison workspace.'}</p><label>{zh?'具体研究问题':'Specific research question'}<textarea rows={2} maxLength={1000} disabled={!canSelect} value={question} onChange={e=>{reviewRequest.current?.abort();setReviewing(false);questionTouched.current=true;setQuestion(e.target.value);}} /></label>{!controlledSelection&&selection.map(p=><p key={p.canonicalId}>{p.title} <button type="button" onClick={()=>toggle(p)}>{zh?'移除':'Remove'}</button></p>)}<button type="button" disabled={!selection.length||question.trim().length<6||reviewing} onClick={()=>void assess()}>{reviewing?(zh?'正在核对摘要…':'Reviewing abstracts…'):(zh?'按问题核对已选论文':'Review selected papers against question')}</button>{onCompare&&!controlledSelection&&<><label>{zh?'比较结果保存到哪条路线':'Route for the comparison'}<select value={comparisonRoute} onChange={e=>setComparisonRoute(e.target.value)}><option value="">{zh?'选择路线':'Choose a route'}</option>{routes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label><button type="button" disabled={selection.length<2||!comparisonRoute} onClick={()=>onCompare(comparisonRoute,{spaceId,question,papers:selection})}>{zh?'打开比较工作台':'Open comparison workspace'}</button></>}{review?.key===reviewKey&&review.items.map(item=><article key={item.canonicalId}><strong>{selection.find(p=>p.canonicalId===item.canonicalId)?.title}</strong><p>{zh?item.reasonZh:item.reasonEn}</p>{item.quote&&<blockquote>{item.quote}</blockquote>}<p>{zh?item.limitationZh:item.limitationEn}</p></article>)}</details>
    {error&&<p role="alert">{error}<button type="button" onClick={()=>setReload(n=>n+1)}>{zh?'重试':'Retry'}</button></p>}{loading&&<p role="status">{zh?'读取文献中…':'Loading…'}</p>}
    {data&&<><p className="pi-library-count">{data.total} {zh?'篇匹配':'matching papers'}{trackId&&data.terms.length?` · ${zh?'匹配词':'Terms'}：${data.terms.join('、')}`:''}</p>{!data.items.length&&<p>{zh?'没有匹配材料，可清除搜索或查看整个论文库。':'No matches. Clear the search or browse the full library.'}</p>}<div className="pi-library-rows">{data.items.map(p=><article key={p.id}><div><span>{p.publishedAt?.slice(0,4)||'—'} · {p.inRoute?(zh?'已在关键主干':'In backbone'):p.membership==='included'?(zh?'自行加入集合':'Added to collection'):p.membership==='excluded'?(zh?'已排除自动匹配':'Excluded from matching'):trackId?(p.relevance==='direct'?(zh?'摘要已核对 · 直接相关':'Abstract reviewed · directly relevant'):p.relevance==='partial'?(zh?'摘要已核对 · 部分相关':'Abstract reviewed · partially relevant'):p.relevance==='insufficient'?(zh?'已尝试核对 · 依据不足':'Review attempted · insufficient evidence'):p.relevance==='unrelated'?(zh?'摘要核对 · 不相关':'Abstract reviewed · unrelated'):(zh?'词项匹配 · 待核对':'Keyword match · needs review')):(zh?'论文库材料':'Library paper')}</span><h3><button type="button" className="pi-paper-title-link" onClick={()=>onOpen(p.id)}><MathText inline>{p.title}</MathText></button></h3><p>{p.authors}</p><p className="pi-catalog-eligibility">{comparisonEligibilityText(p.comparisonEligibility,zh)}</p>{trackId&&p.assessmentJson&&<RouteRelevance paper={p} zh={zh} />}<details className="pi-paper-processing"><summary>{zh?'收录与查询记录':'Review and query record'}</summary><small>{p.recommended?(zh?'曾通过推荐评审':'Previously recommended'):(zh?'未成为正式推荐':'Not a formal recommendation')} · {p.graphStatus==='ready'?(zh?'引用已查询':'Links queried'):p.graphStatus==='partial'?(zh?'引用部分覆盖':'Partial link coverage'):p.graphStatus==='empty'?(zh?'来源未返回引用':'No links returned'):p.graphStatus==='missing_id'?(zh?'缺少可查询标识':'Missing supported identifier'):p.graphStatus==='error'?(zh?'来源暂不可用':'Source unavailable'):(zh?'引用待查询':'Links not queried')}</small></details>{trackId&&!p.inRoute&&p.membership!=='included'&&p.matchTerms.length>0&&<p>{zh?'匹配依据':'Matched terms'}：{p.matchTerms.join('、')}</p>}</div><footer><label><input type="checkbox" aria-label={`${zh?"选择比较":"Select for comparison"} ${p.title}`} checked={selection.some(i=>i.canonicalId===p.canonicalId)} disabled={!canSelect||!selection.some(i=>i.canonicalId===p.canonicalId)&&(p.comparisonEligibility!=='eligible'||selection.length>=3)} onChange={()=>toggle(p)} />{zh?"选择":"Select"}</label><button type="button" onClick={()=>onOpen(p.id)}>{zh?'阅读论文':'Read paper'}</button>{!trackId?<button type="button" onClick={()=>{chooseFocus({id:p.id,title:p.title});}}>{zh?'以此探索引用':'Explore citations'}</button>:!p.inRoute&&<><select aria-label={zh?'归类并加入文献集合':'Classify and add to collection'} disabled={saving===p.id} value={p.membership==='included'?p.category||'related':''} onChange={e=>{if(e.target.value)void save(p,'included',e.target.value);}}><option value="">{zh?'加入文献集合…':'Add to collection…'}</option><option value="related">{zh?'相关研究':'Related work'}</option><option value="method">{zh?'方法':'Method'}</option><option value="background">{zh?'背景':'Background'}</option><option value="evidence">{zh?'待核对证据':'Evidence to examine'}</option></select><button type="button" disabled={saving===p.id||p.membership==='excluded'} onClick={()=>void save(p,'excluded',p.category||'related')}>{zh?'从集合排除':'Exclude from collection'}</button></>}</footer></article>)}</div><nav aria-label={zh?'文献分页':'Paper pages'}><button type="button" disabled={offset===0} onClick={()=>{const next=Math.max(0,offset-24);setOffset(next);emitState({page:Math.floor(next/24)+1},'push');}}>{zh?'上一页':'Previous'}</button><span>{Math.floor(offset/24)+1} / {Math.max(1,Math.ceil(data.total/24))}</span><button type="button" disabled={data.nextOffset===null} onClick={()=>{const next=data.nextOffset!;setOffset(next);emitState({page:Math.floor(next/24)+1},'push');}}>{zh?'下一页':'Next'}</button></nav></>}
  </>;
  return <section className="pi-library-explorer">
    {(!focus||trackId) && <header><div><h2>{trackId?(zh?'相关文献集合':'Related literature'):(zh?'从整个论文库探索':'Explore your entire library')}</h2><p>{trackId?(zh?'默认展示已核对相关性或由你选用的材料。方法关联保留理由与摘要出处；可从整个论文库继续查找。收录不等于正式证据。':'Shows reviewed relevant materials and selected route papers. Method connections retain reasons and abstract evidence; search the entire library to add more. Inclusion is not formal evidence.'):(zh?'每篇库内论文都可作为起点。没有查到关系，不代表论文不重要或没有引用。':'Any library paper can be a starting point. Missing links do not imply lack of value or citations.')}</p></div></header>}
    {!trackId&&focus&&<div ref={focusElement} tabIndex={-1} className="pi-library-citation-start">
      {onGraphMode&&<nav aria-label={zh?'论文关系类型':'Paper relationships'} className="pi-graph-mode-tabs">
        <button type="button" aria-pressed={graphMode==='citations'} onClick={()=>onGraphMode('citations')}>{zh?'直接引用':'Direct citations'}</button>
        <button type="button" aria-pressed={graphMode==='similarity'} onClick={()=>onGraphMode('similarity')}>{zh?'相似论文':'Similar papers'}</button>
      </nav>}
      {graphMode==='similarity'?<LibrarySimilarityExplorer spaceId={spaceId} paperId={focus.id} locale={locale} onOpen={onOpen} onOrigin={chooseFocus} active={active}
        selectedId={initialState.neighbor?.startsWith('similar:')?initialState.neighbor.slice(8):''} onSelect={id=>emitState({neighbor:'similar:'+id},'replace')}
        selection={compareTrackId?controlledSelection:undefined} onCitations={()=>onGraphMode?.('citations')}/>:
      <LibraryCitationNeighborhood key={focus.id} paper={focus} graph={graph} locale={locale} checking={checking} loading={!graph&&!graphError} cooling={Boolean(graph&&graph.retryAt>now)} error={graphError}
        active={active} selection={compareTrackId?controlledSelection:undefined} mode={initialState.display||'graph'} selected={initialState.neighbor||''} onSelect={neighbor=>emitState({neighbor},'replace')} onMode={mode=>emitState({display:mode==='list'?'list':undefined},'replace')}
        onCheck={()=>void check()} onRetry={()=>{setGraphError('');setReload(n=>n+1);}} onOpen={onOpen} onFocus={chooseFocus} />}
    </div>}
    {trackId ? catalog : <details key={focus?.id||'catalog'} className="pi-library-catalog-switch" open={!focus||undefined}>
      <summary>{focus?(zh?'从论文库更换起点':'Choose another starting paper'):(zh?'从论文库选择起点':'Choose a starting paper')}</summary>
      {catalog}
    </details>}
    <ResearchMaintenance key={spaceId+trackId} spaceId={spaceId} trackId={trackId} locale={locale} />
  </section>;
}

function RouteRelevance({paper,zh}:{paper:LibraryPaper;zh:boolean}) {
  let a:GraphRelevance;try{a=JSON.parse(paper.assessmentJson||'{}');}catch{return null;}
  return <details className="pi-route-relevance"><summary>{zh?'为什么归到这里':'Why this route'}{paper.reviewedAt?' · '+new Date(paper.reviewedAt).toLocaleDateString(zh?'zh-CN':'en-US'):''}</summary><p>{zh?a.reasonZh:a.reasonEn}</p>{a.quote&&<blockquote>{a.quote}</blockquote>}<p>{zh?a.limitationZh:a.limitationEn}</p></details>;
}
