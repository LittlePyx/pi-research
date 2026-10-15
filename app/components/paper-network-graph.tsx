"use client";

import { useMemo } from "react";
import { researchPaperYear } from "../../lib/research-workspace-presentation";
import {
  isDatabaseVerifiedCitationEdge,
  isVerifiableSimilarityNeighborEdge,
  paperNetworkEdgeKey,
  selectBalancedMultiSeedEdges,
  selectPaperNetworkActiveNodeIds,
  selectVerifiableOneHopEdges,
  type MultiOriginIntent,
} from "../../lib/paper-network";
import type {
  ResearchMapState,
  ResearchPaperEdge,
  ResearchTrack,
  ResearchTrackPaper,
  ResearchTrackRole,
} from "../../lib/research-map";
import type {
  ResearchNetworkCandidate,
  ResearchNetworkExpandResponse,
  ResearchNetworkSimilarityEdge,
  ResearchNetworkSourceStatus,
} from "../../lib/research-network";

type Locale = "zh" | "en";
type Localized = { zh: string; en: string };
type PaperNetworkMode = "similarity" | "citations" | "path";
type PaperNetworkScope = "all" | "one-hop" | "multi-seed";
type PaperDiscoveryTab = "similar" | "prior" | "derivative";
type PaperNetworkUserState = "unseen" | "seen" | "snoozed" | "accepted" | "dismissed";

type NetworkPaperNode = {
  paper: ResearchTrackPaper;
  track: ResearchTrack;
  trackIds: string[];
  external?: ResearchNetworkCandidate;
};

const paperNetworkPalette = ["#2f6650", "#9b6848", "#416c83", "#745f8c", "#8a7b3e"];
const paperNetworkYearPalette = ["#d1c4ad", "#b2b9aa", "#88a694", "#5d8975", "#2f6650"];
const PAPER_NETWORK_ACTIVE_NODE_LIMIT = 72;

function buildNetworkPaperNodes(map: ResearchMapState) {
  const unique = new Map<string, NetworkPaperNode>();
  for (const track of map.tracks) {
    for (const paper of track.papers) {
      const previous = unique.get(paper.canonicalId);
      if (!previous) {
        unique.set(paper.canonicalId, { paper, track, trackIds: [track.id] });
        continue;
      }
      const trackIds = Array.from(new Set([...previous.trackIds, track.id]));
      if ((!previous.paper.doi && paper.doi) || paper.citationCount > previous.paper.citationCount) {
        unique.set(paper.canonicalId, { paper, track, trackIds });
      } else {
        unique.set(paper.canonicalId, { ...previous, trackIds });
      }
    }
  }
  return Array.from(unique.values());
}

function normalizedNetworkDirection(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, "-");
}

function researchNetworkOriginKey(originCanonicalIds: string[]) {
  return Array.from(new Set(originCanonicalIds.map((id) => id.trim()).filter(Boolean))).sort().join("|");
}

function candidateBelongsToTab(candidate: ResearchNetworkCandidate, tab: PaperDiscoveryTab) {
  if (tab === "similar") return true;
  const directions = candidate.relations.map((relation) => normalizedNetworkDirection(relation.direction));
  if (tab === "prior") return directions.some((direction) => ["prior", "reference", "references", "backward", "outgoing", "cited", "seed-cites-candidate"].includes(direction));
  return directions.some((direction) => ["derivative", "citation", "citing", "forward", "incoming", "cited-by", "candidate-cites-seed"].includes(direction));
}

function clampNetworkStrength(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function networkCandidateFitLabel(score: number, locale: Locale) {
  if (score >= 82) return locale === "zh" ? "优先探索候选" : "Priority discovery lead";
  if (score >= 68) return locale === "zh" ? "待核对候选" : "Candidate to examine";
  return locale === "zh" ? "探索候选" : "Exploratory candidate";
}

function currentOriginEvidenceCount(candidate: ResearchNetworkCandidate, originCanonicalIds: string[]) {
  const originSet = new Set(originCanonicalIds);
  return new Set(candidate.relations
    .filter((relation) => relation.kind !== "recommendation")
    .map((relation) => relation.seedCanonicalId)
    .filter((id) => originSet.has(id))).size;
}

type ResearchNetworkDisplaySourceStatus = ResearchNetworkSourceStatus[keyof ResearchNetworkSourceStatus] | "empty" | "no_matches";

function researchNetworkSourceLabel(status: ResearchNetworkDisplaySourceStatus, locale: Locale) {
  const labels: Record<ResearchNetworkDisplaySourceStatus, Localized> = {
    ok: { zh: "已更新", en: "updated" },
    partial: { zh: "部分可用", en: "partial" },
    unavailable: { zh: "暂不可用", en: "unavailable" },
    cached: { zh: "缓存", en: "cached" },
    not_attempted: { zh: "未调用", en: "not used" },
    empty: { zh: "已检查，暂无新结果", en: "checked, no new results" },
    no_matches: { zh: "已检查，未匹配到新论文", en: "checked, no matching papers" },
  };
  return labels[status][locale];
}

function isResearchNetworkExpandResponse(value: unknown): value is ResearchNetworkExpandResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.status === "string"
    && Array.isArray(record.seeds)
    && Array.isArray(record.candidates)
    && Array.isArray(record.similarityEdges)
    && Boolean(record.sourceStatus && typeof record.sourceStatus === "object");
}

function researchNetworkHasNoNewCandidates(response: ResearchNetworkExpandResponse) {
  const responseStatus = String(response.status);
  const sourceStatuses = Object.values(response.sourceStatus).map(String);
  const incomplete = response.externalUnavailable
    || sourceStatuses.some((status) => status === "partial" || status === "unavailable");
  return responseStatus === "no_matches" && response.candidates.length === 0 && !incomplete;
}

function researchNetworkIssueSummary(response: ResearchNetworkExpandResponse, locale: Locale) {
  const codes = new Set(response.issues.map((issue) => issue.code));
  if (researchNetworkHasNoNewCandidates(response)) return "";
  if (codes.has("quota_exhausted")) return locale === "zh"
    ? "今日外部发现额度已用完；现有论文与关系已保留，明日可继续。"
    : "Today's external discovery budget is used up. Existing papers and links are preserved; continue tomorrow.";
  if (response.status === "rate_limited" || codes.has("rate_limited")) {
    const seconds = response.retryAfterSeconds || Math.max(0, ...response.issues.map((issue) => issue.retryAfterSeconds || 0));
    const waitLabel = seconds > 0
      ? locale === "zh"
        ? seconds >= 60 ? `约 ${Math.ceil(seconds / 60)} 分钟后` : `约 ${seconds} 秒后`
        : seconds >= 60 ? `in about ${Math.ceil(seconds / 60)} minute(s)` : `in about ${seconds} seconds`
      : locale === "zh" ? "稍后" : "later";
    return locale === "zh"
      ? `Semantic Scholar 正在限流；现有论文与关系已保留，可${waitLabel}继续发现。`
      : `Semantic Scholar is rate-limiting requests. Existing papers and links are preserved; try discovery again ${waitLabel}.`;
  }
  if (codes.has("seed_unresolved")) return locale === "zh"
    ? "部分起始论文暂未匹配到外部数据库；已展示其余可核验结果。"
    : "Some origin papers could not be matched in the external database; other verified results are shown.";
  if (response.issues.length || response.errors.length) return locale === "zh"
    ? "部分外部证据暂未刷新；已展示并保留当前可核验结果。"
    : "Some external evidence could not refresh; current verified results remain available.";
  if (response.status === "partial" && response.candidates.length === 0) return locale === "zh"
    ? "部分来源本轮未完成，暂未返回新的可核验候选；现有研究地图不受影响。"
    : "Some sources did not complete this pass, so no new verifiable candidates were returned; the saved research map is unaffected.";
  return "";
}

function paperNetworkStateLabel(state: PaperNetworkUserState | undefined, locale: Locale) {
  if (!state) return "";
  const labels: Record<PaperNetworkUserState, Localized> = {
    unseen: { zh: "未查看", en: "unseen" },
    seen: { zh: "已浏览", en: "seen" },
    snoozed: { zh: "稍后处理", en: "snoozed" },
    accepted: { zh: "已接受", en: "accepted" },
    dismissed: { zh: "已忽略", en: "dismissed" },
  };
  return labels[state][locale];
}

function buildExternalNetworkPaperNodes(map: ResearchMapState, candidates: ResearchNetworkCandidate[]) {
  const internalNodes = buildNetworkPaperNodes(map);
  const internalCanonicalIds = new Set(internalNodes.map((node) => node.paper.canonicalId));
  const internalByCanonicalId = new Map(internalNodes.map((node) => [node.paper.canonicalId, node]));
  const fallbackTrack = map.tracks[0];
  if (!fallbackTrack) return [] as NetworkPaperNode[];
  return candidates.filter((candidate) => !internalCanonicalIds.has(candidate.canonicalId)).map((candidate, index) => {
    const relatedTracks = Array.from(new Set(candidate.relations.flatMap((relation) => internalByCanonicalId.get(relation.seedCanonicalId)?.trackIds || [])));
    const verifiedRelationCount = candidate.relations.filter((relation) => relation.kind !== "recommendation").length;
    const track = map.tracks.find((item) => relatedTracks.includes(item.id)) || fallbackTrack;
    return {
      external: candidate,
      track,
      trackIds: relatedTracks.length ? relatedTracks : [track.id],
      paper: {
        id: `ghost:${candidate.canonicalId}`,
        canonicalId: candidate.canonicalId,
        doi: candidate.canonicalId.startsWith("doi:") ? candidate.canonicalId.slice(4) : null,
        title: candidate.title,
        authors: candidate.authors,
        venue: candidate.venue,
        url: candidate.url,
        publishedAt: candidate.publishedAt,
        citationCount: candidate.citationCount,
        role: "frontier" as ResearchTrackRole,
        summaryZh: candidate.abstractText || "这是一篇尚未收入研究地图的外部候选论文。",
        summaryEn: candidate.abstractText || "This external candidate has not been added to the research map yet.",
        rationaleZh: `外部图谱将其列为${networkCandidateFitLabel(candidate.score, "zh")}；其中 ${verifiedRelationCount} 条引用关系经数据库核验，其余仅作为推荐线索。`,
        rationaleEn: `The external graph marks it as a ${networkCandidateFitLabel(candidate.score, "en").toLocaleLowerCase()}; ${verifiedRelationCount} citation relation(s) are database-verified and the rest remain recommendation leads.`,
        position: 1000 + index,
        curationStatus: "active", curationReasonCode: "", curationReasonZh: "", curationReasonEn: "", curationSource: "external-candidate", curationEvidence: [], curationUpdatedAt: null,
      },
    } satisfies NetworkPaperNode;
  });
}

function externalNetworkEdges(nodes: NetworkPaperNode[], candidates: NetworkPaperNode[], similarityEdges: ResearchNetworkSimilarityEdge[]) {
  const nodeByCanonicalId = new Map(nodes.map((node) => [node.paper.canonicalId, node]));
  const edges: ResearchPaperEdge[] = [];
  for (const relation of similarityEdges) {
    const source = nodeByCanonicalId.get(relation.sourceCanonicalId);
    const target = nodeByCanonicalId.get(relation.targetCanonicalId);
    if (!source || !target || source.paper.id === target.paper.id) continue;
    const coupling = relation.kind === "bibliographic_coupling" && relation.sharedReferences > 0;
    edges.push({
      id: `external-${coupling ? "coupling" : "discovery"}:${source.paper.id}:${target.paper.id}`,
      sourcePaperId: source.paper.id,
      targetPaperId: target.paper.id,
      kind: "similarity",
      relationKind: coupling ? "bibliographic_coupling" : "verified_discovery",
      relationshipZh: coupling ? `共享 ${relation.sharedReferences} 篇可核验参考文献。` : "数据库确认两篇论文存在引用发现关系；这不代表文献耦合强度。",
      relationshipEn: coupling ? `${relation.sharedReferences} verified references in common.` : "A database-verified citation relation supports discovery here; it is not a bibliographic-coupling score.",
      confidence: clampNetworkStrength(relation.weight),
      evidenceSource: relation.evidenceSource || "semantic-scholar",
    });
  }
  for (const node of candidates) {
    if (!node.external) continue;
    for (const relation of node.external.relations) {
      const kind = normalizedNetworkDirection(relation.kind);
      if (!["similarity", "similar", "recommendation", "recommended", "reference", "citation"].includes(kind)) continue;
      const seed = nodeByCanonicalId.get(relation.seedCanonicalId);
      if (!seed || seed.paper.id === node.paper.id) continue;
      if (edges.some((edge) => (edge.sourcePaperId === node.paper.id && edge.targetPaperId === seed.paper.id) || (edge.targetPaperId === node.paper.id && edge.sourcePaperId === seed.paper.id))) continue;
      const verifiedDiscovery = kind === "reference" || kind === "citation";
      edges.push({
        id: `external:${node.paper.id}:${seed.paper.id}:${kind}`,
        sourcePaperId: node.paper.id,
        targetPaperId: seed.paper.id,
        kind: "similarity",
        relationKind: verifiedDiscovery ? "verified_discovery" : "recommendation_discovery",
        relationshipZh: verifiedDiscovery ? "数据库确认的引用或参考文献发现关系；不作为文献耦合强度。" : `推荐发现线索 · ${relation.evidenceSource}；不代表引用或文献耦合。`,
        relationshipEn: verifiedDiscovery ? "A database-verified citation or reference discovery link; not a bibliographic-coupling score." : `Recommendation lead · ${relation.evidenceSource}; this is neither a citation nor bibliographic coupling.`,
        confidence: clampNetworkStrength(node.external.score),
        evidenceSource: relation.evidenceSource || "research-network",
      });
    }
  }
  return edges;
}

function networkRelationLabel(edge: ResearchPaperEdge, locale: Locale) {
  if (edge.kind === "citation") return locale === "zh" ? "真实引用" : "Verified citation";
  if (edge.kind === "similarity") {
    if (edge.relationKind === "verified_discovery") return locale === "zh" ? "引用发现线索" : "Citation discovery link";
    if (edge.relationKind === "recommendation_discovery") return locale === "zh" ? "推荐发现线索" : "Recommendation lead";
    return locale === "zh" ? "文献耦合" : "Bibliographic coupling";
  }
  const labels: Record<string, Localized> = {
    extends: { zh: "扩展", en: "Extends" }, challenges: { zh: "挑战", en: "Challenges" }, applies: { zh: "应用", en: "Applies" },
    unifies: { zh: "统一", en: "Unifies" }, bridges: { zh: "桥接", en: "Bridges" }, reframes: { zh: "重构", en: "Reframes" },
    prepares: { zh: "铺垫", en: "Prepares" }, advances: { zh: "推进", en: "Advances" },
  };
  return labels[edge.relationKind]?.[locale] || (locale === "zh" ? "语义关联" : "Semantic link");
}

function citationEvidenceProviderLabel(evidenceSource: string) {
  return evidenceSource.trim().toLocaleLowerCase() === "openalex" ? "OpenAlex" : "Semantic Scholar";
}

function networkEvidenceLabel(edge: ResearchPaperEdge, locale: Locale) {
  if (edge.kind === "citation") return locale === "zh" ? "数据库核验" : "Database verified";
  if (edge.kind === "similarity") {
    if (edge.relationKind === "verified_discovery") return locale === "zh" ? "数据库核验线索" : "Database-verified lead";
    if (edge.relationKind === "recommendation_discovery") return locale === "zh" ? "推荐线索" : "Recommendation lead";
    return locale === "zh" ? `耦合强度 ${edge.confidence}` : `Coupling strength ${edge.confidence}`;
  }
  return locale === "zh" ? `Pi 推断 · 强度 ${edge.confidence}` : `Pi inference · strength ${edge.confidence}`;
}

function paperNetworkSourceNotice(network: ResearchMapState["paperNetwork"], locale: Locale) {
  const error = network.error || "";
  const verifiedCount = network.citationEdgeCount + network.similarityEdgeCount;
  const citationFailed = /citation:|semantic scholar|citation lookup/i.test(error);
  const citationCache = network.sources.includes("semantic-scholar-cache");
  if (!citationFailed) return null;
  return locale === "zh"
    ? { title: citationCache ? "引用关系暂沿用上次版本" : "引用关系本轮未更新", body: `当前仍保留 ${verifiedCount} 条数据库关系；论文节点不受影响。`, action: "重试引用更新" }
    : { title: citationCache ? "Citations are using the saved version" : "Citations did not update this run", body: `${verifiedCount} database links remain available; paper nodes are unaffected.`, action: "Retry citations" };
}

function stableNetworkUnit(value: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return ((hash >>> 0) % 10000) / 10000;
}

function relaxSimilarityPositions(
  nodes: NetworkPaperNode[],
  edges: ResearchPaperEdge[],
  positions: Map<string, { x: number; y: number; radius: number; trackId: string; color: string }>,
  originPaperIds: string[],
  width: number,
  height: number,
) {
  const velocities = new Map(nodes.map((node) => [node.paper.id, { x: 0, y: 0 }]));
  const originSet = new Set(originPaperIds);
  const originSpacing = originPaperIds.length >= 3 ? 240 : 280;
  for (let iteration = 0; iteration < 150; iteration += 1) {
    const cooling = 1 - iteration / 180;
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      const left = positions.get(nodes[leftIndex].paper.id)!;
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const right = positions.get(nodes[rightIndex].paper.id)!;
        const dx = right.x - left.x || 0.01;
        const dy = right.y - left.y || 0.01;
        const distanceSquared = Math.max(140, dx * dx + dy * dy);
        const force = 1150 / distanceSquared;
        const distance = Math.sqrt(distanceSquared);
        const fx = dx / distance * force;
        const fy = dy / distance * force;
        velocities.get(nodes[leftIndex].paper.id)!.x -= fx;
        velocities.get(nodes[leftIndex].paper.id)!.y -= fy;
        velocities.get(nodes[rightIndex].paper.id)!.x += fx;
        velocities.get(nodes[rightIndex].paper.id)!.y += fy;
      }
    }
    for (const edge of edges) {
      const source = positions.get(edge.sourcePaperId);
      const target = positions.get(edge.targetPaperId);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const desired = edge.kind === "similarity" ? 92 : edge.kind === "citation" ? 125 : 145;
      const strength = (edge.kind === "similarity" ? 0.025 : 0.014) * Math.max(0.45, edge.confidence / 100);
      const force = (distance - desired) * strength;
      const fx = dx / distance * force;
      const fy = dy / distance * force;
      velocities.get(edge.sourcePaperId)!.x += fx;
      velocities.get(edge.sourcePaperId)!.y += fy;
      velocities.get(edge.targetPaperId)!.x -= fx;
      velocities.get(edge.targetPaperId)!.y -= fy;
    }
    nodes.forEach((node, index) => {
      const position = positions.get(node.paper.id)!;
      const velocity = velocities.get(node.paper.id)!;
      const originIndex = originPaperIds.indexOf(node.paper.id);
      const targetX = originIndex >= 0 ? width * 0.5 + (originIndex - (originPaperIds.length - 1) / 2) * originSpacing : width * 0.5;
      const targetY = originIndex >= 0 ? height * 0.5 : 84 + (index % Math.max(1, Math.ceil(Math.sqrt(nodes.length)))) * ((height - 168) / Math.max(1, Math.ceil(Math.sqrt(nodes.length)) - 1));
      velocity.x += (targetX - position.x) * (originSet.has(node.paper.id) ? 0.085 : 0.0017);
      velocity.y += (targetY - position.y) * (originSet.has(node.paper.id) ? 0.085 : 0.0011);
      velocity.x *= 0.72;
      velocity.y *= 0.72;
      position.x = Math.max(44, Math.min(width - 44, position.x + velocity.x * cooling));
      position.y = Math.max(58, Math.min(height - 48, position.y + velocity.y * cooling));
    });
  }
}

type NetworkNodePosition = { x: number; y: number; radius: number; trackId: string; color: string };

function readingPathLayout(nodes: NetworkPaperNode[], edges: ResearchPaperEdge[]) {
  const ids = new Set(nodes.map((node) => node.paper.id));
  const nodeById = new Map(nodes.map((node) => [node.paper.id, node]));
  const indegree = new Map(Array.from(ids).map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!ids.has(edge.sourcePaperId) || !ids.has(edge.targetPaperId)) continue;
    outgoing.set(edge.sourcePaperId, [...(outgoing.get(edge.sourcePaperId) || []), edge.targetPaperId]);
    indegree.set(edge.targetPaperId, (indegree.get(edge.targetPaperId) || 0) + 1);
  }
  const roleRank: Record<ResearchTrackRole, number> = { foundation: 0, milestone: 1, frontier: 2, background: 3 };
  const compare = (leftId: string, rightId: string) => {
    const left = nodeById.get(leftId)!;
    const right = nodeById.get(rightId)!;
    return roleRank[left.paper.role] - roleRank[right.paper.role]
      || Number(researchPaperYear(left.paper)) - Number(researchPaperYear(right.paper))
      || left.paper.position - right.paper.position;
  };
  const queue = Array.from(ids).filter((id) => !indegree.get(id)).sort(compare);
  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const targetId of outgoing.get(id) || []) {
      indegree.set(targetId, (indegree.get(targetId) || 1) - 1);
      if (!indegree.get(targetId)) {
        queue.push(targetId);
        queue.sort(compare);
      }
    }
  }
  for (const id of Array.from(ids).filter((id) => !ordered.includes(id)).sort(compare)) ordered.push(id);
  const depthById = new Map(ordered.map((id) => [id, 0]));
  for (const id of ordered) for (const targetId of outgoing.get(id) || []) {
    depthById.set(targetId, Math.max(depthById.get(targetId) || 0, (depthById.get(id) || 0) + 1));
  }
  return {
    stepById: new Map(ordered.map((id, index) => [id, index + 1])),
    depthById,
    maxDepth: Math.max(0, ...Array.from(depthById.values())),
  };
}

function clippedPaperNetworkPath(edge: ResearchPaperEdge, positions: Map<string, NetworkNodePosition>, hasArrow: boolean) {
  const storedSource = positions.get(edge.sourcePaperId);
  const storedTarget = positions.get(edge.targetPaperId);
  if (!storedSource || !storedTarget) return "";
  const source = edge.kind === "citation" ? storedTarget : storedSource;
  const target = edge.kind === "citation" ? storedSource : storedTarget;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const unitX = dx / distance;
  const unitY = dy / distance;
  const startPadding = source.radius + 4;
  const endPadding = target.radius + (hasArrow ? 6 : 4);
  const startX = source.x + unitX * startPadding;
  const startY = source.y + unitY * startPadding;
  const endX = target.x - unitX * endPadding;
  const endY = target.y - unitY * endPadding;
  const middle = (startX + endX) / 2;
  return `M ${startX} ${startY} C ${middle} ${startY}, ${middle} ${endY}, ${endX} ${endY}`;
}

function PaperNetworkGraph({
  map,
  mode,
  scope,
  multiOriginIntent,
  trackFilter,
  locale,
  selectedPaperId,
  hoveredPaperId,
  originPaperIds,
  externalNodes,
  externalSimilarityEdges,
  paperStates,
  onSelect,
  onHover,
}: {
  map: ResearchMapState;
  mode: PaperNetworkMode;
  scope: PaperNetworkScope;
  multiOriginIntent: MultiOriginIntent;
  trackFilter: string;
  locale: Locale;
  selectedPaperId: string | null;
  hoveredPaperId: string | null;
  originPaperIds: string[];
  externalNodes: NetworkPaperNode[];
  externalSimilarityEdges: ResearchNetworkSimilarityEdge[];
  paperStates: Record<string, PaperNetworkUserState>;
  onSelect: (paperId: string) => void;
  onHover: (paperId: string | null) => void;
}) {
  const layoutFocusId = scope === "one-hop" ? selectedPaperId : null;
  const layout = useMemo(() => {
    const internalNodes = buildNetworkPaperNodes(map);
    const mergedNodes = Array.from(new Map([...internalNodes, ...externalNodes].map((node) => [node.paper.canonicalId, node])).values());
    const filteredNodes = mergedNodes.filter((node) => trackFilter === "all" || node.trackIds.includes(trackFilter));
    const filteredIds = new Set(filteredNodes.map((node) => node.paper.id));
    const discoveredEdges = externalNetworkEdges(mergedNodes, externalNodes, externalSimilarityEdges);
    let edges = [...map.paperEdges, ...discoveredEdges].filter((edge) => filteredIds.has(edge.sourcePaperId) && filteredIds.has(edge.targetPaperId)
      && (mode === "citations" ? isDatabaseVerifiedCitationEdge(edge) : mode === "path" ? edge.kind === "path" : edge.kind === "similarity"));
    const activeNodeIds = new Set(selectPaperNetworkActiveNodeIds(
      filteredNodes.map((node) => ({
        id: node.paper.id,
        citationCount: node.paper.citationCount,
        external: mode === "similarity" && Boolean(node.external),
      })),
      edges,
      originPaperIds,
      layoutFocusId,
      PAPER_NETWORK_ACTIVE_NODE_LIMIT,
    ));
    let nodes = filteredNodes.filter((node) => activeNodeIds.has(node.paper.id));
    edges = edges.filter((edge) => activeNodeIds.has(edge.sourcePaperId) && activeNodeIds.has(edge.targetPaperId));
    if (mode === "path" || mode === "citations") {
      const connectedIds = new Set(edges.flatMap((edge) => [edge.sourcePaperId, edge.targetPaperId]));
      nodes = nodes.filter((node) => connectedIds.has(node.paper.id));
    }
    const completePathLayout = mode === "path" ? readingPathLayout(nodes, edges) : null;
    const availableIds = new Set(nodes.map((node) => node.paper.id));
    const visibleOriginIds = originPaperIds.filter((id) => availableIds.has(id)).slice(0, 3);
    const multiSeedActive = mode === "similarity" && scope === "multi-seed" && visibleOriginIds.length >= 2;
    const oneHopActive = scope === "one-hop" && Boolean(layoutFocusId && availableIds.has(layoutFocusId));
    if (oneHopActive && layoutFocusId) {
      edges = selectVerifiableOneHopEdges(edges, layoutFocusId);
      const hopIds = new Set([layoutFocusId, ...edges.flatMap((edge) => [edge.sourcePaperId, edge.targetPaperId])]);
      nodes = nodes.filter((node) => hopIds.has(node.paper.id));
    } else if (multiSeedActive) {
      if (multiOriginIntent === "union") edges = selectBalancedMultiSeedEdges(edges, visibleOriginIds);
      else {
        const independentEdges = edges.filter(isVerifiableSimilarityNeighborEdge);
        const connectionCount = new Map<string, number>();
        for (const node of nodes) {
          if (visibleOriginIds.includes(node.paper.id)) continue;
          connectionCount.set(node.paper.id, visibleOriginIds.filter((originId) => independentEdges.some((edge) => (edge.sourcePaperId === originId && edge.targetPaperId === node.paper.id) || (edge.targetPaperId === originId && edge.sourcePaperId === node.paper.id))).length);
        }
        const eligibleIds = new Set(nodes.filter((node) => visibleOriginIds.includes(node.paper.id)
          || (connectionCount.get(node.paper.id) || 0) >= 2).map((node) => node.paper.id));
        edges = independentEdges.filter((edge) => eligibleIds.has(edge.sourcePaperId) && eligibleIds.has(edge.targetPaperId));
      }
      const hopIds = new Set([...visibleOriginIds, ...edges.flatMap((edge) => [edge.sourcePaperId, edge.targetPaperId])]);
      nodes = nodes.filter((node) => hopIds.has(node.paper.id));
    }
    const visibleIds = new Set(nodes.map((node) => node.paper.id));
    edges = edges.filter((edge) => visibleIds.has(edge.sourcePaperId) && visibleIds.has(edge.targetPaperId));
    const activeTracks = map.tracks.filter((track) => nodes.some((node) => node.trackIds.includes(track.id)));
    const laneIndex = new Map(activeTracks.map((track, index) => [track.id, index]));
    const laneHeight = trackFilter === "all" ? (mode === "path" ? 132 : 112) : 320;
    const height = mode === "similarity" ? 610 : Math.max(500, activeTracks.length * laneHeight + 96);
    const width = 1120;
    const years = nodes.map((node) => Number(researchPaperYear(node.paper))).filter(Number.isFinite);
    const minYear = years.length ? Math.min(...years) : new Date().getFullYear() - 5;
    const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();
    const yearSpan = Math.max(1, maxYear - minYear);
    const pathLayout = completePathLayout || readingPathLayout(nodes, edges);
    const pathGroups = new Map<string, NetworkPaperNode[]>();
    for (const node of nodes) {
      const effectiveTrackId = trackFilter !== "all" && node.trackIds.includes(trackFilter) ? trackFilter : node.track.id;
      const key = `${effectiveTrackId}:${pathLayout.depthById.get(node.paper.id) || 0}`;
      pathGroups.set(key, [...(pathGroups.get(key) || []), node]);
    }
    const positions = new Map<string, NetworkNodePosition>();
    const oneHopNeighbors = nodes.filter((node) => node.paper.id !== layoutFocusId);
    nodes.forEach((node, index) => {
      const effectiveTrackId = trackFilter !== "all" && node.trackIds.includes(trackFilter) ? trackFilter : node.track.id;
      const lane = laneIndex.get(effectiveTrackId) || 0;
      const baseY = 76 + lane * laneHeight + laneHeight / 2;
      const year = Number(researchPaperYear(node.paper));
      let x = 95 + stableNetworkUnit(node.paper.id, 11) * 930;
      let y = 70 + stableNetworkUnit(node.paper.id, 29) * (height - 130);
      if (mode === "similarity" && scope === "one-hop" && layoutFocusId) {
        if (node.paper.id === layoutFocusId) {
          x = width / 2;
          y = height / 2;
        } else {
          const neighborIndex = Math.max(0, oneHopNeighbors.findIndex((item) => item.paper.id === node.paper.id));
          const ring = Math.floor(neighborIndex / 10);
          const ringSize = Math.min(10, oneHopNeighbors.length - ring * 10);
          const angle = -Math.PI / 2 + (neighborIndex % 10) / Math.max(1, ringSize) * Math.PI * 2;
          const radius = 178 + ring * 92;
          x = width / 2 + Math.cos(angle) * radius;
          y = height / 2 + Math.sin(angle) * radius;
        }
      } else if (mode === "citations") {
        x = 150 + ((Number.isFinite(year) ? year : maxYear) - minYear) / yearSpan * 820;
        y = baseY + ((index % 5) - 2) * 15;
      } else if (mode === "path") {
        const depth = pathLayout.depthById.get(node.paper.id) || 0;
        x = pathLayout.maxDepth ? 150 + depth / pathLayout.maxDepth * 820 : width / 2;
        const group = pathGroups.get(`${effectiveTrackId}:${depth}`) || [node];
        const groupIndex = Math.max(0, group.findIndex((item) => item.paper.id === node.paper.id));
        y = baseY + (groupIndex - (group.length - 1) / 2) * 32;
      }
      const radius = mode === "path" ? 15 : 8 + Math.min(7, Math.log10(Math.max(1, node.paper.citationCount + 1)) * 2.4);
      const trackPosition = Math.max(0, map.tracks.findIndex((track) => track.id === effectiveTrackId));
      const yearColorIndex = Math.max(0, Math.min(paperNetworkYearPalette.length - 1, Math.round(((Number.isFinite(year) ? year : minYear) - minYear) / yearSpan * (paperNetworkYearPalette.length - 1))));
      positions.set(node.paper.id, { x, y, radius, trackId: effectiveTrackId, color: mode === "similarity" ? paperNetworkYearPalette[yearColorIndex] : paperNetworkPalette[trackPosition % paperNetworkPalette.length] });
    });
    if (mode === "similarity" && !oneHopActive) relaxSimilarityPositions(nodes, edges, positions, visibleOriginIds, width, height);
    const seedConnections = new Map<string, Set<string>>();
    if (multiSeedActive) {
      for (const edge of edges.filter(isVerifiableSimilarityNeighborEdge)) {
        for (const originId of visibleOriginIds) {
          if (edge.sourcePaperId === originId && edge.targetPaperId !== originId) seedConnections.set(edge.targetPaperId, new Set([...(seedConnections.get(edge.targetPaperId) || []), originId]));
          if (edge.targetPaperId === originId && edge.sourcePaperId !== originId) seedConnections.set(edge.sourcePaperId, new Set([...(seedConnections.get(edge.sourcePaperId) || []), originId]));
        }
      }
    }
    const seedConnectionCount = new Map(Array.from(seedConnections.entries()).map(([id, origins]) => [id, origins.size]));
    const labelIds = new Set<string>();
    if (mode === "path" || scope === "one-hop") nodes.forEach((node) => labelIds.add(node.paper.id));
    else if (multiSeedActive) {
      visibleOriginIds.forEach((id) => labelIds.add(id));
      for (const [id, count] of seedConnectionCount) if (count >= 2) labelIds.add(id);
      for (const originId of visibleOriginIds) {
        edges.filter((edge) => edge.sourcePaperId === originId || edge.targetPaperId === originId).slice(0, 2)
          .forEach((edge) => labelIds.add(edge.sourcePaperId === originId ? edge.targetPaperId : edge.sourcePaperId));
      }
    }
    else for (const track of activeTracks) for (const role of ["foundation", "milestone", "frontier"] as ResearchTrackRole[]) {
      const candidate = nodes.filter((node) => node.trackIds.includes(track.id) && node.paper.role === role)
        .sort((left, right) => right.paper.citationCount - left.paper.citationCount)[0];
      if (candidate) labelIds.add(candidate.paper.id);
    }
    const yearTicks = Array.from(new Set(Array.from({ length: 5 }, (_, index) => Math.round(minYear + yearSpan * index / 4))));
    return { nodes, edges, positions, activeTracks, height, width, minYear, maxYear, yearTicks, pathLayout, labelIds, laneHeight, multiSeedActive, seedConnectionCount };
  }, [externalNodes, externalSimilarityEdges, map, mode, multiOriginIntent, scope, trackFilter, originPaperIds, layoutFocusId]);

  const originSet = new Set(originPaperIds);
  const interactionPaperId = hoveredPaperId || selectedPaperId;
  const focusedPaperIds = interactionPaperId ? new Set([interactionPaperId]) : layout.multiSeedActive ? originSet : new Set<string>();
  const connectedToSelection = new Set<string>(focusedPaperIds);
  for (const focusPaperId of focusedPaperIds) {
    for (const edge of layout.edges) {
      if (edge.sourcePaperId === focusPaperId) connectedToSelection.add(edge.targetPaperId);
      if (edge.targetPaperId === focusPaperId) connectedToSelection.add(edge.sourcePaperId);
    }
  }
  const nodeById = new Map(layout.nodes.map((node) => [node.paper.id, node]));
  const emptyMessage = mode === "path"
    ? (locale === "zh" ? "Pi 暂未形成有充分依据的阅读路径。可先浏览引用关系，或重试 Pi 分析。" : "Pi has not formed a defensible reading path yet. Explore citations or retry Pi analysis.")
    : mode === "citations"
      ? (locale === "zh" ? "当前论文库中还没有数据库确认的互引关系。" : "No database-verified citation links are available in this library yet.")
      : (locale === "zh" ? "这个方向还没有足够的真实论文节点。" : "This direction does not yet have enough real paper nodes.");

  return (
    <div className={`v2-paper-network-canvas ${mode}`} aria-label={locale === "zh" ? "论文关系网络" : "Paper relationship network"}>
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img">
        <title>{mode === "citations" ? (locale === "zh" ? "知识引用流" : "Knowledge citation flow") : mode === "path" ? (locale === "zh" ? "建议阅读路径" : "Suggested reading path") : (locale === "zh" ? "论文相似性地图" : "Paper similarity map")}</title>
        <desc>{mode === "citations" ? (locale === "zh" ? "箭头从被引工作指向后续引用它的工作。" : "Arrows run from cited work to later work that cites it.") : mode === "path" ? (locale === "zh" ? "编号表示建议阅读顺序。" : "Numbers show the suggested reading order.") : (locale === "zh" ? "选择论文只会联动列表和详情；可核验一跳只显示文献耦合或数据库核验的引用发现关系。" : "Selecting a paper only links the graph, list, and details; verified one-hop shows only bibliographic coupling or provider-verified citation discovery.")}</desc>
        <defs>
          <marker id="v2-paper-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 1 L 9 5 L 0 9 z" /></marker>
          <marker id="v2-path-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 1 L 9 5 L 0 9 z" /></marker>
        </defs>
        {mode !== "similarity" && layout.activeTracks.map((track, index) => {
          const y = 76 + index * layout.laneHeight;
          return <g className="v2-paper-network-lane" key={track.id}><rect x="18" y={y} width="1084" height={layout.laneHeight - 8} rx="12" /><text x="35" y={y + 24}>{locale === "zh" ? track.titleZh : track.titleEn}</text></g>;
        })}
        {mode === "path" ? <g className="v2-paper-network-columns path-columns">
          <text x="150" y="39">{locale === "zh" ? "01 起点" : "01 Start"}</text><text x="560" y="39" textAnchor="middle">{locale === "zh" ? "核心推进" : "Core progression"}</text><text x="970" y="39" textAnchor="end">{locale === "zh" ? "延伸前沿 →" : "Frontier →"}</text>
        </g> : mode === "citations" ? <g className="v2-paper-network-columns citation-columns">
          {layout.yearTicks.map((year) => { const x = 150 + (year - layout.minYear) / Math.max(1, layout.maxYear - layout.minYear) * 820; return <g key={year}><line x1={x} x2={x} y1="51" y2={layout.height - 24} /><text x={x} y="39" textAnchor="middle">{year}</text></g>; })}
        </g> : null}
        <g className="v2-paper-network-edges">
          {layout.edges.map((edge, index) => {
            const hasArrow = edge.kind === "path" || (edge.kind === "citation" && mode === "citations");
            const path = clippedPaperNetworkPath(edge, layout.positions, hasArrow);
            if (!path) return null;
            const selectedEdge = Array.from(focusedPaperIds).some((id) => id === edge.sourcePaperId || id === edge.targetPaperId);
            const key = paperNetworkEdgeKey(edge);
            const sourceTitle = nodeById.get(edge.sourcePaperId)?.paper.title || "";
            const targetTitle = nodeById.get(edge.targetPaperId)?.paper.title || "";
            const title = edge.kind === "citation"
              ? (locale === "zh" ? `知识流：${targetTitle} → ${sourceTitle}` : `Knowledge flow: ${targetTitle} → ${sourceTitle}`)
              : `${networkRelationLabel(edge, locale)} · ${locale === "zh" ? edge.relationshipZh : edge.relationshipEn}`;
            const discoveryGuide = edge.kind === "similarity" && ["verified_discovery", "recommendation_discovery"].includes(edge.relationKind);
            const className = `${edge.kind} ${discoveryGuide ? "discovery-fallback" : ""} ${focusedPaperIds.size ? selectedEdge ? "focused" : "muted" : ""}`;
            const delay = `${Math.min(index, 24) * 75}ms`;
            const similarityStrokeWidth = edge.kind === "similarity" ? discoveryGuide ? 1.25 : 1 + Math.max(0, Math.min(100, edge.confidence)) / 100 * 1.8 : undefined;
            return <g key={key} className="v2-paper-network-edge-group">
              {(edge.kind === "citation" || edge.kind === "path") && <path className={`edge-halo ${className}`} d={path} style={{ animationDelay: delay }} />}
              <path className={`edge-line revealing ${className}`} d={path} style={{ animationDelay: delay, strokeWidth: similarityStrokeWidth }} markerEnd={edge.kind === "path" ? "url(#v2-path-arrow)" : edge.kind === "citation" && mode === "citations" ? "url(#v2-paper-arrow)" : undefined}><title>{title}</title></path>
            </g>;
          })}
        </g>
        <g className="v2-paper-network-nodes">
          {layout.nodes.map((node) => {
            const position = layout.positions.get(node.paper.id);
            if (!position) return null;
            const selected = selectedPaperId === node.paper.id;
            const hovered = hoveredPaperId === node.paper.id;
            const state = paperStates[node.paper.canonicalId];
            const stateLabel = paperNetworkStateLabel(state, locale);
            const origin = originSet.has(node.paper.id);
            const muted = Boolean(scope === "all" && selectedPaperId && !connectedToSelection.has(node.paper.id));
            const sharedBridge = layout.multiSeedActive && !origin && (layout.seedConnectionCount.get(node.paper.id) || 0) >= 2;
            const showLabel = selected || origin || layout.labelIds.has(node.paper.id);
            const label = node.paper.title.length > 30 ? node.paper.title.slice(0, 29) + "…" : node.paper.title;
            const step = mode === "path" ? layout.pathLayout.stepById.get(node.paper.id) : undefined;
            const sharedCount = layout.seedConnectionCount.get(node.paper.id) || 0;
            return <g key={node.paper.id} className={`v2-paper-network-node ${mode === "path" ? "path-step" : ""} ${node.external ? "external-ghost" : ""} ${selected ? "selected" : ""} ${hovered ? "hovered" : ""} ${origin ? "origin" : ""} ${sharedBridge ? "shared-bridge" : ""} ${muted ? "muted" : ""} ${state || ""}`} transform={`translate(${position.x} ${position.y})`} role="button" tabIndex={0} aria-pressed={selected} aria-label={`${step ? `${locale === "zh" ? "第" : "Step "}${step}${locale === "zh" ? "步，" : ", "}` : ""}${node.paper.title}${origin ? (locale === "zh" ? "，起始论文" : ", origin paper") : ""}${selected ? (locale === "zh" ? "，已选中" : ", selected") : ""}${stateLabel ? `，${stateLabel}` : ""}${sharedBridge ? (locale === "zh" ? `，连接 ${sharedCount} 个种子` : `, shared by ${sharedCount} origins`) : ""}`} onPointerEnter={() => onHover(node.paper.id)} onPointerLeave={() => onHover(null)} onFocus={() => onHover(node.paper.id)} onBlur={() => onHover(null)} onClick={() => onSelect(node.paper.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.paper.id); } }}>
              {selected && <circle className="selection-ring" r={position.radius + 15}><title>{locale === "zh" ? "当前聚焦论文" : "Currently focused paper"}</title></circle>}
              {sharedBridge && <circle className="shared-ring" r={position.radius + 10}><title>{locale === "zh" ? `连接 ${sharedCount} 个种子的共同邻居` : `Neighbor shared by ${sharedCount} origins`}</title></circle>}
              <circle className="state-ring" r={position.radius + 5} />
              <circle className="paper-dot" r={position.radius} style={{ fill: position.color }} />
              {(state === "seen" || state === "snoozed") && <circle className="reading-state-marker" cx={position.radius * .72} cy={-position.radius * .72} r="3.2" aria-hidden="true" />}
              {mode === "path" ? <text className="path-step-number" textAnchor="middle" y="3.5">{step}</text> : <circle className="paper-core" r="3" />}
              {showLabel && <text className="v2-paper-node-label" y={-(position.radius + 9)} textAnchor="middle">{label}</text>}
              <title>{node.paper.title} · {researchPaperYear(node.paper)} · {node.paper.citationCount} {locale === "zh" ? "次引用" : "citations"}{stateLabel ? ` · ${stateLabel}` : ""}</title>
            </g>;
          })}
        </g>
      </svg>
      {!layout.nodes.length && <div className="v2-paper-network-empty">{emptyMessage}</div>}
    </div>
  );
}


export {
  PaperNetworkGraph,
  buildNetworkPaperNodes,
  researchNetworkOriginKey,
  candidateBelongsToTab,
  networkCandidateFitLabel,
  currentOriginEvidenceCount,
  researchNetworkSourceLabel,
  isResearchNetworkExpandResponse,
  researchNetworkHasNoNewCandidates,
  researchNetworkIssueSummary,
  buildExternalNetworkPaperNodes,
  externalNetworkEdges,
  networkRelationLabel,
  citationEvidenceProviderLabel,
  networkEvidenceLabel,
  paperNetworkSourceNotice,
};
export type { NetworkPaperNode, PaperDiscoveryTab, PaperNetworkMode, PaperNetworkScope, PaperNetworkUserState };
