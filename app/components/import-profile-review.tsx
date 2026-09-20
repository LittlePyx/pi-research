import { useState } from "react";
import type { ResearchImportRecord, ResearchProfileAnalysis } from "../../lib/research-profile";

type SignalKey = "subdirections" | "interests" | "knowledge" | "openQuestions" | "exclusions";
export function ImportProfileReview({ draft, locale, disabled, onEdit }: {
  draft: ResearchImportRecord; locale: "zh" | "en"; disabled: boolean;
  onEdit: (update: (analysis: ResearchProfileAnalysis) => ResearchProfileAnalysis) => void;
}) {
  const [section, setSection] = useState("scope");
  const zh = locale === "zh", analysis = draft.analysis;
  const groups: [SignalKey, string, string][] = [["subdirections", "细分方向", "Subdirections"], ["interests", "研究兴趣", "Interests"], ["knowledge", "已有知识与方法", "Knowledge and methods"], ["openQuestions", "开放问题", "Open questions"], ["exclusions", "不关注的范围", "Excluded scope"]];
  return <div className="pi-import-review">
    <nav className="pi-dialog-nav" aria-label={zh ? "审阅内容" : "Review sections"}>
      {[["scope", "研究范围", "Research scope"], ["opportunities", "后续方向", "Next directions"], ["sources", "资料依据", "Sources"]].map(([id, cn, en]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>{zh ? cn : en}</button>)}
    </nav>
    <fieldset disabled={disabled} className="pi-review-fields">
      {section === "scope" && <div>
        <label><span>{zh ? "主要方向" : "Primary direction"}</span><input value={zh ? analysis.primaryDirectionZh : analysis.primaryDirectionEn} onChange={e => onEdit(a => ({ ...a, [zh ? "primaryDirectionZh" : "primaryDirectionEn"]: e.target.value }))} /></label>
        <label><span>{zh ? "研究概述" : "Research summary"}</span><textarea rows={3} value={zh ? analysis.summaryZh : analysis.summaryEn} onChange={e => onEdit(a => ({ ...a, [zh ? "summaryZh" : "summaryEn"]: e.target.value }))} /></label>
        {groups.map(([key, cn, en]) => analysis[key].length > 0 && <section key={key} className="pi-review-section"><h3>{zh ? cn : en}</h3>{analysis[key].map((item, index) => <article className="pi-review-row" key={index}><div><label><span className="sr-only">{zh ? cn : en} {index + 1}</span><input value={zh ? item.labelZh : item.labelEn} onChange={e => onEdit(a => ({ ...a, [key]: a[key].map((signal, i) => i === index ? { ...signal, [zh ? "labelZh" : "labelEn"]: e.target.value } : signal) }))} /></label>{(zh ? item.evidenceZh : item.evidenceEn) && <p className="pi-review-evidence">{zh ? item.evidenceZh : item.evidenceEn}</p>}</div><button type="button" aria-label={`${zh ? "移除" : "Remove"} ${zh ? item.labelZh : item.labelEn}`} onClick={() => onEdit(a => ({ ...a, [key]: a[key].filter((_, i) => i !== index) }))}>{zh ? "移除" : "Remove"}</button></article>)}</section>)}
      </div>}
      {section === "opportunities" && <section className="pi-review-section"><h3>{zh ? "建议继续探索的方向" : "Suggested directions to explore"}</h3><p>{zh ? "这些是资料归纳出的研究建议，确认后加入当前空间。" : "These suggestions are inferred from your materials and added to this space after confirmation."}</p>{analysis.researchOpportunities.map((item, index) => <article className="pi-review-row" key={index}><div><label><span className="sr-only">{zh ? "方向" : "Direction"} {index + 1}</span><input value={zh ? item.titleZh : item.titleEn} onChange={e => onEdit(a => ({ ...a, researchOpportunities: a.researchOpportunities.map((o, i) => i === index ? { ...o, [zh ? "titleZh" : "titleEn"]: e.target.value } : o) }))} /></label><p>{zh ? item.rationaleZh : item.rationaleEn}</p><ul>{(zh ? item.startingPointsZh : item.startingPointsEn).map((point, i) => <li key={i}>{point}</li>)}</ul>{item.evidenceFiles.length > 0 && <p className="pi-review-evidence">{zh ? "依据：" : "Sources: "}{item.evidenceFiles.join(" · ")}</p>}</div><button type="button" aria-label={`${zh ? "移除" : "Remove"} ${zh ? item.titleZh : item.titleEn}`} onClick={() => onEdit(a => ({ ...a, researchOpportunities: a.researchOpportunities.filter((_, i) => i !== index) }))}>{zh ? "移除" : "Remove"}</button></article>)}{!analysis.researchOpportunities.length && <p role="status">{zh ? "没有保留的后续方向。当前草稿需要至少一个方向才能确认；也可以放弃草稿后重新导入。" : "No directions remain. At least one is required to confirm; you can also discard this draft and import again."}</p>}</section>}
      {section === "sources" && <section className="pi-review-section"><h3>{zh ? "资料使用情况" : "How materials were used"}</h3>{analysis.sourceAssessments.map((source, i) => <article className="pi-review-source" key={i}><div><strong>{source.fileName}</strong><p>{zh ? source.reasonZh : source.reasonEn}</p></div><span>{source.used ? (zh ? "已采用" : "Used") : (zh ? "未采用" : "Not used")}</span></article>)}<label><span>{zh ? "检索词（每行一个）" : "Search terms (one per line)"}</span><textarea rows={3} value={analysis.searchTerms.join("\n")} onChange={e => onEdit(a => ({ ...a, searchTerms: e.target.value.split("\n") }))} /></label><label><span>{zh ? "作者与期刊线索（每行一个）" : "Author and venue leads (one per line)"}</span><textarea rows={3} value={analysis.authorsVenues.join("\n")} onChange={e => onEdit(a => ({ ...a, authorsVenues: e.target.value.split("\n") }))} /></label><p className="pi-review-evidence">{draft.fileNames.join(" · ")}</p></section>}
    </fieldset>
  </div>;
}
