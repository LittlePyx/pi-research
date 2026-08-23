import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("explicit feedback changes the next source and query budget", async () => {
  const [monitor, planning, memory] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/monitor-route-planning.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/preference-memory.ts", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /loadDiscoveryBranchScores/);
  assert.match(monitor, /adaptiveBranchScore/);
  assert.match(monitor, /COALESCE\(f\.reason_code, ''\) <> 'duplicate_known'/);
  assert.match(monitor, /prioritizeDiscoveryPlans/);
  assert.match(planning, /Math\.round\(maxPlans \* 0\.18\)/);
  assert.match(monitor, /selectPrioritizedDiscoveryPlans/);
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
  assert.match(client, /扫描暂停，进度已保存/);
  assert.match(client, /monitorFailureMessage/);
});

test("monitoring starts immediately and advances through resumable two-pass AI stages", async () => {
  const [monitor, client, worker, schema, migration] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0021_lush_the_professor.sql", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /checkpoint, work_queue_json/);
  assert.match(monitor, /status: 202/);
  assert.match(monitor, /quickScreenCandidates/);
  assert.match(monitor, /QUICK_SCREEN_CONCURRENCY = 2/);
  assert.match(monitor, /thinking: \{ type: deliberate && attempt === 0 \? "enabled" : "disabled" \}/);
  assert.match(monitor, /QUICK_SCREEN_RETRY_TIMEOUT_MS = 12_000/);
  assert.match(monitor, /mode: "fast" \| "rescue"/);
  assert.match(monitor, /rescue_screening/);
  assert.match(monitor, /chooseRescueCandidateIds/);
  assert.match(monitor, /enriching_screening_abstracts/);
  assert.match(monitor, /reasoning_effort: "medium"/);
  assert.match(monitor, /DEEP_REVIEW_LIMIT = 8/);
  assert.match(monitor, /DEEP_REVIEW_RESCUE_LIMIT = 4/);
  assert.match(monitor, /DEEP_REVIEW_MAX_LIMIT/);
  assert.match(monitor, /HIGH_POTENTIAL_DRAFT_TARGET = 3/);
  assert.match(monitor, /recommendationShortfall/);
  assert.match(monitor, /目前形成 \$\{potentialRecommendations\} 篇高潜力稿/);
  assert.match(monitor, /Math\.ceil\(limit \/ 2\)/);
  assert.match(monitor, /rescueReview: true/);
  assert.match(monitor, /正在追加 \$\{rescueIds\.length\} 篇第二批评审/);
  assert.match(monitor, /DEEP_REVIEW_BATCH_SIZE = 1/);
  assert.match(monitor, /DEEP_REVIEW_CONCURRENCY = 2/);
  assert.match(monitor, /MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT = 120/);
  assert.match(monitor, /MONITOR_SPACE_DAILY_ANALYSIS_LIMIT = 48/);
  assert.match(monitor, /spaceCount \+ groups\.length > MONITOR_SPACE_DAILY_ANALYSIS_LIMIT/);
  assert.match(monitor, /runIncrementalDeepReview/);
  assert.match(monitor, /Non-blocking route reconciliation failed/);
  assert.match(monitor, /row\.map_rationale_zh/);
  assert.match(monitor, /任一篇完成都会立即显示/);
  assert.match(monitor, /当前论文响应较慢，正在切换快速模式重试/);
  assert.match(monitor, /deferLlm/);
  assert.match(monitor, /checkpoint = 'main_complete'/);
  assert.match(monitor, /inferResumeCheckpoint/);
  assert.match(monitor, /resumeCheckpoint/);
  assert.match(monitor, /isNonRetryableDeepSeekError/);
  assert.match(client, /advanceMonitorPipeline/);
  assert.match(client, /step < 64/);
  assert.match(client, /action: "enhance"/);
  assert.match(client, /每完成一批就会立即保存/);
  assert.match(client, /从断点继续/);
  assert.match(worker, /action: "advance"/);
  assert.match(schema, /workQueueJson/);
  assert.match(migration, /work_queue_json/);
});

test("screening refreshes stale fallback plans and enriches evidence before deep review", async () => {
  const [monitor, profiles] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/domain-profiles.ts", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /existing\.model === "deterministic-fallback"/);
  assert.match(monitor, /ON CONFLICT\(space_id, plan_date\) DO UPDATE/);
  assert.match(monitor, /0-100 scale, never decimals on a 0-1 scale/);
  assert.match(monitor, /inferModelScoreScale/);
  assert.match(monitor, /candidateScreeningPriority/);
  assert.match(monitor, /quality_score = CASE WHEN ever_recommended = 1 THEN quality_score ELSE \? END/);
  assert.match(monitor, /THEN paper_insights\.quality_score ELSE excluded\.quality_score END/);
  assert.match(monitor, /fetchSemanticScholarAbstracts/);
  assert.match(monitor, /fetchOpenAlexAbstract/);
  assert.match(monitor, /checkpoint === "enriching_abstracts"/);
  assert.match(monitor, /MONITOR_REVIEW_PIPELINE_RELEASED_AT/);
  assert.match(profiles, /stochastic localization/);
  assert.match(profiles, /log-Sobolev inequality/);
  assert.match(profiles, /Probability Theory and Related Fields/);
});

test("today and its daily brief are capped at six and reranked across directions", async () => {
  const [monitor, client, styles] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /function selectDiverseItems/);
  assert.match(monitor, /groupCounts/);
  assert.match(monitor, /track_id \|\| paper\.discovery_route_id \|\| `horizon:/);
  assert.match(monitor, /rankedReviews,/);
  assert.match(monitor, /Never mention section, page, figure, or theorem numbers/);
  assert.match(monitor, /must each contain exactly \$\{records\.length\} items in the supplied paper order/);
  assert.match(client, /v2-daily-brief-list/);
  assert.match(client, /v2-daily-paper-authors/);
  assert.match(client, /v2-daily-paper-publication/);
  assert.match(client, /作者信息未提供/);
  assert.match(client, /"被引"/);
  assert.match(client, /<details key=\{paper\?\.id/);
  assert.match(client, /它带来了什么/);
  assert.match(client, /建议怎么读/);
  assert.match(client, /latestDeepReviewedCount/);
  assert.match(client, /v2-daily-zero-state/);
  assert.equal((client.match(/shareSnapshot\("daily"/g) || []).length, 1);
  assert.match(styles, /\.v2-daily-brief-list/);
  assert.match(styles, /focused daily research desk/);
  assert.doesNotMatch(monitor, /reviews\.filter\(\(review\) => review\.recommended\)[\s\S]{0,220}slice\(0, 8\)/);
});

test("discovery and evidence expansion run independent upstream calls concurrently", async () => {
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");

  assert.match(monitor, /Semantic Scholar · OpenAlex · arXiv 并行检索/);
  assert.match(monitor, /const \[semantic, openAlex, arxiv\] = await Promise\.all/);
  assert.match(monitor, /const relationResults = await Promise\.all/);
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
  assert.match(settingsRoute, /https:\/\/api\.deepseek\.com\/chat\/completions/);
  assert.match(settingsRoute, /deepseek_insufficient_balance/);
  assert.match(settingsRoute, /"Set-Cookie"/);
  assert.doesNotMatch(settingsRoute, /apiKey:/);
});
