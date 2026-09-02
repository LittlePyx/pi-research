import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../app/research-app.tsx", import.meta.url);
const cssUrl = new URL("../app/globals.css", import.meta.url);
const mapRouteUrl = new URL("../app/api/research-map/route.ts", import.meta.url);
const mapModelUrl = new URL("../lib/research-map.ts", import.meta.url);

test("primary pages use progressive disclosure instead of repeating internal process detail", async () => {
  const [app, css] = await Promise.all([readFile(appUrl, "utf8"), readFile(cssUrl, "utf8")]);
  const routeCards = app.slice(app.indexOf('<section className="v2-route-groups">'), app.indexOf('<details className="v2-route-map-assist">'));
  const decisionPanel = app.slice(app.indexOf("function ResearchLeadDecisionPanel"), app.indexOf("function routeManagementNeedsAttention"));

  assert.doesNotMatch(app, /<section className="v2-library-overview"/);
  assert.match(app, /SHOW_INTERNAL_QUALITY_UI && monitor\?\.queryPlan/);
  assert.match(app, /v2-background-review-status/);
  assert.doesNotMatch(routeCards, /RoutePipelineFunnel|RouteLearningNote|v2-route-review-policy|<label><span>\{locale === "zh" \? "定位"/);
  assert.doesNotMatch(decisionPanel, /v2-research-decision-funnel|证据发生了什么变化/);
  assert.match(app, /<details className="v2-learning-guidance">/);
  assert.match(app, /<details className="v2-gap-query">/);
  assert.match(css, /\.v2-gap-discovery-status/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.v2-learning-guidance > div \{ grid-template-columns: 1fr/);
});

test("the route response exposes the latest durable evidence-gap job without its internal query or error", async () => {
  const [route, model] = await Promise.all([readFile(mapRouteUrl, "utf8"), readFile(mapModelUrl, "utf8")]);
  assert.match(route, /FROM research_gap_discovery_jobs job WHERE space_id = \?/);
  assert.match(route, /ROW_NUMBER\(\) OVER \(PARTITION BY track_id ORDER BY datetime\(created_at\) DESC, job\.rowid DESC\)/);
  assert.match(route, /gapDiscovery: \(\(\) =>/);
  assert.match(model, /export type ResearchGapDiscoveryProgress/);
  assert.match(model, /gapDiscovery: ResearchGapDiscoveryProgress \| null/);
  const publicMapping = route.slice(route.indexOf("gapDiscovery: (() =>"), route.indexOf("routeRevisions:", route.indexOf("gapDiscovery: (() =>")));
  assert.doesNotMatch(publicMapping, /queryText|error|source_status_json/);
});
