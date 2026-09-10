import { MathText } from "./math-text";
import "./synthesis-reading.css";

type Source = { claimId: string; paperId: string; title: string; authors: string; venue: string; publishedAt: string | null; evidenceQuote: string; locator: string; sourceUrl: string; evidenceLevel: string };
type Statement = { id: string; kind: string; titleZh: string; titleEn: string; textZh: string; textEn: string; confidence: number; sources: Source[] };
type Reading = { questionZh: string; questionEn: string; overviewZh: string; overviewEn: string; changeSummaryZh: string; changeSummaryEn: string; statements: Statement[]; stale: boolean; status: string; sourcePaperCount: number; confidence: number; nextSearchQuery: string; nextSearchSourceStatementId: string | null };

export function SynthesisReading({ synthesis: s, locale, onScanGap }: { synthesis: Reading; locale: "zh" | "en"; onScanGap: () => void }) {
  const zh = locale === "zh";
  const labels: Record<string, string> = zh ? { consensus: "共同结论", disagreement: "分歧", qualification: "适用条件", method_lineage: "方法联系", evidence_gap: "待核实问题" } : { consensus: "Shared findings", disagreement: "Disagreement", qualification: "Conditions", method_lineage: "Method connections", evidence_gap: "Open questions in this material" };
  const next = s.statements.find(item => item.id === s.nextSearchSourceStatementId);
  return <div className="pi-synthesis-reading">
    {s.stale && <p className="pi-synthesis-notice" role="status">{zh ? "材料已变化。以下为上一版判断，需要按当前证据重新核对。" : "Materials changed. These are previous findings and need review against current evidence."}</p>}
    {s.status === "partial" && <p className="pi-synthesis-notice">{zh ? "本次综合尚不完整，以下仅展示已保留的判断。" : "This synthesis is incomplete; only retained findings are shown."}</p>}
    <section className="pi-synthesis-question"><p className="pi-synthesis-eyebrow">{zh ? "这组论文回答什么" : "THE QUESTION"}</p><h3><MathText>{zh ? s.questionZh : s.questionEn}</MathText></h3><p><MathText>{zh ? s.overviewZh : s.overviewEn}</MathText></p><small>{zh ? `基于 ${s.sourcePaperCount} 篇论文 · 按下方出处核对` : `Based on ${s.sourcePaperCount} papers · check the sources below`}</small></section>
    <section className="pi-synthesis-findings" aria-label={zh ? "证据判断与来源" : "Findings and sources"}>
      {s.statements.map((item, index) => <article className="pi-synthesis-finding" key={item.id}>
        <header><span className="pi-synthesis-index">{String(index + 1).padStart(2, "0")}</span><div><p className="pi-synthesis-eyebrow">{labels[item.kind] || item.kind}</p><h3><MathText>{zh ? item.titleZh : item.titleEn}</MathText></h3></div></header>
        <div className="pi-synthesis-finding-body"><p><MathText>{zh ? item.textZh : item.textEn}</MathText></p>
          <details className="pi-synthesis-source-disclosure"><summary>{zh ? `核对出处 · ${new Set(item.sources.map(source => source.paperId)).size} 篇论文` : `Check sources · ${new Set(item.sources.map(source => source.paperId)).size} papers`}</summary>
            <div className="pi-synthesis-source-list">{item.sources.map(source => <article key={source.claimId}>
              <p className="pi-synthesis-eyebrow">{source.evidenceLevel === "abstract" ? (zh ? "摘要片段" : "ABSTRACT EXCERPT") : (zh ? "已保存的证据片段" : "SAVED EVIDENCE EXCERPT")}</p>
              <h4><MathText>{source.title}</MathText></h4><p className="pi-synthesis-bibliography">{[source.authors, source.publishedAt?.slice(0, 4), source.venue].filter(Boolean).join(" · ")}</p>
              <blockquote><MathText>{source.evidenceQuote}</MathText></blockquote>
              <footer><span>{source.locator || (zh ? "具体位置待核对" : "Exact location needs checking")}</span>{/^https?:\/\//i.test(source.sourceUrl) && <a href={source.sourceUrl} target="_blank" rel="noreferrer">{zh ? "打开来源" : "Open source"} ↗</a>}</footer>
            </article>)}</div>
          </details>
        </div>
      </article>)}
    </section>
    {s.nextSearchQuery && <section className="pi-synthesis-next-step"><p className="pi-synthesis-eyebrow">{zh ? "下一步核查" : "NEXT CHECK"}</p><h3>{next ? (zh ? next.titleZh : next.titleEn) : (zh ? "补充这组材料的证据" : "Find additional evidence")}</h3><details><summary>{zh ? "查看检索式" : "View search query"}</summary><code>{s.nextSearchQuery}</code></details><button type="button" disabled={s.stale} onClick={onScanGap}>{zh ? "检索相关材料" : "Search related material"} →</button></section>}
    <details className="pi-synthesis-version"><summary>{zh ? "版本变化与评估信息" : "Revision and assessment information"}</summary><p>{(zh ? s.changeSummaryZh : s.changeSummaryEn) || (zh ? "暂无版本变化说明。" : "No revision note available.")}</p><p>{zh ? `Pi 综合置信度 ${s.confidence}%；这是模型评估，不代表结论被证明的概率。` : `Pi synthesis confidence: ${s.confidence}%. This is a model assessment, not the probability that a conclusion is proved.`}</p></details>
  </div>;
}
