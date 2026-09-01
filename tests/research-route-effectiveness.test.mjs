import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  evaluateResearchRouteEffectiveness,
  researchRouteEffectivenessMetrics,
  RESEARCH_ROUTE_VERSION_EFFECT_SQL,
} from "../lib/research-route-effectiveness.ts";

function metrics(overrides = {}) {
  return {
    revisionId: "revision-a",
    trackId: "track-a",
    version: 2,
    windowStartedAt: "2026-08-10 00:00:00",
    windowEndedAt: null,
    candidateCount: 20,
    deepReviewedCount: 4,
    recommendedCount: 0,
    acceptedCount: 0,
    readingStartedCount: 0,
    readingCompletedCount: 0,
    formalEvidenceCount: 0,
    synthesisUpdateCount: 0,
    problemAssessmentCount: 0,
    sourceFailureCount: 0,
    ...overrides,
  };
}

test("route version advice waits for evidence and never blames source degradation", () => {
  assert.equal(evaluateResearchRouteEffectiveness(metrics()).verdict, "observing");
  const degraded = evaluateResearchRouteEffectiveness(metrics({ deepReviewedCount: 10, sourceFailureCount: 3 }));
  assert.equal(degraded.verdict, "observing");
  assert.match(degraded.summaryEn, /source degradation/i);
  assert.equal(evaluateResearchRouteEffectiveness(metrics({ deepReviewedCount: 8 })).verdict, "reconsider");
});

test("downstream reading or formal evidence supports retain while a comparable decline supports reconsider", () => {
  const retained = evaluateResearchRouteEffectiveness(metrics({
    deepReviewedCount: 6,
    recommendedCount: 1,
    readingCompletedCount: 1,
  }));
  assert.equal(retained.verdict, "retain");
  const previous = metrics({ revisionId: "revision-1", version: 1, deepReviewedCount: 10, recommendedCount: 5 });
  const regressed = evaluateResearchRouteEffectiveness(metrics({ deepReviewedCount: 10, recommendedCount: 1 }), previous);
  assert.equal(regressed.recommendationRateDelta, -40);
  assert.equal(regressed.verdict, "reconsider");
});

test("version windows attribute delayed feedback to the recommendation-producing route version", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_route_revisions (
        id TEXT PRIMARY KEY, space_id TEXT, track_id TEXT, version INTEGER, status TEXT, decided_at TEXT
      );
      CREATE TABLE monitor_discovery_coverage (
        space_id TEXT, route_id TEXT, source_key TEXT, query_key TEXT, horizon TEXT
      );
      CREATE TABLE monitor_candidate_sources (
        space_id TEXT, paper_id TEXT, source_key TEXT, query_key TEXT, first_seen_at TEXT
      );
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, horizon TEXT);
      CREATE TABLE recommendation_audit_events (
        space_id TEXT, paper_id TEXT, reviewed_at TEXT, provenance_json TEXT, recommended INTEGER, is_paper INTEGER
      );
      CREATE TABLE paper_feedback (space_id TEXT, paper_id TEXT, feedback TEXT, saved INTEGER);
      CREATE TABLE paper_reading_progress (
        space_id TEXT, paper_id TEXT, status TEXT, started_at TEXT, completed_at TEXT
      );
      CREATE TABLE research_map_evidence_proposals (
        space_id TEXT, track_id TEXT, paper_id TEXT, status TEXT
      );
      CREATE TABLE research_synthesis_revisions (space_id TEXT, track_id TEXT, created_at TEXT);
      CREATE TABLE research_problem_assessments (space_id TEXT, track_id TEXT, created_at TEXT);
      CREATE TABLE monitor_reliability_events (
        space_id TEXT, kind TEXT, metadata_json TEXT, created_at TEXT
      );

      INSERT INTO research_route_revisions VALUES
        ('revision-1', 'space-a', 'track-a', 1, 'superseded', '2026-08-01 00:00:00'),
        ('revision-2', 'space-a', 'track-a', 2, 'confirmed', '2026-08-10 00:00:00');
      INSERT INTO monitor_discovery_coverage VALUES
        ('space-a', 'track-a', 'research-route:frontier', 'query-a', 'days');
      INSERT INTO monitored_papers VALUES
        ('paper-1', 'space-a', 'days'), ('paper-2', 'space-a', 'days');
      INSERT INTO monitor_candidate_sources VALUES
        ('space-a', 'paper-1', 'research-route:frontier', 'query-a', '2026-08-02 00:00:00'),
        ('space-a', 'paper-2', 'research-route:frontier', 'query-a', '2026-08-11 00:00:00');
      INSERT INTO recommendation_audit_events VALUES
        ('space-a', 'paper-1', '2026-08-03 00:00:00', '[{"sourceKey":"research-route:frontier","routeId":"track-a"}]', 1, 1),
        ('space-a', 'paper-2', '2026-08-12 00:00:00', '[{"sourceKey":"research-route:frontier","routeId":"track-a"}]', 0, 1);
      INSERT INTO paper_feedback VALUES ('space-a', 'paper-1', 'relevant', 0);
      INSERT INTO paper_reading_progress VALUES
        ('space-a', 'paper-1', 'read', '2026-08-13 00:00:00', '2026-08-14 00:00:00');
      INSERT INTO research_map_evidence_proposals VALUES ('space-a', 'track-a', 'paper-1', 'confirmed');
      INSERT INTO research_problem_assessments VALUES ('space-a', 'track-a', '2026-08-13 00:00:00');
      INSERT INTO research_synthesis_revisions VALUES ('space-a', 'track-a', '2026-08-13 00:00:00');
      INSERT INTO monitor_reliability_events VALUES
        ('space-a', 'source_degraded', '{"routeId":"track-a"}', '2026-08-12 00:00:00');
    `);
    const rows = sqlite.prepare(RESEARCH_ROUTE_VERSION_EFFECT_SQL).all("space-a");
    assert.equal(rows.length, 2);
    const v1 = researchRouteEffectivenessMetrics(rows.find((row) => row.version === 1));
    const v2 = researchRouteEffectivenessMetrics(rows.find((row) => row.version === 2));
    assert.deepEqual(
      [v1.candidateCount, v1.deepReviewedCount, v1.recommendedCount, v1.acceptedCount, v1.readingCompletedCount, v1.formalEvidenceCount],
      [1, 1, 1, 1, 1, 1],
    );
    assert.equal(v1.windowEndedAt, "2026-08-10 00:00:00");
    assert.deepEqual(
      [v2.candidateCount, v2.deepReviewedCount, v2.recommendedCount, v2.problemAssessmentCount, v2.synthesisUpdateCount, v2.sourceFailureCount],
      [1, 1, 0, 1, 1, 1],
    );
  } finally {
    sqlite.close();
  }
});

test("route effectiveness is read-only, visible, and keeps every count on narrow screens", async () => {
  const [effectiveness, route, ui, css] = await Promise.all([
    readFile(new URL("../lib/research-route-effectiveness.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(effectiveness, /\b(?:DELETE|UPDATE|INSERT)\s+(?:FROM|INTO|research_)/i);
  assert.match(route, /RESEARCH_ROUTE_VERSION_EFFECT_SQL/);
  assert.match(ui, /effectiveness\.candidateCount/);
  assert.match(ui, /effectiveness\.problemAssessmentCount \+ effectiveness\.synthesisUpdateCount/);
  assert.match(ui, /不会自动回退，也不会降低质量门槛/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.v2-route-effectiveness dl \{ grid-template-columns: 1fr; \}/);
});
