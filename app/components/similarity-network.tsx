import { useEffect, useMemo, useRef } from 'react';
import { similarityGroups,type SimilarityMap,type SimilarityPaper } from '../../lib/library-similarity';
import { GraphPaperChoice } from './graph-paper-choice';
import { MathText } from './math-text';
import type { RouteSelection } from './use-route-selection';
import './similarity-network.css';

const palette=['#286e95','#4b7565','#75589a','#96623e','#386a9b','#8c5777'] as const;

export function SimilarityNetwork({map,locale,selectedId,onSelect,onOrigin,onOpen,selection,notice,active=true}:{
  map:SimilarityMap;locale:'zh'|'en';selectedId:string;onSelect:(id:string)=>void;
  onOrigin:(paper:SimilarityPaper)=>void;onOpen:(id:string)=>void;selection?:RouteSelection;notice?:string;active?:boolean;
}){
  const zh=locale==='zh';
  const points=useMemo(()=>{
    const nodes=[{paper:map.origin,x:50,y:50,color:'#254874'}];
    const groups=similarityGroups(map);
    let index=0;
    for(const [groupIndex,group] of groups.entries()){
      for(const paper of group){
        const angle=-Math.PI/2+2*Math.PI*index++/map.papers.length;
        const edge=map.edges.find(edge=>[edge.from,edge.to].includes(map.origin.id)&&[edge.from,edge.to].includes(paper.id));
        const radius=34+8*(1-(edge?.weight||0));
        nodes.push({paper,x:50+Math.cos(angle)*radius,y:50+Math.sin(angle)*radius*.82,color:palette[groupIndex%palette.length]});
      }
    }
    return nodes;
  },[map]);
  const byId=new Map(points.map(node=>[node.paper.id,node]));
  const selected=byId.get(selectedId)?.paper||map.origin;
  const details=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!active||!selectedId||selected.id!==selectedId)return;
    const frame=requestAnimationFrame(()=>details.current?.scrollIntoView({behavior:'auto',block:'nearest'}));
    return ()=>cancelAnimationFrame(frame);
  },[active,selected.id,selectedId]);
  const connection=map.edges.find(edge=>edge.from===map.origin.id&&edge.to===selected.id||edge.to===map.origin.id&&edge.from===selected.id);
  const explanation=connection&&(zh?connection.explanationZh:connection.explanationEn);

  return <section className="pi-similarity-network" aria-label={zh?'相似论文网络':'Similar paper network'}>
    <header><h2>{zh?'相似论文网络':'Similar paper network'}</h2>{notice&&<p>{notice}</p>}</header>
    {map.papers.length>0&&<div className="pi-similarity-canvas">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {map.edges.map(edge=>{
          const from=byId.get(edge.from),to=byId.get(edge.to);
          if(!from||!to)return null;
          return <line key={edge.from+'|'+edge.to} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            className={selected.id===edge.from||selected.id===edge.to?'is-focused':''} strokeWidth={1+edge.weight*3} vectorEffect="non-scaling-stroke"/>;
        })}
      </svg>
      {points.map(({paper,x,y,color})=><button type="button" key={paper.id} className="pi-similarity-node" data-pivot={paper.id===map.origin.id}
        style={{left:`${x}%`,top:`${y}%`,color}} aria-pressed={selected.id===paper.id} aria-label={paper.title} title={paper.title} onClick={()=>onSelect(paper.id)}>
        <i aria-hidden="true"/><span>{paper.title}</span>
      </button>)}
    </div>}
    {map.papers.length>0&&<p className="pi-similarity-legend">{zh?'同色邻居彼此有相似证据，线越粗表示相似程度越高。':'Matching colors mark connected groups. Thicker lines indicate stronger similarity.'}</p>}
    <section ref={details} className="pi-citation-neighbor pi-similarity-detail" aria-label={zh?'相似关系详情':'Similarity details'}>
      <div><p>{selected.id===map.origin.id?(zh?'当前起点':'Starting paper'):(zh?'与起点的相似依据':'Evidence of similarity to the origin')}</p>
      <h3><MathText inline>{selected.title}</MathText></h3>
      {selected.external&&<p>{zh?'外部论文 · 可打开来源阅读':'External paper · open the source to read'}</p>}
      {connection&&<p>{explanation||[connection.references?(zh?`共享 ${connection.references} 篇参考文献`:`${connection.references} shared references`):'',connection.citing?(zh?`被 ${connection.citing} 篇相同论文引用`:`${connection.citing} shared citing papers`):''].filter(Boolean).join(' · ')} · {connection.source}</p>}
      {!!connection?.examples?.length&&<details><summary>{zh?'查看部分共同文献':'See overlapping papers'}</summary><ul>{connection.examples.map((title,index)=><li key={index}>{title}</li>)}</ul></details>}</div>
      <div className="pi-citation-actions">{!selected.external&&<>
      <GraphPaperChoice paper={selected} selection={selection} locale={locale}/>
      <button type="button" onClick={()=>onOpen(selected.id)}>{zh?'阅读论文':'Read paper'}</button>
      {selected.id!==map.origin.id&&<button type="button" onClick={()=>onOrigin(selected)}>{zh?'以此为起点':'Explore from here'}</button>}</>}
      {/^https?:\/\//i.test(selected.url)&&<a href={selected.url} target="_blank" rel="noreferrer">{zh?'打开来源':'Open source'} ↗</a>}</div>
    </section>
    {map.papers.length>0&&<details className="pi-similarity-list"><summary>{zh?'按列表查看相似论文':'Browse similar papers as a list'}</summary>
      <ul>{map.papers.map(paper=><li key={paper.id}><button type="button" aria-pressed={selected.id===paper.id} onClick={()=>onSelect(paper.id)}>{paper.title}</button></li>)}</ul>
    </details>}
  </section>;
}
