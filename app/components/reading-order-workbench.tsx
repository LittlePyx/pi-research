'use client';

import {citationSourceHref,type RouteCitationPaper} from '../../lib/library-graph';
import type {ResearchTrackPaper} from '../../lib/research-map';
import {MathText} from './math-text';

export function ReadingOrderWorkbench({focus,references,citations,locale,onOpen,onAgenda,onCitations}:{
  focus:ResearchTrackPaper;references:RouteCitationPaper[];citations:RouteCitationPaper[];locale:'zh'|'en';
  onOpen:(id:string)=>void;onAgenda:()=>void;onCitations:()=>void;
}){
  const zh=locale==='zh';
  const direct=(paper:RouteCitationPaper)=>paper.paperId
    ? <button type="button" onClick={()=>onOpen(paper.paperId!)}><MathText inline>{paper.title}</MathText> →</button>
    : citationSourceHref(paper)
      ? <a href={citationSourceHref(paper)} target="_blank" rel="noreferrer"><MathText inline>{paper.title}</MathText> ↗</a>
      : <MathText inline>{paper.title}</MathText>;
  const related=(papers:RouteCitationPaper[],empty:string)=>papers.length
    ? <ul>{papers.slice(0,2).map(item=><li key={item.canonicalId}>{direct(item)}<small>{[item.year,item.sources.join(' / ')].filter(Boolean).join(' · ')}</small></li>)}</ul>
    : <p className="pi-reading-trail-gap">{empty}</p>;
  const reason=zh?focus.rationaleZh:focus.rationaleEn;
  return <section className="pi-reading-trail" aria-label={zh?'阅读脉络':'Reading trail'}>
    <header><h3>{zh?'围绕焦点论文怎么读':'How to read around the focus'}</h3>
      <p>{zh?'沿直接引用找原始依据，再查后续论文如何沿用或改动它。':'Use direct citations to find the original sources and see how later work uses or changes them.'}</p></header>
    <div className="pi-reading-trail-stages">
      <section><h4>{zh?'补前置依据':'Read the sources'}</h4>
        <p>{zh?'回到本文引用的工作，核对定义、假设或关键工具。':'Check definitions, assumptions or tools in work the focus cites.'}</p>
        {related(references,zh?'还没有已查到的参考文献。':'No references have been found yet.')}
      </section>
      <section className="pi-reading-trail-focus"><h4>{zh?'读焦点论文':'Read the focus'}</h4>
        {reason&&<p><MathText inline>{reason}</MathText></p>}
        <p>{zh?'记录主要结论及其成立条件。':'Record the main result and the conditions it depends on.'}</p>
      </section>
      <section><h4>{zh?'追后续研究':'Follow later work'}</h4>
        <p>{zh?'查引用本文的论文具体用了哪一条结论，并留意改动的条件。':'Check which result later papers use and which conditions they change.'}</p>
        {related(citations,zh?'还没有已查到的后续引用。':'No citing papers have been found yet.')}
      </section>
    </div>
    <footer className="pi-route-evidence-actions">
      <button type="button" onClick={onCitations}>{zh?'查看完整引用列表':'View full citation list'} →</button>
      <button type="button" onClick={onAgenda}>{zh?'在研究计划中安排任务':'Open route research plan'} →</button>
    </footer>
  </section>;
}
