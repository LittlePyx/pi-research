"use client";

import { useMemo, useState } from "react";
import { canChangeLearningStep } from "../../lib/learning-browse";
import { learningResourceHref, learningResourceTitleKey, type LearningPathState, type LearningPathStep, type LearningResource } from "../../lib/learning-path";
import type { ResearchMapState, ResearchTrack, ResearchTrackRole } from "../../lib/research-map";
import { learningEvidenceLabel, learningResourceSignals, learningTime, researchPaperYear, researchRoleLabel } from "../../lib/research-workspace-presentation";
import { InterfaceIcon } from "./interface-icon";
import { LearningStageNavigation } from "./learning-stage-navigation";
import { LearningStageWorkspace } from "./learning-stage-workspace";
import { MathText } from "./math-text";
import { buildNetworkPaperNodes, type NetworkPaperNode } from "./paper-network-graph";

type Locale = "zh" | "en";

export function ReadingOrderWorkbench({
  map,
  trackFilter,
  locale,
  selectedPaperId,
  learningState,
  learningLoading,
  learningError,
  learningAction,
  onSelect,
  onToggleStep,
  onGenerate,
  onRetry,
}: {
  map: ResearchMapState;
  trackFilter: string;
  locale: Locale;
  selectedPaperId: string | null;
  learningState: LearningPathState;
  learningLoading: boolean;
  learningError: string;
  learningAction: string | null;
  onSelect: (paperId: string) => void;
  onToggleStep: (step: LearningPathStep) => void;
  onGenerate: (track: ResearchTrack | null) => void;
  onRetry: () => void;
}) {
  const [browse, setBrowse] = useState<{ pathId: string; stepId: string } | null>(null);
  const allNodes = useMemo(() => buildNetworkPaperNodes(map), [map]);
  const nodes = useMemo(() => allNodes.filter((node) => trackFilter === "all" || node.trackIds.includes(trackFilter)), [allNodes, trackFilter]);
  const nodeByTrackPaperId = useMemo(() => new Map(allNodes.map((node) => [`track:${node.paper.id}`, node])), [allNodes]);
  const nodeByCanonicalId = useMemo(() => new Map(allNodes.map((node) => [node.paper.canonicalId.trim().toLocaleLowerCase(), node])), [allNodes]);
  const nodeByTitleKey = useMemo(() => {
    const unique = new Map<string, NetworkPaperNode | null>();
    for (const node of allNodes) {
      const key = learningResourceTitleKey(node.paper.title);
      if (!key) continue;
      unique.set(key, unique.has(key) ? null : node);
    }
    return new Map(Array.from(unique).filter((entry): entry is [string, NetworkPaperNode] => Boolean(entry[1])));
  }, [allNodes]);
  const selectedTrack = trackFilter === "all" ? null : map.tracks.find((track) => track.id === trackFilter) || null;
  const path = learningState.path;
  const pathTrack = path?.targetTrackId ? map.tracks.find((track) => track.id === path.targetTrackId) || null : null;
  const pathDirectionMismatch = Boolean(path && selectedTrack && path.targetTrackId !== selectedTrack.id);

  if (learningLoading && !path) return <div className="v2-specialized-network-empty path loading"><InterfaceIcon name="loading" className="pi-state-mark" /><div><strong>{locale === "zh" ? "正在载入已保存的学习路径" : "Loading the saved learning path"}</strong><p>{locale === "zh" ? "路线论文仍然可浏览，进度载入不会重建路径。" : "Route papers remain available; loading progress will not rebuild the path."}</p></div></div>;

  if (learningError && !path) return <div className="v2-specialized-network-empty path error" role="alert"><span>!</span><div><strong>{locale === "zh" ? "学习路径暂时无法载入" : "The learning path could not be loaded"}</strong><p>{learningError}</p><button type="button" onClick={onRetry}>{locale === "zh" ? "重新载入" : "Retry"}</button></div></div>;

  if (!path) {
    const roleGroups = (["foundation", "milestone", "frontier", "background"] as ResearchTrackRole[]).map((role) => ({ role, nodes: nodes.filter((node) => node.paper.role === role) }));
    return <section className="v2-reading-order-workbench fallback" aria-label={locale === "zh" ? "尚未生成个性化阅读顺序" : "Personalized reading order not generated"}>
      <header className="v2-specialized-network-head"><div><p>{locale === "zh" ? "真实论文的阶段整理" : "STAGE-BASED ORGANIZATION OF REAL PAPERS"}</p><h3>{locale === "zh" ? "尚未形成个性化阅读顺序" : "No personalized reading order yet"}</h3><span>{locale === "zh" ? "下面只按路线角色整理真实论文，不表示严格先后，也不会把 Pi 图谱边冒充可执行计划。" : "The papers below are grouped by route role only. This is not a strict order, and graph hints are not presented as an executable plan."}</span></div><dl><div><dt>{locale === "zh" ? "可用论文" : "Available"}</dt><dd>{nodes.length}</dd></div><div><dt>{locale === "zh" ? "建议阶段" : "Suggested stages"}</dt><dd>{roleGroups.filter((group) => group.nodes.length).length}</dd></div><div><dt>{locale === "zh" ? "状态" : "Status"}</dt><dd>—</dd></div></dl></header>
      <div className="v2-reading-fallback-groups">{roleGroups.map((group) => <section key={group.role}><header><strong>{researchRoleLabel(group.role, locale)}</strong><small>{group.role === "background" ? (locale === "zh" ? "相关工具与综述" : "Related tools and surveys") : group.role === "foundation" ? (locale === "zh" ? "定义问题与基础工具" : "Problems and foundational tools") : group.role === "milestone" ? (locale === "zh" ? "理解关键转折与方法" : "Key turns and methods") : (locale === "zh" ? "接近当前问题与前沿" : "Current problems and frontier")}</small><b>{group.nodes.length}</b></header><div>{group.nodes.slice(0, 6).map((node) => <button type="button" className={selectedPaperId === node.paper.id ? "selected" : ""} key={node.paper.id} onClick={() => onSelect(node.paper.id)}><small>{researchPaperYear(node.paper)} · {node.paper.venue}</small><strong><MathText inline>{node.paper.title}</MathText></strong><span>{locale === "zh" ? node.paper.rationaleZh : node.paper.rationaleEn}</span></button>)}{!group.nodes.length && <p>{locale === "zh" ? "这一阶段还缺少真实代表作。" : "This stage still lacks a real representative work."}</p>}</div></section>)}</div>
      <footer className="v2-reading-order-create"><div><strong>{selectedTrack ? (locale === "zh" ? "生成可推进的五阶段路径" : "Build a five-stage path") : (locale === "zh" ? "先在上方选择一个研究方向" : "Choose one research direction above")}</strong><p>{locale === "zh" ? "缺少经典文献时会自动补证；候选通过共享质量评估后才成为正式材料。" : "Missing classics trigger evidence search; candidates become formal materials only after shared quality review."}</p></div><button type="button" disabled={Boolean(learningAction) || !selectedTrack} onClick={() => onGenerate(selectedTrack)}>{learningAction ? (locale === "zh" ? "Pi 正在规划…" : "Pi is planning…") : (locale === "zh" ? "生成学习路径" : "Build learning path")}</button></footer>
    </section>;
  }

  const currentStep = path.steps.find(step => step.status === "active") || path.steps.find(step => step.status !== "completed") || null;
  const activeStep = (browse?.pathId === path.id ? path.steps.find(step => step.id === browse.stepId) : null) || currentStep || path.steps[0];
  const renderResource = (resource: LearningResource) => {
    const canonicalKey = resource.canonicalId?.trim().toLocaleLowerCase();
    const node = (canonicalKey ? nodeByCanonicalId.get(canonicalKey) : undefined) || nodeByTrackPaperId.get(resource.id) || nodeByTitleKey.get(learningResourceTitleKey(resource.title));
    const href = learningResourceHref(resource);
    const content = <><small>{node ? researchPaperYear(node.paper) : resource.publishedAt?.slice(0, 4) || "—"} · {resource.venue}</small><strong><MathText inline>{resource.title}</MathText></strong><em className="v2-learning-resource-signals">{learningResourceSignals(resource, locale).join(" · ")}</em></>;
    return node ? <button type="button" className={selectedPaperId === node.paper.id ? "selected" : ""} key={resource.id} onClick={() => onSelect(node.paper.id)}>{content}</button> : href ? <a href={href} target="_blank" rel="noreferrer" key={resource.id}>{content}</a> : <div className="unavailable" key={resource.id}>{content}</div>;
  };
  return <section className="v2-reading-order-workbench compact v2-learn-page pi-graph-reading" aria-label={locale === "zh" ? "建议阅读顺序工作台" : "Suggested reading order workbench"}>
    {learningError && <div className="v2-reading-order-warning" role="status"><span>!</span><p>{locale === "zh" ? "上次更新没有完成；已保存路径仍保留。" : "The last update did not finish; the saved path remains."} {learningError}</p><button type="button" onClick={onRetry}>{locale === "zh" ? "重试" : "Retry"}</button></div>}
    {pathDirectionMismatch && <div className="v2-reading-order-warning direction" role="status"><span>↔</span><p>{locale === "zh" ? `当前路径属于“${pathTrack?.titleZh || path.target}”。` : `This path belongs to “${pathTrack?.titleEn || path.target}”.`}</p><button type="button" disabled={Boolean(learningAction)} onClick={() => onGenerate(selectedTrack)}>{locale === "zh" ? "按当前方向规划" : "Plan this direction"}</button></div>}
    <header className="v2-specialized-network-head"><div><p>{locale === "zh" ? `学习路径 · 第 ${path.revision} 版` : `LEARNING PATH · REVISION ${path.revision}`}</p><h3>{locale === "zh" ? path.titleZh : path.titleEn}</h3><span>{locale === "zh" ? `当前目标：${path.target}` : `Target: ${path.target}`}</span></div><dl><div><dt>{locale === "zh" ? "进度" : "Progress"}</dt><dd>{path.completedSteps}/{path.steps.length}</dd></div><div><dt>{locale === "zh" ? "已通过材料" : "Approved papers"}</dt><dd>{path.steps.reduce((sum, step) => sum + step.resources.length, 0)}</dd></div><div><dt>{locale === "zh" ? "待评估" : "In review"}</dt><dd>{learningState.waitingQualityCount}</dd></div></dl></header>
    <div className="pi-graph-reading-actions"><button type="button" disabled={Boolean(learningAction)} onClick={() => onGenerate(selectedTrack)}>{locale === "zh" ? "调整学习计划" : "Adjust learning plan"} →</button><span>{locale === "zh" ? "查看阶段不会改变学习进度" : "Browsing stages does not change progress"}</span></div>
    <div className="pi-study-layout"><LearningStageNavigation steps={path.steps} selectedId={activeStep?.id} currentId={currentStep?.id} locale={locale} label={learningEvidenceLabel} onSelect={stepId => setBrowse({pathId:path.id,stepId})} /><div className="pi-study-session">
    {activeStep && <LearningStageWorkspace step={activeStep} locale={locale} openingId={null} onOpen={() => {}} signals={learningResourceSignals} canComplete={canChangeLearningStep(activeStep,currentStep)} busy={Boolean(learningAction)} onComplete={() => onToggleStep(activeStep)} duration={learningTime(activeStep.estimatedMinutes,locale)} renderResources={resources => <div className="v2-learning-stage-resources pi-graph-stage-papers">{resources.map(renderResource)}</div>} />}
    </div></div>

  </section>;
}
