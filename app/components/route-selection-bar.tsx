import {useEffect,useState} from 'react';
import { workspaceFetch as fetch } from '../../lib/workspace-request';
import {comparisonEligibilityText,type ComparisonMaterial} from '../../lib/comparison-eligibility';
import type {RouteSelection} from './use-route-selection';

export function RouteSelectionBar({spaceId,trackId,locale,selection,onCompare,onMaterials,requireQuestion=false}:{spaceId:string;trackId:string;locale:'zh'|'en';selection:RouteSelection;onCompare:()=>void;onMaterials:()=>void;requireQuestion?:boolean}) {
  const zh=locale==='zh';
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
  if(!selection.value.papers.length)return null;
  const loaded=remote.key===key&&!remote.failed;
  const ready=loaded&&(!requireQuestion||Boolean(selection.value.question.trim()))&&selection.value.papers.length>=2&&selection.value.papers.every(p=>remote.materials.some(m=>m.canonicalId.toLowerCase()===p.canonicalId.toLowerCase()&&m.eligibility==='eligible'));
  return <aside className="pi-route-selection-bar" aria-label={zh?'已选比较论文':'Selected comparison papers'}>
    <div className="pi-selection-heading"><strong>{zh?'已选论文':'Selected papers'} · {selection.value.papers.length}/3</strong><span role="status">{selection.storageError?(zh?'暂存失败，请保留当前页面':'Draft storage unavailable; keep this page open'):remote.key===key&&remote.failed?(zh?'可用状态未载入，请重试':'Eligibility unavailable; retry'):!loaded?(zh?'正在核对可用状态…':'Checking eligibility…'):requireQuestion&&!selection.value.question.trim()?(zh?'请填写本次比较问题':'Enter a comparison question'):ready?(zh?'已核验，可进入比较':'Verified and ready to compare'):loaded&&remote.materials.some(m=>m.eligibility!=='eligible')?(zh?'请移除或补全不可用材料':'Remove or complete unavailable sources'):selection.value.papers.length<2?(zh?'再选一篇可用论文':'Select one more eligible paper'):(zh?'部分材料暂不可比较':'Some sources are not eligible')}</span></div>
    <ul>{selection.value.papers.map(p=>{const material=loaded?remote.materials.find(m=>m.canonicalId.toLowerCase()===p.canonicalId.toLowerCase()):undefined;return <li key={p.canonicalId}><span title={p.title}>{p.title}</span><small>{comparisonEligibilityText(material?.eligibility,zh)}</small><button type="button" aria-label={`${zh?'移除':'Remove'} ${p.title}`} onClick={()=>selection.toggle(p)}>×</button></li>;})}</ul>
    <div className="pi-selection-actions"><button type="button" onClick={onMaterials}>{zh?'继续选材':'Choose more'}</button>{remote.key===key&&remote.failed&&<button type="button" onClick={()=>setRetry(n=>n+1)}>{zh?'重试核对':'Retry check'}</button>}<button type="button" className="pi-selection-compare" disabled={!ready} onClick={onCompare}>{zh?'比较已选论文':'Compare selected papers'} →</button></div>
  </aside>;
}
