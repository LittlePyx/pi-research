"use client";
import type { ResearchTrack, ResearchTrackEdge } from "../../lib/research-map";
import { MathText } from "./math-text";
import "./route-overview.css";

export function RouteRelationships({ track, tracks, edges, locale, onOpen }: {
  track: ResearchTrack; tracks: ResearchTrack[]; edges: ResearchTrackEdge[]; locale: "zh" | "en";
  onOpen: (track: ResearchTrack) => void;
}) {
  const zh = locale === "zh";
  const title = (item: ResearchTrack) => zh ? item.titleZh : item.titleEn;
  const related = edges.flatMap(edge => {
    if (edge.sourceTrackId !== track.id && edge.targetTrackId !== track.id) return [];
    const source = tracks.find(item => item.id === edge.sourceTrackId);
    const target = tracks.find(item => item.id === edge.targetTrackId);
    return source && target && source.id !== target.id ? [{ edge, source, target, other: source.id === track.id ? target : source }] : [];
  });
  const kinds = { builds_on: zh ? "发展承接" : "Builds on", supports: zh ? "方法支撑" : "Method support", bridges: zh ? "交叉联系" : "Bridge" };
  return <div className="pi-route-connections">
    <p className="pi-connections-note">{zh ? "Pi 提出的方向联系，供研究参考，不代表论文引用关系。" : "Pi-inferred connections for exploration, not verified citations."}</p>
    <div aria-live="polite">
      {related.length ? related.map(({ edge, other }) => <article key={edge.id}>
        <small>{kinds[edge.kind]}</small><div><h3><MathText inline>{title(other)}</MathText></h3>
          <p>{(zh ? edge.relationshipZh : edge.relationshipEn) || (zh ? "可进入两条路线，对照各自材料判断是否值得联读。" : "Compare both routes’ materials to assess the connection.")}</p>
          </div><button type="button" onClick={() => onOpen(other)}>{zh ? "查看路线" : "Open route"} →</button>
      </article>) : <p className="pi-route-connections-empty">{zh ? "这个方向暂时适合独立阅读。可以切换其他方向，或进入路线查看已有材料。" : "Explore this direction independently, or choose another direction to view its connections."}<button type="button" onClick={() => onOpen(track)}>{zh ? "进入路线" : "Open route"} →</button></p>}
    </div>
  </div>;
}
