import {useEffect,useState} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
import type {RouteOverview} from '../../lib/route-overview';
import type {GraphTaskContext} from '../../lib/graph-task';
import {comparisonInputKey,readComparisonInput} from '../../lib/comparison-input';
import {comparisonLocation,readComparisonLocation} from '../../lib/workbook-continuation';

/** Only expose a response that belongs to the currently selected workspace and route. */
export function useComparisonTask(userId:string,spaceId:string,trackId:string,selection:GraphTaskContext){
  const scope=JSON.stringify([spaceId,trackId]);
  const [remote,setRemote]=useState<{scope:string;value:RouteOverview|null;failed:boolean}>({scope:'',value:null,failed:false});
  const [retry,setRetry]=useState(0);
  const intentKey=JSON.stringify([scope,selection.question,selection.papers.map(p=>p.canonicalId.toLowerCase())]);
  const [intent,setIntent]=useState<{key:string;id:string|null;failed:boolean}>({key:'',id:null,failed:false});
  useEffect(()=>{
    if(!trackId)return;
    const abort=new AbortController();
    workspaceFetch('/api/research-workbook?'+new URLSearchParams({spaceId,trackId,overview:'1'}),{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]),cache:'no-store'})
      .then(async r=>{const data=await r.json() as {overview:RouteOverview};if(!r.ok||data.overview?.spaceId!==spaceId||data.overview.trackId!==trackId)throw Error();return data.overview;})
      .then(value=>{if(!abort.signal.aborted)setRemote({scope,value,failed:false});})
      .catch(()=>{if(!abort.signal.aborted)setRemote({scope,value:null,failed:true});});
    return()=>abort.abort();
  },[spaceId,trackId,scope,retry]);
  useEffect(()=>{
    const [,question,canonicalIds]=JSON.parse(intentKey) as [string,string,string[]];
    if(!trackId||canonicalIds.length<2)return;
    const abort=new AbortController();
    const timer=setTimeout(()=>{
      workspaceFetch('/api/research-workbook?'+new URLSearchParams({spaceId,trackId,selection:'1',intent:'1',canonicalIds:canonicalIds.join(','),focus:question}),{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]),cache:'no-store'})
        .then(async r=>{const data=await r.json() as {spaceId:string;trackId:string;matching:{id:string}|null};if(!r.ok||data.spaceId!==spaceId||data.trackId!==trackId||data.matching&&typeof data.matching.id!=='string')throw Error();return data.matching;})
        .then(match=>{if(!abort.signal.aborted)setIntent({key:intentKey,id:match?.id||null,failed:false});})
        .catch(()=>{if(!abort.signal.aborted)setIntent({key:intentKey,id:null,failed:true});});
    },200);
    return()=>{clearTimeout(timer);abort.abort();};
  },[spaceId,trackId,intentKey,retry]);
  const draft=readComparisonInput(comparisonInputKey(userId,spaceId,trackId),spaceId);
  const overview=remote.scope===scope?remote.value:null;
  const remembered=comparisonLocation(readComparisonLocation(userId,spaceId,trackId),spaceId)?.workbook;
  const continuation=remembered?.id===trackId?[...(overview?.comparisons||[]),...(overview?.savedJudgment?[overview.savedJudgment]:[])].find(item=>item.id===remembered.workbookId)||overview?.comparisons[0]:overview?.comparisons[0];
  return {draft,overview,continuation,failed:remote.scope===scope&&remote.failed,retry:()=>setRetry(n=>n+1),matching:intent.key===intentKey?intent.id:null,intentReady:intent.key===intentKey&&!intent.failed,intentFailed:intent.key===intentKey&&intent.failed};
}
