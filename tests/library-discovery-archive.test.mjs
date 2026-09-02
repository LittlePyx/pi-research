import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  archiveQualityStagePresentation,
  isRecommendationQualityStage,
  routeDiscoveryPresentation,
} from "../lib/discovery-archive-semantics.mjs";

const monitor = readFileSync(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../app/research-app.tsx", import.meta.url), "utf8");

test("the paper library keeps the discovery archive separate from the recommendation inbox", () => {
  assert.match(monitor, /WHERE p\.space_id = \?\s+ORDER BY p\.discovered_at DESC, i\.quality_score DESC LIMIT 2000/);
  assert.match(monitor, /const historyPapers = papers\.results\.map\(\(paper\) => toPaper\(paper, now\)\)/);
  assert.match(monitor, /const recommendationHistoryPapers = historyPapers\.filter/);
  assert.match(monitor, /all: recommendationHistoryPapers\.length/);
});

test("archived discoveries are visible without being mislabeled as recommendations", () => {
  assert.match(app, /useState<LibraryFilter>\("all"\)/);
  assert.match(app, /"全部发现"/);
  assert.match(app, /archiveQualityStagePresentation/);
  assert.match(app, /screeningReason/);
  assert.match(app, /isRecommendationQualityStage/);
  assert.match(app, /if \(libraryFilter === "inbox" && !belongsToRecommendationInbox\) return false/);
});

test("rejected route discoveries remain traceable without being presented as recommendations or route evidence", () => {
  assert.equal(isRecommendationQualityStage("reviewed"), false);
  assert.equal(isRecommendationQualityStage("reviewing"), true);
  assert.deepEqual(archiveQualityStagePresentation("reviewed", "zh"), {
    label: "评审未入选",
    kicker: "质量评审结果",
    note: "Pi 已完成质量评审，但这篇论文没有通过最终推荐门槛；它仅保留在探索账本中供检索，不构成路线证据或正式推荐。",
  });
  assert.equal(routeDiscoveryPresentation("reviewed", "zh").label, "发现线索");
  assert.match(routeDiscoveryPresentation("reviewed", "zh").fallbackTitle, /未入选推荐.*不是路线证据/);
  assert.equal(routeDiscoveryPresentation("reviewing", "en").label, "Candidate source");
  assert.equal(routeDiscoveryPresentation("recommended", "en").label, "Recommendation source");
  assert.match(monitor, /if \(!isPublishedRecommendation\(review\).*return \[\]/);
  assert.match(monitor, /await upsertPendingResearchMapEvidence\(database, proposals\)/);
});

test("quick-screened and retryable degraded candidates remain queued instead of looking rejected", () => {
  assert.deepEqual(archiveQualityStagePresentation("queued", "en"), {
    label: "Awaiting quality review",
    kicker: "SHARED QUALITY QUEUE",
    note: "This paper is in the shared quality queue, but deep quality review is not complete. It is currently only a candidate lead and is neither route evidence nor a formal recommendation.",
  });
  assert.equal(routeDiscoveryPresentation("queued", "zh").label, "候选线索");
  assert.match(monitor, /WHEN i\.analysis_source = 'deepseek_screened'[\s\S]*THEN 'queued'/);
  assert.ok(monitor.indexOf("THEN 'queued'") < monitor.indexOf("WHEN i.analysis_source LIKE 'deepseek%'"));
});

test("library tabs use durable archive counts without a duplicate overview", () => {
  assert.match(app, /const historyPapers = useMemo/);
  assert.match(app, /"全部发现" : "All discoveries"}<span>{historyPapers\.length}<\/span>/);
  assert.match(app, /monitor\?\.historyCounts\?\.inbox \|\| 0/);
  assert.match(app, /monitor\?\.historyCounts\?\.accepted \|\| 0/);
  assert.match(app, /monitor\?\.historyCounts\?\.dismissed \|\| 0/);
  assert.doesNotMatch(app, /<section className="v2-library-overview"/);
  assert.doesNotMatch(app, /monitor\?\.historyCounts\?\.unseen \|\| 0}<\/strong><b>{t\.unseen/);
});

test("the sidebar and archive ranking cannot make retained papers look missing or over-scored", () => {
  assert.match(app, /compactNavCount\(historyPapers\.length\)/);
  assert.match(app, /const todayNavigationCount = rankedMonitorPapers\.length/);
  assert.match(app, /item\.id === "today" && Boolean\(todayNavigationCount\)/);
  assert.doesNotMatch(app, /item\.id === "today"[^\n]*monitor\?\.newCount/);
  assert.match(app, /qualityStageRank/);
  assert.match(app, /second\.relevanceScore - first\.relevanceScore/);
  const libraryList = app.slice(app.indexOf('<div className="v2-library-list">'), app.indexOf('{view === "memory"'));
  assert.doesNotMatch(libraryList, /t\.qualityScore|displayQualityScore/);
  assert.match(app, /displayQualityScore\(selectedMonitorPaper\.qualityScore\)/);
  assert.match(app, /Math\.min\(100, Math\.max\(0, Math\.round/);
});
