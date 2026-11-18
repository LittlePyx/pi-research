import {useEffect,useRef,type RefObject} from 'react';
import type {WorkbookArtifact,WorkbookContent} from '../../lib/research-workbook';

export function WorkbookDimensionNavigation({content,observations,dimensionId,scope,active,inspecting,root,onChange,locale}:{
  content:WorkbookContent;observations:WorkbookArtifact['observations'];dimensionId:string;scope:string;active:boolean;inspecting:boolean;root:RefObject<HTMLElement|null>;onChange:(id:string)=>void;locale:'zh'|'en';
}){
  const consumed=useRef(''),zh=locale==='zh';
  const selected=content.dimensions.findIndex(d=>d.id===dimensionId);
  const scroll=(id:string)=>requestAnimationFrame(()=>{const row=Array.from(root.current?.querySelectorAll<HTMLElement>('[data-comparison-dimension]')||[]).find(node=>node.dataset.comparisonDimension===id);row?.scrollIntoView({block:'start',behavior:'instant'});row?.querySelector<HTMLElement>('th')?.focus({preventScroll:true});});
  useEffect(()=>{
    if(!active||!dimensionId)return;
    const key=scope+':'+dimensionId;if(consumed.current===key)return;consumed.current=key;
    if(selected<0){onChange('');return;}
    if(!inspecting)scroll(dimensionId);
  });
  const choose=(id:string)=>{consumed.current=scope+':'+id;onChange(id);scroll(id);};
  const nextMatching=(kind:'notes'|'missing')=>{
    const ordered=[...content.dimensions.slice(selected+1),...content.dimensions.slice(0,selected+1)];
    const next=ordered.find(d=>d.cells.some(cell=>kind==='notes'?Boolean(observations[`${d.id}:${cell.paperId}`]?.trim()):cell.status==='missing'));
    if(next)choose(next.id);
  };
  const noteCount=content.dimensions.filter(d=>d.cells.some(c=>observations[`${d.id}:${c.paperId}`]?.trim())).length,missingCount=content.dimensions.filter(d=>d.cells.some(c=>c.status==='missing')).length;
  return <nav className="pi-dimension-navigation" aria-label={zh?'比较维度导航':'Comparison dimension navigation'}>
    <label>{zh?'定位比较维度':'Go to comparison dimension'}<select value={selected<0?'':dimensionId} onChange={event=>{if(event.target.value)choose(event.target.value);}}><option value="">{zh?'选择维度…':'Choose a dimension…'}</option>{content.dimensions.map((d,index)=><option key={d.id} value={d.id}>{index+1}. {zh?d.labelZh:d.labelEn}</option>)}</select></label>
    <div><button type="button" disabled={selected<=0} onClick={()=>choose(content.dimensions[selected-1].id)} aria-label={zh?'上一个维度':'Previous dimension'}>←</button><button type="button" disabled={selected>=content.dimensions.length-1} onClick={()=>choose(content.dimensions[Math.max(0,selected+1)].id)} aria-label={zh?'下一个维度':'Next dimension'}>→</button></div>
    <div className="pi-dimension-shortcuts"><button type="button" disabled={!noteCount} onClick={()=>nextMatching('notes')}>{zh?`定位有笔记的维度 · ${noteCount}`:`Dimensions with notes · ${noteCount}`}</button><button type="button" disabled={!missingCount} onClick={()=>nextMatching('missing')}>{zh?`定位摘要缺失维度 · ${missingCount}`:`Missing abstract information · ${missingCount}`}</button></div>
  </nav>;
}
