"use client";
import type { ResearchTrack, ResearchTrackPaper } from "../../lib/research-map";
import { MathText } from "./math-text";
import "./route-stage-map.css";

export function RouteStageMap({ track, locale, onPaper }: {
  track: ResearchTrack; locale: "zh" | "en"; onPaper: (id: string) => void;
}) {
  const zh = locale === "zh";
  const papers = track.papers.filter(paper => paper.curationStatus !== "deactivated");
  const stages = [
    { role: "foundation", title: zh ? "基础与定义" : "Foundations", description: zh ? "问题从何出发" : "Where the question starts" },
    { role: "milestone", title: zh ? "关键结果与方法" : "Results & methods", description: zh ? "哪些工作推进了问题" : "What advances the question" },
    { role: "frontier", title: zh ? "近期进展" : "Recent developments", description: zh ? "最近新增了什么" : "What has changed recently" },
  ];
  const renderPaper = (paper: ResearchTrackPaper) => {
    const summary = (zh ? paper.summaryZh : paper.summaryEn)?.trim();
    return <article key={paper.id} className="pi-stage-paper">
      {paper.publishedAt && <time dateTime={paper.publishedAt}>{paper.publishedAt.slice(0, 4)}</time>}
      <h4><button type="button" onClick={() => onPaper(paper.id)}><MathText inline>{paper.title}</MathText></button></h4>
      {summary && <p className="pi-stage-contribution"><MathText inline>{summary}</MathText></p>}
    </article>;
  };
  const background = papers.filter(paper => paper.role === "background");
  return <section className="pi-stage-map" aria-label={zh ? "文献脉络" : "Literature overview"}>
    <div className="pi-stage-columns" key={track.id}>{stages.map((stage, index) => {
      const items = papers.filter(paper => paper.role === stage.role).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      return <section key={stage.role}><header><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{stage.title}</h3><p>{stage.description}</p></div><small>{items.length}</small></header>
        {items.length ? items.map(renderPaper) : <p className="pi-stage-empty">{zh ? "尚未收录本阶段材料" : "No material collected for this stage"}</p>}
      </section>;
    })}</div>
    {background.length > 0 && <section className="pi-stage-background" key={`${track.id}:background`}><header><h3>{zh ? "相关方法与背景" : "Related methods & background"}</h3><span>{background.length} {zh ? "篇" : "papers"}</span></header><div>{background.map(renderPaper)}</div></section>}
  </section>;
}
