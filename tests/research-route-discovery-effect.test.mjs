import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { RESEARCH_ROUTE_DISCOVERY_EFFECT_SQL } from "../lib/monitor-candidate-queue.ts";

test("route discovery effects combine four task budgets with the formal recommendation funnel", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE monitor_discovery_coverage (
        space_id TEXT, route_id TEXT, horizon TEXT, source_key TEXT, channel TEXT, query_key TEXT,
        attempt_count INTEGER, last_scanned_at TEXT
      );
      CREATE TABLE monitor_candidate_sources (space_id TEXT, paper_id TEXT, source_key TEXT, query_key TEXT);
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, horizon TEXT);
      CREATE TABLE recommendation_audit_events (
        space_id TEXT, paper_id TEXT, reviewed_at TEXT, provenance_json TEXT,
        recommended INTEGER, is_paper INTEGER
      );
      CREATE TABLE paper_feedback (space_id TEXT, paper_id TEXT, feedback TEXT, saved INTEGER);

      INSERT INTO monitor_discovery_coverage VALUES
        ('space-a', 'track-a', 'days', 'research-route:frontier', 'topic', 'frontier-1', 1, '2026-08-25 08:00:00'),
        ('space-a', 'track-a', 'years', 'research-route:foundation', 'topic', 'foundation-1', 1, '2026-08-25 08:01:00'),
        ('space-a', 'track-a', 'days', 'research-route:gap', 'topic', 'gap-1', 1, '2026-08-25 08:02:00'),
        ('space-a', 'track-a', 'months', 'research-route:network', 'citation', 'network-1', 2, '2026-08-25 08:03:00');
      INSERT INTO monitored_papers VALUES
        ('paper-a', 'space-a', 'days'),
        ('paper-b', 'space-a', 'days');
      INSERT INTO monitor_candidate_sources VALUES
        ('space-a', 'paper-a', 'research-route:frontier', 'frontier-1'),
        ('space-a', 'paper-b', 'research-route:gap', 'gap-1');
      INSERT INTO recommendation_audit_events VALUES
        ('space-a', 'paper-a', '2026-08-25 09:00:00', '[{"sourceKey":"research-route:frontier","routeId":"track-a","originKind":"route_frontier"}]', 1, 1),
        ('space-a', 'paper-b', '2026-08-25 09:01:00', '[{"sourceKey":"research-route:gap","routeId":"track-a","originKind":"route_gap"}]', 0, 1);
      INSERT INTO paper_feedback VALUES ('space-a', 'paper-a', 'relevant', 0);
    `);

    const row = sqlite.prepare(RESEARCH_ROUTE_DISCOVERY_EFFECT_SQL).get("space-a", "space-a");
    assert.equal(row.track_id, "track-a");
    assert.equal(row.attempt_count, 5);
    assert.equal(row.frontier_attempts, 1);
    assert.equal(row.foundation_attempts, 1);
    assert.equal(row.gap_attempts, 1);
    assert.equal(row.network_attempts, 2);
    assert.equal(row.discovered_count, 2);
    assert.equal(row.deep_reviewed_count, 2);
    assert.equal(row.recommended_count, 1);
    assert.equal(row.accepted_count, 1);
  } finally {
    sqlite.close();
  }
});
