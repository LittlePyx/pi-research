import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  LATEST_AUDIT_ROUTE_ORIGIN_SUBQUERY,
  PRE_REVIEW_ROUTE_ORIGIN_SUBQUERY,
  RECENT_CONFIRMED_ROUTE_EVIDENCE_SQL,
  RESEARCH_GUIDANCE_REVISIONS_SQL,
  RESEARCH_GUIDANCE_TRACKS_SQL,
  isMonitorRouteProvenance,
  monitorPaperNotDismissedSql,
  monitorRouteOriginKind,
  retainChangedMonitorWrites,
  retainReviewableScanWork,
  reviewableScanCandidateIdsSql,
  researchGuidanceIdentity,
  selectPrioritizedDiscoveryPlans,
} from "../lib/monitor-route-planning.ts";

function plan(key, score, overrides = {}) {
  return {
    key,
    sourceKey: `crossref:${key}`,
    explorationRole: "core",
    adaptiveScore: score,
    ...overrides,
  };
}

test("route base, evidence-gap, and adjacent route plans survive a crowded balanced budget", () => {
  const generic = Array.from({ length: 14 }, (_, index) => plan(`generic-${index}`, 100 - index));
  const plans = [
    ...generic,
    plan("ai-adjacent", 99, { explorationRole: "adjacent" }),
    plan("research-route-track-a", 7, { sourceKey: "crossref:route:track-a", routeId: "track-a" }),
    plan("research-route-track-b", 6, { sourceKey: "crossref:route:track-b", routeId: "track-b" }),
    plan("research-route-gap-track-a", 5, { sourceKey: "crossref:route-gap:track-a", routeId: "track-a" }),
    plan("research-route-track-c", 4, { sourceKey: "crossref:route:track-c", routeId: "track-c", explorationRole: "adjacent" }),
  ];

  const selected = selectPrioritizedDiscoveryPlans(plans, "balanced");
  assert.equal(selected.length, 10);
  assert.ok(selected.some((item) => item.key === "research-route-track-a"));
  assert.ok(selected.some((item) => item.key === "research-route-track-b"));
  assert.ok(selected.some((item) => item.key === "research-route-gap-track-a"));
  assert.ok(selected.some((item) => item.key === "research-route-track-c"));
  assert.equal(selected.filter((item) => item.explorationRole === "adjacent").length, 2);
});

test("focused mode protects core route and gap plans without admitting adjacent exploration", () => {
  const plans = [
    ...Array.from({ length: 12 }, (_, index) => plan(`generic-${index}`, 100 - index)),
    plan("research-route-track-a", 4, { sourceKey: "crossref:route:track-a", routeId: "track-a" }),
    plan("research-route-track-b", 3, { sourceKey: "crossref:route:track-b", routeId: "track-b" }),
    plan("research-route-gap-track-b", 2, { sourceKey: "crossref:route-gap:track-b", routeId: "track-b" }),
    plan("research-route-track-c", 1, { sourceKey: "crossref:route:track-c", routeId: "track-c", explorationRole: "adjacent" }),
  ];
  const selected = selectPrioritizedDiscoveryPlans(plans, "focused");
  assert.equal(selected.length, 8);
  assert.ok(selected.some((item) => item.key === "research-route-track-a"));
  assert.ok(selected.some((item) => item.key === "research-route-track-b"));
  assert.ok(selected.some((item) => item.key === "research-route-gap-track-b"));
  assert.equal(selected.some((item) => item.explorationRole === "adjacent"), false);
});

test("route provenance keeps provider-specific route and gap semantics", () => {
  assert.equal(monitorRouteOriginKind("crossref:route:track-a"), "route_search");
  assert.equal(monitorRouteOriginKind("crossref:route-gap:track-a"), "route_gap");
  assert.equal(monitorRouteOriginKind("semantic_scholar:citations", "track-a"), "route_search");
  assert.equal(monitorRouteOriginKind("semantic_scholar:citations"), null);
  assert.equal(isMonitorRouteProvenance({ sourceKey: "semantic_scholar:citations", routeId: "track-a" }), true);
  assert.equal(isMonitorRouteProvenance({ sourceKey: "crossref:topic" }), false);
});

test("an explicit not-relevant withdrawal is pruned from every active scan phase and the frozen queue converges", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, canonical_id TEXT);
      CREATE TABLE paper_feedback (space_id TEXT, paper_id TEXT, feedback TEXT);
      INSERT INTO monitored_papers VALUES
        ('paper-a', 'space-a', 'doi:a'),
        ('paper-b', 'space-a', 'doi:b'),
        ('paper-c', 'space-a', 'doi:c');
      INSERT INTO paper_feedback VALUES
        ('space-a', 'paper-b', 'not_relevant'),
        ('space-a', 'paper-c', 'relevant');
    `);
    const queuedIds = ["doi:a", "doi:b", "doi:c"];
    const reviewable = sqlite.prepare(reviewableScanCandidateIdsSql(queuedIds.length))
      .all("space-a", ...queuedIds).map((row) => row.canonical_id);
    assert.deepEqual(reviewable.sort(), ["doi:a", "doi:c"]);

    const retained = retainReviewableScanWork({
      candidateIds: ["doi:a", "doi:b", "doi:c"],
      screens: [{ canonicalId: "doi:a" }, { canonicalId: "doi:c" }],
      deepIds: ["doi:a", "doi:b", "doi:c"],
      deepCompletedIds: ["doi:a", "doi:c"],
      rescueScreenIds: ["doi:b", "doi:c"],
    }, reviewable);
    assert.deepEqual(retained.candidateIds, ["doi:a", "doi:c"]);
    assert.deepEqual(retained.screens.map((screen) => screen.canonicalId), ["doi:a", "doi:c"]);
    assert.deepEqual(retained.deepIds, ["doi:a", "doi:c"]);
    assert.deepEqual(retained.deepCompletedIds, ["doi:a", "doi:c"]);
    assert.deepEqual(retained.rescueScreenIds, ["doi:c"]);
    assert.deepEqual(retained.candidateIds.filter((id) => !retained.screens.some((screen) => screen.canonicalId === id)), []);
    assert.deepEqual(retained.deepIds.filter((id) => !retained.deepCompletedIds.includes(id)), []);
  } finally {
    sqlite.close();
  }
});

test("review persistence is atomically suppressed before dismissal and later dismissal wins after persistence", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, canonical_id TEXT);
      CREATE TABLE paper_feedback (
        id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT, feedback TEXT,
        UNIQUE(space_id, paper_id)
      );
      CREATE TABLE paper_insights (
        paper_id TEXT PRIMARY KEY, space_id TEXT, analysis_source TEXT, llm_recommended INTEGER
      );
      CREATE TABLE research_map_evidence_proposals (
        id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT, status TEXT
      );
      CREATE TABLE recommendation_audit_events (
        id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT, recommended INTEGER
      );
      INSERT INTO monitored_papers VALUES
        ('paper-before', 'space-a', 'doi:before'),
        ('paper-after', 'space-a', 'doi:after');
    `);

    const persistDecision = (paperId) => {
      const result = sqlite.prepare(`
        INSERT INTO paper_insights (paper_id, space_id, analysis_source, llm_recommended)
        SELECT ?, ?, 'deepseek', 1
        WHERE ${monitorPaperNotDismissedSql("?", "?")}
        ON CONFLICT(paper_id) DO UPDATE SET analysis_source = excluded.analysis_source,
          llm_recommended = excluded.llm_recommended
      `).run(paperId, "space-a", "space-a", paperId);
      const persisted = retainChangedMonitorWrites([paperId], [{ meta: { changes: result.changes } }]);
      for (const actualPaperId of persisted) {
        sqlite.prepare(`
          INSERT INTO research_map_evidence_proposals VALUES (?, ?, ?, 'pending')
        `).run(`proposal:${actualPaperId}`, "space-a", actualPaperId);
        sqlite.prepare(`
          INSERT INTO recommendation_audit_events (id, space_id, paper_id, recommended)
          SELECT ?, ?, ?, 1 WHERE ${monitorPaperNotDismissedSql("?", "?")}
        `).run(`audit:${actualPaperId}`, "space-a", actualPaperId, "space-a", actualPaperId);
      }
      return persisted.length;
    };
    const todayCount = (paperId) => sqlite.prepare(`
      SELECT COUNT(*) AS count FROM paper_insights insight
      WHERE insight.paper_id = ? AND insight.llm_recommended = 1
       AND ${monitorPaperNotDismissedSql("insight.space_id", "insight.paper_id")}
    `).get(paperId).count;

    sqlite.prepare("INSERT INTO paper_feedback VALUES (?, ?, ?, 'not_relevant')")
      .run("feedback-before", "space-a", "paper-before");
    assert.equal(persistDecision("paper-before"), 0);
    assert.equal(todayCount("paper-before"), 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_map_evidence_proposals WHERE paper_id = ?").get("paper-before").count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM recommendation_audit_events WHERE paper_id = ?").get("paper-before").count, 0);

    assert.equal(persistDecision("paper-after"), 1);
    assert.equal(todayCount("paper-after"), 1);
    sqlite.prepare("INSERT INTO paper_feedback VALUES (?, ?, ?, 'not_relevant')")
      .run("feedback-after", "space-a", "paper-after");
    sqlite.prepare("UPDATE research_map_evidence_proposals SET status = 'dismissed' WHERE space_id = ? AND paper_id = ?")
      .run("space-a", "paper-after");
    assert.equal(todayCount("paper-after"), 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_map_evidence_proposals WHERE paper_id = ? AND status = 'pending'").get("paper-after").count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM recommendation_audit_events WHERE paper_id = ?").get("paper-after").count, 1);
  } finally {
    sqlite.close();
  }
});

function guidanceSnapshot(sqlite) {
  const tracks = sqlite.prepare(RESEARCH_GUIDANCE_TRACKS_SQL).all("space-a");
  const revisions = sqlite.prepare(RESEARCH_GUIDANCE_REVISIONS_SQL).get("space-a", "space-a", "space-a", "space-a", "space-a");
  const confirmedEvidence = sqlite.prepare(RECENT_CONFIRMED_ROUTE_EVIDENCE_SQL).all("space-a");
  return {
    identity: researchGuidanceIdentity({
      tracks,
      preferenceRevision: revisions.preference_revision,
      feedbackRevision: revisions.feedback_revision,
      readingRevision: revisions.reading_revision,
      confirmedEvidenceRevision: revisions.confirmed_evidence_revision,
      synthesisRevision: revisions.synthesis_revision,
      confirmedEvidence,
    }),
    confirmedEvidence,
  };
}

test("interaction and confirmed route evidence change the durable guidance identity", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY, space_id TEXT, user_role TEXT, depth_score INTEGER, support_score INTEGER,
        interaction_score INTEGER, intelligence_json TEXT, intelligence_updated_at TEXT
      );
      CREATE TABLE research_preference_signals (space_id TEXT, active INTEGER, updated_at TEXT);
      CREATE TABLE paper_feedback (space_id TEXT, updated_at TEXT);
      CREATE TABLE paper_reading_progress (space_id TEXT, updated_at TEXT);
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, canonical_id TEXT, title TEXT);
      CREATE TABLE research_map_evidence_proposals (
        id TEXT PRIMARY KEY, space_id TEXT, track_id TEXT, paper_id TEXT, map_role TEXT,
        confidence INTEGER, status TEXT, updated_at TEXT
      );
      CREATE TABLE research_syntheses (space_id TEXT, status TEXT, updated_at TEXT);
      INSERT INTO research_tracks VALUES
        ('track-a', 'space-a', 'core', 70, 25, 1, '{}', NULL);
      INSERT INTO monitored_papers VALUES
        ('paper-a', 'space-a', 'doi:10.1/a', 'A newly confirmed route theorem'),
        ('paper-b', 'space-a', 'doi:10.1/b', 'A provisional lead');
    `);
    const initial = guidanceSnapshot(sqlite);

    sqlite.prepare("UPDATE research_tracks SET interaction_score = 8 WHERE id = 'track-a'").run();
    const interacted = guidanceSnapshot(sqlite);
    assert.notEqual(interacted.identity, initial.identity);

    sqlite.prepare("INSERT INTO research_map_evidence_proposals VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("pending-b", "space-a", "track-a", "paper-b", "frontier", 72, "pending", "2026-08-21 09:00:00");
    const pending = guidanceSnapshot(sqlite);
    assert.equal(pending.identity, interacted.identity);

    sqlite.prepare("INSERT INTO research_map_evidence_proposals VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("confirmed-a", "space-a", "track-a", "paper-a", "foundation", 91, "confirmed", "2026-08-21 10:00:00");
    const confirmed = guidanceSnapshot(sqlite);
    assert.notEqual(confirmed.identity, pending.identity);
    assert.deepEqual(confirmed.confirmedEvidence.map((item) => ({ title: item.title, role: item.map_role })), [
      { title: "A newly confirmed route theorem", role: "foundation" },
    ]);
  } finally {
    sqlite.close();
  }
});

function originForPaper(sqlite) {
  return sqlite.prepare(`
    SELECT COALESCE(audit_origin.source_key, fallback_origin.source_key, '') AS source_key,
      COALESCE(audit_origin.route_id, fallback_origin.route_id, '') AS route_id
    FROM monitored_papers paper
    LEFT JOIN ${LATEST_AUDIT_ROUTE_ORIGIN_SUBQUERY} audit_origin
      ON audit_origin.space_id = paper.space_id AND audit_origin.paper_id = paper.id
    LEFT JOIN ${PRE_REVIEW_ROUTE_ORIGIN_SUBQUERY} fallback_origin
      ON fallback_origin.space_id = paper.space_id AND fallback_origin.paper_id = paper.id
    WHERE paper.id = 'paper-a'
  `).get();
}

test("Today route provenance falls back only to route sources seen before review", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, horizon TEXT);
      CREATE TABLE paper_insights (paper_id TEXT, space_id TEXT, updated_at TEXT);
      CREATE TABLE monitor_candidate_sources (
        id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT, source_key TEXT, query_key TEXT, first_seen_at TEXT
      );
      CREATE TABLE monitor_discovery_coverage (
        space_id TEXT, horizon TEXT, source_key TEXT, query_key TEXT, route_id TEXT
      );
      CREATE TABLE recommendation_audit_events (
        id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT, recommended INTEGER,
        reviewed_at TEXT, provenance_json TEXT
      );
      INSERT INTO monitored_papers VALUES ('paper-a', 'space-a', 'years');
      INSERT INTO paper_insights VALUES ('paper-a', 'space-a', '2026-08-21 10:00:00');
      INSERT INTO monitor_candidate_sources VALUES
        ('source-after', 'space-a', 'paper-a', 'crossref:topic', 'after', '2026-08-21 11:00:00');
      INSERT INTO monitor_discovery_coverage VALUES
        ('space-a', 'years', 'crossref:topic', 'after', 'track-after');
    `);

    assert.deepEqual({ ...originForPaper(sqlite) }, { source_key: "", route_id: "" });

    sqlite.prepare("INSERT INTO monitor_candidate_sources VALUES (?, ?, ?, ?, ?, ?)").run(
      "source-before", "space-a", "paper-a", "semantic_scholar:citations", "before", "2026-08-21 09:00:00",
    );
    sqlite.prepare("INSERT INTO monitor_discovery_coverage VALUES (?, ?, ?, ?, ?)").run(
      "space-a", "years", "semantic_scholar:citations", "before", "track-before",
    );

    assert.deepEqual({ ...originForPaper(sqlite) }, {
      source_key: "semantic_scholar:citations",
      route_id: "track-before",
    });

    sqlite.prepare("INSERT INTO recommendation_audit_events VALUES (?, ?, ?, ?, ?, ?)").run(
      "audit-route", "space-a", "paper-a", 1, "2026-08-21 10:00:01",
      JSON.stringify([{ sourceKey: "crossref:route-gap:track-audit", routeId: "track-audit" }]),
    );
    assert.deepEqual({ ...originForPaper(sqlite) }, {
      source_key: "crossref:route-gap:track-audit",
      route_id: "track-audit",
    });
  } finally {
    sqlite.close();
  }
});
