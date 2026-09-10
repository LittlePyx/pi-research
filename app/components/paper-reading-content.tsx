import { useEffect, useState } from "react";
import { MathText } from "./math-text";
import "./paper-reading.css";

type ReadingResponse = { paper?: { abstractText?: string }; recovery?: { status: string; source_url: string; retry_at: number } | null };

export function PaperReadingContent({ spaceId, paperId, locale, stage, reason }: {
  spaceId: string; paperId: string; locale: "zh" | "en"; stage: string; reason: string;
}) {
  const [abstract, setAbstract] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [recovery, setRecovery] = useState<{ status: string; source_url: string; retry_at: number } | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let cancelled = false;
    const timer = setTimeout(() => controller.abort(), 35000);
    void (async () => {
      const response = await fetch(`/api/paper-reading?spaceId=${encodeURIComponent(spaceId)}&paperId=${encodeURIComponent(paperId)}`, { signal: controller.signal });
      if (!response.ok) throw new Error("read_failed");
      let data = await response.json() as ReadingResponse;
      if (cancelled) return;
      setAbstract(data.paper?.abstractText || ""); setRecovery(data.recovery || null);
      if ((data.paper?.abstractText || "").trim().length < 120 && (!data.recovery?.retry_at || data.recovery.retry_at <= Date.now())) {
        setSearching(true);
        const recovered = await fetch("/api/paper-reading", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spaceId, paperId }), signal: controller.signal });
        if (!recovered.ok) throw new Error("recovery_failed");
        data = await recovered.json() as ReadingResponse;
        if (!cancelled) { setAbstract(data.paper?.abstractText || ""); setRecovery(data.recovery || null); }
      }
    })().catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { clearTimeout(timer); if (!cancelled) setSearching(false); });
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [spaceId, paperId, attempt]);
  const zh = locale === "zh";
  const awaitingAbstract = stage === "awaiting_evidence" || (stage === "reviewed" && reason.includes("Abstract evidence unavailable after bounded enrichment"));
  return <>
    <section className="pi-paper-abstract"><h2>{zh ? "论文摘要" : "Abstract"}</h2>
      {abstract ? <p><MathText>{abstract}</MathText></p> : <p className="pi-paper-muted" role="status">{searching || recovery?.status === "searching" ? (zh ? "正在查找可核验摘要…" : "Looking for a verifiable abstract…") : recovery?.status === "source_error" ? (zh ? "摘要来源暂时无法访问，将按退避时间重试。" : "Abstract sources are temporarily unavailable; retries respect the source cooldown.") : recovery?.status === "not_found" ? (zh ? "已核对可访问来源，暂未找到匹配摘要。" : "No matching abstract was found in the accessible sources.") : failed ? (zh ? "摘要暂未载入。" : "The abstract could not be loaded.") : abstract === null ? (zh ? "正在读取已保存摘要…" : "Loading the saved abstract…") : (zh ? "当前记录没有摘要，可通过上方原文入口查看。" : "No abstract is saved. Use the source link above to read the paper.")}</p>}
      {recovery?.source_url && /^https?:\/\//.test(recovery.source_url) && <a href={recovery.source_url} target="_blank" rel="noreferrer">{zh ? "摘要出处" : "Abstract source"} ↗</a>}
      {recovery?.retry_at ? <p className="pi-paper-muted">{zh ? "下次可重试：" : "Retry after: "}{new Date(recovery.retry_at).toLocaleString(zh ? "zh-CN" : "en-US")}</p> : null}
      {(failed || (!searching && abstract !== null && abstract.trim().length < 120)) && <button type="button" onClick={() => { setAbstract(null); setFailed(false); setAttempt(value => value + 1); }}>{zh ? "重试读取" : "Retry"}</button>}
    </section>
    {stage !== "recommended" && <section className="pi-paper-review"><h2>{zh ? "评审情况" : "Review status"}</h2>
      <p>{awaitingAbstract ? (abstract && abstract.trim().length >= 120 ? (zh ? "摘要已补到，等待重新评审" : "Abstract recovered; awaiting review") : (zh ? "材料不足，暂无法完成评审" : "Materials incomplete; review cannot finish yet")) : stage === "reviewed" ? (zh ? "未通过本空间的推荐评审" : "Not selected for this workspace") : stage === "reviewing" ? (zh ? "正在核对评审结果" : "Review results are being checked") : stage === "queued" ? (zh ? "等待质量评审" : "Awaiting quality review") : (zh ? "尚未形成推荐评审结果" : "No recommendation review result yet")}</p>
      {reason ? <div><small>{zh ? "已保存的评审记录" : "SAVED REVIEW RECORD"}</small><p><MathText>{reason}</MathText></p></div> : <p className="pi-paper-muted">{zh ? "当前记录未提供具体评审原因。" : "No specific review reason is available in this record."}</p>}
    </section>}
  </>;
}
