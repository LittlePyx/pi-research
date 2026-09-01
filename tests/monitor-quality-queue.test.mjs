import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MONITOR_QUALITY_QUEUE_CONTINUATION_MS,
  nextMonitorRunAt,
  shouldStartMonitorQualityQueueContinuation,
} from "../lib/monitor-quality-queue.mjs";

const now = Date.parse("2026-09-01T08:00:00.000Z");
const cadenceMs = 24 * 60 * 60 * 1000;

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
  assert.equal(shouldStartMonitorQualityQueueContinuation({ ...base, pendingQueueCount: 0 }), false);
  assert.equal(shouldStartMonitorQualityQueueContinuation({ ...base, trigger: "manual" }), false);
  assert.equal(shouldStartMonitorQualityQueueContinuation({ ...base, pipelineOutdated: true }), false);
  assert.equal(shouldStartMonitorQualityQueueContinuation({ ...base, lastSourceScanAt: "2026-08-31T07:00:00.000Z" }), false);
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
  assert.match(route, /work\.scanMode === "quality_queue"[\s\S]*UPDATE monitor_runs SET status = 'ready', next_run_at/);
});
