"use client";

import { useEffect } from "react";
import { comparisonTaskTarget } from "../../lib/comparison-task";
import type { GraphTaskContext } from "../../lib/graph-task";
import { routeNextAction } from "../../lib/route-overview";
import { MathText } from "./math-text";
import { useComparisonTask } from "./use-comparison-task";
import type { RouteSelection } from "./use-route-selection";
import "./route-start.css";

export function RouteStart({userId,spaceId,trackId,active,locale,selection,taskTitle,onMaterials,onProblem,onTasks,onCompare,onResume}:{
  userId:string;spaceId:string;trackId:string;active:boolean;locale:"zh"|"en";selection:RouteSelection;taskTitle?:string;
  onMaterials:()=>void;onProblem:()=>void;onTasks:()=>void;onCompare:(context:GraphTaskContext)=>void;onResume:(id:string,check:boolean)=>void;
}) {
  const zh=locale==="zh";
  const task=useComparisonTask(userId,spaceId,trackId,selection.value,active);
  const {overview,continuation,draft,matching}=task;
  const routeQuestion=overview?.question||"";
  useEffect(()=>{
    if(routeQuestion)selection.seedQuestion(routeQuestion,true);
  },[routeQuestion,selection]);

  const target=comparisonTaskTarget(selection.value,draft,continuation,matching);
  const record=continuation;
  const judgment=overview?.savedJudgment;
  const ready=task.materialsReady&&task.intentReady&&selection.value.papers.every(paper=>
    task.materials.some(material=>material.canonicalId.toLowerCase()===paper.canonicalId.toLowerCase()&&material.eligibility==="eligible"));
  const check=Boolean(record?.savedRevision&&record.unresolved);
  const savedAction=record&&overview?routeNextAction({...overview,comparisons:[record]}):null;

  let label=zh?"阅读路线材料":"Read route materials";
  let detail=target.question||routeQuestion;
  let run=onMaterials;
  let waiting=false;
  if(target.kind==="draft"&&draft){
    label=zh?"继续本地比较草稿":"Resume local comparison draft";
    run=()=>onCompare(draft);
  }else if(target.kind==="selection"){
    const selected=selection.value.papers.length;
    if((task.materialsFailed||task.intentFailed)&&selected>=2){
      label=zh?"重试核对选材":"Retry checking sources";
      run=task.retry;
    }else if(selected>=2&&ready){
      label=matching?(zh?"继续这次比较":"Resume this comparison"):(zh?"开始新比较":"Start new comparison");
      run=matching?()=>onResume(matching,false):()=>onCompare(selection.value);
    }else{
      waiting=selected>=2&&(!task.materialsReady||!task.intentReady);
      label=waiting?(zh?"正在核对选材…":"Checking sources…"):(zh?"继续选材":"Choose more sources");
      detail=detail|| (zh?`已选 ${selected} 篇论文`:`${selected} papers selected`);
    }
  }else if(record&&(!taskTitle||!record.savedRevision||check||record.stale)){
    label=record.stale||savedAction==="check"?(zh?"核对已有比较":"Check previous comparison"):check?(zh?"继续这项核查":"Continue this check"):
      savedAction==="saved"?(zh?"查看已保存比较":"View saved comparison"):savedAction==="record"?(zh?"继续记录判断":"Continue your judgment"):(zh?"继续上次比较":"Resume comparison");
    run=()=>onResume(record.id,check&&!record.stale);
  }else if(taskTitle){
    label=zh?"查看当前研究任务":"Open current research task";
    detail=taskTitle;
    run=onTasks;
  }else if(task.failed){
    label=zh?"重试加载":"Retry loading";
    run=task.retry;
  }else if(!overview){
    label=zh?"正在读取当前任务…":"Loading current task…";
    waiting=true;
  }else if(!routeQuestion){
    label=zh?"确定研究问题":"Define a research question";
    run=onProblem;
  }else if(routeNextAction(overview)==="compare"){
    label=zh?"选择论文比较":"Select papers to compare";
  }
  return <section className="pi-route-start" aria-labelledby="route-current-task">
    <div className="pi-route-current-card">
      <div>
        <h2 id="route-current-task">{zh?"当前任务":"Current task"}</h2>
        {detail&&<p className="pi-route-current-question"><MathText inline>{detail}</MathText></p>}
        {check&&target.kind==="record"&&record?.unresolved&&<p className="pi-route-current-check"><strong>{zh?"下一步核查":"Next check"}</strong> <MathText inline>{record.unresolved}</MathText></p>}
        {task.failed&&<p role="status">{zh?"比较状态暂未载入，已选材料和草稿仍保留。":"Comparison status could not load. Your selections and draft are preserved."}</p>}
      </div>
      <button type="button" className="pi-research-primary" disabled={waiting} onClick={run}>{label}</button>
    </div>
    {overview&&<dl className="pi-route-current-summary">
      <div><dt>{zh?"可比较的路线材料":"Eligible route papers"}</dt><dd>{overview.routeEligibleCount}</dd></div>
      {judgment?.decision&&<div><dt>{zh?"最近保存的判断":"Latest saved judgment"}</dt><dd><MathText inline>{judgment.decision}</MathText></dd></div>}
    </dl>}
  </section>;
}
