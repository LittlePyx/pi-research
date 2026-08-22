import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("route, gap, and citation-network discoveries share the daily quality queue", async () => {
  const [monitor, mapRoute, networkRoute, queue, app] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-network/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/monitor-candidate-queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /await enqueueMonitorCandidates\(database, spaceId, candidates\)/);
  assert.match(mapRoute, /sourceKey: `research-route:\$\{sourceKind\}`/);
  assert.match(mapRoute, /recordDiscoveryCoverage: true/);
  assert.doesNotMatch(mapRoute, /upsertRouteGapResearchMapEvidence/);
  assert.match(networkRoute, /enqueueNetworkReviewCandidates\(database, spaceId, seedRows, cached, expansionKey\)/);
  assert.match(networkRoute, /enqueueNetworkReviewCandidates\(database, spaceId, seedRows, candidates, expansionKey\)/);
  assert.match(networkRoute, /sourceKey: "research-route:network"/);
  assert.match(queue, /never marks a paper recommended and never/);
  assert.match(queue, /WHERE paper_insights\.analysis_source IN \('metadata', 'route-gap'\)/);
  assert.doesNotMatch(queue, /llm_recommended[^\n]+VALUES[^\n]+1/);
  assert.match(mapRoute, /RESEARCH_ROUTE_REVIEW_QUEUE_COUNTS_SQL/);
  assert.match(queue, /dismissed\.feedback = 'not_relevant'/);
  assert.match(app, /const inReview = pipeline\.queued \+ pipeline\.reviewing/);
  assert.match(app, /累计 \$\{pipeline\.recommended\} 篇已通过/);
});

test("route candidates cannot starve and Today exposes explicit route provenance only after recommendation", async () => {
  const [monitor, planning, queue] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/monitor-route-planning.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/monitor-candidate-queue.ts", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /One screening slot per non-empty horizon/);
  assert.match(monitor, /candidate\.provenance\.some\(isMonitorRouteProvenance\)/);
  assert.match(monitor, /i\.llm_recommended = 1 AND i\.analysis_source = 'deepseek'/);
  assert.match(monitor, /discoveryOrigin/);
  assert.match(monitor, /discoveryType/);
  assert.match(monitor, /discoveryTrack/);
  assert.match(monitor, /qualityStage: paper\.quality_stage/);
  assert.match(monitor, /WHEN i\.llm_recommended = 1 AND i\.analysis_source = 'deepseek' THEN 'recommended'/);
  assert.match(monitor, /THEN 'reviewing'[\s\S]*THEN 'reviewed'[\s\S]*ELSE 'discovered'/);
  assert.match(monitor, /routeId: entry\.routeId \|\| null/);
  assert.match(monitor, /originKind: monitorRouteOriginKind/);
  assert.match(planning, /FROM recommendation_audit_events ae/);
  assert.match(planning, /JOIN json_each\(latest\.provenance_json\) origin/);
  assert.match(planning, /ranked\.audit_rank = 1 AND ranked\.recommended = 1/);
  assert.doesNotMatch(planning, /FROM recommendation_audit_events ae WHERE ae\.recommended = 1/);
  assert.match(planning, /datetime\(cs\.first_seen_at\) <= datetime\(insight\.updated_at\)/);
  assert.doesNotMatch(planning, /ROW_NUMBER\(\) OVER \(PARTITION BY cs\.paper_id ORDER BY cs\.last_seen_at/);
  assert.match(monitor, /routeOrigins: routeReviewOrigins\(paper, routeTitles\)/);
  assert.match(monitor, /Route origins are discovery context only/);
  assert.match(monitor, /Route-origin metadata explains why Pi surfaced a candidate/);
  assert.match(monitor, /const routeProvenance = candidate\.provenance\.filter/);
  assert.match(monitor, /\[\.\.\.routeProvenance, \.\.\.genericProvenance\]\.slice\(0, 16\)/);
  assert.match(monitor, /row\.source === "research-route" \? "research-route"/);
  assert.match(monitor, /row\.source === "research-network" \? "research-network"/);
  assert.match(queue, /FROM recommendation_audit_events audit/);
  assert.match(queue, /ROW_NUMBER\(\) OVER \(PARTITION BY audit\.space_id, audit\.paper_id ORDER BY audit\.reviewed_at DESC, audit\.rowid DESC\)/);
  assert.match(queue, /WHERE audit_rank = 1 AND recommended = 1/);
  assert.doesNotMatch(queue, /WHERE audit\.space_id = \? AND audit\.recommended = 1/);
  assert.match(queue, /json_extract\(origin\.value, '\$\.originKind'\) IN/);
  assert.doesNotMatch(queue, /i\.analysis_source = 'deepseek' AND i\.llm_recommended = 1 THEN cs\.paper_id/);
});

test("system-curated map context has a separate, non-destructive confirmation path", async () => {
  const [monitor, evidence] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/research-map-evidence.ts", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /SYSTEM_CURATED_RESEARCH_MAP_REVIEW_ID_PREFIX/);
  assert.match(monitor, /reviewsSystemCuratedPaper/);
  assert.match(evidence, /system-curated-review:/);
  assert.match(evidence, /isSystemCuratedReview/);
  assert.match(evidence, /NOT LIKE '\$\{SYSTEM_CURATED_RESEARCH_MAP_REVIEW_ID_PREFIX\}%'/);
});

test("DOI-less Semantic Scholar and OpenAlex discoveries share a work identity", async () => {
  const [network, queue] = await Promise.all([
    readFile(new URL("../app/api/research-network/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/monitor-candidate-queue.ts", import.meta.url), "utf8"),
  ]);
  assert.match(network, /function networkCandidateIdentity/);
  assert.match(network, /researchWorkIdentitySignature\(candidate\)/);
  assert.match(network, /compatibleResearchWorkMetadata\(normalized, current\)/);
  assert.doesNotMatch(network, /`work:\$\{title\}:\$\{year\}`/);
  assert.match(network, /let identity = networkCandidateIdentity\(normalized\)/);
  assert.match(network, /right\.seedIds\.size - left\.seedIds\.size/);
  assert.match(network, /right\.confirmedFrontier - left\.confirmedFrontier/);
  assert.match(queue, /async function sharedCanonicalId/);
  assert.match(queue, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(queue, /return "title:"/);
  assert.match(queue, /lower\(title\) LIKE \?/);
  assert.match(queue, /compatibleResearchWorkMetadata/);
});

test("explicit network acceptance formalizes immediately while Today quality review stays independent", async () => {
  const network = await readFile(new URL("../app/api/research-network/route.ts", import.meta.url), "utf8");
  const patch = network.slice(network.indexOf("export async function PATCH"));
  assert.match(patch, /await enqueueMonitorCandidates/);
  assert.match(patch, /const monitoredPaperId = queuedPaper\.id/);
  assert.match(patch, /formalized: true/);
  assert.match(patch, /qualityStage/);
  assert.doesNotMatch(patch, /formalized: false/);
  assert.doesNotMatch(patch, /qualityApproved/);
});

test("an equally supported cross-route bridge is queued once with every strongest route as provenance", async () => {
  const network = await readFile(new URL("../app/api/research-network/route.ts", import.meta.url), "utf8");
  assert.match(network, /function primaryNetworkRoutes/);
  assert.match(network, /return ranked\.filter\(\(entry\) => entry\.seedIds\.size === first\.seedIds\.size[\s\S]*\.map\(\(entry\) => entry\.trackId\)/);
  assert.match(network, /const trackIds = primaryNetworkRoutes\(candidate, seedRows\)/);
  assert.match(network, /provenance: trackIds\.map\(\(trackId\) => \(\{/);
  assert.doesNotMatch(network, /first\.confirmed === second\.confirmed\) return null/);
});

test("stale network recovery still enters the daily quality queue", async () => {
  const network = await readFile(new URL("../app/api/research-network/route.ts", import.meta.url), "utf8");
  const recovery = network.slice(network.indexOf("} catch (error) {", network.indexOf("export async function POST")), network.indexOf("async function candidateWithRelations"));
  assert.match(recovery, /stale = await loadCandidates/);
  assert.match(recovery, /if \(stale\.length\) await enqueueNetworkReviewCandidates\(database, spaceId, seedRows, stale, expansionKey\)/);
});
