'use client';
import {useEffect,useRef,useState} from 'react';
import type {ResearchStartSource} from '../../lib/research-start';
import type {GraphTaskContext} from '../../lib/graph-task';
type Suggestion=ResearchStartSource&{revision:string};
export function ResearchStart({spaceId,paperId,locale,onRead,onStart}:{spaceId:string;paperId?:string;locale:'zh'|'en';onRead:(id:string)=>void;onStart:(track:{id:string;titleZh:string;titleEn:string},task:GraphTaskContext)=>void}) {
 const zh=locale==='zh', [items,setItems]=useState<Suggestion[]>([]),[selected,setSelected]=useState<Suggestion|null>(null),[target,setTarget]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const lifetime=useRef<AbortController|null>(null);
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;
  fetch('/api/research-start?'+new URLSearchParams({spaceId,...(paperId?{paperId}:{})}),{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>{if(!controller.signal.aborted){setItems(d.suggestions||[]);setError('');}}).catch(()=>{if(!controller.signal.aborted)setError(zh?'方向建议暂未加载，可重试。':'Suggestions could not load. Retry.');});
  return ()=>controller.abort();
 },[spaceId,paperId,retry,zh]);
 const choose=(s:Suggestion)=>{setSelected(s);setTarget(((zh?s.problemZh:s.problemEn)||s.title).slice(0,240));setError('');};
 const confirm=async()=>{if(!selected||busy)return;const signal=lifetime.current?.signal;setBusy(true);setError('');
  try {const r=await fetch('/api/research-start',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',spaceId,paperId:selected.id,revision:selected.revision,target})});
   const d=await r.json();if(!r.ok)throw new Error(String(r.status));if(!signal?.aborted)onStart(d.track,d.task);
  }catch(e){if(!signal?.aborted)setError(zh?(e instanceof Error&&e.message==='409'?'材料或路线状态已变化，请刷新建议后再确认。':'未能保存目标，请重试。'):'Could not save this goal. Refresh the suggestions and retry.');}finally{if(!signal?.aborted)setBusy(false);}
 };
 if(!items.length&&!error)return null;
 return <section className="pi-research-start"><header><h2>{zh?'从阅读走向研究':'From reading to research'}</h2><p>{zh?'从一篇已评审论文的问题开始，选择并调整你的目标。':'Choose and refine a goal from a reviewed paper.'}</p></header>
 <div className="pi-start-options">{items.map(s=><article key={s.id}><h3>{(zh?s.problemZh:s.problemEn)||s.title}</h3><p>{zh?s.reasonZh:s.reasonEn}</p><button className="pi-start-source" type="button" onClick={()=>onRead(s.id)}>{zh?'起点论文：':'Starting paper: '}{s.title} ↗</button><details><summary>{zh?'先做什么 · 材料局限':'First task · limitations'}</summary><p>{(zh?s.taskZh:s.taskEn)||(zh?'阅读原文，记录研究对象、假设与结论。':'Read the paper and record its objects, assumptions and conclusions.')}</p><p>{(zh?s.limitationZh:s.limitationEn)||(zh?'当前判断来自摘要评审，方法细节需核对原文。':'Based on abstract review; method details require reading the original.')}</p></details><button type="button" disabled={busy} onClick={()=>choose(s)}>{selected?.id===s.id?(zh?'已选中':'Selected'):(zh?'选择并调整目标':'Choose and refine goal')}</button></article>)}</div>
 {selected&&<div className="pi-start-confirm"><label>{zh?'我的研究目标':'My research goal'}<textarea maxLength={240} rows={3} value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}/></label><p>{zh?'确认后建立研究路线，并带上这篇论文预览学习计划。它是阅读起点，不代表目标已有充分证据。':'Confirm to create a route and preview a learning plan with this paper. A starting paper does not establish sufficient evidence for your goal.'}</p><button type="button" disabled={busy||target.trim().length<4||target.trim().length>240} onClick={()=>void confirm()}>{busy?(zh?'正在保存…':'Saving…'):(zh?'确认目标，规划学习':'Confirm goal & plan learning')}</button></div>}
 {error&&<p role="alert">{error} <button type="button" disabled={busy} onClick={()=>{setSelected(null);setRetry(n=>n+1);}}>{zh?'刷新建议':'Refresh suggestions'}</button></p>}
 </section>;
}
