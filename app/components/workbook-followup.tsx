'use client';
import {useEffect,useRef} from 'react';
import type {WorkbookArtifact,WorkbookContent,WorkbookSource} from '../../lib/research-workbook';
import {workbookPracticeTasks,type WorkbookPractice} from '../../lib/workbook-practice';
import {workbookCheckFocus,workbookResultState} from '../../lib/workbook-followup';
import {currentLinkedText,resultLinkKey,type WorkbookResultLink} from '../../lib/workbook-result-links';
import {MathText} from './math-text';
import {workbookResearchContinuation,workbookTaskPresentation} from '../../lib/workbook-interface';

export function WorkbookFollowup({content,sources,artifact,savedArtifact,practice,locale,disabled,dirty,active,reveal,onOpenPaper,onStartPractice,onLink,onReviewLink}:{
  content:WorkbookContent;sources:WorkbookSource[];artifact:WorkbookArtifact;savedArtifact?:WorkbookArtifact;practice?:WorkbookPractice;locale:'zh'|'en';disabled:boolean;dirty:boolean;active:boolean;reveal:boolean;
  onOpenPaper:(source:WorkbookSource,focus:string)=>void;onStartPractice?:(id:string)=>void;onLink:(taskId:string,field:WorkbookResultLink['field'])=>void;onReviewLink:(key:string)=>void;
}){
  const zh=locale==='zh';
  const question=artifact.unresolved;
  const tasks=workbookPracticeTasks(content);
  const progress=workbookResearchContinuation(content,practice,zh);
  const saved=tasks.filter(task=>practice?.entries[task.id]?.result.trim()||practice?.entries[task.id]?.unresolved.trim());
  const target=useRef<HTMLElement|null>(null);
  const visible=saved.length>0;
  useEffect(()=>{if(active&&reveal&&visible){target.current?.scrollIntoView({block:'center'});target.current?.focus({preventScroll:true});}},[active,reveal,visible]);
  return <div className="pi-workbook-followup">
    {question.trim()&&<section aria-label={zh?'继续核查待查问题':'Continue checking open questions'}><h3>{zh?'继续核查':'Continue checking'}</h3><p>{zh?'选择论文，带着当前待查问题阅读；完整问题和草稿保留在本比较中。':'Choose a paper to read with the current question. The full question and draft remain in this comparison.'}</p><div className="pi-workbook-followup-actions">{sources.map(source=><button type="button" key={source.id} disabled={disabled} onClick={()=>onOpenPaper(source,workbookCheckFocus('',question))}>{zh?'核查论文：':'Check paper: '}{source.title} →</button>)}</div>{onStartPractice&&<button type="button" disabled={disabled||dirty} onClick={()=>onStartPractice(progress.taskId)}>{progress.label} →</button>}{dirty&&<small>{zh?'先保存判断与待查问题，再进入核查记录。':'Save your judgment and open questions before entering the check record.'}</small>}</section>}
    {visible&&<section ref={target} tabIndex={-1} aria-label={zh?'已保存核查成果':'Saved check results'}><details open={reveal}><summary>{zh?`${saved.length} 项已保存核查记录`:`${saved.length} saved check records`}</summary><p>{zh?'将核查成果关联到判断或待查问题后保存。已有正文保留原样。':'Link check results to your judgment or open questions, then save. Existing prose is retained.'}</p>{saved.map(task=>{
      const entry=practice!.entries[task.id];
      const shown=workbookTaskPresentation(entry,zh);
      const labelZh=task.id==='learning'?'学习核查':`研究核查 ${Number(task.id.slice(5))+1}`;
      const labelEn=task.id==='learning'?'Learning check':`Research check ${Number(task.id.slice(5))+1}`;
      const label=zh?labelZh:labelEn;
      const papers=sources.filter(source=>task.evidenceIds.some(id=>id.endsWith(':'+source.id)));
      const titles=papers.map(paper=>paper.title).join(' / ');
      const labels=[`${labelZh} · 核查材料：${titles}`,`${labelEn} · Check materials: ${titles}`];
      if(!zh)labels.reverse();
      const linkButton=(field:WorkbookResultLink['field'])=>{
        const key=resultLinkKey({taskId:task.id,field}),linked=artifact.links?.find(link=>resultLinkKey(link)===key);
        const revised=linked&&linked.snapshot!==currentLinkedText(practice,linked);
        const persisted=linked&&savedArtifact?.links?.some(saved=>resultLinkKey(saved)===key&&JSON.stringify(saved)===JSON.stringify(linked));
        const legacy=workbookResultState(artifact[field],savedArtifact?.[field]||'',labels,field==='decision'?entry.result:entry.unresolved)!=='available';
        const label=revised?(zh?'核对关联修订':'Review linked revision'):linked?(persisted?(zh?'已关联':'Linked'):(zh?'关联待保存':'Link not saved')):legacy?(zh?'为旧记录建立关联':'Link legacy record'):field==='decision'?(zh?'关联到判断':'Link to judgment'):(zh?'关联到待查问题':'Link to open questions');
        return <button type="button" disabled={disabled||Boolean(linked&&!revised)} onClick={()=>revised?onReviewLink(key):onLink(task.id,field)}>{label}</button>;
      };
      return <article key={task.id}>
        <h4>{label} · {shown.status}</h4>
        <p><MathText>{zh?task.goalZh:task.goalEn}</MathText></p>
        {entry.result&&<>
          <h5>{zh?'成果与依据':'Result and evidence'}</h5><p className="pi-workbook-followup-note">{entry.result}</p>
          {linkButton('decision')}
        </>}
        {entry.unresolved&&<>
          <h5>{zh?'仍待查证':'Still to verify'}</h5><p className="pi-workbook-followup-note">{entry.unresolved}</p>
          {linkButton('unresolved')}
        </>}
        {dirty&&<small>{zh?'先保存当前判断，再返回这项核查。':'Save your current judgment before returning to this check.'}</small>}
        <div className="pi-workbook-followup-actions">
          {onStartPractice&&<button type="button" disabled={disabled||dirty} onClick={()=>onStartPractice(task.id)}>{shown.recordAction} →</button>}
          {papers.map(source=><button key={source.id} type="button" disabled={disabled} onClick={()=>onOpenPaper(source,workbookCheckFocus(zh?task.goalZh:task.goalEn,entry.unresolved||question))}>{zh?'回看材料：':'Revisit source: '}{source.title}</button>)}
        </div>
      </article>;
    })}</details></section>}
  </div>;
}
