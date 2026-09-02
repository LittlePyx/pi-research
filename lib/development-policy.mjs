export function developmentUnboundedEnabled(value) {
  return ["1", "true", "yes", "unbounded"].includes(String(value || "").trim().toLocaleLowerCase());
}

export function retryAttemptAllowed({ unbounded, attemptCount, maximumAttempts }) {
  return unbounded || Math.max(0, Number(attemptCount) || 0) < Math.max(1, Number(maximumAttempts) || 1);
}
