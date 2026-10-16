import type { ResearchTrack } from "../../lib/research-map";
import { currentRouteStatements, routeMaterialState } from "../../lib/route-material-state";
import { MathText } from "./math-text";
import { InterfaceIcon } from "./interface-icon";
import "./route-start.css";

type Synthesis = { status: string; stale: boolean; statements: Array<{ id: string; kind: string; titleZh: string; titleEn: string; textZh: string; textEn: string; sourcePaperIds: string[]; sources: Array<{ paperId: string; title: string; evidenceQuote: string; evidenceLevel: string; sourceUrl: string }> }> };
const href = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;

export function RouteStart({ track, synthesis, loading, failed, locale, onEvidence, onMaterials, onSynthesis, onPaperOpen, onRead, onCompare, onProblem, onLearn, question }: {
  track: ResearchTrack; synthesis: Synthesis | null; loading: boolean; failed: boolean; locale: "zh" | "en";
  onEvidence: () => void; onMaterials: () => void; onSynthesis: () => void; onPaperOpen: () => void;
  onRead?: (id:string)=>void;
  onCompare: () => void; onProblem: () => void; onLearn: () => void; question?: string;
}) {
  const zh = locale === "zh";
  const material = routeMaterialState(track);
  const papers = track.papers.filter(paper => material.paperIds.includes(paper.id));
  const statements = currentRouteStatements(synthesis);
  const findings = statements.filter(statement => statement.kind !== "evidence_gap");
  const questions = statements.filter(statement => statement.kind === "evidence_gap");
  const loadingMessage = zh ? "正在读取已保存的判断，材料可以先阅读。" : "Loading saved findings. You can read the papers now.";
  const failureMessage = zh ? "判断暂未载入，已有材料仍可阅读。" : "Findings could not load. Collected papers remain available.";
  return <section className="pi-route-start" aria-label={zh ? "当前材料与判断" : "Current materials and findings"}>
    <div className="pi-route-entry">
      <span className="pi-route-entry-icon"><InterfaceIcon name={findings.length ? "question" : "synthesis"} /></span>
      <div><small>{zh ? "继续这项研究" : "CONTINUE YOUR RESEARCH"}</small>
        <h2>{findings.length ? (zh ? "带着已有判断，推进下一个问题" : "Turn findings into your next question") : papers.length >= 2 ? (zh ? "比较条件，再形成判断" : "Compare conditions. Build your judgment.") : (zh ? "从一篇论文开始" : "Start with a paper")}</h2>
        <p>{zh ? "阅读材料、核对依据，把结论留在这条路线。" : "Read the sources, check the evidence and keep your conclusions here."}</p>
      </div>
      <button type="button" className="pi-research-primary" onClick={findings.length ? onProblem : papers.length >= 2 ? onCompare : onEvidence}>{findings.length ? (zh ? "研究问题与任务" : "Question & tasks") : papers.length >= 2 ? (zh ? "选择论文开始比较" : "Select papers to compare") : (zh ? "查看材料" : "View materials")} <span aria-hidden="true">→</span></button>
    </div>
    {question && <section className="pi-route-working-question"><small>{zh ? "当前研究问题" : "CURRENT QUESTION"}</small><h2><MathText>{question}</MathText></h2><button type="button" onClick={onProblem}>{zh ? "查看依据与下一步任务" : "Evidence and next actions"} →</button></section>}
    <div className="pi-route-overview-columns">
      <section className="pi-route-material-preview">
        <header className="pi-route-section-heading"><div><h2>{zh ? "路线材料" : "Route materials"} <span>{papers.length}</span></h2><p>{papers.length ? (zh ? "选一篇开始阅读，或查看全部材料。" : "Pick a paper to read, or explore the full collection.") : (zh ? "尚未收录材料，不代表相关研究不存在。" : "No materials collected yet; relevant research may exist.")}</p></div><button type="button" onClick={onEvidence}>{zh ? "查看全部" : "View all"} →</button></header>
        {papers.length ? <div className="pi-route-start-papers">{papers.slice(0, 4).map((paper,index) => {
          const sourceUrl=href(paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : ""));
          return <article key={paper.id}>
            <span className="pi-route-paper-index" aria-hidden="true">{String(index+1).padStart(2,"0")}</span>
            <div className="pi-route-paper-content">
              <div className="pi-route-paper-meta"><small>{paper.venue || (zh ? "研究论文" : "Research paper")}{paper.publishedAt ? ` · ${paper.publishedAt.slice(0,4)}` : ""}</small><span className="pi-route-paper-state">{paper.provenance === "user_confirmed" ? (zh ? "已确认纳入" : "Confirmed") : (zh ? "收录待核对" : "Collected · to check")}</span></div>
              <h3>{onRead ? <button type="button" className="pi-route-paper-title" onClick={()=>onRead(paper.id)}><MathText inline>{paper.title}</MathText></button> : <MathText inline>{paper.title}</MathText>}</h3>
              <p className="pi-route-paper-authors" title={paper.authors}>{paper.authors}</p>
              <div className="pi-route-paper-actions">{onRead && <button type="button" onClick={()=>onRead(paper.id)}><InterfaceIcon name="reading" />{zh ? "阅读与笔记" : "Read & take notes"}</button>}{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" onClick={onPaperOpen}>{zh ? "原文" : "Original"} ↗</a> : <span>{zh ? "原文链接待补" : "Source link pending"}</span>}</div>
              {(paper.rationaleZh || paper.rationaleEn) && <details><summary>{zh ? "为什么收录这篇" : "Why this paper"}</summary><p>{zh ? paper.rationaleZh : paper.rationaleEn}</p></details>}
            </div>
          </article>;
        })}</div> : <div className="pi-route-empty-state"><InterfaceIcon name="document" /><h3>{zh ? "为这条线索收集第一批材料" : "Collect the first papers for this lead"}</h3><p>{zh ? "从待审核候选开始，核对相关性后再选用。" : "Start with pending candidates and check their relevance."}</p><button type="button" onClick={onMaterials}>{zh ? "查看候选材料" : "View candidates"} →</button></div>}
      </section>
      <aside className="pi-route-support" aria-label={zh ? "研究判断与工具" : "Findings and research tools"}>
        <section className="pi-route-findings-preview"><header className="pi-route-section-heading"><h2>{zh ? "研究判断" : "Research findings"}</h2><InterfaceIcon name="notes" /></header>
          {findings.length ? findings.slice(0,3).map(item=><article key={item.id}><h3>{zh ? item.titleZh : item.titleEn}</h3><p><MathText>{zh ? item.textZh : item.textEn}</MathText></p><details><summary>{zh ? "核对出处" : "Check sources"}</summary>{item.sources.filter(source=>source.evidenceLevel==="abstract"&&source.evidenceQuote.trim()).map((source,index)=><blockquote key={`${source.paperId}:${index}`}><p><MathText>{source.evidenceQuote}</MathText></p>{href(source.sourceUrl)?<a href={href(source.sourceUrl)} target="_blank" rel="noreferrer">{source.title} ↗</a>:<cite>{source.title}</cite>}</blockquote>)}</details></article>) : <div className="pi-route-findings-empty"><p role="status">{loading ? loadingMessage : failed ? failureMessage : synthesis?.stale ? (zh ? "材料已变化，已有判断需要重新核对。" : "Materials changed. Previous findings need review.") : (zh ? "还没有有据可查的跨论文判断。读完材料后，从比较中记录你的发现。" : "No source-backed cross-paper findings yet. Read the papers and record what you find in a comparison.")}</p><small>{zh ? "材料整理未完成，不代表领域存在研究空白。" : "Incomplete synthesis does not establish a research gap."}</small></div>}
          <button type="button" onClick={onSynthesis}>{zh ? "查看综合判断" : "View synthesis"} →</button>
        </section>
        <section className="pi-route-tools"><h2>{zh ? "研究工具" : "Research tools"}</h2><button type="button" onClick={onCompare}><InterfaceIcon name="synthesis" /><span><strong>{zh ? "比较记录" : "Comparisons"}</strong><small>{zh ? "条件、依据与保存的判断" : "Conditions, evidence and saved notes"}</small></span><span aria-hidden="true">↗</span></button><button type="button" onClick={onLearn}><InterfaceIcon name="reading" /><span><strong>{zh ? "路线学习" : "Study this route"}</strong><small>{zh ? "需要补充基础时再开始" : "Build foundations when you need them"}</small></span><span aria-hidden="true">↗</span></button></section>
      </aside>
    </div>
    {questions.length>0&&<section className="pi-route-open-questions"><h2>{zh ? "待核实的问题" : "Questions to investigate"}</h2><p>{zh ? "问题限于当前材料范围，尚不能认定为领域未解决问题。" : "Scoped to collected material, not established open problems."}</p>{questions.map(item=><article key={item.id}><h3>{zh ? item.titleZh : item.titleEn}</h3><p>{zh ? item.textZh : item.textEn}</p><button type="button" onClick={onSynthesis}>{zh ? "核对问题依据" : "Check evidence"} →</button></article>)}</section>}
    <details className="pi-route-start-pending"><summary>{zh ? "材料整理进度" : "Collection progress"}<span>{material.inReviewCount+material.pendingConfirmationCount} {zh ? "待处理" : "pending"}</span></summary><ul><li>{zh ? `待审核 ${material.inReviewCount} 篇；待确认纳入 ${material.pendingConfirmationCount} 篇。` : `${material.inReviewCount} in review; ${material.pendingConfirmationCount} awaiting confirmation.`}</li>{material.missingCollectionRoles.length>0&&<li>{zh ? "尚未收录：" : "Not yet collected: "}{material.missingCollectionRoles.map(role=>({foundation:zh?"基础材料":"foundations",milestone:zh?"关键发展":"milestones",frontier:zh?"近期进展":"recent developments"})[role]).join("、")}</li>}</ul><button type="button" onClick={onMaterials}>{zh ? "查看材料补充状态" : "View collection status"} →</button></details>
  </section>;
}