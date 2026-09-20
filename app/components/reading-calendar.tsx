"use client";
import { useEffect, useState } from "react";
import { MathText } from "./math-text";
import { calendarDay, calendarMonth } from "../../lib/reading-calendar";
import "./reading-calendar.css";

type Kind = "recommended" | "browsed" | "completed";
type CalendarData = { counts: { day: string; kind: Kind; count: number }[]; papers: { id: string; title: string; authors: string; venue: string }[]; hasMore: boolean };
export function ReadingCalendar({ spaceId, locale, onPaper }: { spaceId: string; locale: "zh" | "en"; onPaper: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [query, setQuery] = useState({ month: today.slice(0, 7), day: today, kind: "recommended" as Kind, page: 0 });
  const [data, setData] = useState<(CalendarData & { requestKey: string }) | null>(null);
  const [errorKey, setErrorKey] = useState("");
  const [retry, setRetry] = useState(0);
  const [restored, setRestored] = useState(false);
  const zh = locale === "zh";
  const requestKey = JSON.stringify([spaceId, query, retry]);
  const error = errorKey === requestKey;
  const loading = open && data?.requestKey !== requestKey && !error;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
    if (!active) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(`pi-reading-calendar:${spaceId}`) || "null");
      if (saved && calendarMonth(saved.month || "") && calendarDay(saved.day || "", saved.month) && ["recommended", "browsed", "completed"].includes(saved.kind)) {
        setQuery({ month: saved.month, day: saved.day, kind: saved.kind, page: 0 }); setOpen(saved.open === true);
      }
    } catch { /* An unavailable session store does not affect calendar access. */ }
    setRestored(true);
    });
    return () => { active = false; };
  }, [spaceId]);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(`pi-reading-calendar:${spaceId}`, JSON.stringify({ ...query, open })); } catch { /* Optional navigation memory. */ }
  }, [spaceId, restored, query, open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ spaceId, ...query, page: String(query.page) });
    fetch(`/api/reading-calendar?${params}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("calendar unavailable");
      const result = await response.json();
      if (!controller.signal.aborted) setData({ ...result, requestKey });
    }).catch(() => { if (!controller.signal.aborted) setErrorKey(requestKey); });
    return () => controller.abort();
  }, [open, spaceId, query, requestKey]);
  const labels: Record<Kind, string> = { recommended: zh ? "推荐" : "Recommended", browsed: zh ? "浏览" : "Browsed", completed: zh ? "标记读完" : "Marked read" };
  const range = calendarMonth(query.month)!;
  const offset = (new Date(`${range.start}T00:00:00Z`).getUTCDay() + 6) % 7;
  const count = (day: string, kind: Kind) => data?.counts.find(item => item.day === day && item.kind === kind)?.count || 0;
  return <section className="pi-reading-calendar">
    <button type="button" className="pi-calendar-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{zh ? "阅读日历" : "Reading calendar"}<span>{open ? (zh ? "收起 −" : "Close −") : (zh ? "按日期回看 →" : "Browse by date →")}</span></button>
    {open && <div className="pi-calendar-body">
      <header><label>{zh ? "月份" : "Month"}<input type="month" min="2000-01" max="2100-12" value={query.month} onChange={event => { const month = event.target.value; if (calendarMonth(month)) setQuery({ ...query, month, day: month === today.slice(0, 7) ? today : `${month}-01`, page: 0 }); }} /></label><button type="button" onClick={() => setQuery({ ...query, month: today.slice(0, 7), day: today, page: 0 })}>{zh ? "回到今天" : "Today"}</button><small>{zh ? "北京时间" : "Beijing time"}</small></header>
      <div className="pi-calendar-layout"><div>
        <div className="pi-calendar-week" aria-hidden="true">{(zh ? ["一", "二", "三", "四", "五", "六", "日"] : ["M", "T", "W", "T", "F", "S", "S"]).map((label, index) => <span key={index}>{label}</span>)}</div>
        <div className="pi-calendar-grid" aria-label={zh ? "选择日期" : "Choose a date"}>{Array.from({ length: offset }, (_, index) => <span key={`blank${index}`} />)}{Array.from({ length: range.days }, (_, index) => {
          const day = `${query.month}-${String(index + 1).padStart(2, "0")}`;
          const total = count(day, query.kind);
          return <button type="button" key={day} className={day === today ? "is-today" : ""} aria-pressed={query.day === day} aria-label={`${day} ${labels[query.kind]} ${loading || error ? "" : total}`} onClick={() => setQuery({ ...query, day, page: 0 })}><span>{index + 1}</span><small>{!loading && !error && total > 0 ? total : ""}</small></button>;
        })}</div><p className="pi-calendar-legend">{zh ? `日期下方数字为当天“${labels[query.kind]}”篇数。` : `Numbers show daily ${labels[query.kind].toLowerCase()} paper counts.`}</p>
      </div><div className="pi-calendar-results" aria-busy={loading}>
        <h3>{query.day}</h3><div className="pi-calendar-tabs" role="group" aria-label={zh ? "记录类型" : "Record type"}>{(Object.keys(labels) as Kind[]).map(kind => <button type="button" key={kind} aria-pressed={query.kind === kind} onClick={() => setQuery({ ...query, kind, page: 0 })}>{labels[kind]}{!loading && !error && <small>{count(query.day, kind)}</small>}</button>)}</div>
        {loading ? <p role="status">{zh ? "正在读取记录…" : "Loading records…"}</p> : error ? <p role="alert">{zh ? "暂时无法读取记录。" : "Records could not be loaded."}<button type="button" onClick={() => setRetry(retry + 1)}>{zh ? "重试" : "Retry"}</button></p> : data?.papers.length ? <><ul>{data.papers.map(paper => <li key={paper.id}><button type="button" onClick={() => onPaper(paper.id)}><MathText inline>{paper.title}</MathText></button><p>{[paper.authors, paper.venue].filter(Boolean).join(" · ")}</p></li>)}</ul>{(query.page > 0 || data.hasMore) && <nav aria-label={zh ? "记录分页" : "Record pages"}><button type="button" disabled={query.page === 0} onClick={() => setQuery({ ...query, page: query.page - 1 })}>{zh ? "上一页" : "Previous"}</button><span>{query.page + 1}</span><button type="button" disabled={!data.hasMore} onClick={() => setQuery({ ...query, page: query.page + 1 })}>{zh ? "下一页" : "Next"}</button></nav>}</> : <p>{zh ? "这一天没有此类记录。" : "No records of this type on this date."}</p>}
      </div></div>
      <footer>{zh ? "打开论文只算浏览。读完记录从本功能启用后保存，不包含“以前读过”；历史推荐与浏览仅展示留存记录。同篇同日只计一次。" : "Opening a paper only counts as browsing. Explicit read completions are recorded from this feature’s launch, excluding previously mastered papers. Earlier dates show retained records only. Each paper counts once per day per category."}</footer>
    </div>}
  </section>;
}
