import type {WorkbookContent,WorkbookSource} from '../../lib/research-workbook';
import {workbookPaperLabel} from '../../lib/research-workbook';
import {MathText} from './math-text';

/** A dimension appears once; each paper keeps its own exact evidence target. */
export function WorkbookEvidenceLinks({content,sources,evidenceIds,locale,focus,onInspect}:{
  content:WorkbookContent;sources:WorkbookSource[];evidenceIds:string[];locale:'zh'|'en';focus:string;onInspect:(id:string)=>void;
}){
  const zh=locale==='zh',selected=new Set(evidenceIds);
  return <div className="pi-workbook-evidence-groups">{content.dimensions.map(dimension=>{
    const papers=sources.filter(source=>selected.has(`${dimension.id}:${source.id}`));
    if(!papers.length)return null;
    const label=zh?dimension.labelZh:dimension.labelEn;
    return <div key={dimension.id} className="pi-workbook-evidence-group" role="group" aria-label={label}>
      <span className="pi-workbook-evidence-dimension"><MathText inline>{label}</MathText></span>
      <div className="pi-workbook-evidence-papers">{papers.map(source=>{
        const id=`${dimension.id}:${source.id}`,paper=workbookPaperLabel(source.id,sources);
        return <button key={id} type="button" data-evidence-id={id} aria-label={`${label} · ${paper} · ${source.title}`} aria-pressed={focus===id} title={source.title} onClick={()=>onInspect(id)}>
          <span>{paper}</span> {zh?'摘要':'Abstract'} <span aria-hidden="true">›</span>
        </button>;
      })}</div>
    </div>;
  })}</div>;
}
