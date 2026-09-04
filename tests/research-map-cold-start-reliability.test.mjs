import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  matchesResearchClassicSeedTitle,
  preferredResearchClassicCandidate,
  selectResearchClassicSeeds,
} from "../lib/research-classic-seeds.ts";

import {
  defensiveResearchTrackBuildStatus,
  RESEARCH_TRACK_CLASSIC_RESCUE_ATTEMPT,
  mergeResearchTrackSourceBatches,
  nextResearchTrackBuildAttemptCount,
  researchTrackSourcePlan,
  researchTrackTitleTopicalFit,
  researchTrackTopicalFit,
  resolveResearchTrackBuildStatus,
} from "../lib/research-map-reliability.ts";
import { developmentUnboundedEnabled, retryAttemptAllowed } from "../lib/development-policy.mjs";

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
  assert.equal(resolveResearchTrackBuildStatus({ ...base, attemptCount: RESEARCH_TRACK_CLASSIC_RESCUE_ATTEMPT }), "empty");
  assert.equal(resolveResearchTrackBuildStatus({ ...base, sourceSuccessCount: 0, sourceFailureCount: 3, attemptCount: 1 }), "retryable");
  assert.equal(resolveResearchTrackBuildStatus({ ...base, sourceSuccessCount: 0, sourceFailureCount: 3, attemptCount: RESEARCH_TRACK_CLASSIC_RESCUE_ATTEMPT }), "failed");
  assert.equal(resolveResearchTrackBuildStatus({
    ...base,
    sourceSuccessCount: 0,
    sourceFailureCount: 3,
    attemptCount: 100,
    unboundedRetries: true,
  }), "retryable");
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
  assert.equal(resolveResearchTrackBuildStatus({
    ...base,
    attemptCount: RESEARCH_TRACK_CLASSIC_RESCUE_ATTEMPT,
    pendingReviewCount: 2,
  }), "retryable");
});

test("terminal cold start selects bounded classical anchors and requires exact returned identities", () => {
  const applied = selectResearchClassicSeeds({
    titleEn: "Stochastic localization and the KLS conjecture",
    summaryEn: "Cheeger constants, spectral gaps, and log-concave isoperimetry",
    searchQueries: ["Kannan Lovasz Simonovits original conjecture", "Chen almost constant lower bound"],
  });
  assert.deepEqual(applied.map((seed) => seed.id).sort(), [
    "kls-localization-lemma",
    "chen-almost-constant-kls",
    "cheeger-laplacian-lower-bound",
    "eldan-thin-shell-localization",
  ].sort());
  const kls = applied.find((seed) => seed.id === "kls-localization-lemma");
  assert.ok(kls);
  assert.equal(matchesResearchClassicSeedTitle(kls, "Isoperimetric problems for convex bodies and a localization lemma"), true);
  assert.equal(matchesResearchClassicSeedTitle(kls, "Isoperimetric inequalities for convex bodies: a modern survey"), false);

  const information = selectResearchClassicSeeds({
    titleEn: "Gaussian extremality and entropy power inequalities",
    summaryEn: "Connect I-MMSE and extremal Gaussian information inequalities.",
    searchQueries: ["Gaussian channels mutual information minimum mean square error"],
  });
  assert.ok(information.some((seed) => seed.id === "i-mmse-gaussian-channels"));
  assert.ok(information.some((seed) => seed.id === "costa-new-entropy-power"));
  assert.equal(information.length <= 4, true);

  const pending = { canonicalId: "doi:kls", abstractText: "long provider abstract", citationCount: 500, classicRescueSeedId: "kls-localization-lemma" };
  const reviewed = { canonicalId: "doi:kls", abstractText: "reviewed", citationCount: 400 };
  assert.equal(preferredResearchClassicCandidate(pending, reviewed), reviewed);
  assert.equal(preferredResearchClassicCandidate(reviewed, pending), reviewed);
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

test("shared route queue admission uses stable route-title anchors instead of a drifting generated query", () => {
  const routeTitle = "Entropy Power Inequality and Transport Inequalities";
  assert.equal(researchTrackTitleTopicalFit(routeTitle, {
    title: "A Quantitative Entropy Power Inequality for Dependent Random Vectors",
    abstractText: "We establish quantitative stability bounds for the EPI.",
  }).accepted, true);
  assert.equal(researchTrackTitleTopicalFit(routeTitle, {
    title: "Hydrogen Production, Distribution, Storage and Power Conversion in a Hydrogen Economy",
    abstractText: "A technology review of power conversion and transport infrastructure.",
  }).accepted, false);
  assert.equal(researchTrackTitleTopicalFit(routeTitle, {
    title: "Pembrolizumab with Gemcitabine for Advanced Biliary Tract Cancer",
    abstractText: "A randomized phase 3 clinical trial.",
  }).accepted, false);
  assert.equal(researchTrackTitleTopicalFit(routeTitle, {
    title: "High Figure-of-Merit and Power Generation in High-Entropy Thermoelectrics",
  }).accepted, false);
  assert.equal(researchTrackTitleTopicalFit(routeTitle, {
    title: "Nonlinear Causal Asymmetries in Income Inequality, Market Power, and Transfer Entropy",
  }).accepted, false);
  assert.equal(researchTrackTitleTopicalFit(routeTitle, {
    title: "A Note on Talagrand's Transportation Inequality",
  }).accepted, true);
});

test("a new shared-queue recovery pass resets the bounded attempt window without hiding credential deferral", () => {
  assert.equal(nextResearchTrackBuildAttemptCount({
    currentAttemptCount: 3, deferredForCredential: false, force: true, storedStatus: "failed",
  }), 1);
  assert.equal(nextResearchTrackBuildAttemptCount({
    currentAttemptCount: 3, deferredForCredential: false, force: true, storedStatus: "retryable",
  }), 1);
  assert.equal(nextResearchTrackBuildAttemptCount({
    currentAttemptCount: 2, deferredForCredential: true, force: true, storedStatus: "failed",
  }), 2);
  assert.equal(nextResearchTrackBuildAttemptCount({
    currentAttemptCount: 28, deferredForCredential: false, force: true, storedStatus: "retryable", unboundedRetries: true,
  }), 29);
});

test("development mode removes total retry caps without removing per-request control", () => {
  assert.equal(developmentUnboundedEnabled("1"), true);
  assert.equal(developmentUnboundedEnabled("unbounded"), true);
  assert.equal(developmentUnboundedEnabled("0"), false);
  assert.equal(retryAttemptAllowed({ unbounded: true, attemptCount: 500, maximumAttempts: 3 }), true);
  assert.equal(retryAttemptAllowed({ unbounded: false, attemptCount: 3, maximumAttempts: 3 }), false);
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
  const [route, monitor, repository] = await Promise.all([
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /Promise\.allSettled/);
  assert.match(route, /protectedBaselineCandidates/);
  assert.match(route, /discoverClassicRescueCandidates/);
  assert.match(route, /matchesResearchClassicRecord/);
  assert.match(route, /classicRescueSeedId/);
  assert.match(route, /sourceKey: `research-route:\$\{sourceKind\}`/);
  assert.match(route, /classic_rescue_pending_review/);
  assert.match(route, /classic\.source_key = 'research-route:classic-rescue'/);
  assert.match(route, /coverage\.route_id = \?/);
  assert.match(route, /ORDER BY route_candidate DESC/);
  assert.match(route, /researchTrackSourcePlan/);
  assert.match(route, /researchTrackTopicalFit/);
  assert.match(route, /const queueCandidates = candidates\.filter\(\(candidate\) => !routePrecisionAutoDeactivates/);
  assert.match(route, /\.slice\(0, 24\)\.map\(\(candidate\) =>/);
  assert.match(route, /build_status = \?, build_attempt_count = \?, build_source_status_json = \?, build_error = \?, build_retry_at = \?/);
  assert.match(route, /resolveResearchTrackBuildStatus/);
  assert.match(route, /unboundedRetries: unboundedDevelopmentRetries\(\)/);
  assert.match(monitor, /developmentAnalysisUnbounded/);
  assert.match(monitor, /routeTitleEn:\s*row\.title_en/);
  assert.match(monitor, /researchTrackTitleTopicalFit\(plan\.routeTitleEn/);
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
