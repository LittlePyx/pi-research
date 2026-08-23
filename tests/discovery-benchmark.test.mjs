import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DISCOVERY_BENCHMARK_GATES,
  DISCOVERY_GOLD_SETS,
  benchmarkTitleSimilarity,
  buildBenchmarkReplayRecords,
  discoveryCalibrationSignals,
  evaluateDiscoveryRanking,
  mergeBenchmarkQueryCoverage,
} from "../lib/discovery/benchmark.mjs";

test("live gold checks contain only source-verifiable paper titles", () => {
  const titles = DISCOVERY_GOLD_SETS.information_theory.positives.map((item) => item.title);
  assert.ok(!titles.includes("Semantic Compression with Side Information: A Rate-Distortion Perspective"));
  assert.ok(titles.includes("Rate-Distortion Limits for Task-Oriented Compression with Side Information"));
  assert.ok(DISCOVERY_GOLD_SETS.information_theory.positives.filter((item) => item.liveCheck).length >= 4);
});

test("benchmark title matching is stable across academic punctuation", () => {
  const similarity = benchmarkTitleSimilarity(
    "On the Computation of the Gaussian Rate–Distortion–Perception Function",
    "On the Computation of the Gaussian Rate-Distortion-Perception Function",
  );
  assert.equal(similarity, 1);
});

test("known production drift is demoted while protected mathematical facets survive", () => {
  const wrong = discoveryCalibrationSignals("applied_mathematics", {
    title: "Lowland tapir transport: a veterinary case report",
    abstract: "Clinical transport protocol for a veterinary patient.",
  });
  assert.equal(wrong.likelyWrongType, true);
  assert.ok(wrong.priorityBoost <= -200);

  const relevant = discoveryCalibrationSignals("applied_mathematics", {
    title: "A Wasserstein stability estimate for a parabolic equation",
    abstract: "We prove a functional inequality for the Fokker-Planck gradient flow.",
  });
  assert.equal(relevant.likelyWrongType, false);
  assert.ok(relevant.facetIds.length >= 2);
  assert.ok(relevant.priorityBoost > 0);
});

test("every protected profile receives a deterministic core query in every horizon", () => {
  const covered = mergeBenchmarkQueryCoverage("information_theory", {
    days: ["novel user route query"],
    months: [],
    years: [],
  }, "2026-08-23", 3);
  assert.equal(covered.days.length, 2);
  assert.match(covered.days[0], /rate|finite|information/i);
  assert.equal(covered.months.length, 1);
  assert.equal(covered.years.length, 1);
});

for (const profileKey of ["information_theory", "applied_mathematics"]) {
  test(`${profileKey} offline replay clears the release gates`, () => {
    const result = evaluateDiscoveryRanking(profileKey, buildBenchmarkReplayRecords(profileKey), { k: 10 });
    assert.equal(result.passed, true, JSON.stringify(result.metrics));
    assert.ok(result.metrics.recallAtK >= DISCOVERY_BENCHMARK_GATES.recallAtK);
    assert.ok(result.metrics.precisionAt10 >= DISCOVERY_BENCHMARK_GATES.precisionAt10);
    assert.ok(result.metrics.wrongTypeRate <= DISCOVERY_BENCHMARK_GATES.wrongTypeRate);
    assert.ok(result.metrics.facetCoverage >= DISCOVERY_BENCHMARK_GATES.facetCoverage);
  });
}

test("monitor retrieval and both LLM review passes consume benchmark calibration", async () => {
  const [monitor, liveBenchmark] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/run-discovery-benchmark.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /mergeBenchmarkQueryCoverage/);
  assert.match(monitor, /discoveryCalibrationSignals/);
  assert.ok((monitor.match(/benchmarkCalibrationPrompt/g) || []).length >= 3);
  assert.match(monitor, /continuous-evidence-v7-benchmark-calibrated/);
  assert.match(liveBenchmark, /response\.headers\.get\("retry-after"\)/);
  assert.match(liveBenchmark, /pacedOpenAlexRequest/);
  assert.match(liveBenchmark, /openAlexBlockedUntil/);
  assert.match(liveBenchmark, /Promise\.allSettled\(\[openAlexSearch\(query, 10\), crossrefSearch\(query, 10\)\]\)/);
});
