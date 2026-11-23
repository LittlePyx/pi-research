"use client";

import { workspaceFetch as fetch } from "../../lib/workspace-request";
import { useEffect, useRef, useState } from "react";
import type { RouteSelection } from "./use-route-selection";
import { LibraryCitationNeighborhood, type LibraryCitationSnapshot } from "./library-citation-neighborhood";
import { LibrarySimilarityExplorer } from "./library-similarity-explorer";

type ExplorationLocation = { focusId?: string; neighbor?: string; display?: "list" };

export function LibraryExplorer({spaceId,locale,onOpen,onLibrary,location,onStateChange,controlledSelection,active=true,graphMode,onGraphMode}:{
  spaceId:string;locale:"zh"|"en";onOpen:(id:string)=>void;onLibrary:()=>void;location:ExplorationLocation;
  onStateChange:(patch:ExplorationLocation,history:"push"|"replace")=>void;
  controlledSelection?:RouteSelection;active?:boolean;graphMode:"citations"|"similarity";onGraphMode:(mode:"citations"|"similarity")=>void;
}) {
  if(!location.focusId)return <button type="button" onClick={onLibrary}>{locale==="zh"?"去论文库选择焦点论文":"Choose a paper in the library"}</button>;
  return <LibraryPaperRelations key={spaceId+":"+location.focusId} spaceId={spaceId} locale={locale}
    onOpen={onOpen} onLibrary={onLibrary} location={{...location,focusId:location.focusId}}
    onStateChange={onStateChange} controlledSelection={controlledSelection}
    active={active} graphMode={graphMode} onGraphMode={onGraphMode}/>;
}

function LibraryPaperRelations({spaceId,locale,onOpen,onLibrary,location,onStateChange,controlledSelection,active=true,graphMode,onGraphMode}:
  Omit<Parameters<typeof LibraryExplorer>[0],"location"> & {location:ExplorationLocation & {focusId:string}}) {
  const zh=locale==="zh", focusId=location.focusId;
  const [graph,setGraph]=useState<LibraryCitationSnapshot|null>(null);
  const [checking,setChecking]=useState(false),[graphError,setGraphError]=useState(""),[reload,setReload]=useState(0);
  const [now,setNow]=useState(Date.now);
  const graphRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>graphRequest.current?.abort(),[]);
  useEffect(()=>{
    const delay=(graph?.retryAt||0)-Date.now();
    if(delay<=0)return;
    const timer=setTimeout(()=>setNow(Date.now()),delay+50);
    return()=>clearTimeout(timer);
  },[graph?.retryAt]);
  const chooseFocus=(next:{id:string})=>onStateChange({focusId:next.id,neighbor:undefined,display:undefined},"push");
  useEffect(()=>{
    if(!active||checking||graphMode!=='citations')return;
    const controller=new AbortController();graphRequest.current?.abort();graphRequest.current=controller;
    fetch(`/api/library-graph?spaceId=${encodeURIComponent(spaceId)}&paperId=${encodeURIComponent(focusId)}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])})
      .then(async response=>{if(!response.ok)throw Error();return response.json() as Promise<LibraryCitationSnapshot>;})
      .then(result=>{if(!controller.signal.aborted){setGraph(result);setGraphError('');setNow(Date.now());}})
      .catch(()=>{if(!controller.signal.aborted)setGraphError(zh?'暂时无法读取引用关系。':'Citation links could not load.');});
    return()=>controller.abort();
  },[active,focusId,spaceId,zh,reload,checking,graphMode]);
  const check=async()=>{
    if(checking)return;
    graphRequest.current?.abort();const controller=new AbortController();graphRequest.current=controller;
    setChecking(true);setGraphError('');
    try{
      const response=await fetch('/api/library-graph',{method:'POST',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(65000)]),headers:{'Content-Type':'application/json'},body:JSON.stringify({spaceId,paperId:focusId})});
      if(!response.ok)throw Error();
      const result=await response.json() as LibraryCitationSnapshot;
      if(!controller.signal.aborted){setGraph(result);setNow(Date.now());}
    }catch{if(!controller.signal.aborted)setGraphError(zh?'本次查询未完成，已显示的引用仍保留。':'The query did not finish. Visible links are preserved.');}
    finally{if(graphRequest.current===controller&&!controller.signal.aborted)setChecking(false);}
  };

  return <section className="pi-library-explorer">
    <div className="pi-library-citation-start">
      <nav aria-label={zh?'论文关系类型':'Paper relationships'} className="pi-graph-mode-tabs">
        <button type="button" aria-pressed={graphMode==='citations'} onClick={()=>onGraphMode('citations')}>{zh?'直接引用':'Direct citations'}</button>
        <button type="button" aria-pressed={graphMode==='similarity'} onClick={()=>onGraphMode('similarity')}>{zh?'相似论文':'Similar papers'}</button>
      </nav>
      {graphMode==='similarity'?<LibrarySimilarityExplorer spaceId={spaceId} paperId={focusId} locale={locale} onOpen={onOpen} onOrigin={chooseFocus} active={active}
        selectedId={location.neighbor?.startsWith('similar:')?location.neighbor.slice(8):''} onSelect={id=>onStateChange({neighbor:'similar:'+id},'replace')}
        selection={controlledSelection} onCitations={()=>onGraphMode('citations')}/>:
      <LibraryCitationNeighborhood paper={{id:focusId,title:graph?.focusTitle||(zh?'所选论文':'Selected paper')}} graph={graph} locale={locale} checking={checking} loading={!graph&&!graphError} cooling={Boolean(graph&&graph.retryAt>now)} error={graphError}
        active={active} selection={controlledSelection} mode={location.display||'graph'} selected={location.neighbor||''} onSelect={neighbor=>onStateChange({neighbor},'replace')} onMode={mode=>onStateChange({display:mode==='list'?'list':undefined},'replace')}
        onCheck={()=>void check()} onRetry={()=>{setGraphError('');setReload(n=>n+1);}} onOpen={onOpen} onFocus={chooseFocus} />}

    </div>
    <button type="button" className="pi-explorer-library-link" onClick={onLibrary}>{zh?'在论文库更换焦点':'Choose another paper in the library'}</button>
  </section>;
}
