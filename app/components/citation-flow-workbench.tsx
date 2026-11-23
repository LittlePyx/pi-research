"use client";

import { useEffect, useMemo } from "react";
import { focusCitationRelations } from "../../lib/library-graph";
import { isDatabaseVerifiedCitationEdge } from "../../lib/paper-network";
import type { ResearchMapState, ResearchPaperEdge } from "../../lib/research-map";
import { researchPaperYear, researchRoleLabel } from "../../lib/research-workspace-presentation";
import { focusWorkspaceSection } from "../../lib/workspace-section-navigation";
import { MathText } from "./math-text";
import { buildNetworkPaperNodes, citationEvidenceProviderLabel, type NetworkPaperNode } from "./paper-network-graph";
import { GraphPaperChoice } from "./graph-paper-choice";
import type { RouteSelection } from "./use-route-selection";

type Locale = "zh" | "en";

export function CitationFlowWorkbench({
  map,
  trackFilter,
  locale,
  selectedPaperId,
  onSelect,
  onExpandFocus,
  onOpenFocus,
  onAskFocus,
  expanding,
  selection,
  onRead,
}: {
  map: ResearchMapState;
  trackFilter: string;
  locale: Locale;
  selectedPaperId: string | null;
  onSelect: (paperId: string) => void;
  onExpandFocus: (node: NetworkPaperNode) => void;
  onOpenFocus: (node: NetworkPaperNode) => void;
  onAskFocus: (node: NetworkPaperNode) => void;
  expanding: boolean;
  selection?: RouteSelection;
  onRead?: (id: string) => void;
}) {
  const model = useMemo(() => {
    const nodes = buildNetworkPaperNodes(map).filter((node) => trackFilter === "all" || node.trackIds.includes(trackFilter));
    const nodeById = new Map(nodes.map((node) => [node.paper.id, node]));
    const edges = map.paperEdges.filter((edge) => isDatabaseVerifiedCitationEdge(edge)
      && nodeById.has(edge.sourcePaperId) && nodeById.has(edge.targetPaperId));
    const connectedIds = new Set(edges.flatMap((edge) => [edge.sourcePaperId, edge.targetPaperId]));
    const connectedNodes = nodes.filter((node) => connectedIds.has(node.paper.id));
    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.sourcePaperId, (degree.get(edge.sourcePaperId) || 0) + 1);
      degree.set(edge.targetPaperId, (degree.get(edge.targetPaperId) || 0) + 1);
    }
    const focus = selectedPaperId && nodeById.has(selectedPaperId)
      ? nodeById.get(selectedPaperId) || null
      : [...connectedNodes].sort((left, right) => (degree.get(right.paper.id) || 0) - (degree.get(left.paper.id) || 0)
        || right.paper.citationCount - left.paper.citationCount)[0] || nodes[0] || null;
    const rankRelations = (relations: ResearchPaperEdge[], otherId: (edge: ResearchPaperEdge) => string) => relations
      .map((edge) => ({ edge, node: nodeById.get(otherId(edge)) }))
      .filter((item): item is { edge: ResearchPaperEdge; node: NetworkPaperNode } => Boolean(item.node))
      .sort((left, right) => Number(researchPaperYear(left.node.paper)) - Number(researchPaperYear(right.node.paper))
        || right.node.paper.citationCount - left.node.paper.citationCount);
    const priorAll = focus ? rankRelations(edges.filter((edge) => edge.sourcePaperId === focus.paper.id), (edge) => edge.targetPaperId) : [];
    const laterAll = focus ? rankRelations(edges.filter((edge) => edge.targetPaperId === focus.paper.id), (edge) => edge.sourcePaperId) : [];
    const scope = focusCitationRelations(edges, focus?.paper.id || "");
    const ledger = [...scope.direct].sort((left, right) => {
      const leftLater = nodeById.get(left.sourcePaperId);
      const rightLater = nodeById.get(right.sourcePaperId);
      return (leftLater ? Number(researchPaperYear(leftLater.paper)) : 0) - (rightLater ? Number(researchPaperYear(rightLater.paper)) : 0);
    });
    return {
      focus,
      prior: priorAll.slice(0, 8),
      later: laterAll.slice(0, 8),
      priorAll,
      laterAll,
      ledger,
      otherRelationCount: scope.indirect.length + scope.others.length,
      indirect: scope.indirect,
      otherRelations: scope.others,
      nodeById,
    };
  }, [map, selectedPaperId, trackFilter]);

  useEffect(() => {
    if (model.focus && selectedPaperId !== model.focus.paper.id) onSelect(model.focus.paper.id);
  }, [model.focus, onSelect, selectedPaperId]);

  if (!model.focus) return <div className="v2-specialized-network-empty citation"><span>↗</span><div><strong>{locale === "zh" ? "当前范围还没有可核验的引用链" : "No verified citation chain in this scope"}</strong><p>{locale === "zh" ? "先核验已有论文关系。没有数据库证据时，Pi 不会用推断连线代替真实引用。" : "Verify saved paper links first. Pi will not replace missing database evidence with inferred citations."}</p></div></div>;

  const relationCard = (item: { edge: ResearchPaperEdge; node: NetworkPaperNode }, side: "prior" | "later") => <div className="pi-citation-route-choice" key={item.edge.id}><button
    type="button"
    className="v2-citation-paper-card"
    onClick={() => onSelect(item.node.paper.id)}
  >
    <small>{side === "prior" ? (locale === "zh" ? "本论文引用" : "Cited by focus") : (locale === "zh" ? "后续引用本论文" : "Cites the focus")}</small>
    <strong><MathText inline>{item.node.paper.title}</MathText></strong>
    <span className="authors">{item.node.paper.authors || (locale === "zh" ? "作者信息未提供" : "Authors unavailable")}</span>
    <span>{[researchPaperYear(item.node.paper), item.node.paper.venue, `${item.node.paper.citationCount} ${locale === "zh" ? "次被引" : "citations"}`].filter(Boolean).join(" · ")}</span>
    <em>{locale === "zh" ? `直接引用 · ${citationEvidenceProviderLabel(item.edge.evidenceSource)} 核验` : `Direct citation · verified by ${citationEvidenceProviderLabel(item.edge.evidenceSource)}`}</em>
  </button><GraphPaperChoice paper={item.node.paper} selection={selection} locale={locale} /></div>;

  return <section className="v2-citation-workbench" aria-label={locale === "zh" ? "知识引用流工作台" : "Citation flow workbench"}>
    <article id="citation-focus-paper" className="pi-route-citation-focus">
      <small>{researchRoleLabel(model.focus.paper.role,locale)} · {researchPaperYear(model.focus.paper)}</small>
      <h3><MathText inline>{model.focus.paper.title}</MathText></h3>
      <p>{[model.focus.paper.authors,model.focus.paper.venue].filter(Boolean).join(" · ")}</p>
      <div className="pi-route-evidence-actions">
        {onRead&&<button type="button" onClick={()=>onRead(model.focus!.paper.id)}>{locale==="zh"?"阅读论文":"Read paper"}</button>}
        <GraphPaperChoice paper={model.focus.paper} selection={selection} locale={locale} />
      </div>
      <details className="pi-route-citation-more">
        <summary>{locale==="zh"?"更多论文操作":"More paper actions"}</summary>
        <div className="pi-route-evidence-actions">
          {model.focus.paper.url&&<a href={model.focus.paper.url} target="_blank" rel="noreferrer" onClick={()=>onOpenFocus(model.focus!)}>{locale==="zh"?"打开原文":"Open original"} ↗</a>}
          <button type="button" onClick={()=>onAskFocus(model.focus!)}>{locale==="zh"?"询问 Pi":"Ask Pi"}</button>
          <button type="button" disabled={expanding} onClick={()=>onExpandFocus(model.focus!)}>{expanding?(locale==="zh"?"正在查询…":"Searching…"):(locale==="zh"?"展开外部引用邻居":"Expand external citation neighbors")}</button>
        </div>
        <p>{locale==="zh"?"新候选进入质量评审，收录后才会进入路线。":"Discovered candidates enter quality review. Add a paper to include it in the route."}</p>
      </details>
    </article>
    <div className="v2-citation-lineage-grid pi-route-citation-columns">
      <section className="prior"><header><h4>{locale==="zh"?"参考文献":"References"}</h4><b>{model.priorAll.length}</b></header>
        <div>{model.prior.length ? <>{model.prior.map(item=>relationCard(item,"prior"))}
        {model.priorAll.length > model.prior.length && <details className="v2-citation-more"><summary>{locale === "zh" ? `展开其余 ${model.priorAll.length - model.prior.length} 篇` : `Show ${model.priorAll.length - model.prior.length} more`}</summary>
          <div>{model.priorAll.slice(model.prior.length).map(item=>relationCard(item,"prior"))}</div></details>}</>
        : <p className="v2-citation-gap">{locale==="zh"?"当前路线暂无已核验的参考文献。":"No references to other route papers have been verified."}</p>}</div>
      </section>
      <section className="later"><header><h4>{locale==="zh"?"引用本文的论文":"Citing papers"}</h4><b>{model.laterAll.length}</b></header>
        <div>{model.later.length ? <>{model.later.map(item=>relationCard(item,"later"))}
        {model.laterAll.length > model.later.length && <details className="v2-citation-more"><summary>{locale === "zh" ? `展开其余 ${model.laterAll.length - model.later.length} 篇` : `Show ${model.laterAll.length - model.later.length} more`}</summary>
          <div>{model.laterAll.slice(model.later.length).map(item=>relationCard(item,"later"))}</div></details>}</>
        : <p className="v2-citation-gap">{locale==="zh"?"当前路线暂无已核验的后续引用。":"No later citations from other route papers have been verified."}</p>}</div>
      </section>
    </div>
    {model.ledger.length>0&&<details className="pi-graph-secondary">
      <summary>{locale==="zh"?"查看引用关系清单":"View citation ledger"}</summary>
    <section className="pi-citation-ledger" aria-label={locale === "zh" ? "已核验引用关系" : "Verified citation links"}>
      <header className="pi-citation-ledger-heading">
        <div><h4>{locale === "zh" ? "当前焦点的直接引用清单" : "Direct citations of the current focus"}</h4><p>{locale === "zh" ? `只显示与当前焦点直接相连的关系；本范围另有 ${model.otherRelationCount} 条关系未混入此处。点击其他论文可切换焦点。` : `Only direct links to this focus are shown; ${model.otherRelationCount} other links are outside this view. Select another paper to change focus.`}</p></div>
        <span>{locale === "zh" ? `${model.ledger.length} 条关系` : `${model.ledger.length} links`}</span>
      </header>
      <div className="pi-citation-ledger-list">{model.ledger.map((edge) => {
        const prior = model.nodeById.get(edge.targetPaperId);
        const later = model.nodeById.get(edge.sourcePaperId);
        if (!prior || !later) return null;
        return <article className="pi-citation-link" key={edge.id}>
          <div className="pi-citation-link-papers">
            <button className="pi-citation-link-paper" type="button" aria-pressed={selectedPaperId === prior.paper.id} onClick={() => { onSelect(prior.paper.id); requestAnimationFrame(() => focusWorkspaceSection("citation-focus-paper")); }}>
              <span className="pi-citation-link-meta"><span>{locale === "zh" ? "被引用论文" : "Cited paper"}</span><span>{researchPaperYear(prior.paper)}</span>{selectedPaperId === prior.paper.id && <em>{locale === "zh" ? "当前焦点" : "Current focus"}</em>}</span>
              <strong><MathText inline>{prior.paper.title}</MathText></strong>
            </button>
            <span className="pi-citation-link-arrow" aria-hidden="true">→</span>
            <button className="pi-citation-link-paper" type="button" aria-pressed={selectedPaperId === later.paper.id} onClick={() => { onSelect(later.paper.id); requestAnimationFrame(() => focusWorkspaceSection("citation-focus-paper")); }}>
              <span className="pi-citation-link-meta"><span>{locale === "zh" ? "引用它的论文" : "Paper citing it"}</span><span>{researchPaperYear(later.paper)}</span>{selectedPaperId === later.paper.id && <em>{locale === "zh" ? "当前焦点" : "Current focus"}</em>}</span>
              <strong><MathText inline>{later.paper.title}</MathText></strong>
            </button>
          </div>
          <footer className="pi-citation-link-source"><span>{locale === "zh" ? "直接引用" : "Direct citation"}</span><span>{locale === "zh" ? "核验来源" : "Verified by"} · {citationEvidenceProviderLabel(edge.evidenceSource)}</span></footer>
        </article>;
      })}</div>
      {([model.indirect, model.otherRelations] as ResearchPaperEdge[][]).map((relations, index) => relations.length > 0 && <details className="pi-citation-other" key={index}><summary>{index === 0 ? (locale === "zh" ? "经由中间论文相连（不代表发展顺序）" : "Connected through an intermediate paper, not a development sequence") : (locale === "zh" ? "本方向其他引用关系" : "Other citations in this direction")} · {relations.length}</summary>{relations.map(edge => { const prior=model.nodeById.get(edge.targetPaperId),later=model.nodeById.get(edge.sourcePaperId);if(!prior||!later)return null;const via=[prior,later].filter(n=>model.priorAll.some(p=>p.node.paper.id===n.paper.id)||model.laterAll.some(p=>p.node.paper.id===n.paper.id));return <article key={edge.id}>{index===0&&<p>{locale === "zh" ? "经由" : "Via"}：{via.map(n=>n.paper.title).join(" / ")}</p>}<button type="button" onClick={()=>onSelect(prior.paper.id)}>{prior.paper.title}</button><span> → </span><button type="button" onClick={()=>onSelect(later.paper.id)}>{later.paper.title}</button><small>{citationEvidenceProviderLabel(edge.evidenceSource)}</small></article>;})}</details>)}
    </section></details>}
  </section>;
}
