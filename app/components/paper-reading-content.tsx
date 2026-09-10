import { useEffect, useState } from "react";
import { MathText } from "./math-text";
import "./paper-reading.css";

export function PaperReadingContent({ spaceId, paperId, locale, stage, reason }: {
  spaceId: string; paperId: string; locale: "zh" | "en"; stage: string; reason: string;
}) {
  const [abstract, setAbstract] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let cancelled = false;
    const timer = setTimeout(() => controller.abort(), 15000);
    void fetch(`/api/paper-reading?spaceId=${encodeURIComponent(spaceId)}&paperId=${encodeURIComponent(paperId)}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("read_failed"); return response.json(); })
      .then(data => { if (!cancelled) setAbstract(data.paper.abstractText || ""); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [spaceId, paperId, attempt]);
  const zh = locale === "zh";
  return <>
    <section className="pi-paper-abstract"><h2>{zh ? "论文摘要" : "Abstract"}</h2>
      {abstract ? <p><MathText>{abstract}</MathText></p> : <p className="pi-paper-muted" role="status">{failed ? (zh ? "摘要暂未载入。" : "The abstract could not be loaded.") : abstract === null ? (zh ? "正在读取已保存摘要…" : "Loading the saved abstract…") : (zh ? "当前记录没有摘要，可通过上方原文入口查看。" : "No abstract is saved. Use the source link above to read the paper.")}</p>}
      {failed && <button type="button" onClick={() => { setAbstract(null); setFailed(false); setAttempt(value => value + 1); }}>{zh ? "重试读取" : "Retry"}</button>}
    </section>
    {stage !== "recommended" && <section className="pi-paper-review"><h2>{zh ? "评审情况" : "Review status"}</h2>
      <p>{stage === "reviewed" ? (zh ? "未通过本空间的推荐评审" : "Not selected for this workspace") : stage === "reviewing" ? (zh ? "正在核对评审结果" : "Review results are being checked") : stage === "queued" ? (zh ? "等待质量评审" : "Awaiting quality review") : (zh ? "尚未形成推荐评审结果" : "No recommendation review result yet")}</p>
      {reason ? <div><small>{zh ? "已保存的评审记录" : "SAVED REVIEW RECORD"}</small><p><MathText>{reason}</MathText></p></div> : <p className="pi-paper-muted">{zh ? "当前记录未提供具体评审原因。" : "No specific review reason is available in this record."}</p>}
    </section>}
  </>;
}
