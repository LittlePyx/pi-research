import type {WorkbookArtifact,WorkbookContent,WorkbookSource} from '../../lib/research-workbook';
import {workbookPaperLabel} from '../../lib/research-workbook';
import {MathText} from './math-text';
import './workbook-comparison.css';

/** One set of cells and return anchors, presented as a table or dimension cards. */
export function WorkbookComparison({content,sources,observations,locale,focus,onInspect}:{
  content:WorkbookContent;sources:WorkbookSource[];observations:WorkbookArtifact['observations'];locale:'zh'|'en';focus:string;onInspect:(id:string)=>void;
}){
  const zh=locale==='zh';
  return <section className="pi-workbook-comparison" aria-label={zh?'条件比较':'Condition comparison'}>
    <h2>{zh?'条件比较表':'Condition comparison'}</h2>
    <p>{zh?'逐项对齐两篇或三篇论文的条件，选择陈述查看对应摘要依据并记录核查。':'Align the conditions across two or three papers. Select a statement to inspect its abstract evidence and record your check.'}</p>
    <div className="pi-workbook-table-scroll"><table className="pi-comparison-table">
      <thead><tr><th scope="col">{zh?'比较维度':'Dimension'}</th>{sources.map(source=><th scope="col" key={source.id}><b>{workbookPaperLabel(source.id,sources)}</b><MathText inline>{source.title}</MathText></th>)}</tr></thead>
      <tbody>{content.dimensions.map(dimension=><tr key={dimension.id} data-comparison-dimension={dimension.id}>
        <th scope="row"><strong>{zh?dimension.labelZh:dimension.labelEn}</strong><small>{zh?dimension.purposeZh:dimension.purposeEn}</small></th>
        {sources.map(source=>{
          const cell=dimension.cells.find(cell=>cell.paperId===source.id)!;
          const id=`${dimension.id}:${source.id}`,paper=workbookPaperLabel(source.id,sources);
          return <td key={source.id}><button type="button" data-evidence-id={id} data-evidence-origin={`table:${id}`} aria-pressed={focus===id} aria-label={`${zh?dimension.labelZh:dimension.labelEn} · ${paper} · ${source.title}`} onClick={()=>onInspect(id)}>
            <span className="pi-cell-paper"><b>{paper}</b><MathText inline>{source.title}</MathText></span>
            <span className="pi-cell-claim"><MathText>{cell.status==='missing'?(zh?'摘要未提供':'Not provided in abstract'):(zh?cell.textZh:cell.textEn)}</MathText></span>
            <span className="pi-cell-actions"><span>{zh?'查看依据':'View evidence'} →</span>{observations[id]&&<small>{zh?'已有核查笔记':'Check recorded'}</small>}</span>
          </button></td>;
        })}
      </tr>)}</tbody>
    </table></div>
  </section>;
}
