import report from '../../../public/agent-personalization.json';
const labels:Record<string,string>={none:'无记忆',explicit:'仅明确反馈',all:'全部研究记忆'};
export default function PilotResults() {
 return <section aria-label="真实推荐对比">
  <div className="pi-process-section-head"><h2>同一候选集，三种记忆条件</h2><small>2026-09-21 · DeepSeek Flash</small></div>
  <p>已执行 {report.attemptedRuns} / {report.plannedRuns} 次：{report.completedRuns} 次通过输出校验，{report.failedRuns} 次未通过，余下 {report.plannedRuns-report.attemptedRuns} 次未运行。</p>
  <p className="pi-process-note">这是真实模型调用，使用编写的研究偏好与固定公开摘要。暂未进行独立相关性评审，不代表正式产品推荐准确率。</p>
  <div className="pi-process-evaluation"><h3>这次能看到什么</h3><p>两组完整数学对比中，明确反馈组均未再选入预设已掌握论文。随机局部化采样这一组，全部记忆与仅明确反馈的五篇排序完全相同。</p><p>这是本次单轮结果，不据此推断长期收益，也不将模型写出的理由当作因果解释。</p></div>
  {report.cases.map(task=><article className="pi-pilot-result-case" key={task.id}>
   <h3>{task.goal}</h3>
   <div className="pi-process-table"><table><thead><tr><th>记忆条件</th><th>状态</th><th>已掌握 / 入选</th><th>耗时</th><th>输入 / 输出 token</th></tr></thead><tbody>{task.rows.map(row=><tr key={row.variant}><th>{labels[row.variant]}</th><td>{row.status==='completed'?'通过校验':row.status==='failed'?'校验未通过':'未运行'}</td><td>{row.status==='completed'?`${row.knownCount} / ${row.returned}`:'—'}</td><td>{row.durationMs===null?'—':`${(row.durationMs/1000).toFixed(2)} 秒`}</td><td>{row.inputTokens===null?'—':`${row.inputTokens} / ${row.outputTokens}`}</td></tr>)}</tbody></table></div>
   {task.rows.map(row=>row.status==='completed'?<details className="pi-pilot-result-detail" key={row.variant}><summary>{labels[row.variant]} · 查看论文排序与依据</summary><ol>{row.recommendations.map(p=><li key={p.id}><a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.title} ↗</a><p>{p.reason}</p><blockquote>{p.quote}</blockquote></li>)}</ol></details>:row.status==='failed'?<p key={row.variant} className="pi-process-note">无记忆组返回了模型响应，但未通过身份、去重、字段或摘要原句的联合校验，未接纳为有效排序；原记录未细分具体失败项。随后停止，未用重试替换失败样本。</p>:null)}
  </article>)}
  <footer className="pi-process-note"><p>“已掌握”来自编写的研究者设定；重复减少不等于相关性提高。通过原句校验只证明引用存在，不证明模型解释在科学上成立。</p><a href="/agent-personalization.json" download>下载运行记录与来源</a></footer>
 </section>;
}
