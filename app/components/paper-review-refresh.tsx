'use client';
import {useEffect,useRef,useState} from 'react';
import { workspaceFetch as fetch } from '../../lib/workspace-request';
type State={eligible:boolean;status:string;retryAt:number;busy?:boolean;attempts?:number};
export function PaperReviewRefresh({spaceId,paperId,locale,onUpdated,onReady}:{spaceId:string;paperId:string;locale:'zh'|'en';onUpdated:()=>Promise<void>;onReady:(ready:boolean)=>void}) {
 const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),running=useRef(false),ready=useRef(onReady);ready.current=onReady;
 const zh=locale==='zh';
 useEffect(()=>{alive.current=true;const controller=new AbortController();
  fetch('/api/paper-review-refresh?'+new URLSearchParams({spaceId,paperId}),{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<State>}).then(data=>{if(alive.current){setState(data);ready.current(data.status==='ready')}}).catch(()=>{});
  return()=>{alive.current=false;controller.abort()};
 },[spaceId,paperId]);
 useEffect(()=>{if(!state?.busy && !(state && state.retryAt>Date.now()))return;const timer=setTimeout(()=>{void fetch('/api/paper-review-refresh?'+new URLSearchParams({spaceId,paperId})).then(r=>r.ok?r.json() as Promise<State>:null).then(data=>{if(alive.current&&data)setState(data)}).catch(()=>{})},4000);return()=>clearTimeout(timer)},[state,spaceId,paperId]);
 const run=async()=>{
  if(running.current)return;running.current=true;setBusy(true);setError('');
  try {
   if(state?.status==='ready'){await onUpdated();if(alive.current)ready.current(true);return}
   for(let step=0;step<2;step++) {
    const response=await fetch('/api/paper-review-refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,paperId}),signal:AbortSignal.timeout(55000)});
    if(!response.ok)throw Error();
    const data=await response.json() as State;if(!alive.current)return;setState(data);
    if(data.status==='ready'){await onUpdated();if(alive.current)ready.current(true);break}
    if(data.status!=='correction'||data.busy)break;
   }
  }catch{void fetch('/api/paper-review-refresh?'+new URLSearchParams({spaceId,paperId})).then(r=>r.ok?r.json() as Promise<State>:null).then(data=>{if(alive.current&&data)setState(data)}).catch(()=>{});if(alive.current)setError(zh?'更新未完成，原评审与笔记保留。一分钟后可重试，已完成步骤会复用。':'Update incomplete. Saved review and notes are retained. Retry after a minute; completed steps are reused.')}
  finally{running.current=false;if(alive.current)setBusy(false)}
 };
 if(!state?.eligible)return null;
 return <div className="pi-paper-review-refresh">
  <p className="pi-paper-muted" role="status">{busy?(zh?'正在核验并更新这篇论文的评审…':'Checking and updating this paper’s review…'):state.status==='ready'?(zh?'评审已按当前摘要核验并同步。':'Review checked against the current abstract and synchronized.'):(zh?'摘要更新后，可重新核验这篇论文的解读与推荐理由。':'Recheck the interpretation and reading rationale against the updated abstract.')}</p>
  {(state.status!=='ready'||error)&&<button type="button" disabled={busy||state.busy||state.retryAt>Date.now()||(state.attempts||0)>=4&&state.status!=='ready'} onClick={()=>void run()}>{busy?(zh?'正在更新…':'Updating…'):state.status==='ready'?(zh?'重新载入评审':'Reload review'):(zh?'核验并更新评审':'Check & update review')}</button>}
  {(state.attempts||0)>=4&&state.status!=='ready'&&<p role="status">{zh?'本次更新已达到重试上限，原评审保留。':'Retry limit reached; the original review is retained.'}</p>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
