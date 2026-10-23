import type {WorkbookContent,WorkbookSource} from '../../lib/research-workbook';
import {workbookPaperLabel} from '../../lib/research-workbook';
import {workbookEvidenceSelection} from '../../lib/workbook-inspector';

export function WorkbookEvidenceNavigation({content,sources,focus,locale,onChange}:{content:WorkbookContent;sources:WorkbookSource[];focus:string;locale:'zh'|'en';onChange:(id:string)=>void}){
  const current=workbookEvidenceSelection(content,sources,focus);
  if(!current)return null;
  const zh=locale==='zh';
  const chooseDimension=(index:number)=>{const dimension=content.dimensions[index];if(dimension?.cells.some(cell=>cell.paperId===current.source.id))onChange(`${dimension.id}:${current.source.id}`);};
  return <div className="pi-inspector-navigation">
    <label>{zh?'比较维度':'Comparison dimension'}<select value={current.dimension.id} onChange={event=>chooseDimension(content.dimensions.findIndex(d=>d.id===event.target.value))}>{content.dimensions.map(dimension=><option key={dimension.id} value={dimension.id}>{zh?dimension.labelZh:dimension.labelEn}</option>)}</select></label>
    <div className="pi-inspector-dimension-actions"><button type="button" aria-label={zh?'上一个比较维度':'Previous comparison dimension'} disabled={current.index===0} onClick={()=>chooseDimension(current.index-1)}>←</button><span>{current.index+1} / {current.total}</span><button type="button" aria-label={zh?'下一个比较维度':'Next comparison dimension'} disabled={current.index===current.total-1} onClick={()=>chooseDimension(current.index+1)}>→</button></div>
    <div role="group" aria-label={zh?'依据论文':'Evidence papers'} className="pi-inspector-paper-switch">{sources.filter(source=>current.dimension.cells.some(cell=>cell.paperId===source.id)).map(source=><button key={source.id} type="button" aria-pressed={source.id===current.source.id} aria-label={`${workbookPaperLabel(source.id,sources)} · ${source.title}`} title={source.title} onClick={()=>onChange(`${current.dimension.id}:${source.id}`)}><b>{workbookPaperLabel(source.id,sources)}</b><span>{source.title}</span></button>)}</div>
  </div>;
}
