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
  const [route, feedback, profiles, repository, css, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/domain-profiles.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /api\.crossref\.org\/works/);
  assert.match(route, /CADENCE_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(route, /INSERT INTO monitored_papers/);
  assert.match(route, /titleFingerprint/);
  assert.match(route, /reviewCandidates/);
  assert.match(route, /MONITOR_MODEL = "deepseek-v4-pro"/);
  assert.match(route, /response_format: \{ type: "json_object" \}/);
  assert.match(route, /thinking: \{ type: "enabled" \}/);
  assert.match(route, /max_tokens: attempt === 0 \? 8500 : 7000/);
  assert.match(route, /AbortSignal\.timeout\(attempt === 0 \? 55_000 : 45_000\)/);
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
  assert.match(monitor, /fetchCitationFrontier/);
  assert.match(monitor, /semantic_scholar:\$\{relation\}/);
  assert.match(monitor, /persistReviewBatch/);
  assert.match(monitor, /persistCandidatePool/);
  assert.match(monitor, /pendingCandidateQueue/);
  assert.match(monitor, /loadCachedQuickScreens/);
  assert.match(monitor, /chooseContinuityCandidateIds/);
  assert.match(monitor, /i\.analysis_source = 'deepseek_screened'/);
  assert.match(monitor, /selectUnseenReviewBatch/);
  assert.match(monitor, /positiveExamples/);
  assert.match(monitor, /negativeExamples/);
  assert.match(monitor, /REVIEW_BATCH_SIZE = 14/);
  assert.match(monitor, /ERROR_RETRY_MS/);
  assert.match(monitor, /sort: horizon\.key === "days" \? "published"/);
  assert.match(monitor, /discovery_round = discovery_round \+ 1/);
  assert.match(monitor, /Existing research-map directions/);
  assert.match(monitor, /INSERT OR IGNORE INTO research_track_papers/);
  assert.match(monitor, /SET intelligence_json = '\{\}', intelligence_model = '', intelligence_updated_at = NULL/);
  assert.match(mapRoute, /MODEL = "deepseek-v4-pro"/);
  assert.match(mapRoute, /reasoning_effort: "high"/);
  assert.match(mapRoute, /WORKSPACE_DAILY_LIMIT = 32/);
  assert.match(mapRoute, /Foundation = field-defining concepts or methods/);
  assert.match(mapRoute, /action\?: "initialize" \| "hydrate" \| "expand"/);
  assert.match(mapRoute, /INSERT OR IGNORE INTO research_track_papers/);
  assert.match(mapRoute, /expansion_count, user_role/);
  assert.match(mapRoute, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, -1/);
  assert.match(mapRoute, /outlineReady: true/);
  assert.match(mapRoute, /const hydrating = payload\.action === "hydrate"/);
  assert.match(mapRoute, /buildProgress/);
  assert.match(mapRoute, /directionIntelligence/);
  assert.match(mapRoute, /interpretDirection/);
  assert.match(mapRoute, /evidenceCanonicalIds/);
  assert.match(mapRoute, /Distinguish metadata-supported statements from your synthesis/);
  assert.match(mapRoute, /action\?: "initialize" \| "hydrate" \| "expand" \| "interpret"/);
  assert.match(mapRoute, /structureExistingTracks/);
  assert.match(mapRoute, /research_track_edges/);
  assert.match(mapRoute, /userRole \(core\|support\|explore\)/);
  assert.match(mapRoute, /function heatEvidence/);
  assert.match(mapRoute, /last14Days \* 30 \+ last6Months \* 10/);
  assert.match(mapRoute, /recentPaperCount/);
  assert.match(mapRoute, /api\.semanticscholar\.org\/graph\/v1\/paper\/batch/);
  assert.match(mapRoute, /action\?: "initialize" \| "hydrate" \| "expand" \| "interpret" \| "structure" \| "activity" \| "network" \| "reconcile"/);
  assert.match(mapRoute, /reconcileRecentRecommendations/);
  assert.match(mapRoute, /map-reconcile-space:/);
  assert.match(mapRoute, /generatePaperNetworkEdges/);
  assert.match(mapRoute, /never invent citation claims/);
  assert.match(mapRoute, /kind: "citation"/);
  assert.match(mapRoute, /kind: "similarity"/);
  assert.match(mapRoute, /bibliographic_coupling/);
  assert.match(mapRoute, /kind \(semantic\|path\)/);
  assert.match(mapRoute, /semantic-scholar-cache/);
  assert.match(mapRoute, /empty research map/i);
  assert.match(mapRoute, /cachedEdges\.filter/);
  assert.match(mapRoute, /research_paper_edges/);
  assert.match(mapRoute, /research_paper_network_states/);
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
  assert.match(client, /v2-field-network/);
  assert.match(client, /setResearchDirectionRole/);
  assert.match(client, /研究深度/);
  assert.match(client, /辅助价值/);
  assert.match(client, /directionHeatLabel/);
  assert.match(client, /当前发现热度/);
  assert.match(client, /action: "hydrate"/);
  assert.match(client, /action: "reconcile"/);
  assert.match(client, /mapBuildTrackId/);
  assert.match(client, /先建立可浏览的方向骨架/);
  assert.match(client, /切换页面不会丢失已经完成的内容/);
  assert.match(client, /refreshDirectionIntelligence/);
  assert.match(client, /PI 方向研判/);
  assert.match(client, /论文网络/);
  assert.match(client, /引用关系/);
  assert.match(client, /发展路径/);
  assert.match(client, /PaperNetworkGraph/);
  assert.match(client, /DirectionPathMap/);
  assert.match(client, /相似性地图/);
  assert.match(client, /种子论文/);
  assert.match(client, /数据库确认的引用/);
  assert.match(client, /Pi 解释的语义关系/);
  assert.match(client, /Pi 推断，不代表真实引用/);
  assert.match(client, /真实引用与文献耦合已更新/);
  assert.doesNotMatch(client, /className="v2-direction-bridges"/);
  assert.match(client, /v2-direction-live-relations/);
  assert.match(client, /directionPinnedRelationId/);
  assert.match(client, /onPointerEnter/);
  assert.match(client, /悬停预览，点击固定/);
  assert.match(client, /加入学习路径/);
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
  assert.match(css, /@keyframes v2-relation-draw/);
  assert.match(css, /\.v2-direction-live-relation\.supports/);
  assert.match(worker, /runScheduledMonitorSweep/);
  assert.match(worker, /async scheduled/);
  assert.match(worker, /LIMIT 2/);
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
  assert.match(route, /interaction_score = MIN\(100, interaction_score \+ 2\)/);
  assert.match(schema, /learningPaths/);
  assert.match(schema, /learningPathSteps/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS learning_paths/);
  assert.match(repository, /idx_learning_path_steps_path_position/);
  assert.match(client, /generateLearningPath/);
  assert.match(client, /updateLearningStep/);
  assert.match(client, /真实学习材料/);
  assert.match(client, /完成检查/);
  assert.doesNotMatch(client, /Schrödinger’s Problem and Entropic Transport/);
  assert.doesNotMatch(client, /Mean-Field Schrödinger Problems: A Survey/);
  assert.match(css, /grounded, persistent learning paths/);
  assert.match(css, /\.v2-learning-resources/);
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
