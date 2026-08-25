function nonNegative(value) {
  return Math.max(0, Number(value) || 0);
}

export function buildMonitorBudgetDecision({
  globalRemaining,
  workspaceRemaining,
  spaceRemaining,
  otherSpaceUsages = [],
  minimumCalls = 16,
  fullScanMinimum = 16,
  compactScanMinimum = 6,
  baseReserve = 24,
}) {
  const remaining = Math.max(0, Math.min(
    nonNegative(globalRemaining),
    nonNegative(workspaceRemaining),
    nonNegative(spaceRemaining),
  ));
  const protectedForOtherSpaces = otherSpaceUsages.reduce(
    (sum, usage) => sum + Math.max(0, nonNegative(baseReserve) - nonNegative(usage)),
    0,
  );
  const backgroundRemaining = Math.max(0, Math.min(
    nonNegative(globalRemaining),
    nonNegative(spaceRemaining),
    nonNegative(workspaceRemaining) - protectedForOtherSpaces,
  ));
  const required = Math.max(1, nonNegative(minimumCalls));
  const fullAvailable = remaining >= required;
  const compactAvailable = required === fullScanMinimum
    && !fullAvailable
    && remaining >= compactScanMinimum;

  return {
    remaining,
    fullAvailable,
    compactAvailable,
    available: fullAvailable || compactAvailable,
    recommendedMode: fullAvailable ? "full" : compactAvailable ? "fresh_only" : "wait",
    compactMinimum: compactScanMinimum,
    estimatedFullScans: Math.floor(remaining / fullScanMinimum),
    backgroundRemaining,
    backgroundAvailable: backgroundRemaining >= required,
    protectedForOtherSpaces,
  };
}
