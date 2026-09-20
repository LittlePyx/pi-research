"use client";
import { useState } from "react";
import type { PreferenceSignal } from "../../lib/preference-memory";

export function ResearchPreferences({ signals, locale, demo, loading, failed, onToggle, onRecords }: {
  signals: PreferenceSignal[]; locale: "zh" | "en"; demo: boolean; loading: boolean; failed: boolean;
  onToggle: (signal: PreferenceSignal, active: boolean) => Promise<boolean>; onRecords: () => void;
}) {
  const zh = locale === "zh";
  const [disabled, setDisabled] = useState<PreferenceSignal[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function toggle(signal: PreferenceSignal, active: boolean) {
    if (pending) return;
    setPending(signal.id); setError("");
    const ok = await onToggle(signal, active);
    if (ok) setDisabled(items => active ? items.filter(item => item.id !== signal.id) : [...items.filter(item => item.id !== signal.id), signal]);
    else setError(zh ? "未能保存，请重试。当前偏向未改变。" : "Could not save. Your preferences are unchanged; try again.");
    setPending(null);
  }
  function impact(signal: PreferenceSignal) {
    if (signal.kind === "method") return zh ? "后续检索会参考这些方法兴趣，寻找相关工具及其适用条件。" : "Future search planning can use these method interests to explore tools and their assumptions.";
    if (signal.kind === "question") return zh ? "为后续检索提供待核对问题，寻找能够补充依据的材料。" : "Provides open questions for future searches for supporting evidence.";
    if (signal.kind === "behavior_interest") return zh ? "将近期持续关注作为检索线索；它是可调整的推断，不覆盖明确反馈。" : "Uses sustained attention as a revisable search signal, without overriding explicit feedback.";
    if (signal.kind === "exclusion") return zh ? "为后续检索提供排除线索，减少偏离范围的候选。" : "Provides exclusion context for future discovery.";
    if (signal.kind === "mastery") return zh ? "为后续检索提供已掌握的背景，寻找可继续深入的材料。" : "Provides known background to help discovery move deeper.";
    return zh ? "作为后续检索规划的参考，帮助细化主题、方法或待解决问题。" : "Informs future search planning around topics, methods or open questions.";
  }
  return <section className="pi-preference-memory">
    <header><h2>{zh ? "Pi 如何理解你的研究偏向" : "How Pi understands your interests"}</h2><p>{demo ? (zh ? "示例偏向 · 来自预设研究记录，可体验停用与撤销。" : "Example interests from preset records. Try disabling and undoing.") : (zh ? "明确反馈优先；行为推断可以随时停用。" : "Explicit feedback takes priority; inferred interests can be disabled.")}</p></header>
    {loading ? <p role="status">{zh ? "正在读取研究偏向…" : "Loading interests…"}</p> : failed ? <p role="alert">{zh ? "研究偏向暂未载入，请重新进入此页重试。" : "Interests could not load. Reopen this page to retry."}</p> : <>
      {!signals.length && !disabled.length && <div className="pi-preference-empty"><h3>{zh ? "还没有足够依据" : "Not enough evidence yet"}</h3><p>{zh ? "阅读、记录问题，或对论文选择“相关 / 不相关”并说明原因。Pi 会结合这些证据逐步理解你的偏向。" : "Read, record questions, or give relevance feedback with a reason to help Pi understand your interests."}</p></div>}
      {signals.map(signal => <article className="pi-preference-item" key={signal.id}>
        <div className="pi-preference-title"><div><small>{signal.layer === "explicit" ? (zh ? "你明确表达的" : "Explicit preference") : (zh ? "Pi 推断的 · 待你校准" : "Pi inference · open to correction")}</small><h3>{zh ? signal.labelZh : signal.labelEn}</h3></div>{signal.layer === "inferred" && <button disabled={pending !== null} onClick={() => void toggle(signal, false)}>{pending === signal.id ? (zh ? "保存中…" : "Saving…") : (zh ? "不符合我的偏向" : "Not my interest")}</button>}</div>
        <div className="pi-preference-context"><div><h4>{zh ? "行为依据" : "Evidence"}</h4><p>{signal.evidence || (zh ? "暂无可展示的详细依据。" : "No detailed evidence available.")}</p></div><div><h4>{zh ? "推荐影响" : "Discovery influence"}</h4><p>{impact(signal)}</p></div></div>
      </article>)}
      {disabled.map(signal => <div className="pi-preference-disabled" key={signal.id}><span>{zh ? "已停用：" : "Disabled: "}{zh ? signal.labelZh : signal.labelEn}</span><button disabled={pending !== null} onClick={() => void toggle(signal, true)}>{zh ? "撤销停用" : "Undo"}</button></div>)}
    </>}
    {error && <p role="alert">{error}</p>}
    <footer><p>{zh ? "这些偏向参与后续发现，不会立即重排已有推荐，也不会降低论文质量标准。" : "Interests inform future discovery; they do not instantly reorder existing recommendations or lower quality standards."}</p><button onClick={onRecords}>{zh ? "查看阅读笔记与研究记录" : "View notes and research records"} →</button></footer>
  </section>;
}
