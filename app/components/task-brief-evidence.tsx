'use client';
import {useEffect,useRef,useState} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
import type {TaskBriefView} from '../../lib/task-brief';
export function TaskBriefEvidence({spaceId,brief,locale,demo}:{spaceId:string;brief:TaskBriefView;locale:'zh'|'en';demo:boolean}){
 const [evidence,setEvidence]=useState<TaskBriefView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const load=async()=>{
  if(evidence||busy)return;setBusy(true);setError(false);
  try{const r=await workspaceFetch('/api/task-brief?'+new URLSearchParams({spaceId,jobId:brief.job.id,snapshotId:brief.snapshotId,evidence:'1'}),{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const data=await r.json() as {brief:TaskBriefView|null};if(!data.brief||data.brief.snapshotId!==brief.snapshotId)throw Error();if(alive.current)setEvidence(data.brief)}catch{if(alive.current)setError(true)}finally{if(alive.current)setBusy(false)}
 };
 return <details className="pi-task-brief-evidence" onToggle={e=>{if(e.currentTarget.open)void load()}}><summary>{locale==='zh'?'检索范围与保存的依据':'Search scope & saved evidence'}</summary>
  <p>{locale==='zh'?'简报保存于 ':'Brief saved '}{brief.capturedAt} · {brief.scope.description}</p>
  <p>{locale==='zh'?'以下使用这次任务保存时的材料与评审，论文详情可能已有更新。':'These are the task’s saved materials and reviews. Paper details may have changed.'}</p>
  {brief.plan&&<p>{locale==='zh'?'下列为任务保存的检索计划，不代表每个来源都已成功返回。':'The saved search plan does not imply every source returned successfully.'}</p>}
  {brief.plan&&<dl>{(['days','months','years'] as const).map((h,i)=><div key={h}><dt>{(locale==='zh'?['近期进展','方法与假设','基础文献']:['Recent progress','Methods & assumptions','Foundations'])[i]}</dt><dd>{brief.plan![h].join(' · ')}</dd></div>)}</dl>}
  {brief.coverage.bounded&&<p>{locale==='zh'?`保存了 ${brief.coverage.capturedCount} 篇材料的依据摘录；任务计数包含其他候选。`:`Evidence is retained for ${brief.coverage.capturedCount} materials; task counts include other candidates.`}</p>}
  {busy&&<p role="status">{locale==='zh'?'正在读取保存的依据…':'Loading saved evidence…'}</p>}
  {error&&<p role="alert">{locale==='zh'?'依据暂未载入。':'Evidence could not be loaded.'}<button type="button" onClick={()=>void load()}>{locale==='zh'?'重试':'Retry'}</button></p>}
  {evidence?.records.filter(r=>r.abstractText).slice(0,6).map(r=><article key={r.canonicalId}><h4>{r.title}</h4><p>{demo?(locale==='zh'?'原文短摘录 · 演示材料':'Short source excerpt · demo'):(locale==='zh'?'摘要证据（保存时）':'Abstract evidence at capture')}</p><blockquote>{r.abstractText}</blockquote>{r.review&&<p>{locale==='zh'?r.review.limitationsZh:r.review.limitationsEn}</p>}</article>)}
 </details>;
}
