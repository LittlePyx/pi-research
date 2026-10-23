import type {WorkbookContent,WorkbookSource} from '../../lib/research-workbook';
import {MathText} from './math-text';
import {WorkbookEvidenceLinks} from './workbook-evidence-links';

export function WorkbookTaskPanel({content,sources,locale,focus,disabled,dirty,onInspect,onStartPractice}:{
  content:WorkbookContent;sources:WorkbookSource[];locale:'zh'|'en';focus:string;disabled:boolean;dirty:boolean;onInspect:(id:string)=>void;onStartPractice?:(id:string)=>void;
}){
  const zh=locale==='zh';
  return <section className="pi-workbook-task-panel" aria-label={zh?'研究核查任务':'Research checks'}>
    <header className="pi-workbook-task-intro">
      <h2><MathText>{zh?content.task.titleZh:content.task.titleEn}</MathText></h2>
      <p>{zh?'对照摘要依据，记录每项结论的适用条件。选择 P1、P2 等论文编号查看对应出处。':'Check the abstract evidence and record the conditions of each claim. Choose a paper label, such as P1 or P2, to inspect its source.'}</p>
    </header>
    <ol className="pi-workbook-task-list">{content.task.steps.map((step,index)=><li key={index}>
      <article className="pi-workbook-task-card">
        <header><h3>{zh?'核查':'Check'} {String(index+1).padStart(2,'0')}</h3>{onStartPractice&&<button className="pi-workbook-task-action" type="button" disabled={disabled} onClick={()=>onStartPractice(`task-${index}`)}>{zh?'执行这项核查':'Work on this check'} →</button>}</header>
        <p><MathText>{zh?step.textZh:step.textEn}</MathText></p>
        <WorkbookEvidenceLinks content={content} sources={sources} evidenceIds={step.evidenceIds} locale={locale} focus={focus} onInspect={onInspect} />
      </article>
    </li>)}</ol>
    <details className="pi-workbook-task-standard"><summary>{zh?'完成标准':'Completion criteria'}</summary><p><MathText>{zh?content.task.criterionZh:content.task.criterionEn}</MathText></p></details>
    <details className="pi-workbook-lesson"><summary>{zh?'配套学习练习':'Supporting learning exercise'}</summary><div>
      <h3><MathText>{zh?content.learning.goalZh:content.learning.goalEn}</MathText></h3>
      <dl><dt>{zh?'需要的基础':'Prerequisites'}</dt><dd><MathText>{zh?content.learning.prerequisiteZh:content.learning.prerequisiteEn}</MathText></dd>
        <dt>{zh?'练习内容':'Exercise'}</dt><dd><MathText>{zh?content.learning.exerciseZh:content.learning.exerciseEn}</MathText></dd>
        <dt>{zh?'检查自己的结果':'Check your result'}</dt><dd><MathText>{zh?content.learning.checkpointZh:content.learning.checkpointEn}</MathText></dd></dl>
      {onStartPractice&&<button type="button" disabled={disabled} onClick={()=>onStartPractice('learning')}>{zh?'开始这项学习练习':'Start this learning exercise'} →</button>}
    </div></details>
    {dirty&&<small>{zh?'请先保存当前记录，再进入核查任务。':'Save current notes before entering a check.'}</small>}
  </section>;
}
