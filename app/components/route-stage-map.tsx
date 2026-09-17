"use client";
import { useState } from "react";
import type { ResearchTrack, ResearchTrackPaper } from "../../lib/research-map";
import { MathText } from "./math-text";
import "./route-stage-map.css";

export function RouteStageMap({ tracks, locale, onPaper, onMaterials }: {
  tracks: ResearchTrack[]; locale: "zh" | "en";
  onPaper: (id: string) => void; onMaterials: (track: ResearchTrack) => void;
}) {
  const [selected, setSelected] = useState("");
  const zh = locale === "zh";
  const track = tracks.find(item => item.id === selected) || tracks.find(item => item.userRole === "core") || tracks[0];
  if (!track) return null;
  const papers = track.papers.filter(paper => paper.curationStatus !== "deactivated");
  const stages = [
    { role: "foundation", title: zh ? "基础与定义" : "Foundations", description: zh ? "问题从何出发" : "Where the question starts" },
    { role: "milestone", title: zh ? "关键结果与方法" : "Results & methods", description: zh ? "哪些工作推进了问题" : "What advances the question" },
    { role: "frontier", title: zh ? "近期进展" : "Recent developments", description: zh ? "最近新增了什么" : "What has changed recently" },
  ];
  const renderPaper = (paper: ResearchTrackPaper) => {
    const summary = (zh ? paper.summaryZh : paper.summaryEn)?.trim();
    const rationale = (zh ? paper.rationaleZh : paper.rationaleEn)?.trim();
    return <article key={paper.id} className="pi-stage-paper">
      {paper.publishedAt && <time dateTime={paper.publishedAt}>{paper.publishedAt.slice(0, 4)}</time>}
      <h4><button type="button" onClick={() => onPaper(paper.id)}><MathText inline>{paper.title}</MathText></button></h4>
      {summary && <p className="pi-stage-contribution"><MathText inline>{summary}</MathText></p>}
      <details><summary>{zh ? "为什么放在这里" : "Why this placement"}</summary>
        <p><MathText inline>{rationale || (zh ? "可结合论文摘要与具体结果核对这一定位。" : "Check this placement against the abstract and specific results.")}</MathText></p>
        <small>{zh ? "以上为已保存的路线定位说明，原始摘要与评审记录见论文详情。" : "Saved route rationale; the original abstract and review records are available in the paper details."}</small>
        <button type="button" onClick={() => onPaper(paper.id)}>{zh ? "核对摘要与评审" : "Inspect abstract & review"} →</button>
      </details>
      <button type="button" className="pi-stage-read" onClick={() => onPaper(paper.id)}>{zh ? "阅读论文" : "Read paper"} →</button>
    </article>;
  };
  const background = papers.filter(paper => paper.role === "background");
  return <section className="pi-stage-map" aria-label={zh ? "路线阶段图" : "Route stage map"}>
    <header><label>{zh ? "研究路线" : "Research route"}<select value={track.id} onChange={event => setSelected(event.target.value)}>{tracks.map(item => <option key={item.id} value={item.id}>{zh ? item.titleZh : item.titleEn}</option>)}</select></label>
      <button type="button" onClick={() => onMaterials(track)}>{zh ? "材料与比较" : "Materials & comparison"} →</button>
    </header>
    <p className="pi-stage-scope"><MathText inline>{zh ? track.summaryZh : track.summaryEn}</MathText></p>
    <p className="pi-stage-note">{zh ? "按论文在路线中的作用分组；阶段不等同于发表顺序或引用关系。" : "Grouped by role in the route, not publication order or citation links."}</p>
    <div className="pi-stage-columns" key={track.id}>{stages.map((stage, index) => {
      const items = papers.filter(paper => paper.role === stage.role).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      return <section key={stage.role}><header><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{stage.title}</h3><p>{stage.description}</p></div><small>{items.length}</small></header>
        {items.length ? items.map(renderPaper) : <p className="pi-stage-empty">{zh ? "尚未收录本阶段材料" : "No material collected for this stage"}</p>}
      </section>;
    })}</div>
    {background.length > 0 && <section className="pi-stage-background" key={`${track.id}:background`}><header><h3>{zh ? "相关方法与背景" : "Related methods & background"}</h3><span>{background.length} {zh ? "篇" : "papers"}</span></header><div>{background.map(renderPaper)}</div></section>}
  </section>;
}
