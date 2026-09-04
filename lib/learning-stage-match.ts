import type { LearningStepKind } from "./learning-path";

export type LearningStageTarget = {
  kind: LearningStepKind;
  titleZh: string; titleEn: string; goalZh: string; goalEn: string;
  readFocusZh: string; readFocusEn: string;
};
export type LearningStagePaper = {
  title: string; authors: string; abstractText: string;
  /** An explicit route role, never inferred from a scan time window. */
  routeRole?: string; publishedAt?: string | null;
};
export type LearningStageEvidence = {
  stageKey: string; paperKey: string;
  role: "primary"; quote: string; reason: string;
};

const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const noise = new Set("a an the and or of to in on for with by from as at this that these those its their which what how why establish understand learn master core main current recent basic essential advanced foundations foundation method methods milestone advances frontier project problem problems research theory theoretical original classical seminal work works paper papers introduction study evidence technique techniques result results using through towards into between via based approach analysis applications application overview".split(" "));
function terms(value: string) {
  return Array.from(new Set(normalize(value).split(/\s+/).filter((word) => word.length >= 3 && /[a-z]/.test(word) && !noise.has(word))));
}
function fingerprint(value: string) {
  // A cache-invalidation key, not an authenticity or cryptographic signature.
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
export function learningStageKey(stage: LearningStageTarget) {
  return `stage-match-v1:${fingerprint(JSON.stringify([stage.kind, stage.titleZh, stage.titleEn, stage.goalZh, stage.goalEn, stage.readFocusZh, stage.readFocusEn]))}`;
}
function paperKey(paper: LearningStagePaper) {
  return fingerprint(JSON.stringify([paper.title, paper.authors, paper.abstractText]));
}

/** Check supplied evidence, not model confidence, scores, age or citation counts. */
export function groundedStageEvidence(stage: LearningStageTarget, paper: LearningStagePaper, value: unknown): LearningStageEvidence | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const quote = typeof raw.quote === "string" ? raw.quote.trim().slice(0, 700) : "";
  const reason = typeof raw.reason === "string" ? raw.reason.trim().slice(0, 600) : "";
  if (raw.role !== "primary" || normalize(quote).length < 35 || reason.length < 20) return null;
  if (![paper.title, paper.abstractText].some((text) => normalize(text).includes(normalize(quote)))) return null;
  return { stageKey: learningStageKey(stage), paperKey: paperKey(paper), role: "primary", quote, reason };
}

/** Conservative admission: insufficient match is a gap, not a claim that a paper is bad. */
export function learningStageAccepts(stage: LearningStageTarget, paper: LearningStagePaper, evidence?: LearningStageEvidence): boolean {
  const titleTerms = terms(stage.titleEn);
  const goalTerms = terms(stage.goalEn);
  const focus = titleTerms.length >= 2 ? titleTerms : goalTerms;
  const text = ` ${normalize(`${paper.title} ${paper.authors} ${paper.abstractText}`)} `;
  const hits = focus.filter((term) => text.includes(` ${term} `));
  const grounded = evidence?.stageKey === learningStageKey(stage) && evidence.paperKey === paperKey(paper)
    && Boolean(groundedStageEvidence(stage, paper, evidence));
  // Model matching may explain semantic paraphrases. A nontrivial overlap is
  // still required when the stage names a specific subject, theorem or method.
  const topicFits = focus.length >= 2
    ? hits.length >= Math.min(2, focus.length) && hits.length / focus.length >= (grounded ? 0.3 : 0.6)
    : Boolean(grounded);
  if (!topicFits) return false;
  if (stage.kind === "foundation" || stage.kind === "milestone" || stage.kind === "prerequisite") {
    // A survey can be helpful reading, but cannot stand in for an original
    // theorem/breakthrough. Date, quality and popularity do not establish role.
    if (/\b(survey|review|overview)\b/i.test(paper.title)) return false;
    return Boolean(grounded) || paper.routeRole === stage.kind;
  }
  return true;
}

/** Keep the named stage subject in follow-up searches instead of recycling a broad route query. */
export function learningStageSearchQuery(stage: Pick<LearningStageTarget, "kind" | "titleEn">, fallback: string) {
  const named = terms(stage.titleEn);
  if (named.length < 2) return fallback;
  const fallbackText = ` ${normalize(fallback)} `;
  if (named.filter((term) => fallbackText.includes(` ${term} `)).length / named.length >= 0.6) return fallback;
  const clean = stage.titleEn.normalize("NFKD").replace(/[^\x20-\x7e]/g, " ").replace(/\b(AND|OR|NOT)\b/gi, " ").replace(/\s+/g, " ").trim();
  const suffix = stage.kind === "foundation" || stage.kind === "milestone" ? " original paper" : "";
  return `${clean.slice(0, 220 - suffix.length)}${suffix}`;
}
