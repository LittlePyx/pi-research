import { PROVENANCE_FAIRNESS_AGE_MS } from "./discovery/candidate-selection.mjs";

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
  if (!["scheduled", "visit"].includes(input.trigger) || input.previousJobStatus !== "ready") return false;
  if (input.pipelineOutdated || input.qualityCarryover || input.pendingQueueCount <= 0) return false;
  const lastSourceScanAt = timestamp(input.lastSourceScanAt);
  if (!Number.isFinite(lastSourceScanAt)) return false;
  const age = input.now - lastSourceScanAt;
  return age >= 0 && age < input.cadenceMs;
}

/** Finished verification retries must not monopolize the next shared-queue pass.
 * The previous job and its persisted reviews remain untouched; normal queue
 * selection reuses those drafts alongside the aged, previously unselected work.
 * Incomplete deep drafts keep their existing resumable checkpoint.
 */
export function shouldYieldVerificationCarryover(input) {
  if (!["scheduled", "visit"].includes(input.trigger) || input.previousJobStatus !== "ready"
    || input.pipelineOutdated || !input.verificationCarryover || input.incompleteDraftCarryover
    || !(input.previousAttempt >= 2)) return false;
  const previousIds = new Set(input.previousCandidateIds);
  return input.pendingCandidates.some((candidate) => {
    if (!candidate.canonicalId || previousIds.has(candidate.canonicalId)
      || !["learning", "gap", "route"].includes(candidate.qualityQueueLane)) return false;
    const firstSeen = timestamp(candidate.qualityQueueFirstSeenAt);
    return Number.isFinite(firstSeen) && input.now - firstSeen >= PROVENANCE_FAIRNESS_AGE_MS;
  });
}

/** A visible learning path may resume persisted quality work when its retry is due. */
export function shouldWakeLearningQualityQueue({ path, monitor, monitoring, now = Date.now() }) {
  if (monitoring || monitor?.status !== "ready" || !path || ["completed", "superseded"].includes(path.status)) return false;
  const pending = path.steps.some((step) => step.status !== "completed" && !step.resources.length
    && (step.discovery?.reviewPendingCount || 0) > 0);
  const retryAt = timestamp(monitor.nextRunAt);
  return pending && Number.isFinite(retryAt) && retryAt <= now;
}

/** Never infer a drained shared queue from another page's unloaded route state. */
export function monitorScanCompletionLabel(monitor, locale) {
  const pending = (monitor?.savedCandidatePapers?.length || 0) > 0
    || (monitor?.scanJob?.verificationPendingCount || 0) > 0
    || (monitor?.scanJob?.deepDeferredCount || 0) > 0
    || monitor?.historyPapers?.some((paper) => ["queued", "reviewing"].includes(paper.qualityStage));
  if (pending) return locale === "zh" ? "本轮扫描已结束，仍有候选待评估" : "This scan has ended; candidates still await review";
  // An empty bounded response is not proof that the entire persistent queue is empty.
  return locale === "zh" ? "本轮扫描已结束" : "This scan has ended";
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
