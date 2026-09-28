// Legacy discovery stored a 2,200-character prefix. Detect that boundary,
// rather than treating every abstract without a full stop as incomplete.
export function isPossiblyTruncatedAbstract(value: string) {
  const text = value.trim();
  return value.length === 2200 || text.length === 2200 || value.length === 12000 || text.length === 12000;
}

export function needsAbstractRecovery(value: string) {
  return value.trim().length < 400 || isPossiblyTruncatedAbstract(value);
}

export const ABSTRACT_SCOPE_RULE = "Read the entire supplied abstract, including its closing scope statements. Audit limitations and absence claims too: 'not covered', 'not stated', or 'unknown whether covered' must not contradict a setting explicitly named anywhere in the abstract. Distinguish a named setting from unprovided theorem assumptions; acknowledge the named setting and qualify only the missing details. Never infer absence from a shortened excerpt.";
