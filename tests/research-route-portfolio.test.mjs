import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("research-map API exposes one deduplicated route portfolio contract", async () => {
  const route = await readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8");

  assert.match(route, /RESEARCH_ROUTE_PORTFOLIO_COUNTS_SQL/);
  assert.match(route, /\.bind\(spaceId, spaceId, spaceId\)\.first<RoutePortfolioCountRow>\(\)/);
  assert.match(route, /routePortfolio:\s*\{[\s\S]*formalEvidenceCount:\s*uniquePaperCount/);
  assert.match(route, /degradedRouteCount:\s*tracks\.filter\(\(track\) => \["partial", "retryable", "empty", "failed"\]/);
});

test("route funnel uses the same count model on desktop and narrow screens", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.equal(client.match(/<RoutePortfolioOverview portfolio=/g)?.length, 1);
  assert.match(client, /const routePortfolio = researchMap\.routePortfolio;/);
  assert.doesNotMatch(client, /researchMap\.routePortfolio\s*\|\|/);
  assert.match(client, /portfolio\.discoveredCount/);
  assert.match(client, /portfolio\.queuedCount \+ portfolio\.reviewingCount/);
  assert.match(client, /routeTodayPaperCount[\s\S]*rankedMonitorPapers\.filter/);
  assert.match(client, /portfolio\.formalEvidenceCount/);
  assert.match(client, /portfolio\.pendingEvidenceCount/);
  assert.match(client, /后台完成，无需确认/);
  assert.match(client, /发现不等于推荐，推荐也不等于正式路线证据/);

  const narrowRules = styles.match(/@media \(max-width: 430px\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(narrowRules, /\.v2-route-portfolio-flow\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(narrowRules, /display:\s*none/);
});
