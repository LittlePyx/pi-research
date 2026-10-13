"use client";
import { useState } from "react";
import type { PreferenceSignal } from "../../lib/preference-memory";
import type {SavedReadFailure} from '../../lib/saved-read';

export function ResearchPreferences({ signals, scopeDescription='', locale, demo, loading, failed, failure, retrying, onRetry, onToggle, onRecords, onPaper }: {
  signals: PreferenceSignal[]; locale: "zh" | "en"; demo: boolean; loading: boolean; failed: boolean; retrying: boolean;
  failure?:SavedReadFailure|null;
  scopeDescription?:string;
  onRetry: () => void; onToggle: (signal: PreferenceSignal, active: boolean) => Promise<boolean>; onRecords: () => void; onPaper: (id: string) => void;
}) {
  const zh = locale === "zh";
  const [disabled, setDisabled] = useState<PreferenceSignal[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const accessible = failure!=='access' && failure!=='missing';
  const showScope = Boolean(scopeDescription.trim())&&!signals.some(signal=>signal.sourceType==='research_space');
  const hasContent = accessible && (signals.length > 0 || disabled.length > 0 || showScope);
  async function toggle(signal: PreferenceSignal, active: boolean) {
    if (pending) return;
    setPending(signal.id); setError("");
    const ok = await onToggle(signal, active);
    if (ok) setDisabled(items => active ? items.filter(item => item.id !== signal.id) : [...items.filter(item => item.id !== signal.id), signal]);
    else setError(zh ? "未能保存，请重试。当前偏向未改变。" : "Could not save. Your preferences are unchanged; try again.");
    setPending(null);
  }
  function impact(signal: PreferenceSignal) {
    if (signal.kind === "method") return zh ? "关注相关方法与适用条件。" : "Future search planning can use these method interests to explore tools and their assumptions.";
    if (signal.kind === "question") return zh ? "围绕这些问题寻找补充证据。" : "Provides open questions for future searches for supporting evidence.";
    if (signal.kind === "behavior_interest") return zh ? "为近期持续关注的方向补充检索线索。" : "Uses sustained attention as a revisable search signal, without overriding explicit feedback.";
    if (signal.kind === "quality") return zh ? "要求更可靠的证据，不排除整个主题。" : "Seek stronger evidence without excluding the topic.";
    if (signal.kind === "depth") return zh ? "寻找更深入的材料，不降低对该方向的兴趣。" : "Seek deeper treatment, without reducing interest in this field.";
    if (signal.kind === "format") return zh ? "调整文献类型，不改变研究范围。" : "Adjust document types without changing research scope.";
    if (signal.kind === "paper") return zh ? "仅记录对这篇材料的判断，不推断主题偏好。" : "A decision about this paper, not a topic preference.";
    if (signal.kind === "exclusion") return zh ? "减少偏离研究范围的检索候选。" : "Provides exclusion context for future discovery.";
    if (signal.kind === "mastery") return zh ? "在已有知识之上寻找进阶材料。" : "Provides known background to help discovery move deeper.";
    return zh ? "为后续检索提供研究范围。" : "Informs future search planning around topics, methods or open questions.";
  }
  return <section className="pi-preference-memory">
    <header><div><h2>{zh ? "你的研究偏向" : "Your research interests"}</h2><p>{zh ? "用于后续发现，随你的研究逐步更新。" : "Guiding future discovery as your research evolves."}</p></div>{demo && <small>{zh ? "示例" : "Example"}</small>}</header>
    {loading && !hasContent && <p role="status">{zh ? "正在读取研究偏向…" : "Loading interests…"}</p>}
    {failed && <div className="pi-preference-load-error" role="alert"><p>{failure==='access'||failure==='missing'?(zh?'当前空间暂不可访问，请核对工作区。':'This workspace cannot be accessed. Check your workspace.'):hasContent ? (zh ? "暂时未能更新研究偏向，先显示上次载入的记录。" : "Could not refresh interests. Your previously loaded records are shown below.") : failure==='timeout'?(zh?'读取研究偏向超时，可以重新载入。':'Loading interests timed out. Retry when ready.'):(zh ? "研究偏向暂时未能读取，已有记录仍会保留。" : "Interests could not load. Your saved records are retained.")}</p><button type="button" disabled={retrying} onClick={onRetry}>{retrying ? (zh ? "正在载入…" : "Loading…") : (zh ? "重新载入" : "Retry loading")}</button></div>}
    {accessible && ((!loading && !failed) || hasContent) && <>
      {!hasContent && <div className="pi-preference-empty"><h3>{zh ? "从一次阅读开始" : "Start with a paper"}</h3><p>{zh ? "阅读、记录问题或反馈相关性，帮助 Pi 理解你的研究。" : "Read, note questions or give relevance feedback to help Pi understand your research."}</p></div>}
      {(["explicit", "inferred"] as const).map(layer => {
        const items = signals.filter(signal => signal.layer === layer && !disabled.some(item=>item.id===signal.id));
        const scopeContext=layer==='explicit'&&showScope;
        return (items.length > 0 || scopeContext) && <section className="pi-preference-group" key={layer}>
          <h3>{layer === "explicit" ? (zh ? "你明确表达的" : "From you") : (zh ? "从行为中发现" : "From your activity")}</h3>
          <div className="pi-preference-list">{scopeContext&&<article className="pi-preference-item"><h4>{scopeDescription}</h4><p className="pi-preference-effect">{zh?'来自当前空间的研究方向，用于后续检索范围。':'The research direction saved for this workspace guides search scope.'}</p></article>}{items.map(signal => <article className="pi-preference-item" key={signal.id}>
            <h4>{zh ? signal.labelZh : signal.labelEn}</h4>
            <p className="pi-preference-effect">{impact(signal)}</p>
            <details className="pi-preference-evidence"><summary>{zh ? "查看依据" : "View evidence"}<span aria-hidden="true">＋</span></summary>
              <div><p>{signal.evidence || (zh ? "暂无可展示的详细依据。" : "No detailed evidence available.")}</p>{signal.sourcePaperId && <button onClick={() => onPaper(signal.sourcePaperId!)}>{zh ? "查看来源论文与记录" : "Open source paper & record"} →</button>}{layer === "inferred" && <button disabled={pending !== null} onClick={() => void toggle(signal, false)}>{pending === signal.id ? (zh ? "保存中…" : "Saving…") : (zh ? "不符合我的偏向" : "Not my interest")}</button>}</div>
            </details>
          </article>)}</div>
        </section>;
      })}
      {disabled.map(signal => <div className="pi-preference-disabled" role="status" key={signal.id}><span>{zh ? "已停用：" : "Disabled: "}{zh ? signal.labelZh : signal.labelEn}</span><button disabled={pending !== null} onClick={() => void toggle(signal, true)}>{zh ? "撤销停用" : "Undo"}</button></div>)}
    </>}
    {error && <p role="alert">{error}</p>}
    <footer><span>{zh ? "明确反馈优先，推断可随时停用。" : "Your feedback comes first. Inferences are reversible."}</span><button onClick={onRecords}>{zh ? "查看研究记录" : "Research records"} →</button></footer>
  </section>;
}
