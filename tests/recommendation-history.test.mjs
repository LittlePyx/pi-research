import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { mergeDailyBriefHistory } from "../lib/daily-brief-history.mjs";

test("a zero-yield rescan cannot erase papers selected earlier the same day", () => {
  const merged = mergeDailyBriefHistory({
    headlineZh: "较早简报",
    headlineEn: "Earlier brief",
    overviewZh: "较早概览。",
    overviewEn: "Earlier overview.",
    paperIds: ["paper-a", "paper-b"],
    signalsZh: ["变化 A", "变化 B"],
    signalsEn: ["Change A", "Change B"],
    readingPlanZh: ["读 A", "读 B"],
    readingPlanEn: ["Read A", "Read B"],
    watchlistZh: ["观察 A"],
    watchlistEn: ["Watch A"],
    metrics: { recommended: 2 },
  }, {
    headlineZh: "本轮 0 篇",
    headlineEn: "Zero this run",
    overviewZh: "本轮没有新增。",
    overviewEn: "No additions this run.",
    paperIds: [],
    signalsZh: [],
    signalsEn: [],
    readingPlanZh: [],
    readingPlanEn: [],
    watchlistZh: ["观察 B"],
    watchlistEn: ["Watch B"],
    metrics: { scanned: 300, recommended: 0 },
  });

  assert.deepEqual(merged.paperIds, ["paper-a", "paper-b"]);
  assert.deepEqual(merged.signalsZh, ["变化 A", "变化 B"]);
  assert.equal(merged.metrics.latestRecommended, 0);
  assert.equal(merged.metrics.recommended, 2);
  assert.match(merged.headlineZh, /累计保留 2 篇/);
});

test("durable recommendation history protects prior results and exposes saved verification candidates", () => {
  const route = fs.readFileSync(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  const repository = fs.readFileSync(new URL("../db/repository.ts", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../app/research-app.tsx", import.meta.url), "utf8");

  assert.match(repository, /ever_recommended INTEGER NOT NULL DEFAULT 0/);
  assert.match(repository, /WHERE audit\.space_id = paper_insights\.space_id[^]*audit\.recommended = 1/);
  assert.match(route, /CASE WHEN ever_recommended = 1 THEN analysis_source ELSE \? END/);
  assert.match(route, /paper_insights\.ever_recommended = 1 AND excluded\.ever_recommended = 0/);
  assert.match(route, /recommendationEligibility = explicitlyRestricted \? "1 = 1" : "COALESCE\(i\.ever_recommended, 0\) = 0"/);
  assert.match(route, /savedCandidatePapers/);
  assert.match(app, /Pi 正在后台完成/);
  assert.match(app, /暂时无响应时会从保存点自动续跑/);
});

test("the production review upsert cannot downgrade a previously published recommendation", () => {
  const route = fs.readFileSync(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  const match = route.match(/`INSERT INTO paper_insights\s*\(([^`]+?)\)\s*SELECT ([^`]+?)\s*WHERE \$\{monitorPaperNotDismissedSql\("\?", "\?"\)\}([^`]+?)`/);
  assert.ok(match, "paper insight upsert SQL must remain extractable for its regression test");
  const columns = match[1].split(",").map((column) => column.trim()).filter(Boolean);
  const sql = `INSERT INTO paper_insights (${match[1]}) SELECT ${match[2]} WHERE (? IS NOT NULL AND ? IS NOT NULL)${match[3]}`;
  assert.equal((sql.match(/\?/g) || []).length, columns.length + 2);

  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`CREATE TABLE paper_insights (${columns.map((column) => {
      if (column === "paper_id") return `${column} TEXT PRIMARY KEY`;
      if (["llm_recommended", "ever_recommended"].includes(column)) return `${column} INTEGER`;
      return `${column} TEXT`;
    }).join(", ")}, updated_at TEXT)`);
    const values = Object.fromEntries(columns.map((column) => [column, ""]));
    Object.assign(values, {
      paper_id: "paper-a", space_id: "space-a", summary_zh: "永久保留的正式解读",
      analysis_source: "deepseek", analysis_model: "deepseek-v4-pro", llm_recommended: 1,
      ever_recommended: 1, first_recommended_at: "2026-08-22T10:00:00Z", last_recommended_at: "2026-08-22T10:00:00Z",
    });
    const statement = sqlite.prepare(sql);
    statement.run(...columns.map((column) => values[column]), "space-a", "paper-a");
    Object.assign(values, {
      summary_zh: "后续重扫的拒绝结果", analysis_source: "deepseek_rejected", llm_recommended: 0,
      ever_recommended: 0, first_recommended_at: null, last_recommended_at: null,
    });
    statement.run(...columns.map((column) => values[column]), "space-a", "paper-a");
    const saved = sqlite.prepare("SELECT summary_zh, analysis_source, llm_recommended, ever_recommended FROM paper_insights WHERE paper_id = 'paper-a'").get();
    assert.deepEqual({ ...saved }, {
      summary_zh: "永久保留的正式解读", analysis_source: "deepseek", llm_recommended: 1, ever_recommended: 1,
    });
  } finally {
    sqlite.close();
  }
});

test("the durable-history migration restores recommendations overwritten before this fix", () => {
  const migration = fs.readFileSync(new URL("../drizzle/0037_brief_songbird.sql", import.meta.url), "utf8");
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE paper_insights (
        paper_id TEXT PRIMARY KEY, space_id TEXT, llm_recommended INTEGER DEFAULT 0,
        analysis_source TEXT DEFAULT 'deepseek_rejected', analysis_model TEXT DEFAULT 'deepseek-v4-pro',
        llm_relevance_score INTEGER DEFAULT 0, quality_score INTEGER DEFAULT 0,
        proposed_recommendation_tier TEXT DEFAULT 'browse', recommendation_tier TEXT DEFAULT 'browse',
        verification_status TEXT DEFAULT 'not_required'
      );
      CREATE TABLE recommendation_audit_events (
        id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT, recommended INTEGER, model TEXT,
        relevance_score INTEGER, quality_score INTEGER, recommendation_tier TEXT,
        verification_status TEXT, reviewed_at TEXT
      );
      INSERT INTO paper_insights VALUES ('paper-a', 'space-a', 0, 'deepseek_rejected', 'deepseek-v4-pro', 30, 40, 'browse', 'browse', 'degraded');
      INSERT INTO recommendation_audit_events VALUES ('audit-a', 'space-a', 'paper-a', 1, 'deepseek-v4-pro', 91, 88, 'must_read', 'verified', '2026-08-21 10:00:00');
    `);
    for (const statement of migration.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) sqlite.exec(statement);
    const restored = sqlite.prepare("SELECT llm_recommended, analysis_source, ever_recommended, llm_relevance_score, quality_score, recommendation_tier, verification_status, first_recommended_at, last_recommended_at FROM paper_insights WHERE paper_id = 'paper-a'").get();
    assert.deepEqual({ ...restored }, {
      llm_recommended: 1, analysis_source: "deepseek", ever_recommended: 1,
      llm_relevance_score: 91, quality_score: 88, recommendation_tier: "must_read",
      verification_status: "verified", first_recommended_at: "2026-08-21 10:00:00", last_recommended_at: "2026-08-21 10:00:00",
    });
  } finally {
    sqlite.close();
  }
});
