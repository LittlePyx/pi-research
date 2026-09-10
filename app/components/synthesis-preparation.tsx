import type { synthesisPreparation } from "../../lib/synthesis-preparation";
import { MathText } from "./math-text";

export function SynthesisPreparation({ papers, available, locale, onPaper, onMaterials }: {
  papers: ReturnType<typeof synthesisPreparation>; available: number; locale: "zh" | "en";
  onPaper: (id: string) => void; onMaterials: () => void;
}) {
  const zh = locale === "zh";
  return <section className="pi-synthesis-preparation"><h3>{zh ? "哪些材料可以用于综合" : "Which papers can support synthesis"}</h3>
    <p>{zh ? `目前 ${available} 篇满足条件，需要至少 2 篇。收录代表作、确认用于研究和完成证据整理是不同步骤。` : `${available} papers qualify; at least 2 are needed. Collection, selection for research, and evidence preparation are separate steps.`}</p>
    {papers.length > 0 ? <ul>{papers.map(paper => <li key={paper.id}><strong><MathText>{paper.title}</MathText></strong><p>{paper.state === "ready" ? (zh ? "可用于综合 · 已有可追溯证据" : "Ready · traceable evidence available") : paper.state === "needs_confirmation" ? (zh ? "待你核对是否用于这条路线" : "Review whether to use this paper in the route") : (zh ? "已选用，但可追溯证据尚未准备齐全" : "Selected; traceable evidence is not ready yet")}{paper.state === "needs_confirmation" && !paper.hasGroundedEvidence ? (zh ? "；证据也尚未就绪" : "; evidence is also pending") : ""}</p><button type="button" onClick={() => onPaper(paper.id)}>{zh ? "查看论文与评审，再决定" : "Inspect the paper and review"} →</button></li>)}</ul> : <p>{zh ? "还没有匹配到可核对的论文记录。先查看已收录材料和待补状态。" : "No matching paper records are available. Check collected materials and their status first."}</p>}
    <button type="button" onClick={onMaterials}>{zh ? "查看路线材料" : "View route materials"} →</button>
  </section>;
}
