import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("recommendation audit evidence is durable, indexed, and private to each research space", async () => {
  const [schema, repository, migration] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0019_flat_the_watchers.sql", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /recommendationAuditEvents/);
  assert.match(schema, /idx_recommendation_audit_space_decision_reviewed/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS recommendation_audit_events/);
  assert.match(migration, /FOREIGN KEY \(`space_id`\) REFERENCES `research_spaces`/);
  assert.match(migration, /idx_recommendation_audit_job_paper/);
});

test("each LLM review records provenance, decision, duplicate appearances, and allocated tokens", async () => {
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");

  assert.match(monitor, /persistRecommendationAuditBatch/);
  assert.match(monitor, /decision = !review\.isPaper \? "not_paper"/);
  assert.match(monitor, /provenance_json/);
  assert.match(monitor, /appearanceCount/);
  assert.match(monitor, /allocatedTokenShare\(inputTokens/);
  assert.match(monitor, /coverage\.query_text/);
  assert.match(monitor, /Failed to persist internal recommendation audit/);
});

test("internal quality telemetry has no researcher-facing navigation entry", async () => {
  const client = await readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8");

  assert.match(client, /const SHOW_INTERNAL_QUALITY_UI = false/);
  assert.match(client, /SHOW_INTERNAL_QUALITY_UI && monitor\?\.operationsDashboard/);
  assert.match(client, /SHOW_INTERNAL_QUALITY_UI && monitor\?\.qualityMetrics/);
  assert.doesNotMatch(client, /\{ id: "audit",/);
});
