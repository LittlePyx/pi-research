export type PaperEvidenceLevel = "metadata" | "abstract" | "fulltext";
export type PaperEvidenceStatus = "queued" | "fetching" | "ready" | "partial" | "error";
export type PaperEvidenceClaimKind = "problem" | "method" | "result" | "contribution" | "limitation";

export type PaperEvidenceClaimInput = {
  kind: PaperEvidenceClaimKind;
  claimZh: string;
  claimEn: string;
  evidenceQuote: string;
  sectionLabel: string;
  locator: string;
  confidence: number;
};

export const PAPER_EVIDENCE_LEVEL_RANK: Record<PaperEvidenceLevel, number> = {
  metadata: 0,
  abstract: 1,
  fulltext: 2,
};

export const MUST_READ_EVIDENCE_REQUIREMENTS = {
  minimumGroundedClaims: 3,
  minimumCoverageScore: 70,
  maximumUnsupportedClaims: 1,
} as const;

export function fullTextEvidenceQualifiesForMustRead(input: {
  level: PaperEvidenceLevel;
  status: PaperEvidenceStatus;
  groundedClaims: number;
  coverageScore: number;
  unsupportedClaims: number;
}) {
  return input.level === "fulltext" && input.status === "ready"
    && input.groundedClaims >= MUST_READ_EVIDENCE_REQUIREMENTS.minimumGroundedClaims
    && input.coverageScore >= MUST_READ_EVIDENCE_REQUIREMENTS.minimumCoverageScore
    && input.unsupportedClaims <= MUST_READ_EVIDENCE_REQUIREMENTS.maximumUnsupportedClaims;
}

export function evidenceConfidenceCap(level: PaperEvidenceLevel) {
  return level === "fulltext" ? 94 : level === "abstract" ? 68 : 35;
}

export function normalizeEvidenceText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function evidenceQuoteIsGrounded(sourceText: string, quote: string) {
  const normalizedSource = normalizeEvidenceText(sourceText).toLocaleLowerCase();
  const normalizedQuote = normalizeEvidenceText(quote).toLocaleLowerCase();
  return normalizedQuote.length >= 24 && normalizedSource.includes(normalizedQuote);
}

export function boundedEvidenceConfidence(level: PaperEvidenceLevel, value: unknown, grounded: boolean) {
  const requested = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return Math.min(requested, grounded ? evidenceConfidenceCap(level) : 42);
}

export function evidenceCoverageScore(claims: Array<{ grounded: boolean; locator?: string }>) {
  if (!claims.length) return 0;
  const grounded = claims.filter((claim) => claim.grounded).length;
  const located = claims.filter((claim) => claim.grounded && Boolean(claim.locator?.trim())).length;
  return Math.round(((grounded / claims.length) * 0.75 + (located / claims.length) * 0.25) * 100);
}

export function extractArxivId(canonicalId: string, url: string) {
  const canonical = canonicalId.match(/^arxiv:([^?#/]+)$/i)?.[1];
  if (canonical) return canonical.replace(/v\d+$/i, "");
  const matched = url.match(/arxiv\.org\/(?:abs|html|pdf)\/([^?#]+?)(?:\.pdf)?$/i)?.[1];
  return matched ? decodeURIComponent(matched).replace(/v\d+$/i, "") : "";
}

export function safeEvidenceSourceUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return "";
    const host = parsed.hostname.toLocaleLowerCase();
    const allowed = host === "arxiv.org" || host.endsWith(".arxiv.org")
      || host === "ebi.ac.uk" || host.endsWith(".ebi.ac.uk")
      || host === "europepmc.org" || host.endsWith(".europepmc.org")
      || host === "ncbi.nlm.nih.gov" || host.endsWith(".ncbi.nlm.nih.gov");
    return allowed ? parsed.toString() : "";
  } catch {
    return "";
  }
}
