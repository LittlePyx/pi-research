"use client";
import { useState } from "react";
import type { ResearchTrack, ResearchTrackEdge } from "../../lib/research-map";
import { RouteStageMap } from "./route-stage-map";
import { RouteRelationships } from "./route-relationships";
import "./route-reference-views.css";

export function RouteReferenceViews({ tracks, edges, locale, onPaper, onMaterials }: {
  tracks: ResearchTrack[]; edges: ResearchTrackEdge[]; locale: "zh" | "en";
  onPaper: (id: string) => void; onMaterials: (track: ResearchTrack) => void;
}) {
  const [selected, setSelected] = useState("");
  const [view, setView] = useState<"papers" | "connections">("papers");
  const track = tracks.find(item => item.id === selected) || tracks.find(item => item.userRole === "core") || tracks[0];
  const zh = locale === "zh";
  if (!track) return null;
  return <section className="pi-route-reference" aria-label={zh ? "路线资料" : "Route references"}>
    <header><div className="pi-route-reference-switch" role="group" aria-label={zh ? "浏览内容" : "View"}>
      <button type="button" aria-pressed={view === "papers"} onClick={() => setView("papers")}>{zh ? "文献脉络" : "Literature overview"}</button>
      <button type="button" aria-pressed={view === "connections"} onClick={() => setView("connections")}>{zh ? "方向联系" : "Direction connections"}</button>
    </div><label><span>{zh ? "研究路线" : "Route"}</span><select value={track.id} onChange={event => setSelected(event.target.value)}>{tracks.map(item => <option key={item.id} value={item.id}>{zh ? item.titleZh : item.titleEn}</option>)}</select></label></header>
    <div className="pi-route-reference-context"><p>{zh ? track.summaryZh : track.summaryEn}</p><button type="button" onClick={() => onMaterials(track)}>{zh ? "材料与比较" : "Materials & comparison"} →</button></div>
    {view === "papers" ? <RouteStageMap track={track} locale={locale} onPaper={onPaper} /> : <RouteRelationships track={track} tracks={tracks} edges={edges} locale={locale} onOpen={onMaterials} />}
  </section>;
}
