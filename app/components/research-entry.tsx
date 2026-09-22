'use client';
import {useEffect,useRef,useState} from 'react';
import { workspaceFetch as fetch } from '../../lib/workspace-request';
import {MathText} from './math-text';
import './research-entry.css';

type Goal = {id:string;trackId:string;question:string;status:string;monitoringStatus:string};
type Reading = {id:string;title:string;whyZh:string;whyEn:string;focusZh:string;focusEn:string;checkZh:string;checkEn:string};
type Result = {goal:Goal|null;papers:Reading[]};
export function ResearchEntry({spaceId,locale,demo,refreshKey,scanStatus,blocked,resume,onProgress,onDiscover,onRead,onRoute,onSaved,onReadingList}: {
 spaceId:string;locale:'zh'|'en';demo:boolean;refreshKey:string;scanStatus:string;blocked:string;
 onDiscover:()=>void;onRead:(id:string)=>void;onRoute:(id:string)=>void;onSaved:()=>void;onReadingList:(ids:string[])=>void;
 resume:{id:string;title:string;readingNote:string}|null;onProgress:()=>void;
}) {
 const zh=locale==='zh';
 const [result,setResult]=useState<Result|null>(null),[editing,setEditing]=useState(false),[question,setQuestion]=useState(''),[seed,setSeed]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[readError,setReadError]=useState(false),[retry,setRetry]=useState(0),[saved,setSaved]=useState(false);
 const alive=useRef(true),chosen=useRef(''),generation=useRef(0);
 const readingCallback=useRef(onReadingList);
 useEffect(()=>{readingCallback.current=onReadingList},[onReadingList]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false};},[]);
 useEffect(()=>{
  const abort=new AbortController(), request=++generation.current;
  fetch('/api/research-entry?'+new URLSearchParams({spaceId,goalId:chosen.current}),{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])})
   .then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<Result>})
   .then(data=>{if(!abort.signal.aborted&&request===generation.current){setResult(data);readingCallback.current(data.papers.map((p:Reading)=>p.id));setReadError(false)}})
   .catch(()=>{if(!abort.signal.aborted&&request===generation.current)setReadError(true)});
  return()=>abort.abort();
 },[spaceId,refreshKey,retry]);
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(busy)return;generation.current++;setBusy(true);setError('');
  try {
   const r=await fetch('/api/research-entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,question,seed,locale}),signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error(String(r.status));
   const data=await r.json() as Result;
   if(!alive.current)return;
   generation.current++;chosen.current=data.goal?.id||'';setResult(data);readingCallback.current(data.papers.map(p=>p.id));setEditing(false);setSaved(true);setReadError(false);onSaved();
   if(!demo&&!blocked)onDiscover();
  } catch(e) {if(alive.current)setError(e instanceof Error&&e.message==='409'?(zh?'该问题已暂停或结束，请在研究路线中管理。':'This question is paused or resolved. Manage it in Research.'):(zh?'未能确认保存结果，输入已保留。可重试，同一问题不会重复创建。':'Could not confirm the save. Your input is preserved; retrying the same question is safe.'))}
  finally {if(alive.current)setBusy(false)}
 };
 const goal=result?.goal;
 const inactive=Boolean(goal&&(goal.status!=='active'||goal.monitoringStatus!=='active'));
 const queued=result?.papers.filter(p=>p.id!==resume?.id)||[];
 const continuation=resume&&<article className="pi-question-resume" aria-label={zh?'继续阅读':'Continue reading'}>
  <div><p className="pi-entry-eyebrow">{zh?'正在读':'IN PROGRESS'}</p><h4><MathText inline>{resume.title}</MathText></h4>{resume.readingNote&&<p className="pi-resume-note">{resume.readingNote}</p>}</div>
  <button className="primary" type="button" onClick={()=>onRead(resume.id)}>{zh?'继续阅读与笔记':'Continue reading & notes'} →</button>
 </article>;
 return <section className="pi-question-entry" aria-label={zh?'问题与第一批阅读':'Question and first reading'}>
  <header><h2>{goal?(zh?'当前研究':'Current research'):(zh?'从问题开始阅读':'Read with a question')}</h2>{goal&&!editing&&<button type="button" onClick={()=>{setQuestion('');setSeed('');setEditing(true);setSaved(false)}}>{demo?(zh?'体验自定义问题':'Try your own question'):(zh?'提出另一个问题':'Another question')}</button>}</header>
  {readError&&<p role="alert">{zh?'研究问题暂未载入，已有内容保留。':'Could not load the research question; saved content is preserved.'} <button type="button" onClick={()=>setRetry(n=>n+1)}>{zh?'重试':'Retry'}</button></p>}
  {!result&&!readError&&<p role="status">{zh?'正在读取研究问题…':'Loading your question…'}</p>}
  {(!goal||editing)&&continuation}
  {(editing||result&&!goal)&&<form onSubmit={event=>void submit(event)}>
   <label>{zh?'你想弄清什么问题？':'What do you want to understand?'}<textarea rows={3} minLength={10} maxLength={520} required disabled={busy} value={question} onChange={e=>setQuestion(e.target.value)} placeholder={zh?'例如：随机局部化中的协方差控制如何影响 KLS 谱隙界？':'For example: how does covariance control in stochastic localization affect KLS bounds?'}/></label>
   <label>{zh?'起点论文（选填）':'Starting paper (optional)'}<input maxLength={300} disabled={busy} value={seed} onChange={e=>setSeed(e.target.value)} placeholder={zh?'论文题名或 DOI，作为待核对线索':'Title or DOI, used as an unverified lead'}/></label>
   <p>{demo?(zh?'演示可保存本次体验的问题，不执行检索；自定义问题不会套用预设阅读结果。':'The demo keeps your question for this session without searching. Custom questions do not inherit preset results.'):(zh?'确认后加入本空间研究目标，用于后续检索与评审；先找文献，再核对假设、方法与局限。':'Confirm to add a research goal for future discovery and review, then check papers’ assumptions, methods and limitations.')}</p>
   {error&&<p role="alert">{error}</p>}
   <footer><button className="primary" disabled={busy||question.trim().length<10} type="submit">{busy?(zh?'正在保存…':'Saving…'):demo?(zh?'保存演示问题':'Save demo question'):blocked?(zh?'确认问题':'Confirm question'):(zh?'确认问题并查找文献':'Confirm & find papers')}</button>{goal&&<button type="button" disabled={busy} onClick={()=>setEditing(false)}>{zh?'取消':'Cancel'}</button>}</footer>
  </form>}
  {goal&&!editing&&<>
   <h3 className="pi-current-question"><MathText inline>{goal.question}</MathText></h3>
   <p className="pi-question-status" role="status">{demo?(zh?'示例流程 · 未执行检索或模型评审':'Example flow · no search or model review'):inactive?(zh?'该问题已暂停或结束。':'This question is paused or resolved.'):saved?(zh?'问题已保存。后续新扫描会参考它；当前结果尚未因此重新计算。':'Question saved. Future new scans will consider it; current results have not been recalculated.'): (zh?'已确认的研究目标 · 最多展示 5 篇关联阅读':'Confirmed research goal · up to 5 related readings')}</p>
   {scanStatus&&!demo&&<p role="status">{scanStatus}</p>}
   {continuation}
   {queued.length>0&&<p className="pi-reading-sequence">{resume?(zh?'接下来读':'Up next'):(zh?'建议从这里开始':'Start here')}</p>}
   {queued.length?<ol className="pi-first-papers">{queued.map((p,index)=><li key={p.id}>
    <h4><button type="button" onClick={()=>onRead(p.id)}><MathText inline>{p.title}</MathText></button></h4>
    <p><span>{zh?'为什么读':'Why read'}</span><MathText inline>{(zh?p.whyZh:p.whyEn)||(zh?'先核对该论文与当前问题的具体联系。':'Check how this paper relates to your question.')}</MathText></p>
    {index===0&&!resume&&<><p><span>{zh?'先看哪里':'Start with'}</span><MathText inline>{(zh?p.focusZh:p.focusEn)||(zh?'先读摘要与主要结论，再查对应假设。':'Read the abstract and main result, then check the assumptions.')}</MathText></p>
    <p><span>{zh?'读后核对':'Check next'}</span><MathText inline>{(zh?p.checkZh:p.checkEn)||(zh?'记录哪些条件适用于你的问题，哪些仍需验证。':'Record which conditions apply to your question and what remains unverified.')}</MathText></p></>}
    <button className="pi-first-read" type="button" onClick={()=>onRead(p.id)}>{zh?'阅读与笔记':'Read & take notes'} →</button>
   </li>)}</ol>:<p className="pi-question-empty">{result!.papers.length?(zh?'先继续当前阅读，后续关联材料会出现在这里。':'Continue your current reading. Further related papers will appear here.'):demo?(zh?'当前问题没有其他预设材料。':'No further preset papers for this question.'):(zh?'暂无新的已核验关联文献。已有论文和笔记仍可继续阅读。':'No new verified related papers yet. Existing papers and notes remain available.')}</p>}
   {!demo&&(scanStatus||blocked)&&<button type="button" className="pi-discovery-link" onClick={onProgress}>{zh?'查看发现进度与恢复操作':'View discovery progress & recovery'} →</button>}
   <footer>{!demo&&<button type="button" className="primary" disabled={!!blocked||inactive} onClick={onDiscover}>{zh?'查找相关文献':'Find related papers'}</button>}{goal.trackId&&<button type="button" onClick={()=>onRoute(goal.trackId)}>{zh?'查看研究路线':'Open research route'}</button>}{demo&&!goal.trackId&&<button type="button" onClick={()=>{void fetch('/api/research-entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,action:'reset'})}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{if(alive.current){generation.current++;chosen.current='';setResult(data);readingCallback.current(data.papers.map((p:Reading)=>p.id));setSaved(false)}}).catch(()=>{if(alive.current)setReadError(true)})}}>{zh?'恢复示例问题':'Restore sample question'}</button>}{!demo&&blocked&&<small>{blocked}</small>}</footer>
  </>}
 </section>;
}
