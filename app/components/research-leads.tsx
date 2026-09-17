"use client";
import { useState } from "react";
import type { ResearchTrack } from "../../lib/research-map";
import { routeMaterialState } from "../../lib/route-material-state";
import { MathText } from "./math-text";
import "./research-workspace.css";

export function ResearchLeads({ tracks, locale, onOpen, onLearn }: {
  tracks: ResearchTrack[]; locale: "zh" | "en";
  onOpen: (track: ResearchTrack) => void; onLearn: (track: ResearchTrack) => void;
}) {
  const zh = locale === "zh";
  const [query, setQuery] = useState("");
  const matching = tracks.filter(track => `${track.titleZh} ${track.titleEn} ${track.summaryZh} ${track.summaryEn}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="pi-research-leads" aria-label={zh ? "研究线索" : "Research leads"}>
    <div className="pi-lead-filter"><input aria-label={zh ? "查找研究线索" : "Find a research lead"} value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? "按方向、方法或问题查找线索" : "Find a direction, method or question"} /><span>{matching.length} {zh ? "条线索" : "leads"}</span>{query && <button type="button" onClick={() => setQuery("")}>{zh ? "清除" : "Clear"}</button>}</div>
    {!matching.length && <p className="v2-monitor-empty">{zh ? "没有匹配的线索，请换一个关键词。" : "No matching leads. Try another keyword."}</p>}
    {(["core", "support", "explore"] as const).map(role => {
      const group = matching.filter(t => t.userRole === role);
      if (!group.length) return null;
      return <section key={role}><header><h2>{role === "core" ? (zh ? "主要研究" : "Main research") : role === "support" ? (zh ? "相关方法与工具" : "Related methods & tools") : (zh ? "待探索线索" : "Exploratory leads")}</h2><span>{group.length}</span></header>
        {group.map(track => {
          const material = routeMaterialState(track);
          const papers = track.papers.filter(p => material.paperIds.includes(p.id));
          return <article key={track.id} className="pi-lead-row">
            <div className="pi-lead-main"><button type="button" onClick={() => onOpen(track)}><h3><MathText inline>{zh ? track.titleZh : track.titleEn}</MathText></h3></button>
              <p>{zh ? track.summaryZh : track.summaryEn}</p>
              <div className="pi-lead-meta"><span>{papers.length} {zh ? "篇收录材料" : "collected papers"}</span>{material.pendingConfirmationCount > 0 && <span>{material.pendingConfirmationCount} {zh ? "篇待你选用" : "awaiting selection"}</span>}{track.monitoringStatus === "paused" && <span>{zh ? "发现已暂停" : "Discovery paused"}</span>}</div>
            </div>
            <div className="pi-lead-reading"><small>{zh ? "从这里开始" : "START HERE"}</small>
              {papers.length ? <p><MathText inline>{papers[0].title}</MathText></p> : <p>{zh ? "尚无可展示的材料，先检查收集进度。" : "No collected paper is available yet. Check collection progress."}</p>}
              <div><button type="button" className="pi-research-primary" onClick={() => onOpen(track)}>{zh ? "进入研究" : "Open research"} →</button>{papers.length > 0 && <button type="button" onClick={() => onLearn(track)}>{zh ? "学习这条路线" : "Study this route"}</button>}</div>
            </div>
          </article>;
        })}
      </section>;
    })}
  </section>;
}
