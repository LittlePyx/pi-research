import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("scheduled monitoring uses a durable single-run lock and retry lineage", async () => {
  const [monitor, schema, worker] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /lockToken: text\("lock_token"\)/);
  assert.match(schema, /resumeOfJobId: text\("resume_of_job_id"\)/);
  assert.match(monitor, /WHERE space_id = \? AND \(lock_token IS NULL OR lock_expires_at IS NULL/);
  assert.match(monitor, /acquired\?\.lock_token !== lockToken/);
  assert.match(monitor, /checkpoint = 'retry_pending'/);
  assert.match(monitor, /schedulerCheckMinutes: 10/);
  assert.match(worker, /trigger: "scheduled"/);
});

test("each completed scan persists an evidence-grounded bilingual daily brief", async () => {
  const [monitor, schema, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /monitor_daily_briefs/);
  assert.match(monitor, /generateDailyBrief/);
  assert.match(monitor, /synthesize only the supplied paper analyses/);
  assert.match(monitor, /No paper cleared today's strict recommendation bar/);
  assert.match(client, /v2-ai-daily-brief/);
  assert.match(client, /正在从已保存检查点续跑/);
  assert.match(client, /自动监控/);
});

test("daily brief generation is budgeted and does not block scan completion on LLM failure", async () => {
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(monitor, /workspaceCount >= MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT/);
  assert.match(monitor, /spaceCount >= MONITOR_SPACE_DAILY_ANALYSIS_LIMIT/);
  assert.match(monitor, /status: "ready"/);
  assert.match(monitor, /canonicalBrief: "evidence-summary"/);
  assert.match(monitor, /await saveEvidenceBrief\(error instanceof Error/);
  assert.match(monitor, /lock_token = NULL, lock_expires_at = NULL/);
});
