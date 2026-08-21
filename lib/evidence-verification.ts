export type EvidenceVerificationVerdict = "verified" | "revise" | "insufficient";
export type EvidenceVerificationStatus = "not_required" | "verified" | "revised" | "degraded";

export const RECOMMENDATION_VERIFICATION_FIELDS = [
  "summary", "whyRead", "problem", "method", "contribution", "limitations", "readingFocus",
  "researchProblemImpact", "researchDecision",
] as const;

function cleanText(value: unknown, limit: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function boundedScore(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;
}

function allowedList(value: unknown, allowed: Set<string>, limit: number) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => cleanText(item, 120)).filter((item) => allowed.has(item)))).slice(0, limit);
}

function textList(value: unknown, limit: number, itemLimit = 320) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => cleanText(item, itemLimit)).filter(Boolean))).slice(0, limit);
}

export function sanitizeEvidenceVerificationDraft(
  value: unknown,
  options: {
    allowedFields?: readonly string[];
    allowedEvidenceIds?: Set<string>;
    evidenceById?: Map<string, string>;
    evidenceTexts?: string[];
    requireAllFields?: boolean;
  } = {},
) {
  const draft = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const allowedFields = new Set(options.allowedFields || []);
  const allowedEvidenceIds = options.allowedEvidenceIds || new Set<string>();
  const requestedVerdict: EvidenceVerificationVerdict = draft.verdict === "verified" || draft.verdict === "revise"
    ? draft.verdict : "insufficient";
  const supportedFields = allowedList(draft.supportedFields, allowedFields, allowedFields.size);
  const unsupportedFields = allowedList(draft.unsupportedFields, allowedFields, allowedFields.size);
  const overstatements = textList(draft.overstatements, 12);
  const contradictionRisks = textList(draft.contradictionRisks, 12);
  const supportedEvidenceIds = allowedList(draft.supportedEvidenceIds, allowedEvidenceIds, 30);
  const normalizedEvidenceTexts = (options.evidenceTexts || []).map((item) => cleanText(item, 12_000).toLowerCase()).filter(Boolean);
  const claimChecks = (Array.isArray(draft.claimChecks) ? draft.claimChecks : []).slice(0, 40).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const field = cleanText(item.field, 80);
    const claimExcerpt = cleanText(item.claimExcerpt, 500);
    const evidenceId = cleanText(item.evidenceId, 120);
    const evidenceQuote = cleanText(item.evidenceQuote, 900);
    const verdict = item.verdict === "supported" || item.verdict === "qualified" ? item.verdict : "unsupported";
    if (!allowedFields.has(field) || !claimExcerpt) return [];
    const normalizedQuote = evidenceQuote.toLowerCase();
    const idEvidence = evidenceId && allowedEvidenceIds.has(evidenceId)
      ? cleanText(options.evidenceById?.get(evidenceId) || "", 12_000).toLowerCase() : "";
    const quoteVerified = Boolean(normalizedQuote) && (idEvidence
      ? idEvidence.includes(normalizedQuote)
      : normalizedEvidenceTexts.some((text) => text.includes(normalizedQuote)));
    return [{
      field,
      claimExcerpt,
      evidenceId: idEvidence ? evidenceId : "",
      evidenceQuote: quoteVerified ? evidenceQuote : "",
      verdict: quoteVerified ? verdict : "unsupported" as const,
      reason: cleanText(item.reason, 500),
      grounded: quoteVerified && verdict !== "unsupported",
    }];
  });
  const reason = cleanText(draft.reason, 900);
  const coverageScore = boundedScore(draft.coverageScore);
  const groundedFields = new Set(claimChecks.filter((item) => item.grounded).map((item) => item.field));
  const allFieldsCovered = !options.requireAllFields || Array.from(allowedFields).every((field) => supportedFields.includes(field) && groundedFields.has(field));
  const clean = unsupportedFields.length === 0 && overstatements.length === 0 && contradictionRisks.length === 0
    && claimChecks.some((item) => item.grounded) && allFieldsCovered;
  const verdict: EvidenceVerificationVerdict = requestedVerdict === "verified" && (!clean || coverageScore < 90)
    ? "revise" : requestedVerdict;
  return {
    verdict,
    coverageScore,
    supportedFields,
    unsupportedFields,
    overstatements,
    contradictionRisks,
    supportedEvidenceIds,
    claimChecks,
    reason,
    clean: verdict === "verified" && clean && coverageScore >= 90,
  };
}

export function resolvedEvidenceVerificationStatus(input: {
  initial: ReturnType<typeof sanitizeEvidenceVerificationDraft>;
  revised?: ReturnType<typeof sanitizeEvidenceVerificationDraft> | null;
}) : EvidenceVerificationStatus {
  if (input.initial.clean) return "verified";
  if (input.revised?.clean) return "revised";
  return "degraded";
}

export function evidenceVerificationReport(input: {
  initial: ReturnType<typeof sanitizeEvidenceVerificationDraft>;
  revised?: ReturnType<typeof sanitizeEvidenceVerificationDraft> | null;
}) {
  const status = resolvedEvidenceVerificationStatus(input);
  const final = status === "revised" ? input.revised! : input.initial;
  return {
    status,
    coverageScore: final.coverageScore,
    supportedFields: final.supportedFields,
    supportedEvidenceIds: final.supportedEvidenceIds,
    claimChecks: final.claimChecks,
    unsupportedFields: final.unsupportedFields,
    overstatements: final.overstatements,
    contradictionRisks: final.contradictionRisks,
    reason: final.reason,
    initial: input.initial,
    revised: input.revised || null,
  };
}
