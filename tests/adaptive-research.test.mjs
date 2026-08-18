import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("daily discovery planning is cached and horizon-specific", async () => {
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(monitor, /ensureDailyQueryPlan/);
  assert.match(monitor, /idx_monitor_query_plans_space_date|monitor_query_plans/);
  assert.match(monitor, /days = newest 14 days/);
  assert.match(monitor, /months = new and high-quality 6 months/);
  assert.match(monitor, /years = durable, foundational/);
  assert.match(monitor, /queryPlan\?\.queries\[horizon\.key\]/);
  assert.match(monitor, /deterministic-fallback/);
});

test("explicit and inferred preference evidence stay separate", async () => {
  const [memory, feedback, imports, repository] = await Promise.all([
    readFile(new URL("../lib/preference-memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-imports/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
  ]);
  assert.match(memory, /PreferenceLayer = "explicit" \| "inferred"/);
  assert.match(memory, /effectiveConfidence/);
  assert.match(feedback, /recordPaperFeedbackSignal/);
  assert.match(feedback, /reason_code/);
  assert.match(imports, /layer: "inferred"/);
  assert.match(repository, /research_preference_signals/);
});

test("new recommendations update route changes and quality metrics", async () => {
  const [monitor, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /INSERT OR IGNORE INTO research_map_changes/);
  assert.match(monitor, /recommendationYield/);
  assert.match(monitor, /acceptanceRate/);
  assert.match(client, /v2-route-changes/);
  assert.match(client, /v2-layered-memory/);
  assert.match(client, /v2-feedback-options/);
});
