import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  researchRouteLearningSignal,
  researchRouteOperationalStatus,
  selectResearchRouteAttention,
} from "../lib/research-map.ts";
import {
  RECENT_CONFIRMED_ROUTE_EVIDENCE_SQL,
  RESEARCH_GUIDANCE_TRACKS_SQL,
} from "../lib/monitor-route-planning.ts";

function route(overrides = {}) {
  return {
    id: "route-a",
    monitoringStatus: "active",
    buildStatus: "ready",
    intelligenceStatus: "ready",
    papers: [{ id: "node-a" }],
    queuedForReviewCount: 0,
    reviewingForReviewCount: 0,
    recommendedCandidateCount: 0,
    pendingEvidenceCount: 0,
    discoveryEffect: {
      discoveredCount: 0,
      deepReviewedCount: 0,
      recommendedCount: 0,
      acceptedCount: 0,
      staleDays: 0,
    },
    intelligence: null,
    ...overrides,
  };
}

test("route operating and learning states stay evidence based", () => {
  assert.equal(researchRouteOperationalStatus(route()), "healthy");
  assert.equal(researchRouteOperationalStatus(route({ monitoringStatus: "paused" })), "paused");
  assert.equal(researchRouteOperationalStatus(route({ buildStatus: "retryable", papers: [] })), "retryable");
  assert.equal(researchRouteOperationalStatus(route({ buildStatus: "partial" })), "degraded");
  assert.equal(researchRouteOperationalStatus(route({ queuedForReviewCount: 2 })), "learning");

  assert.equal(researchRouteLearningSignal(route()), "neutral");
  assert.equal(researchRouteLearningSignal(route({ discoveryEffect: { discoveredCount: 4 } })), "observing");
  assert.equal(researchRouteLearningSignal(route({ discoveryEffect: { recommendedCount: 1, acceptedCount: 0 } })), "awaiting_feedback");
  assert.equal(researchRouteLearningSignal(route({ discoveryEffect: { deepReviewedCount: 4, recommendedCount: 0 } })), "rebalancing");
  assert.equal(researchRouteLearningSignal(route({ discoveryEffect: { recommendedCount: 1, acceptedCount: 1 } })), "reinforcing");
  assert.equal(researchRouteLearningSignal(route({ monitoringStatus: "paused" })), "paused");

  assert.equal(selectResearchRouteAttention([
    route({ id: "paused-recovery", monitoringStatus: "paused", papers: [], buildStatus: "failed" }),
    route({ id: "active" }),
  ]).trackId, "active");
  assert.equal(selectResearchRouteAttention([route({ monitoringStatus: "paused" })]), null);
});

test("the additive route-pause migration preserves every historical record", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_tracks (id TEXT PRIMARY KEY, space_id TEXT, updated_at TEXT);
      CREATE TABLE monitor_candidate_sources (id TEXT PRIMARY KEY, route_id TEXT, paper_id TEXT);
      CREATE TABLE paper_feedback (id TEXT PRIMARY KEY, paper_id TEXT, feedback TEXT);
      CREATE TABLE paper_reading_progress (id TEXT PRIMARY KEY, paper_id TEXT, status TEXT);
      INSERT INTO research_tracks VALUES ('route-a', 'space-a', '2026-08-31 00:00:00');
      INSERT INTO monitor_candidate_sources VALUES ('source-a', 'route-a', 'paper-a');
      INSERT INTO paper_feedback VALUES ('feedback-a', 'paper-a', 'relevant');
      INSERT INTO paper_reading_progress VALUES ('reading-a', 'paper-a', 'read');
    `);
    const migration = await readFile(new URL("../drizzle/0050_third_omega_flight.sql", import.meta.url), "utf8");
    sqlite.exec(migration.replaceAll("--> statement-breakpoint", ""));
    assert.equal(sqlite.prepare("SELECT monitoring_status FROM research_tracks WHERE id = 'route-a'").get().monitoring_status, "active");
    sqlite.prepare("UPDATE research_tracks SET monitoring_status = 'paused' WHERE id = 'route-a'").run();
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_candidate_sources").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM paper_feedback").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM paper_reading_progress").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("paused routes leave automatic guidance and confirmed-evidence retrieval without losing rows", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY, space_id TEXT, user_role TEXT, depth_score INTEGER, support_score INTEGER,
        interaction_score INTEGER, intelligence_json TEXT, intelligence_updated_at TEXT,
        monitoring_status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, canonical_id TEXT, title TEXT);
      CREATE TABLE research_map_evidence_proposals (
        id TEXT PRIMARY KEY, space_id TEXT, track_id TEXT, paper_id TEXT, map_role TEXT,
        confidence INTEGER, status TEXT, updated_at TEXT
      );
      INSERT INTO research_tracks VALUES
        ('active-route', 'space-a', 'core', 80, 20, 5, '{}', NULL, 'active'),
        ('paused-route', 'space-a', 'support', 70, 30, 4, '{}', NULL, 'paused');
      INSERT INTO monitored_papers VALUES
        ('active-paper', 'space-a', 'doi:active', 'Active evidence'),
        ('paused-paper', 'space-a', 'doi:paused', 'Paused evidence');
      INSERT INTO research_map_evidence_proposals VALUES
        ('active-evidence', 'space-a', 'active-route', 'active-paper', 'frontier', 88, 'confirmed', '2026-08-31 01:00:00'),
        ('paused-evidence', 'space-a', 'paused-route', 'paused-paper', 'foundation', 91, 'confirmed', '2026-08-31 02:00:00');
    `);
    assert.deepEqual(sqlite.prepare(RESEARCH_GUIDANCE_TRACKS_SQL).all("space-a").map((row) => row.id), ["active-route"]);
    assert.deepEqual(sqlite.prepare(RECENT_CONFIRMED_ROUTE_EVIDENCE_SQL).all("space-a").map((row) => row.track_id), ["active-route"]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_map_evidence_proposals").get().count, 2);

    sqlite.prepare("UPDATE research_tracks SET monitoring_status = 'active' WHERE id = 'paused-route'").run();
    assert.deepEqual(sqlite.prepare(RESEARCH_GUIDANCE_TRACKS_SQL).all("space-a").map((row) => row.id), ["active-route", "paused-route"]);
    assert.deepEqual(sqlite.prepare(RECENT_CONFIRMED_ROUTE_EVIDENCE_SQL).all("space-a").map((row) => row.track_id), ["paused-route", "active-route"]);
  } finally {
    sqlite.close();
  }
});

test("route cards and narrow screens render one shared five-stage funnel source", async () => {
  const [client, styles, mapRoute, monitorRoute] = await Promise.all([
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(client.match(/<RoutePipelineFunnel track=/g)?.length, 2);
  for (const field of ["discoveredCount", "queued", "reviewing", "deepReviewedCount", "recommendedCount"]) {
    assert.match(client, new RegExp(field));
  }
  assert.match(client, /confirmedRouteEvidenceCount\(track\)/);
  assert.match(client, /暂停只停止新发现，不清除任何历史/);
  assert.match(client, /历史、候选、推荐和阅读记录全部保留/);
  assert.match(styles, /\.v2-route-pipeline\s*\{[^}]*grid-template-columns:\s*repeat\(5,/);
  const v72 = styles.split("Pi Research V72")[1] || "";
  assert.doesNotMatch(v72, /\.v2-route-pipeline[^}]*display:\s*none/);

  const patchHandler = mapRoute.match(/export async function PATCH[\s\S]*$/)?.[0] || "";
  assert.match(patchHandler, /UPDATE research_tracks SET monitoring_status = \?/);
  assert.doesNotMatch(patchHandler, /DELETE FROM (monitor_candidate_sources|monitored_papers|paper_feedback|paper_reading_progress)/);
  assert.match(mapRoute, /const activeTracks = tracks\.filter\(\(track\) => track\.monitoringStatus === "active"\)/);
  assert.match(monitorRoute, /COALESCE\(t\.monitoring_status, 'active'\) = 'active'/);
  assert.match(monitorRoute, /COALESCE\(track\.monitoring_status, 'active'\) = 'active'/);
});
