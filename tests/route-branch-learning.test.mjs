import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  ROUTE_BRANCH_OUTCOMES_SQL,
  aggregateRouteBranchScores,
} from "../lib/discovery/route-branch-learning.mjs";

test("route quality follows reviewed outcomes when a regenerated query has no exact history", () => {
  const scores = aggregateRouteBranchScores([
    { routeId: "route-strong", score: 88, explicitDecisions: 4, deepReviewed: 6 },
    { routeId: "route-weak", score: 22, explicitDecisions: 5, deepReviewed: 6 },
  ]);
  const strong = scores.find((item) => item.routeId === "route-strong");
  const weak = scores.find((item) => item.routeId === "route-weak");

  assert.ok(strong.score > 55);
  assert.ok(weak.score < 55);
  assert.ok(strong.score > weak.score);
});

test("one route outcome is damped instead of dominating future discovery", () => {
  const [route] = aggregateRouteBranchScores([
    { routeId: "route-a", score: 95, explicitDecisions: 1, deepReviewed: 1 },
  ]);

  assert.equal(route.outcomes, 1);
  assert.equal(route.confidence, 0.125);
  assert.ok(route.score > 55);
  assert.ok(route.score < 65);
});

test("branches without a route or a quality outcome cannot create route learning", () => {
  const scores = aggregateRouteBranchScores([
    { routeId: "", score: 90, explicitDecisions: 6, deepReviewed: 6 },
    { routeId: "route-unreviewed", score: 10, explicitDecisions: 0, deepReviewed: 0 },
  ]);

  assert.deepEqual(scores, []);
});

test("route outcomes come from the latest durable audit provenance without losing feedback", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE recommendation_audit_events (
      space_id TEXT, paper_id TEXT, reviewed_at TEXT, provenance_json TEXT,
      decision TEXT, recommended INTEGER, verification_status TEXT
    );
    CREATE TABLE paper_feedback (
      space_id TEXT, paper_id TEXT, saved INTEGER, feedback TEXT, reason_code TEXT
    );
    CREATE TABLE paper_reading_progress (space_id TEXT, paper_id TEXT, status TEXT);
  `);
  const insertAudit = sqlite.prepare(`INSERT INTO recommendation_audit_events
    (space_id, paper_id, reviewed_at, provenance_json, decision, recommended, verification_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insertAudit.run("space-a", "paper-a", "2026-08-01", JSON.stringify([{ routeId: "route-old", sourceKey: "research-route:gap" }]), "rejected", 0, "verified");
  insertAudit.run("space-a", "paper-a", "2026-09-01", JSON.stringify([{ routeId: "route-a", sourceKey: "research-route:synthesis" }]), "recommended", 1, "revised");
  insertAudit.run("space-a", "paper-b", "2026-09-01", JSON.stringify([{ routeId: "route-b", sourceKey: "research-route:network" }]), "rejected", 0, "verified");
  insertAudit.run("space-a", "paper-c", "2026-09-01", "not-json", "rejected", 0, "degraded");
  sqlite.prepare("INSERT INTO paper_feedback VALUES ('space-a', 'paper-a', 1, NULL, NULL)").run();
  sqlite.prepare("INSERT INTO paper_feedback VALUES ('space-a', 'paper-b', 0, 'not_relevant', 'topic_drift')").run();

  const rows = sqlite.prepare(ROUTE_BRANCH_OUTCOMES_SQL).all("space-a");
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { route_id: "route-a", papers: 1, accepted: 1, dismissed: 0, wrong_type: 0, known: 0, deep_reviewed: 1, formal_recommended: 1, evidence_rejected: 0 },
    { route_id: "route-b", papers: 1, accepted: 0, dismissed: 1, wrong_type: 0, known: 0, deep_reviewed: 1, formal_recommended: 0, evidence_rejected: 0 },
  ]);
});

test("monitor planning prefers exact history, then route learning, then source averages", async () => {
  const monitor = await import("node:fs/promises").then(({ readFile }) => readFile(
    new URL("../app/api/monitor/route.ts", import.meta.url), "utf8",
  ));

  assert.match(monitor, /aggregateRouteBranchScores/);
  assert.match(monitor, /ROUTE_BRANCH_OUTCOMES_SQL/);
  assert.match(monitor, /const route = plan\.routeId \? performance\.routes\.get\(plan\.routeId\) : undefined/);
  assert.match(monitor, /exact \?\? route \?\? source \?\? 55/);
  assert.match(monitor, /return \{ exact, routes, sources, ranked \}/);
});
