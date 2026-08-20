import type { ResearchPaperEdge } from "./research-map";

type MultiSeedEdge = Pick<ResearchPaperEdge, "kind" | "sourcePaperId" | "targetPaperId" | "relationKind" | "confidence">;

export function paperNetworkEdgeKey(edge: MultiSeedEdge) {
  return `${edge.kind}:${edge.sourcePaperId}:${edge.targetPaperId}:${edge.relationKind}`;
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
