export const MONITOR_QUALITY_QUEUE_CONTINUATION_MS = 10 * 60 * 1000;

function timestamp(value) {
  if (!value) return Number.NaN;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return Date.parse(normalized);
}

/**
 * A quality-only pass must preserve the time of the last external-source scan.
 * Normal discovery advances that clock only after the source pass completes.
 */
export function monitorLastSourceScanAt(input) {
  return input.scanMode === "quality_queue"
    ? input.previousLastRunAt || null
    : input.completedAt;
}

/**
 * A recent completed source scan may hand remaining persisted candidates to a
 * bounded quality-only pass. Manual scans and cadence-due scheduled scans still
 * perform normal discovery, so draining the queue can never postpone sources
 * indefinitely.
 */
export function shouldStartMonitorQualityQueueContinuation(input) {
  if (input.trigger !== "scheduled" || input.previousJobStatus !== "ready") return false;
  if (input.pipelineOutdated || input.qualityCarryover || input.pendingQueueCount <= 0) return false;
  const lastSourceScanAt = timestamp(input.lastSourceScanAt);
  if (!Number.isFinite(lastSourceScanAt)) return false;
  const age = input.now - lastSourceScanAt;
  return age >= 0 && age < input.cadenceMs;
}

/**
 * Quality work resumes on the scheduler's next ten-minute bucket. Once the
 * queue is empty, a quality-only pass returns to the original discovery
 * cadence instead of moving the source-scan clock forward.
 */
export function nextMonitorRunAt(input) {
  if (input.verificationPending > 0 || (input.pendingQueueCount > 0 && input.scanMode !== "fresh_only")) {
    return new Date(input.now + (input.continuationMs || MONITOR_QUALITY_QUEUE_CONTINUATION_MS)).toISOString();
  }
  if (input.scanMode === "fresh_only") return input.compactResetAt;
  if (input.scanMode === "quality_queue") {
    const lastSourceScanAt = timestamp(input.lastSourceScanAt);
    const dueAt = Number.isFinite(lastSourceScanAt) ? lastSourceScanAt + input.cadenceMs : input.now;
    return new Date(Math.max(input.now, dueAt)).toISOString();
  }
  return new Date(input.now + input.cadenceMs).toISOString();
}
