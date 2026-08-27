import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  NETWORK_DISMISS_REASON_CODE,
  researchNetworkDismissalReversalStatements,
  researchNetworkDismissalStatements,
} from "../lib/research-network-dismissal.ts";

function d1Database(sqlite) {
  return {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...values) {
          bindings = values;
          return statement;
        },
        async run() {
          const result = sqlite.prepare(sql).run(...bindings);
          return { meta: { changes: Number(result.changes) } };
        },
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

function fixture(candidateStatus = "ghost") {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE research_network_candidates (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, status TEXT NOT NULL,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE paper_feedback (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, paper_id TEXT NOT NULL,
      saved INTEGER NOT NULL DEFAULT 0, feedback TEXT, reason_code TEXT,
      note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(space_id, paper_id)
    );
    CREATE TABLE research_preference_signals (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, layer TEXT NOT NULL,
      kind TEXT NOT NULL, label_zh TEXT NOT NULL, label_en TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '', confidence INTEGER NOT NULL,
      weight INTEGER NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(space_id, source_type, source_id, kind, label_en)
    );
    CREATE TABLE research_tracks (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, intelligence_json TEXT NOT NULL DEFAULT '{}',
      intelligence_model TEXT NOT NULL DEFAULT '', intelligence_updated_at TEXT,
      intelligence_status TEXT NOT NULL DEFAULT 'ready', intelligence_attempt_count INTEGER NOT NULL DEFAULT 0,
      intelligence_error TEXT, intelligence_retry_at TEXT, intelligence_lock_token TEXT,
      intelligence_lock_expires_at TEXT, intelligence_refresh_requested_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE research_track_papers (
      id TEXT PRIMARY KEY, track_id TEXT NOT NULL, space_id TEXT NOT NULL,
      curation_status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE research_network_candidate_edges (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
      seed_paper_id TEXT NOT NULL
    );
    CREATE TABLE monitor_query_plans (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, plan_date TEXT NOT NULL
    );
  `);
  sqlite.prepare("INSERT INTO research_network_candidates (id, space_id, status) VALUES (?, ?, ?)")
    .run("candidate-a", "space-a", candidateStatus);
  sqlite.prepare("INSERT INTO research_tracks (id, space_id, intelligence_json, intelligence_model, intelligence_updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)")
    .run("track-a", "space-a", '{"nextSearchQuery":"old query"}', "deepseek-v4-pro");
  sqlite.prepare("INSERT INTO research_track_papers (id, track_id, space_id) VALUES (?, ?, ?)")
    .run("seed-a", "track-a", "space-a");
  sqlite.prepare("INSERT INTO research_network_candidate_edges (id, space_id, candidate_id, seed_paper_id) VALUES (?, ?, ?, ?)")
    .run("edge-a", "space-a", "candidate-a", "seed-a");
  sqlite.prepare("INSERT INTO monitor_query_plans (id, space_id, plan_date) VALUES ('today', 'space-a', date('now')), ('tomorrow', 'space-a', date('now', '+1 day'))").run();
  return { sqlite, database: d1Database(sqlite) };
}

async function dismiss(database) {
  return database.batch(researchNetworkDismissalStatements(database, {
    spaceId: "space-a",
    candidateId: "candidate-a",
    paperId: "paper-a",
    paperTitle: "A Network Discovery",
  }));
}

async function accept(database) {
  return database.batch(researchNetworkDismissalReversalStatements(database, {
    spaceId: "space-a",
    candidateId: "candidate-a",
    paperId: "paper-a",
  }));
}

test("network dismissal atomically records explicit negative feedback and invalidates route guidance", async () => {
  const { sqlite, database } = fixture();
  sqlite.prepare(`INSERT INTO research_preference_signals
    (id, space_id, layer, kind, label_zh, label_en, confidence, weight, source_type, source_id)
    VALUES ('old-signal', 'space-a', 'explicit', 'topic', '偏好旧论文', 'Prefer old paper', 90, 90, 'paper_feedback', 'paper-a:topic_fit')`).run();

  const first = await dismiss(database);
  assert.equal(first[0].meta.changes, 1);
  assert.equal(sqlite.prepare("SELECT status FROM research_network_candidates WHERE id = 'candidate-a'").get().status, "dismissed");
  assert.deepEqual(
    { ...sqlite.prepare("SELECT saved, feedback, reason_code FROM paper_feedback WHERE space_id = 'space-a' AND paper_id = 'paper-a'").get() },
    { saved: 0, feedback: "not_relevant", reason_code: NETWORK_DISMISS_REASON_CODE },
  );
  assert.equal(sqlite.prepare("SELECT active FROM research_preference_signals WHERE id = 'old-signal'").get().active, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_preference_signals WHERE source_id = 'paper-a:network_dismissed' AND active = 1").get().count, 1);
  const savedGuidance = sqlite.prepare(
    "SELECT intelligence_json, intelligence_model, intelligence_updated_at, intelligence_status FROM research_tracks WHERE id = 'track-a'",
  ).get();
  assert.equal(savedGuidance.intelligence_json, '{"nextSearchQuery":"old query"}');
  assert.equal(savedGuidance.intelligence_model, "deepseek-v4-pro");
  assert.ok(savedGuidance.intelligence_updated_at);
  assert.equal(savedGuidance.intelligence_status, "pending");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_query_plans WHERE id = 'today'").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_query_plans WHERE id = 'tomorrow'").get().count, 1);

  await dismiss(database);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM paper_feedback WHERE paper_id = 'paper-a'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_preference_signals WHERE source_id = 'paper-a:network_dismissed' AND active = 1").get().count, 1);
});

test("network dismissal cannot mutate an accepted candidate or leak negative feedback", async () => {
  const { sqlite, database } = fixture("accepted");
  const results = await dismiss(database);
  assert.equal(results[0].meta.changes, 0);
  assert.equal(sqlite.prepare("SELECT status FROM research_network_candidates WHERE id = 'candidate-a'").get().status, "accepted");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM paper_feedback").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_preference_signals").get().count, 0);
  assert.equal(sqlite.prepare("SELECT intelligence_json FROM research_tracks WHERE id = 'track-a'").get().intelligence_json, '{"nextSearchQuery":"old query"}');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_query_plans WHERE id = 'today'").get().count, 1);
});

test("accepting a dismissed candidate atomically removes only its network dismissal memory", async () => {
  const { sqlite, database } = fixture();
  sqlite.prepare(`INSERT INTO paper_feedback
    (id, space_id, paper_id, saved, feedback, reason_code, note)
    VALUES ('feedback-b', 'space-a', 'paper-b', 0, 'not_relevant', 'network_dismissed', 'keep')`).run();
  sqlite.prepare(`INSERT INTO research_preference_signals
    (id, space_id, layer, kind, label_zh, label_en, confidence, weight, source_type, source_id)
    VALUES
     ('topic-a', 'space-a', 'explicit', 'topic', '论文 A 的其他信号', 'Other signal for paper A', 80, 80, 'paper_feedback', 'paper-a:topic_fit'),
     ('dismiss-b', 'space-a', 'explicit', 'exclusion', '排除论文 B', 'Exclude paper B', 96, 100, 'paper_feedback', 'paper-b:network_dismissed')`).run();

  await dismiss(database);
  sqlite.prepare("INSERT INTO monitor_query_plans (id, space_id, plan_date) VALUES ('regenerated-today', 'space-a', date('now'))").run();
  const results = await accept(database);

  assert.equal(results[0].meta.changes, 1);
  assert.equal(sqlite.prepare("SELECT status FROM research_network_candidates WHERE id = 'candidate-a'").get().status, "accepted");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM paper_feedback WHERE paper_id = 'paper-a' AND reason_code = 'network_dismissed'").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_preference_signals WHERE source_id = 'paper-a:network_dismissed'").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_preference_signals WHERE id = 'topic-a'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM paper_feedback WHERE paper_id = 'paper-b'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_preference_signals WHERE id = 'dismiss-b'").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_query_plans WHERE id = 'regenerated-today'").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_query_plans WHERE id = 'tomorrow'").get().count, 1);

  await accept(database);
  assert.equal(sqlite.prepare("SELECT status FROM research_network_candidates WHERE id = 'candidate-a'").get().status, "accepted");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM paper_feedback WHERE paper_id = 'paper-b'").get().count, 1);
});

test("accept and dismiss race orderings converge without a stale Today exclusion", async () => {
  for (const ordering of ["dismiss-first", "accept-first"]) {
    const { sqlite, database } = fixture();
    if (ordering === "dismiss-first") {
      await dismiss(database);
      await accept(database);
    } else {
      await accept(database);
      const dismissed = await dismiss(database);
      assert.equal(dismissed[0].meta.changes, 0);
    }

    assert.equal(sqlite.prepare("SELECT status FROM research_network_candidates WHERE id = 'candidate-a'").get().status, "accepted");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM paper_feedback WHERE paper_id = 'paper-a' AND reason_code = 'network_dismissed'").get().count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_preference_signals WHERE source_id = 'paper-a:network_dismissed' AND active = 1").get().count, 0);
  }
});

test("research-network PATCH resolves the shared canonical and batches dismissal with map reconciliation", async () => {
  const route = await readFile(new URL("../app/api/research-network/route.ts", import.meta.url), "utf8");
  const patch = route.slice(route.indexOf("export async function PATCH"));
  assert.match(patch, /const dismissalQueue = await enqueueMonitorCandidates/);
  assert.match(patch, /WHERE space_id = \? AND canonical_id = \? LIMIT 1/);
  assert.match(patch, /database\.batch\(\[\s*\.\.\.researchNetworkDismissalStatements[\s\S]*\.\.\.reconcileResearchMapEvidenceStatements/);
  assert.match(patch, /results\[0\]\?\.meta\.changes/);
  assert.match(patch, /researchNetworkDismissalReversalStatements/);
});
