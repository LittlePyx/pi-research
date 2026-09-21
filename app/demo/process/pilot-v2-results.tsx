'use client';
import {useState} from 'react';
import report from '../../../public/agent-personalization-v2.json';
import PilotResults from './pilot-results';
const labels:Record<string,string>={none:'无记忆',explicit:'仅明确反馈',all:'全部研究记忆'};
export default function PilotReportBrowser(){
 const [version,setVersion]=useState('v2');
 const [scenario,setScenario]=useState(report.cases[0].id);
 const [variant,setVariant]=useState('explicit');
 const rows=report.runs.filter(r=>r.scenarioId===scenario&&r.variant===variant);
 return <>
  <div className="pi-pilot-controls"><label>运行记录<select value={version} onChange={e=>setVersion(e.target.value)}><option value="v2">第二版 · 编号引用与已读参考</option><option value="v1">第一版 · 原始对比记录</option></select></label></div>
  {version==='v1'?<PilotResults/>:<section aria-label="第二版真实验证">
   <h2>推荐阅读与已读参考，分开呈现</h2>
   <p>已执行 {report.attemptedRuns} / {report.plannedRuns} 次，{report.completedRuns} 次通过，{report.failedRuns} 次失败。模型选择摘要编号，系统回填对应原文。</p>
   <p>本轮 3 次失败均超出阅读分区的数量限制，未重试替换。4 组有效重复对比中，2 组新阅读顺序相同，2 组有变化；另 2 组缺少有效配对。</p>
   <p className="pi-process-note">两个新编写问题，各重复两次。仍使用第一版公开语料；尚未独立评审，不据此宣称推荐质量提升。</p>
   <div className="pi-pilot-controls"><label>研究问题<select value={scenario} onChange={e=>setScenario(e.target.value)}>{report.cases.map(c=><option key={c.id} value={c.id}>{c.goal}</option>)}</select></label><label>记忆条件<select value={variant} onChange={e=>setVariant(e.target.value)}>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
   <div className="pi-pilot-repeat-grid">{rows.map(row=><article key={row.caseId}>
    <header><h3>第 {row.repetition} 次</h3><small>{row.status==='completed'?'通过输出校验':row.status==='failed'?'校验失败':'未运行'}{row.durationMs!==null?` · ${(row.durationMs/1000).toFixed(2)} 秒`:''}</small></header>
    {row.status==='completed'?<><h4>推荐阅读</h4>{row.recommendations.length?<ol>{row.recommendations.map(p=><li key={p.id}><a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.title} ↗</a><p>{p.reason}</p><details><summary>摘要依据</summary><blockquote>{p.quote}</blockquote></details></li>)}</ol>:<p>本次未选出新的阅读材料。</p>}
     <section className="pi-pilot-read-reference"><h4>已读参考</h4>{row.references.length?<ul>{row.references.map(p=><li key={p.id}><a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.title} ↗</a><p>{p.reason}</p><details><summary>摘要依据</summary><blockquote>{p.quote}</blockquote></details></li>)}</ul>:<p>{variant==='none'?'此条件未提供已读记忆，无法识别已读参考。':'本次未选入已读参考。'}</p>}</section>
    </>:row.status==='failed'?<p>本次超出新阅读最多 5 篇或已读参考最多 3 篇的限制，未接纳为有效排序，失败记录保留。</p>:<p>暂无运行记录。</p>}
    <footer>{row.inputTokens??'—'} 输入 / {row.outputTokens??'—'} 输出 token{row.status==='completed'&&<p>预设已掌握论文在新阅读中占 {row.knownNextCount} 篇</p>}</footer>
   </article>)}</div>
   <div className="pi-process-evaluation"><h3>同一输入，两次结果是否一致</h3><div className="pi-process-table"><table><thead><tr><th>记忆条件</th><th>新阅读顺序</th><th>共同入选 / 两次合集</th></tr></thead><tbody>{report.stability.filter(s=>s.scenarioId===scenario).map(s=><tr key={s.variant}><th>{labels[s.variant]}</th><td>{!s.available?'缺少有效配对':s.sameOrder?'完全相同':'有变化'}</td><td>{s.available?`${s.overlap} / ${s.union}`:'—'}</td></tr>)}</tbody></table></div></div>
   <footer className="pi-process-note"><p>已读分区由明确记忆和程序规则决定。本轮有效的记忆组未选择已读论文，因此尚无真实参考分流样本；分流逻辑另有回归验证。引用可追溯不代表解释正确，两次一致也不足以证明长期稳定。</p><a href="/agent-personalization-v2.json" download>下载第二版记录与来源</a></footer>
  </section>}
 </>;
}
