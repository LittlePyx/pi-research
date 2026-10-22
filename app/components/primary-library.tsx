"use client";

import type { ReactNode } from "react";
import { archiveQualityStagePresentation, isRecommendationQualityStage } from "../../lib/discovery-archive-semantics.mjs";
import { LibraryExport } from "./library-export";
import { MathText } from "./math-text";
import type {RouteSelection} from './use-route-selection';
import {comparisonEligibilityText,type ComparisonEligibility} from '../../lib/comparison-eligibility';

type Locale = "zh" | "en";
type LibraryFilter = "inbox" | "accepted" | "all" | "dismissed";
type LibrarySort = "priority" | "newest" | "quality";
type LibraryTag = "all" | "saved" | "notes";
type ReadingStatus = "unread" | "queued" | "reading" | "read" | "mastered" | "cited";

type LibraryPaper = {
  id: string;
  canonicalId?: string;
  comparisonEligibility?: ComparisonEligibility;
  title: string;
  authors: string;
  venue: string;
  publishedAt: string | null;
  userState: "unseen" | "seen" | "snoozed" | "accepted" | "dismissed";
  qualityStage?: "awaiting_evidence" | "queued" | "discovered" | "reviewed" | "reviewing" | "recommended" | null;
  recommendationTier: "must_read" | "browse" | "reserve";
  verificationPhase?: "not_required" | "awaiting_audit" | "awaiting_correction" | "awaiting_recheck" | "verified" | "revised" | "withheld";
  readingStatus: ReadingStatus;
  saved: boolean;
  readingNote: string;
  whyReadZh: string;
  whyReadEn: string;
  discoverySources?: Array<{ key: string; labelZh: string; labelEn: string }>;
};

type LibraryPageState = {
  data: { total: number; offset: number; nextOffset: number | null } | null;
  busy: boolean;
  error: boolean;
  offset: number;
  retry: () => void;
  setOffset: (offset: number) => void;
};

type PrimaryLibraryProps<Paper extends LibraryPaper> = {
  visible: boolean;
  comparisonSelection?: RouteSelection;
  comparisonControls?: ReactNode;
  comparisonTrackId?: string;
  demo: boolean;
  locale: Locale;
  spaceId: string;
  spaceName: string;
  monitorReadNotice: ReactNode;
  labels: {
    inbox: string; accepted: string; ignored: string; unseen: string; snoozed: string; seenPending: string;
    historySearch: string; sortPriority: string; sortNewest: string; sortQuality: string;
    viewAnalysis: string; citations: string; relevant: string; readLater: string; notRelevant: string;
    returnPending: string; sharePaper: string; whySuitable: string;
  };
  filter: LibraryFilter;
  allFilterActive: boolean;
  sort: LibrarySort;
  tag: LibraryTag;
  search: string;
  counts?: { inbox?: number; accepted?: number; dismissed?: number; total: number } | null;
  papers: Paper[];
  total?: number;
  page: LibraryPageState;
  readingSaving: boolean;
  sharingSnapshot: boolean;
  remainingDemoCount: number;
  onFilter: (filter: LibraryFilter) => void;
  onSearch: (query: string, history: "push" | "replace") => void;
  onSort: (sort: LibrarySort) => void;
  onTag: (tag: LibraryTag) => void;
  onClearAll: () => void;
  onOpen: (paper: Paper) => void;
  onExploreGraph: (paper: Paper) => void;
  onReadingStatus: (paper: Paper, status: ReadingStatus) => void;
  onRelevant: (paper: Paper) => void;
  onLater: (paper: Paper) => void;
  onNotRelevant: (paper: Paper) => void;
  onReturnInbox: (paper: Paper) => void;
  onShare: (paper: Paper) => void;
  onLoadMore: () => void;
};

function formatPaperDate(value: string | null, locale: Locale) {
  if (!value) return locale === "zh" ? "日期未提供" : "Date unavailable";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function recommendationTierLabel(tier: LibraryPaper["recommendationTier"], locale: Locale) {
  if (tier === "must_read") return locale === "zh" ? "今日必读" : "Must read";
  if (tier === "browse") return locale === "zh" ? "重点浏览" : "Browse";
  return locale === "zh" ? "储备线索" : "Reserve";
}

function recommendationAuditPhaseLabel(paper: LibraryPaper, locale: Locale) {
  if (paper.verificationPhase === "awaiting_correction") return locale === "zh" ? "正在核对并修正" : "Checking and correcting";
  return locale === "zh" ? "正在核对" : "Checking evidence";
}

function readingStatusLabel(status: ReadingStatus, locale: Locale) {
  const labels: Record<ReadingStatus, { zh: string; en: string }> = {
    unread: { zh: "未加入阅读", en: "Not queued" }, queued: { zh: "待读", en: "Queued" },
    reading: { zh: "阅读中", en: "Reading" }, read: { zh: "已读", en: "Read" },
    mastered: { zh: "已掌握", en: "Mastered" }, cited: { zh: "已引用", en: "Cited" },
  };
  return labels[status][locale];
}

function PaperDiscoverySourceBadge({ paper, locale }: { paper: LibraryPaper; locale: Locale }) {
  const sources = paper.discoverySources || [];
  if (!sources.length) return null;
  const labels = sources.map((source) => locale === "zh" ? source.labelZh : source.labelEn);
  const primary = labels[0].length > 48 ? `${labels[0].slice(0, 48)}…` : labels[0];
  return <span className="v2-paper-discovery-source" title={labels.join(" · ")} aria-label={labels.join(" · ")}><i />{primary}{labels.length > 1 ? ` +${labels.length - 1}` : ""}</span>;
}

export function PrimaryLibrary<Paper extends LibraryPaper>(props: PrimaryLibraryProps<Paper>) {
  const { locale, labels, page } = props;
  return <main hidden={!props.visible} className="v2-page v2-library-page pi-library-workspace">
    {props.monitorReadNotice}
    <section className="v2-page-head"><div><p className="v2-kicker">{props.spaceName}</p><h1>{locale === "zh" ? "论文库" : "Library"}</h1><p className="pi-page-purpose">{locale === "zh" ? "查找已发现的论文，查看评审结果，安排阅读并留下笔记。" : "Find discovered papers, inspect reviews, plan reading and keep notes."}</p></div><LibraryExport spaceId={props.spaceId} locale={locale}/></section>
    {props.comparisonControls}
    <div className="v2-library-tabs">
      <button className={props.filter === "inbox" ? "active" : ""} aria-pressed={props.filter === "inbox"} type="button" onClick={() => props.onFilter("inbox")}>{labels.inbox}<span>{props.counts?.inbox ?? "—"}</span></button>
      <button className={props.filter === "accepted" ? "active" : ""} aria-pressed={props.filter === "accepted"} type="button" onClick={() => props.onFilter("accepted")}>{labels.accepted}<span>{props.counts?.accepted ?? "—"}</span></button>
      <button className={props.filter === "dismissed" ? "active" : ""} aria-pressed={props.filter === "dismissed"} type="button" onClick={() => props.onFilter("dismissed")}>{labels.ignored}<span>{props.counts?.dismissed ?? "—"}</span></button>
      <button className={props.allFilterActive ? "active" : ""} aria-pressed={props.allFilterActive} type="button" onClick={() => props.onFilter("all")}>{locale === "zh" ? "全部发现" : "All discoveries"}<span>{props.counts?.total ?? "—"}</span></button>
    </div>
    <div className="v2-library-toolbar">
      <label><span aria-hidden="true">⌕</span><input maxLength={240} value={props.search} onChange={(event) => props.onSearch(event.target.value, "replace")} placeholder={locale === "zh" ? "搜索题名、作者、DOI 或笔记" : "Search title, author, DOI or notes"} aria-label={labels.historySearch} /></label>
      {props.search && <button className="pi-clear-search" type="button" onClick={() => props.onSearch("", "push")}>{locale === "zh" ? "清除搜索" : "Clear search"}</button>}
      <select value={props.sort} onChange={(event) => props.onSort(event.target.value as LibrarySort)} aria-label={locale === "zh" ? "历史记录排序" : "Sort history"}><option value="priority">{labels.sortPriority}</option><option value="newest">{labels.sortNewest}</option><option value="quality">{labels.sortQuality}</option></select>
      <select value={props.tag} onChange={(event) => props.onTag(event.target.value as LibraryTag)} aria-label={locale === "zh" ? "资料筛选" : "Filter records"}><option value="all">{locale === "zh" ? "所有资料" : "All records"}</option><option value="saved">{locale === "zh" ? "仅收藏" : "Saved"}</option><option value="notes">{locale === "zh" ? "有笔记" : "With notes"}</option></select>
    </div>
    <p className="pi-library-result-count" role="status">{props.total === undefined ? (page.error ? (locale === "zh" ? "全库查询未完成" : "Library query incomplete") : (locale === "zh" ? "正在查询全库…" : "Searching the library…")) : (locale === "zh" ? `${props.total} 篇论文` : `${props.total} papers`)}{!props.demo && page.busy && (locale === "zh" ? " · 正在更新" : " · Updating")}</p>
    {!props.demo && page.error && <p role="alert">{locale === "zh" ? "全库查询暂未成功，已显示的内容保留。" : "Library search failed; displayed results are preserved."}<button type="button" onClick={page.retry}>{locale === "zh" ? "重试" : "Retry"}</button></p>}
    <div className="v2-library-list">
      {props.papers.map((paper) => <article className={`v2-library-paper ${paper.userState}`} key={paper.id}>
        {props.comparisonSelection&&<div className="pi-library-compare-choice"><label><input type="checkbox" aria-label={`${locale==='zh'?'选择比较':'Select for comparison'} ${paper.title}`} checked={props.comparisonSelection.value.papers.some(p=>p.canonicalId.toLowerCase()===paper.canonicalId?.toLowerCase())} disabled={!props.comparisonSelection.value.papers.some(p=>p.canonicalId.toLowerCase()===paper.canonicalId?.toLowerCase())&&(!props.comparisonTrackId||!paper.canonicalId||paper.comparisonEligibility!=='eligible'||props.comparisonSelection.value.papers.length>=3)} onChange={()=>{if(paper.canonicalId)props.comparisonSelection?.toggle({canonicalId:paper.canonicalId,title:paper.title});}} />{locale==='zh'?'加入比较':'Select to compare'}</label><small>{!props.comparisonTrackId?(locale==='zh'?'先选择比较所属路线':'Choose a comparison route first'):comparisonEligibilityText(paper.comparisonEligibility,locale==='zh')}</small></div>}
        <button className="v2-library-paper-main" type="button" onClick={() => props.onOpen(paper)}><h2><MathText inline>{paper.title}</MathText></h2><p className="v2-library-paper-meta">{paper.authors} · {paper.venue} · {formatPaperDate(paper.publishedAt, locale)}</p><div className="v2-library-paper-flags"><span className={`v2-history-state ${paper.userState}`}>{paper.userState === "unseen" ? labels.unseen : paper.userState === "accepted" ? labels.accepted : paper.userState === "dismissed" ? labels.ignored : paper.userState === "snoozed" ? labels.snoozed : labels.seenPending}</span><span className={`v2-tier-badge ${paper.qualityStage === "recommended" ? paper.recommendationTier || "browse" : paper.qualityStage === "reviewing" ? "reserve" : "browse"}`}>{paper.qualityStage === "recommended" ? recommendationTierLabel(paper.recommendationTier || "browse", locale) : paper.qualityStage === "reviewing" ? recommendationAuditPhaseLabel(paper, locale) : archiveQualityStagePresentation(paper.qualityStage, locale).label}</span><span>{readingStatusLabel(paper.readingStatus || "unread", locale)}</span></div><footer><b>{labels.viewAnalysis} →</b></footer></button>
        <div className="pi-library-row-actions"><button type="button" onClick={() => props.onExploreGraph(paper)}>{locale === "zh" ? "在图谱中探索" : "Explore in graph"}</button><details className="v2-library-paper-actions"><summary>{locale === "zh" ? "管理" : "Manage"} ＋</summary><div><select disabled={props.readingSaving} value={paper.readingStatus || "unread"} onChange={(event) => props.onReadingStatus(paper, event.target.value as ReadingStatus)} aria-label={locale === "zh" ? "阅读状态" : "Reading status"}>{(["unread", "queued", "reading", "read", "mastered", "cited"] as ReadingStatus[]).map((status) => <option value={status} key={status}>{readingStatusLabel(status, locale)}</option>)}</select>{!["accepted", "dismissed"].includes(paper.userState) ? <><button type="button" onClick={() => props.onRelevant(paper)}>✓ {labels.relevant}</button><button type="button" onClick={() => props.onLater(paper)}>◷ {labels.readLater}</button><button type="button" onClick={() => props.onNotRelevant(paper)}>× {labels.notRelevant}</button></> : <button type="button" onClick={() => props.onReturnInbox(paper)}>↶ {labels.returnPending}</button>}<button type="button" onClick={() => props.onShare(paper)} disabled={props.sharingSnapshot}>↗ {labels.sharePaper}</button></div></details></div>
        <details className="pi-library-context"><summary>{locale === "zh" ? "推荐理由与来源" : "Rationale & sources"}</summary><p className="v2-library-paper-why"><b>{isRecommendationQualityStage(paper.qualityStage) ? labels.whySuitable : locale === "zh" ? "归档说明" : "Archive note"}</b>{isRecommendationQualityStage(paper.qualityStage) ? ((locale === "zh" ? paper.whyReadZh : paper.whyReadEn) || (locale === "zh" ? "正在共享质量队列中核对，尚未形成正式推荐。" : "This candidate is still being checked in the shared quality queue and is not yet a formal recommendation.")) : archiveQualityStagePresentation(paper.qualityStage, locale).note}</p><PaperDiscoverySourceBadge paper={paper} locale={locale} /></details>
      </article>)}
      {props.demo && props.remainingDemoCount > 0 && <button className="v2-library-load-more" type="button" onClick={props.onLoadMore}>{locale === "zh" ? `继续显示（剩余 ${props.remainingDemoCount} 篇）` : `Show more (${props.remainingDemoCount} remaining)`}</button>}
      {(props.demo || page.data && !page.busy && !page.error) && props.total === 0 && <p className="v2-monitor-empty">{locale === "zh" ? "当前筛选没有匹配论文。可清除搜索并查看全部发现。" : "No papers match these filters. Clear the search and view all discoveries."}<button type="button" onClick={props.onClearAll}>{locale === "zh" ? "查看全部发现" : "View all discoveries"} →</button></p>}
    </div>
    {!props.demo && page.data && page.data.total > 0 && <nav className="pi-library-pagination" aria-label={locale === "zh" ? "文献分页" : "Library pagination"}><button type="button" disabled={page.busy || page.offset === 0} onClick={() => page.setOffset(Math.max(0, page.offset - 60))}>{locale === "zh" ? "上一页" : "Previous"}</button><span>{locale === "zh" ? `第 ${Math.floor(page.data.offset / 60) + 1} 页 · 每页 60 篇` : `Page ${Math.floor(page.data.offset / 60) + 1} · 60 per page`}</span><button type="button" disabled={page.busy || page.data.nextOffset === null} onClick={() => page.setOffset(page.data!.nextOffset!)}>{locale === "zh" ? "下一页" : "Next"}</button></nav>}
  </main>;
}
