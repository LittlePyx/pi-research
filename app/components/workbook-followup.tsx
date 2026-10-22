'use client';
import {useEffect,useRef,useState} from 'react';
import type {WorkbookContent,WorkbookSource} from '../../lib/research-workbook';
import {practiceProgress,workbookPracticeTasks,type WorkbookPractice} from '../../lib/workbook-practice';
import {workbookCheckFocus} from '../../lib/workbook-followup';
import {MathText} from './math-text';

export function WorkbookFollowup({content,sources,question,practice,locale,disabled,dirty,active,reveal,onOpenPaper,onStartPractice,onAppend}:{
  content:WorkbookContent;sources:WorkbookSource[];question:string;practice?:WorkbookPractice;locale:'zh'|'en';disabled:boolean;dirty:boolean;active:boolean;reveal:boolean;
  onOpenPaper:(source:WorkbookSource,focus:string)=>void;onStartPractice?:(id:string)=>void;onAppend:(field:'decision'|'unresolved',label:string,value:string)=>boolean;
}){
  const zh=locale==='zh';
  const tasks=workbookPracticeTasks(content);
  const progress=practiceProgress(content,practice||{activeId:tasks[0].id,entries:{}});
  const saved=tasks.filter(task=>practice?.entries[task.id]?.result.trim()||practice?.entries[task.id]?.unresolved.trim());
  const target=useRef<HTMLElement|null>(null);
  const [message,setMessage]=useState('');
  const visible=saved.length>0;
  useEffect(()=>{if(active&&reveal&&visible){target.current?.scrollIntoView({block:'center'});target.current?.focus({preventScroll:true});}},[active,reveal,visible]);
  const append=(field:'decision'|'unresolved',label:string,value:string)=>{
    const added=onAppend(field,label,value);
    setMessage(added?(zh?'已补入编辑区，请核对后保存判断。':'Added to the editor. Review and save your judgment.'):(zh?'合并后超出长度上限，请精简后手动补入。':'The combined note exceeds the limit. Shorten it and add it manually.'));
  };
  return <div className="pi-workbook-followup">
    {question.trim()&&<section aria-label={zh?'继续核查待查问题':'Continue checking open questions'}><h3>{zh?'继续核查':'Continue checking'}</h3><p>{zh?'选择论文，带着当前待查问题阅读；完整问题和草稿保留在本比较中。':'Choose a paper to read with the current question. The full question and draft remain in this comparison.'}</p><div className="pi-workbook-followup-actions">{sources.map(source=><button type="button" key={source.id} disabled={disabled} onClick={()=>onOpenPaper(source,workbookCheckFocus('',question))}>{zh?'核查论文：':'Check paper: '}{source.title} →</button>)}</div>{onStartPractice&&<button type="button" disabled={disabled||dirty} onClick={()=>onStartPractice(progress.active.id)}>{progress.allCompleted?(zh?'回顾核查记录':'Review check records'):(zh?'继续核查并记录成果':'Continue checking and record a result')} →</button>}{dirty&&<small>{zh?'先保存判断与待查问题，再进入核查记录。':'Save your judgment and open questions before entering the check record.'}</small>}</section>}
    {visible&&<section ref={target} tabIndex={-1} aria-label={zh?'已保存核查成果':'Saved check results'}><details open={reveal}><summary>{zh?`${saved.length} 项已保存核查记录`:`${saved.length} saved check records`}</summary><p>{zh?'以下为你保存的核查记录。选择补入后仍需核对、保存原判断。':'These are your saved check records. After adding one, review and save the original judgment.'}</p>{saved.map(task=>{
      const entry=practice!.entries[task.id];
      const label=task.id==='learning'?(zh?'学习核查':'Learning check'):(zh?`研究核查 ${Number(task.id.slice(5))+1}`:`Research check ${Number(task.id.slice(5))+1}`);
      const papers=sources.filter(source=>task.evidenceIds.some(id=>id.endsWith(':'+source.id)));
      const resultLabel=`${label} · ${zh?'核查材料：':'Check materials: '}${papers.map(paper=>paper.title).join(' / ')}`;
      return <article key={task.id}><h4>{label} · {entry.completed?(zh?'已确认完成':'Confirmed complete'):(zh?'已保存，待继续':'Saved, in progress')}</h4><p><MathText>{zh?task.goalZh:task.goalEn}</MathText></p>{entry.result&&<><h5>{zh?'成果与依据':'Result and evidence'}</h5><p className="pi-workbook-followup-note">{entry.result}</p><button type="button" disabled={disabled} onClick={()=>append('decision',resultLabel,entry.result)}>{zh?'补入当前判断':'Add to current judgment'}</button></>}{entry.unresolved&&<><h5>{zh?'仍待查证':'Still to verify'}</h5><p className="pi-workbook-followup-note">{entry.unresolved}</p><button type="button" disabled={disabled} onClick={()=>append('unresolved',resultLabel,entry.unresolved)}>{zh?'补入待查问题':'Add to open questions'}</button></>}<div className="pi-workbook-followup-actions">{papers.map(source=><button key={source.id} type="button" disabled={disabled} onClick={()=>onOpenPaper(source,workbookCheckFocus(zh?task.goalZh:task.goalEn,entry.unresolved||question))}>{zh?'回看材料：':'Revisit source: '}{source.title}</button>)}</div></article>;
    })}{message&&<p role="status">{message}</p>}</details></section>}
  </div>;
}
