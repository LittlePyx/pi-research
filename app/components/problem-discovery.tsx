'use client';
import {useCallback,useEffect,useState} from 'react';
import { workspaceFetch as fetch } from '../../lib/workspace-request';

type Trace = {job:{status:string}|null;queries?:{days:string;months:string;years:string};branches:{horizon:string;candidates:number;error:string|null}[];papers:{id:string;title:string;query:string;decision:string|null;reason:string|null;recommended:number|null}[]};
export function ProblemDiscovery({spaceId,problemId,locale,onRead,expanded=false}:{expanded?:boolean;spaceId:string;problemId:string;locale:'zh'|'en';onRead:(id:string)=>void}) {
 const [data,setData]=useState<Trace|null>(null),[busy,setBusy]=useState(expanded),[error,setError]=useState(false);
 const zh=locale==='zh';
 const read=useCallback(async(signal:AbortSignal)=>{const r=await fetch('/api/problem-discovery?'+new URLSearchParams({spaceId,problemId}),{signal});if(!r.ok)throw Error();return await r.json() as Trace},[spaceId,problemId]);
 async function load(){setBusy(true);setError(false);try{setData(await read(AbortSignal.timeout(20000)))}catch{setError(true)}finally{setBusy(false)}}
 useEffect(()=>{
  if(!expanded)return;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let cancelled=false;
  void read(controller.signal).then(value=>{if(!cancelled){setData(value);setError(false)}}).catch(()=>{if(!cancelled)setError(true)}).finally(()=>{clearTimeout(timer);if(!cancelled)setBusy(false)});
  return()=>{cancelled=true;clearTimeout(timer);controller.abort()};
 },[expanded,read]);
 return <details open={expanded||undefined} className="pi-question-discovery"><summary onClick={()=>{if(!data&&!busy)void load()}}>{zh?'检索记录':'Discovery record'}</summary>
 {busy&&<p role="status">{zh?'正在读取…':'Loading…'}</p>}
 {error&&<p role="alert">{zh?'记录暂未读到。':'Could not load the record.'}</p>}
 {data&&!data.job&&<p>{zh?'最近任务没有保存此问题的独立查询记录。下一次新扫描将生成，已有推荐不会因此重算。':'The latest task has no separate query record for this problem. The next new scan will create one; existing recommendations are unchanged.'}</p>}
 {data?.queries&&<><dl>{(['days','months','years'] as const).map((h,i)=><div key={h}><dt>{(zh?['近期进展','方法与假设','基础文献 · 不限起始年份']:['Recent progress','Methods & assumptions','Foundations · no start-year limit'])[i]}</dt><dd>{data.queries![h]}</dd>{data.branches.find(b=>b.horizon===h)?.error&&<dd>{zh?'来源暂不可用，保留已有材料。':'Source unavailable; existing materials are retained.'}</dd>}</div>)}</dl>
 <p>{zh?'以下最多展示 30 条问题专属 Crossref 查询累计命中的材料；评审结论仅来自本轮任务。其他来源未列在此处，命中不代表相关或已推荐。':'Up to 30 cumulative matches from the dedicated Crossref queries; other sources are not listed here. Review decisions belong to this run only. A match is not a recommendation.'}</p>
 {!data.papers.length&&<p>{zh?'这些查询暂未返回可展示的材料。':'No materials are available for these queries yet.'}</p>}
 {data.papers.map((p,i)=><article key={p.id+':'+i}><button type="button" onClick={()=>onRead(p.id)}>{p.title}</button><p>{p.recommended?(zh?'本轮通过推荐核验':'Verified recommendation this run'):p.decision?(zh?'本轮已有评审记录':'Reviewed this run'):(zh?'本轮尚无评审结论':'No review decision this run')}</p>{p.reason&&<p>{p.reason}</p>}<small>{p.query}</small></article>)}</>}
 <button type="button" disabled={busy} onClick={()=>void load()}>{zh?'刷新记录':'Refresh record'}</button></details>;
}
