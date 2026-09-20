import { workspaceFetch as fetch } from "../../lib/workspace-request";
import { useEffect, useState } from "react";
import type { ResearchMemoryItem } from "../../lib/research-memory-view";
import { MathText } from "./math-text";
type MemoryResponse = { items: ResearchMemoryItem[]; total: number; nextOffset: number | null };

export function ResearchMemoryNotebook({ spaceId, locale, onOpenPaper, onQuestion, onLibrary, mode = "notes" }: {
  spaceId: string; locale: "zh" | "en"; onOpenPaper: (id: string) => void; onQuestion: (paper: string, question: string) => void; onLibrary: () => void; mode?: "notes" | "insights";
}) {
  const [query, setQuery] = useState(""), [draft, setDraft] = useState(""), [offset, setOffset] = useState(0), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<MemoryResponse | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/research-memory?spaceId=${encodeURIComponent(spaceId)}&q=${encodeURIComponent(query)}&offset=${offset}`, { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error("unavailable"); return r.json() as Promise<MemoryResponse>; })
      .then(value => { if (!controller.signal.aborted) { setResult(value); setError(false); setLoading(false); } })
      .catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false); } });
    return () => controller.abort();
  }, [spaceId, query, offset, retry]);
  const zh = locale === "zh";
  const statusLabels: Record<string, string> = zh ? { ready: "原始笔记 · Pi 已整理", error: "原始笔记", stale: "原始笔记", needs_more_context: "原始笔记", pending: "原始笔记" }
    : { ready: "Your note · Organized by Pi", error: "Your note", stale: "Your note", needs_more_context: "Your note", pending: "Your note" };
  return <section className="pi-memory-notebook">
    <header><div><h2>{mode === "notes" ? (zh ? "我的阅读笔记" : "My reading notes") : (zh ? "从笔记中积累" : "Insights from notes")}</h2><p>{mode === "notes" ? (zh ? "按笔记更新时间排列，回到论文即可继续阅读或编辑。" : "Ordered by note update. Return to a paper to continue reading or editing.") : (zh ? "保留你的原始记录；Pi 整理的方法与问题供继续核对，不代表已掌握或已验证。" : "Your original notes remain the source. Pi’s methods and questions are leads to check, not verified findings or mastery.")}</p></div><button type="button" onClick={onLibrary}>{zh ? "去论文库" : "Open library"} →</button></header>
    <form className="pi-memory-search" onSubmit={e => { e.preventDefault(); setLoading(true); setOffset(0); setQuery(draft.trim()); setRetry(n => n + 1); }}><label htmlFor="memory-search">{zh ? "搜索论文、笔记、方法或疑问" : "Search papers, notes, methods or questions"}</label><div><input id="memory-search" value={draft} onChange={e => setDraft(e.target.value)} maxLength={160} placeholder={zh ? "例如：噪声假设、时间偏移估计…" : "e.g. noise assumptions, clock offset…"} /><button type="submit">{zh ? "搜索记忆" : "Search"}</button></div></form>
    {loading ? <p role="status">{zh ? "正在读取笔记…" : "Loading notes…"}</p> : error ? <p role="alert">{zh ? "笔记暂未加载成功。" : "Notes could not load."} <button type="button" onClick={() => { setLoading(true); setRetry(n => n + 1); }}>{zh ? "重试" : "Retry"}</button></p> : <>
      <p className="pi-memory-count">{zh ? `共 ${result?.total || 0} 条${query ? "匹配记录" : "阅读笔记"}` : `${result?.total || 0} ${query ? "matching records" : "reading notes"}`}</p>
      {!result?.items.length && <div className="pi-memory-empty"><h3>{query ? (zh ? "没有匹配的笔记" : "No matching notes") : (zh ? "先留下一条值得再次使用的笔记" : "Start with a note worth reusing")}</h3><p>{zh ? "可以记录：这篇解决了什么、关键假设是什么、哪一步仍不明白。保存原笔记就会出现在这里，不必等待 Pi 整理完成。" : "Capture the problem solved, key assumptions, or a step you do not understand. Saved notes appear here even before Pi finishes organizing them."}</p></div>}
      {result?.items.map(item => <article className="pi-memory-entry" key={item.paperId}>
        <header><span>{statusLabels[item.status]}</span><time>{item.updatedAt.slice(0, 10)}</time></header><h3><MathText inline>{item.title}</MathText></h3>
        <div className="pi-memory-original"><strong>{zh ? "我的原始笔记" : "My original note"}</strong><p>{item.note}</p></div>
        {mode === "insights" && item.status === "ready" && <section className="pi-memory-synthesis"><h4>{zh ? "Pi 根据这条笔记整理" : "Pi’s interpretation of this note"}</h4><p>{zh ? item.takeawayZh : item.takeawayEn}</p>
          {(zh ? item.methodsZh : item.methodsEn).length > 0 && <section><h4>{zh ? "可复用方法" : "Reusable methods"}</h4><ul>{(zh ? item.methodsZh : item.methodsEn).map((method, index) => <li key={index}>{method}</li>)}</ul></section>}
          {(zh ? item.questionsZh : item.questionsEn).length > 0 && <section><h4>{zh ? "继续追问" : "Questions to explore"}</h4>{(zh ? item.questionsZh : item.questionsEn).map((question, index) => <button className="pi-memory-question" type="button" key={index} onClick={() => onQuestion(item.title, question)}>{question} →</button>)}</section>}
        </section>}
        {mode === "insights" && item.status !== "ready" && <p className="pi-memory-note-hint">{zh ? "这条记录保留为你的原始笔记，可回到论文补充或让 Pi 整理。" : "This is your original note. Open the paper to add context or ask Pi to organize it."}</p>}
        <footer><span>{item.venue}</span><button type="button" onClick={() => onOpenPaper(item.paperId)}>{zh ? "回到论文 / 编辑笔记" : "Open paper / edit note"} →</button></footer>
      </article>)}
      {Boolean(result?.total) && <nav className="pi-memory-pagination" aria-label={zh ? "笔记分页" : "Note pagination"}><button type="button" disabled={!offset} onClick={() => { setLoading(true); setOffset(n => Math.max(0, n - 24)); }}>{zh ? "上一页" : "Previous"}</button><span>{offset + 1}–{offset + (result?.items.length || 0)} / {result?.total}</span><button type="button" disabled={result?.nextOffset == null} onClick={() => { setLoading(true); setOffset(result?.nextOffset || 0); }}>{zh ? "下一页" : "Next"}</button></nav>}
    </>}
  </section>;
}
