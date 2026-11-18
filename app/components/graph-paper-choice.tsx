import type { GraphTaskPaper } from '../../lib/graph-task';
import type { RouteSelection } from './use-route-selection';

export function GraphPaperChoice({paper,selection,locale}:{paper:GraphTaskPaper;selection:RouteSelection|undefined;locale:'zh'|'en'}){
  const zh=locale==='zh';
  const selected=Boolean(selection?.value.papers.some(item=>item.canonicalId.toLowerCase()===paper.canonicalId.toLowerCase()));
  const full=Boolean(!selected&&selection&&selection.value.papers.length>=3);
  const hint=!selection?(zh?'先选择比较所属路线':'Choose a comparison route first'):full?(zh?'最多选 3 篇论文':'Choose up to 3 papers'):undefined;
  return <button className="pi-graph-paper-choice" type="button" aria-pressed={selected} title={hint}
    aria-label={`${selected?(zh?'移出比较':'Remove from comparison'):(zh?'加入比较':'Add to comparison')} ${paper.title}`}
    disabled={!selection||full} onClick={()=>selection?.toggle(paper)}>
    {selected?(zh?'已加入比较':'Added to comparison'):(zh?'加入比较':'Add to comparison')}
  </button>;
}
