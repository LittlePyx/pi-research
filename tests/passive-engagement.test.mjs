import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  passiveBranchBoost,
  passiveEngagementWeight,
  passiveInterestConfidence,
} from "../lib/passive-engagement.mjs";

test("passive learning requires qualified engagement and remains weaker than explicit feedback", () => {
  assert.equal(passiveEngagementWeight("engaged_view", 1_400), 0);
  assert.equal(passiveEngagementWeight("engaged_view", 8_000), 1);
  assert.equal(passiveEngagementWeight("detail_dwell", 11_999), 0);
  assert.equal(passiveEngagementWeight("detail_dwell", 12_000), 3);
  assert.equal(passiveEngagementWeight("original_click"), 5);
  assert.equal(passiveEngagementWeight("ask_pi"), 6);
  assert.equal(passiveBranchBoost({ papers: 10, engagedPapers: 0, engagementWeight: 0 }), 0);
  assert.ok(passiveBranchBoost({ papers: 10, engagedPapers: 5, engagementWeight: 45 }) <= 12);
  assert.ok(passiveInterestConfidence(36) < 96);
});

test("qualified engagement is durable, attributable, reversible, and used by discovery", async () => {
  const [schema, repository, feedback, monitor, client] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /paperEngagementEvents/);
  assert.match(schema, /idx_paper_engagement_space_route_time/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS paper_engagement_events/);
  assert.match(feedback, /recommendation_audit_events/);
  assert.match(feedback, /sourceType: "passive_engagement"/);
  assert.match(feedback, /active = 0/);
  assert.match(feedback, /occurred_at < datetime\('now', '-120 days'\)/);
  assert.match(monitor, /passiveBranchBoost/);
  assert.match(monitor, /engagementWeight/);
  assert.match(monitor, /paper\.track_id \|\| paper\.discovery_route_id/);
  assert.match(client, /kind: "engaged_view"/);
  assert.match(client, /dwellMs: 8_000/);
  assert.match(client, /kind: "detail_dwell"/);
  assert.match(client, /recordPaperEngagement\(selectedMonitorPaper, "original_click"/);
});
