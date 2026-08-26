import type { ResearchTrackBuildStatus, ResearchTrackRole, ResearchTrackSourceStatus } from "./research-map";

export const MAX_RESEARCH_TRACK_BUILD_ATTEMPTS = 3;

export type ResearchTrackSourceBatch<T> = {
  source: string;
  role: ResearchTrackRole;
  result: PromiseSettledResult<T[]>;
};

export type ResearchTrackSourceReport = {
  source: string;
  role: ResearchTrackRole | "baseline";
  status: ResearchTrackSourceStatus;
  candidateCount: number;
  error?: string;
};

export type ResearchTrackBuildResolutionInput = {
  existingPaperCount: number;
  selectedPaperCount: number;
  candidateCount: number;
  sourceSuccessCount: number;
  sourceFailureCount: number;
  modelAttempted: boolean;
  modelSucceeded: boolean;
  attemptCount: number;
  maxAttempts?: number;
};

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Source unavailable");
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 240);
}

/**
 * Keeps every successful provider batch even when sibling requests fail. A
 * provider's empty response is different from an unavailable provider and is
 * therefore retained as an honest source status rather than a thrown error.
 */
export function mergeResearchTrackSourceBatches<T>(batches: ResearchTrackSourceBatch<T>[]) {
  const candidates: T[] = [];
  const sources: ResearchTrackSourceReport[] = [];
  for (const batch of batches) {
    if (batch.result.status === "fulfilled") {
      candidates.push(...batch.result.value);
      sources.push({
        source: batch.source,
        role: batch.role,
        status: batch.result.value.length ? "ok" : "empty",
        candidateCount: batch.result.value.length,
      });
    } else {
      sources.push({ source: batch.source, role: batch.role, status: "failed", candidateCount: 0, error: safeError(batch.result.reason) });
    }
  }
  return { candidates, sources, errors: sources.flatMap((source) => source.error ? [source.error] : []) };
}

/**
 * A route is ready only when at least one paper is visible and the latest
 * source/model pass completed cleanly. Existing evidence makes a degraded pass
 * partial, never empty; a route without visible evidence remains retryable up
 * to a fixed cap and then reports an honest empty or failed terminal state.
 */
export function resolveResearchTrackBuildStatus(input: ResearchTrackBuildResolutionInput): ResearchTrackBuildStatus {
  const maxAttempts = Math.max(1, input.maxAttempts || MAX_RESEARCH_TRACK_BUILD_ATTEMPTS);
  const visiblePaperCount = Math.max(0, input.existingPaperCount) + Math.max(0, input.selectedPaperCount);
  const degraded = input.sourceFailureCount > 0 || (input.modelAttempted && !input.modelSucceeded);
  if (visiblePaperCount > 0) return degraded ? "partial" : "ready";
  if (input.attemptCount < maxAttempts) return "retryable";
  if (degraded || input.sourceSuccessCount === 0) return "failed";
  return "empty";
}

export function defensiveResearchTrackBuildStatus(
  storedStatus: string,
  expansionCount: number,
  visiblePaperCount: number,
): ResearchTrackBuildStatus {
  const allowed = new Set<ResearchTrackBuildStatus>(["queued", "retryable", "partial", "empty", "failed", "ready"]);
  const normalized = allowed.has(storedStatus as ResearchTrackBuildStatus)
    ? storedStatus as ResearchTrackBuildStatus
    : expansionCount < 0 ? "queued" : "ready";
  if (visiblePaperCount > 0) return normalized === "queued" || normalized === "retryable" || normalized === "empty" || normalized === "failed" ? "partial" : normalized;
  if (normalized === "ready" || normalized === "partial") return "retryable";
  return normalized;
}

export function researchTrackRetryAt(attemptCount: number, now = Date.now()) {
  const delaySeconds = Math.min(120, 12 * (2 ** Math.max(0, attemptCount - 1)));
  return new Date(now + delaySeconds * 1000).toISOString();
}
