import { useMemo } from 'react';
import { focusSimilarity } from '../../lib/library-similarity';
import type { ResearchPaperEdge } from '../../lib/research-map';
import { researchPaperYear } from '../../lib/research-workspace-presentation';
import type { NetworkPaperNode } from './paper-network-graph';
import { SimilarityNetwork } from './similarity-network';
import type { RouteSelection } from './use-route-selection';

export function RouteSimilarityExplorer({nodes,edges,focusId,neighborId,locale,selection,onFocus,onNeighbor,onOpen}:{
  nodes:NetworkPaperNode[];edges:ResearchPaperEdge[];focusId:string|null;neighborId:string;locale:'zh'|'en';
  selection?:RouteSelection;onFocus:(id:string)=>void;onNeighbor:(id:string)=>void;onOpen:(id:string)=>void;
}) {
  const zh=locale==='zh';
  const map=useMemo(()=>{
    const papers=nodes.map(({paper,external})=>({
      id:paper.id,canonicalId:paper.canonicalId,title:paper.title,authors:paper.authors,url:paper.url,year:researchPaperYear(paper),external:Boolean(external),
    }));
    const origin=papers.find(paper=>!paper.external&&paper.id===focusId)||papers.find(paper=>!paper.external);
    if(!origin)return null;
    const similarity=edges.filter(edge=>edge.kind==='similarity'&&edge.relationKind==='bibliographic_coupling').map(edge=>({
      from:edge.sourcePaperId,to:edge.targetPaperId,weight:Math.max(0,Math.min(1,edge.confidence/100)),
      source:edge.evidenceSource,explanationZh:edge.relationshipZh,explanationEn:edge.relationshipEn,
    }));
    return focusSimilarity(origin,papers,similarity);
  },[nodes,edges,focusId]);
  return map?<SimilarityNetwork map={map} locale={locale} selectedId={neighborId} onSelect={onNeighbor}
    onOrigin={paper=>onFocus(paper.id)} onOpen={onOpen} selection={selection}
    notice={map.papers.length?(zh?'根据路线材料与已查询候选的共同参考文献绘制。':'Based on shared references from route papers and checked candidates.'):
      (zh?'当前起点暂无已核验的相似论文。可换起点，或核验路线关系。':'No verified similar papers for this origin yet. Change the origin or verify route links.')} />:
    <p>{zh?'当前路线暂无论文。':'This route has no papers yet.'}</p>;
}
