import type {LibrarySimilaritySnapshot,SimilarityPaper} from '../../lib/library-similarity';
import {SimilarityNetwork} from './similarity-network';
import type {RouteSelection} from './use-route-selection';
import {useSavedRead} from './use-saved-read';

function similarityResponse(value:unknown):LibrarySimilaritySnapshot {
  const result=value as LibrarySimilaritySnapshot;
  if(!result?.map?.origin?.id||!Array.isArray(result.map.papers)||!Array.isArray(result.map.edges)||!Number.isSafeInteger(result.scanned))throw Error('Invalid similarity projection');
  return result;
}

export function LibrarySimilarityExplorer({spaceId,paperId,locale,selectedId,onSelect,onOpen,onOrigin,selection,onCitations,active}:{
  spaceId:string;paperId:string;locale:'zh'|'en';selectedId:string;onSelect:(id:string)=>void;onOpen:(id:string)=>void;
  onOrigin:(paper:SimilarityPaper)=>void;selection?:RouteSelection;onCitations:()=>void;active:boolean;
}){
  const zh=locale==='zh';
  const url='/api/library-graph?'+new URLSearchParams({spaceId,paperId,mode:'similarity'});
  const read=useSavedRead(JSON.stringify([spaceId,paperId]),url,similarityResponse);
  const result=read.data?.map.origin.id===paperId?read.data:null;
  return <>
    {read.loading&&<p role="status">{zh?'正在查找共同文献…':'Checking shared literature…'}</p>}
    {read.error&&<p role="alert">{zh?'相似关系暂未载入。':'Similarity links could not load.'} <button type="button" onClick={read.reload}>{zh?'重试':'Retry'}</button></p>}
    {result&&<SimilarityNetwork map={result.map} locale={locale} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} onOrigin={onOrigin} selection={selection} active={active}
      notice={!result.originHasLinks?(zh?'当前论文还没有可用于计算的引用记录。':'The starting paper has no cached citation data to compare.'):
        result.map.papers.length?(zh?`基于 ${result.scanned} 篇近期已查询论文的记录，最多显示 12 篇邻居。`:`Based on ${result.scanned} recently checked papers, with up to 12 neighbors.`):
        (zh?`在 ${result.scanned} 篇近期已查询论文中，共同文献证据暂不足。`:`Shared evidence was insufficient among ${result.scanned} recently checked papers.`)} />}
    {result&&!result.originHasLinks&&<button type="button" onClick={onCitations}>{zh?'查看和查询引用 →':'Open citation lookup →'}</button>}
  </>;
}
