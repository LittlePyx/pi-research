import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const monitorPath = new URL("../app/api/monitor/route.ts", import.meta.url);
const feedbackPath = new URL("../app/api/feedback/route.ts", import.meta.url);
const libraryPath = new URL("../app/api/library/route.ts", import.meta.url);
const mapPath = new URL("../app/api/research-map/route.ts", import.meta.url);
const appPath = new URL("../app/research-app.tsx", import.meta.url);

test("direction evidence gaps guide daily retrieval without replacing every horizon", async () => {
  const monitor = await readFile(monitorPath, "utf8");
  assert.match(monitor, /function directionDiscoverySignal/);
  assert.match(monitor, /nextSearchQuery/);
  assert.match(monitor, /evidenceGapEn/);
  assert.match(monitor, /const basePlans = selectedRows\.map/);
  assert.match(monitor, /research-route-gap-/);
  assert.match(monitor, /return \[\.\.\.basePlans, \.\.\.gapPlan\]/);
  assert.match(monitor, /confidence < 60 \|\| !evidenceCanonicalIds\.length \|\| !isFresh/);
  assert.match(monitor, /c\.horizon = \?/);
  assert.match(monitor, /routeUrgency/);
  assert.match(monitor, /Grounded direction opportunities, watch signals, and evidence gaps/);
  assert.match(monitor, /Use each direction's evidence gap and watch signal when judging whether a paper actually changes that route/);
});

test("daily plans are regenerated only when durable research guidance changes", async () => {
  const monitor = await readFile(monitorPath, "utf8");
  const plannerStart = monitor.indexOf("async function ensureDailyQueryPlan");
  const plannerEnd = monitor.indexOf("async function enrichSpaceWithImportedMemory", plannerStart);
  const planner = monitor.slice(plannerStart, plannerEnd);
  assert.ok(plannerStart >= 0 && plannerEnd > plannerStart);
  assert.match(planner, /guidanceRevision/);
  assert.match(planner, /user_role, depth_score, support_score, intelligence_json/);
  assert.match(planner, /MAX\(updated_at\) FROM research_preference_signals/);
  assert.match(planner, /MAX\(updated_at\) FROM paper_feedback/);
  assert.match(planner, /MAX\(updated_at\) FROM paper_reading_progress/);
  assert.match(planner, /crypto\.subtle\.digest\("SHA-256"/);
  assert.doesNotMatch(planner, /MAX\(updated_at\) FROM research_tracks/);
  assert.match(monitor, /frozenQueryPlan/);
  assert.match(monitor, /work\.frozenQueryPlan = await ensureDailyQueryPlan/);
});

test("citation discovery follows new citing work while durable scans backtrack references", async () => {
  const monitor = await readFile(monitorPath, "utf8");
  assert.match(monitor, /horizon\.key === "years" \? \["references"\] : \["citations"\]/);
  assert.match(monitor, /routeId: seed\.track_id/);
});

test("today feedback refreshes direction intelligence and research memory", async () => {
  const [feedback, library, map] = await Promise.all([
    readFile(feedbackPath, "utf8"), readFile(libraryPath, "utf8"), readFile(mapPath, "utf8"),
  ]);
  assert.match(feedback, /refreshResearchLoopAfterFeedback/);
  assert.match(feedback, /intelligence_json = '\{\}'/);
  assert.match(feedback, /kind === "save" \|\| kind === "relevant" \|\| kind === "not_relevant"/);
  assert.match(feedback, /reconcileResearchMapEvidenceStatements/);
  assert.match(feedback, /DB\.batch\(\[\s*feedbackStatement,\s*\.\.\.reconcileResearchMapEvidenceStatements/s);
  assert.match(library, /database\.batch\(\[\s*readingProgressStatement,\s*\.\.\.reconcileResearchMapEvidenceStatements/s);
  assert.match(map, /readPreferenceSignals\(database, spaceId, 24\)/);
  assert.match(map, /signal\.layer.*signal\.kind.*signal\.labelEn/s);
});

test("the interface explains the research-route and daily-discovery loop", async () => {
  const app = await readFile(appPath, "utf8");
  assert.match(app, /研究线索驱动的今日检索/);
  assert.match(app, /研究线索 → 今日发现 → 你的判断 → 路线更新/);
  assert.match(app, /只有接受、保存或完成阅读后才确认进入路线/);
  assert.match(app, /扫描结果会先进入待确认队列，不会自动改变正式研究路线/);
  assert.match(app, /action: "expand-gap"/);
  assert.doesNotMatch(app, /action: "reconcile"/);
});
