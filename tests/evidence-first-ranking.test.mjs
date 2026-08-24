import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("the monitor verifies recommendation content without a full-text verification stage", async () => {
  const [monitor, client, schema, repository, migration] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0036_bouncy_lord_hawal.sql", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /continuous-recommendation-v12-fresh-yield/);
  assert.match(monitor, /verifying_recommendations/);
  assert.match(monitor, /proposed_recommendation_tier/);
  assert.match(monitor, /const effectiveTier = proposedTier/);
  assert.doesNotMatch(monitor, /deepenPaperEvidenceRequest/);
  assert.doesNotMatch(client, /\/api\/paper-evidence/);
  assert.doesNotMatch(client, /开放全文已核验/);
  assert.match(client, /正在逐篇核对推荐证据/);
  assert.match(client, /monitor\.dailyBrief\.metrics\.recommended \|\| 0/);
  assert.doesNotMatch(client, /recommended \|\| 0\) - \(monitor\.dailyBrief\.metrics\.verificationPending/);
  assert.match(client, /推荐内容已核验/);
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
