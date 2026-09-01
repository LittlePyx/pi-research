import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Pi Research application", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Pi Research — Your AI Research Agent<\/title>/i);
  assert.match(html, /Pi Research/);
  assert.match(html, /论文发现/);
  assert.match(html, /近 14 天/);
  assert.match(html, /三个时间窗，持续向前挖掘/);
  assert.match(html, /设置重点来源/);
  assert.match(html, /先看今天最重要的变化/);
  assert.match(html, /匿名浏览器工作区/);
});

test("ships live monitoring, deduplication, and readable type", async () => {
  const [route, queue, feedback, profiles, repository, css, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/monitor-candidate-queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/domain-profiles.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /api\.crossref\.org\/works/);
  assert.match(route, /CADENCE_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(route, /enqueueMonitorCandidates/);
  assert.match(queue, /INSERT INTO monitored_papers/);
  assert.match(route, /titleFingerprint/);
  assert.match(route, /reviewCandidates/);
  assert.match(route, /MONITOR_MODEL = "deepseek-v4-pro"/);
  assert.match(route, /response_format: \{ type: "json_object" \}/);
  assert.match(route, /thinking: \{ type: "disabled" \}/);
  assert.match(route, /max_tokens: Math\.min\(attempt === 0 \? 2600 : 1800/);
  assert.match(route, /DEEP_REVIEW_PRIMARY_TIMEOUT_MS = 22_000/);
  assert.match(route, /DEEP_REVIEW_RETRY_TIMEOUT_MS = 16_000/);
  assert.match(route, /llm_recommended = 1/);
  assert.match(route, /discovering_\$\{horizon\.key\}/);
  assert.match(route, /horizonStats\[horizonKey\]/);
  assert.match(route, /CANDIDATE_WORK_QUEUE_LIMIT/);
  assert.match(route, /updateRunPhase\(database, space\.id, jobId, lockToken, "reviewing"/);
  assert.match(route, /updateRunPhase\(database, space\.id, jobId, lockToken, "saving"/);
  assert.match(route, /paper_delivery_state/);
  assert.match(route, /historyPapers/);
  assert.match(route, /paper\.show_count === 1 \? 1 : paper\.show_count === 2 \? 3 : 14/);
  assert.match(route, /datetime\('now', '-90 days'\)/);
  assert.doesNotMatch(route, /fallbackInsight/);
  assert.match(profiles, /IEEE Transactions on Information Theory/);
  assert.match(profiles, /International Conference on Machine Learning/);
  assert.match(repository, /idx_monitored_papers_space_canonical/);
  assert.match(repository, /idx_monitor_preferences_space/);
  assert.match(repository, /paper_insights/);
  assert.match(repository, /llm_recommended/);
  assert.match(repository, /idx_paper_insights_space_recommended_quality/);
  assert.match(repository, /idx_paper_delivery_space_paper/);
  assert.match(repository, /share_snapshots/);
  assert.match(repository, /idx_share_snapshots_token/);
  assert.match(feedback, /kind === "shown"/);
  assert.match(feedback, /kind === "later"/);
  assert.match(css, /Pi Research V3 — readable type and live discovery monitor/);
  assert.match(css, /\.v2-app \{ font-size: 16px; \}/);
  assert.match(css, /\.v2-scan-progress/);
  assert.doesNotMatch(client, /DEMO ANALYSIS CARDS|演示分析卡/);
  assert.doesNotMatch(client, /DeepSeek V4 Flash/);
  assert.match(client, /modelDisplayName/);
  assert.match(client, /DeepSeek V4 Pro/);
  assert.match(client, /startMonitorPolling/);
  assert.match(client, /window\.setInterval\(\(\) => void poll\(\), 1500\)/);
  assert.match(client, /DeepSeek Pro 正在逐篇筛选并撰写/);
  assert.match(client, /activeScanJob/);
  assert.match(client, /探索覆盖/);
  assert.match(client, /libraryFilter/);
  assert.match(client, /reportedImpressions/);
  assert.match(client, /未处理内容会保留/);
  assert.match(client, /rankedMonitorPapers/);
  assert.match(client, /openMonitorPaper/);
  assert.match(client, /为什么适合读/);
});

test("continuously explores new discovery branches and grows a connected research map", async () => {
  const [monitor, mapRoute, schema, repository, client, css, worker, viteConfig] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /monitor_discovery_pages/);
  assert.match(monitor, /monitor_discovery_coverage/);
  assert.match(monitor, /monitor_candidate_sources/);
  assert.match(monitor, /monitor_scan_jobs/);
  assert.match(monitor, /query\.bibliographic/);
  assert.match(monitor, /HORIZON_REVIEW_LIMITS[^\n]+years: 28/);
  assert.match(monitor, /HORIZON_POOL_LIMITS[^\n]+years: 140/);
  assert.match(monitor, /nextOffset = offset \+ rows >= DISCOVERY_OFFSET_LIMIT \? 0 : offset \+ rows/);
  assert.match(monitor, /discoveryQueryKey/);
  assert.match(monitor, /query\.container-title/);
  assert.match(monitor, /api\.crossref\.org\/journals\/\$\{encodeURIComponent\(plan\.issn\)\}\/works/);
  assert.match(monitor, /PRIORITY_JOURNAL_ISSNS/);
  assert.match(monitor, /priority-journal/);
  assert.match(monitor, /api\.semanticscholar\.org\/graph\/v1\/paper\/search/);
  assert.match(monitor, /api\.openalex\.org\/works/);
  assert.match(monitor, /export\.arxiv\.org\/api\/query/);
  assert.match(monitor, /api\.datacite\.org\/dois/);
  assert.match(monitor, /sourceKey: "datacite:arxiv"/);
  assert.match(monitor, /fetchCitationFrontier/);
  assert.match(monitor, /sourceKey: "research-route:network"/);
  assert.match(monitor, /persistReviewBatch/);
  assert.match(monitor, /persistCandidatePool/);
  assert.match(monitor, /pendingCandidateQueue/);
  assert.match(monitor, /loadCachedQuickScreens/);
  assert.match(monitor, /chooseBudgetedDeepCandidateIds/);
  assert.match(monitor, /i\.analysis_source = 'deepseek_screened'/);
  assert.match(monitor, /selectUnseenReviewBatch/);
  assert.match(monitor, /positiveExamples/);
  assert.match(monitor, /negativeExamples/);
  assert.match(monitor, /REVIEW_BATCH_SIZE = 14/);
  assert.match(monitor, /ERROR_RETRY_MS/);
  assert.match(monitor, /sort: horizon\.key === "days" \? "published"/);
  assert.match(monitor, /discovery_round = discovery_round \+ 1/);
  assert.match(monitor, /Existing research-map directions/);
  assert.match(monitor, /upsertPendingResearchMapEvidence/);
  assert.match(monitor, /promoteAlreadyAcceptedResearchMapEvidence/);
  assert.doesNotMatch(monitor, /INSERT OR IGNORE INTO research_track_papers/);
  assert.match(mapRoute, /MODEL = "deepseek-v4-pro"/);
  assert.match(mapRoute, /reasoning_effort: options\.reasoningEffort \|\| "high"/);
  assert.match(mapRoute, /WORKSPACE_DAILY_LIMIT = 32/);
  assert.match(mapRoute, /Foundation = field-defining concepts or methods/);
  assert.match(mapRoute, /action\?: "read" \| "initialize" \| "hydrate" \| "expand"/);
  assert.match(mapRoute, /INSERT OR IGNORE INTO research_track_papers/);
  assert.match(mapRoute, /expansion_count, build_status, user_role/);
  assert.match(mapRoute, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, -1, 'queued'/);
  assert.match(mapRoute, /defensiveResearchTrackBuildStatus/);
  assert.match(mapRoute, /resolveResearchTrackBuildStatus/);
  assert.match(mapRoute, /outlineReady: true/);
  assert.match(mapRoute, /const hydrating = payload\.action === "hydrate"/);
  assert.match(mapRoute, /const gapExpanding = payload\.action === "expand-gap"/);
  assert.match(mapRoute, /const problemExpanding = payload\.action === "expand-problem"/);
  assert.match(mapRoute, /parseStoredIntelligence\(track\)\?\.nextSearchQuery/);
  assert.match(mapRoute, /searchQueries: targetedExpanding \? \[targetedQuery\] : queries/);
  assert.match(mapRoute, /buildProgress/);
  assert.match(mapRoute, /directionIntelligence/);
  assert.match(mapRoute, /interpretDirection/);
  assert.match(mapRoute, /evidenceCanonicalIds/);
  assert.match(mapRoute, /Distinguish metadata-supported statements from your synthesis/);
  assert.match(mapRoute, /action\?: "read" \| "initialize" \| "hydrate" \| "expand" \| "expand-gap" \| "expand-problem" \| "expand-action" \| "interpret"/);
  assert.match(mapRoute, /structureExistingTracks/);
  assert.match(mapRoute, /research_track_edges/);
  assert.match(mapRoute, /userRole \(core\|support\|explore\)/);
  assert.match(mapRoute, /function heatEvidence/);
  assert.match(mapRoute, /last14Days \* 30 \+ last6Months \* 10/);
  assert.match(mapRoute, /recentPaperCount/);
  assert.match(mapRoute, /api\.semanticscholar\.org\/graph\/v1\/paper\/batch/);
  assert.match(mapRoute, /action\?: "read" \| "initialize" \| "hydrate" \| "expand" \| "expand-gap" \| "expand-problem" \| "expand-action" \| "interpret" \| "advance-intelligence" \| "structure" \| "activity" \| "network" \| "reconcile"/);
  assert.match(mapRoute, /reconcileConfirmedResearchMapEvidence/);
  assert.match(mapRoute, /ep\.status = 'confirmed'/);
  assert.match(mapRoute, /system_curated/);
  assert.match(mapRoute, /confirmedEvidenceCount/);
  assert.match(mapRoute, /pendingEvidenceCount/);
  assert.match(mapRoute, /latestChange/);
  assert.match(mapRoute, /generatePaperNetworkEdges/);
  assert.match(mapRoute, /never invent citation claims/);
  assert.match(mapRoute, /kind: "citation"/);
  assert.match(mapRoute, /kind: "similarity"/);
  assert.match(mapRoute, /bibliographic_coupling/);
  assert.match(mapRoute, /kind \(semantic\)/);
  assert.doesNotMatch(mapRoute, /path edges|kind \(semantic\|path\)/);
  assert.match(mapRoute, /semantic-scholar-cache/);
  assert.match(mapRoute, /DeepSeekJsonResponseError/);
  assert.match(mapRoute, /isRetryableDeepSeekJsonError/);
  assert.match(mapRoute, /cachedEdges\.filter/);
  assert.match(mapRoute, /research_paper_edges/);
  assert.match(mapRoute, /research_paper_network_states/);
  assert.match(mapRoute, /selectResearchPaperCoverage/);
  assert.match(mapRoute, /coveredPaperIds/);
  assert.match(mapRoute, /coveredPaperHash/);
  assert.match(mapRoute, /paperRevision/);
  assert.match(mapRoute, /source_paper_id IN \(\$\{placeholders\}\)/);
  assert.match(mapRoute, /target_paper_id IN \(\$\{placeholders\}\)/);
  assert.doesNotMatch(mapRoute, /DELETE FROM research_paper_edges WHERE space_id = \? AND kind = \?"/);
  assert.match(mapRoute, /paperCount: uniquePaperCount/);
  assert.match(schema, /researchTracks/);
  assert.match(schema, /researchTrackPapers/);
  assert.match(schema, /researchTrackEdges/);
  assert.match(schema, /researchPaperEdges/);
  assert.match(schema, /researchPaperNetworkStates/);
  assert.match(schema, /intelligenceJson/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS research_tracks/);
  assert.match(repository, /intelligence_json TEXT NOT NULL DEFAULT/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS research_paper_edges/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS research_paper_network_states/);
  assert.match(client, /研究地图/);
  assert.match(client, /继续填充这条路线/);
  assert.match(client, /v2-route-groups/);
  assert.match(client, /v2-route-workspace-tabs/);
  assert.match(client, /路线总览/);
  assert.match(client, /当前研判/);
  assert.match(client, /证据链/);
  assert.match(client, /缺口与发现/);
  assert.match(client, /研究议程/);
  assert.match(client, /高级图谱探索/);
  assert.match(client, /setResearchDirectionRole/);
  assert.match(client, /研究深度/);
  assert.match(client, /辅助价值/);
  assert.match(client, /directionHeatLabel/);
  assert.match(client, /当前发现热度/);
  assert.match(client, /action: "hydrate"/);
  assert.doesNotMatch(client, /action: "reconcile"/);
  assert.match(client, /action: origin === "problem" \? "expand-problem" : "expand-gap"/);
  assert.match(client, /mapBuildTrackId/);
  assert.match(client, /先建立可浏览的方向骨架/);
  assert.match(client, /已完成内容已经保存/);
  assert.match(client, /refreshDirectionIntelligence/);
  assert.match(client, /这条路线目前可以怎样判断/);
  assert.match(client, /论文网络/);
  assert.match(client, /引用关系/);
  assert.match(client, /发展路径/);
  assert.match(client, /PaperNetworkGraph/);
  assert.match(client, /PAPER_NETWORK_ACTIVE_NODE_LIMIT = 72/);
  assert.match(client, /selectPaperNetworkActiveNodeIds/);
  assert.match(client, /builtPaperRevision !== researchMap\.paperNetwork\.paperRevision/);
  assert.doesNotMatch(client, /return Array\.from\(unique\.values\(\)\)\.slice\(0, 40\)/);
  assert.match(client, /DirectionPathMap/);
  assert.match(client, /相似性地图/);
  assert.match(client, /起始论文/);
  assert.match(client, /"all" \| "one-hop" \| "multi-seed"/);
  assert.match(client, /selectBalancedMultiSeedEdges/);
  assert.match(client, /paperNetworkOriginCanonicalIds/);
  assert.match(client, /共同领域/);
  assert.match(client, /跨域桥接/);
  assert.match(client, /并集比较/);
  assert.match(client, /seedConnectionCount/);
  assert.match(client, /markerUnits="userSpaceOnUse"/);
  assert.match(client, /edge\.kind === "citation" && mode === "citations"/);
  assert.doesNotMatch(client, /蓝线：数据库确认的引用关系/);
  assert.match(css, /\.v2-network-origin-remove/);
  assert.match(css, /\.v2-paper-network-node \.shared-ring/);
  assert.match(client, /数据库确认的引用/);
  assert.doesNotMatch(client, /Pi 解释的语义关系/);
  assert.match(client, /相似论文/);
  assert.match(client, /前置奠基/);
  assert.match(client, /后续发展/);
  assert.match(client, /节点大小：被引量/);
  assert.match(client, /颜色：发表年份/);
  assert.match(client, /发现更多论文/);
  assert.match(client, /expandResearchNetwork\(undefined, true\)/);
  assert.match(client, /以此生成新图/);
  assert.match(client, /candidateId: candidate\.id/);
  assert.match(client, /ResearchNetworkExpandResponse/);
  assert.match(client, /setResearchNetworkSimilarityEdges\(data\.similarityEdges\)/);
  assert.match(client, /researchNetworkContextRef\.current\.version === contextVersion/);
  assert.match(client, /resetResearchNetworkExpansion\(\[\], space\.id\)/);
  assert.match(client, /本批使用过期缓存，建议刷新/);
  assert.match(client, /verified_discovery/);
  assert.match(client, /recommendation_discovery/);
  assert.match(client, /中性虚线：引用或推荐发现线索（非耦合）/);
  assert.match(client, /networkEvidenceLabel/);
  assert.doesNotMatch(client, /\{edge\.confidence\}%/);
  assert.doesNotMatch(client, /formatNetworkScore/);
  assert.doesNotMatch(client, /选择论文可聚焦当前论文库内的一跳直接关系/);
  assert.match(client, /onSelect=\{\(paperId\) => setSelectedNetworkPaperId\(paperId\)\}/);
  assert.match(css, /\.v2-paper-discovery-list/);
  assert.match(css, /\.v2-paper-network-node\.external-ghost/);
  assert.match(client, /paperNetworkStateLabel/);
  assert.match(client, /researchNetworkIssueSummary/);
  assert.match(client, /来源短暂限流，已保留本批结果/);
  const expandNetworkStart = client.indexOf("async function expandResearchNetwork");
  const expandNetworkEnd = client.indexOf("async function generateResearchNetworkFrom", expandNetworkStart);
  const expandNetwork = client.slice(expandNetworkStart, expandNetworkEnd);
  assert.ok(expandNetworkStart >= 0 && expandNetworkEnd > expandNetworkStart);
  assert.match(expandNetwork, /setResearchNetworkResponse\(null\)/);
  assert.match(expandNetwork, /isResearchNetworkExpandResponse\(data\)/);
  assert.match(expandNetwork, /setResearchNetworkSeeds\(data\.seeds\)/);
  assert.match(expandNetwork, /setResearchNetworkCandidates\(data\.candidates\)/);
  assert.match(expandNetwork, /setResearchNetworkResponse\(data\)/);
  assert.doesNotMatch(expandNetwork, /if \(!response\.ok\) throw/);
  assert.doesNotMatch(client, /researchNetworkResponse\.errors\[0\]/);
  assert.doesNotMatch(client, /title=\{researchNetworkResponse\.errors\.join/);
  const researchNetworkStatusStart = client.indexOf('paperNetworkMode === "similarity" && researchNetworkResponse && (() =>');
  const researchNetworkStatusEnd = client.indexOf('paperNetworkMode === "similarity" && researchNetworkError &&', researchNetworkStatusStart);
  const researchNetworkStatus = client.slice(researchNetworkStatusStart, researchNetworkStatusEnd);
  assert.ok(researchNetworkStatusStart >= 0 && researchNetworkStatusEnd > researchNetworkStatusStart);
  assert.match(researchNetworkStatus, /已保存研究地图/);
  assert.match(researchNetworkStatus, /地图累计/);
  assert.match(researchNetworkStatus, /本次外部发现/);
  assert.match(researchNetworkStatus, /researchNetworkResponse\.candidates\.filter/);
  assert.match(researchNetworkStatus, /直接引用 \/ 参考文献证据/);
  assert.match(researchNetworkStatus, /暂无可计算关系/);
  assert.match(researchNetworkStatus, /本轮没有新的可推荐论文/);
  assert.match(client, /empty: \{ zh: "已检查，暂无新结果"/);
  assert.match(client, /no_matches: \{ zh: "已检查，未匹配到新论文"/);
  assert.match(client, /researchNetworkHasNoNewCandidates/);
  const noMatchesStart = client.indexOf("function researchNetworkHasNoNewCandidates");
  const noMatchesEnd = client.indexOf("function researchNetworkIssueSummary", noMatchesStart);
  const noMatchesGuard = client.slice(noMatchesStart, noMatchesEnd);
  assert.ok(noMatchesStart >= 0 && noMatchesEnd > noMatchesStart);
  assert.match(noMatchesGuard, /responseStatus === "no_matches"/);
  assert.match(noMatchesGuard, /status === "partial" \|\| status === "unavailable"/);
  assert.doesNotMatch(noMatchesGuard, /responseStatus === "ok"/);
  assert.doesNotMatch(noMatchesGuard, /sourceStatuses\.some\(\(status\) => status === "empty"/);
  const issueSummaryStart = client.indexOf("function researchNetworkIssueSummary");
  const issueSummaryEnd = client.indexOf("function paperNetworkStateLabel", issueSummaryStart);
  const issueSummarySource = client.slice(issueSummaryStart, issueSummaryEnd);
  assert.ok(issueSummaryStart >= 0 && issueSummaryEnd > issueSummaryStart);
  assert.match(issueSummarySource, /response\.status === "partial" && response\.candidates\.length === 0/);
  assert.match(issueSummarySource, /部分来源本轮未完成，暂未返回新的可核验候选/);
  assert.match(researchNetworkStatus, /discoveryUnavailable = researchNetworkResponse\.status === "unavailable"/);
  assert.match(researchNetworkStatus, /emptyPartialBatch = researchNetworkResponse\.status === "partial" && batchCandidateCount === 0/);
  assert.match(researchNetworkStatus, /batchHasNoNewCandidates[\s\S]*: emptyPartialBatch[\s\S]*: researchNetworkResponse\.stale/);
  assert.doesNotMatch(researchNetworkStatus, /status === "unavailable" \|\| researchNetworkResponse\.externalUnavailable/);
  assert.match(client, /当前仍保留 \$\{verifiedCount\} 条数据库关系/);
  assert.doesNotMatch(client, /真实引用与文献耦合已更新 \$\{verifiedCount\} 条/);
  assert.match(researchNetworkStatus, /researchMap\.paperNetwork\.citationEdgeCount \+ researchMap\.paperNetwork\.similarityEdgeCount/);
  assert.doesNotMatch(researchNetworkStatus, /当前起点获得数据库核验关系/);
  assert.match(researchNetworkStatus, /sourceStatus\.openAlex !== "not_attempted"/);
  assert.match(researchNetworkStatus, /<dt>OpenAlex<\/dt>/);
  assert.match(client, /className="reading-state-marker"/);
  assert.match(client, /aria-pressed=\{selected\}/);
  assert.match(css, /\.v2-paper-network-node\.seen \.state-ring, \.v2-paper-network-node\.snoozed \.state-ring \{ stroke: transparent; \}/);
  assert.match(css, /\.v2-paper-network-node\.seen \.reading-state-marker \{ fill: #71857b; \}/);
  assert.match(css, /\.v2-paper-network-node\.snoozed \.reading-state-marker \{ fill: #7a7488; \}/);
  assert.match(css, /\.v2-paper-network-node\.external-ghost:not\(\.selected\):not\(\.accepted\):not\(\.origin\) \.state-ring \{ fill: none; stroke: transparent; \}/);
  assert.match(css, /\.v2-paper-network-node\.external-ghost \.paper-dot \{[^}]*stroke: #87958d/);
  assert.match(css, /\.v2-paper-network-node\.accepted \.state-ring \{ stroke: #4c8066; \}/);
  assert.match(client, /className="selection-ring"/);
  assert.match(css, /\.v2-paper-network-node\.selected \.selection-ring \{ stroke: #173f32; stroke-width: 2\.4; \}/);
  assert.doesNotMatch(css, /\.v2-paper-network-node\.selected \.state-ring/);
  assert.match(css, /\.v2-paper-network-node\.origin \.state-ring \{[^}]*stroke: #b18342/);
  assert.match(css, /\.v2-research-network-source-state\.empty/);
  assert.doesNotMatch(css, /#b69a69|#a98d68/);
  assert.ok(css.lastIndexOf(".v2-paper-network-node.origin .state-ring") > css.lastIndexOf(".v2-paper-network-node.external-ghost:not(.selected):not(.accepted):not(.origin) .state-ring"));
  assert.match(client, /Pi 推断，不代表真实引用/);
  assert.match(client, /当前仍保留 \$\{verifiedCount\} 条数据库关系/);
  assert.doesNotMatch(client, /className="v2-direction-bridges"/);
  assert.match(client, /v2-direction-live-relations/);
  assert.match(client, /directionPinnedRelationId/);
  assert.match(client, /onPointerEnter/);
  assert.match(client, /悬停预览，点击固定/);
  assert.match(client, /以此方向规划路径/);
  assert.doesNotMatch(client, /加入学习路径/);
  assert.match(client, /关键机会/);
  assert.match(client, /观察信号/);
  assert.doesNotMatch(client, /Gaussian Extremality for Rate-Distortion/);
  assert.match(css, /Focused Today brief \+ real research map/);
  assert.match(css, /\.v2-research-timeline/);
  assert.match(css, /continuous discovery and growing field graph/);
  assert.match(css, /subtle direction heat signals/);
  assert.match(css, /\.v2-direction-heat\.rising/);
  assert.match(css, /progressive research-map construction/);
  assert.match(css, /\.v2-map-build-progress/);
  assert.match(css, /evidence-grounded LLM direction intelligence/);
  assert.match(css, /\.v2-direction-intelligence-line/);
  assert.match(css, /dual-layer direction and paper network/);
  assert.match(css, /\.v2-paper-network-canvas/);
  assert.match(css, /\.v2-paper-network-drawer/);
  assert.match(client, /function CitationFlowWorkbench/);
  assert.match(client, /前置知识/);
  assert.match(client, /完整已核验引用清单/);
  assert.match(client, /直接引用 · \$\{citationEvidenceProviderLabel\(item\.edge\.evidenceSource\)\} 核验/);
  assert.match(client, /model\.priorAll\.length > model\.prior\.length/);
  assert.match(client, /展开其余 \$\{model\.priorAll\.length - model\.prior\.length\} 篇/);
  assert.match(client, /item\.node\.paper\.authors \|\|/);
  assert.match(client, /到论文发现扩展前后 1-hop/);
  assert.match(client, /selectedPaperId !== model\.focus\.paper\.id/);
  assert.doesNotMatch(client, /model\.ledger\.slice\(0, 16\)/);
  assert.match(client, /function ReadingOrderWorkbench/);
  assert.match(client, /learningState: LearningPathState/);
  assert.match(client, /为什么现在读/);
  assert.match(client, /重点读什么/);
  assert.match(client, /完成检查/);
  assert.match(client, /每个阶段内的多篇论文是并行材料/);
  assert.match(client, /pathDirectionMismatch/);
  assert.match(client, /nodeByCanonicalId/);
  assert.match(client, /nodeByTitleKey/);
  assert.match(client, /unique\.set\(key, unique\.has\(key\) \? null : node\)/);
  assert.match(client, /learningResourceHref\(resource\)/);
  assert.match(client, /原文链接待补全/);
  assert.doesNotMatch(client, /href=\{resource\.url \|\| "#"\}/);
  assert.doesNotMatch(client, /本路径中的衔接/);
  assert.match(client, /paperNetworkMode === "similarity" \? <>/);
  assert.match(css, /separate citation lineage and executable reading-plan workbenches/);
  assert.match(css, /\.v2-citation-lineage-grid/);
  assert.match(css, /\.v2-reading-stage-list/);
  assert.match(css, /@keyframes v2-relation-draw/);
  assert.match(css, /\.v2-direction-live-relation\.supports/);
  assert.match(css, /calm, evidence-first research route workbench/);
  assert.match(css, /\.v2-route-workspace-tabs/);
  assert.match(css, /\.v2-route-evidence-chain/);
  assert.match(client, /v2-route-discovery-origin/);
  assert.match(client, /研究路线深挖/);
  assert.match(client, /历史奠基文献/);
  assert.match(client, /monitorPaperHorizonLabel/);
  assert.match(client, /今日质量评估/);
  assert.match(css, /traceable route discovery and quality-review handoff/);
  assert.match(css, /\.v2-route-quality-flow/);
  assert.match(worker, /runScheduledMonitorSweep/);
  assert.match(worker, /async scheduled/);
  assert.match(worker, /SCHEDULED_SPACE_BATCH_SIZE = 1/);
  assert.match(worker, /LIMIT \?/);
  assert.match(worker, /Promise\.allSettled/);
  assert.match(viteConfig, /crons: \["\*\/10 \* \* \* \*"\]/);
});

test("builds persistent personalized learning paths from real research papers", async () => {
  const [route, schema, repository, client, css] = await Promise.all([
    readFile(new URL("../app/api/learning-path/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(route, /MODEL = "deepseek-v4-pro"/);
  assert.match(route, /Use only the supplied real paper IDs/);
  assert.match(route, /research_track_papers/);
  assert.match(route, /i\.llm_recommended = 1/);
  assert.match(route, /confirmedResearchMemory/);
  assert.match(route, /resourceIds: \["exact supplied id"\]/);
  assert.match(route, /INSERT INTO learning_paths/);
  assert.match(route, /INSERT INTO learning_path_steps/);
  assert.match(route, /status = 'superseded'/);
  assert.match(route, /interaction_score = MIN\(35, interaction_score \+ 2\)/);
  assert.match(schema, /learningPaths/);
  assert.match(schema, /learningPathSteps/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS learning_paths/);
  assert.match(repository, /idx_learning_path_steps_path_position/);
  assert.match(client, /generateLearningPath/);
  assert.match(client, /updateLearningStep/);
  assert.match(client, /JSON\.stringify\(\{ spaceId, target, trackId: targetTrackId \}\)/);
  assert.match(client, /activeLearningState\.path/);
  assert.match(client, /learningRequestRef\.current !== requestId/);
  assert.match(client, /learningIntentRef\.current = \{ spaceId: activeSpace\.id, trackId: thread\.id, target \}/);
  assert.match(client, /data\.path\?\.targetTrackId \|\| null/);
  assert.match(client, /v2-learning-target-scope/);
  assert.match(client, /activeLearningPathDirectionMismatch/);
  assert.match(client, /learningScopeDirty && activeLearningState\.path\.targetTrackId !== null/);
  assert.match(client, /setLearningScopeDirty\(true\)/);
  assert.match(client, /你已切换为从全空间论文中规划/);
  assert.match(client, /按全空间重新规划/);
  assert.match(client, /activeLearningState\.path \? generateLearningPath\(activeLearningState\.path\.target, activeLearningState\.path\.targetTrackId\) : generateLearningPath\(learningTarget\)/);
  assert.match(client, /learningResourceSignals/);
  assert.match(client, /真实学习材料/);
  assert.match(client, /完成检查/);
  assert.doesNotMatch(client, /Schrödinger’s Problem and Entropic Transport/);
  assert.doesNotMatch(client, /Mean-Field Schrödinger Problems: A Survey/);
  assert.match(css, /grounded, persistent learning paths/);
  assert.match(css, /\.v2-learning-resources/);
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.v2-learn-head > \.v2-learning-target-form \{ height: auto;/);
});

test("creates immutable public snapshots with live paper links and independent metadata", async () => {
  const [route, snapshotStore, sharePage, shareActions, client, css] = await Promise.all([
    readFile(new URL("../app/api/shares/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/share-snapshots.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/share/[token]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/share/[token]/share-actions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(route, /kind === "daily"/);
  assert.match(route, /kind === "paper"/);
  assert.match(route, /paperIds\.length > 6/);
  assert.match(route, /i\.llm_recommended = 1/);
  assert.match(route, /i\.analysis_source = 'deepseek'/);
  assert.match(route, /i\.analysis_model = 'deepseek-v4-pro'/);
  assert.match(route, /INSERT INTO share_snapshots/);
  assert.match(snapshotStore, /JSON\.parse\(row\.payload\)/);
  assert.match(sharePage, /generateMetadata/);
  assert.match(sharePage, /images: \[\]/);
  assert.match(sharePage, /打开原文/);
  assert.match(sharePage, /Content was frozen when shared/);
  assert.match(shareActions, /navigator\.share/);
  assert.match(shareActions, /navigator\.clipboard\.writeText/);
  assert.match(client, /shareSnapshot/);
  assert.match(client, /分享今日推荐/);
  assert.match(client, /生成单篇快照/);
  assert.match(css, /Pi Research V5 — immutable, link-rich recommendation snapshots/);
  assert.match(css, /\.share-paper/);
});

test("imports public research materials into reviewed, space-isolated profile memory", async () => {
  const [route, schema, repository, monitor, ask, client, css] = await Promise.all([
    readFile(new URL("../app/api/research-imports/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ask/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /researchImports/);
  assert.match(schema, /idx_research_imports_space_hash/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS research_imports/);
  assert.match(route, /IMPORT_MODEL = "deepseek-v4-pro"/);
  assert.match(route, /MAX_FILES = 12/);
  assert.match(route, /MAX_TOTAL_CHARS = 180_000/);
  assert.match(route, /safetyConfirmed !== true/);
  assert.match(route, /unsafeNamePattern/);
  assert.match(route, /response_format: \{ type: "json_object" \}/);
  assert.match(route, /reasoning_effort: "high"/);
  assert.match(route, /rawFilesStored: false/);
  assert.doesNotMatch(route, /INSERT INTO research_imports[^\n]+file\.text/);
  assert.match(route, /status = 'confirmed'/);
  assert.match(route, /DELETE FROM research_imports/);
  assert.match(monitor, /enrichSpaceWithImportedMemory/);
  assert.match(monitor, /User-confirmed imported research memory/);
  assert.match(ask, /User-confirmed imported research memory/);
  assert.match(client, /webkitdirectory/);
  assert.match(client, /extractPdfText/);
  assert.match(client, /mammoth\.browser\.min\.js/);
  assert.match(client, /不要上传未发表稿件/);
  assert.match(client, /生成研究画像草稿/);
  assert.match(client, /确认写入当前空间/);
  assert.match(css, /Pi Research V6 — reviewed research-profile imports/);
  assert.match(css, /\.v2-import-warning/);
  assert.match(css, /\.v2-draft-opportunities/);
});

test("keeps a durable, view-aware paper inbox with reversible decisions", async () => {
  const [monitor, feedback, ask, spaces, client, css] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ask/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/spaces/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(monitor, /seen: pendingPapers\.filter/);
  assert.match(monitor, /snoozed: pendingPapers\.filter/);
  assert.match(feedback, /snoozed_until/);
  assert.match(client, /IntersectionObserver/);
  assert.match(client, /intersectionRatio < 0\.55/);
  assert.match(client, /data-paper-impression/);
  assert.match(client, /librarySearch/);
  assert.match(client, /LibrarySort/);
  assert.match(client, /returnPaperToInbox/);
  assert.match(client, /paperReturnView/);
  assert.match(client, /window\.history\.pushState/);
  assert.match(client, /每篇论文都有明确去处/);
  assert.match(ask, /const model = "deepseek-v4-pro"/);
  assert.match(spaces, /modelConfigured \? "deepseek-v4-pro"/);
  assert.match(css, /Pi Research V7 — durable reading inbox and calmer navigation/);
  assert.match(css, /\.v2-library-overview/);
  assert.match(css, /\.v2-library-paper-actions/);
});

test("uses the official Pi Research and P&I Lab logos across product surfaces", async () => {
  const [client, sharePage, layout, css, productMark, teamMark] = await Promise.all([
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/share/[token]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/pi-research-mark.png", import.meta.url)),
    readFile(new URL("../public/pi-lab-logo.png", import.meta.url)),
  ]);

  assert.ok(productMark.length > 10_000);
  assert.ok(teamMark.length > 100_000);
  assert.match(client, /src="\/pi-research-mark\.png"/);
  assert.match(client, /src="\/pi-lab-logo\.png"/);
  assert.match(client, /v2-lab-attribution/);
  assert.doesNotMatch(client, /v2-sidebar-bottom[^]*v2-team-credit/);
  assert.match(sharePage, /share-product-mark/);
  assert.match(sharePage, /share-team-mark/);
  assert.match(layout, /icon: "\/pi-research-mark\.png"/);
  assert.match(css, /Pi Research V8 — official product and P&I Lab branding/);
});
