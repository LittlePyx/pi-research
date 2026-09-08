// A discovery gap is a request for evidence, never a field-wide absence claim.
// Do not interpolate the model's prose: even a local-scope disclaimer cannot
// make an unsupported "nobody has proved X" assertion safe.
export function researchGapQuestion(value, query, locale = "zh") {
  if (typeof value !== "string" || !value.trim()) return "";
  const topic = typeof query === "string" ? query.replace(/\s+/g, " ").trim() : "";
  const usable = /^[\x20-\x7E]{4,220}$/.test(topic);
  if (locale === "en") {
    return usable
      ? `Which papers found with “${topic}” could supplement the evidence in this route?`
      : "Which additional papers would help assess the evidence in this route?";
  }
  return usable
    ? `检索“${topic}”能找到哪些文献，补充当前路线的证据？`
    : "还需要哪些文献，才能核对当前路线的证据？";
}

export const RESEARCH_GAP_SCOPE_PROMPT = "Evidence gaps are questions about coverage of the supplied materials, not established open problems in the field. Missing papers, abstracts or failed sources never prove that a result does not exist. Use a neutral topic query to seek supporting and contradicting evidence, including classical work; do not encode an assumed negative conclusion in nextSearchQuery.";
