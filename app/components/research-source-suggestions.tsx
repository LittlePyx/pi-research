import { workspaceFetch as fetch } from "../../lib/workspace-request";
import { useEffect, useState } from "react";
import type { ResearchSourcePlan } from "../../lib/research-source-plan";
import { normalizeSourceTitle } from "../../lib/research-source-plan";
type Activity = { key: string; discovered: number; recommended: number; latestAt: string; papers: Array<{ id: string; title: string; recommended: number }> };
type SourceResponse = { plan: ResearchSourcePlan; activity: Activity[] };
export function ResearchSourceSuggestions({ spaceId, locale, selected, onChange, onOpenPaper }: {
  spaceId: string; locale: "zh" | "en"; selected: string[]; onChange: (titles: string[]) => void; onOpenPaper: (id: string) => void;
}) {
  const [data, setData] = useState<SourceResponse | null>(null);
  const [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/research-sources?spaceId=${encodeURIComponent(spaceId)}`, { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error("unavailable"); return r.json() as Promise<SourceResponse>; })
      .then(value => { if (!controller.signal.aborted) { setData(value); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [spaceId, retry]);
  const zh = locale === "zh";
  if (error) return <p role="alert">{zh ? "来源建议暂时未能读取；下方仍可编辑已关注来源。" : "Source suggestions could not load; edit existing sources below."} <button type="button" onClick={() => setRetry(x => x + 1)}>{zh ? "重试" : "Retry"}</button></p>;
  if (!data) return <p role="status">{zh ? "正在读取领域建议与近期发现…" : "Loading source suggestions and recent discoveries…"}</p>;
  return <section className="pi-source-suggestions">
    <header><div><span>{zh ? "按研究方向建议" : "SUGGESTED FOR YOUR DIRECTION"}</span><h3>{zh ? data.plan.directionZh : data.plan.directionEn}</h3></div><button type="button" onClick={() => onChange(data.plan.defaultVenues)}>{zh ? "将这份建议填入选择" : "Use this suggested selection"}</button></header>
    <p>{data.plan.specificity === "focused" ? (zh ? `根据研究空间中的“${data.plan.matchedTerms.join("、")}”匹配；以下是来源范围与研究问题的对应建议。` : `Matched terms: ${data.plan.matchedTerms.join(", ")}. The source-to-topic fit below is a suggestion.`) : (zh ? "目前匹配到大领域，尚未识别更细的方向；先提供领域默认来源，请按具体问题调整。" : "Only a broad field matched. These are field defaults; adjust them for your specific question.")}</p>
    <p className="pi-source-explainer">{zh ? "重点来源参与后续轮换检索；期刊声誉不能替代论文评审。近30天计数按本空间发现时间，包含其他检索渠道找到的论文。" : "Selected sources enter rotating discovery. Journal reputation does not replace paper review. Counts cover papers discovered in this space over 30 days, including other discovery channels."}</p>
    <div>{data.plan.suggestions.map(source => {
      const key = normalizeSourceTitle(source.title), checked = selected.some(s => normalizeSourceTitle(s) === key);
      const records = data.activity.filter(item => item.key === key);
      const found = records.reduce((n, r) => n + r.discovered, 0), passed = records.reduce((n, r) => n + r.recommended, 0);
      const papers = records.flatMap(r => r.papers).filter((p, i, all) => all.findIndex(other => other.id === p.id) === i).slice(0, 2);
      return <article key={source.title}>
        <label aria-label={source.title}><input type="checkbox" checked={checked} onChange={() => onChange(checked ? selected.filter(s => normalizeSourceTitle(s) !== key) : [...selected, source.title])} /><span><strong>{source.title}</strong><small>{source.role === "core" ? (zh ? "核心来源" : "Core source") : source.role === "support" ? (zh ? "补充来源" : "Supporting source") : (zh ? "领域默认" : "Field default")}{source.authority && ` · ${source.authority}`}</small></span></label>
        <p>{zh ? source.reasonZh : source.reasonEn}</p>
        <div className="pi-source-meta">{source.scopeUrl && <a href={source.scopeUrl} target="_blank" rel="noreferrer">{zh ? "官方范围说明" : "Official scope"} ↗</a>}<span>{zh ? `近30天发现 ${found} 篇 · 曾通过推荐 ${passed} 篇` : `30 days: ${found} discovered · ${passed} recommended`}</span></div>
        {papers.length > 0 && <details><summary>{zh ? "查看最近发现（含候选）" : "Recent discoveries (including candidates)"}</summary>{papers.map(p => <button type="button" key={p.id} onClick={() => onOpenPaper(p.id)}>{p.title} →</button>)}</details>}
      </article>;
    })}</div>
    <small>{zh ? `范围说明核对日期：${data.plan.reviewedOn}。勾选只修改当前草稿，保存后生效。` : `Scope references reviewed ${data.plan.reviewedOn}. Selection changes are drafts until saved.`}</small>
  </section>;
}
