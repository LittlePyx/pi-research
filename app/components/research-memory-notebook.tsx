import { useEffect, useState } from "react";
import type { ResearchMemoryItem } from "../../lib/research-memory-view";
import { MathText } from "./math-text";
type MemoryResponse = { items: ResearchMemoryItem[]; total: number; nextOffset: number | null };

export function ResearchMemoryNotebook({ spaceId, locale, onOpenPaper, onQuestion, onLibrary }: {
  spaceId: string; locale: "zh" | "en"; onOpenPaper: (id: string) => void; onQuestion: (paper: string, question: string) => void; onLibrary: () => void;
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
  const statusLabels: Record<string, string> = zh ? { ready: "Pi 已整理", error: "整理失败，原笔记保留", stale: "笔记已修改，整理待更新", needs_more_context: "需要更具体的笔记", pending: "尚未完成整理" }
    : { ready: "Organized by Pi", error: "Analysis failed; note retained", stale: "Note changed; analysis is stale", needs_more_context: "More note context needed", pending: "Not yet organized" };
  return <section className="pi-memory-notebook">
    <header><div><h2>{zh ? "可复用的阅读笔记" : "Your research notebook"}</h2><p>{zh ? "从你写下的笔记中找回方法、结论与疑问。Pi 的整理是线索，不代表已经掌握或科学结论已核验。" : "Retrieve methods, takeaways and questions from your notes. Pi's organization is a lead, not proof of mastery or scientific verification."}</p></div><button type="button" onClick={onLibrary}>{zh ? "去论文库记笔记" : "Open library"} →</button></header>
    <form className="pi-memory-search" onSubmit={e => { e.preventDefault(); setLoading(true); setOffset(0); setQuery(draft.trim()); setRetry(n => n + 1); }}><label htmlFor="memory-search">{zh ? "搜索论文、笔记、方法或疑问" : "Search papers, notes, methods or questions"}</label><div><input id="memory-search" value={draft} onChange={e => setDraft(e.target.value)} maxLength={160} placeholder={zh ? "例如：噪声假设、时间偏移估计…" : "e.g. noise assumptions, clock offset…"} /><button type="submit">{zh ? "搜索记忆" : "Search"}</button></div></form>
    {loading ? <p role="status">{zh ? "正在读取笔记…" : "Loading notes…"}</p> : error ? <p role="alert">{zh ? "笔记暂未加载成功。" : "Notes could not load."} <button type="button" onClick={() => { setLoading(true); setRetry(n => n + 1); }}>{zh ? "重试" : "Retry"}</button></p> : <>
      <p className="pi-memory-count">{zh ? `共 ${result?.total || 0} 条${query ? "匹配记录" : "阅读笔记"}` : `${result?.total || 0} ${query ? "matching records" : "reading notes"}`}</p>
      {!result?.items.length && <div className="pi-memory-empty"><h3>{query ? (zh ? "没有匹配的笔记" : "No matching notes") : (zh ? "先留下一条值得再次使用的笔记" : "Start with a note worth reusing")}</h3><p>{zh ? "可以记录：这篇解决了什么、关键假设是什么、哪一步仍不明白。保存原笔记就会出现在这里，不必等待 Pi 整理完成。" : "Capture the problem solved, key assumptions, or a step you do not understand. Saved notes appear here even before Pi finishes organizing them."}</p></div>}
      {result?.items.map(item => <article className="pi-memory-entry" key={item.paperId}>
        <header><span>{statusLabels[item.status]}</span><time>{item.updatedAt.slice(0, 10)}</time></header><h3><MathText>{item.title}</MathText></h3>
        <div className="pi-memory-original"><strong>{zh ? "我的原始笔记" : "My original note"}</strong><p>{item.note}</p></div>
        {item.status === "ready" && <details><summary>{zh ? "Pi 整理的方法与疑问" : "Methods and questions organized by Pi"}</summary><p>{zh ? item.takeawayZh : item.takeawayEn}</p>
          {(zh ? item.methodsZh : item.methodsEn).length > 0 && <section><h4>{zh ? "可复用方法" : "Reusable methods"}</h4><ul>{(zh ? item.methodsZh : item.methodsEn).map((method, index) => <li key={index}>{method}</li>)}</ul></section>}
          {(zh ? item.questionsZh : item.questionsEn).length > 0 && <section><h4>{zh ? "继续追问" : "Questions to explore"}</h4>{(zh ? item.questionsZh : item.questionsEn).map((question, index) => <button className="pi-memory-question" type="button" key={index} onClick={() => onQuestion(item.title, question)}>{question} →</button>)}</section>}
        </details>}
        <footer><span>{item.venue}</span><button type="button" onClick={() => onOpenPaper(item.paperId)}>{zh ? "回到论文 / 编辑笔记" : "Open paper / edit note"} →</button></footer>
      </article>)}
      {Boolean(result?.total) && <nav className="pi-memory-pagination" aria-label={zh ? "笔记分页" : "Note pagination"}><button type="button" disabled={!offset} onClick={() => { setLoading(true); setOffset(n => Math.max(0, n - 24)); }}>{zh ? "上一页" : "Previous"}</button><span>{offset + 1}–{offset + (result?.items.length || 0)} / {result?.total}</span><button type="button" disabled={result?.nextOffset == null} onClick={() => { setLoading(true); setOffset(result?.nextOffset || 0); }}>{zh ? "下一页" : "Next"}</button></nav>}
    </>}
  </section>;
}
