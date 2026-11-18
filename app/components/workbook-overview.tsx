import type {ReactNode} from 'react';
import type {WorkbookArtifact,WorkbookContent} from '../../lib/research-workbook';
import {workbookResearchContinuation,workbookTaskPresentation} from '../../lib/workbook-interface';
import {MathText} from './math-text';
import './workbook-overview.css';

export function WorkbookOverview({content,artifact,revision,dirty,pendingDraft,locale,onEdit,onEvidence,onTasks,onContinue,taskBlocked,taskBlockReason,editing,children,links}:{
  content:WorkbookContent;artifact:WorkbookArtifact;revision:number;dirty:boolean;pendingDraft:boolean;locale:'zh'|'en';
  editing:boolean;children:ReactNode;links:ReactNode;onEdit:()=>void;onEvidence:()=>void;onTasks:()=>void;onContinue?:(id:string)=>void;taskBlocked:boolean;taskBlockReason:string;
}){
  const zh=locale==='zh',progress=workbookResearchContinuation(content,artifact.practice,zh);
  const learning=workbookTaskPresentation(artifact.practice?.entries.learning,zh);
  const verdict=content.comparison.status==='comparable'?(zh?'当前摘要支持比较':'Current abstracts support comparison'):content.comparison.status==='conditional'?(zh?'需要区分适用条件':'Conditions must be distinguished'):(zh?'现有依据不足以直接比较':'Insufficient evidence for direct comparison');
  return <section className="pi-workbook-overview" aria-label={zh?'比较成果概览':'Comparison overview'}>
    <div className="pi-overview-result"><small>{zh?'摘要比较':'ABSTRACT COMPARISON'}</small><h2>{verdict}</h2><p><MathText>{content.comparison[zh?'textZh':'textEn']}</MathText></p><button type="button" onClick={onEvidence}>{zh?'查看条件与依据':'View conditions and evidence'} →</button></div>
    <div className="pi-overview-judgment"><div className="pi-overview-label"><h3>{zh?'我的判断':'My judgment'}</h3><span>{dirty?(zh?'编辑区有未保存修改':'Unsaved edits'):revision?(zh?`已保存 · 版本 ${revision}`:`Saved · revision ${revision}`):(zh?'尚未记录':'Not recorded')}</span></div>
      <div hidden={editing}>
      {artifact.decision.trim()?<details className="pi-overview-text"><summary><span><MathText inline>{artifact.decision}</MathText></span><small>{zh?'展开判断':'Expand judgment'}</small></summary><p><MathText>{artifact.decision}</MathText></p></details>:<p className="pi-overview-empty">{zh?'核对依据后，记录你的判断与仍缺的条件。':'After checking the evidence, record your judgment and any missing conditions.'}</p>}
      {artifact.unresolved.trim()&&<details className="pi-overview-text pi-overview-unresolved"><summary><span>{zh?'待查：':'Unresolved: '}<MathText inline>{artifact.unresolved}</MathText></span><small>{zh?'展开待查问题':'Expand unresolved questions'}</small></summary><p><MathText>{artifact.unresolved}</MathText></p></details>}
      <button type="button" onClick={onEdit}>{pendingDraft?(zh?'查看本地草稿':'View local draft'):artifact.decision.trim()?(zh?'编辑我的判断':'Edit my judgment'):(zh?'记录我的判断':'Record my judgment')}</button>
      </div><div className="pi-overview-editor" hidden={!editing}>{children}</div>
      {links}
    </div>
    <div className="pi-overview-progress">
      <div className="pi-overview-check-count"><strong>{zh?'研究核查':'Research checks'} {progress.completed}/{progress.total}</strong><span>{progress.allCompleted?(zh?'已确认完成 · 回顾成果':'Confirmed complete · review results'):progress.recorded?(zh?`${progress.recorded} 项有保存记录`:`${progress.recorded} recorded`):(zh?'尚未开始':'Not started')}</span></div>
      <div className="pi-overview-check-actions">{onContinue&&<button type="button" className="pi-overview-continue" disabled={taskBlocked} aria-describedby={taskBlocked?'workbook-overview-task-hint':undefined} title={progress.goal} onClick={()=>onContinue(progress.taskId)}>{progress.label} →</button>}<button type="button" onClick={onTasks}>{zh?'查看全部核查':'View all checks'}</button></div>
      {taskBlocked&&<small id="workbook-overview-task-hint" className="pi-overview-task-hint">{taskBlockReason}</small>}
      <span className="pi-overview-learning">{zh?'配套学习（可选）':'Supporting learning (optional)'} · {learning.status}</span>
    </div>
  </section>;
}
