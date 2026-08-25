import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildReliabilityProgram, percentile } from "../lib/monitor-reliability.mjs";

test("reliability percentiles use nearest-rank values", () => {
  assert.equal(percentile([], 0.95), 0);
  assert.equal(percentile([400, 100, 200, 300], 0.5), 200);
  assert.equal(percentile([400, 100, 200, 300], 0.95), 400);
});

test("14-day reliability program detects scan, source, zero-yield, and evidence gaps", () => {
  const now = Date.parse("2026-08-21T08:00:00.000Z");
  const program = buildReliabilityProgram({
    now,
    jobs: [
      { status: "ready", startedAt: "2026-08-21T07:55:00.000Z", completedAt: "2026-08-21T07:58:00.000Z", firstRecommendationAt: null, recommendedCount: 0, resumeOfJobId: null, error: null },
      { status: "ready", startedAt: "2026-08-20T07:55:00.000Z", completedAt: "2026-08-20T07:59:00.000Z", firstRecommendationAt: null, recommendedCount: 0, resumeOfJobId: null, error: null },
      { status: "error", startedAt: "2026-08-19T07:55:00.000Z", completedAt: "2026-08-19T07:56:00.000Z", firstRecommendationAt: null, recommendedCount: 0, resumeOfJobId: "job-old", error: "timeout" },
    ],
    sourceFailures: [{ source: "openalex:topic", failures: 2, lastError: "OpenAlex returned 503", lastSeenAt: "2026-08-21T07:56:00.000Z" }],
    calibration: { labels: 1, accepted: 1, dismissed: 0, known: 0, wrongType: 0 },
  });

  assert.equal(program.periodDays, 14);
  assert.equal(program.actual.successRate, 67);
  assert.equal(program.actual.consecutiveZeroRecommendationRuns, 2);
  assert.equal(program.actual.resumed, 1);
  assert.equal(program.evaluation.sampleReady, false);
  assert.deepEqual(program.alerts.map((alert) => alert.code), [
    "scan_reliability",
    "zero_recommendation_streak",
    "source_degradation",
    "insufficient_quality_labels",
  ]);
});

test("unavailable analysis is not mislabeled as a zero-recommendation quality outcome", () => {
  const program = buildReliabilityProgram({
    now: Date.parse("2026-08-22T10:00:00.000Z"),
    jobs: [
      { status: "ready", startedAt: "2026-08-22T09:55:00.000Z", completedAt: "2026-08-22T10:00:00.000Z", firstRecommendationAt: null, recommendedCount: 0, completionState: "analysis_unavailable" },
      { status: "ready", startedAt: "2026-08-21T09:55:00.000Z", completedAt: "2026-08-21T09:59:00.000Z", firstRecommendationAt: null, recommendedCount: 0, completionState: "no_match" },
      { status: "ready", startedAt: "2026-08-20T09:55:00.000Z", completedAt: "2026-08-20T09:58:00.000Z", firstRecommendationAt: "2026-08-20T09:57:00.000Z", recommendedCount: 1, completionState: "recommended" },
    ],
    sourceFailures: [],
    calibration: { labels: 12, accepted: 7, dismissed: 3, known: 2, wrongType: 0 },
    stageEvents: [
      { stage: "deep_reviewing", outcome: "success", durationMs: 21_000 },
      { stage: "deep_reviewing", outcome: "degraded", durationMs: 38_000 },
      { stage: "screening", outcome: "success", durationMs: 8_000 },
    ],
  });

  assert.equal(program.actual.zeroRecommendationRuns, 1);
  assert.equal(program.actual.consecutiveZeroRecommendationRuns, 1);
  assert.equal(program.actual.analysisUnavailableRuns, 1);
  assert.equal(program.actual.analysisAvailabilityRate, 67);
  assert.deepEqual(program.stages[0], {
    stage: "deep_reviewing", attempts: 2, failures: 1, p50DurationMs: 21_000, p95DurationMs: 38_000,
  });
  assert.equal(program.alerts.some((alert) => alert.code === "zero_recommendation_streak"), false);
  assert.equal(program.alerts.some((alert) => alert.code === "analysis_unavailable"), true);
});

test("monitor persists internal reliability telemetry without exposing a user quality console", async () => {
  const [route, feedback, schema, repository, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /monitor_reliability_events/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS monitor_reliability_events/);
  assert.match(route, /scan_completed_partial/);
  assert.match(route, /: "scan_completed"/);
  assert.match(route, /kind: "scan_failed"/);
  assert.match(route, /kind: "first_recommendation_ready"/);
  assert.match(route, /kind: "recommendation_quality_snapshot"/);
  assert.match(route, /buildRecommendationQualitySnapshot/);
  assert.match(feedback, /recommendation_feedback_outcome/);
  assert.match(feedback, /recordRecommendationFeedbackOutcome/);
  assert.match(route, /internalReliability/);
  assert.match(client, /const SHOW_INTERNAL_QUALITY_UI = false/);
  assert.doesNotMatch(client, /monitor\?\.internalReliability/);
});

test("DeepSeek stages stay below the production request cancellation boundary", async () => {
  const route = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(route, /DEEP_REVIEW_PRIMARY_TIMEOUT_MS = 22_000/);
  assert.match(route, /DEEP_REVIEW_RETRY_TIMEOUT_MS = 16_000/);
  assert.match(route, /QUICK_SCREEN_FAST_TIMEOUT_MS = 24_000/);
  assert.match(route, /QUICK_SCREEN_RETRY_TIMEOUT_MS = 12_000/);
  assert.doesNotMatch(route, /signal: AbortSignal\.timeout\(attempt === 0 \? 55_000 : 45_000\)/);
});

test("one slow deep review is deferred instead of failing the whole scan", async () => {
  const [route, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /deepDeferredIds: string\[\]/);
  assert.match(route, /work\.deepDeferredIds = Array\.from\(new Set/);
  assert.match(route, /scan_completed_partial/);
  assert.doesNotMatch(route, /if \(work\.deepFailureCount >= 2\) throw/);
  assert.match(client, /step < 64/);
  assert.match(client, /篇已延后，不阻塞本轮/);
});
