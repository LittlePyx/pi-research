import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { researchMapEvidenceProposalBootstrapSql } from "../db/schema.ts";

const migrationUrl = new URL("../drizzle/0026_research_map_evidence_proposals.sql", import.meta.url);

function createLegacyDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE research_spaces (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE monitor_scan_jobs (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL);
    CREATE TABLE research_tracks (
      id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL, title_zh TEXT NOT NULL, title_en TEXT NOT NULL,
      intelligence_json TEXT NOT NULL DEFAULT '{}', intelligence_model TEXT NOT NULL DEFAULT '',
      intelligence_updated_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monitored_papers (
      id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL, canonical_id TEXT NOT NULL, title TEXT NOT NULL
    );
    CREATE TABLE paper_insights (
      paper_id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL,
      summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '',
      analysis_source TEXT NOT NULL DEFAULT 'metadata', llm_recommended INTEGER NOT NULL DEFAULT 0,
      llm_relevance_score INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE paper_feedback (
      id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL, paper_id TEXT NOT NULL,
      saved INTEGER NOT NULL DEFAULT 0, feedback TEXT
    );
    CREATE TABLE paper_reading_progress (
      id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL, paper_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread'
    );
    CREATE TABLE research_track_papers (
      id TEXT PRIMARY KEY NOT NULL, track_id TEXT NOT NULL, space_id TEXT NOT NULL, canonical_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'frontier', summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '',
      rationale_zh TEXT NOT NULL DEFAULT '', rationale_en TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(track_id, canonical_id)
    );
    CREATE TABLE research_map_changes (
      id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL, track_id TEXT NOT NULL, paper_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'new_evidence', title_zh TEXT NOT NULL, title_en TEXT NOT NULL,
      summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', confidence INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(paper_id, track_id, kind)
    );
    CREATE TABLE recommendation_audit_events (
      id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL, paper_id TEXT NOT NULL,
      recommended INTEGER NOT NULL DEFAULT 0, reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE research_network_candidates (
      id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL, canonical_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ghost'
    );
    CREATE TABLE research_paper_edges (
      id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL,
      source_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE,
      target_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE
    );
    CREATE TABLE monitor_query_plans (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL, plan_date TEXT NOT NULL);
    CREATE TABLE research_paper_network_states (
      space_id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL DEFAULT 'idle', built_paper_count INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL DEFAULT '', sources_json TEXT NOT NULL DEFAULT '[]', error TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE research_network_expansion_states (
      id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL, expansion_key TEXT NOT NULL
    );

    INSERT INTO research_spaces VALUES ('space-a'), ('space-b');
    INSERT INTO research_tracks
      (id, space_id, title_zh, title_en, intelligence_json, intelligence_model, intelligence_updated_at)
    VALUES
      ('track-auto', 'space-a', '自动路线', 'Automatic route', '{"gap":"stale-auto"}', 'legacy-model', '2026-08-20 10:00:00'),
      ('track-manual', 'space-a', '人工路线', 'Manual route', '{"gap":"keep-manual"}', 'legacy-model', '2026-08-20 10:00:00'),
      ('track-other', 'space-b', '其他路线', 'Other route', '{"gap":"keep-other"}', 'legacy-model', '2026-08-20 10:00:00');
    INSERT INTO monitored_papers VALUES
      ('accepted', 'space-a', 'doi:accepted', 'Accepted auto paper'),
      ('dismissed', 'space-a', 'doi:dismissed', 'Dismissed auto paper'),
      ('pending', 'space-a', 'doi:pending', 'Pending auto paper'),
      ('manual', 'space-a', 'doi:manual', 'Manual paper'),
      ('network', 'space-a', 'doi:network', 'Network accepted paper'),
      ('graph', 'space-a', 'doi:graph', 'Graph-connected paper'),
      ('peer', 'space-a', 'doi:peer', 'Graph peer');
    INSERT INTO paper_insights VALUES
      ('accepted', 'space-a', 'summary-accepted', 'summary-accepted', 'deepseek', 1, 91),
      ('dismissed', 'space-a', 'summary-dismissed', 'summary-dismissed', 'deepseek', 1, 87),
      ('pending', 'space-a', 'summary-pending', 'summary-pending', 'deepseek', 1, 83),
      ('manual', 'space-a', 'summary-manual', 'summary-manual', 'deepseek', 1, 80),
      ('network', 'space-a', 'summary-network', 'summary-network', 'deepseek', 1, 89),
      ('graph', 'space-a', 'summary-graph', 'summary-graph', 'deepseek', 1, 88);
    INSERT INTO paper_feedback VALUES
      ('feedback-accepted', 'space-a', 'accepted', 1, NULL),
      ('feedback-dismissed', 'space-a', 'dismissed', 0, 'not_relevant');
    INSERT INTO research_track_papers
      (id, track_id, space_id, canonical_id, summary_zh, summary_en, rationale_zh, rationale_en, created_at)
    VALUES
      ('tp-accepted', 'track-auto', 'space-a', 'doi:accepted', 'summary-accepted', 'summary-accepted', 'reason-accepted', 'reason-accepted', '2026-08-20 10:00:00'),
      ('tp-dismissed', 'track-auto', 'space-a', 'doi:dismissed', 'summary-dismissed', 'summary-dismissed', 'reason-dismissed', 'reason-dismissed', '2026-08-20 10:00:00'),
      ('tp-pending', 'track-auto', 'space-a', 'doi:pending', 'summary-pending', 'summary-pending', 'reason-pending', 'reason-pending', '2026-08-20 10:00:00'),
      ('tp-manual', 'track-manual', 'space-a', 'doi:manual', 'summary-manual', 'summary-manual', 'reason-manual', 'reason-manual', '2026-08-18 10:00:00'),
      ('tp-network', 'track-manual', 'space-a', 'doi:network', 'summary-network', 'summary-network', 'reason-network', 'reason-network', '2026-08-20 10:00:00'),
      ('tp-graph', 'track-manual', 'space-a', 'doi:graph', 'summary-graph', 'summary-graph', 'reason-graph', 'reason-graph', '2026-08-20 10:00:00'),
      ('tp-peer', 'track-manual', 'space-a', 'doi:peer', '', '', 'manual peer', 'manual peer', '2026-08-01 10:00:00');
    INSERT INTO research_map_changes
      (id, space_id, track_id, paper_id, title_zh, title_en, summary_zh, summary_en, confidence, created_at)
    VALUES
      ('change-accepted', 'space-a', 'track-auto', 'accepted', '接受', 'accepted', 'reason-accepted', 'reason-accepted', 90, '2026-08-20 10:00:00'),
      ('change-dismissed', 'space-a', 'track-auto', 'dismissed', '拒绝', 'dismissed', 'reason-dismissed', 'reason-dismissed', 86, '2026-08-20 10:00:00'),
      ('change-pending', 'space-a', 'track-auto', 'pending', '待定', 'pending', 'reason-pending', 'reason-pending', 82, '2026-08-20 10:00:00'),
      ('change-manual', 'space-a', 'track-manual', 'manual', '人工', 'manual', 'reason-manual', 'reason-manual', 79, '2026-08-20 10:00:00'),
      ('change-network', 'space-a', 'track-manual', 'network', '网络', 'network', 'reason-network', 'reason-network', 88, '2026-08-20 10:00:00'),
      ('change-graph', 'space-a', 'track-manual', 'graph', '图谱', 'graph', 'reason-graph', 'reason-graph', 87, '2026-08-20 10:00:00');
    INSERT INTO recommendation_audit_events VALUES
      ('audit-accepted', 'space-a', 'accepted', 1, '2026-08-20 10:00:00'),
      ('audit-dismissed', 'space-a', 'dismissed', 1, '2026-08-20 10:00:00'),
      ('audit-pending', 'space-a', 'pending', 1, '2026-08-20 10:00:00'),
      ('audit-manual', 'space-a', 'manual', 1, '2026-08-20 10:00:00'),
      ('audit-network', 'space-a', 'network', 1, '2026-08-20 10:00:00'),
      ('audit-graph', 'space-a', 'graph', 1, '2026-08-20 10:00:00');
    INSERT INTO research_network_candidates VALUES ('candidate-network', 'space-a', 'doi:network', 'accepted');
    INSERT INTO research_paper_edges VALUES
      ('edge-network', 'space-a', 'tp-network', 'tp-peer'),
      ('edge-graph', 'space-a', 'tp-graph', 'tp-peer');
    INSERT INTO monitor_query_plans VALUES
      ('plan-a', 'space-a', '2026-08-20'), ('plan-b', 'space-b', '2026-08-20');
    INSERT INTO research_paper_network_states VALUES
      ('space-a', 'ready', 7, 'legacy-model', '["cached"]', 'stale', CURRENT_TIMESTAMP),
      ('space-b', 'ready', 2, 'legacy-model', '["other"]', NULL, CURRENT_TIMESTAMP);
    INSERT INTO research_network_expansion_states VALUES
      ('expansion-a', 'space-a', 'auto'), ('expansion-b', 'space-b', 'other');
  `);
  return sqlite;
}

function installBootstrap(sqlite) {
  for (const statement of researchMapEvidenceProposalBootstrapSql) sqlite.exec(statement);
}

async function runMigration(sqlite) {
  sqlite.exec(await readFile(migrationUrl, "utf8"));
}

function assertConservativeBackfill(sqlite) {
  assert.deepEqual(
    sqlite.prepare("SELECT paper_id, status FROM research_map_evidence_proposals ORDER BY paper_id").all().map((row) => ({ ...row })),
    [
      { paper_id: "accepted", status: "confirmed" },
      { paper_id: "dismissed", status: "dismissed" },
      { paper_id: "pending", status: "pending" },
    ],
  );
  assert.deepEqual(
    sqlite.prepare("SELECT paper_id FROM research_map_changes ORDER BY paper_id").all().map((row) => row.paper_id),
    ["accepted", "graph", "manual", "network"],
  );
  assert.deepEqual(
    sqlite.prepare("SELECT canonical_id FROM research_track_papers ORDER BY canonical_id").all().map((row) => row.canonical_id),
    ["doi:accepted", "doi:graph", "doi:manual", "doi:network", "doi:peer"],
  );
  assert.deepEqual(
    sqlite.prepare("SELECT id FROM research_paper_edges ORDER BY id").all().map((row) => row.id),
    ["edge-graph", "edge-network"],
  );
  assert.deepEqual(
    { ...sqlite.prepare("SELECT intelligence_json, intelligence_model, intelligence_updated_at FROM research_tracks WHERE id = 'track-auto'").get() },
    { intelligence_json: "{}", intelligence_model: "", intelligence_updated_at: null },
  );
  assert.equal(
    sqlite.prepare("SELECT intelligence_json FROM research_tracks WHERE id = 'track-manual'").get().intelligence_json,
    '{"gap":"keep-manual"}',
  );
  assert.deepEqual(sqlite.prepare("SELECT id FROM monitor_query_plans ORDER BY id").all().map((row) => row.id), ["plan-b"]);
  assert.deepEqual(
    { ...sqlite.prepare("SELECT status, built_paper_count, model, sources_json, error FROM research_paper_network_states WHERE space_id = 'space-a'").get() },
    { status: "idle", built_paper_count: 0, model: "", sources_json: "[]", error: null },
  );
  assert.deepEqual(sqlite.prepare("SELECT id FROM research_network_expansion_states ORDER BY id").all().map((row) => row.id), ["expansion-b"]);
}

test("0026 is safe when runtime bootstrap creates the proposal table before migrations", async () => {
  const sqlite = createLegacyDatabase();
  try {
    installBootstrap(sqlite);
    await runMigration(sqlite);
    assertConservativeBackfill(sqlite);
    await runMigration(sqlite);
    assertConservativeBackfill(sqlite);
  } finally {
    sqlite.close();
  }
});

test("0026 can run before runtime bootstrap and still backfills legacy evidence", async () => {
  const sqlite = createLegacyDatabase();
  try {
    await runMigration(sqlite);
    installBootstrap(sqlite);
    assertConservativeBackfill(sqlite);
  } finally {
    sqlite.close();
  }
});

test("0026 and runtime bootstrap are safe on a fresh database with no legacy evidence", async () => {
  const sqlite = createLegacyDatabase();
  try {
    sqlite.exec(`
      DELETE FROM research_paper_edges;
      DELETE FROM research_map_changes;
      DELETE FROM research_track_papers;
      DELETE FROM recommendation_audit_events;
      DELETE FROM paper_insights;
      DELETE FROM paper_feedback;
      DELETE FROM monitored_papers;
    `);
    await runMigration(sqlite);
    installBootstrap(sqlite);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_map_evidence_proposals").get().count, 0);
  } finally {
    sqlite.close();
  }
});
