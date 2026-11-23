'use client';
import {useEffect,useRef,useState} from 'react';
import { workspaceFetch as fetch } from '../../lib/workspace-request';
import {DigestOverview,type DigestOverviewData} from './digest-overview';
import {MathText} from './math-text';
import './research-entry.css';
import {PaperFigure} from './paper-figure';
import type {TaskBriefView} from '../../lib/task-brief';
import {TaskBriefEvidence} from './task-brief-evidence';
import {taskBriefReading,taskBriefLeads} from '../../lib/task-brief-presentation.mjs';
import {digestDiscoveries} from '../../lib/research-digest.mjs';
import {ProblemDiscovery} from './problem-discovery';

type Goal = {id:string;trackId:string;question:string;status:string;monitoringStatus:string};
type Reading = {id:string;title:string;whyZh:string;whyEn:string;focusZh:string;focusEn:string;checkZh:string;checkEn:string;contributionZh?:string;contributionEn?:string};
type Result = {goal:Goal|null;papers:Reading[]};
function checkedResult(value:unknown, requireGoal=false):Result {
 const data=value as Result|null;
 if(!data||!Array.isArray(data.papers)||!('goal' in data))throw Error('Invalid question response');
 const goal=data.goal;
 if(goal===null){if(requireGoal)throw Error('Missing saved question')}
 else if(!goal||typeof goal.id!=='string'||!goal.id||typeof goal.trackId!=='string'||typeof goal.question!=='string'||!goal.question.trim()||typeof goal.status!=='string'||typeof goal.monitoringStatus!=='string')throw Error('Invalid saved question');
 if(data.papers.some(p=>!p||typeof p.id!=='string'||typeof p.title!=='string'))throw Error('Invalid reading response');
 return data;
}
export function ResearchEntry({spaceId,spaceName,fieldDescription,locale,demo,refreshKey,scanStatus,blocked,resume,onProgress,onDiscover,onRead,onRoute,onSaved,onReadingList,excludedReadingIds=[],mode="reading",fallbackPapers=[],onFeaturedReadings,bibliography=[],searchPapers=[],briefDate,onLibrary,overview,taskBrief,taskBriefError,discoveryNoticeVisible=false}: {
 spaceId:string;spaceName?:string;fieldDescription?:string;locale:'zh'|'en';demo:boolean;refreshKey:string;scanStatus:string;blocked:string;
 onDiscover:()=>void;onRead:(id:string,task?:{trackId:string;question:string})=>void;onRoute:(id:string)=>void;onSaved:()=>void;onReadingList:(ids:string[])=>void;
 resume:{id:string;title:string;readingNote:string}|null;onProgress:()=>void;
 excludedReadingIds?:string[];
 bibliography?:{id:string;venue:string;authors:string;publishedAt:string|null;recommendedAt?:string|null}[];
 searchPapers?:{id:string;title:string;venue?:string;authors?:string;publishedAt?:string|null;discoveredAt?:string;qualityStage?:string|null;screeningReason?:string;researchProblemId?:string;discoverySources?:{key:string;labelZh:string;labelEn:string}[];userState?:string;feedback?:string|null;readingStatus?:string}[];
 taskBrief?:TaskBriefView|null;taskBriefError?:boolean;overview?:DigestOverviewData|null;briefDate?:string;onLibrary?:()=>void;discoveryNoticeVisible?:boolean;
 mode?:"home"|"reading"|"discovery";fallbackPapers?:Reading[];onFeaturedReadings?:(ids:string[])=>void;
}) {
 const zh=locale==='zh';
 const [result,setResult]=useState<Result|null>(null),[editing,setEditing]=useState(false),[question,setQuestion]=useState(''),[seed,setSeed]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[readError,setReadError]=useState(false),[retry,setRetry]=useState(0),[saved,setSaved]=useState(false);
 const [removing,setRemoving]=useState(false);
 const [removed,setRemoved]=useState(false);
 const [evidenceRequest,setEvidenceRequest]=useState({paperId:'',nonce:0});
 const showEvidence=(paperId:string)=>setEvidenceRequest(current=>({paperId,nonce:current.nonce+1}));
 const alive=useRef(true),chosen=useRef(''),generation=useRef(0),submitting=useRef(false);
 const questionHeading=useRef<HTMLHeadingElement>(null),addButton=useRef<HTMLButtonElement>(null),removeButton=useRef<HTMLButtonElement>(null);
 const keepButton=useRef<HTMLButtonElement>(null),questionInput=useRef<HTMLTextAreaElement>(null);
 const returnFocus=useRef<'add'|'remove'|null>(null);
 const readingCallback=useRef(onReadingList);
 useEffect(()=>{readingCallback.current=onReadingList},[onReadingList]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false};},[]);
 useEffect(()=>{
  if(removing)keepButton.current?.focus({preventScroll:true});
  else if(editing)questionInput.current?.focus({preventScroll:true});
  else if(returnFocus.current){
   ((returnFocus.current==='remove'?removeButton.current:addButton.current)||questionHeading.current)?.focus({preventScroll:true});
   returnFocus.current=null;
  }
 },[editing,removing,result?.goal?.id]);
 const clearQuestion=()=>{
  generation.current++;chosen.current='';setResult({goal:null,papers:[]});readingCallback.current([]);
  setRemoving(false);setSaved(false);setRemoved(true);setReadError(false);setError('');
  setEvidenceRequest({paperId:'',nonce:0});
 };
 useEffect(()=>{
  if(submitting.current)return;
  const abort=new AbortController(), request=++generation.current,pinned=chosen.current;
  fetch('/api/research-entry?'+new URLSearchParams({spaceId,goalId:pinned}),{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])})
   .then(async r=>{
    if(r.status===410&&pinned){
     const receipt=await r.json() as {removedGoalId?:string};
     if(receipt.removedGoalId===pinned)return null;
    }
    if(!r.ok)throw Error();
    return checkedResult(await r.json(),Boolean(pinned));
   })
   .then(data=>{
    if(abort.signal.aborted||submitting.current||request!==generation.current)return;
    if(data===null){clearQuestion();return;}
    if(pinned&&data.goal?.id!==pinned)throw Error('Question changed');
    chosen.current=data.goal?.id||'';setResult(data);readingCallback.current(data.papers.map(p=>p.id));setReadError(false);
    if(data.goal)setRemoved(false);
   })
   .catch(()=>{if(!abort.signal.aborted&&request===generation.current)setReadError(true)});
  return()=>abort.abort();
 },[spaceId,refreshKey,retry]);
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(submitting.current)return;submitting.current=true;generation.current++;setBusy(true);setError('');
  try {
   const r=await fetch('/api/research-entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,question,seed,locale}),signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error(String(r.status));
   const data=checkedResult(await r.json(),true);
   if(!alive.current)return;
   generation.current++;chosen.current=data.goal?.id||'';setResult(data);readingCallback.current(data.papers.map(p=>p.id));setEditing(false);setSaved(true);setRemoved(false);setReadError(false);setEvidenceRequest({paperId:'',nonce:0});onSaved();
   if(!demo&&!blocked)onDiscover();
  } catch(e) {if(alive.current)setError(e instanceof Error&&e.message==='409'?(zh?'该问题已暂停或结束，请在研究路线中管理。':'This question is paused or resolved. Manage it in Research.'):(zh?'未能确认保存结果，输入已保留。可重试，同一问题不会重复创建。':'Could not confirm the save. Your input is preserved; retrying the same question is safe.'))}
  finally {submitting.current=false;if(alive.current)setBusy(false)}
 };
 const remove=async()=>{
  if(!result?.goal||submitting.current)return;
  submitting.current=true;generation.current++;setBusy(true);setError('');
  try {
   const r=await fetch('/api/research-entry',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,goalId:result.goal.id}),signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error();const data=await r.json() as {removed?:boolean}|null;if(data?.removed!==true)throw Error();
   if(!alive.current)return;
   returnFocus.current='add';clearQuestion();onSaved();
  }catch{if(alive.current)setError(zh?'暂未确认取消结果。可以重试核对状态。':'Could not confirm removal. Retry to check the saved status.')}
  finally{submitting.current=false;if(alive.current)setBusy(false)}
 };
 const startDraft=()=>{setQuestion('');setSeed('');setError('');setEditing(true);setRemoving(false);setSaved(false);};
 const discardDraft=()=>{if(busy)return;returnFocus.current='add';setEditing(false);setQuestion('');setSeed('');setError('');};
 const keepQuestion=()=>{if(busy)return;returnFocus.current='remove';setRemoving(false);setError('');};
 const handleEscape=(event:React.KeyboardEvent,cancel:()=>void)=>{
  if(event.key!=='Escape')return;
  event.preventDefault();event.stopPropagation();cancel();
 };
 const closeConfirmationOnEscape=(event:React.KeyboardEvent)=>handleEscape(event,keepQuestion);
 const discardDraftOnEscape=(event:React.KeyboardEvent)=>handleEscape(event,discardDraft);
 const goal=result?.goal;
 const inactive=Boolean(goal&&(goal.status!=='active'||goal.monitoringStatus!=='active'));
 const currentBrief=result&&taskBrief&&(!demo||!goal||goal.trackId)&&(taskBrief.scope.problemId||'')===(goal?.id||'')?taskBrief:null;
 const currentOverview=overview?.boundToTask&&!currentBrief?null:overview;
 const readPaper=(id:string)=>{
  const linked=goal&&(result?.papers.some(p=>p.id===id)||currentBrief?.records.some(p=>p.paperId===id)||searchPapers?.some(p=>p.id===id&&p.researchProblemId===goal.id));
  onRead(id,linked&&goal.trackId?{trackId:goal.trackId,question:goal.question}:undefined);
 };
 const visiblePapers=result?.papers.filter(p=>!excludedReadingIds.includes(p.id))||[];
 const queued=visiblePapers.filter(p=>p.id!==resume?.id);
 const taskReadings=taskBriefReading(currentBrief,goal?.id,excludedReadingIds);
 const usingTaskReadings=Boolean(taskReadings?.some(p=>p.id!==resume?.id));
 const homeReadings=(usingTaskReadings?taskReadings!:(goal?queued:fallbackPapers)).filter((p,i,a)=>p.id!==resume?.id&&!excludedReadingIds.includes(p.id)&&a.findIndex(x=>x.id===p.id)===i);
 const digestPapers=homeReadings.slice(0,6);
 const featuredKey=mode==='home'&&!editing&&!readError&&result?digestPapers.map(p=>p.id).join('|'):'';
 const featuredCallback=useRef(onFeaturedReadings);
 useEffect(()=>{featuredCallback.current=onFeaturedReadings},[onFeaturedReadings]);
 useEffect(()=>{featuredCallback.current?.(featuredKey?featuredKey.split('|'):[])},[spaceId,featuredKey]);
 const emptyHome=mode==='home'&&!resume&&!digestPapers.length;
 const viewProgress=Boolean(scanStatus||blocked||inactive||demo);
 const showNextAction=emptyHome&&result&&!readError&&!editing&&!(viewProgress&&discoveryNoticeVisible);
 const discoveries=currentBrief?taskBriefLeads(currentBrief,excludedReadingIds):digestDiscoveries(searchPapers,[...excludedReadingIds,...homeReadings.map(p=>p.id),...(resume?[resume.id]:[])],4);
 const metadataFor=(id:string)=>currentBrief?.records.filter(r=>r.paperId===id).map(r=>({id,venue:r.venue,authors:r.authors,publishedAt:r.publishedAt,recommendedAt:null}))[0]||bibliography.find(p=>p.id===id);
 const continuation=resume&&<article className={`pi-question-resume ${mode==="home"?"pi-reading-poster":""}`} aria-label={zh?'继续阅读':'Continue reading'}>
<div className="pi-poster-copy">{mode!=="home"&&<p className="pi-entry-eyebrow">{zh?'继续你的阅读':'CONTINUE READING'}</p>}<h4><MathText inline>{resume.title}</MathText></h4>{resume.readingNote&&<p className="pi-resume-note">{resume.readingNote}</p>}</div>
  {mode==="home"&&<PaperFigure key={spaceId+resume.id} spaceId={spaceId} paperId={resume.id} demo={demo} locale={locale}/>}
  <button className="primary" type="button" onClick={()=>readPaper(resume.id)}>{zh?'继续阅读与笔记':'Continue reading & notes'} →</button>
 </article>;
 if(mode==="discovery")return goal&&!demo?<ProblemDiscovery key={spaceId+goal.id} spaceId={spaceId} problemId={goal.id} locale={locale} onRead={readPaper} expanded/>:null;
 return <section className={`pi-question-entry ${mode==="home"?"pi-home-entry":""}`} aria-label={zh?'问题与第一批阅读':'Question and first reading'}>

  <div className="pi-today-question">
    <header><div><h2 ref={questionHeading} tabIndex={-1}>{zh?'研究问题':'Research question'}</h2>
      {goal&&!editing&&<p className="pi-question-title"><MathText inline>{goal.question}</MathText></p>}</div>
      {result&&!editing&&!removing&&(!emptyHome||goal||readError||discoveryNoticeVisible)&&<div className="pi-entry-actions">
        {goal&&mode==='home'&&goal.trackId&&<button type="button" onClick={()=>onRoute(goal.trackId)}>{zh?'查看路线':'Open route'}</button>}
        <button ref={addButton} type="button" disabled={busy} onClick={startDraft}>{!goal?(zh?'提出研究问题':'Add a research question'):demo?(zh?'体验自定义问题':'Try your own question'):(zh?'提出另一个问题':'Another question')}</button>
        {goal&&<button ref={removeButton} className="pi-action-remove" type="button" disabled={busy}
          onClick={()=>{setRemoving(true);setError('')}}>{zh?'取消跟踪':'Stop tracking'}</button>}
      </div>}
    </header>
    {removed&&!goal&&!editing&&<p className="pi-question-feedback" role="status">{zh?'已取消跟踪。论文和笔记可继续阅读。':'Tracking stopped. Your papers and notes remain available.'}</p>}
    {goal&&!editing&&removing&&<div className="pi-question-remove">
      <div role="group" aria-label={zh?'确认取消跟踪':'Confirm stopping tracking'} aria-busy={busy}>
        <p>{zh?'取消后，未来的检索将停止跟踪此问题。已有论文、收藏、笔记和研究记录都会保留。':'Stop tracking this question in future searches? Papers, saves, notes and research history will be kept.'}</p>
        <div className="pi-confirm-actions">
          <button ref={keepButton} type="button" disabled={busy} onClick={keepQuestion} onKeyDown={closeConfirmationOnEscape}>{error?(zh?'关闭确认':'Close confirmation'):(zh?'保留问题':'Keep question')}</button>
          <button className="pi-action-remove-confirm" type="button" disabled={busy} onClick={()=>void remove()} onKeyDown={closeConfirmationOnEscape}>{busy?(zh?'正在取消跟踪…':'Stopping…'):(zh?'确认取消跟踪':'Confirm stop tracking')}</button>
        </div>
        {error&&<p role="alert">{error}</p>}
      </div>
    </div>}
  {readError&&<p role="alert">{zh?'研究问题暂未载入，已有内容保留。':'Could not load the research question; saved content is preserved.'} <button type="button" onClick={()=>setRetry(n=>n+1)}>{zh?'重试':'Retry'}</button></p>}
  {!result&&!readError&&<p role="status">{zh?'正在读取研究问题…':'Loading your question…'}</p>}
  {editing&&<form onSubmit={event=>void submit(event)}>
   {spaceName&&<p className="pi-question-status">{zh?'保存到：':'Save to: '}{spaceName}</p>}
   <label>{zh?'你想弄清什么问题？':'What do you want to understand?'}<textarea ref={questionInput} rows={3} minLength={10} maxLength={520} required disabled={busy} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={discardDraftOnEscape} placeholder={zh?'例如：随机局部化中的协方差控制如何影响 KLS 谱隙界？':'For example: how does covariance control in stochastic localization affect KLS bounds?'}/></label>
   <label>{zh?'起点论文（选填）':'Starting paper (optional)'}<input maxLength={300} disabled={busy} value={seed} onChange={e=>setSeed(e.target.value)} onKeyDown={discardDraftOnEscape} placeholder={zh?'论文题名或 DOI，作为待核对线索':'Title or DOI, used as an unverified lead'}/></label>
   <p>{demo?(zh?'演示可保存本次体验的问题，不执行检索；自定义问题不会套用预设阅读结果。':'The demo keeps your question for this session without searching. Custom questions do not inherit preset results.'):(zh?'确认后加入本空间研究目标，用于后续检索与评审；先找文献，再核对假设、方法与局限。':'Confirm to add a research goal for future discovery and review, then check papers’ assumptions, methods and limitations.')}</p>
   {error&&<p role="alert">{error}</p>}
   <footer><button className="primary" disabled={busy||question.trim().length<10} type="submit" onKeyDown={discardDraftOnEscape}>{busy?(zh?'正在保存…':'Saving…'):demo?(zh?'保存演示问题':'Save demo question'):blocked?(zh?'确认问题':'Confirm question'):(zh?'确认问题并查找文献':'Confirm & find papers')}</button><button type="button" disabled={busy} onClick={discardDraft} onKeyDown={discardDraftOnEscape}>{zh?'放弃输入':'Discard input'}</button></footer>
  </form>}
  </div>
  {mode!=='home'&&(editing||!goal)&&continuation}
  {(mode==='home'||goal)&&!editing&&(mode==="home"?<>
   {resume&&<button className="pi-field-resume" type="button" onClick={()=>readPaper(resume.id)}>{zh?'继续上次阅读：':'Continue reading: '}<MathText inline>{resume.title}</MathText>{resume.readingNote&&<small>{resume.readingNote}</small>}<span className="pi-resume-action">{zh?'继续阅读与笔记':'Continue reading & notes'} →</span></button>}
   {showNextAction&&<section className="pi-home-next-action" aria-label={zh?'下一步':'Next step'}><div><h3>{viewProgress?(zh?'先查看当前任务与恢复进度':'Check the current task and recovery'):goal?(zh?'围绕当前问题查找可读材料':'Find reading for your research question'):(zh?'明确这次想弄清的问题':'Define what you want to understand')}</h3></div><button type="button" disabled={busy} onClick={()=>{if(viewProgress)onProgress();else if(goal)onDiscover();else startDraft()}}>{viewProgress?(zh?'查看进度与恢复':'View progress & recovery'):goal?(zh?'查找相关文献':'Find related papers'):(zh?'设定本次研究问题':'Define a research question')} →</button></section>}
   {inactive&&<p className="pi-question-status">{zh?'此问题已暂停或结束':'This problem is paused or resolved'}</p>}
   <section className="pi-research-digest" aria-label={zh?'阅读与发现简报':'Reading and discovery brief'}>
    <header className="pi-digest-heading"><div>
      <p>{goal?(zh?'围绕当前问题':'YOUR RESEARCH QUESTION'):(zh?'你的研究领域':'YOUR RESEARCH FIELD')}</p>
      <h3>{zh?'推荐阅读':'Recommended reading'}</h3>
    </div>{(currentBrief?.summary.briefDate||briefDate)&&<span>{currentBrief?.summary.briefDate||briefDate}</span>}</header>
    {!goal&&fieldDescription&&<p className="pi-digest-scope">{fieldDescription}</p>}
    {readError||!result?<p role="status">{readError?(zh?'问题关联暂未核对，推荐稍后显示。':'Question links could not be verified. Recommendations will appear when available.'):(zh?'正在整理已有阅读…':'Loading saved readings…')}</p>:<>
    {digestPapers.length>0&&<div className="pi-digest-section-heading"><span>
      {zh?`${digestPapers.length} 篇`:`${digestPapers.length} papers`}{usingTaskReadings?(zh?' · 本次任务':' · From this task'):''}
    </span></div>}
    {digestPapers.length>0?<div className="pi-digest-grid">{digestPapers.map(p=>{const meta=metadataFor(p.id);return <article key={p.id}>
     <p className="pi-digest-meta">{meta?.venue}{meta?.publishedAt?' · '+meta.publishedAt.slice(0,4):''}</p>
     <h4><button type="button" onClick={()=>readPaper(p.id)}><MathText inline>{p.title}</MathText></button></h4>
     {meta?.authors&&<p className="pi-digest-authors">{meta.authors}</p>}
     <p className="pi-digest-reason"><strong>{zh?'为什么读':'Why read'}</strong><MathText inline>{(zh?p.whyZh:p.whyEn)||(zh?'推荐理由尚未保存，请先打开论文核对相关性。':'No saved reading rationale; open the paper to check relevance.')}</MathText></p>
     {(zh?p.focusZh:p.focusEn)&&<details className="pi-digest-focus"><summary>{zh?'先看哪里':'Start with'}</summary><p><MathText inline>{zh?p.focusZh:p.focusEn}</MathText></p></details>}
     {((zh?p.contributionZh:p.contributionEn)||(zh?p.checkZh:p.checkEn))&&<details className="pi-digest-boundaries"><summary>{zh?'主要发现与适用边界':'Finding & limits'}</summary>{(zh?p.contributionZh:p.contributionEn)&&<p><MathText inline>{(zh?p.contributionZh:p.contributionEn)||''}</MathText></p>}{(zh?p.checkZh:p.checkEn)&&<p><strong>{zh?'仍需核对：':'Check next: '}</strong><MathText inline>{zh?p.checkZh:p.checkEn}</MathText></p>}</details>}
     <PaperFigure key={spaceId+p.id} spaceId={spaceId} paperId={p.id} demo={demo} locale={locale}/>
     <footer><button className="pi-digest-read" type="button" onClick={()=>readPaper(p.id)}>{zh?'阅读与笔记':'Read & take notes'} →</button>
      {currentBrief&&<button type="button" onClick={()=>showEvidence(p.id)}>{zh?'查看摘要依据':'View abstract evidence'}</button>}</footer>
    </article>})}</div>:<p className="pi-digest-empty">{goal?(zh?'当前问题暂无可读的已核验推荐。下面仍可查看本领域检索材料。':'No verified reading is available for this question. Field discovery materials remain below.'):(zh?'本领域暂无可读的正式推荐。先看看已发现的材料，评审通过后会进入阅读区。':'No published reading is available for this field. Discovered materials remain below while reviews continue.')}</p>}
    </>}
    {taskBriefError&&<p role="status" className="pi-digest-caption">{zh?'任务简报暂未更新，已有内容保留。':'Task brief could not refresh; saved content is preserved.'}</p>}
    {currentOverview&&<details className="pi-today-overview"><summary>{zh?'查看检索综述':'View discovery overview'}</summary>
      <DigestOverview data={currentOverview} locale={locale} demo={demo} onRead={readPaper} onEvidence={currentBrief?showEvidence:undefined}/></details>}
    {currentBrief&&<TaskBriefEvidence key={currentBrief.snapshotId+':'+evidenceRequest.nonce} spaceId={spaceId} brief={currentBrief} locale={locale} demo={demo}
      paperId={evidenceRequest.paperId||undefined} onRead={readPaper}/>}
    <details className="pi-digest-leads"><summary><span>{zh?'检索线索':'Discovery leads'} · {discoveries.length}</span><span>{zh?'尚未入选，展开查看':'Not selected · expand to inspect'}</span></summary><section className="pi-digest-discoveries"><div className="pi-digest-section-heading"><h4>{zh?'检索线索':'Discovery leads'}</h4><button type="button" onClick={onProgress}>{zh?'查看发现进度':'View discovery'}</button></div>
     <p className="pi-digest-caption">{demo?(zh?'空间检索样例，未执行真实检索或评审。':'Sample discovery materials; no live search or review.'):(currentBrief?(zh?'参与本次任务的材料，状态按简报保存时记录；包含此前候选，不等于新发现或正式推荐。':'Materials used in this task, with review status at capture; may include backlog candidates and are not formal recommendations.'):(zh?'来自本空间已有来源记录，按发现时间排列；不等于本轮新增或当前问题的推荐。':'From saved source records in this space, ordered by discovery date; not necessarily new this run or recommended for this question.'))}</p>
     {discoveries.length?<ul>{discoveries.map(p=><li key={p.id}><div><p className="pi-digest-meta">{p.discoverySources?.map(source=>zh?source.labelZh:source.labelEn).filter(Boolean).join(' · ')}{p.discoveredAt?' · '+(zh?'发现于 ':'Found ')+p.discoveredAt.slice(0,10):''}</p><h4><button type="button" onClick={()=>readPaper(p.id)}><MathText inline>{p.title}</MathText></button></h4>{p.venue&&<p className="pi-digest-authors">{p.venue}{p.publishedAt?' · '+p.publishedAt.slice(0,4):''}</p>}{p.qualityStage==='reviewed'&&p.screeningReason&&<p className="pi-digest-reason">{p.screeningReason}</p>}</div><span className="pi-digest-stage">{p.qualityStage==='reviewed'?(zh?'已评审 · 未入选':'Reviewed · not selected'):p.qualityStage==='reviewing'?(zh?'核验中':'Under verification'):p.qualityStage==='awaiting_evidence'?(zh?'待补证据':'Evidence needed'):(zh?'待评审':'Awaiting review')}</span></li>)}</ul>:<p className="pi-digest-empty">{zh?'暂无可展示的未入选检索材料。可在发现进度中查看任务及来源记录。':'No unselected discovery materials are available. See Discovery for tasks and source records.'}</p>}
    </section></details>
    <footer className="pi-digest-footer"><button type="button" onClick={onLibrary||onProgress}>{zh?'查看检索文献库':'Browse discovered papers'}</button></footer>
   </section>
  </>:goal?<>
   {spaceName&&<p className="pi-question-status">{zh?'研究空间：':'Research space: '}{spaceName}</p>}
   <p className="pi-question-status" role="status">{demo?(zh?'示例流程 · 未执行检索或模型评审':'Example flow · no search or model review'):inactive?(zh?'该问题已暂停或结束。':'This question is paused or resolved.'):result.papers.length>0?(zh?'已有关联阅读 · 根据当前问题的评审结果推荐':'Related readings are available from reviews linked to this question'):saved?(zh?'问题已保存，等待已核验的关联阅读。':'Question saved; awaiting verified related readings.'): (zh?'已确认的研究目标 · 最多展示 5 篇关联阅读':'Confirmed research goal · up to 5 related readings')}</p>
   {scanStatus&&!demo&&<p role="status">{scanStatus}</p>}
   {continuation}
   {queued.length>0&&<p className="pi-reading-sequence">{resume?(zh?'接下来读':'Up next'):(zh?'建议从这里开始':'Start here')}</p>}
   {queued.length?<ol className="pi-first-papers">{queued.map((p,index)=><li key={p.id}>
    <h4><button type="button" onClick={()=>readPaper(p.id)}><MathText inline>{p.title}</MathText></button></h4>
    <p><span>{zh?'为什么读':'Why read'}</span><MathText inline>{(zh?p.whyZh:p.whyEn)||(zh?'先核对该论文与当前问题的具体联系。':'Check how this paper relates to your question.')}</MathText></p>
    {index===0&&!resume&&<><p><span>{zh?'先看哪里':'Start with'}</span><MathText inline>{(zh?p.focusZh:p.focusEn)||(zh?'先读摘要与主要结论，再查对应假设。':'Read the abstract and main result, then check the assumptions.')}</MathText></p>
    <p><span>{zh?'读后核对':'Check next'}</span><MathText inline>{(zh?p.checkZh:p.checkEn)||(zh?'记录哪些条件适用于你的问题，哪些仍需验证。':'Record which conditions apply to your question and what remains unverified.')}</MathText></p></>}
    <button className="pi-first-read" type="button" onClick={()=>readPaper(p.id)}>{zh?'阅读与笔记':'Read & take notes'} →</button>
   </li>)}</ol>:<p className="pi-question-empty">{visiblePapers.length?(zh?'先继续当前阅读，后续关联材料会出现在这里。':'Continue your current reading. Further related papers will appear here.'):demo?(zh?'当前问题没有其他预设材料。':'No further preset papers for this question.'):(zh?'暂无新的已核验关联文献。已有论文和笔记仍可继续阅读。':'No new verified related papers yet. Existing papers and notes remain available.')}</p>}

   {!demo&&(scanStatus||blocked)&&<button type="button" className="pi-discovery-link" onClick={onProgress}>{zh?'查看发现进度与恢复操作':'View discovery progress & recovery'} →</button>}
   <footer>{!demo&&<button type="button" className="primary" disabled={!!blocked||inactive} onClick={onDiscover}>{zh?'查找相关文献':'Find related papers'}</button>}{goal.trackId&&<button type="button" onClick={()=>onRoute(goal.trackId)}>{zh?'查看研究路线':'Open research route'}</button>}{demo&&!goal.trackId&&<button type="button" onClick={()=>{void fetch('/api/research-entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,action:'reset'})}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(checkedResult).then(data=>{if(alive.current){generation.current++;chosen.current='';setResult(data);readingCallback.current(data.papers.map((p:Reading)=>p.id));setSaved(false)}}).catch(()=>{if(alive.current)setReadError(true)})}}>{zh?'恢复示例问题':'Restore sample question'}</button>}{!demo&&blocked&&<small>{blocked}</small>}</footer>
  </>:null)}
 </section>;
}
