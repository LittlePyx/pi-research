"use client";
import { useState } from "react";
import type { ResearchTrack, ResearchTrackEdge } from "../../lib/research-map";
import { MathText } from "./math-text";
import "./route-overview.css";

export function RouteRelationships({ tracks, edges, locale, onOpen }: {
  tracks: ResearchTrack[]; edges: ResearchTrackEdge[]; locale: "zh" | "en";
  onOpen: (track: ResearchTrack) => void;
}) {
  const [selected, setSelected] = useState("");
  const zh = locale === "zh";
  const track = tracks.find(item => item.id === selected) || tracks.find(item => item.userRole === "core") || tracks[0];
  if (!track) return null;
  const title = (item: ResearchTrack) => zh ? item.titleZh : item.titleEn;
  const related = edges.flatMap(edge => {
    if (edge.sourceTrackId !== track.id && edge.targetTrackId !== track.id) return [];
    const source = tracks.find(item => item.id === edge.sourceTrackId);
    const target = tracks.find(item => item.id === edge.targetTrackId);
    return source && target && source.id !== target.id ? [{ edge, source, target, other: source.id === track.id ? target : source }] : [];
  });
  const kinds = { builds_on: zh ? "发展承接" : "Builds on", supports: zh ? "方法支撑" : "Method support", bridges: zh ? "交叉联系" : "Bridge" };
  return <div className="pi-route-connections">
    <div className="pi-route-connections-toolbar"><label>{zh ? "从这个方向出发" : "Start from"}<select value={track.id} onChange={event => setSelected(event.target.value)}>{tracks.map(item => <option value={item.id} key={item.id}>{title(item)}</option>)}</select></label>
      <span>{zh ? "Pi 提出的联系，供研究参考；尚非论文引用证据。" : "Pi-inferred connections for exploration, not verified citations."}</span></div>
    <div aria-live="polite">
      {related.length ? related.map(({ edge, source, target, other }) => <article key={edge.id}>
        <small>{kinds[edge.kind]}</small><div><h3><MathText inline>{title(other)}</MathText></h3>
          <p>{(zh ? edge.relationshipZh : edge.relationshipEn) || (zh ? "可进入两条路线，对照各自材料判断是否值得联读。" : "Compare both routes’ materials to assess the connection.")}</p>
          <details><summary>{zh ? "联系方向与核对入口" : "Direction and source materials"}</summary><p><MathText inline>{title(source)}</MathText> {edge.kind === "bridges" ? "↔" : "→"} <MathText inline>{title(target)}</MathText></p>
            <p>{zh ? "这段解释来自路线关系记录。是否构成具体论证，需要对照两侧论文。" : "This explanation comes from the route relationship record. Check both sides’ papers before treating it as a specific argument."}</p>
            <button type="button" onClick={() => onOpen(source)}>{zh ? "查看起点材料" : "Source materials"} →</button><button type="button" onClick={() => onOpen(target)}>{zh ? "查看关联材料" : "Related materials"} →</button>
          </details></div><button type="button" onClick={() => onOpen(other)}>{zh ? "查看路线" : "Open route"} →</button>
      </article>) : <p className="pi-route-connections-empty">{zh ? "这个方向暂时适合独立阅读。可以切换其他方向，或进入路线查看已有材料。" : "Explore this direction independently, or choose another direction to view its connections."}<button type="button" onClick={() => onOpen(track)}>{zh ? "进入路线" : "Open route"} →</button></p>}
    </div>
  </div>;
}
