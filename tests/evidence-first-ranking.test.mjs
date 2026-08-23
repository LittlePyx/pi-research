import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { fullTextEvidenceQualifiesForMustRead } from "../lib/paper-evidence.ts";

test("must-read requires ready, sufficiently grounded open full text", () => {
  assert.equal(fullTextEvidenceQualifiesForMustRead({
    level: "fulltext", status: "ready", groundedClaims: 3, coverageScore: 70, unsupportedClaims: 1,
  }), true);
  assert.equal(fullTextEvidenceQualifiesForMustRead({
    level: "abstract", status: "ready", groundedClaims: 8, coverageScore: 100, unsupportedClaims: 0,
  }), false);
  assert.equal(fullTextEvidenceQualifiesForMustRead({
    level: "fulltext", status: "ready", groundedClaims: 2, coverageScore: 90, unsupportedClaims: 0,
  }), false);
  assert.equal(fullTextEvidenceQualifiesForMustRead({
    level: "fulltext", status: "partial", groundedClaims: 6, coverageScore: 95, unsupportedClaims: 0,
  }), false);
});

test("the monitor deepens evidence before final ranking without blocking on failures", async () => {
  const [monitor, evidenceRoute, client, schema, repository, migration] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/paper-evidence/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0036_bouncy_lord_hawal.sql", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /continuous-evidence-v7-benchmark-calibrated/);
  assert.match(monitor, /verifying_recommendations/);
  assert.match(monitor, /PRE_PUBLICATION_EVIDENCE_LIMIT = 4/);
  assert.match(monitor, /evidence_deepening/);
  assert.match(monitor, /deepenPaperEvidenceRequest/);
  assert.match(monitor, /proposed_recommendation_tier/);
  assert.match(monitor, /fullTextQualified/);
  assert.match(evidenceRoute, /fullTextEvidenceQualifiesForMustRead/);
  assert.match(evidenceRoute, /strongestGrounded/);
  assert.match(evidenceRoute, /recommendation_tier = CASE WHEN proposed_recommendation_tier = 'must_read'/);
  assert.match(client, /候选必读 · 待全文确认/);
  assert.match(client, /摘要已核验/);
  assert.match(schema, /proposedRecommendationTier/);
  assert.match(repository, /proposed_recommendation_tier/);
  assert.match(migration, /UPDATE `paper_insights` SET `proposed_recommendation_tier`/);
  assert.match(migration, /PRAGMA optimize/);
});

test("the v73 migration preserves the original must-read intent", async () => {
  const migration = await readFile(new URL("../drizzle/0036_bouncy_lord_hawal.sql", import.meta.url), "utf8");
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE paper_insights (paper_id TEXT PRIMARY KEY, recommendation_tier TEXT NOT NULL DEFAULT 'browse')");
  database.exec("INSERT INTO paper_insights (paper_id, recommendation_tier) VALUES ('paper-a', 'must_read'), ('paper-b', 'browse')");
  for (const statement of migration.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) database.exec(statement);
  assert.equal(database.prepare("SELECT proposed_recommendation_tier FROM paper_insights WHERE paper_id = 'paper-a'").get().proposed_recommendation_tier, "must_read");
  assert.equal(database.prepare("SELECT proposed_recommendation_tier FROM paper_insights WHERE paper_id = 'paper-b'").get().proposed_recommendation_tier, "browse");
  database.close();
});
