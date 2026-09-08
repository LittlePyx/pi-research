// A discovery gap is a request for evidence, never a field-wide absence claim.
// Do not interpolate the model's prose: even a local-scope disclaimer cannot
// make an unsupported "nobody has proved X" assertion safe.
export function researchGapSubject(value) {
  if (typeof value !== "string") return "";
  const subject = value.replace(/\s+/g, " ").trim();
  // Formatting/obvious-assertion guard, not a semantic verification algorithm.
  // Only a short topic is used inside a question; never restore the raw claim.
  if (!subject || subject.length > 96 || /[。！？!?;；\n]|\b(?:AND|OR|NOT)\b/.test(value)) return "";
  if (/空白|无人|尚未|未解决|不存在|缺乏|首次|从未|没有|未被|\b(?:unsolved|unexplored|nobody|never|unproven|no known|not yet|absence|lack|first ever)\b/i.test(subject)) return "";
  return subject;
}

export function researchGapQuestion(value, subjectValue, locale = "zh") {
  if (typeof value !== "string" || !value.trim()) return "";
  const subject = researchGapSubject(subjectValue);
  if (locale === "en") {
    return subject
      ? `What support or counterexamples do the current materials provide for “${subject}”?`
      : "What support or counterexamples do the current materials provide, and what needs further checking?";
  }
  return subject
    ? `关于“${subject}”，当前材料有哪些支持或反例？`
    : "当前材料有哪些支持或反例，还需要核对哪些文献？";
}

/**
 * @template {{kind: string, titleZh: string, titleEn: string, textZh: string, textEn: string}} T
 * @param {T} statement
 */
export function scopedSynthesisGap(statement) {
  if (statement.kind !== "evidence_gap") return statement;
  const titleZh = statement.titleZh === "待核对的证据" ? "" : researchGapSubject(statement.titleZh);
  const titleEn = statement.titleEn === "Evidence to check" ? "" : researchGapSubject(statement.titleEn);
  return {
    ...statement,
    evidenceScope: "current_materials",
    titleZh: titleZh || "待核对的证据",
    titleEn: titleEn || "Evidence to check",
    textZh: researchGapQuestion(statement.textZh, titleZh, "zh"),
    textEn: researchGapQuestion(statement.textEn, titleEn, "en"),
  };
}

export const RESEARCH_GAP_SCOPE_PROMPT = "Evidence gaps are questions about coverage of the supplied materials, not established open problems in the field. Missing papers, abstracts or failed sources never prove that a result does not exist. Use a neutral topic query to seek supporting and contradicting evidence, including classical work; do not encode an assumed negative conclusion in nextSearchQuery.";
