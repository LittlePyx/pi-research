"use client";
import {useState} from "react";
import {feedbackChannel} from "../../../lib/feedback-policy.mjs";
import evidence from "../../../public/agent-evidence.json";
import evaluation from "../../../public/agent-evaluation.json";
import "./process.css";
import PilotResults from './pilot-results';

const choices=[
 {code:"method_fit",label:"方法值得借鉴",record:"方法兴趣",effect:"在后续检索中关注相关工具与适用条件。",boundary:"这是一条明确兴趣；仍需独立检查新材料的相关性与证据。"},
 {code:"weak_evidence",label:"证据不够可靠",record:"证据要求",effect:"后续材料选择需要更可靠的依据，保持当前研究主题。",boundary:"对一篇材料的质量判断，不代表你对整个方向失去兴趣。"},
 {code:"duplicate_known",label:"我已经掌握",record:"已有知识",effect:"减少重复的入门内容，寻找更深入或更新的材料。",boundary:"掌握一篇材料不等于完成整个方向，也不代表它不相关。"},
 {code:"later",label:"稍后再读",record:"阅读安排",effect:"调整阅读时机，不据此新增研究偏向。",boundary:"暂时没时间阅读，不能解释为不感兴趣。"},
];
export default function AgentProcess({initialSpace="demo-mathematics",initialView="journey"}:{initialSpace?:string;initialView?:string}) {
 const [space,setSpace]=useState(initialSpace);
 const [tab,setTab]=useState(initialView);
 const [choice,setChoice]=useState("method_fit");
 const math=space==="demo-mathematics";
 const selected=choices.find(c=>c.code===choice)!;
 const channel=choice==="later"?"schedule":feedbackChannel(choice);
 const demo="/demo#today?space="+space;
 const paper=math?"kls-localization":"shannon-fidelity";
 const next=math?"eldan-thin-shell":"lossy-finite";
 const rows=evaluation.memoryAblation.filter(r=>r.caseId===(math?"mathematics":"information"));
 return <main className="pi-process-page">
  <header className="pi-process-top"><a href={demo}>← 返回演示空间</a><span>Pi Research</span></header>
  <div className="pi-process-heading"><p>研究过程</p><h1>一次阅读，如何影响下一次发现</h1><p>查看记录、决策依据与结果。</p></div>
  <nav className="pi-process-tabs" aria-label="研究过程视图">
   {[["journey","体验一个例子"],["pilot","推荐对比"],["history","恢复记录"],["evaluation","验证与边界"]].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
  </nav>
  {tab==="pilot" && <PilotResults/>}
  {tab==="journey" && <section aria-label="预设研究过程">
   <div className="pi-process-section-head"><h2>从问题出发</h2><select aria-label="示例领域" value={space} onChange={e=>setSpace(e.target.value)}><option value="demo-mathematics">应用数学</option><option value="demo-information">信息论</option></select></div>
   <p className="pi-process-goal">{math?"比较 KLS 框架与随机局部化：它们使用的条件与工具有什么不同？":"从平均失真走向有限码长：两种失真约束应该如何区分？"}</p>
   <ol className="pi-process-steps">
    <li><span>01</span><div><h3>阅读留下了线索</h3><p>{math?"预设笔记把 Eldan 的归一化条件列为下一步。":"预设笔记提出：下一步区分平均失真限制与超额失真概率。"}</p><a href={"/demo#paper-detail/"+paper+"?space="+space+"&from=memory"}>查看示例原笔记 →</a></div></li>
    <li><span>02</span><div><h3>相似的动作，表达不同的需求</h3><p>选择一种反馈，看看它应该影响什么。</p><div className="pi-process-choices">{choices.map(c=><button key={c.code} aria-pressed={choice===c.code} onClick={()=>setChoice(c.code)}>{c.label}</button>)}</div><div className="pi-process-decision" aria-live="polite" data-channel={channel}><strong>{selected.record}</strong><p>{selected.effect}</p><small>{selected.boundary}</small></div></div></li>
    <li><span>03</span><div><h3>带着需求继续寻找</h3><p>{choice==="method_fit"?(math?"方法兴趣可以引导继续检索随机局部化及其适用条件；Eldan 是这里预先选定的后续阅读例子。":"方法兴趣可以引导继续检索有限码长与失真概率约束；有损压缩工作是这里预先选定的后续阅读例子。"):selected.effect}</p><a href={"/demo#paper-detail/"+next+"?space="+space+"&from=today"}>查看固定的后续阅读示例 →</a></div></li>
    <li><span>04</span><div><h3>证据决定能否推荐</h3><p>新材料仍需通过相关性、摘要证据与质量检查。反馈不会让未通过核验的材料自动成为正式推荐。</p></div></li>
   </ol>
   <p className="pi-process-note">本页为预设过程，切换选项仅解释信号用途，不保存反馈、不执行检索或改变推荐。</p>
  </section>}
  {tab==="history" && <section aria-label="历史运行回放">
   <div className="pi-process-section-head"><h2>一次中断后的恢复</h2><small>{evidence.observedDate} · 脱敏历史片段</small></div>
   <p className="pi-process-goal">保留已经完成的判断，让失败的部分继续处理。</p>
   <ol className="pi-process-steps">
    <li><span>01</span><div><h3>发现身份匹配错误</h3><p>一条 DOI 含有合法尖括号，被旧文本清理逻辑误当作 HTML 删除，导致模型返回的论文身份无法正确匹配。</p><p>修复把论文标识与正文清理分开；缺失或有歧义的结果留待处理，不猜测对应关系。</p><a href="https://github.com/LittlePyx/pi-research/blob/main/tests/screening-identity.test.mjs" target="_blank" rel="noreferrer">查看可复现检查 ↗</a></div></li>
    <li><span>02</span><div><h3>从断点继续</h3><p>历史记录中，修复后的这批 {evidence.screening.batchSize} 篇全部匹配，筛选进度达到 {evidence.screening.completed}/{evidence.screening.total}；此前已完成的结果保留。</p><p>{evidence.screening.queuedForDeepReview} 篇进入摘要补全与深评准备。这个时间点的正式推荐是 {evidence.screening.formalRecommendationsAtSnapshot} 篇，排队并不等于推荐。</p></div></li>
    <li><span>03</span><div><h3>等待核验，不把失败变成结果</h3><p>后续核对记录曾出现输出被截断。保留草稿并继续核对，不能将不完整响应作为核验成功。</p><p>其中一份草稿在修订时删除了摘要没有支持的说法，随后通过核验。</p></div></li>
    <li><span>04</span><div><h3>保留有依据的结果</h3><div className="pi-process-outcomes"><div><strong>{evidence.verification.published}</strong><span>正式入选</span></div><div><strong>{evidence.verification.withheld}</strong><span>未通过最终证据门槛</span></div><div><strong>{evidence.verification.pending}</strong><span>这组仍待核对</span></div></div><p>这里跟踪的是 {evidence.verification.subsetSize} 份待核对稿，跨越多个恢复任务；不是前述全部 8 篇的最终统计。</p></div></li>
   </ol>
   <footer className="pi-process-note">这是历史运行片段，未包含最初检索的完整轨迹，也不代表当前版本的推荐准确率。<a href="/agent-evidence.json" download>下载脱敏记录</a></footer>
  </section>}
  {tab==="evaluation" && <section aria-label="验证结果">
   <h2>哪些已经验证，哪些仍需要证据</h2>
   <p>同一组输入，分别不使用记忆、只使用明确反馈、加入行为推断。以下验证的是正式策略的输入分流，不是论文推荐准确率。</p>
   <div className="pi-process-section-head"><h3>记忆输入对照</h3><select aria-label="评估领域" value={space} onChange={e=>setSpace(e.target.value)}><option value="demo-mathematics">应用数学</option><option value="demo-information">信息论</option></select></div>
   <div className="pi-process-table"><table><thead><tr><th>对照方式</th><th>应保留</th><th>正确分流</th><th>错误纳入</th></tr></thead><tbody>{rows.map(r=><tr key={r.mode}><th>{r.mode==="none"?"不使用记忆":r.mode==="explicit"?"仅明确反馈":"明确反馈与推断"}</th><td>{r.expectedSignals}</td><td>{r.correctlyRouted}</td><td>{r.unwantedSignals}</td></tr>)}</tbody></table></div>
   <p>每个领域包含质量、深度、掌握、范围、文献类型、单篇判断，以及停用、过期和不可靠推断场景。案例由开发者编写，用于检查策略边界。</p>
   <div className="pi-process-evaluation"><h3>推荐质量：尚未测量</h3><p>固定候选实验已取得 7 次有效排序、1 次校验失败，另有 4 次未运行；独立相关性标注尚未进行。<button onClick={()=>setTab('pilot')}>查看真实对比记录 →</button></p><p>现有题名校准基准使用已知标签参与排序，只能作回归检查，不能用来证明个性化推荐提升。</p></div>
   <div className="pi-process-evaluation"><h3>核验能力：有成功案例，缺少总体误差评估</h3><p>引用存在、字段完整与身份匹配可以确定性检查；科学含义是否受到摘要支持仍依赖模型判断。相同模型的第二次判断不等于独立正确性证明。</p></div>
   <footer className="pi-process-note"><a href="/agent-evaluation.json" download>下载本次评估结果</a><a href="https://github.com/LittlePyx/pi-research/blob/main/AGENT_EVALUATION.md" target="_blank" rel="noreferrer">复现方法与结果格式 ↗</a></footer>
  </section>}
 </main>;
}
