export type ResearchProblemStage = "literature" | "theory" | "method" | "experiment" | "writing";
export type ResearchProblemStatus = "draft" | "active" | "paused" | "resolved";
export type ResearchHypothesisStatus = "proposed" | "confirmed" | "rejected";
export type ResearchProblemActionStatus = "proposed" | "accepted" | "done" | "dismissed";

export type ResearchProblemDraft = {
  question?: unknown;
  objective?: unknown;
  scope?: unknown;
  successCriteria?: unknown;
  stage?: unknown;
  hypotheses?: unknown;
};

export type ResearchProblemAssessmentDraft = {
  summaryZh?: unknown;
  summaryEn?: unknown;
  changeZh?: unknown;
  changeEn?: unknown;
  uncertaintyZh?: unknown;
  uncertaintyEn?: unknown;
  nextDecisionZh?: unknown;
  nextDecisionEn?: unknown;
  nextSearchQuery?: unknown;
  confidence?: unknown;
  sourceStatementIds?: unknown;
  hypothesisImpacts?: unknown;
  actions?: unknown;
};

export function cleanResearchProblemText(value: unknown, limit: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function researchProblemScore(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
}

export function researchProblemStage(value: unknown): ResearchProblemStage {
  return value === "theory" || value === "method" || value === "experiment" || value === "writing" ? value : "literature";
}

function safeEnglishQuery(value: unknown) {
  const query = cleanResearchProblemText(value, 240);
  return /^[\x20-\x7E]{4,240}$/.test(query) && !/\b(?:AND|OR|NOT)\b/.test(query) ? query : "";
}

function sourceIds(value: unknown, allowed: Set<string>, limit = 12) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => cleanResearchProblemText(item, 120)).filter((item) => allowed.has(item)))).slice(0, limit);
}

export function sanitizeResearchProblemDraft(draft: ResearchProblemDraft, allowedStatementIds: Set<string>) {
  const question = cleanResearchProblemText(draft.question, 520);
  const objective = cleanResearchProblemText(draft.objective, 700);
  const scope = cleanResearchProblemText(draft.scope, 700);
  const successCriteria = cleanResearchProblemText(draft.successCriteria, 700);
  const hypotheses = (Array.isArray(draft.hypotheses) ? draft.hypotheses : []).slice(0, 5).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const statement = cleanResearchProblemText(item.statement, 520);
    if (!statement) return [];
    return [{
      statement,
      rationale: cleanResearchProblemText(item.rationale, 700),
      confidence: researchProblemScore(item.confidence),
      sourceStatementIds: sourceIds(item.sourceStatementIds, allowedStatementIds, 8),
    }];
  });
  if (!question || !objective || !scope || !successCriteria) throw new Error("Pi returned an incomplete research problem draft");
  return { question, objective, scope, successCriteria, stage: researchProblemStage(draft.stage), hypotheses };
}

export function sanitizeResearchProblemAssessment(draft: ResearchProblemAssessmentDraft, allowedStatementIds: Set<string>, allowedHypothesisIds: Set<string>) {
  const hypothesisImpacts = (Array.isArray(draft.hypothesisImpacts) ? draft.hypothesisImpacts : []).slice(0, 8).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const hypothesisId = cleanResearchProblemText(item.hypothesisId, 120);
    const relation = cleanResearchProblemText(item.relation, 40);
    if (!allowedHypothesisIds.has(hypothesisId) || !["supports", "challenges", "qualifies", "method", "gap"].includes(relation)) return [];
    const explanationZh = cleanResearchProblemText(item.explanationZh, 650);
    const explanationEn = cleanResearchProblemText(item.explanationEn, 850);
    if (!explanationZh || !explanationEn) return [];
    return [{ hypothesisId, relation, explanationZh, explanationEn, confidence: researchProblemScore(item.confidence), sourceStatementIds: sourceIds(item.sourceStatementIds, allowedStatementIds, 8) }];
  });
  const actions = (Array.isArray(draft.actions) ? draft.actions : []).slice(0, 3).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const kind = ["read", "compare", "verify", "search", "decide"].includes(cleanResearchProblemText(item.kind, 30))
      ? cleanResearchProblemText(item.kind, 30) : "verify";
    const titleZh = cleanResearchProblemText(item.titleZh, 260);
    const titleEn = cleanResearchProblemText(item.titleEn, 360);
    if (!titleZh || !titleEn) return [];
    return [{ kind, titleZh, titleEn, rationaleZh: cleanResearchProblemText(item.rationaleZh, 520), rationaleEn: cleanResearchProblemText(item.rationaleEn, 720) }];
  });
  const result = {
    summaryZh: cleanResearchProblemText(draft.summaryZh, 1000),
    summaryEn: cleanResearchProblemText(draft.summaryEn, 1400),
    changeZh: cleanResearchProblemText(draft.changeZh, 700),
    changeEn: cleanResearchProblemText(draft.changeEn, 950),
    uncertaintyZh: cleanResearchProblemText(draft.uncertaintyZh, 700),
    uncertaintyEn: cleanResearchProblemText(draft.uncertaintyEn, 950),
    nextDecisionZh: cleanResearchProblemText(draft.nextDecisionZh, 520),
    nextDecisionEn: cleanResearchProblemText(draft.nextDecisionEn, 720),
    nextSearchQuery: safeEnglishQuery(draft.nextSearchQuery),
    confidence: researchProblemScore(draft.confidence),
    sourceStatementIds: sourceIds(draft.sourceStatementIds, allowedStatementIds),
    hypothesisImpacts,
    actions,
  };
  if (!result.summaryZh || !result.summaryEn || !result.uncertaintyZh || !result.uncertaintyEn || !result.nextDecisionZh || !result.nextDecisionEn) {
    throw new Error("Pi returned an incomplete research problem assessment");
  }
  return result;
}

export async function researchProblemInputRevision(input: {
  problemUpdatedAt: string;
  synthesisRevision: string;
  hypotheses: Array<{ id: string; statement: string; status: string; updatedAt: string }>;
}) {
  const stable = {
    problemUpdatedAt: input.problemUpdatedAt,
    synthesisRevision: input.synthesisRevision,
    hypotheses: [...input.hypotheses].sort((left, right) => left.id.localeCompare(right.id)),
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(stable)));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
