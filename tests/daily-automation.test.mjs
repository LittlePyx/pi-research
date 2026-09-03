import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SCHEDULED_MONITOR_SPACE_SQL } from "../lib/monitor-scheduler.mjs";

test("scheduled monitoring uses a durable single-run lock and retry lineage", async () => {
  const [monitor, schema, worker] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /lockToken: text\("lock_token"\)/);
  assert.match(schema, /resumeOfJobId: text\("resume_of_job_id"\)/);
  assert.match(schema, /advanceLockToken: text\("advance_lock_token"\)/);
  assert.match(schema, /advanceLockExpiresAt: text\("advance_lock_expires_at"\)/);
  assert.match(monitor, /WHERE space_id = \? AND \(lock_token IS NULL OR lock_expires_at IS NULL/);
  assert.match(monitor, /acquired\?\.lock_token !== lockToken/);
  assert.match(monitor, /checkpoint = 'retry_pending'/);
  assert.match(monitor, /schedulerCheckMinutes: 10/);
  assert.match(worker, /trigger: "scheduled"/);
  assert.match(SCHEDULED_MONITOR_SPACE_SQL, /r\.next_run_at IS NULL OR datetime\(r\.next_run_at\) <= CURRENT_TIMESTAMP/);
  assert.match(monitor, /alreadyAdvancing: true/);
  assert.match(monitor, /advance_lock_token = NULL, advance_lock_expires_at = NULL/);
  assert.match(monitor, /MONITOR_NEW_RUN_CLAIM_SQL/);
  assert.match(monitor, /monitorLeaseCredentialsMatch\(run, requestedLease\)/);
  assert.match(schema, /activeJobId: text\("active_job_id"\)/);
  assert.match(schema, /requestKey: text\("request_key"\)/);
});

test("each completed scan persists an evidence-grounded bilingual daily brief", async () => {
  const [monitor, schema, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /monitor_daily_briefs/);
  assert.match(monitor, /generateDailyBrief/);
  assert.match(monitor, /isCurrent: dailyBriefRow\.brief_date === shanghaiDateKey/);
  assert.match(monitor, /synthesize only the supplied paper analyses/);
  assert.match(monitor, /No paper cleared today's strict recommendation bar/);
  assert.match(client, /v2-ai-daily-brief/);
  assert.match(client, /最近一次研究判断/);
  assert.match(client, /不计入今日数量/);
  assert.match(client, /monitor\.dailyBrief\.isCurrent/);
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

test("desktop and narrow layouts share one current-day count contract while stale briefs stay historical", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /const mustReadCount = rankedMonitorPapers\.filter/);
  assert.match(client, /const todayNavigationCount = rankedMonitorPapers\.length/);
  assert.doesNotMatch(client, /todayNavigationCount\s*=.*dailyBrief/);
  assert.match(client, /dailyBriefEntryCount/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.v2-today \.v2-today-briefing \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(styles, /\.v2-today(?:\s+\.v2-today-briefing)?\s*\{[^}]*display:\s*none/);
});
