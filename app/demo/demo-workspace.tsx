/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import { useEffect, useRef, useState } from "react";
import { MathText } from "../components/math-text";
import { DEMO_LEARNING_STEPS, DEMO_PAPERS, DEMO_TODAY_IDS, type DemoPaper } from "../../lib/demo-research";
import styles from "./demo.module.css";

const pages = ["今日", "研究", "学习", "论文库", "研究记忆"] as const;
const sections = ["概览", "材料", "问题与判断", "任务"] as const;
const routes = { geometry: "KLS 猜想与随机局部化", information: "信息不等式与编码" };

export default function DemoWorkspace() {
  const [page, setPage] = useState<string>("今日");
  const [route, setRoute] = useState<"geometry" | "information">("geometry");
  const [section, setSection] = useState<string>("概览");
  const [paper, setPaper] = useState<DemoPaper | null>(null);
  const [stage, setStage] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const [ask, setAsk] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(false);
  const askTrigger = useRef<HTMLButtonElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ask) questionInput.current?.focus();
  }, [ask]);
  const closeAsk = () => { setAsk(false); askTrigger.current?.focus(); };
  const routePapers = DEMO_PAPERS.filter(item => item.route === route);
  const openPaper = (item: DemoPaper) => { setPaper(item); setNotice(""); };
  const navigate = (next: string) => { setPage(next); setPaper(null); setCompare(false); setNotice(""); };
  const title = paper?.title || (compare ? "材料比较" : page === "研究" ? routes[route] : page);
  function paperList(items: readonly DemoPaper[], selectable = false) {
    return <div className={styles.paperList}>{items.map(item => <article key={item.id}>
      {selectable && <input type="checkbox" aria-label={`比较 ${item.title}`} checked={selected.includes(item.id)} disabled={!selected.includes(item.id) && selected.length >= 3} onChange={() => setSelected(old => old.includes(item.id) ? old.filter(id => id !== item.id) : [...old, item.id])} />}
      <div><small>{item.year} · {item.venue}</small><button className={styles.paperTitle} onClick={() => openPaper(item)}><MathText>{item.title}</MathText></button><p>{item.note}</p></div>
      <button className={styles.read} onClick={() => openPaper(item)}>阅读 →</button>
    </article>)}</div>;
  }
  return <div className={styles.page}>
    <header className={styles.header}><a href="/demo" className={styles.brand}>π <strong>Pi Research</strong></a><span>演示空间</span><a className={styles.workspaceLink} href="/">进入工作区 →</a></header>
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="演示空间导航">{pages.map(item => <button key={item} aria-current={page === item ? "page" : undefined} onClick={() => navigate(item)}>{item}</button>)}<div className={styles.navNote}>公开文献样例<br />应用数学 · 信息论</div></nav>
      <main>
        <div className={styles.boundary}>示例数据 · 本页操作仅供体验，刷新后重置，不写入正式空间。</div>
        <div className={styles.heading}><div><small>PI RESEARCH / DEMO</small><h1><MathText>{title}</MathText></h1></div><button ref={askTrigger} aria-expanded={ask} onClick={() => { setAsk(!ask); setAnswer(false); }}>询问 Pi</button></div>
        {paper ? <section className={styles.surface}>
          <button onClick={() => { setPaper(null); setNotice(""); }}>← 返回{compare ? "材料比较" : page}</button>
          <p className={styles.muted}>{paper.authors} · {paper.year} · {paper.venue}</p>
          <h2>阅读线索</h2><p>{paper.note}</p><p className={styles.muted}>这是文献导读示例，未提供摘要核对或正式研究判断。</p>
          {paper.href ? <a href={paper.href} target="_blank" rel="noreferrer">查看原文 ↗</a> : <p className={styles.muted}>该样例尚未附原文链接。</p>}
          <div className={styles.editor}><label htmlFor="demo-note">阅读笔记</label><textarea id="demo-note" value={drafts[paper.id] ?? notes[paper.id] ?? ""} placeholder="试记一个假设、适用条件或待核对的问题…" onChange={event => { setDrafts({ ...drafts, [paper.id]: event.target.value }); setNotice(""); }} /><button disabled={(drafts[paper.id] ?? notes[paper.id] ?? "") === (notes[paper.id] ?? "")} onClick={() => { setNotes({ ...notes, [paper.id]: drafts[paper.id] ?? "" }); setNotice("已保存到演示记忆，刷新后重置。"); }}>保存示例笔记</button><p role="status">{notice}</p></div>
        </section> : compare ? <section><button onClick={() => setCompare(false)}>← 返回{page}</button><p className={styles.muted}>对照文献定位与待核对问题；这些导读不是原文证据。</p><div className={styles.compare}>{DEMO_PAPERS.filter(item => selected.includes(item.id)).map(item => <article className={styles.surface} key={item.id}><small>{item.year} · {item.venue}</small><h2><MathText>{item.title}</MathText></h2><p>{item.note}</p><h3>阅读时核对</h3><p>模型假设、结论适用范围与常数依赖。请打开原文后记录证据。</p><button onClick={() => openPaper(item)}>阅读与记笔记 →</button></article>)}</div></section> : <>
          {page === "今日" && <><section className={styles.hero}><small>从一个问题开始</small><h2>KLS 猜想与<br />随机局部化</h2><p>从经典问题到关键方法，沿着文献理解等周、谱隙与采样之间的联系。</p><button onClick={() => { setRoute("geometry"); setSection("概览"); navigate("研究"); }}>打开研究路线 →</button></section><div className={styles.sectionHeading}><h2>本次阅读</h2><span>精选经典 · 非实时推荐</span></div>{paperList(DEMO_PAPERS.filter(item => DEMO_TODAY_IDS.some(id => id === item.id)))}<div className={styles.next}><div><h3>先补齐问题语言</h3><p>从 Cheeger 与 KLS 原始工作进入这条路线。</p></div><button onClick={() => navigate("学习")}>进入学习路径 →</button></div></>}
          {page === "研究" && <><div className={styles.routePicker}>{Object.entries(routes).map(([id, name]) => <button key={id} aria-pressed={route === id} onClick={() => setRoute(id as typeof route)}>{name}</button>)}</div><nav className={styles.tabs} aria-label="路线分区">{sections.map(item => <button key={item} aria-current={section === item ? "page" : undefined} onClick={() => setSection(item)}>{item}</button>)}</nav>
            {section === "概览" && <section className={styles.surface}><h2>{routes[route]}</h2><p>{route === "geometry" ? "理解等周常数与谱隙的联系，追踪随机局部化如何介入这些问题。" : "从率失真与边信息出发，连接熵功率、估计与函数不等式。"}</p><div className={styles.facts}><div><strong>{routePapers.length}</strong><span>篇样例文献</span></div><div><strong>3</strong><span>类文献定位</span></div></div><h3>文献脉络</h3><p>{routePapers.map(item => `${item.year} ${item.authors.split(" · ")[0]}`).join(" → ")}</p><button onClick={() => setSection("材料")}>查看路线材料 →</button></section>}
            {section === "材料" && <><p className={styles.muted}>选择 2–3 篇文献，对照阅读线索。</p>{paperList(routePapers, true)}</>}
            {section === "问题与判断" && <section className={styles.surface}><small>待核对的问题示例</small><h2>{route === "geometry" ? "不同局部化结果的假设与维数依赖如何对应？" : "信息不等式与函数不等式之间的桥梁有哪些适用条件？"}</h2><p>先明确每篇工作的模型、结论与限制，再形成路线判断。</p><hr /><h3>研究判断尚未形成</h3><p className={styles.muted}>本演示没有经过核对的摘要证据，因此不生成综合结论或证据缺口。</p><button onClick={() => setSection("材料")}>回到材料核对 →</button></section>}
            {section === "任务" && <section className={styles.surface}><h2>阅读核对清单</h2><p className={styles.muted}>勾选仅演示任务状态，不代表正式阅读或研究确认。</p>{["记录各篇工作的基本假设", "对照结论范围与常数依赖", "整理仍需原文核对的问题"].map((task, index) => <label className={styles.task} key={task}><input type="checkbox" checked={!!done[`${route}-${index}`]} onChange={event => setDone({ ...done, [`${route}-${index}`]: event.target.checked })} />{task}</label>)}</section>}
          </>}
          {page === "学习" && <><p className={styles.muted}>KLS 基础路径 · 四个阶段</p><div className={styles.learning}><nav aria-label="学习阶段">{DEMO_LEARNING_STEPS.map((step, index) => <button key={step.number} aria-current={stage === index ? "step" : undefined} onClick={() => setStage(index)}><small>{step.number}</small>{step.title}</button>)}</nav><section><h2>{DEMO_LEARNING_STEPS[stage].title}</h2><p>{DEMO_LEARNING_STEPS[stage].detail}</p>{paperList(DEMO_PAPERS.filter(item => DEMO_LEARNING_STEPS[stage].paperIds.includes(item.id)))}</section></div></>}
          {page === "论文库" && <><label className={styles.search}>检索样例文献<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="标题、作者或年份" /></label><p className={styles.muted}>共 {DEMO_PAPERS.length} 篇 · 可选择 2–3 篇比较</p>{paperList(DEMO_PAPERS.filter(item => `${item.title} ${item.authors} ${item.year}`.toLowerCase().includes(search.toLowerCase())), true)}{!DEMO_PAPERS.some(item => `${item.title} ${item.authors} ${item.year}`.toLowerCase().includes(search.toLowerCase())) && <p className={styles.surface}>没有匹配的样例文献，请换个关键词。</p>}</>}
          {page === "研究记忆" && <section className={styles.surface}><h2>本次体验的阅读笔记</h2><p className={styles.muted}>仅保留在本页，刷新后重置。</p>{DEMO_PAPERS.filter(item => notes[item.id]?.trim()).map(item => <article key={item.id}><button className={styles.paperTitle} onClick={() => openPaper(item)}>{item.title}</button><p className={styles.note}>{notes[item.id]}</p></article>)}{!Object.values(notes).some(note => note.trim()) && <div className={styles.empty}><h3>还没有示例笔记</h3><p>打开一篇论文，试着记录一个待核对的问题。</p><button onClick={() => openPaper(DEMO_PAPERS[1])}>阅读 KLS 原始工作 →</button></div>}</section>}
          {(page === "论文库" || (page === "研究" && section === "材料")) && selected.length > 0 && <div className={styles.selection}><span>已选 {selected.length} / 3 篇</span><button onClick={() => setSelected([])}>清空选择</button><button disabled={selected.length < 2} onClick={() => setCompare(true)}>比较材料 →</button></div>}
        </>}
        {ask && <aside className={styles.ask} aria-label="询问 Pi 示例"><div className={styles.sectionHeading}><h2>询问 Pi</h2><button onClick={closeAsk} aria-label="关闭询问 Pi">关闭</button></div><p className={styles.muted}>当前关联：<MathText>{title}</MathText></p><label htmlFor="demo-question">试写你的问题</label><textarea onKeyDown={event => { if (event.key === "Escape") closeAsk(); }} ref={questionInput} id="demo-question" value={question} onChange={event => { setQuestion(event.target.value); setAnswer(false); }} placeholder="这篇论文有哪些假设需要核对？" /><p className={styles.muted}>演示模式不调用模型。下方只展示回答结构，不回答输入的问题。</p><button onClick={() => setAnswer(true)}>查看回答示例</button>{answer && <div className={styles.sample}><h3>回答结构示例</h3><p>先说明可用材料，再区分原文证据与推测，并标出需要补充核对的条件。</p><p>当前样例只有文献导读，尚不足以支持具体研究结论。</p></div>}</aside>}
      </main>
    </div>
  </div>;
}

