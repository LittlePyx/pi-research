import assert from "node:assert/strict";
import { glob } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";

test("built Worker admits aged learning work without deleting old verification drafts or history", { timeout: 60000 }, async () => {
  const serverDir = fileURLToPath(new URL("../dist/server/", import.meta.url));
  const modules = [];
  for await (const path of glob("**/*.js", { cwd: serverDir })) modules.push({ type: "ESModule", path: `${serverDir}${path}` });
  const entry = `import app from './index.js';
    export default { async fetch(request, env, ctx) {
      if (new URL(request.url).pathname === '/fixture') {
        return Response.json(await env.DB.batch((await request.json()).map(({sql, values=[]}) => env.DB.prepare(sql).bind(...values))));
      }
      return app.fetch(request, env, ctx);
    } };`;
  let outboundCount = 0;
  const mf = new Miniflare({
    host: "127.0.0.1", cf: false, d1Databases: ["DB"],
    compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], modulesRoot: serverDir,
    modules: [{ type: "ESModule", path: `${serverDir}carryover-fixture.js`, contents: entry }, ...modules],
    // Synthetic fixture only. Every outbound request is blocked below, so no
    // credential is read and no real model or provider can be contacted.
    bindings: { DEEPSEEK_API_KEY: ["sk", "nonfunctional-fixture-only"].join("-"), PI_DEVELOPMENT_UNBOUNDED: "1" },
    outboundService: async () => { outboundCount++; return new Response("fixture blocks network", { status: 503 }); },
  });
  const cookie = "pi_anonymous_workspace=carryover-fixture-0000000001";
  async function request(path, body, expected = 200) {
    const r = await mf.dispatchFetch(`http://localhost${path}`, {
      method: body ? "POST" : "GET", headers: { cookie, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await r.text();
    assert.equal(r.status, expected, raw.slice(0, 1200));
    return JSON.parse(raw);
  }
  const sql = (rows) => request("/fixture", rows);
  const insert = (table, value) => ({ sql: `INSERT INTO ${table} (${Object.keys(value).join(",")}) VALUES (${Object.keys(value).map(() => "?").join(",")})`, values: Object.values(value) });
  const sourceScanAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oldQueue = JSON.stringify({ pipelineVersion: "continuous-recommendation-v17-core-evidence", scanMode: "full",
    candidateIds: ["doi:old"], deepIds: ["doi:old"], deepCompletedIds: ["doi:old"],
    verificationIds: ["doi:old"], verificationDeferredIds: ["doi:old"], verificationAttempts: { "doi:old": 2 },
    screens: [{ canonicalId: "doi:old", isPaper: true, relevanceScore: 90, qualityScore: 85 }],
  });
  const abstractText = "This abstract describes Gaussian maximum entropy under a covariance constraint and states the assumptions and the proof method. It supplies structured evidence for a foundational information theory result.";
  try {
    await request("/api/learning-path?spaceId=missing", null, 404);
    await sql([
      insert("research_spaces", { id: "space", owner_user_id: "anonymous:carryover-fixture-0000000001", name: "Information theory", member_name: "Test" }),
      insert("monitor_runs", { id: "run", space_id: "space", status: "ready", last_run_at: sourceScanAt, last_user_activity_at: new Date().toISOString(), new_count: 1, scanned_count: 200 }),
      insert("monitor_scan_jobs", { id: "old-job", space_id: "space", status: "ready", checkpoint: "complete", attempt: 14, work_queue_json: oldQueue, started_at: sourceScanAt }),
      ...["old", "learning", "accepted", "ignored"].flatMap((id) => [
        insert("monitored_papers", { id, space_id: "space", canonical_id: `doi:${id}`, title: `Gaussian maximum entropy ${id}`, url: `https://example.org/${id}`, horizon: "years", source: "crossref", relevance_score: 85 }),
        insert("paper_insights", { paper_id: id, space_id: "space", abstract_text: abstractText, quality_score: 85, llm_relevance_score: 90,
          analysis_model: id === "old" ? "deepseek-v4-pro" : "", analysis_source: id === "old" ? "deepseek_verification_pending" : "metadata",
          summary_en: id === "old" ? "Keep this complete saved draft." : "", verification_status: id === "old" ? "pending" : "not_required",
          verification_json: id === "old" ? '{"correctionRequested":true,"savedDraftRevision":7}' : "{}", ever_recommended: id === "accepted" ? 1 : 0 }),
      ]),
      insert("monitor_candidate_sources", { id: "learning-source", space_id: "space", paper_id: "learning", source_key: "research-route:learning", channel: "topic", query_key: "fixture-foundation", first_seen_at: sourceScanAt }),
      insert("paper_feedback", { id: "ignored-feedback", space_id: "space", paper_id: "ignored", feedback: "not_relevant" }),
      insert("paper_reading_progress", { id: "reading", space_id: "space", paper_id: "accepted", status: "read", note: "Keep this reading note." }),
    ]);
    const before = (await sql([
      { sql: "SELECT * FROM paper_insights ORDER BY paper_id" },
      { sql: "SELECT * FROM paper_feedback ORDER BY id" },
      { sql: "SELECT * FROM paper_reading_progress ORDER BY id" },
    ])).map((r) => r.results);
    const starts = await Promise.all([0, 1].map(() => request("/api/monitor", { spaceId: "space", action: "start", trigger: "scheduled" }, 202)));
    const owner = starts.find((r) => r.monitor.leaseOwner);
    assert.ok(owner, "one caller acquires the existing global monitor lease");
    const jobs = (await sql([{ sql: "SELECT id, checkpoint, work_queue_json FROM monitor_scan_jobs ORDER BY id" }]))[0].results;
    assert.equal(jobs.length, 2, "concurrent starts create only one new job");
    assert.equal(jobs.find((j) => j.id === "old-job").work_queue_json, oldQueue);
    const next = jobs.find((j) => j.id !== "old-job");
    assert.equal(next.checkpoint, "deduplicating", "old code only resumed verifying_recommendations");
    assert.equal(JSON.parse(next.work_queue_json).scanMode, "quality_queue");
    assert.deepEqual(new Set(JSON.parse(next.work_queue_json).discoveredCandidateIds), new Set(["doi:old", "doi:learning"]));
    const monitor = owner.monitor;
    await request("/api/monitor", { spaceId: "space", action: "advance", jobId: next.id, leaseToken: monitor.leaseToken, leaseGeneration: monitor.leaseGeneration }, 202);
    const selected = JSON.parse((await sql([{ sql: "SELECT work_queue_json FROM monitor_scan_jobs WHERE id = ?", values: [next.id] }]))[0].results[0].work_queue_json);
    assert.ok(selected.candidateIds.includes("doi:learning"), "the new learning candidate receives a real screening slot");
    assert.ok(selected.candidateIds.includes("doi:old"), "the existing verification candidate remains addressable");
    assert.ok(selected.screens.some((s) => s.canonicalId === "doi:old"), "reuse its saved screen without another model call");
    assert.deepEqual((await sql([
      { sql: "SELECT * FROM paper_insights ORDER BY paper_id" },
      { sql: "SELECT * FROM paper_feedback ORDER BY id" },
      { sql: "SELECT * FROM paper_reading_progress ORDER BY id" },
    ])).map((r) => r.results), before, "admission cannot approve papers, mutate drafts, erase feedback or reading history");
    assert.equal((await sql([{ sql: "SELECT last_run_at FROM monitor_runs WHERE space_id = 'space'" }]))[0].results[0].last_run_at, sourceScanAt);
    assert.equal(outboundCount, 0, "admission and cached screening reuse need no external calls");
  } finally { await mf.dispose(); }
});
