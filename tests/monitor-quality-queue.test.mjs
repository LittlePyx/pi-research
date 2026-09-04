import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MONITOR_QUALITY_QUEUE_CONTINUATION_MS,
  monitorLastSourceScanAt,
  nextMonitorRunAt,
  shouldStartMonitorQualityQueueContinuation,
  shouldWakeLearningQualityQueue,
  monitorScanCompletionLabel,
} from "../lib/monitor-quality-queue.mjs";

const now = Date.parse("2026-09-01T08:00:00.000Z");
const cadenceMs = 24 * 60 * 60 * 1000;

test("quality-only finalization preserves the source scan clock", () => {
  const completedAt = "2026-09-01T08:00:00.000Z";
  const previousLastRunAt = "2026-09-01T07:00:00.000Z";
  assert.equal(monitorLastSourceScanAt({
    scanMode: "quality_queue",
    previousLastRunAt,
    completedAt,
  }), previousLastRunAt);
  assert.equal(monitorLastSourceScanAt({
    scanMode: "quality_queue",
    previousLastRunAt: null,
    completedAt,
  }), null);
  assert.equal(monitorLastSourceScanAt({
    scanMode: "full",
    previousLastRunAt,
    completedAt,
  }), completedAt);
});

test("a recent completed scan hands persisted backlog to a bounded quality-only continuation", () => {
  const base = {
    trigger: "scheduled",
    previousJobStatus: "ready",
    pipelineOutdated: false,
    qualityCarryover: false,
    pendingQueueCount: 43,
    lastSourceScanAt: "2026-09-01T07:00:00.000Z",
    now,
    cadenceMs,
  };
  assert.equal(shouldStartMonitorQualityQueueContinuation(base), true);
  assert.equal(shouldStartMonitorQualityQueueContinuation({ ...base, trigger: "visit" }), true,
    "the learning page's visit wake must not fall through to the source-scan cadence cache");
  assert.equal(shouldStartMonitorQualityQueueContinuation({ ...base, pendingQueueCount: 0 }), false);
  assert.equal(shouldStartMonitorQualityQueueContinuation({ ...base, trigger: "manual" }), false);
  assert.equal(shouldStartMonitorQualityQueueContinuation({ ...base, pipelineOutdated: true }), false);
  assert.equal(shouldStartMonitorQualityQueueContinuation({ ...base, lastSourceScanAt: "2026-08-31T07:00:00.000Z" }), false);
});

test("learning queue recovery waits for its persisted due time and never interrupts an active pass", () => {
  const path = { status: "waiting_evidence", steps: [{ status: "pending", resources: [], discovery: { reviewPendingCount: 2 } }] };
  const monitor = { status: "ready", nextRunAt: "2026-09-01 07:59:00" };
  const base = { path, monitor, monitoring: false, now };
  assert.equal(shouldWakeLearningQualityQueue(base), true);
  assert.equal(shouldWakeLearningQualityQueue({ ...base, monitoring: true }), false);
  for (const status of ["deep_reviewing", "error", "scanning"]) {
    assert.equal(shouldWakeLearningQualityQueue({ ...base, monitor: { ...monitor, status } }), false);
  }
  for (const nextRunAt of [null, "invalid", "2026-09-01T08:01:00Z"]) {
    assert.equal(shouldWakeLearningQualityQueue({ ...base, monitor: { ...monitor, nextRunAt } }), false);
  }
  for (const status of ["completed", "superseded"]) assert.equal(shouldWakeLearningQualityQueue({ ...base, path: { ...path, status } }), false);
  assert.equal(shouldWakeLearningQualityQueue({ ...base, path: { ...path, steps: [{ status: "pending", resources: [{}] }] } }), false);
  assert.equal(shouldWakeLearningQualityQueue({ ...base, path: { ...path, steps: [{ status: "completed", resources: [], discovery: { reviewPendingCount: 2 } }] } }), false);
});

test("scan completion uses monitor evidence and never asserts an unloaded or bounded queue is empty", async () => {
  for (const monitor of [
    { savedCandidatePapers: [{}] }, { historyPapers: [{ qualityStage: "queued" }] },
    { historyPapers: [{ qualityStage: "reviewing" }] }, { scanJob: { verificationPendingCount: 3 } },
    { scanJob: { deepDeferredCount: 1 } },
  ]) {
    assert.match(monitorScanCompletionLabel(monitor, "zh"), /仍有候选待评估/);
    assert.match(monitorScanCompletionLabel(monitor, "en"), /still await review/);
  }
  for (const monitor of [null, {}, { historyPapers: [{ qualityStage: "recommended" }] }]) {
    assert.equal(monitorScanCompletionLabel(monitor, "zh"), "本轮扫描已结束");
    assert.equal(monitorScanCompletionLabel(monitor, "en"), "This scan has ended");
  }
  const app = await readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8");
  assert.match(app, /const monitorReadyLabel = monitorScanCompletionLabel\(monitor, locale\)/);
  assert.doesNotMatch(app, /今日扫描与当前质量队列已完成|current quality queue are complete/);
});

test("quality continuations do not move the source-discovery clock", () => {
  const pending = nextMonitorRunAt({
    now,
    lastSourceScanAt: "2026-09-01T07:00:00.000Z",
    verificationPending: 0,
    pendingQueueCount: 12,
    scanMode: "quality_queue",
    compactResetAt: "2026-09-02T16:00:00.000Z",
    cadenceMs,
  });
  assert.equal(Date.parse(pending), now + MONITOR_QUALITY_QUEUE_CONTINUATION_MS);

  const drained = nextMonitorRunAt({
    now,
    lastSourceScanAt: "2026-09-01T07:00:00.000Z",
    verificationPending: 0,
    pendingQueueCount: 0,
    scanMode: "quality_queue",
    compactResetAt: "2026-09-02T16:00:00.000Z",
    cadenceMs,
  });
  assert.equal(drained, "2026-09-02T07:00:00.000Z");
});

test("the monitor persists quality-only work as a resumable job and marks bounded evidence failures terminal", async () => {
  const route = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(route, /initialWork\.scanMode = qualityQueueContinuation \? "quality_queue"/);
  assert.match(route, /initialCheckpoint = qualityQueueContinuation \? "deduplicating"/);
  assert.match(route, /initialWork\.discoveredCandidateIds = pendingQualityCandidates/);
  assert.match(route, /finalizeEvidenceExcludedCandidates/);
  assert.match(route, /Abstract evidence unavailable after bounded enrichment/);
  assert.match(route, /remainingQualityQueueCount/);
  assert.match(route, /SELECT status, discovery_round, last_run_at, lock_token/);
  assert.match(route, /monitorLastSourceScanAt\(\{[\s\S]*previousLastRunAt: validatedRun\?\.last_run_at/);
  assert.doesNotMatch(route, /work\.scanMode === "quality_queue" \? previous\?\.last_run_at/);
  assert.match(route, /work\.scanMode === "quality_queue"[\s\S]*UPDATE monitor_runs SET status = 'ready', next_run_at/);
});
