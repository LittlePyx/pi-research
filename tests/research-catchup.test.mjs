import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("research catch-up and weekly reviews are durable and isolated by workspace", async () => {
  const [schema, repository, notifications] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /monitorWeeklyReviews/);
  assert.match(schema, /researchNotifications/);
  assert.match(repository, /idx_research_notifications_space_dedupe ON research_notifications\(space_id, dedupe_key\)/);
  assert.match(repository, /idx_monitor_weekly_reviews_space_week ON monitor_weekly_reviews\(space_id, week_key\)/);
  assert.match(notifications, /WHERE id = \? AND space_id = \?/);
  assert.match(notifications, /SET read_at = COALESCE\(read_at, CURRENT_TIMESTAMP\)[\s\S]*WHERE space_id = \?/);
});

test("completed scans create non-blocking catch-up notifications and evidence-grounded reviews", async () => {
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");

  assert.match(monitor, /createScanNotifications/);
  assert.match(monitor, /maybeGenerateWeeklyReview/);
  assert.match(monitor, /sourceDays < 3/);
  assert.match(monitor, /sourceDays < 7/);
  assert.match(monitor, /Never claim that a paper was read unless reading memory is supplied/);
  assert.match(monitor, /must never[\s\S]*turn successfully discovered and reviewed papers into a failed monitoring run/);
});

test("the daily workbench exposes research catch-up while keeping quality telemetry internal", async () => {
  const [monitor, client, styles] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /targetDays: 7/);
  assert.match(monitor, /wrongTypeReports/);
  assert.match(monitor, /tokensPerRecommendation/);
  assert.match(client, /v2-research-catchup/);
  assert.match(client, /v2-weekly-review/);
  assert.match(client, /const SHOW_INTERNAL_QUALITY_UI = false/);
  assert.match(client, /SHOW_INTERNAL_QUALITY_UI && monitor\?\.pilotEvaluation/);
  assert.match(client, /markNotificationsRead/);
  assert.doesNotMatch(client, /type View = [^\n]*"audit"/);
  assert.match(styles, /\.v2-research-catchup/);
});
