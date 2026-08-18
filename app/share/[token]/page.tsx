import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getShareSnapshot, type SharePaper } from "../../../db/share-snapshots";
import ShareActions from "./share-actions";

type SharePageProps = { params: Promise<{ token: string }> };

function cleanDescription(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? normalized.slice(0, 177) + "…" : normalized;
}

function paperDescription(paper: SharePaper, locale: "zh" | "en") {
  return cleanDescription(locale === "zh" ? paper.summaryZh : paper.summaryEn);
}

function formatDate(value: string | null, locale: "zh" | "en") {
  if (!value) return locale === "zh" ? "日期未提供" : "Date unavailable";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function horizonLabel(horizon: SharePaper["horizon"], locale: "zh" | "en") {
  if (locale === "zh") return horizon === "days" ? "近 14 天" : horizon === "months" ? "近 6 个月" : "近 5 年";
  return horizon === "days" ? "Past 14 days" : horizon === "months" ? "Past 6 months" : "Past 5 years";
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { token } = await params;
  const snapshot = await getShareSnapshot(token);
  if (!snapshot) return { title: "Snapshot not found · Pi Research", robots: { index: false, follow: false } };
  const description = snapshot.kind === "daily"
    ? snapshot.locale === "zh"
      ? `${snapshot.payload.spaceName} 的 ${snapshot.payload.papers.length} 篇今日研究推荐，包含论文介绍、适读理由和原文链接。`
      : `${snapshot.payload.papers.length} research recommendations for ${snapshot.payload.spaceName}, with briefs, reading rationales, and original links.`
    : paperDescription(snapshot.payload.papers[0], snapshot.locale);
  return {
    title: snapshot.title,
    description,
    openGraph: { title: snapshot.title, description, type: "article", images: [] },
    twitter: { card: "summary", title: snapshot.title, description, images: [] },
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const snapshot = await getShareSnapshot(token);
  if (!snapshot) notFound();
  const { locale, payload } = snapshot;
  const originalLink = (paper: SharePaper) => paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : "#");

  return (
    <main className="share-page">
      <div className="share-shell">
        <header className="share-header">
          <Link className="share-brand" href="/"><span className="share-product-mark"><Image src="/pi-research-mark.png" width={40} height={34} alt="Pi Research logo" /></span><span><strong>Pi Research</strong><small>RESEARCH SNAPSHOT</small></span></Link>
          <ShareActions title={snapshot.title} locale={locale} />
        </header>

        <section className="share-intro">
          <p>{payload.kind === "daily" ? (locale === "zh" ? "今日推荐快照" : "TODAY'S RESEARCH PICKS") : (locale === "zh" ? "单篇论文快照" : "PAPER SNAPSHOT")}</p>
          <h1>{payload.kind === "daily" ? snapshot.title : payload.papers[0].title}</h1>
          <div><span>{payload.spaceName}</span><i /> <span>{formatDate(payload.createdAt, locale)}</span><i /> <span>{payload.papers.length} {locale === "zh" ? "篇推荐" : payload.papers.length === 1 ? "recommendation" : "recommendations"}</span></div>
          <small>{locale === "zh" ? "内容已在创建时冻结；论文链接仍可直接打开。" : "Content was frozen when shared; original paper links remain live."}</small>
        </section>

        <div className="share-paper-list">
          {payload.papers.map((paper, index) => (
            <article className="share-paper" key={paper.id}>
              <div className="share-paper-number">{String(index + 1).padStart(2, "0")}</div>
              <div className="share-paper-body">
                <div className="share-badges"><span>{horizonLabel(paper.horizon, locale)}</span>{paper.priorityVenue && <span className="priority">◆ {locale === "zh" ? "重点来源" : "Priority venue"}</span>}<span>Pi · DeepSeek Pro</span></div>
                <h2>{paper.title}</h2>
                <p className="share-meta">{[paper.authors, paper.venue, formatDate(paper.publishedAt, locale)].filter(Boolean).join(" · ")}</p>
                <section><h3>{locale === "zh" ? "论文介绍" : "Paper introduction"}</h3><p>{locale === "zh" ? paper.summaryZh : paper.summaryEn}</p></section>
                <section className="share-why"><h3>{locale === "zh" ? "为什么适合读" : "Why it is worth reading"}</h3><p>{locale === "zh" ? paper.whyReadZh : paper.whyReadEn}</p></section>
                <footer>
                  <div><span>{locale === "zh" ? "相关分" : "Relevance"} <b>{paper.relevanceScore}</b></span><span>{locale === "zh" ? "推荐分" : "Score"} <b>{paper.qualityScore}</b></span><span>{locale === "zh" ? "引用" : "Citations"} <b>{paper.citationCount}</b></span></div>
                  <a href={originalLink(paper)} target="_blank" rel="noreferrer">{locale === "zh" ? "打开原文" : "Open original"} ↗</a>
                </footer>
              </div>
            </article>
          ))}
        </div>

        <footer className="share-page-footer"><span className="share-footer-mark"><Image src="/pi-research-mark.png" width={30} height={25} alt="" /></span><p>{locale === "zh" ? "由 Pi Research 生成的研究推荐快照" : "A research recommendation snapshot by Pi Research"}</p><span className="share-team-mark"><small>BY</small><Image src="/pi-lab-logo.png" width={94} height={30} alt="P&amp;I Lab" /></span><Link href="/">{locale === "zh" ? "打开 Pi Research" : "Open Pi Research"} →</Link></footer>
      </div>
    </main>
  );
}
