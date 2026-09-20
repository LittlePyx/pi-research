"use client";
import { useEffect, useState } from "react";
import { workspaceFetch as fetch } from "../../lib/workspace-request";
import type { WorkbookState } from "../../lib/research-workbook";

type Route = { id: string; title: string };
export function MemoryResume({ spaceId, routes, locale, onCompare }: { spaceId: string; routes: Route[]; locale: "zh" | "en"; onCompare: (id: string) => void }) {
  const [selected, setSelected] = useState("");
  const route = routes.find(r => r.id === selected) || routes[0];
  const [result, setResult] = useState<{id:string; workbook:WorkbookState | null; failed:boolean} | null>(null);
  const [retry, setRetry] = useState(0);
  const id = route?.id || "";
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetch(`/api/research-workbook?spaceId=${encodeURIComponent(spaceId)}&trackId=${encodeURIComponent(id)}`, {signal:controller.signal})
      .then(async r => { if (!r.ok) throw Error(); return r.json() as Promise<{workbook:WorkbookState}>; })
      .then(data => { if (!controller.signal.aborted) setResult({id,workbook:data.workbook,failed:false}); })
      .catch(() => { if (!controller.signal.aborted) setResult({id,workbook:null,failed:true}); });
    return () => controller.abort();
  }, [spaceId,id,retry]);
  const zh = locale === "zh";
  if (!route) return <section className="pi-memory-resume"><h2>{zh ? "比较记录" : "Saved comparisons"}</h2><p>{zh ? "还没有可查看的研究路线，可先到研究页建立路线。" : "No research routes yet. Start a route in Research."}</p></section>;
  const current = result?.id === id ? result : null;
  const artifact = current?.workbook?.artifact;
  return <section className="pi-memory-resume">
    <header><h2>{zh ? "比较记录" : "Saved comparisons"}</h2>{routes.length > 1 && <label>{zh ? "研究路线" : "Route"}<select value={id} onChange={e=>setSelected(e.target.value)}>{routes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>}</header>
    <p className="pi-memory-route">{route.title}</p>
    {!current ? <p role="status">{zh ? "正在找回比较记录…" : "Loading saved comparison…"}</p> : current.failed ? <p role="alert">{zh ? "比较记录暂未载入。" : "Comparison unavailable."}<button onClick={()=>setRetry(n=>n+1)}>{zh ? "重试" : "Retry"}</button></p> : artifact ? <>
      <h3>{zh ? "待核对的问题" : "Still unresolved"}</h3><p>{artifact.value.unresolved || (zh ? "上次没有留下待解决问题，可以回到比较记录继续核对。" : "No open question was saved. Revisit the comparison to continue.")}</p>
      {artifact.value.decision && <details><summary>{zh ? "上次的判断" : "Previous judgment"}</summary><p>{artifact.value.decision}</p></details>}
      {current.workbook?.stale && <p>{zh ? "比较依据已变化，请回去核对后再续写。" : "The sources changed; review them before continuing."}</p>}
      <button onClick={()=>onCompare(id)}>{zh ? "回到比较，继续核查" : "Resume comparison"} →</button>
    </> : <p>{zh ? "这条路线还没有比较记录。可在研究页选择材料，开始比较。" : "No saved comparison on this route. Select materials in Research to start one."}</p>}
  </section>;
}
