import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { qualityQueueCountsSql, pendingQualityCandidateCondition, qualityAbstractDetailsSql } from "../lib/monitor-quality-status-sql.mjs";
import { activeResearchRouteSupplyPredicate } from "../lib/research-map-curation.ts";
import { monitorQualityReviewStatus, monitorScanCompletionLabel } from "../lib/monitor-quality-queue.mjs";

const now = Date.parse("2026-09-16T10:00:00Z");
const queue = { pendingCount: 8, verificationCount: 2, retryCount: 1, awaitingAbstractCount: 3, abstractRetryAt: now + 3600000 };
const monitor = { qualityQueue: queue, status: "ready", nextRunAt: "2026-09-16T10:10:00Z" };

test("a saved queue is scheduled, not running; only a live lease means active processing", () => {
  assert.equal(monitorQualityReviewStatus(monitor, now).state, "scheduled");
  assert.equal(monitorQualityReviewStatus(monitor, now).firstReviewCount, 5);
  const active = { ...monitor, status: "deep_reviewing", leaseExpiresAt: "2026-09-16T10:01:00Z" };
  assert.equal(monitorQualityReviewStatus(active, now).state, "active");
  assert.equal(monitorQualityReviewStatus({ ...active, leaseExpiresAt: "2026-09-16T09:59:00Z" }, now).state, "scheduled");
  assert.equal(monitorQualityReviewStatus({ ...active, automation: { paused: true } }, now).state, "paused");
});

test("delays, errors, absent scheduling and abstract backoff are separate states", () => {
  assert.equal(monitorQualityReviewStatus({ ...monitor, nextRunAt: "2026-09-16 09:30:00" }, now).state, "overdue");
  assert.equal(monitorQualityReviewStatus({ ...monitor, nextRunAt: null }, now).state, "unscheduled");
  const retry = monitorQualityReviewStatus({ ...monitor, status: "error", scanJob: { nextRetryAt: "2026-09-16T10:30:00Z" } }, now);
  assert.equal(retry.state, "retry");
  assert.equal(retry.nextAt, "2026-09-16T10:30:00Z");
  const evidence = monitorQualityReviewStatus({ ...monitor, qualityQueue: { ...queue, pendingCount: 0 } }, now);
  assert.equal(evidence.state, "evidence");
  assert.equal(evidence.nextAt, "2026-09-16T11:00:00.000Z");
});

test("live empty queue overrides historical job and bounded library samples", () => {
  const empty = { ...monitor, qualityQueue: { ...queue, pendingCount: 0, awaitingAbstractCount: 0 }, scanJob: { verificationPendingCount: 8 }, historyPapers: [{ qualityStage: "queued" }] };
  assert.equal(monitorQualityReviewStatus(empty, now), null);
  assert.equal(monitorScanCompletionLabel(empty, "zh"), "本轮扫描已结束");
  assert.equal(monitorQualityReviewStatus({ savedCandidatePapers: [{}] }, now), null);
});

test("production queue count SQL respects scope, dismissal, existing recommendations, inactive routes and abstract backoff", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE monitored_papers(id TEXT PRIMARY KEY, space_id TEXT, canonical_id TEXT, horizon TEXT);
      CREATE TABLE paper_insights(paper_id TEXT, analysis_source TEXT, analysis_model TEXT DEFAULT 'deepseek-flash', verification_status TEXT DEFAULT '', screening_reason TEXT DEFAULT '', updated_at TEXT DEFAULT CURRENT_TIMESTAMP, llm_relevance_score INTEGER DEFAULT 80, quality_score INTEGER DEFAULT 75, abstract_text TEXT DEFAULT 'abstract', ever_recommended INTEGER DEFAULT 0);
      CREATE TABLE paper_abstract_recovery(paper_id TEXT PRIMARY KEY, retry_at INTEGER, lease_until INTEGER);
      CREATE TABLE paper_feedback(space_id TEXT, paper_id TEXT, feedback TEXT);
      CREATE TABLE monitor_candidate_sources(space_id TEXT, paper_id TEXT, source_key TEXT, query_key TEXT);
      CREATE TABLE monitor_discovery_coverage(space_id TEXT, horizon TEXT, source_key TEXT, query_key TEXT, route_id TEXT);
      CREATE TABLE research_track_papers(space_id TEXT, canonical_id TEXT, track_id TEXT, curation_status TEXT);`);
    const add = (id, source, space = "mine") => {
      db.prepare("INSERT INTO monitored_papers VALUES (?, ?, ?, 'years')").run(id, space, id);
      db.prepare("INSERT INTO paper_insights (paper_id, analysis_source) VALUES (?, ?)").run(id, source);
    };
    add("screen", "deepseek_screened"); add("verify", "deepseek_verification_pending"); add("retry", "deepseek_rejected");
    db.exec("UPDATE paper_insights SET verification_status='degraded', screening_reason='timeout' WHERE paper_id='retry'");
    add("missing", "deepseek_rejected");
    db.exec("UPDATE paper_insights SET screening_reason='Abstract evidence unavailable after bounded enrichment' WHERE paper_id='missing'");
    db.prepare("INSERT INTO paper_abstract_recovery VALUES ('missing', ?, 0)").run(Date.now() + 3600000);
    add("published", "deepseek_verification_pending"); db.exec("UPDATE paper_insights SET ever_recommended=1 WHERE paper_id='published'");
    add("dismissed", "deepseek_screened"); db.exec("INSERT INTO paper_feedback VALUES ('mine', 'dismissed', 'not_relevant')");
    add("other", "deepseek_screened", "other-space");
    add("rejected", "deepseek_rejected");
    add("inactive", "deepseek_screened");
    db.exec("INSERT INTO monitor_candidate_sources VALUES ('mine', 'inactive', 'route', 'q'); INSERT INTO monitor_discovery_coverage VALUES ('mine', 'years', 'route', 'q', 'r'); INSERT INTO research_track_papers VALUES ('mine', 'inactive', 'r', 'deactivated')");
    const row = db.prepare(qualityQueueCountsSql(activeResearchRouteSupplyPredicate("p"))).get("2026-08-19", "2026-08-19", "mine");
    assert.equal(row.pendingCount, 3); assert.equal(row.verificationCount, 1); assert.equal(row.retryCount, 1); assert.equal(row.awaitingAbstractCount, 1);
    const eligible = db.prepare(`SELECT p.id FROM monitored_papers p JOIN paper_insights i ON i.paper_id=p.id WHERE p.space_id='mine' AND ${pendingQualityCandidateCondition} AND COALESCE(i.ever_recommended, 0)=0 AND NOT EXISTS (SELECT 1 FROM paper_feedback f WHERE f.space_id=p.space_id AND f.paper_id=p.id AND f.feedback='not_relevant') AND ${activeResearchRouteSupplyPredicate("p")}`).all("2026-08-19", "2026-08-19");
    assert.equal(eligible.length, row.pendingCount);
    db.exec(`ALTER TABLE monitored_papers ADD COLUMN title TEXT DEFAULT 'Paper';
      ALTER TABLE paper_insights ADD COLUMN space_id TEXT;
      UPDATE paper_insights SET space_id=(SELECT space_id FROM monitored_papers p WHERE p.id=paper_id);
      ALTER TABLE paper_abstract_recovery ADD COLUMN space_id TEXT DEFAULT 'mine';
      ALTER TABLE paper_abstract_recovery ADD COLUMN status TEXT DEFAULT 'not_found';
      ALTER TABLE paper_abstract_recovery ADD COLUMN attempted_json TEXT DEFAULT '["arxiv"]';
      ALTER TABLE paper_abstract_recovery ADD COLUMN updated_at TEXT;`);
    const details = () => db.prepare(qualityAbstractDetailsSql(activeResearchRouteSupplyPredicate("p"))).all('mine', '2026-08-19', '2026-08-19');
    assert.deepEqual(details().map(p => p.id), ['missing']);
    db.exec("INSERT INTO paper_feedback VALUES ('mine','missing','not_relevant')");
    assert.equal(details().length, 0, 'dismissed papers must not leak into the recovery list');
    db.exec("DELETE FROM paper_feedback WHERE paper_id='missing'");
    db.exec("UPDATE paper_abstract_recovery SET retry_at=0");
    assert.equal(details().length, 0, 'eligible candidates leave the waiting list');
    const resumed = db.prepare(qualityQueueCountsSql(activeResearchRouteSupplyPredicate("p"))).get("2026-08-19", "2026-08-19", "mine");
    assert.equal(resumed.pendingCount, 4); assert.equal(resumed.awaitingAbstractCount, 0);
    db.exec("UPDATE paper_insights SET updated_at=datetime('now', '-91 days'), verification_status='degraded', screening_reason='unsupported claims' WHERE paper_id='rejected'");
    const aged = db.prepare(qualityQueueCountsSql(activeResearchRouteSupplyPredicate("p"))).get("2026-08-19", "2026-08-19", "mine");
    assert.equal(aged.pendingCount, 5);
    assert.equal(aged.retryCount, 1, "an aged scientific rejection is a re-review, not a technical failure");
  } finally { db.close(); }
});

test("approved further reading stays above utilities with collapsed previews and explicit toggle", () => {
  const app = readFileSync(new URL("../app/research-app.tsx", import.meta.url), "utf8");
  assert.ok(app.indexOf('className="v2-today-more v2-today-more-compact"') < app.indexOf('<QualityReviewStatus monitor='));
  assert.match(app, /v2-more-preview[\s\S]*additionalTodayPapers.slice\(0, 2\)/);
  assert.match(app, /已通过全部评审，可直接阅读/);
  assert.doesNotMatch(app, /篇候选正在质量评估|通过后会自动进入今日；现在无需处理/);
});
