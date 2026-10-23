'use client';
import {useEffect,useRef,useState} from 'react';
import type {WorkbookArtifact,WorkbookContent,WorkbookSource} from '../../lib/research-workbook';
import {practiceProgress,workbookPracticeTasks,type WorkbookPractice} from '../../lib/workbook-practice';
import {workbookCheckFocus,workbookResultState} from '../../lib/workbook-followup';
import {MathText} from './math-text';
import {workbookTaskPresentation} from '../../lib/workbook-interface';

export function WorkbookFollowup({content,sources,artifact,savedArtifact,practice,locale,disabled,dirty,active,reveal,onOpenPaper,onStartPractice,onAppend}:{
  content:WorkbookContent;sources:WorkbookSource[];artifact:Pick<WorkbookArtifact,'decision'|'unresolved'>;savedArtifact?:Pick<WorkbookArtifact,'decision'|'unresolved'>;practice?:WorkbookPractice;locale:'zh'|'en';disabled:boolean;dirty:boolean;active:boolean;reveal:boolean;
  onOpenPaper:(source:WorkbookSource,focus:string)=>void;onStartPractice?:(id:string)=>void;onAppend:(field:'decision'|'unresolved',labels:string[],value:string)=>boolean;
}){
  const zh=locale==='zh';
  const question=artifact.unresolved;
  const tasks=workbookPracticeTasks(content);
  const progress=practiceProgress(content,practice||{activeId:tasks[0].id,entries:{}});
  const saved=tasks.filter(task=>practice?.entries[task.id]?.result.trim()||practice?.entries[task.id]?.unresolved.trim());
  const target=useRef<HTMLElement|null>(null);
  const [notice,setNotice]=useState<'added'|'limit'|''>('');
  const visible=saved.length>0;
  useEffect(()=>{if(active&&reveal&&visible){target.current?.scrollIntoView({block:'center'});target.current?.focus({preventScroll:true});}},[active,reveal,visible]);
  const append=(field:'decision'|'unresolved',labels:string[],value:string)=>{
    const added=onAppend(field,labels,value);
    setNotice(added?'added':'limit');
  };
  return <div className="pi-workbook-followup">
    {question.trim()&&<section aria-label={zh?'继续核查待查问题':'Continue checking open questions'}><h3>{zh?'继续核查':'Continue checking'}</h3><p>{zh?'选择论文，带着当前待查问题阅读；完整问题和草稿保留在本比较中。':'Choose a paper to read with the current question. The full question and draft remain in this comparison.'}</p><div className="pi-workbook-followup-actions">{sources.map(source=><button type="button" key={source.id} disabled={disabled} onClick={()=>onOpenPaper(source,workbookCheckFocus('',question))}>{zh?'核查论文：':'Check paper: '}{source.title} →</button>)}</div>{onStartPractice&&<button type="button" disabled={disabled||dirty} onClick={()=>onStartPractice(progress.active.id)}>{progress.allCompleted?(zh?'回顾核查记录':'Review check records'):(zh?'继续核查并记录成果':'Continue checking and record a result')} →</button>}{dirty&&<small>{zh?'先保存判断与待查问题，再进入核查记录。':'Save your judgment and open questions before entering the check record.'}</small>}</section>}
    {visible&&<section ref={target} tabIndex={-1} aria-label={zh?'已保存核查成果':'Saved check results'}><details open={reveal}><summary>{zh?`${saved.length} 项已保存核查记录`:`${saved.length} saved check records`}</summary><p>{zh?'以下为你保存的核查记录。选择补入后仍需核对、保存原判断。':'These are your saved check records. After adding one, review and save the original judgment.'}</p>{saved.map(task=>{
      const entry=practice!.entries[task.id];
      const shown=workbookTaskPresentation(entry,zh);
      const labelZh=task.id==='learning'?'学习核查':`研究核查 ${Number(task.id.slice(5))+1}`;
      const labelEn=task.id==='learning'?'Learning check':`Research check ${Number(task.id.slice(5))+1}`;
      const label=zh?labelZh:labelEn;
      const papers=sources.filter(source=>task.evidenceIds.some(id=>id.endsWith(':'+source.id)));
      const titles=papers.map(paper=>paper.title).join(' / ');
      const labels=[`${labelZh} · 核查材料：${titles}`,`${labelEn} · Check materials: ${titles}`];
      if(!zh)labels.reverse();
      const decisionState=workbookResultState(artifact.decision,savedArtifact?.decision||'',labels,entry.result);
      const questionState=workbookResultState(question,savedArtifact?.unresolved||'',labels,entry.unresolved);
      return <article key={task.id}>
        <h4>{label} · {shown.status}</h4>
        <p><MathText>{zh?task.goalZh:task.goalEn}</MathText></p>
        {entry.result&&<>
          <h5>{zh?'成果与依据':'Result and evidence'}</h5><p className="pi-workbook-followup-note">{entry.result}</p>
          <button type="button" disabled={disabled||decisionState!=='available'} onClick={()=>append('decision',labels,entry.result)}>{decisionState==='saved'?(zh?'已保存到判断':'Saved in judgment'):decisionState==='draft'?(zh?'已补入判断，待保存':'Added to judgment; save pending'):(zh?'补入当前判断':'Add to current judgment')}</button>
        </>}
        {entry.unresolved&&<>
          <h5>{zh?'仍待查证':'Still to verify'}</h5><p className="pi-workbook-followup-note">{entry.unresolved}</p>
          <button type="button" disabled={disabled||questionState!=='available'} onClick={()=>append('unresolved',labels,entry.unresolved)}>{questionState==='saved'?(zh?'已保存到待查问题':'Saved in open questions'):questionState==='draft'?(zh?'已补入待查问题，待保存':'Added to open questions; save pending'):(zh?'补入待查问题':'Add to open questions')}</button>
        </>}
        {dirty&&<small>{zh?'先保存当前判断，再返回这项核查。':'Save your current judgment before returning to this check.'}</small>}
        <div className="pi-workbook-followup-actions">
          {onStartPractice&&<button type="button" disabled={disabled||dirty} onClick={()=>onStartPractice(task.id)}>{shown.recordAction} →</button>}
          {papers.map(source=><button key={source.id} type="button" disabled={disabled} onClick={()=>onOpenPaper(source,workbookCheckFocus(zh?task.goalZh:task.goalEn,entry.unresolved||question))}>{zh?'回看材料：':'Revisit source: '}{source.title}</button>)}
        </div>
      </article>;
    })}{notice&&<p role="status">{notice==='added'?(zh?'已补入编辑区，请核对后保存判断。':'Added to the editor. Review and save your judgment.'):(zh?'合并后超出长度上限，请精简后手动补入。':'The combined note exceeds the limit. Shorten it and add it manually.')}</p>}</details></section>}
  </div>;
}
