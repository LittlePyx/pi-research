'use client';
import {useRef,useState} from 'react';
import './pilot.css';

type Case={id:string;goal:string;order:string[]};
type RecordRow={caseId:string;variant:string;sourceCommit:string;experimentHash:string;status:string;inputTokens:number|null;outputTokens:number|null;durationMs:number|null;errorCode?:string;recommendations?:{id:string;reason:string;quote:string}[]};
const labels:Record<string,string>={none:'无记忆',explicit:'仅明确反馈',all:'全部研究记忆'};
export default function PilotConsole({cases,experimentHash,enabled}:{cases:Case[];experimentHash:string;enabled:boolean}) {
 const token=useRef('');
 const inFlight=useRef(false);
 const [fingerprint,setFingerprint]=useState('');
 const [commit,setCommit]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('准备本次会话，再由管理员启用这组固定实验。');
 const [records,setRecords]=useState<RecordRow[]>([]);
 async function prepare() {
  if(!enabled||inFlight.current||token.current)return;
  // The private capability stays in this tab's memory: no URL, storage or DOM.
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  token.current=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token.current));
  setFingerprint(Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''));
  setMessage('会话已准备。将下方公开指纹交给管理员启用；请保留本标签页。');
 }
 async function run() {
  if(!enabled||inFlight.current)return;
  if(!token.current||!/^[a-f0-9]{40}$/.test(commit)){setMessage('请先准备会话并填写已发布的实验源码版本。');return;}
  inFlight.current=true;setBusy(true);
  const collected:RecordRow[]=[];
  try {
   const preflight=await fetch('/api/personalization-pilot',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15_000)});
   if(preflight.status!==401||!(preflight.headers.get('content-type')||'').includes('application/json'))throw new Error(preflight.status===410?'实验入口尚未启用或已经关闭。':'实验入口不可用（HTTP '+preflight.status+'），未发送执行凭据。');
   const check=await preflight.json();if(check.error!=='unauthorized')throw new Error('实验预检响应不符合预期。');
   for(const task of cases)for(const variant of task.order) {
    setMessage('正在运行 '+task.goal+' · '+labels[variant]+'（'+(collected.length+1)+'/12）');
    const response=await fetch('/api/personalization-pilot',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token.current},body:JSON.stringify({caseId:task.id,variant,sourceCommit:commit}),signal:AbortSignal.timeout(75_000)});
    if(!response.ok||!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('执行中断（HTTP '+response.status+'）。已保存结果保留，不自动重试。');
    const data=await response.json(),row:RecordRow=data.record;
    if(!row||row.caseId!==task.id||row.variant!==variant||row.sourceCommit!==commit||row.experimentHash!==experimentHash)throw new Error('结果身份不一致，已停止。');
    collected.push(row);setRecords([...collected]);
    if(row.status!=='completed')throw new Error('模型未完成有效排序：'+(row.errorCode||'unknown')+'。已记录失败，不自动重试。');
   }
   setMessage('12 次真实排序已保存。尚需独立相关性评审，不能据此声称推荐质量提升。');
  } catch(error) {setMessage(error instanceof Error?error.message:'执行失败，请核查服务端记录。');}
  finally {inFlight.current=false;setBusy(false);}
 }
 function download() {
  const url=URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='personalization-runs.json';a.click();URL.revokeObjectURL(url);
 }
 return <main className="pi-pilot">
  <header><a href="/demo/process">← 研究过程</a><span>Pi Research</span></header>
  <h1>推荐对比实验</h1><p>4 个编写的研究问题，同一候选集，三种记忆条件。这里只比较摘要排序，不运行正式扫描。</p>
  {!enabled?<section><h2>本轮执行已结束</h2><p>临时执行入口已关闭。已保存的成功与失败记录均保留。</p><a href="/demo/process?view=pilot">查看真实对比记录 →</a></section>:<section aria-label="执行设置"><h2>本次执行</h2>
   <button disabled={!!fingerprint||busy} onClick={prepare}>准备执行会话</button>
   {fingerprint&&<div className="pi-pilot-fingerprint"><span>公开会话指纹</span><code>{fingerprint}</code><small>执行凭据只保留在本标签页内存，刷新后失效。</small></div>}
   <label>实验源码版本<input value={commit} onChange={e=>setCommit(e.target.value.trim())} disabled={busy} autoComplete="off" spellCheck={false} placeholder="已发布的完整版本标识"/></label>
   <button className="pi-pilot-primary" onClick={run} disabled={!fingerprint||busy}>{busy?'正在执行…':'运行固定对比'}</button>
   <p role="status" aria-live="polite">{message}</p>
  </section>}
  {enabled&&<section aria-label="运行结果"><div className="pi-pilot-heading"><h2>运行记录</h2>{records.length>0&&<button onClick={download}>下载原始记录</button>}</div>
   {cases.map(task=><article key={task.id}><h3>{task.goal}</h3>{task.order.map(variant=>{const row=records.find(r=>r.caseId===task.id&&r.variant===variant);return <div className="pi-pilot-row" key={variant}><strong>{labels[variant]}</strong><span>{row?(row.status==='completed'?'已完成':'失败'):'尚未运行'}</span>{row&&<small>{row.inputTokens??'—'} 输入 / {row.outputTokens??'—'} 输出 token · {row.durationMs===null?'—':(row.durationMs/1000).toFixed(1)} 秒</small>}{row?.recommendations&&<details><summary>查看排序与摘要依据</summary><ol>{row.recommendations.map(p=><li key={p.id}><a href={'https://arxiv.org/abs/'+p.id.replace(/^arxiv:/,'')} target="_blank" rel="noreferrer">{p.id}</a><p>{p.reason}</p><blockquote>{p.quote}</blockquote></li>)}</ol></details>}</div>;})}</article>)}
  </section>}<footer>仅使用预先冻结的公开摘要与编写的研究偏好；不读取个人研究记录，不修改论文库。模型返回的理由不等同于排序变化的因果解释。</footer>
 </main>;
}
