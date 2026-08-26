import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  applyStoredResearchRoutePrecisionAudits,
  researchRoutePrecisionAuditProgress,
  routePrecisionAcceptedForActiveNode,
  routePrecisionAutoDeactivates,
  sanitizeResearchRoutePrecisionJudgments,
} from "../lib/research-map-precision.ts";

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

test("the independent semantic gate is fail-closed and separates direct, boundary, and clear drift", () => {
  const allowed = new Set(["route-a:paper-direct", "route-a:paper-boundary", "route-a:paper-drift"]);
  const judgments = sanitizeResearchRoutePrecisionJudgments([
    { directionKey: "route-a", canonicalId: "paper-direct", verdict: "direct", confidence: 0.84, reasonZh: "中心问题直接属于路线。", reasonEn: "The central question directly belongs to the route.", evidenceTerms: ["rate-distortion"] },
    { directionKey: "route-a", canonicalId: "paper-boundary", verdict: "borderline", confidence: 82, reasonZh: "仅构成方法桥接。", reasonEn: "This is only a methodological bridge." },
    { directionKey: "route-a", canonicalId: "paper-drift", verdict: "off_topic", confidence: 94, reasonZh: "中心问题属于计算机视觉。", reasonEn: "The central problem belongs to computer vision.", evidenceTerms: ["image dehazing"] },
    { directionKey: "route-a", canonicalId: "paper-direct", verdict: "off_topic", confidence: 99, reasonZh: "重复项不应覆盖。", reasonEn: "A duplicate must not overwrite the first judgment." },
    { directionKey: "route-a", canonicalId: "invented", verdict: "direct", confidence: 100, reasonZh: "无效。", reasonEn: "Invalid." },
  ], allowed);

  assert.equal(judgments.length, 3);
  assert.equal(judgments[0].confidence, 84);
  assert.equal(routePrecisionAcceptedForActiveNode(judgments[0]), true);
  assert.equal(routePrecisionAcceptedForActiveNode(judgments[1]), false);
  assert.equal(routePrecisionAcceptedForActiveNode(undefined), false);
  assert.equal(routePrecisionAutoDeactivates(judgments[2]), true);
  assert.equal(routePrecisionAutoDeactivates({ ...judgments[2], confidence: 89 }), false);
});
function createPrecisionFixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE research_spaces (id TEXT PRIMARY KEY);
    CREATE TABLE research_tracks (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, title_zh TEXT NOT NULL, title_en TEXT NOT NULL,
      build_status TEXT NOT NULL DEFAULT 'ready', build_error TEXT, build_retry_at TEXT,
      intelligence_json TEXT NOT NULL DEFAULT '{}', intelligence_model TEXT NOT NULL DEFAULT '',
      intelligence_updated_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE research_track_papers (
      id TEXT PRIMARY KEY, track_id TEXT NOT NULL, space_id TEXT NOT NULL, canonical_id TEXT NOT NULL,
      title TEXT NOT NULL, rationale_zh TEXT NOT NULL DEFAULT '', rationale_en TEXT NOT NULL DEFAULT '',
      curation_status TEXT NOT NULL DEFAULT 'active', curation_reason_code TEXT,
      curation_reason_zh TEXT NOT NULL DEFAULT '', curation_reason_en TEXT NOT NULL DEFAULT '',
      curation_source TEXT NOT NULL DEFAULT '', curation_evidence_json TEXT NOT NULL DEFAULT '[]',
      curation_updated_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE research_track_paper_curation_events (
      id TEXT PRIMARY KEY, space_id TEXT, track_id TEXT, track_paper_id TEXT, action TEXT, reason_code TEXT,
      reason_zh TEXT, reason_en TEXT, source TEXT, actor_kind TEXT, evidence_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE research_track_paper_precision_audits (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, track_id TEXT NOT NULL, track_paper_id TEXT NOT NULL,
      gate_version TEXT NOT NULL, verdict TEXT NOT NULL, confidence INTEGER NOT NULL DEFAULT 0,
      reason_zh TEXT NOT NULL DEFAULT '', reason_en TEXT NOT NULL DEFAULT '', evidence_json TEXT NOT NULL DEFAULT '[]',
      model TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'shadow', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_at TEXT
    );
    CREATE TABLE monitored_papers (id TEXT PRIMARY KEY, space_id TEXT, canonical_id TEXT, horizon TEXT);
    CREATE TABLE research_map_evidence_proposals (id TEXT PRIMARY KEY, space_id TEXT, track_id TEXT, paper_id TEXT, status TEXT);
    CREATE TABLE monitor_query_plans (id TEXT PRIMARY KEY, space_id TEXT, plan_date TEXT);
    CREATE TABLE research_paper_network_states (
      space_id TEXT PRIMARY KEY, status TEXT, built_paper_count INTEGER, model TEXT, sources_json TEXT, error TEXT, updated_at TEXT
    );
    INSERT INTO research_spaces VALUES ('space-a');
    INSERT INTO research_tracks(id, space_id, title_zh, title_en) VALUES ('track-a', 'space-a', '强逆定理', 'Strong converses');
    INSERT INTO research_track_papers(id, track_id, space_id, canonical_id, title) VALUES
      ('direct', 'track-a', 'space-a', 'doi:direct', 'A strong converse theorem'),
      ('boundary', 'track-a', 'space-a', 'doi:boundary', 'A useful bridge'),
      ('drift-high', 'track-a', 'space-a', 'doi:drift-high', 'Single image dehazing'),
      ('drift-low', 'track-a', 'space-a', 'doi:drift-low', 'A weakly suspected mismatch'),
      ('confirmed', 'track-a', 'space-a', 'doi:confirmed', 'User-confirmed evidence');
    INSERT INTO monitored_papers VALUES ('monitor-confirmed', 'space-a', 'doi:confirmed', 'years');
    INSERT INTO research_map_evidence_proposals VALUES ('proposal-confirmed', 'space-a', 'track-a', 'monitor-confirmed', 'confirmed');
    INSERT INTO research_track_paper_precision_audits
      (id, space_id, track_id, track_paper_id, gate_version, verdict, confidence, reason_zh, reason_en, evidence_json) VALUES
      ('audit-direct', 'space-a', 'track-a', 'direct', 'semantic-v1', 'direct', 96, '直接相关', 'Direct', '["strong converse"]'),
      ('audit-boundary', 'space-a', 'track-a', 'boundary', 'semantic-v1', 'borderline', 87, '边界', 'Boundary', '["bridge"]'),
      ('audit-high', 'space-a', 'track-a', 'drift-high', 'semantic-v1', 'off_topic', 96, '明确跑题', 'Clearly off topic', '["image dehazing"]'),
      ('audit-low', 'space-a', 'track-a', 'drift-low', 'semantic-v1', 'off_topic', 89, '置信度不足', 'Insufficient confidence', '[]'),
      ('audit-confirmed', 'space-a', 'track-a', 'confirmed', 'semantic-v1', 'off_topic', 99, '模型误判也不得覆盖确认', 'Confirmed evidence remains protected', '[]');
  `);
  return { sqlite, database: d1Database(sqlite) };
}

test("a later pass applies only prior high-confidence drift and preserves every paper plus confirmed evidence", async () => {
  const { sqlite, database } = createPrecisionFixture();
  try {
    assert.deepEqual(await researchRoutePrecisionAuditProgress(database, "space-a"), {
      pending: 0,
      shadow: 4,
      highConfidenceOffTopic: 1,
    });
    assert.equal(await applyStoredResearchRoutePrecisionAudits(database, "space-a"), 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_track_papers").get().count, 5);
    assert.deepEqual(sqlite.prepare(
      "SELECT id, curation_status FROM research_track_papers ORDER BY id",
    ).all().map((row) => ({ ...row })), [
      { id: "boundary", curation_status: "active" },
      { id: "confirmed", curation_status: "active" },
      { id: "direct", curation_status: "active" },
      { id: "drift-high", curation_status: "deactivated" },
      { id: "drift-low", curation_status: "active" },
    ]);
    const event = sqlite.prepare("SELECT reason_code, source, actor_kind, evidence_json FROM research_track_paper_curation_events").get();
    assert.equal(event.reason_code, "semantic_mismatch");
    assert.equal(event.source, "system_semantic_precision_guard");
    assert.equal(event.actor_kind, "system");
    assert.match(event.evidence_json, /independent_semantic_precision_audit/);
    assert.equal(sqlite.prepare("SELECT status FROM research_track_paper_precision_audits WHERE id = 'audit-high'").get().status, "applied");
    assert.equal(sqlite.prepare("SELECT status FROM research_track_paper_precision_audits WHERE id = 'audit-confirmed'").get().status, "shadow");
    assert.deepEqual(await researchRoutePrecisionAuditProgress(database, "space-a"), {
      pending: 0,
      shadow: 3,
      highConfidenceOffTopic: 0,
    });
  } finally {
    sqlite.close();
  }
});

test("the precision migration is additive and the API gates persistence before queue supply", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY);
      CREATE TABLE research_tracks (id TEXT PRIMARY KEY);
      CREATE TABLE research_track_papers (id TEXT PRIMARY KEY);
    `);
    sqlite.exec((await readFile(new URL("../drizzle/0044_lame_doctor_octopus.sql", import.meta.url), "utf8"))
      .replaceAll("--> statement-breakpoint", ""));
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'research_track_paper_precision_audits'",
    ).get().count, 1);
  } finally {
    sqlite.close();
  }

  const [route, app] = await Promise.all([
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /const \[parsed, precisionResponses\] = await Promise\.all/);
  assert.match(route, /Math\.ceil\(compact\.length \/ 18\)/);
  assert.match(route, /timeoutMs: 44_000/);
  assert.match(route, /Route semantic precision audit returned incomplete coverage/);
  assert.match(route, /routePrecisionAcceptedForActiveNode/);
  assert.match(route, /candidates\.filter\(\(candidate\) => !routePrecisionAutoDeactivates/);
  assert.match(route, /Promise\.allSettled\(paperBatches\.map/);
  assert.match(route, /auditedIdentities\.size < rows\.results\.length/);
  assert.match(route, /papers\.slice\(index \* 8, index \* 8 \+ 8\)/);
  assert.ok(route.indexOf("applyStoredResearchRoutePrecisionAudits") < route.indexOf("const rows = await database.prepare"));
  assert.ok(app.indexOf('action: "audit-precision"')
    < app.indexOf("for (const trackId of data.intelligenceProgress?.pendingTrackIds"));
});
