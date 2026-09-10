import type { ResearchTrack } from "../../lib/research-map";
import { currentRouteStatements, routeMaterialState } from "../../lib/route-material-state";
import { MathText } from "./math-text";
import "./route-start.css";

type Synthesis = { status: string; stale: boolean; statements: Array<{ id: string; kind: string; titleZh: string; titleEn: string; textZh: string; textEn: string; sourcePaperIds: string[]; sources: Array<{ paperId: string; title: string; evidenceQuote: string; evidenceLevel: string; sourceUrl: string }> }> };
const href = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;

export function RouteStart({ track, synthesis, loading, failed, locale, onEvidence, onMaterials, onSynthesis, onPaperOpen }: {
  track: ResearchTrack; synthesis: Synthesis | null; loading: boolean; failed: boolean; locale: "zh" | "en";
  onEvidence: () => void; onMaterials: () => void; onSynthesis: () => void; onPaperOpen: () => void;
}) {
  const zh = locale === "zh";
  const material = routeMaterialState(track);
  const papers = track.papers.filter(paper => material.paperIds.includes(paper.id));
  const statements = currentRouteStatements(synthesis);
  const findings = statements.filter(statement => statement.kind !== "evidence_gap");
  const questions = statements.filter(statement => statement.kind === "evidence_gap");
  const loadingMessage = zh ? (papers.length ? "正在读取已保存的综合判断；上面的论文可以先查看。" : "正在读取已保存的综合状态。") : (papers.length ? "Loading saved findings; the papers above are available now." : "Loading saved synthesis status.");
  const failureMessage = zh ? (papers.length ? "综合判断暂未载入，已有材料仍可查看。" : "综合状态暂未载入，可先查看材料收集进度。") : (papers.length ? "Findings could not be loaded; collected papers remain available." : "Synthesis status could not be loaded; collection progress is available.");
  return <section className="pi-route-start" aria-label={zh ? "当前材料与判断" : "Current materials and findings"}>
    <header><h2>{papers.length ? (zh ? "从已有材料开始" : "Start with collected papers") : (zh ? "这条线索还在收集材料" : "This lead is still collecting material")}</h2><p>{papers.length ? (zh ? `${papers.length} 篇路线材料可查看。收录代表作不等于已经完成研究判断。` : `${papers.length} route papers are available. A collected paper is not a completed research assessment.`) : (zh ? "本空间尚未收录可展示的路线材料。这里暂时是一条待探索线索，不能据此判断学界存在空白。" : "This workspace has no route material to display yet. This is an exploratory lead, not evidence of a gap in the field.")}</p></header>
    {papers.length ? <div className="pi-route-start-papers">{papers.slice(0, 4).map(paper => <article key={paper.id}>
      <small>{paper.provenance === "user_confirmed" ? (zh ? "已确认纳入路线" : "Confirmed in route") : (zh ? "路线收录材料 · 待自行核对" : "Collected route paper · check the source")}</small>
      <h3><MathText>{paper.title}</MathText></h3><p>{[paper.authors, paper.venue].filter(Boolean).join(" · ")}</p>
      {(paper.rationaleZh || paper.rationaleEn) && <details><summary>{zh ? "查看收录理由" : "Why this paper was collected"}</summary><p>{zh ? paper.rationaleZh : paper.rationaleEn}</p></details>}
      {href(paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : "")) ? <a href={href(paper.url || `https://doi.org/${paper.doi}`)} target="_blank" rel="noreferrer" onClick={onPaperOpen}>{zh ? "打开这篇论文" : "Open this paper"} ↗</a> : <span>{zh ? "原文链接待补" : "Source link pending"}</span>}
    </article>)}<button type="button" onClick={onEvidence}>{zh ? "查看全部材料与比较入口" : "All materials and comparison tools"} →</button></div> : <button type="button" onClick={onMaterials}>{zh ? "查看待补材料与候选" : "View pending materials and candidates"} →</button>}
    <section><h2>{zh ? "已有材料支持的判断" : "Findings grounded in current material"}</h2>
      {findings.length ? findings.slice(0, 3).map(item => <article key={item.id}><h3>{zh ? item.titleZh : item.titleEn}</h3><p><MathText>{zh ? item.textZh : item.textEn}</MathText></p><details><summary>{zh ? "核对出处" : "Check sources"}</summary>{item.sources.filter(source => source.evidenceLevel === "abstract" && source.evidenceQuote.trim()).map((source, index) => <blockquote key={`${source.paperId}:${index}`}><p><MathText>{source.evidenceQuote}</MathText></p>{href(source.sourceUrl) ? <a href={href(source.sourceUrl)} target="_blank" rel="noreferrer">{source.title} ↗</a> : <cite>{source.title}</cite>}</blockquote>)}</details></article>) : <p role="status">{loading ? loadingMessage : failed ? failureMessage : synthesis?.stale ? (zh ? "材料已变化，旧判断需要重新核对。" : "The materials changed; previous findings need review.") : (zh ? "本空间尚未形成有来源支持的跨论文判断。这是整理尚未完成，不是已经发现研究空白。" : "No source-backed cross-paper findings are ready in this workspace. This is unfinished synthesis, not an established research gap.")}</p>}
      <button type="button" onClick={onSynthesis}>{zh ? "查看综合状态与下一步" : "Synthesis status and next step"} →</button>
    </section>
    {questions.length > 0 && <section><h2>{zh ? "当前材料留下的待核实问题" : "Questions left by the current material"}</h2><p>{zh ? "这些问题只针对已收录的证据范围，尚不能认定为整个领域未解决的问题。" : "These questions are scoped to collected evidence, not established open problems across the field."}</p>{questions.map(item => <article key={item.id}><h3>{zh ? item.titleZh : item.titleEn}</h3><p>{zh ? item.textZh : item.textEn}</p><button type="button" onClick={onSynthesis}>{zh ? "核对问题依据" : "Check the evidence"} →</button></article>)}</section>}
    <details className="pi-route-start-pending"><summary>{zh ? "系统还需要完成哪些整理" : "What remains to be organized"}</summary><ul>
      <li>{zh ? `待审核候选 ${material.inReviewCount} 篇；待确认纳入 ${material.pendingConfirmationCount} 篇。` : `${material.inReviewCount} candidates in review; ${material.pendingConfirmationCount} awaiting inclusion confirmation.`}</li>
      {material.missingCollectionRoles.length > 0 && <li>{zh ? "尚未收录的材料类别：" : "Unfilled collection categories: "}{material.missingCollectionRoles.map(role => ({ foundation: zh ? "基础材料" : "foundations", milestone: zh ? "关键发展" : "milestones", frontier: zh ? "近期进展" : "recent developments" })[role]).join("、")}。</li>}
    </ul><button type="button" onClick={onMaterials}>{zh ? "查看材料补充状态" : "View collection status"} →</button></details>
  </section>;
}
