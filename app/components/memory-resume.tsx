"use client";
import { useState } from "react";
import {workbookResponse} from '../../lib/saved-memory-response';
import {useSavedRead} from './use-saved-read';

type Route = { id: string; title: string };
export function MemoryResume({ spaceId, routes, locale, onCompare }: { spaceId: string; routes: Route[]; locale: "zh" | "en"; onCompare: (id: string) => void }) {
  const [selected, setSelected] = useState("");
  const route = routes.find(r => r.id === selected) || routes[0];
  const id = route?.id || "";
  const read=useSavedRead(JSON.stringify([spaceId,id]),'/api/research-workbook?'+new URLSearchParams({spaceId,trackId:id}),workbookResponse,Boolean(id));
  const zh = locale === "zh";
  if (!route) return <section className="pi-memory-resume"><h2>{zh ? "比较记录" : "Saved comparisons"}</h2><p>{zh ? "还没有可查看的研究路线，可先到研究页建立路线。" : "No research routes yet. Start a route in Research."}</p></section>;
  const current = read.data;
  const artifact = current?.workbook?.artifact;
  return <section className="pi-memory-resume">
    <header><h2>{zh ? "比较记录" : "Saved comparisons"}</h2>{routes.length > 1 && <label>{zh ? "研究路线" : "Route"}<select value={id} onChange={e=>setSelected(e.target.value)}>{routes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>}{current&&!read.error&&<button className="pi-saved-refresh" type="button" disabled={read.loading} onClick={read.reload}>{read.loading?(zh?'载入中…':'Loading…'):(zh?'重新载入':'Reload')}</button>}</header>
    <p className="pi-memory-route">{route.title}</p>
    {read.loading && <p role="status">{artifact?(zh?'正在更新比较记录，先保留上次载入的内容…':'Updating comparison; previously loaded content remains below…'):(zh ? "正在找回比较记录…" : "Loading saved comparison…")}</p>}
    {read.error && <div className="pi-saved-read-error" role="alert"><p>{read.error==='access'||read.error==='missing'?(zh?'当前空间或路线暂不可访问，请核对工作区。':'This workspace or route cannot be accessed. Check your workspace.'):artifact?(zh?'本次读取未完成，已载入的比较记录仍保留。':'This read did not finish. Previously loaded comparison is retained.'):(zh ? "比较记录暂未载入，可以重试。" : "Comparison unavailable. Retry when ready.")}</p><button type="button" disabled={read.loading} onClick={read.reload}>{zh ? "重试" : "Retry"}</button></div>}
    {artifact ? <>
      <h3>{zh ? "待核对的问题" : "Still unresolved"}</h3><p>{artifact.value.unresolved || (zh ? "上次没有留下待解决问题，可以回到比较记录继续核对。" : "No open question was saved. Revisit the comparison to continue.")}</p>
      {artifact.value.decision && <details><summary>{zh ? "上次的判断" : "Previous judgment"}</summary><p>{artifact.value.decision}</p></details>}
      {current.workbook?.stale && <p>{zh ? "比较依据已变化，请回去核对后再续写。" : "The sources changed; review them before continuing."}</p>}
      <button onClick={()=>onCompare(id)}>{zh ? "回到比较，继续核查" : "Resume comparison"} →</button>
    </> : current&&!read.loading&&!read.error&&<p>{zh ? "这条路线还没有比较记录。可在研究页选择材料，开始比较。" : "No saved comparison on this route. Select materials in Research to start one."}</p>}
  </section>;
}
