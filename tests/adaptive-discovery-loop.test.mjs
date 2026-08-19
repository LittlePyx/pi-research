import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("explicit feedback changes the next source and query budget", async () => {
  const [monitor, memory] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/preference-memory.ts", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /loadDiscoveryBranchScores/);
  assert.match(monitor, /adaptiveBranchScore/);
  assert.match(monitor, /COALESCE\(f\.reason_code, ''\) <> 'duplicate_known'/);
  assert.match(monitor, /prioritizeDiscoveryPlans/);
  assert.match(monitor, /Math\.round\(maxPlans \* 0\.18\)/);
  assert.match(monitor, /branchPerformance\.ranked/);
  assert.match(memory, /duplicate_known: \{ kind: "mastery"/);
  assert.match(memory, /mastered \? "已掌握"/);
});

test("research routes receive independent, starvation-aware exploration slots", async () => {
  const [monitor, schema, migration] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0020_sharp_susan_delgado.sql", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /routeDiscoveryQueries/);
  assert.match(monitor, /MAX\(c\.last_scanned_at\)/);
  assert.match(monitor, /crossref:route:/);
  assert.match(schema, /explorationRole/);
  assert.match(schema, /adaptiveScore/);
  assert.match(migration, /idx_monitor_coverage_space_route/);
});

test("legacy local databases self-heal before route coverage indexes are created", async () => {
  const [repository, client] = await Promise.all([
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(repository, /\["route_id", "ALTER TABLE monitor_discovery_coverage ADD COLUMN route_id TEXT"\]/);
  assert.match(repository, /\["exploration_role", "ALTER TABLE monitor_discovery_coverage ADD COLUMN exploration_role TEXT NOT NULL DEFAULT 'core'"\]/);
  assert.equal((repository.match(/CREATE INDEX IF NOT EXISTS idx_monitor_coverage_space_route/g) || []).length, 1);
  assert.match(client, /研究空间尚未连接，请刷新页面后再试/);
  assert.match(client, /if \(!response\.ok \|\| !data\.monitor\) throw new Error/);
  assert.match(client, /扫描未能启动，请稍后重试/);
});

test("today and its daily brief are capped at six and reranked across directions", async () => {
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");

  assert.match(monitor, /function selectDiverseItems/);
  assert.match(monitor, /groupCounts/);
  assert.match(monitor, /track_id \|\| `horizon:/);
  assert.match(monitor, /rankedReviews,/);
  assert.doesNotMatch(monitor, /reviews\.filter\(\(review\) => review\.recommended\)[\s\S]{0,220}slice\(0, 8\)/);
});

test("accepted-paper token efficiency uses private audit allocations", async () => {
  const [monitor, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /acceptedCostMetrics/);
  assert.match(monitor, /reviewTokensPerAcceptedPaper/);
  assert.match(monitor, /totalTokensPerAcceptedPaper/);
  assert.match(client, /const SHOW_INTERNAL_QUALITY_UI = false/);
});

test("the pending model state opens a secure browser API key setup", async () => {
  const [client, styles, credentials, settingsRoute] = await Promise.all([
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/model-credentials.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/model-settings/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(client, /setModelSettingsOpen\(true\)/);
  assert.match(client, /saveModelCredential/);
  assert.match(client, /type=\{showModelApiKey \? "text" : "password"\}/);
  assert.match(client, /测试并保存/);
  assert.match(client, /refreshModelStatus/);
  assert.doesNotMatch(client, /DEEPSEEK_API_KEY|\.dev\.vars/);
  assert.match(styles, /v2-model-settings/);
  assert.match(credentials, /HttpOnly/);
  assert.match(credentials, /SameSite=Strict/);
  assert.match(credentials, /Path=\/api/);
  assert.match(credentials, /Max-Age=/);
  assert.match(settingsRoute, /https:\/\/api\.deepseek\.com\/models/);
  assert.match(settingsRoute, /"Set-Cookie"/);
  assert.doesNotMatch(settingsRoute, /apiKey:/);
});
