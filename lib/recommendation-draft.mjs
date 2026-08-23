const narrativeFields = [
  ["summaryZh", 40], ["summaryEn", 30],
  ["whyReadZh", 30], ["whyReadEn", 25],
  ["problemZh", 12], ["problemEn", 18],
  ["methodZh", 12], ["methodEn", 18],
  ["contributionZh", 12], ["contributionEn", 18],
  ["limitationsZh", 12], ["limitationsEn", 18],
  ["readingFocusZh", 12], ["readingFocusEn", 18],
];

function boundedText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function questionCount(value) {
  return Array.isArray(value) ? value.filter((item) => boundedText(item)).length : 0;
}

export function recommendationDraftMissingFields(draft) {
  const missing = narrativeFields
    .filter(([field, minimum]) => boundedText(draft[field]).length < minimum)
    .map(([field]) => String(field));
  if (questionCount(draft.researchQuestionsZh) < 2) missing.push("researchQuestionsZh");
  if (questionCount(draft.researchQuestionsEn) < 2) missing.push("researchQuestionsEn");
  return missing;
}

export function hasCompleteRecommendationDraft(draft) {
  return recommendationDraftMissingFields(draft).length === 0;
}

const emptyDraftPattern = /(?:draft\s+(?:is\s+)?empty|empty\s+draft|no\s+populated\s+substantive\s+fields|draft\s+(?:is\s+)?incomplete|草稿.{0,8}(?:为空|不完整)|没有.{0,8}实质性字段)/i;

export function verifierContradictsCompleteDraft(reason, draft) {
  return hasCompleteRecommendationDraft(draft) && emptyDraftPattern.test(boundedText(reason));
}

export function isRetryableEmptyDraftDegradation(draft) {
  if (draft.verificationStatus !== "degraded") return false;
  const report = draft.verificationReport && typeof draft.verificationReport === "object"
    ? draft.verificationReport
    : {};
  if (emptyDraftPattern.test(`${boundedText(draft.screeningReason)} ${boundedText(report.reason)}`)) return true;
  const fractionalCoverageMisread = Number(report.coverageScore) > 0 && Number(report.coverageScore) <= 1
    && Array.isArray(report.supportedFields) && report.supportedFields.length >= 4
    && Array.isArray(report.claimChecks) && report.claimChecks.length >= 4
    && (!Array.isArray(report.unsupportedFields) || report.unsupportedFields.length === 0)
    && (!Array.isArray(report.overstatements) || report.overstatements.length === 0)
    && (!Array.isArray(report.contradictionRisks) || report.contradictionRisks.length === 0);
  return fractionalCoverageMisread;
}
