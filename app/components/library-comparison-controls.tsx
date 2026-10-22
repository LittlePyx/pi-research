import {useEffect,useState} from 'react';
import { workspaceFetch as fetch } from '../../lib/workspace-request';
import type {RouteSelection} from './use-route-selection';

type Route={id:string;titleZh:string;titleEn:string;question:string};
export function LibraryComparisonControls({spaceId,trackId,locale,selection,onTrack,onResearch}:{spaceId:string;trackId:string;locale:'zh'|'en';selection:RouteSelection;onTrack:(id:string)=>void;onResearch:()=>void}){
  const zh=locale==='zh';
  const [remote,setRemote]=useState<{spaceId:string;routes:Route[];failed:boolean}>({spaceId:'',routes:[],failed:false});
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    fetch('/api/research-workbook?'+new URLSearchParams({spaceId,routes:'1'}),{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])})
      .then(async response=>{const data=await response.json() as {spaceId:string;routes:Route[]};if(!response.ok||data.spaceId!==spaceId||!Array.isArray(data.routes))throw Error();return data.routes;})
      .then(routes=>{if(!abort.signal.aborted)setRemote({spaceId,routes,failed:false});})
      .catch(()=>{if(!abort.signal.aborted)setRemote({spaceId,routes:[],failed:true});});
    return()=>abort.abort();
  },[spaceId,retry]);
  const loaded=remote.spaceId===spaceId&&!remote.failed;
  const route=loaded?remote.routes.find(route=>route.id===trackId):undefined;
  useEffect(()=>{if(route?.question)selection.seedQuestion(route.question,true);},[spaceId,trackId,route?.question]);
  return <section className="pi-library-comparison" aria-label={zh?'从论文库开始比较':'Compare from the library'}>
    <details open={Boolean(trackId)}><summary>{zh?'选择论文比较':'Choose papers to compare'}</summary>
    <div><strong>{zh?'选论文，推进一个研究问题':'Choose papers for a research question'}</strong><p>{zh?'选择所属路线，再勾选 2–3 篇可用论文。切换路线会保留各自的问题和选择。':'Choose a route, then select 2–3 eligible papers. Each route keeps its own question and selection.'}</p></div>
    <label>{zh?'比较所属路线':'Comparison route'}<select value={trackId} disabled={!loaded} onChange={event=>onTrack(event.target.value)}><option value="">{zh?'选择研究路线…':'Choose a research route…'}</option>{trackId&&!route&&<option value={trackId}>{zh?'当前路线暂未载入':'Current route unavailable'}</option>}{loaded&&remote.routes.map(route=><option key={route.id} value={route.id}>{zh?route.titleZh:route.titleEn}</option>)}</select></label>
    {remote.spaceId===spaceId&&remote.failed?<p role="alert">{zh?'路线暂未载入，搜索和已有选择仍保留。':'Routes could not load. Search and selections are preserved.'}<button type="button" onClick={()=>setRetry(n=>n+1)}>{zh?'重试加载路线':'Retry routes'}</button></p>:loaded&&!remote.routes.length?<p>{zh?'先建立一条研究路线，即可把比较保存在对应问题下。':'Create a route to save a comparison under its research question.'}<button type="button" onClick={onResearch}>{zh?'前往研究路线':'Open research routes'} →</button></p>:!loaded?<p role="status">{zh?'正在读取研究路线…':'Loading research routes…'}</p>:null}
    {route&&<label className="pi-library-comparison-question">{zh?'本次比较问题':'Comparison question'}<textarea value={selection.value.question} maxLength={1000} onChange={event=>selection.change({...selection.value,question:event.target.value})} placeholder={zh?'输入要用这些论文核对的具体问题':'What should these papers help you check?'} /></label>}
    </details>
  </section>;
}
