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
  const [monitor, planning] = await Promise.all([
    readFile(monitorPath, "utf8"),
    readFile(new URL("../lib/monitor-route-planning.ts", import.meta.url), "utf8"),
  ]);
  const plannerStart = monitor.indexOf("async function ensureDailyQueryPlan");
  const plannerEnd = monitor.indexOf("async function enrichSpaceWithImportedMemory", plannerStart);
  const planner = monitor.slice(plannerStart, plannerEnd);
  assert.ok(plannerStart >= 0 && plannerEnd > plannerStart);
  assert.match(planner, /guidanceRevision/);
  assert.match(planner, /researchGuidanceIdentity/);
  assert.match(planner, /Recently confirmed route evidence/);
  assert.match(planning, /user_role, depth_score, support_score, interaction_score, intelligence_json/);
  assert.match(planning, /MAX\(updated_at\) FROM research_preference_signals/);
  assert.match(planning, /MAX\(updated_at\) FROM paper_feedback/);
  assert.match(planning, /MAX\(updated_at\) FROM paper_reading_progress/);
  assert.match(planning, /MAX\(updated_at\) FROM research_map_evidence_proposals/);
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
  assert.match(feedback, /intelligence_status = 'pending'/);
  assert.doesNotMatch(feedback, /intelligence_json = '\{\}'/);
  assert.match(feedback, /kind === "save" \|\| kind === "relevant" \|\| kind === "not_relevant"/);
  assert.match(feedback, /reconcileResearchMapEvidenceStatements/);
  assert.match(feedback, /readResearchMapEvidenceOutcome/);
  assert.match(feedback, /routeEvidence/);
  assert.match(feedback, /DB\.batch\(\[\s*feedbackStatement,[\s\S]*\.\.\.reconcileResearchMapEvidenceStatements/);
  assert.match(feedback, /reasonCode === "duplicate_known"[\s\S]*status = 'mastered'/);
  assert.match(feedback, /完成书目与摘要证据核对后，才会记为路线证据变化/);
  assert.match(library, /database\.batch\(\[\s*readingProgressStatement,\s*\.\.\.reconcileResearchMapEvidenceStatements/s);
  assert.match(map, /readPreferenceSignals\(database, spaceId, 24\)/);
  assert.match(map, /signal\.layer.*signal\.kind.*signal\.labelEn/s);
});

test("the interface explains the research-route and daily-discovery loop", async () => {
  const app = await readFile(appPath, "utf8");
  assert.match(app, /研究线索驱动的今日检索/);
  assert.match(app, /SHOW_INTERNAL_QUALITY_UI && monitor\?\.queryPlan/);
  assert.match(app, /ResearchGapDiscoveryStatus/);
  assert.match(app, /篇候选正在质量评估/);
  assert.match(app, /discoveryOrigin/);
  assert.match(app, /RouteDiscoveryBadge/);
  assert.match(app, /result\.routeEvidence\?\.changed/);
  assert.match(app, /const refreshedMap = await readResearchMapState\(spaceId\)/);
  assert.match(app, /按最终证据归属加入对应路线，并触发路线重新判断/);
  assert.match(app, /if \(!origin && !\(track && paper\.discoveryType\)\) return null/);
  assert.match(app, /queuedForReviewCount/);
  assert.match(app, /reviewingForReviewCount/);
  assert.match(app, /recommendedCandidateCount/);
  assert.doesNotMatch(app, /function RouteQualityFlow/);
  assert.match(app, /data\.reviewQueuedCount/);
  assert.doesNotMatch(app, /data\.addedCount \? `沿缺口发现/);
  assert.match(app, /action: origin === "problem" \? "expand-problem" : "expand-gap"/);
  assert.doesNotMatch(app, /action: "reconcile"/);
});
