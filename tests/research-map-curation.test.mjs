import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  activeResearchRouteSupplyPredicate,
  curateResearchTrackPaper,
  ResearchTrackPaperCurationError,
  routePaperSelectionContradiction,
} from "../lib/research-map-curation.ts";

function d1Database(sqlite) {
  return {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...values) { bindings = values; return statement; },
        async run() {
          const result = sqlite.prepare(sql).run(...bindings);
          return { meta: { changes: Number(result.changes) } };
        },
        async first() { return sqlite.prepare(sql).get(...bindings) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...bindings) }; },
      };
      return statement;
    },
    async batch(statements) {
      const results = [];
      sqlite.exec("BEGIN");
      try {
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

test("selection contradictions reject the production DFT and electrochemistry drift", () => {
  assert.equal(routePaperSelectionContradiction({
    rationaleEn: "This work is foundational in computational materials science, but it is unrelated to information theory, so it is rejected.",
  }), true);
  assert.equal(routePaperSelectionContradiction({
    rationaleEn: "This paper belongs to electrochemical storage and is unrelated to strong converses, so it is rejected.",
  }), true);
  assert.equal(routePaperSelectionContradiction({
    rationaleEn: "This work directly proves a finite-blocklength strong converse and belongs at the frontier.",
  }), false);
});

test("the curation migration deactivates explicit contradictions without deleting route history", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY);
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, build_status TEXT NOT NULL DEFAULT 'ready',
        build_error TEXT, build_retry_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE research_track_papers (
        id TEXT PRIMARY KEY, track_id TEXT NOT NULL, space_id TEXT NOT NULL, canonical_id TEXT NOT NULL,
        doi TEXT, title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '', venue TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '', published_at TEXT, citation_count INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL, summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '',
        rationale_zh TEXT NOT NULL DEFAULT '', rationale_en TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX idx_research_track_papers_track_canonical ON research_track_papers(track_id, canonical_id);
      CREATE INDEX idx_research_track_papers_track_position ON research_track_papers(track_id, position);
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT NOT NULL, canonical_id TEXT NOT NULL);
      CREATE TABLE research_map_evidence_proposals (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, track_id TEXT NOT NULL, paper_id TEXT NOT NULL, status TEXT NOT NULL
      );
      INSERT INTO research_spaces VALUES ('space-a');
      INSERT INTO research_tracks(id, space_id) VALUES ('track-a', 'space-a');
      INSERT INTO research_track_papers(id, track_id, space_id, canonical_id, title, role, rationale_en, position) VALUES
       ('dft', 'track-a', 'space-a', 'doi:dft', 'GGA exchange and correlation', 'foundation', 'Unrelated to information theory, so it is rejected.', 0),
       ('electro', 'track-a', 'space-a', 'doi:electro', 'High-rate electrochemical storage', 'frontier', 'This is unrelated to strong converses, so it is rejected.', 1),
       ('direct', 'track-a', 'space-a', 'doi:direct', 'A strong converse for rate-distortion', 'frontier', 'Directly proves the target result.', 2);
    `);
    const migration = (await readFile(new URL("../drizzle/0043_cooing_doctor_doom.sql", import.meta.url), "utf8"))
      .replaceAll("--> statement-breakpoint", "");
    sqlite.exec(migration);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_track_papers").get().count, 3);
    assert.deepEqual(sqlite.prepare(
      "SELECT id, curation_status FROM research_track_papers ORDER BY id",
    ).all().map((row) => ({ ...row })), [
      { id: "dft", curation_status: "deactivated" },
      { id: "direct", curation_status: "active" },
      { id: "electro", curation_status: "deactivated" },
    ]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_track_paper_curation_events").get().count, 2);
    assert.equal(sqlite.prepare("SELECT build_status FROM research_tracks WHERE id = 'track-a'").get().build_status, "ready");
  } finally {
    sqlite.close();
  }
});

function createCurationFixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE research_spaces (id TEXT PRIMARY KEY);
    CREATE TABLE research_tracks (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, title_zh TEXT NOT NULL, title_en TEXT NOT NULL,
      build_status TEXT NOT NULL DEFAULT 'ready', build_error TEXT, build_retry_at TEXT,
      intelligence_json TEXT NOT NULL DEFAULT '{}', intelligence_model TEXT NOT NULL DEFAULT '',
      intelligence_updated_at TEXT, intelligence_status TEXT NOT NULL DEFAULT 'ready',
      intelligence_attempt_count INTEGER NOT NULL DEFAULT 0, intelligence_error TEXT,
      intelligence_retry_at TEXT, intelligence_lock_token TEXT, intelligence_lock_expires_at TEXT,
      intelligence_refresh_requested_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE research_track_papers (
      id TEXT PRIMARY KEY, track_id TEXT NOT NULL, space_id TEXT NOT NULL, canonical_id TEXT NOT NULL,
      title TEXT NOT NULL, rationale_zh TEXT NOT NULL DEFAULT '', rationale_en TEXT NOT NULL DEFAULT '',
      curation_status TEXT NOT NULL DEFAULT 'active', curation_reason_code TEXT,
      curation_reason_zh TEXT NOT NULL DEFAULT '', curation_reason_en TEXT NOT NULL DEFAULT '',
      curation_source TEXT NOT NULL DEFAULT '', curation_evidence_json TEXT NOT NULL DEFAULT '[]', curation_updated_at TEXT
    );
    CREATE TABLE research_track_paper_curation_events (
      id TEXT PRIMARY KEY, space_id TEXT, track_id TEXT, track_paper_id TEXT, action TEXT, reason_code TEXT,
      reason_zh TEXT, reason_en TEXT, source TEXT, actor_kind TEXT, evidence_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, canonical_id TEXT, horizon TEXT);
    CREATE TABLE research_map_evidence_proposals (id TEXT PRIMARY KEY, space_id TEXT, track_id TEXT, paper_id TEXT, status TEXT);
    CREATE TABLE monitor_query_plans (id TEXT PRIMARY KEY, space_id TEXT, plan_date TEXT);
    CREATE TABLE research_paper_network_states (
      space_id TEXT PRIMARY KEY, status TEXT, built_paper_count INTEGER, model TEXT, sources_json TEXT, error TEXT, updated_at TEXT
    );
    INSERT INTO research_spaces VALUES ('space-a');
    INSERT INTO research_tracks(id, space_id, title_zh, title_en) VALUES ('track-a', 'space-a', '强逆定理', 'Strong converses');
    INSERT INTO research_track_papers(id, track_id, space_id, canonical_id, title, rationale_en)
      VALUES ('paper-a', 'track-a', 'space-a', 'doi:paper-a', 'A direct paper', 'A direct route contribution.');
    INSERT INTO monitor_query_plans VALUES ('plan-a', 'space-a', date('now'));
    INSERT INTO research_paper_network_states VALUES ('space-a', 'ready', 1, 'model', '[]', NULL, CURRENT_TIMESTAMP);
  `);
  return { sqlite, database: d1Database(sqlite) };
}

test("deactivation and restoration are reversible, audited, and never delete the paper", async () => {
  const { sqlite, database } = createCurationFixture();
  try {
    const deactivated = await curateResearchTrackPaper(database, {
      spaceId: "space-a", trackId: "track-a", paperId: "paper-a", status: "deactivated", reasonCode: "off_topic",
    });
    assert.equal(deactivated.changed, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_track_papers").get().count, 1);
    assert.equal(sqlite.prepare("SELECT curation_status FROM research_track_papers").get().curation_status, "deactivated");
    assert.equal(sqlite.prepare("SELECT build_status FROM research_tracks").get().build_status, "retryable");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_query_plans").get().count, 0);
    assert.equal(sqlite.prepare("SELECT status FROM research_paper_network_states").get().status, "idle");

    const restored = await curateResearchTrackPaper(database, {
      spaceId: "space-a", trackId: "track-a", paperId: "paper-a", status: "active",
    });
    assert.equal(restored.changed, 1);
    assert.equal(sqlite.prepare("SELECT curation_status FROM research_track_papers").get().curation_status, "active");
    assert.equal(sqlite.prepare("SELECT build_status FROM research_tracks").get().build_status, "partial");
    assert.deepEqual(sqlite.prepare(
      "SELECT action FROM research_track_paper_curation_events ORDER BY rowid",
    ).all().map((row) => row.action), ["deactivated", "reactivated"]);

    sqlite.exec(`
      INSERT INTO monitored_papers VALUES ('monitor-a', 'space-a', 'doi:paper-a', 'years');
      INSERT INTO research_map_evidence_proposals VALUES ('proposal-a', 'space-a', 'track-a', 'monitor-a', 'confirmed');
    `);
    await assert.rejects(() => curateResearchTrackPaper(database, {
      spaceId: "space-a", trackId: "track-a", paperId: "paper-a", status: "deactivated", reasonCode: "off_topic",
    }), (error) => error instanceof ResearchTrackPaperCurationError && error.code === "confirmed_evidence_protected");
  } finally {
    sqlite.close();
  }
});

test("a deactivated route source leaves the queue while an independent source remains eligible", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, canonical_id TEXT, horizon TEXT);
      CREATE TABLE monitor_candidate_sources (id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT, source_key TEXT, query_key TEXT);
      CREATE TABLE monitor_discovery_coverage (space_id TEXT, horizon TEXT, source_key TEXT, query_key TEXT, route_id TEXT);
      CREATE TABLE research_track_papers (space_id TEXT, track_id TEXT, canonical_id TEXT, curation_status TEXT);
      INSERT INTO monitored_papers VALUES ('paper-a', 'space-a', 'doi:a', 'years');
      INSERT INTO monitor_candidate_sources VALUES ('source-route', 'space-a', 'paper-a', 'research-route:foundation', 'route-query');
      INSERT INTO monitor_discovery_coverage VALUES ('space-a', 'years', 'research-route:foundation', 'route-query', 'track-a');
      INSERT INTO research_track_papers VALUES ('space-a', 'track-a', 'doi:a', 'deactivated');
    `);
    const predicate = activeResearchRouteSupplyPredicate("p");
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM monitored_papers p WHERE ${predicate}`).get().count, 0);
    sqlite.exec(`INSERT INTO monitor_candidate_sources VALUES ('source-journal', 'space-a', 'paper-a', 'crossref:journal', 'journal-query')`);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM monitored_papers p WHERE ${predicate}`).get().count, 1);
  } finally {
    sqlite.close();
  }
});
