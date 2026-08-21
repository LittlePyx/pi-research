export type ResearchActionKind = "read" | "compare" | "verify" | "search" | "decide";

export type ResearchActionDraft = {
  headlineZh?: unknown;
  headlineEn?: unknown;
  resultZh?: unknown;
  resultEn?: unknown;
  decisionZh?: unknown;
  decisionEn?: unknown;
  limitationsZh?: unknown;
  limitationsEn?: unknown;
  searchQuery?: unknown;
  paperIds?: unknown;
  claimIds?: unknown;
  steps?: unknown;
  comparisonRows?: unknown;
};

function text(value: unknown, limit: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function allowedIds(value: unknown, allowed: Set<string>, limit: number) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => text(item, 120)).filter((item) => allowed.has(item)))).slice(0, limit);
}

export function researchActionKind(value: unknown): ResearchActionKind {
  return value === "read" || value === "compare" || value === "search" || value === "decide" ? value : "verify";
}

export function safeResearchSearchQuery(value: unknown) {
  const query = text(value, 240);
  if (!/^[\x20-\x7E]{4,240}$/.test(query)) return "";
  if (/\b(?:site|filetype):/i.test(query) || /[{}<>]/.test(query)) return "";
  return query;
}

export function sanitizeResearchActionDraft(
  draft: ResearchActionDraft,
  kind: ResearchActionKind,
  validPaperIds: Set<string>,
  validClaimIds: Set<string>,
) {
  const headlineZh = text(draft.headlineZh, 260);
  const headlineEn = text(draft.headlineEn, 360);
  const resultZh = text(draft.resultZh, 2400);
  const resultEn = text(draft.resultEn, 3200);
  const decisionZh = text(draft.decisionZh, 900);
  const decisionEn = text(draft.decisionEn, 1200);
  const limitationsZh = text(draft.limitationsZh, 900);
  const limitationsEn = text(draft.limitationsEn, 1200);
  const paperIds = allowedIds(draft.paperIds, validPaperIds, 8);
  const claimIds = allowedIds(draft.claimIds, validClaimIds, 20);
  const searchQuery = kind === "search" ? safeResearchSearchQuery(draft.searchQuery) : "";
  const steps = (Array.isArray(draft.steps) ? draft.steps : []).slice(0, 8).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const titleZh = text(item.titleZh, 260);
    const titleEn = text(item.titleEn, 360);
    const detailZh = text(item.detailZh, 700);
    const detailEn = text(item.detailEn, 950);
    if (!titleZh || !titleEn || !detailZh || !detailEn) return [];
    return [{ titleZh, titleEn, detailZh, detailEn, paperIds: allowedIds(item.paperIds, validPaperIds, 4), claimIds: allowedIds(item.claimIds, validClaimIds, 8) }];
  });
  const comparisonRows = kind === "compare" ? (Array.isArray(draft.comparisonRows) ? draft.comparisonRows : []).slice(0, 8).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const dimensionZh = text(item.dimensionZh, 180);
    const dimensionEn = text(item.dimensionEn, 240);
    const findingZh = text(item.findingZh, 700);
    const findingEn = text(item.findingEn, 950);
    if (!dimensionZh || !dimensionEn || !findingZh || !findingEn) return [];
    return [{ dimensionZh, dimensionEn, findingZh, findingEn, paperIds: allowedIds(item.paperIds, validPaperIds, 4), claimIds: allowedIds(item.claimIds, validClaimIds, 8) }];
  }) : [];

  if (!headlineZh || !headlineEn || !resultZh || !resultEn || !decisionZh || !decisionEn || !limitationsZh || !limitationsEn) {
    throw new Error("Pi returned an incomplete research action result");
  }
  if (kind === "search" && !searchQuery) throw new Error("Pi did not return a safe scholarly search query");
  if (kind === "compare" && paperIds.length < 2) throw new Error("A comparison requires at least two verified papers");
  if (!steps.length) throw new Error("Pi did not return an executable research action plan");

  return {
    headlineZh,
    headlineEn,
    resultZh,
    resultEn,
    decisionZh,
    decisionEn,
    limitationsZh,
    limitationsEn,
    searchQuery,
    paperIds,
    claimIds,
    deliverable: { steps, comparisonRows },
  };
}

export async function researchActionInputRevision(input: {
  actionUpdatedAt: string;
  problemUpdatedAt: string;
  assessmentRevision: string;
  synthesisRevision: string;
  paperRevision: string;
  evidenceRevision: string;
}) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input)));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
