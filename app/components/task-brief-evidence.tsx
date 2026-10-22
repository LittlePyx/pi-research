'use client';
import {useEffect,useRef,useState} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
import type {TaskBriefView} from '../../lib/task-brief';
export function TaskBriefEvidence({spaceId,brief,locale,demo,paperId,onRead}:{spaceId:string;brief:TaskBriefView;locale:'zh'|'en';demo:boolean;paperId?:string;onRead?:(id:string)=>void}){
 const [evidence,setEvidence]=useState<TaskBriefView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),[unavailable,setUnavailable]=useState(false);
 const alive=useRef(true),loading=useRef(false),panel=useRef<HTMLDetailsElement>(null);
 const boundToBrief=!paperId||brief.records.some(r=>r.paperId===paperId&&r.selected);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const load=async()=>{
  if(evidence||unavailable||loading.current)return;loading.current=true;setBusy(true);setError(false);
  try{const r=await workspaceFetch('/api/task-brief?'+new URLSearchParams({spaceId,...(boundToBrief?{jobId:brief.job.id,snapshotId:brief.snapshotId}:{paperId:paperId!}),evidence:'1'}),{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const data=await r.json() as {brief:TaskBriefView|null};if(!data.brief&&!boundToBrief){if(alive.current)setUnavailable(true);return}if(!data.brief||boundToBrief&&data.brief.snapshotId!==brief.snapshotId||paperId&&!data.brief.records.some(r=>r.paperId===paperId&&r.selected))throw Error();if(alive.current)setEvidence(data.brief)}catch{if(alive.current)setError(true)}finally{loading.current=false;if(alive.current)setBusy(false)}
 };
 // eslint-disable-next-line react-hooks/set-state-in-effect -- A URL evidence target starts an external read and synchronizes document focus.
 useEffect(()=>{if(paperId){void load();panel.current?.scrollIntoView({block:'start'});panel.current?.focus({preventScroll:true})}},[paperId]);
 const records=evidence?.records.filter(r=>r.abstractText&&(!paperId||r.paperId===paperId)).slice(0,6)||[];
 const saved=evidence||(boundToBrief?brief:null);
 const title=(evidence||brief).records.find(r=>r.paperId===paperId)?.title||(locale==='zh'?'本篇论文':'This paper');
 return <details ref={panel} tabIndex={-1} open={paperId?true:undefined} className="pi-task-brief-evidence" aria-label={paperId?(locale==='zh'?'本篇论文的摘要依据':'Abstract evidence for this paper'):undefined} onToggle={e=>{if(e.currentTarget.open)void load()}}><summary>{paperId?(locale==='zh'?'摘要依据：':'Abstract evidence: ')+title:(locale==='zh'?'检索范围与保存的依据':'Search scope & saved evidence')}</summary>
  {saved&&<p>{locale==='zh'?'简报保存于 ':'Brief saved '}{saved.capturedAt} · {saved.scope.description}</p>}
  {paperId&&!boundToBrief&&<p>{locale==='zh'?'这篇是既有推荐，以下定位到它入选时保存的简报，不属于最新一轮的新发现。':'This is a saved recommendation. Its evidence comes from the task that selected it, not the latest run.'}</p>}
  <p>{locale==='zh'?'以下使用这次任务保存时的材料与评审，论文详情可能已有更新。':'These are the task’s saved materials and reviews. Paper details may have changed.'}</p>
  {!paperId&&brief.plan&&<p>{locale==='zh'?'下列为任务保存的检索计划，不代表每个来源都已成功返回。':'The saved search plan does not imply every source returned successfully.'}</p>}
  {!paperId&&brief.plan&&<dl>{(['days','months','years'] as const).map((h,i)=><div key={h}><dt>{(locale==='zh'?['近期进展','方法与假设','基础文献']:['Recent progress','Methods & assumptions','Foundations'])[i]}</dt><dd>{brief.plan![h].join(' · ')}</dd></div>)}</dl>}
  {!paperId&&brief.coverage.bounded&&<p>{locale==='zh'?`保存了 ${brief.coverage.capturedCount} 篇材料的依据摘录；任务计数包含其他候选。`:`Evidence is retained for ${brief.coverage.capturedCount} materials; task counts include other candidates.`}</p>}
  {busy&&<p role="status">{locale==='zh'?'正在读取保存的依据…':'Loading saved evidence…'}</p>}
  {error&&<p role="alert">{locale==='zh'?'依据暂未载入。':'Evidence could not be loaded.'}<button type="button" onClick={()=>void load()}>{locale==='zh'?'重试':'Retry'}</button></p>}
  {(unavailable||evidence&&!records.length)&&<p role="status">{locale==='zh'?'未找到这篇论文入选时保存的摘要原文，无法展示对应依据。请打开论文核对。':'No captured abstract is available for this paper. Open the paper to check the source.'}{paperId&&onRead&&<button type="button" onClick={()=>onRead(paperId)}>{locale==='zh'?'打开论文':'Open paper'} →</button>}</p>}
  {records.map(r=><article key={r.canonicalId}><h4>{r.title}</h4><p>{demo?(locale==='zh'?'原文短摘录 · 演示材料':'Short source excerpt · demo'):(locale==='zh'?'摘要原文（简报保存时）· 不代表全文核验':'Original abstract at capture · not full-text verification')}{r.abstractTruncated?(locale==='zh'?' · 摘要已截取':' · Abstract truncated'):''}</p><blockquote>{r.abstractText}</blockquote>{r.review&&<p><strong>{locale==='zh'?'适用边界与待核对：':'Limits & checks: '}</strong>{locale==='zh'?r.review.limitationsZh:r.review.limitationsEn}</p>}{/^https?:\/\//i.test(r.url)&&<a href={r.url} target="_blank" rel="noreferrer">{locale==='zh'?'打开论文来源':'Open original source'} ↗</a>}{r.paperId&&onRead&&<button type="button" onClick={()=>onRead(r.paperId!)}>{locale==='zh'?'阅读这篇论文与笔记':'Read this paper & take notes'} →</button>}</article>)}
 </details>;
}
