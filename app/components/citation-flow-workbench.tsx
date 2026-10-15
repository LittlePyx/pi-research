"use client";

import { useEffect, useMemo } from "react";
import { focusCitationRelations } from "../../lib/library-graph";
import { isDatabaseVerifiedCitationEdge } from "../../lib/paper-network";
import type { ResearchMapState, ResearchPaperEdge } from "../../lib/research-map";
import { researchPaperYear, researchRoleLabel } from "../../lib/research-workspace-presentation";
import { focusWorkspaceSection } from "../../lib/workspace-section-navigation";
import { MathText } from "./math-text";
import { buildNetworkPaperNodes, citationEvidenceProviderLabel, type NetworkPaperNode } from "./paper-network-graph";

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
    const focus = selectedPaperId && connectedIds.has(selectedPaperId)
      ? nodeById.get(selectedPaperId) || null
      : [...connectedNodes].sort((left, right) => (degree.get(right.paper.id) || 0) - (degree.get(left.paper.id) || 0)
        || right.paper.citationCount - left.paper.citationCount)[0] || null;
    const rankRelations = (relations: ResearchPaperEdge[], otherId: (edge: ResearchPaperEdge) => string) => relations
      .map((edge) => ({ edge, node: nodeById.get(otherId(edge)) }))
      .filter((item): item is { edge: ResearchPaperEdge; node: NetworkPaperNode } => Boolean(item.node))
      .sort((left, right) => Number(researchPaperYear(left.node.paper)) - Number(researchPaperYear(right.node.paper))
        || right.node.paper.citationCount - left.node.paper.citationCount);
    const priorAll = focus ? rankRelations(edges.filter((edge) => edge.sourcePaperId === focus.paper.id), (edge) => edge.targetPaperId) : [];
    const laterAll = focus ? rankRelations(edges.filter((edge) => edge.targetPaperId === focus.paper.id), (edge) => edge.sourcePaperId) : [];
    const years = connectedNodes.map((node) => Number(researchPaperYear(node.paper))).filter(Number.isFinite);
    const scope = focusCitationRelations(edges, focus?.paper.id || "");
    const ledger = [...scope.direct].sort((left, right) => {
      const leftLater = nodeById.get(left.sourcePaperId);
      const rightLater = nodeById.get(right.sourcePaperId);
      return (leftLater ? Number(researchPaperYear(leftLater.paper)) : 0) - (rightLater ? Number(researchPaperYear(rightLater.paper)) : 0);
    });
    const providerCounts = new Map<string, number>();
    for (const edge of edges) {
      const provider = citationEvidenceProviderLabel(edge.evidenceSource);
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
    }
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
      connectedNodes,
      providers: Array.from(providerCounts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
      yearStart: years.length ? Math.min(...years) : null,
      yearEnd: years.length ? Math.max(...years) : null,
    };
  }, [map, selectedPaperId, trackFilter]);

  useEffect(() => {
    if (model.focus && selectedPaperId !== model.focus.paper.id) onSelect(model.focus.paper.id);
  }, [model.focus, onSelect, selectedPaperId]);

  if (!model.focus) return <div className="v2-specialized-network-empty citation"><span>↗</span><div><strong>{locale === "zh" ? "当前范围还没有可核验的引用链" : "No verified citation chain in this scope"}</strong><p>{locale === "zh" ? "先核验已有论文关系。没有数据库证据时，Pi 不会用推断连线代替真实引用。" : "Verify saved paper links first. Pi will not replace missing database evidence with inferred citations."}</p></div></div>;

  const relationCard = (item: { edge: ResearchPaperEdge; node: NetworkPaperNode }, side: "prior" | "later") => <button
    type="button"
    className="v2-citation-paper-card"
    key={item.edge.id}
    onClick={() => onSelect(item.node.paper.id)}
  >
    <small>{side === "prior" ? (locale === "zh" ? "本论文引用" : "Cited by focus") : (locale === "zh" ? "后续引用本论文" : "Cites the focus")}</small>
    <strong><MathText inline>{item.node.paper.title}</MathText></strong>
    <span className="authors">{item.node.paper.authors || (locale === "zh" ? "作者信息未提供" : "Authors unavailable")}</span>
    <span>{[researchPaperYear(item.node.paper), item.node.paper.venue, `${item.node.paper.citationCount} ${locale === "zh" ? "次被引" : "citations"}`].filter(Boolean).join(" · ")}</span>
    <em>{locale === "zh" ? `直接引用 · ${citationEvidenceProviderLabel(item.edge.evidenceSource)} 核验` : `Direct citation · verified by ${citationEvidenceProviderLabel(item.edge.evidenceSource)}`}</em>
  </button>;

  return <section className="v2-citation-workbench" aria-label={locale === "zh" ? "知识引用流工作台" : "Citation flow workbench"}>
    <header className="v2-specialized-network-head"><div><p>{locale === "zh" ? "数据库核验的引用关系" : "DATABASE-VERIFIED CITATIONS"}</p><h3>{locale === "zh" ? "查看它引用的论文，以及引用它的后续论文" : "Explore references and later citations"}</h3><span>{locale === "zh" ? "选择任意节点作为焦点；这里只展示当前论文库内已确认的直接引用。" : "Choose any node as the focus. Only direct citations verified inside the current library are shown."}</span></div><dl><div><dt>{locale === "zh" ? "真实引用" : "Verified links"}</dt><dd>{model.ledger.length}</dd></div><div><dt>{locale === "zh" ? "链上论文" : "Papers in flow"}</dt><dd>{model.connectedNodes.length}</dd></div><div><dt>{locale === "zh" ? "时间跨度" : "Coverage"}</dt><dd>{model.yearStart && model.yearEnd ? `${model.yearStart}–${model.yearEnd}` : "—"}</dd></div><div><dt>{locale === "zh" ? "核验来源" : "Providers"}</dt><dd>{model.providers.length}</dd></div></dl></header>
    <div className="v2-citation-source-summary"><strong>{locale === "zh" ? "只包含数据库确认的直接引用" : "Direct citations confirmed by scholarly databases only"}</strong><span>{model.providers.map(([provider, count]) => `${provider} · ${count}`).join("  /  ")}</span></div>
    <div className="v2-citation-lineage-grid">
      <section className="prior"><header><span>01</span><div><h4>{locale === "zh" ? "参考文献" : "References"}</h4><small>{locale === "zh" ? "焦点论文直接引用的工作" : "Work directly cited by the focus"}</small></div><b>{model.priorAll.length > model.prior.length ? `${model.prior.length}/${model.priorAll.length}` : model.priorAll.length}</b></header><div>{model.prior.length ? <>{model.prior.map((item) => relationCard(item, "prior"))}{model.priorAll.length > model.prior.length && <details className="v2-citation-more"><summary>{locale === "zh" ? `展开其余 ${model.priorAll.length - model.prior.length} 篇` : `Show ${model.priorAll.length - model.prior.length} more`}</summary><div>{model.priorAll.slice(model.prior.length).map((item) => relationCard(item, "prior"))}</div></details>}</> : <p className="v2-citation-gap">{locale === "zh" ? "当前库内尚未核验到它的前置引用。" : "No prior citation has been verified in the current library."}</p>}</div></section>
      <article id="citation-focus-paper" className="v2-citation-focus-card"><span>{locale === "zh" ? "当前焦点" : "CURRENT FOCUS"}</span><em>{researchRoleLabel(model.focus.paper.role, locale)} · {researchPaperYear(model.focus.paper)}</em><h4><MathText inline>{model.focus.paper.title}</MathText></h4><div className="v2-citation-focus-meta"><span>{model.focus.paper.authors || (locale === "zh" ? "作者信息未提供" : "Authors unavailable")}</span><small>{model.focus.paper.venue || (locale === "zh" ? "来源待核对" : "Venue unavailable")}</small></div><p>{locale === "zh" ? model.focus.paper.rationaleZh : model.focus.paper.rationaleEn}</p><dl><div><dt>{locale === "zh" ? "参考文献" : "Prior"}</dt><dd>{model.priorAll.length}</dd></div><div><dt>{locale === "zh" ? "后续引用" : "Later"}</dt><dd>{model.laterAll.length}</dd></div><div><dt>{locale === "zh" ? "总被引" : "Citations"}</dt><dd>{model.focus.paper.citationCount}</dd></div></dl><div className="v2-citation-focus-actions"><a href={model.focus.paper.url || (model.focus.paper.doi ? `https://doi.org/${model.focus.paper.doi}` : "#")} target="_blank" rel="noreferrer" onClick={() => onOpenFocus(model.focus!)}>{locale === "zh" ? "打开原文" : "Open original"} ↗</a><button type="button" onClick={() => onAskFocus(model.focus!)}>{locale === "zh" ? "让 Pi 解释" : "Ask Pi"}</button></div><button type="button" disabled={expanding} onClick={() => onExpandFocus(model.focus!)}>{expanding ? (locale === "zh" ? "正在寻找前后论文…" : "Discovering nearby papers…") : (locale === "zh" ? "展开外部引用邻居" : "Expand external citation neighbors")} →</button><small>{locale === "zh" ? "扩展候选会进入共享质量评估；只有评审通过才可能出现在今日，只有你收录确认后才进入正式路线与引用流。" : "Expanded candidates enter the shared quality review. Only papers that pass can reach Today, and only your explicit addition confirms formal route and citation-flow evidence."}</small></article>
      <section className="later"><header><span>03</span><div><h4>{locale === "zh" ? "后续发展" : "Later development"}</h4><small>{locale === "zh" ? "直接引用焦点论文的工作" : "Work that directly cites the focus"}</small></div><b>{model.laterAll.length > model.later.length ? `${model.later.length}/${model.laterAll.length}` : model.laterAll.length}</b></header><div>{model.later.length ? <>{model.later.map((item) => relationCard(item, "later"))}{model.laterAll.length > model.later.length && <details className="v2-citation-more"><summary>{locale === "zh" ? `展开其余 ${model.laterAll.length - model.later.length} 篇` : `Show ${model.laterAll.length - model.later.length} more`}</summary><div>{model.laterAll.slice(model.later.length).map((item) => relationCard(item, "later"))}</div></details>}</> : <p className="v2-citation-gap">{locale === "zh" ? "当前库内尚未核验到后续引用。" : "No later citation has been verified in the current library."}</p>}</div></section>
    </div>
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
    </section>
  </section>;
}
