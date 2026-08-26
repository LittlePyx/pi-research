import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  defensiveResearchTrackBuildStatus,
  MAX_RESEARCH_TRACK_BUILD_ATTEMPTS,
  mergeResearchTrackSourceBatches,
  resolveResearchTrackBuildStatus,
} from "../lib/research-map-reliability.ts";

test("partial source failure keeps successful route candidates and reports the failed sibling", () => {
  const kept = { canonicalId: "doi:10.1000/kept" };
  const merged = mergeResearchTrackSourceBatches([
    { source: "crossref", role: "foundation", result: { status: "fulfilled", value: [kept] } },
    { source: "crossref", role: "milestone", result: { status: "rejected", reason: new Error("Crossref returned 503") } },
    { source: "crossref", role: "frontier", result: { status: "fulfilled", value: [] } },
  ]);

  assert.deepEqual(merged.candidates, [kept]);
  assert.deepEqual(merged.sources.map((source) => ({ role: source.role, status: source.status, count: source.candidateCount })), [
    { role: "foundation", status: "ok", count: 1 },
    { role: "milestone", status: "failed", count: 0 },
    { role: "frontier", status: "empty", count: 0 },
  ]);
  assert.match(merged.errors[0], /503/);
});

test("a route without visible evidence can never resolve ready", () => {
  const base = {
    existingPaperCount: 0,
    selectedPaperCount: 0,
    candidateCount: 0,
    sourceSuccessCount: 2,
    sourceFailureCount: 0,
    modelAttempted: false,
    modelSucceeded: true,
  };
  assert.equal(resolveResearchTrackBuildStatus({ ...base, attemptCount: 1 }), "retryable");
  assert.equal(resolveResearchTrackBuildStatus({ ...base, attemptCount: MAX_RESEARCH_TRACK_BUILD_ATTEMPTS }), "empty");
  assert.equal(resolveResearchTrackBuildStatus({ ...base, sourceSuccessCount: 0, sourceFailureCount: 3, attemptCount: 1 }), "retryable");
  assert.equal(resolveResearchTrackBuildStatus({ ...base, sourceSuccessCount: 0, sourceFailureCount: 3, attemptCount: MAX_RESEARCH_TRACK_BUILD_ATTEMPTS }), "failed");
  assert.equal(resolveResearchTrackBuildStatus({
    ...base,
    selectedPaperCount: 2,
    candidateCount: 4,
    sourceFailureCount: 1,
    modelAttempted: true,
    modelSucceeded: true,
    attemptCount: 1,
  }), "partial");
  assert.equal(resolveResearchTrackBuildStatus({
    ...base,
    selectedPaperCount: 2,
    candidateCount: 4,
    modelAttempted: true,
    modelSucceeded: true,
    attemptCount: 1,
  }), "ready");
  assert.equal(defensiveResearchTrackBuildStatus("ready", 0, 0), "retryable");
});

test("the D1 migration repairs legacy ready routes with zero nodes without touching populated history", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, expansion_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE research_track_papers (
        id TEXT PRIMARY KEY, track_id TEXT NOT NULL, space_id TEXT NOT NULL
      );
      INSERT INTO research_tracks VALUES
        ('ready-empty', 'space-a', 0),
        ('ready-with-paper', 'space-a', 2),
        ('queued-outline', 'space-a', -1);
      INSERT INTO research_track_papers VALUES ('paper-a', 'ready-with-paper', 'space-a');
    `);
    sqlite.exec(await readFile(new URL("../drizzle/0041_tricky_midnight.sql", import.meta.url), "utf8"));
    assert.deepEqual(sqlite.prepare(
      "SELECT id, build_status, build_error FROM research_tracks ORDER BY id",
    ).all().map((row) => ({ ...row })), [
      { id: "queued-outline", build_status: "queued", build_error: null },
      { id: "ready-empty", build_status: "retryable", build_error: "missing_visible_evidence" },
      { id: "ready-with-paper", build_status: "ready", build_error: null },
    ]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_track_papers").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("cold-start API code persists degraded state and queues retrieved candidates before route selection", async () => {
  const route = await readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8");
  assert.match(route, /Promise\.allSettled/);
  assert.match(route, /protectedBaselineCandidates/);
  assert.match(route, /const queueCandidates = candidates\.slice\(0, 24\)/);
  assert.match(route, /build_status = \?, build_attempt_count = \?, build_source_status_json = \?, build_error = \?, build_retry_at = \?/);
  assert.match(route, /resolveResearchTrackBuildStatus/);
  assert.doesNotMatch(route, /UPDATE research_tracks SET expansion_count = 0, updated_at/);
});
