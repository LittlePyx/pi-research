// Legacy discovery stored a 2,200-character prefix. Detect that boundary,
// rather than treating every abstract without a full stop as incomplete.
export function isPossiblyTruncatedAbstract(value: string) {
  const text = value.trim();
  return value.length === 2200 || text.length === 2200 || value.length === 12000 || text.length === 12000;
}

export function needsAbstractRecovery(value: string) {
  return value.trim().length < 400 || isPossiblyTruncatedAbstract(value) || isAbstractPlaceholder(value);
}

/** Legacy descriptions explicitly declaring that no source abstract was obtained. */
export function isAbstractPlaceholder(value: string) {
  return /(?:^|[.!?]\s+)(?:(?:the|original|paper['’]s)\s+)?abstract\s+(?:(?:is|was)\s+)?(?:missing|unavailable|not\s+(?:available|provided|found))\b/i.test(value)
    || /(?:^|[。！？；]\s*)(?:原始|论文)?摘要(?:缺失|未提供|尚未获取|暂未获取|暂不可用)/.test(value);
}

export const ABSTRACT_SCOPE_RULE = "Read the entire supplied abstract, including its closing scope statements. Audit limitations and absence claims too: 'not covered', 'not stated', or 'unknown whether covered' must not contradict a setting explicitly named anywhere in the abstract. Distinguish a named setting from unprovided theorem assumptions; acknowledge the named setting and qualify only the missing details. Never infer absence from a shortened excerpt.";
