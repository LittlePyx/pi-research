import { useState } from "react";
import type { ResearchMemoryItem } from "../../lib/research-memory-view";
import { MathText } from "./math-text";
import {memoryResponse} from '../../lib/saved-memory-response';
import {useSavedRead} from './use-saved-read';

export function ResearchMemoryNotebook({ spaceId, locale, onOpenPaper, onQuestion, onLibrary, mode = "notes", routes = [] }: {
  spaceId: string; locale: "zh" | "en"; onOpenPaper: (id: string) => void; onQuestion: (paper: string, question: string) => void; onLibrary: () => void; mode?: "notes" | "insights" | "continue"; routes?: Array<{ title: string; paperIds: string[] }>;
}) {
  const [query, setQuery] = useState(""), [draft, setDraft] = useState(""), [offset, setOffset] = useState(0);
  const read=useSavedRead(spaceId,'/api/research-memory?'+new URLSearchParams({spaceId,q:query,offset:String(offset)}),memoryResponse);
  const result=read.data,loading=read.loading,error=read.error;
  const shownQuery=new URLSearchParams(read.dataUrl?.split('?')[1]||'').get('q')||'';
  const zh = locale === "zh";
  const routeFor = (item: ResearchMemoryItem) => routes.find(route => route.paperIds.includes(item.paperId))?.title || (zh ? "未关联路线" : "Other notes");
  const entries = mode === "continue" ? (result?.items || []).slice(0, 4) : mode === "insights" ? (result?.items || []).filter(item => item.status === "ready") : [...(result?.items || [])].sort((a,b) => routeFor(a).localeCompare(routeFor(b)));
  return <section className="pi-memory-notebook">
    <header><div><h2>{mode === "continue" ? (zh ? "最近笔记" : "Recent notes") : mode === "notes" ? (zh ? "阅读笔记" : "Reading notes") : (zh ? "笔记整理" : "Note insights")}</h2>{mode === "insights" && <p>{zh ? "从原始笔记中提炼的方法与问题，供继续核对。" : "Methods and questions drawn from your notes, ready to review."}</p>}</div><button type="button" onClick={onLibrary}>{zh ? "论文库" : "Library"} ↗</button></header>
    {mode !== "continue" && <form className="pi-memory-search" role="search" onSubmit={e => { e.preventDefault(); if(query===draft.trim()&&offset===0)read.reload();else{setOffset(0);setQuery(draft.trim())} }}><label htmlFor="memory-search">{zh ? "搜索论文、笔记、方法或疑问" : "Search papers, notes, methods or questions"}</label><div><input id="memory-search" value={draft} onChange={e => setDraft(e.target.value)} maxLength={160} placeholder={zh ? "搜索论文或笔记…" : "Search papers or notes…"} /><button type="submit">{zh ? "搜索记忆" : "Search"}</button>{query && <button type="button" onClick={() => { setDraft(""); setQuery(""); setOffset(0); }}>{zh ? "清除" : "Clear"}</button>}</div></form>}

    {loading && <p role="status">{result?(zh?'正在更新笔记，先显示上次载入的记录…':'Updating notes; previously loaded records remain below…'):(zh ? "正在读取笔记…" : "Loading notes…")}</p>}
    {error && <div className="pi-saved-read-error" role="alert"><p>{error==='access'||error==='missing'?(zh?'当前空间暂不可访问，请核对工作区。':'This workspace cannot be accessed. Check your workspace.'):result?(zh?'本次读取未完成，以下保留上次载入的结果。':'This read did not finish. Previously loaded results remain below.'):error==='timeout'?(zh?'读取笔记超时，可以重试。':'Loading notes timed out. Retry when ready.'):(zh ? "笔记暂未加载成功。" : "Notes could not load.")}</p><button type="button" disabled={loading} onClick={read.reload}>{zh ? "重试" : "Retry"}</button></div>}
    {result && <>
      {mode !== "continue" && <p className="pi-memory-count">{zh ? `共 ${result.total} 条${shownQuery ? "匹配记录" : "阅读笔记"}` : `${result.total} ${shownQuery ? "matching records" : "reading notes"}`}{shownQuery&&<span> · {shownQuery}</span>}{mode === "insights" && (zh ? ` · 本页 ${entries.length} 条有可用整理` : ` · ${entries.length} organized on this page`)}</p>}
      {!entries.length && <div className="pi-memory-empty"><h3>{mode === "insights" ? (zh ? "本页还没有可复用的整理" : "No organized insights on this page") : result.total>0 ? (zh ? "本页没有笔记" : "No notes on this page") : shownQuery ? (zh ? "没有匹配的笔记" : "No matching notes") : (zh ? "还没有阅读笔记" : "Start with a note worth reusing")}</h3><p>{mode === "insights" ? (zh ? "回到阅读笔记补充内容，再在论文页请求 Pi 整理。" : "Open an original note to add context or request organization. All notes remain available.") : result.total>0 ? (zh ? "返回上一页查看现有记录。" : "Return to the previous page to view saved records.") : zh ? "在论文页保存笔记后，就能在这里找到。" : "Capture the problem solved, key assumptions, or a step you do not understand. Saved notes appear here even before Pi finishes organizing them."}</p></div>}
      <div className="pi-memory-note-list">{entries.map(item => <article className="pi-memory-entry" key={item.paperId}>
        <header><span>{routeFor(item)}</span><time dateTime={item.updatedAt}>{item.updatedAt.slice(0, 10)}</time></header><h3><button className="pi-memory-paper-link" type="button" onClick={() => onOpenPaper(item.paperId)}><MathText inline>{item.title}</MathText></button></h3>
        {mode === "insights" ? <details className="pi-memory-original"><summary>{zh ? "查看原始笔记" : "Original note"}</summary><p>{item.note}</p></details> : <div className="pi-memory-original"><p>{item.note}</p></div>}
        {mode === "insights" && item.status === "ready" && <section className="pi-memory-synthesis"><h4>{item.demoExample ? (zh ? "示例整理" : "Example insights") : (zh ? "Pi 根据这条笔记整理" : "Pi’s interpretation of this note")}</h4><p>{zh ? item.takeawayZh : item.takeawayEn}</p>
          {(zh ? item.methodsZh : item.methodsEn).length > 0 && <section><h4>{zh ? "可复用方法" : "Reusable methods"}</h4><ul>{(zh ? item.methodsZh : item.methodsEn).map((method, index) => <li key={index}>{method}</li>)}</ul></section>}
          {(zh ? item.questionsZh : item.questionsEn).length > 0 && <section><h4>{zh ? "继续追问" : "Questions to explore"}</h4>{(zh ? item.questionsZh : item.questionsEn).map((question, index) => <button className="pi-memory-question" type="button" key={index} onClick={() => onQuestion(item.title, question)}>{question} →</button>)}</section>}
        </section>}
        <footer><button type="button" onClick={() => onOpenPaper(item.paperId)}>{zh ? "继续阅读与编辑" : "Read & edit note"} →</button></footer>
      </article>)}</div>
      {mode !== "continue" && Boolean(result.offset || result.nextOffset != null) && <nav className="pi-memory-pagination" aria-label={zh ? "笔记分页" : "Note pagination"}><button type="button" disabled={loading||Boolean(error)||!result.offset} onClick={() => setOffset(Math.max(0,result.offset-24))}>{zh ? "上一页" : "Previous"}</button><span>{result.items.length?result.offset + 1:0}–{result.items.length?result.offset + result.items.length:0} / {result.total}</span><button type="button" disabled={loading||Boolean(error)||result.nextOffset == null} onClick={() => setOffset(result.nextOffset || 0)}>{zh ? "下一页" : "Next"}</button></nav>}
    </>}
  </section>;
}
