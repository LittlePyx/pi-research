import { workspaceFetch as fetch } from "../../lib/workspace-request";
import { useEffect, useState } from "react";
import type { ResearchMemoryItem } from "../../lib/research-memory-view";
import { MathText } from "./math-text";
type MemoryResponse = { items: (ResearchMemoryItem & { demoExample?: boolean })[]; total: number; nextOffset: number | null };

export function ResearchMemoryNotebook({ spaceId, locale, onOpenPaper, onQuestion, onLibrary, mode = "notes", routes = [] }: {
  spaceId: string; locale: "zh" | "en"; onOpenPaper: (id: string) => void; onQuestion: (paper: string, question: string) => void; onLibrary: () => void; mode?: "notes" | "insights" | "continue"; routes?: Array<{ title: string; paperIds: string[] }>;
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
  const routeFor = (item: ResearchMemoryItem) => routes.find(route => route.paperIds.includes(item.paperId))?.title || (zh ? "未关联路线" : "Other notes");
  const entries = mode === "continue" ? (result?.items || []).slice(0, 4) : mode === "insights" ? (result?.items || []).filter(item => item.status === "ready") : [...(result?.items || [])].sort((a,b) => routeFor(a).localeCompare(routeFor(b)));
  return <section className="pi-memory-notebook">
    <header><div><h2>{mode === "continue" ? (zh ? "最近笔记" : "Recent notes") : mode === "notes" ? (zh ? "阅读笔记" : "Reading notes") : (zh ? "笔记整理" : "Note insights")}</h2>{mode === "insights" && <p>{zh ? "从原始笔记中提炼的方法与问题，供继续核对。" : "Methods and questions drawn from your notes, ready to review."}</p>}</div><button type="button" onClick={onLibrary}>{zh ? "论文库" : "Library"} ↗</button></header>
    {mode !== "continue" && <form className="pi-memory-search" role="search" onSubmit={e => { e.preventDefault(); setLoading(true); setOffset(0); setQuery(draft.trim()); setRetry(n => n + 1); }}><label htmlFor="memory-search">{zh ? "搜索论文、笔记、方法或疑问" : "Search papers, notes, methods or questions"}</label><div><input id="memory-search" value={draft} onChange={e => setDraft(e.target.value)} maxLength={160} placeholder={zh ? "搜索论文或笔记…" : "Search papers or notes…"} /><button type="submit">{zh ? "搜索记忆" : "Search"}</button>{query && <button type="button" onClick={() => { setDraft(""); setQuery(""); setOffset(0); setLoading(true); setRetry(n => n + 1); }}>{zh ? "清除" : "Clear"}</button>}</div></form>}

    {loading ? <p role="status">{zh ? "正在读取笔记…" : "Loading notes…"}</p> : error ? <p role="alert">{zh ? "笔记暂未加载成功。" : "Notes could not load."} <button type="button" onClick={() => { setLoading(true); setRetry(n => n + 1); }}>{zh ? "重试" : "Retry"}</button></p> : <>
      {mode !== "continue" && <p className="pi-memory-count">{zh ? `共 ${result?.total || 0} 条${query ? "匹配记录" : "阅读笔记"}` : `${result?.total || 0} ${query ? "matching records" : "reading notes"}`}{mode === "insights" && (zh ? ` · 本页 ${entries.length} 条有可用整理` : ` · ${entries.length} organized on this page`)}</p>}
      {!entries.length && <div className="pi-memory-empty"><h3>{mode === "insights" ? (zh ? "本页还没有可复用的整理" : "No organized insights on this page") : query ? (zh ? "没有匹配的笔记" : "No matching notes") : (zh ? "还没有阅读笔记" : "Start with a note worth reusing")}</h3><p>{mode === "insights" ? (zh ? "回到阅读笔记补充内容，再在论文页请求 Pi 整理。" : "Open an original note to add context or request organization. All notes remain available.") : zh ? "在论文页保存笔记后，就能在这里找到。" : "Capture the problem solved, key assumptions, or a step you do not understand. Saved notes appear here even before Pi finishes organizing them."}</p></div>}
      <div className="pi-memory-note-list">{entries.map(item => <article className="pi-memory-entry" key={item.paperId}>
        <header><span>{routeFor(item)}</span><time dateTime={item.updatedAt}>{item.updatedAt.slice(0, 10)}</time></header><h3><button className="pi-memory-paper-link" type="button" onClick={() => onOpenPaper(item.paperId)}><MathText inline>{item.title}</MathText></button></h3>
        {mode === "insights" ? <details className="pi-memory-original"><summary>{zh ? "查看原始笔记" : "Original note"}</summary><p>{item.note}</p></details> : <div className="pi-memory-original"><p>{item.note}</p></div>}
        {mode === "insights" && item.status === "ready" && <section className="pi-memory-synthesis"><h4>{item.demoExample ? (zh ? "示例整理" : "Example insights") : (zh ? "Pi 根据这条笔记整理" : "Pi’s interpretation of this note")}</h4><p>{zh ? item.takeawayZh : item.takeawayEn}</p>
          {(zh ? item.methodsZh : item.methodsEn).length > 0 && <section><h4>{zh ? "可复用方法" : "Reusable methods"}</h4><ul>{(zh ? item.methodsZh : item.methodsEn).map((method, index) => <li key={index}>{method}</li>)}</ul></section>}
          {(zh ? item.questionsZh : item.questionsEn).length > 0 && <section><h4>{zh ? "继续追问" : "Questions to explore"}</h4>{(zh ? item.questionsZh : item.questionsEn).map((question, index) => <button className="pi-memory-question" type="button" key={index} onClick={() => onQuestion(item.title, question)}>{question} →</button>)}</section>}
        </section>}
        <footer><button type="button" onClick={() => onOpenPaper(item.paperId)}>{zh ? "继续阅读与编辑" : "Read & edit note"} →</button></footer>
      </article>)}</div>
      {mode !== "continue" && Boolean(offset || result?.nextOffset != null) && <nav className="pi-memory-pagination" aria-label={zh ? "笔记分页" : "Note pagination"}><button type="button" disabled={!offset} onClick={() => { setLoading(true); setOffset(n => Math.max(0, n - 24)); }}>{zh ? "上一页" : "Previous"}</button><span>{offset + 1}–{offset + (result?.items.length || 0)} / {result?.total}</span><button type="button" disabled={result?.nextOffset == null} onClick={() => { setLoading(true); setOffset(result?.nextOffset || 0); }}>{zh ? "下一页" : "Next"}</button></nav>}
    </>}
  </section>;
}
