import type { ResearchPaperEdge } from "./research-map";

type MultiSeedEdge = Pick<ResearchPaperEdge, "kind" | "sourcePaperId" | "targetPaperId" | "relationKind" | "confidence">;

export type MultiOriginIntent = "shared" | "bridge" | "union";

type ExternalNetworkCandidate = {
  canonicalId: string;
  score: number;
  seedCoverage: number;
  bridge: boolean;
  relations: Array<{ seedCanonicalId: string; kind?: string }>;
};

type ActiveWindowNode = {
  id: string;
  citationCount: number;
  external?: boolean;
};

type ActiveWindowEdge = {
  sourcePaperId: string;
  targetPaperId: string;
};

/**
 * Keep force-layout work bounded without making papers outside the first result
 * page unreachable. Explicit origins/selections and discovered external nodes
 * win first; the remaining budget favours their neighbours and well-connected
 * papers so switching focus can bring any formal paper into the graph.
 */
export function selectPaperNetworkActiveNodeIds<T extends ActiveWindowNode>(
  nodes: T[],
  edges: ActiveWindowEdge[],
  originPaperIds: string[],
  selectedPaperId: string | null,
  limit = 72,
) {
  if (limit <= 0 || !nodes.length) return [] as string[];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const degree = new Map<string, number>();
  const preferredNeighbors = new Set<string>();
  const explicitIds = new Set([
    ...(selectedPaperId ? [selectedPaperId] : []),
    ...originPaperIds,
  ].filter((id) => nodesById.has(id)));

  for (const edge of edges) {
    if (!nodesById.has(edge.sourcePaperId) || !nodesById.has(edge.targetPaperId)) continue;
    degree.set(edge.sourcePaperId, (degree.get(edge.sourcePaperId) || 0) + 1);
    degree.set(edge.targetPaperId, (degree.get(edge.targetPaperId) || 0) + 1);
    if (explicitIds.has(edge.sourcePaperId)) preferredNeighbors.add(edge.targetPaperId);
    if (explicitIds.has(edge.targetPaperId)) preferredNeighbors.add(edge.sourcePaperId);
  }

  const selected: string[] = [];
  const selectedIds = new Set<string>();
  const add = (id: string) => {
    if (selected.length >= limit || selectedIds.has(id) || !nodesById.has(id)) return;
    selected.push(id);
    selectedIds.add(id);
  };

  if (selectedPaperId) add(selectedPaperId);
  originPaperIds.forEach(add);
  nodes.filter((node) => node.external).sort((left, right) => right.citationCount - left.citationCount || left.id.localeCompare(right.id)).forEach((node) => add(node.id));
  nodes.filter((node) => !selectedIds.has(node.id)).sort((left, right) =>
    Number(preferredNeighbors.has(right.id)) - Number(preferredNeighbors.has(left.id))
      || (degree.get(right.id) || 0) - (degree.get(left.id) || 0)
      || right.citationCount - left.citationCount
      || left.id.localeCompare(right.id)).forEach((node) => add(node.id));
  return selected;
}

export function paperNetworkEdgeKey(edge: MultiSeedEdge) {
  return `${edge.kind}:${edge.sourcePaperId}:${edge.targetPaperId}:${edge.relationKind}`;
}

const DATABASE_CITATION_SOURCES = new Set(["semantic-scholar", "openalex"]);

/**
 * Citation edges are binary scholarly facts, not model-scored relationships.
 * Fail closed unless the stored row uses the direct-citation relation, names a
 * provider that actually exposes citation/reference data, and carries the
 * deterministic confidence written by the verified ingestion paths.
 */
export function isDatabaseVerifiedCitationEdge(
  edge: Pick<ResearchPaperEdge, "kind" | "relationKind" | "confidence" | "evidenceSource">,
) {
  return edge.kind === "citation"
    && edge.relationKind.trim().toLocaleLowerCase() === "cites"
    && edge.confidence === 100
    && DATABASE_CITATION_SOURCES.has(edge.evidenceSource.trim().toLocaleLowerCase());
}

/**
 * Similarity-mode neighborhoods may contain both evidence-backed relations and
 * lightweight recommendation leads. A focused one-hop view must remain an
 * evidence view: bibliographic coupling is computed from shared references,
 * while verified discovery comes from a provider-confirmed citation/reference.
 */
export function isVerifiableSimilarityNeighborEdge(edge: Pick<ResearchPaperEdge, "kind" | "relationKind">) {
  return edge.kind === "similarity"
    && (edge.relationKind === "bibliographic_coupling" || edge.relationKind === "verified_discovery");
}

export function selectVerifiableOneHopEdges<T extends MultiSeedEdge>(edges: T[], focusPaperId: string, limit = 16) {
  if (!focusPaperId || limit <= 0) return [] as T[];
  return edges.filter((edge) => isVerifiableSimilarityNeighborEdge(edge)
      && (edge.sourcePaperId === focusPaperId || edge.targetPaperId === focusPaperId))
    .sort((left, right) => right.confidence - left.confidence
      || paperNetworkEdgeKey(left).localeCompare(paperNetworkEdgeKey(right)))
    .slice(0, limit);
}

function otherPaperId(edge: MultiSeedEdge, originId: string) {
  if (edge.sourcePaperId === originId) return edge.targetPaperId;
  if (edge.targetPaperId === originId) return edge.sourcePaperId;
  return "";
}

function edgeTrustRank(edge: MultiSeedEdge) {
  if (edge.kind === "citation") return 3;
  if (edge.kind === "similarity") return 2;
  if (edge.kind === "semantic") return 1;
  return 0;
}

export function selectBalancedMultiSeedEdges<T extends MultiSeedEdge>(edges: T[], originPaperIds: string[], perSeedLimit = 6, totalLimit = 18) {
  const originIds = Array.from(new Set(originPaperIds)).slice(0, 3);
  const originSet = new Set(originIds);
  const neighborOrigins = new Map<string, Set<string>>();
  for (const originId of originIds) {
    for (const edge of edges) {
      const neighborId = otherPaperId(edge, originId);
      if (!neighborId || neighborId === originId) continue;
      neighborOrigins.set(neighborId, new Set([...(neighborOrigins.get(neighborId) || []), originId]));
    }
  }

  const queues = new Map(originIds.map((originId) => {
    const bestByNeighbor = new Map<string, T>();
    for (const edge of edges) {
      const neighborId = otherPaperId(edge, originId);
      if (!neighborId || neighborId === originId) continue;
      const previous = bestByNeighbor.get(neighborId);
      if (!previous || edgeTrustRank(edge) > edgeTrustRank(previous)
        || (edgeTrustRank(edge) === edgeTrustRank(previous) && edge.confidence > previous.confidence)) {
        bestByNeighbor.set(neighborId, edge);
      }
    }
    const queue = Array.from(bestByNeighbor.entries()).sort(([leftNeighbor, left], [rightNeighbor, right]) => {
      const sharedDifference = (neighborOrigins.get(rightNeighbor)?.size || 0) - (neighborOrigins.get(leftNeighbor)?.size || 0);
      const directDifference = Number(originSet.has(rightNeighbor)) - Number(originSet.has(leftNeighbor));
      return sharedDifference || directDifference || edgeTrustRank(right) - edgeTrustRank(left) || right.confidence - left.confidence;
    }).map(([, edge]) => edge);
    return [originId, queue] as const;
  }));

  const cursors = new Map(originIds.map((originId) => [originId, 0]));
  const selected: T[] = [];
  const selectedKeys = new Set<string>();
  const selectedPerSeed = new Map(originIds.map((originId) => [originId, 0]));
  while (selected.length < totalLimit) {
    let advanced = false;
    for (const originId of originIds) {
      if ((selectedPerSeed.get(originId) || 0) >= perSeedLimit) continue;
      const queue = queues.get(originId) || [];
      let cursor = cursors.get(originId) || 0;
      while (cursor < queue.length) {
        const edge = queue[cursor];
        cursor += 1;
        cursors.set(originId, cursor);
        const key = paperNetworkEdgeKey(edge);
        if (selectedKeys.has(key)) continue;
        selected.push(edge);
        selectedKeys.add(key);
        for (const seedId of originIds) {
          if (edge.sourcePaperId === seedId || edge.targetPaperId === seedId) {
            selectedPerSeed.set(seedId, (selectedPerSeed.get(seedId) || 0) + 1);
          }
        }
        advanced = true;
        break;
      }
      if (selected.length >= totalLimit) break;
    }
    if (!advanced) break;
  }
  return selected;
}

function candidateOriginCoverage(candidate: ExternalNetworkCandidate, originIds: Set<string>) {
  const relatedOrigins = new Set(candidate.relations
    .filter((relation) => relation.kind !== "recommendation")
    .map((relation) => relation.seedCanonicalId)
    .filter((id) => originIds.has(id)));
  // `seedCoverage` belongs to the server response that produced the candidate.
  // Once the researcher changes origins it can no longer prove shared coverage.
  // Only independent relations to the currently active origins count here.
  return relatedOrigins.size;
}

/**
 * V1 multi-origin ranking for externally discovered papers. "shared" and
 * "bridge" answer a joint-origin question; "union" deliberately preserves a
 * fair slice around every origin instead of silently pretending that a union
 * is common territory.
 */
export function selectMultiOriginCandidates<T extends ExternalNetworkCandidate>(
  candidates: T[],
  originCanonicalIds: string[],
  intent: MultiOriginIntent,
  limit = 30,
) {
  const originIds = Array.from(new Set(originCanonicalIds)).slice(0, 3);
  const originSet = new Set(originIds);
  const unique = Array.from(new Map(candidates.map((candidate) => [candidate.canonicalId, candidate])).values());
  const rank = (left: T, right: T) => candidateOriginCoverage(right, originSet) - candidateOriginCoverage(left, originSet)
    || Number(right.bridge) - Number(left.bridge)
    || right.score - left.score;

  if (originIds.length < 2) return unique.sort(rank).slice(0, limit);
  if (intent === "shared") {
    const shared = unique.filter((candidate) => candidateOriginCoverage(candidate, originSet) >= 2).sort(rank);
    return shared.slice(0, limit);
  }
  if (intent === "bridge") {
    const bridges = unique.filter((candidate) => candidateOriginCoverage(candidate, originSet) >= 2)
      .sort((left, right) => Number(right.bridge) - Number(left.bridge) || rank(left, right));
    return bridges.slice(0, limit);
  }

  const queues = new Map(originIds.map((originId) => [originId, unique
    .filter((candidate) => candidate.relations.some((relation) => relation.kind !== "recommendation" && relation.seedCanonicalId === originId))
    .sort((left, right) => right.score - left.score)]));
  const cursors = new Map(originIds.map((originId) => [originId, 0]));
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  while (selected.length < limit) {
    let advanced = false;
    for (const originId of originIds) {
      const queue = queues.get(originId) || [];
      let cursor = cursors.get(originId) || 0;
      while (cursor < queue.length && selectedIds.has(queue[cursor].canonicalId)) cursor += 1;
      cursors.set(originId, cursor + 1);
      if (cursor >= queue.length) continue;
      selected.push(queue[cursor]);
      selectedIds.add(queue[cursor].canonicalId);
      advanced = true;
      if (selected.length >= limit) break;
    }
    if (!advanced) break;
  }
  for (const candidate of unique.sort(rank)) {
    if (selected.length >= limit) break;
    if (selectedIds.has(candidate.canonicalId)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.canonicalId);
  }
  return selected;
}
