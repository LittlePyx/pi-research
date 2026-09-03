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
  assert.doesNotMatch(app, /<details className="v2-learning-guidance">/);
  assert.match(app, /v2-learning-now-guidance/);
  assert.match(app, /learningEvidenceLabel/);
  assert.match(app, /<details className="v2-gap-query">/);
  assert.match(css, /\.v2-gap-discovery-status/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.v2-learning-now-guidance \{ grid-template-columns: 1fr/);
});

test("route workspace keeps one decision surface and moves supporting context behind calm navigation", async () => {
  const [app, css] = await Promise.all([readFile(appUrl, "utf8"), readFile(cssUrl, "utf8")]);
  const decisionPanel = app.slice(app.indexOf("function ResearchLeadDecisionPanel"), app.indexOf("function routeManagementNeedsAttention"));
  const workspace = app.slice(app.indexOf('{view === "thread-detail"'), app.indexOf('{view === "learn"'));

  assert.match(decisionPanel, /v2-research-decision-focus/);
  assert.match(decisionPanel, /v2-research-uncertainty/);
  assert.match(decisionPanel, /v2-research-decision-next/);
  assert.doesNotMatch(decisionPanel, /v2-research-decision-grid/);
  assert.match(workspace, /<details className="v2-route-summary">/);
  assert.match(workspace, /<nav className="v2-route-workspace-tabs"/);
  assert.doesNotMatch(workspace, /String\(tabIndex \+ 1\)/);
  assert.match(app, /useState\(Boolean\(proposed \|\| track\.monitoringStatus === "paused"\)\)/);
  assert.match(css, /@media \(max-width: 780px\)[\s\S]*\.v2-route-workspace-tabs \{ display: flex; overflow-x: auto;/);
});

test("route overview cards show one summary and one state-aware action", async () => {
  const app = await readFile(appUrl, "utf8");
  const routeOverview = app.slice(app.indexOf('{view === "threads"'), app.indexOf('{view === "thread-detail"'));
  const routeCards = routeOverview.slice(routeOverview.indexOf('<section className="v2-route-groups">'), routeOverview.indexOf('<details className="v2-route-map-assist">'));

  assert.match(routeCards, /const recoveryActionNeeded = \["queued", "retryable", "empty", "failed", "partial"\]/);
  assert.match(routeCards, /v2-route-gap-link compact/);
  assert.match(routeCards, /confirmedRouteEvidenceCount\(thread\)/);
  assert.doesNotMatch(routeCards, /thread\.intelligence\.assessment/);
  assert.doesNotMatch(routeCards, /v2-route-latest-change|<dl>/);
  assert.doesNotMatch(routeOverview, /<section className="v2-route-explorer-entry">/);
});

test("Today leads with selected reading while scan detail and secondary lists stay expandable", async () => {
  const app = await readFile(appUrl, "utf8");
  const today = app.slice(app.indexOf('{view === "today"'), app.indexOf('{view === "threads"'));
  const scanDetails = today.slice(today.indexOf('<details className="v2-scan-details">'), today.indexOf('</details>', today.indexOf('<details className="v2-scan-details">')));

  assert.doesNotMatch(today, /v2-today-briefing|v2-daily-brief-metrics/);
  assert.match(today, /v2-daily-paper-queue/);
  assert.match(today, /v2-monitor-run-funnel/);
  assert.match(scanDetails, /v2-monitor-run-funnel[\s\S]*v2-horizon-strip[\s\S]*v2-source-profile/);
  assert.match(today, /<details className="v2-route-changes v2-route-changes-compact">/);
  assert.match(today, /<details className="v2-today-more v2-today-more-compact">/);
});

test("library and paper detail keep reading primary while management and audit stay on demand", async () => {
  const [app, css] = await Promise.all([readFile(appUrl, "utf8"), readFile(cssUrl, "utf8")]);
  const library = app.slice(app.indexOf('{view === "library"'), app.indexOf('{view === "memory"'));
  const paperDetail = app.slice(app.indexOf('{view === "paper-detail"'), app.indexOf('</main>', app.indexOf('{view === "paper-detail"')));
  const paperHead = paperDetail.slice(paperDetail.indexOf('<section className="v2-paper-head">'), paperDetail.indexOf('<div className="v2-paper-detail-grid">'));

  assert.match(library, /<details className="v2-library-export">/);
  assert.match(library, /<details className="v2-library-paper-actions">/);
  assert.match(paperHead, /v2-paper-primary-actions/);
  assert.match(paperHead, /<details className="v2-paper-more-actions">/);
  assert.doesNotMatch(paperHead, /askAboutMonitorPaper/);
  assert.match(paperDetail, /v2-paper-fit-summary[\s\S]*<RouteImpactNote paper=\{selectedMonitorPaper\}[\s\S]*<details className="v2-paper-problem-impact">/);
  assert.match(paperDetail, /<details className="v2-content-section v2-paper-record">/);
  assert.doesNotMatch(paperDetail, /RouteImpactNote paper=\{selectedMonitorPaper\} locale=\{locale\} detail/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.v2-paper-top \{ align-items: flex-start; flex-wrap: wrap; \}/);
});

test("research memory separates explicit and inferred evidence while collapsing profile and note detail", async () => {
  const app = await readFile(appUrl, "utf8");
  const memory = app.slice(app.indexOf('{view === "memory"'), app.indexOf('{view === "paper-detail"'));
  const importModal = app.slice(app.indexOf('{importOpen &&'), app.indexOf('{feedbackDialog &&'));

  assert.match(memory, /你明确表达的/);
  assert.match(memory, /Pi 推断的/);
  assert.match(memory, /monitor\?\.readingMemories\?\.map[\s\S]*return <details className=\{memory\.analysisStatus\}/);
  assert.match(memory, /<details className="v2-memory-profile-details">/);
  assert.match(memory, /"建立你的研究画像" : "Build your research profile"/);
  assert.doesNotMatch(memory, /v2-import-safety-inline/);
  assert.match(importModal, /v2-import-warning[\s\S]*importSafetyTitle[\s\S]*v2-import-attestation/);
});

test("learning, demo, share, and modal copy keep product facts ahead of interface narration", async () => {
  const [app, demo, share] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(new URL("../app/demo/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/share/[token]/page.tsx", import.meta.url), "utf8"),
  ]);
  const learning = app.slice(app.indexOf('{view === "learn"'), app.indexOf('{view === "library"'));

  assert.match(app, /learnTitle: "学习路径"/);
  assert.match(learning, /"当前路径" : "CURRENT PATH"/);
  assert.doesNotMatch(learning, /证据驱动|Pi 正在规划|v2-learning-footer/);
  assert.match(demo, /index === 0 && <p>\{step\.detail\}<\/p>/);
  assert.match(demo, /公开演示 · 只读/);
  assert.doesNotMatch(share, /Pi · DeepSeek Pro/);
  assert.match(app, /"模型连接" : "MODEL CONNECTION"/);
  assert.doesNotMatch(app, /浏览器自带密钥|完善研究记忆/);
});

test("primary product copy states research content, status, and actions without interface narration", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /"今日" : "Today"/);
  assert.match(app, /"论文扫描" : "Paper scan"/);
  assert.match(app, /"部分路线待补充" : "Some routes need evidence"/);
  assert.match(app, /"待补证据" : "Missing evidence"/);
  assert.match(app, /"研究计划" : "Research plan"/);
  assert.match(app, /"研究记忆" : "Research memory"/);
  assert.doesNotMatch(app, /今天先处理什么|为什么今天没有推荐|三个时间窗，持续向前挖掘/);
  assert.doesNotMatch(app, /看清当前研究到哪里|部分路线处于诚实降级状态|缺什么，就继续找什么/);
  assert.doesNotMatch(app, /接下来可以阅读、追踪和验证什么|读过的论文正在改变后续推荐/);
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
