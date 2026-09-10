import type { ResearchTrack } from "./research-map";

// Coverage describes this workspace's collection, never the state of a field.
export function routeMaterialState(track: Pick<ResearchTrack, "papers" | "pendingEvidenceCount" | "queuedForReviewCount" | "reviewingForReviewCount">) {
  const seen = new Set<string>();
  const papers = track.papers.filter(paper => {
    const identity = paper.canonicalId || paper.id;
    if (paper.curationStatus === "deactivated" || !paper.title.trim() || seen.has(identity)) return false;
    seen.add(identity); return true;
  });
  return {
    status: papers.length ? "materials_available" as const : "exploring" as const,
    paperIds: papers.map(paper => paper.id),
    missingCollectionRoles: (["foundation", "milestone", "frontier"] as const).filter(role => !papers.some(paper => paper.role === role)),
    pendingConfirmationCount: Math.max(0, track.pendingEvidenceCount || 0),
    inReviewCount: Math.max(0, track.queuedForReviewCount || 0) + Math.max(0, track.reviewingForReviewCount || 0),
    researchGapStatus: "not_established" as const,
  };
}

type Source = { paperId: string; evidenceQuote: string; evidenceLevel: string };
type Statement = { kind: string; sourcePaperIds: string[]; sources: Source[] };
export function currentRouteStatements<T extends Statement>(synthesis: { status: string; stale: boolean; statements: T[] } | null) {
  if (!synthesis || synthesis.stale || synthesis.status !== "ready") return [];
  return synthesis.statements.filter(statement => statement.sourcePaperIds.length > 0
    && statement.sourcePaperIds.every(id => statement.sources.some(source => source.paperId === id
      && source.evidenceLevel === "abstract" && source.evidenceQuote.trim().length > 0)));
}
