import {useEffect,useState} from 'react';
import { workspaceFetch as fetch } from '../../lib/workspace-request';
import {comparisonEligibilityText,type ComparisonMaterial} from '../../lib/comparison-eligibility';
import type {GraphTaskContext} from '../../lib/graph-task';
import type {RouteSelection} from './use-route-selection';
import {useComparisonTask} from './use-comparison-task';
import {workbookStatusLabel} from '../../lib/workbook-presentation';

export function RouteSelectionBar({userId,spaceId,trackId,locale,selection,onCompare,onMaterials,onResume,onResumeDraft,requireQuestion=false}:{userId:string;spaceId:string;trackId:string;locale:'zh'|'en';selection:RouteSelection;onCompare:()=>void;onMaterials:()=>void;onResume?:(id:string)=>void;onResumeDraft?:(draft:GraphTaskContext)=>void;requireQuestion?:boolean}) {
  const zh=locale==='zh';
  const task=useComparisonTask(userId,spaceId,trackId,selection.value);
  const latest=task.continuation;
  const routeTitle=(zh?task.overview?.titleZh:task.overview?.titleEn)||(zh?'当前研究路线':'Current research route');
  const key=JSON.stringify([spaceId,trackId,selection.value.papers.map(p=>p.canonicalId.toLowerCase())]);
  const [remote,setRemote]=useState<{key:string;materials:ComparisonMaterial[];failed:boolean}>({key:'',materials:[],failed:false});
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!selection.value.papers.length)return;
    const abort=new AbortController();
    fetch('/api/research-workbook?'+new URLSearchParams({spaceId,trackId,eligibility:'1',canonicalIds:selection.value.papers.map(p=>p.canonicalId).join(',')}),{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]),cache:'no-store'})
      .then(async r=>{const data=await r.json() as {spaceId:string;trackId:string;materials:ComparisonMaterial[]};if(!r.ok||data.spaceId!==spaceId||data.trackId!==trackId||!Array.isArray(data.materials))throw Error();return data.materials;})
      .then(materials=>{if(!abort.signal.aborted)setRemote({key,materials,failed:false});})
      .catch(()=>{if(!abort.signal.aborted)setRemote({key,materials:[],failed:true});});
    return()=>abort.abort();
  },[key,retry]);
  if(!selection.value.papers.length&&!latest&&!task.draft)return null;
  const loaded=remote.key===key&&!remote.failed;
  const ready=loaded&&task.intentReady&&(!requireQuestion||Boolean(selection.value.question.trim()))&&selection.value.papers.length>=2&&selection.value.papers.every(p=>remote.materials.some(m=>m.canonicalId.toLowerCase()===p.canonicalId.toLowerCase()&&m.eligibility==='eligible'));
  return <aside className="pi-route-selection-bar" aria-label={zh?'已选比较论文':'Selected comparison papers'}>
    <div className="pi-selection-context"><strong>{routeTitle}</strong><span>{selection.storageError?(zh?'草稿暂存失败，请保留本页':'Draft storage failed; keep this page open'):zh?'选材草稿 · 暂存在本标签页':'Selection draft · stored in this tab'}</span><p title={selection.value.question}>{selection.value.question||(zh?'尚未填写比较问题':'No comparison question yet')}</p></div>
    <div className="pi-selection-heading"><strong>{zh?'已选论文':'Selected papers'} · {selection.value.papers.length}/3</strong><span role="status">{selection.storageError?(zh?'暂存失败，请保留当前页面':'Draft storage unavailable; keep this page open'):remote.key===key&&remote.failed?(zh?'可用状态未载入，请重试':'Eligibility unavailable; retry'):!selection.value.papers.length?(zh?'未选择新比较材料':'No sources selected for a new comparison'):!loaded?(zh?'正在核对可用状态…':'Checking eligibility…'):requireQuestion&&!selection.value.question.trim()?(zh?'请填写本次比较问题':'Enter a comparison question'):task.intentFailed?(zh?'继续入口未确认，请重试':'Could not confirm the continuation; retry'):selection.value.papers.length>=2&&!task.intentReady?(zh?'正在确认继续入口…':'Checking comparison continuation…'):ready?(zh?'已核验，可进入比较':'Verified and ready to compare'):loaded&&remote.materials.some(m=>m.eligibility!=='eligible')?(zh?'请移除或补全不可用材料':'Remove or complete unavailable sources'):selection.value.papers.length<2?(zh?'再选一篇可用论文':'Select one more eligible paper'):(zh?'部分材料暂不可比较':'Some sources are not eligible')}</span></div>
    <ul>{selection.value.papers.map(p=>{const material=loaded?remote.materials.find(m=>m.canonicalId.toLowerCase()===p.canonicalId.toLowerCase()):undefined;return <li key={p.canonicalId}><span title={p.title}>{p.title}</span><small>{comparisonEligibilityText(material?.eligibility,zh)}</small><button type="button" aria-label={`${zh?'移除':'Remove'} ${p.title}`} onClick={()=>selection.toggle(p)}>×</button></li>;})}</ul>
    {task.draft&&onResumeDraft&&<div className="pi-selection-record"><small>{zh?'本地比较草稿':'Local comparison draft'}</small><p title={task.draft.question}>{task.draft.question}</p><button type="button" onClick={()=>onResumeDraft(task.draft!)}>{zh?'继续本地比较草稿':'Resume local comparison draft'} →</button></div>}
    {latest&&onResume&&<div className="pi-selection-record"><small>{zh?'已有比较':'Existing comparison'} · {latest.savedRevision?(zh?'已保存判断':'Judgment saved'):workbookStatusLabel(latest.status,zh)}</small><p title={latest.question}>{latest.question}</p><button type="button" onClick={()=>onResume(latest.id)}>{zh?'继续已有比较':'Resume existing comparison'} →</button></div>}
    <div className="pi-selection-actions"><button type="button" onClick={onMaterials}>{zh?'继续选材':'Choose more'}</button>{remote.key===key&&remote.failed&&<button type="button" onClick={()=>setRetry(n=>n+1)}>{zh?'重试核对':'Retry check'}</button>}<button type="button" className="pi-selection-compare" disabled={!ready} onClick={()=>task.matching&&onResume?onResume(task.matching):onCompare()}>{task.matching?(zh?'继续这次比较':'Resume this comparison'):(zh?'开始新比较':'Start new comparison')} →</button></div>
    {(task.failed||task.intentFailed)&&<small className="pi-selection-task-error">{zh?'已有比较暂未载入，选材草稿保留。':'Existing comparisons could not load; your selection draft is preserved.'}<button type="button" onClick={task.retry}>{zh?'重试加载':'Retry'}</button></small>}
  </aside>;
}
