import { PaperReviewRefresh } from "./paper-review-refresh";
import { needsAbstractRecovery, isPossiblyTruncatedAbstract, isAbstractPlaceholder } from "../../lib/abstract-integrity";
import { abstractRecoverySummary } from "../../lib/abstract-recovery-presentation";
import { workspaceFetch as fetch } from "../../lib/workspace-request";
import { useEffect, useState } from "react";
import { MathText } from "./math-text";
import "./paper-reading.css";

type ReadingSummary = { zh: string; en: string; sourceUrl: string; kind: "overview" | "abstract-summary" };
type ReadingResponse = { paper?: { abstractText?: string; analysisSource?: string; readingSummary?: ReadingSummary }; recovery?: { status: string; attempted_json?: string; source_url: string; retry_at: number; related?: { abstractText: string; sourceUrl: string; doi: string } | null } | null };

export function PaperReadingContent({ spaceId, paperId, locale, stage, reason, onReviewStage, onReviewUpdated }: {
  spaceId: string; paperId: string; locale: "zh" | "en"; stage: string; reason: string; onReviewStage?: (paperId: string, stage: "queued") => void; onReviewUpdated?: () => Promise<void>;
}) {
  const [abstract, setAbstract] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReadingSummary | null>(null);
  const [reviewCurrent, setReviewCurrent] = useState(false);
  const [limitedEvidence, setLimitedEvidence] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [recovery, setRecovery] = useState<{ status: string; attempted_json?: string; source_url: string; retry_at: number; related?: { abstractText: string; sourceUrl: string; doi: string } | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const [now,setNow]=useState(()=>Date.now());
  const [identity,setIdentity]=useState(`${spaceId}:${paperId}`);
  if(identity!==`${spaceId}:${paperId}`){setIdentity(`${spaceId}:${paperId}`);setAbstract(null);setSummary(null);setRecovery(null);setFailed(false);setLimitedEvidence(false);setReviewCurrent(false);setSearching(false)}
  useEffect(()=>{
    if(!recovery?.retry_at)return;
    const timer=setTimeout(()=>setNow(Date.now()),Math.max(0,Math.min(2147483647,recovery.retry_at-Date.now()+50)));
    return()=>clearTimeout(timer);
  },[recovery?.retry_at]);
  useEffect(() => {
    const controller = new AbortController(); let cancelled = false;
    const timer = setTimeout(() => controller.abort(), 35000);
    void (async () => {
      const response = await fetch(`/api/paper-reading?spaceId=${encodeURIComponent(spaceId)}&paperId=${encodeURIComponent(paperId)}`, { signal: controller.signal });
      if (!response.ok) throw new Error("read_failed");
      let data = await response.json() as ReadingResponse;
      if (cancelled) return;
      setFailed(false);setNow(Date.now());
      setLimitedEvidence(isPossiblyTruncatedAbstract(data.paper?.abstractText || "") || Boolean(data.recovery?.attempted_json?.includes('"legacy_truncated"')));
      setSummary(data.paper?.readingSummary || null); setAbstract(data.paper?.abstractText || ""); setRecovery(data.recovery || null);
      if (data.paper?.analysisSource === "deepseek_screened") onReviewStage?.(paperId, "queued");
      if (!data.paper?.readingSummary && needsAbstractRecovery(data.paper?.abstractText || "") && (data.recovery?.status !== "found" || isPossiblyTruncatedAbstract(data.paper?.abstractText || "") || isAbstractPlaceholder(data.paper?.abstractText || "")) && (!data.recovery?.retry_at || data.recovery.retry_at <= Date.now())) {
        setSearching(true);
        const recovered = await fetch("/api/paper-reading", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spaceId, paperId }), signal: controller.signal });
        if (!recovered.ok) throw new Error("recovery_failed");
        data = await recovered.json() as ReadingResponse;
        if (!cancelled) { setSummary(data.paper?.readingSummary || null); setAbstract(data.paper?.abstractText || ""); setRecovery(data.recovery || null);
      if (data.paper?.analysisSource === "deepseek_screened") onReviewStage?.(paperId, "queued"); }
      }
    })().catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { clearTimeout(timer); if (!cancelled) setSearching(false); });
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [spaceId, paperId, attempt, onReviewStage]);
  const zh = locale === "zh";
  const placeholder=Boolean(abstract&&isAbstractPlaceholder(abstract)),coolingDown=Boolean(recovery?.retry_at&&recovery.retry_at>now);
  const diagnostics=abstractRecoverySummary(recovery?.attempted_json||'',locale);
  const awaitingAbstract = stage === "awaiting_evidence" || (stage === "reviewed" && reason.includes("Abstract evidence unavailable after bounded enrichment"));
  return <>
    <section className="pi-paper-abstract"><h2>{summary ? (summary.kind === "overview" ? (zh ? "文献简介" : "Paper overview") : (zh ? "摘要概述" : "Abstract summary")) : !placeholder && abstract && needsAbstractRecovery(abstract) && (recovery?.status !== "found" || isPossiblyTruncatedAbstract(abstract)) ? (zh ? "已保存的简介 · 待核对" : "Saved description · needs checking") : (zh ? "论文摘要" : "Abstract")}</h2>
      {summary ? <><p><MathText>{zh ? summary.zh : summary.en}</MathText></p><a href={summary.sourceUrl} target="_blank" rel="noreferrer">{zh ? "查看来源" : "View source"} ↗</a></> : abstract && !placeholder ? <p><MathText>{abstract}</MathText></p> : <p className="pi-paper-muted" role="status">{searching || recovery?.status === "searching" ? (zh ? "正在查找可核验摘要…" : "Looking for a verifiable abstract…") : failed ? (zh ? "摘要读取失败，已保留现有内容，可重试。" : "Reading failed. Saved content is retained; you can retry.") : recovery?.status === "source_error" ? (zh ? "尚未获取原始摘要；部分来源暂不可访问。" : "No source abstract was obtained; some sources are unavailable.") : recovery?.status === "not_found" ? (zh ? "已核对可访问来源，暂未找到匹配摘要。" : "No matching abstract was found in the accessible sources.") : abstract === null ? (zh ? "正在读取已保存摘要…" : "Loading the saved abstract…") : (zh ? "尚未获取可核验的原始摘要，可通过上方原文入口查看。" : "No verifiable source abstract is saved. Use the source link above to read the paper.")}</p>}
      {placeholder&&<details className="pi-paper-saved-description"><summary>{zh?'查看已保存的文献简介':'View saved paper description'}</summary><p className="pi-paper-muted">{zh?'这段内容是旧简介，未核验为原始摘要。':'This is a legacy description, not a verified source abstract.'}</p><p><MathText>{abstract!}</MathText></p></details>}
      {limitedEvidence && !reviewCurrent && <p className="pi-paper-muted" role="status">{zh ? "原摘要可能被截断。已保存的评审可能遗漏适用范围，请结合补齐的摘要与原文核对。" : "The earlier abstract may have been truncated. Saved reviews may omit scope; check against the recovered abstract and source."}</p>}
      {abstract && !placeholder && searching && <p className="pi-paper-muted" role="status">{zh ? "正在查找更完整的摘要与出处…" : "Checking for a fuller abstract and its source…"}</p>}
      {abstract && !placeholder && !searching && !recovery?.related && (failed || recovery?.status === "source_error" || recovery?.status === "not_found") && <p className="pi-paper-muted" role="status">{failed || recovery?.status === "source_error" ? (zh ? "更完整摘要的来源暂时无法访问，已保留当前简介。" : "Sources for a fuller abstract are unavailable. The saved description is retained.") : (zh ? "暂未找到更完整的匹配摘要，已保留当前简介。" : "No fuller matching abstract was found. The saved description is retained.")}</p>}
      {!summary&&diagnostics&&(!abstract||placeholder||recovery?.status!=='found')&&<p className="pi-paper-source-status">{diagnostics}</p>}
      {recovery?.related && <section className="pi-related-abstract"><h3>{zh ? "找到另一 DOI 版本的摘要" : "Abstract found under another DOI"}</h3><p className="pi-paper-muted">{zh ? "题名及全部作者一致，但 DOI 不同。以下摘要单独提供核对，尚未用于这条记录的评审。" : "The title and all authors match, but the DOI differs. This abstract is provided separately and has not been used to review this record."}</p><p><MathText>{recovery.related.abstractText}</MathText></p><a href={recovery.related.sourceUrl} target="_blank" rel="noreferrer">{zh ? "核对摘要出处" : "Check abstract source"} · {recovery.related.doi} ↗</a></section>}
      {recovery?.source_url && /^https?:\/\//.test(recovery.source_url) && <a href={recovery.source_url} target="_blank" rel="noreferrer">{zh ? "摘要出处" : "Abstract source"} ↗</a>}
      {!summary&&(failed||(!searching&&abstract!==null&&needsAbstractRecovery(abstract)&&(recovery?.status!=='found'||isPossiblyTruncatedAbstract(abstract)||placeholder)))&&<div className="pi-paper-abstract-actions"><button type="button" disabled={searching||(coolingDown&&!failed)} onClick={()=>{setFailed(false);setSearching(true);setAttempt(value=>value+1)}}>{searching?(zh?'正在读取…':'Reading…'):coolingDown&&!failed?(zh?'等待来源恢复':'Waiting for sources'):(zh?'重试读取':'Retry')}</button>{coolingDown&&<span>{zh?'可重试时间：':'Retry after: '}{new Date(recovery!.retry_at).toLocaleString(zh?'zh-CN':'en-US')}</span>}</div>}
    </section>
    {!summary && onReviewUpdated && <PaperReviewRefresh key={`${spaceId}:${paperId}:${abstract?.length || 0}`} spaceId={spaceId} paperId={paperId} locale={locale} onUpdated={onReviewUpdated} onReady={setReviewCurrent} />}
    {!summary && stage !== "recommended" && <section className="pi-paper-review"><h2>{zh ? "评审情况" : "Review status"}</h2>
      <p>{awaitingAbstract ? (abstract && !placeholder && abstract.trim().length >= 120 ? (zh ? "摘要已补到，等待重新评审" : "Abstract recovered; awaiting review") : (zh ? "材料不足，暂无法完成评审" : "Materials incomplete; review cannot finish yet")) : stage === "reviewed" ? (zh ? "未通过本空间的推荐评审" : "Not selected for this workspace") : stage === "reviewing" ? (zh ? "正在核对评审结果" : "Review results are being checked") : stage === "queued" ? (zh ? "等待质量评审" : "Awaiting quality review") : (zh ? "尚未形成推荐评审结果" : "No recommendation review result yet")}</p>
      {reason ? <div><small>{zh ? "已保存的评审记录" : "SAVED REVIEW RECORD"}</small><p><MathText>{reason}</MathText></p></div> : <p className="pi-paper-muted">{zh ? "当前记录未提供具体评审原因。" : "No specific review reason is available in this record."}</p>}
    </section>}
  </>;
}
