export type ResearchSynthesisKind = "consensus" | "disagreement" | "qualification" | "method_lineage" | "evidence_gap";

export type ResearchSynthesisSourceClaim = {
  claimId: string;
  paperId: string;
  evidenceLevel: "metadata" | "abstract" | "fulltext";
  textHash: string;
};

export type ResearchSynthesisStatementDraft = {
  kind?: unknown;
  titleZh?: unknown;
  titleEn?: unknown;
  textZh?: unknown;
  textEn?: unknown;
  confidence?: unknown;
  sourceClaimIds?: unknown;
};

export type SanitizedResearchSynthesisStatement = {
  kind: ResearchSynthesisKind;
  titleZh: string;
  titleEn: string;
  textZh: string;
  textEn: string;
  confidence: number;
  sourceClaimIds: string[];
  sourcePaperIds: string[];
};

const KINDS = new Set<ResearchSynthesisKind>(["consensus", "disagreement", "qualification", "method_lineage", "evidence_gap"]);

function clean(value: unknown, limit: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function score(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
}

export async function researchSynthesisInputRevision(claims: ResearchSynthesisSourceClaim[]) {
  const stable = [...claims]
    .sort((left, right) => left.claimId.localeCompare(right.claimId))
    .map((claim) => [claim.claimId, claim.paperId, claim.evidenceLevel, claim.textHash]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(stable)));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function sanitizeResearchSynthesisStatements(
  drafts: ResearchSynthesisStatementDraft[],
  claimSources: Map<string, { paperId: string; evidenceLevel: "metadata" | "abstract" | "fulltext" }>,
) {
  const output: SanitizedResearchSynthesisStatement[] = [];
  for (const draft of drafts.slice(0, 10)) {
    const kind = clean(draft.kind, 40) as ResearchSynthesisKind;
    if (!KINDS.has(kind)) continue;
    const sourceClaimIds = Array.from(new Set(Array.isArray(draft.sourceClaimIds)
      ? draft.sourceClaimIds.map((id) => clean(id, 120)).filter((id) => claimSources.has(id))
      : [])).slice(0, 8);
    const sourcePaperIds = Array.from(new Set(sourceClaimIds.map((id) => claimSources.get(id)!.paperId)));
    if (!sourceClaimIds.length) continue;
    if ((kind === "consensus" || kind === "disagreement" || kind === "method_lineage") && sourcePaperIds.length < 2) continue;
    const titleZh = clean(draft.titleZh, 120);
    const titleEn = clean(draft.titleEn, 180);
    const textZh = clean(draft.textZh, 700);
    const textEn = clean(draft.textEn, 950);
    if (!titleZh || !titleEn || !textZh || !textEn) continue;
    const fulltextCount = sourceClaimIds.filter((id) => claimSources.get(id)?.evidenceLevel === "fulltext").length;
    const cap = fulltextCount >= 2 ? 92 : fulltextCount === 1 ? 78 : 64;
    output.push({
      kind,
      titleZh,
      titleEn,
      textZh,
      textEn,
      confidence: Math.min(score(draft.confidence), kind === "evidence_gap" ? Math.min(cap, 80) : cap),
      sourceClaimIds,
      sourcePaperIds,
    });
  }
  return output;
}

export function primaryResearchSynthesisGap<T extends { kind: ResearchSynthesisKind; confidence: number }>(statements: T[]) {
  return statements.filter((statement) => statement.kind === "evidence_gap")
    .sort((left, right) => right.confidence - left.confidence)[0] || null;
}
