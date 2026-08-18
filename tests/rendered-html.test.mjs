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
  assert.match(html, /DeepSeek Pro 审核后的真实论文/);
  assert.match(html, /近 14 天/);
  assert.match(html, /主打最新/);
  assert.match(html, /设置重点来源/);
  assert.match(html, /真实研究简报/);
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
  assert.match(route, /INSERT OR IGNORE INTO monitored_papers/);
  assert.match(route, /titleFingerprint/);
  assert.match(route, /reviewCandidates/);
  assert.match(route, /MONITOR_MODEL = "deepseek-v4-pro"/);
  assert.match(route, /response_format: \{ type: "json_object" \}/);
  assert.match(route, /thinking: \{ type: "enabled" \}/);
  assert.match(route, /max_tokens: 24000/);
  assert.match(route, /llm_recommended = 1/);
  assert.match(route, /discovering_\$\{horizon\.key\}/);
  assert.match(route, /updateRunPhase\(database, space\.id, "reviewing"/);
  assert.match(route, /updateRunPhase\(database, space\.id, "saving"/);
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
  assert.match(client, /libraryFilter/);
  assert.match(client, /reportedImpressions/);
  assert.match(client, /没有处理的论文不会消失/);
  assert.match(client, /rankedMonitorPapers/);
  assert.match(client, /openMonitorPaper/);
  assert.match(client, /为什么适合读/);
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
  assert.match(client, /v2-team-credit/);
  assert.match(sharePage, /share-product-mark/);
  assert.match(sharePage, /share-team-mark/);
  assert.match(layout, /icon: "\/pi-research-mark\.png"/);
  assert.match(css, /Pi Research V8 — official product and P&I Lab branding/);
});
