import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  defensiveResearchTrackBuildStatus,
  MAX_RESEARCH_TRACK_BUILD_ATTEMPTS,
  mergeResearchTrackSourceBatches,
  researchTrackSourcePlan,
  researchTrackTopicalFit,
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

test("bounded cold-start retries rotate providers instead of replaying one degraded source", () => {
  assert.deepEqual(researchTrackSourcePlan(0).map((task) => task.provider), ["crossref", "crossref", "crossref"]);
  assert.deepEqual(researchTrackSourcePlan(1).map((task) => task.provider), ["openalex", "openalex", "arxiv"]);
  assert.deepEqual(researchTrackSourcePlan(2).map((task) => task.provider), ["crossref", "openalex", "arxiv"]);
  assert.equal(researchTrackSourcePlan(20).length, 3);
});

test("route-specific precision gate keeps direct work and rejects adjacent-field title drift", () => {
  const informationTheory = {
    titleEn: "Rate-distortion theory and finite-blocklength coding",
    searchQueries: ["rate distortion finite blocklength information theory", "lossy source coding dispersion"],
  };
  assert.equal(researchTrackTopicalFit(informationTheory, {
    title: "Finite Blocklength Rate-Distortion Theory",
    abstractText: "Lossy source coding with dispersion bounds.",
  }).accepted, true);
  assert.equal(researchTrackTopicalFit(informationTheory, {
    title: "Gaussian Approximation Potentials: The Accuracy of Quantum Mechanics without the Electrons",
    abstractText: "Density-functional calculations and molecular simulation.",
  }).accepted, false);

  const appliedMath = {
    titleEn: "KLS conjecture and concentration inequalities",
    searchQueries: ["KLS conjecture log concave measures", "isoperimetric concentration convex geometry"],
  };
  assert.equal(researchTrackTopicalFit(appliedMath, {
    title: "The KLS conjecture, thin shell estimates and concentration",
    abstractText: "Log-concave measures in convex geometry.",
  }).accepted, true);
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

test("the due-retry migration adds the bounded scheduler index", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`CREATE TABLE research_tracks (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, build_status TEXT NOT NULL,
      build_retry_at TEXT, build_attempt_count INTEGER NOT NULL DEFAULT 0
    );`);
    sqlite.exec((await readFile(new URL("../drizzle/0042_equal_dakota_north.sql", import.meta.url), "utf8"))
      .replaceAll("--> statement-breakpoint", ""));
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS count FROM pragma_index_list('research_tracks') WHERE name = 'idx_research_tracks_retry_due'",
    ).get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("cold-start API code persists degraded state and queues retrieved candidates before route selection", async () => {
  const [route, repository] = await Promise.all([
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /Promise\.allSettled/);
  assert.match(route, /protectedBaselineCandidates/);
  assert.match(route, /coverage\.route_id = \?/);
  assert.match(route, /ORDER BY route_candidate DESC/);
  assert.match(route, /researchTrackSourcePlan/);
  assert.match(route, /researchTrackTopicalFit/);
  assert.match(route, /const queueCandidates = candidates\.slice\(0, 24\)/);
  assert.match(route, /build_status = \?, build_attempt_count = \?, build_source_status_json = \?, build_error = \?, build_retry_at = \?/);
  assert.match(route, /resolveResearchTrackBuildStatus/);
  assert.doesNotMatch(route, /UPDATE research_tracks SET expansion_count = 0, updated_at/);
  assert.ok(repository.indexOf("ALTER TABLE research_tracks ADD COLUMN build_retry_at")
    < repository.indexOf("CREATE INDEX IF NOT EXISTS idx_research_tracks_retry_due"));
});

test("the route workspace reads existing maps without a query-string GET or model credential", async () => {
  const [app, route] = await Promise.all([
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(app, /fetch\("\/api\/research-map\?spaceId="/);
  assert.match(app, /async function readResearchMapState\(spaceId: string\)/);
  assert.match(app, /JSON\.stringify\(\{ spaceId, action: "read" \}\)/);
  const readBranch = route.indexOf('if (payload.action === "read")');
  const credentialResolution = route.indexOf("const apiKey = resolveDeepSeekCredential(request).apiKey", readBranch);
  assert.ok(readBranch > 0);
  assert.ok(credentialResolution > readBranch);
});
