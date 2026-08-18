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
  const [route, profiles, repository, css, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
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
  assert.doesNotMatch(route, /fallbackInsight/);
  assert.match(profiles, /IEEE Transactions on Information Theory/);
  assert.match(profiles, /International Conference on Machine Learning/);
  assert.match(repository, /idx_monitored_papers_space_canonical/);
  assert.match(repository, /idx_monitor_preferences_space/);
  assert.match(repository, /paper_insights/);
  assert.match(repository, /llm_recommended/);
  assert.match(repository, /idx_paper_insights_space_recommended_quality/);
  assert.match(css, /Pi Research V3 — readable type and live discovery monitor/);
  assert.match(css, /\.v2-app \{ font-size: 16px; \}/);
  assert.doesNotMatch(client, /DEMO ANALYSIS CARDS|演示分析卡/);
  assert.match(client, /rankedMonitorPapers/);
  assert.match(client, /openMonitorPaper/);
  assert.match(client, /为什么适合读/);
});
