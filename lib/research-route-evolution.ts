export type ResearchRouteEvolutionStatus = "proposed" | "confirmed" | "dismissed" | "superseded";

export type ResearchRouteEvolutionDraft = {
  titleZh?: string;
  titleEn?: string;
  summaryZh?: string;
  summaryEn?: string;
  rationaleZh?: string;
  rationaleEn?: string;
  searchQueries?: string[];
  confidence?: number;
  sourcePaperIds?: string[];
  sourceStatementIds?: string[];
};

export type ResearchRouteEvolutionBasis = {
  trackId: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  searchQueries: string[];
  evidence: Array<{
    paperId: string;
    decidedAt: string | null;
    updatedAt: string | null;
    readingStatus: string;
    readingUpdatedAt: string | null;
    memoryUpdatedAt: string | null;
  }>;
  synthesisRevision: string;
  statementIds: string[];
};

export type SanitizedResearchRouteEvolution = {
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  rationaleZh: string;
  rationaleEn: string;
  searchQueries: string[];
  confidence: number;
  sourcePaperIds: string[];
  sourceStatementIds: string[];
};

function cleanText(value: unknown, limit: number) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function stableHash(values: string[]) {
  let first = 2166136261;
  let second = 2246822519;
  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second ^ code, 3266489917);
    }
    first = Math.imul(first ^ 31, 16777619);
    second = Math.imul(second ^ 127, 668265263);
  }
  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function uniqueStrings(values: unknown, allowed?: Set<string>, limit = 8) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.flatMap((value) => {
    const normalized = cleanText(value, 320);
    return normalized && (!allowed || allowed.has(normalized)) ? [normalized] : [];
  }))).slice(0, limit);
}

export function safeResearchRouteQuery(value: unknown) {
  const query = cleanText(value, 220);
  if (query.length < 8 || /(?:^|\s)(?:site|filetype|url|doi|author):/i.test(query)) return "";
  if (["{", "}", "<", ">", "[", "]"].some((character) => query.includes(character))
    || /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(query)) return "";
  return query;
}

export function researchRouteEvolutionInputRevision(basis: ResearchRouteEvolutionBasis) {
  const evidence = basis.evidence.map((item) => [
    item.paperId,
    item.decidedAt || "",
    item.updatedAt || "",
    item.readingStatus,
    item.readingUpdatedAt || "",
    item.memoryUpdatedAt || "",
  ].join(":")).sort();
  const statements = [...basis.statementIds].sort();
  const fields = [
    basis.trackId,
    basis.synthesisRevision,
    ...evidence,
    ...statements,
  ];
  return `route-evolution-v1:${evidence.length}:${statements.length}:${stableHash(fields)}`;
}

export function sanitizeResearchRouteEvolution(
  draft: ResearchRouteEvolutionDraft,
  basis: Pick<ResearchRouteEvolutionBasis, "titleZh" | "titleEn" | "summaryZh" | "summaryEn" | "searchQueries">,
  allowedPaperIds: Set<string>,
  allowedStatementIds: Set<string>,
) {
  const sourcePaperIds = uniqueStrings(draft.sourcePaperIds, allowedPaperIds, 8);
  const sourceStatementIds = uniqueStrings(draft.sourceStatementIds, allowedStatementIds, 8);
  if (!sourcePaperIds.length) return null;

  const titleZh = cleanText(draft.titleZh, 180) || cleanText(basis.titleZh, 180);
  const titleEn = cleanText(draft.titleEn, 220) || cleanText(basis.titleEn, 220);
  const summaryZh = cleanText(draft.summaryZh, 1000);
  const summaryEn = cleanText(draft.summaryEn, 1400);
  const rationaleZh = cleanText(draft.rationaleZh, 900);
  const rationaleEn = cleanText(draft.rationaleEn, 1200);
  const searchQueries = Array.from(new Set((Array.isArray(draft.searchQueries) ? draft.searchQueries : [])
    .map(safeResearchRouteQuery).filter(Boolean))).slice(0, 4);
  if (!titleZh || !titleEn || summaryZh.length < 24 || summaryEn.length < 40 || !rationaleZh || !rationaleEn || !searchQueries.length) return null;

  const confidenceCap = Math.min(92, 64 + sourcePaperIds.length * 5 + Math.min(12, sourceStatementIds.length * 3));
  const confidence = Math.max(0, Math.min(confidenceCap, Math.round(Number(draft.confidence) || 0)));
  const previousQueries = basis.searchQueries.map(safeResearchRouteQuery).filter(Boolean);
  const changed = titleZh !== cleanText(basis.titleZh, 180)
    || titleEn !== cleanText(basis.titleEn, 220)
    || summaryZh !== cleanText(basis.summaryZh, 1000)
    || summaryEn !== cleanText(basis.summaryEn, 1400)
    || JSON.stringify(searchQueries) !== JSON.stringify(previousQueries);
  if (!changed) return null;
  return { titleZh, titleEn, summaryZh, summaryEn, rationaleZh, rationaleEn, searchQueries, confidence, sourcePaperIds, sourceStatementIds } satisfies SanitizedResearchRouteEvolution;
}

export function researchRouteEvolutionDecisionAllowed(status: ResearchRouteEvolutionStatus, inputRevision: string, currentRevision: string) {
  return status === "proposed" && Boolean(inputRevision) && inputRevision === currentRevision;
}
