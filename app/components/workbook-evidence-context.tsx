import type {WorkbookContent,WorkbookSource} from '../../lib/research-workbook';
import {workbookPaperLabel} from '../../lib/research-workbook';
import {workbookEvidenceSelection} from '../../lib/workbook-inspector';
import {MathText} from './math-text';

export function WorkbookEvidenceContext({content,sources,focus,locale}:{content:WorkbookContent;sources:WorkbookSource[];focus:string;locale:'zh'|'en'}){
  const current=workbookEvidenceSelection(content,sources,focus);
  if(!current)return null;
  const zh=locale==='zh',{cell,dimension,source}=current,paper=workbookPaperLabel(source.id,sources);
  return <div className="pi-inspector-context">
    <section aria-label={zh?'本项比较陈述':'Current comparison statement'} className="pi-inspector-claim">
      <small>{paper} · {zh?dimension.labelZh:dimension.labelEn}</small><h3>{zh?'正在核对的陈述':'Statement being checked'}</h3>
      <p><MathText>{cell.status==='missing'?(zh?'摘要未提供这项信息':'This information is not provided in the abstract'):(zh?cell.textZh:cell.textEn)}</MathText></p>
      <small>{zh?'核查目标：':'Check goal: '}<MathText inline>{zh?dimension.purposeZh:dimension.purposeEn}</MathText></small>
    </section>
    <section aria-label={zh?'对应摘要依据':'Corresponding abstract evidence'}>
      <small>{zh?'对应摘要依据':'CORRESPONDING ABSTRACT EVIDENCE'} · {paper}</small><h3><MathText inline>{source.title}</MathText></h3>
      {cell.status==='supported'&&cell.quote?(cell.quotes||[cell.quote]).map((quote,index)=><blockquote key={index}><MathText>{quote}</MathText><cite>{zh?'来源：该论文摘要':'Source: paper abstract'} · {index+1}</cite></blockquote>):<p>{zh?'摘要未提供这项信息，不能用推测补全。':'The abstract does not provide this information; do not fill it by inference.'}</p>}
      <p className="pi-inspector-scope">{zh?'依据范围：论文摘要。这里没有核查全文中的定义与定理。':'Evidence scope: paper abstract. Full-text definitions and theorems have not been checked here.'}</p>
    </section>
    <details className="pi-inspector-boundary"><summary>{zh?'本次研究问题与比较边界':'Research question and comparison boundary'}</summary><p><MathText>{zh?content.questionZh:content.questionEn}</MathText></p><p><MathText>{zh?content.comparison.textZh:content.comparison.textEn}</MathText></p></details>
  </div>;
}
