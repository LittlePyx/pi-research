import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { emptyResearchMapState } from "../lib/research-map.ts";

test("an unavailable target workspace starts from an isolated empty research state", async () => {
  const first = emptyResearchMapState();
  const second = emptyResearchMapState();
  first.tracks.push({ id: "previous-space-route" });
  first.paperNetwork.coveredPaperIds.push("previous-space-paper");

  assert.equal(second.generated, false);
  assert.deepEqual(second.tracks, []);
  assert.deepEqual(second.paperNetwork.coveredPaperIds, []);
  assert.deepEqual(second.routePortfolio, {
    formalEvidenceCount: 0, structuralPaperCount: 0, discoveredCount: 0, queuedCount: 0, reviewingCount: 0,
    deepReviewedCount: 0, recommendedCount: 0, acceptedCount: 0,
    pendingEvidenceCount: 0, readyRouteCount: 0, degradedRouteCount: 0, pausedRouteCount: 0,
  });

  const client = await readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8");
  const switchSpace = client.match(/const switchSpace = \(space: Space\) => \{([\s\S]*?)\n {2}\};/)?.[1] || "";
  assert.match(switchSpace, /setResearchMap\(emptyResearchMapState\(\)\)/);
  assert.match(switchSpace, /setSelectedThread\(null\)/);
  assert.match(switchSpace, /setResearchSynthesis\(null\)/);
  assert.match(switchSpace, /setResearchProblemState\(null\)/);
  assert.match(switchSpace, /setMonitor\(null\)/);
});

test("research-map API exposes one deduplicated route portfolio contract", async () => {
  const route = await readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8");

  assert.match(route, /RESEARCH_ROUTE_PORTFOLIO_COUNTS_SQL/);
  assert.match(route, /\.bind\(spaceId, spaceId, spaceId, spaceId\)\.first<RoutePortfolioCountRow>\(\)/);
  assert.match(route, /formalEvidenceCount:\s*routeCount\(routePortfolioCounts\?\.confirmed_evidence_count\)/);
  assert.match(route, /structuralPaperCount:\s*uniquePaperCount/);
  assert.match(route, /degradedRouteCount:\s*activeTracks\.filter\(\(track\) => \["partial", "retryable", "empty", "failed"\]/);
  assert.match(route, /pausedRouteCount:\s*tracks\.filter\(\(track\) => track\.monitoringStatus === "paused"\)/);
});

test("route funnel uses the same count model on desktop and narrow screens", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.equal(client.match(/<RoutePortfolioOverview portfolio=/g)?.length, 1);
  assert.match(client, /onAction=\{handleRouteAttention\}/);
  assert.match(client, /统一优先事项/);
  assert.match(client, /onClick=\{handleRouteAttention\}/);
  assert.match(client, /const routePortfolio = researchMap\.routePortfolio;/);
  assert.match(client, /const routeQualityBacklogCount = routePortfolio\.queuedCount \+ routePortfolio\.reviewingCount;/);
  assert.equal(client.match(/monitorReadyLabel/g)?.length, 3);
  assert.doesNotMatch(client, /researchMap\.routePortfolio\s*\|\|/);
  assert.match(client, /portfolio\.discoveredCount/);
  assert.match(client, /portfolio\.queuedCount \+ portfolio\.reviewingCount/);
  assert.match(client, /routeTodayPaperCount[\s\S]*rankedMonitorPapers\.filter/);
  assert.match(client, /portfolio\.formalEvidenceCount/);
  assert.match(client, /portfolio\.structuralPaperCount/);
  assert.match(client, /portfolio\.pendingEvidenceCount/);
  assert.match(client, /后台完成，无需确认/);
  assert.match(client, /发现不等于推荐，推荐也不等于正式路线证据/);
  assert.match(client, /仅统计用户确认纳入的论文/);

  const narrowRules = styles.match(/@media \(max-width: 430px\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(narrowRules, /\.v2-route-portfolio-flow\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(narrowRules, /display:\s*none/);
});
