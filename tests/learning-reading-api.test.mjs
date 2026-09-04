import assert from "node:assert/strict";
import { glob } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";
import { groundedStageEvidence } from "../lib/learning-stage-match.ts";

// The normal test command builds first. Run the same Worker, API handlers and
// schema bootstrap as production, in an isolated in-memory D1 with no model key.
test("learning → reading → stage → route runs through the built Worker and D1", { timeout: 60000 }, async (t) => {
  const serverDir = fileURLToPath(new URL("../dist/server/", import.meta.url));
  const modules = [];
  for await (const path of glob("**/*.js", { cwd: serverDir })) modules.push({ type: "ESModule", path: `${serverDir}${path}` });
  const entry = `import app from './index.js';
    export default { async fetch(request, env, ctx) {
      if (new URL(request.url).pathname === '/fixture') {
        try { return Response.json(await env.DB.batch((await request.json()).map(({sql, values=[]}) => env.DB.prepare(sql).bind(...values)))); }
        catch (error) { return Response.json({error:error.message}, {status:500}); }
      }
      return app.fetch(request, env, ctx);
    } };`;
  const mf = new Miniflare({
    host: "127.0.0.1", cf: false, d1Databases: ["DB"],
    compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
    modulesRoot: serverDir,
    modules: [{ type: "ESModule", path: `${serverDir}learning-test-entry.js`, contents: entry }, ...modules],
  });
  const cookie = "pi_anonymous_workspace=learning-loop-test-00000001";
  async function request(path, body, expected = 200, method = body ? "PATCH" : "GET") {
    const response = await mf.dispatchFetch(`http://localhost${path}`, {
      method, headers: { cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await response.text();
    assert.equal(response.status, expected, raw.slice(0, 2000));
    return JSON.parse(raw);
  }
  const sql = (statements) => request("/fixture", statements, 200, "POST");
  const insert = (table, values) => ({ sql: `INSERT INTO ${table} (${Object.keys(values).join(",")}) VALUES (${Object.keys(values).map(() => "?").join(",")})`, values: Object.values(values) });
  const states = async () => (await sql([
    { sql: "SELECT id, status, completed_at FROM learning_path_steps ORDER BY id" },
    { sql: "SELECT id, interaction_score FROM research_tracks ORDER BY id" },
    { sql: "SELECT paper_id, status, note FROM paper_reading_progress ORDER BY paper_id" },
    { sql: "SELECT COUNT(*) AS count FROM research_track_papers" },
  ])).map((entry) => entry.results);
  try {
    await request("/api/learning-path?spaceId=missing", null, 404); // Bootstrap real schema.
    await sql([
      ...["info", "math"].map((id) => insert("research_spaces", { id, owner_user_id: "anonymous:learning-loop-test-00000001", name: id, member_name: "Test" })),
      ...["info", "math"].map((id) => insert("research_tracks", { id: `track-${id}`, space_id: id, title_zh: id, title_en: id })),
      // Public paper metadata observed in the live paths; all IDs and actions below are fixtures.
      ...[
        ["info", "10.1109/tit.2026.3702694", "Rate-Distortion-Perception Trade-Off With Strong Realism Constraints: Role of Side Information and Common Randomness"],
        ["math", "10.1007/s13163-026-00575-7", "On stochastic forms of functional isoperimetric inequalities"],
      ].flatMap(([id, doi, title]) => {
        const resource = { id: `monitor:paper-${id}`, canonicalId: `doi:${doi}`, title, url: `https://doi.org/${doi}`, source: "daily-scan", qualification: "quality_approved" };
        return [
          insert("monitored_papers", { id: `paper-${id}`, space_id: id, canonical_id: resource.canonicalId, doi, title, url: resource.url, horizon: "years" }),
          insert("paper_insights", { paper_id: `paper-${id}`, space_id: id, quality_score: 90, ever_recommended: 1 }),
          insert("learning_paths", { id: `path-${id}`, space_id: id, target: id, target_track_id: `track-${id}`, title_zh: id, title_en: id, status: "active" }),
          insert("learning_path_steps", { id: `step-${id}`, space_id: id, path_id: `path-${id}`, kind: "method", title_zh: id, title_en: title, resources_json: JSON.stringify([resource]), status: "active" }),
          insert("learning_path_steps", { id: `gap-${id}`, space_id: id, path_id: `path-${id}`, title_zh: "缺口", title_en: "Gap", kind: "project", position: 1 }),
        ];
      }),
    ]);
    await t.test("nonempty paths open exact paper records without declaring them read", async () => {
      for (const space of ["info", "math"]) {
        const path = (await request(`/api/learning-path?spaceId=${space}`)).path;
        assert.equal(path.steps[0].resources[0].id, `monitor:paper-${space}`);
        assert.equal(path.steps[0].resources[0].readingStatus, "unread");
        const monitor = await request(`/api/monitor?spaceId=${space}&paperId=paper-${space}`);
        assert.ok(monitor.monitor.historyPapers.some((paper) => paper.id === `paper-${space}`));
      }
      assert.equal((await states())[2].length, 0);
    });
    await t.test("read is not mastered; mastery completes once and waits honestly at the next gap", async () => {
      for (const status of ["reading", "read"]) {
        await request("/api/library", { spaceId: "info", paperId: "paper-info", status, note: "Keep this reading note" });
        assert.equal((await request("/api/learning-path?spaceId=info")).path.steps[0].status, "active");
      }
      await request("/api/library", { spaceId: "info", paperId: "paper-info", status: "mastered", note: "Keep this reading note" });
      for (let repeat = 0; repeat < 2; repeat++) {
        const path = (await request("/api/learning-path?spaceId=info")).path;
        assert.equal(path.steps[0].status, "completed");
        assert.equal(path.status, "waiting_evidence");
      }
      const [, tracks, reading, evidence] = await states();
      assert.equal(tracks.find((track) => track.id === "track-info").interaction_score, 2);
      assert.equal(reading[0].note, "Keep this reading note");
      assert.equal(evidence[0].count, 0, "learning does not confirm formal route evidence");
    });
    await t.test("restoring an automatically completed stage is not immediately undone by mastery", async () => {
      const body = { spaceId: "info", pathId: "path-info", stepId: "step-info", completed: false };
      const restored = await request("/api/learning-path", body);
      assert.equal(restored.path.steps[0].status, "active");
      assert.equal((await request("/api/learning-path?spaceId=info")).path.steps[0].status, "active");
      await request("/api/learning-path", { ...body, completed: true });
      assert.equal((await states())[1].find((track) => track.id === "track-info").interaction_score, 2);
    });
    await t.test("manual completion preserves unread papers, history and one-time route weighting", async () => {
      const body = { spaceId: "math", pathId: "path-math", stepId: "step-math", completed: true };
      await request("/api/learning-path", body);
      await request("/api/learning-path", { ...body, completed: false });
      await request("/api/learning-path", body);
      const [, tracks, reading] = await states();
      assert.equal(tracks.find((track) => track.id === "track-math").interaction_score, 2);
      assert.equal(reading.length, 1);
      assert.equal(reading[0].paper_id, "paper-info");
      await request("/api/learning-path", { ...body, stepId: "gap-math" }, 409);
    });
    await t.test("foreign paper IDs and stage IDs cannot cross workspace boundaries", async () => {
      const before = await states();
      await request("/api/library", { spaceId: "math", paperId: "paper-info", status: "cited", note: "wrong space" }, 404);
      await request("/api/learning-path", { spaceId: "math", pathId: "path-info", stepId: "step-info", completed: true }, 404);
      const focused = await request("/api/monitor?spaceId=math&paperId=paper-info");
      assert.ok(focused.monitor.historyPapers.every((paper) => paper.id !== "paper-info"));
      assert.deepEqual(await states(), before);
    });
    await t.test("an older learning paper remains reachable beyond the archive display window", async () => {
      await sql([
        { sql: "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2001) INSERT INTO monitored_papers (id, space_id, canonical_id, title, horizon, discovered_at) SELECT 'new-'||x, 'info', 'new-'||x, 'New candidate '||x, 'today', '2099-01-01' FROM n" },
        { sql: "INSERT INTO paper_insights (paper_id, space_id) SELECT id, space_id FROM monitored_papers WHERE id LIKE 'new-%'" },
      ]);
      const unfocused = await request("/api/monitor?spaceId=info");
      assert.ok(!unfocused.monitor.historyPapers.some((paper) => paper.id === "paper-info"));
      const focused = await request("/api/monitor?spaceId=info&paperId=paper-info");
      assert.ok(focused.monitor.historyPapers.some((paper) => paper.id === "paper-info" && paper.readingNote === "Keep this reading note"));
      const counts = await sql([{ sql: "SELECT COUNT(*) AS count FROM monitored_papers WHERE space_id = 'info'" }]);
      assert.equal(counts[0].results[0].count, 2002);
    });
    await t.test("legacy stage mismatch stays supplementary, queues a named gap and survives regeneration", async () => {
      const resource = { id: "monitor:mismatch-paper", canonicalId: "doi:10.1016/j.jmaa.2026.130591", title: "On some Sobolev and Pólya-Szegö type inequalities with weights and applications", url: "https://doi.org/10.1016/j.jmaa.2026.130591", source: "daily-scan" };
      await sql([
        insert("research_spaces", { id: "mismatch", owner_user_id: "anonymous:learning-loop-test-00000001", name: "KLS", member_name: "Test" }),
        insert("research_tracks", { id: "mismatch-track", space_id: "mismatch", title_zh: "KLS", title_en: "KLS", search_queries: '["functional inequalities"]' }),
        insert("monitored_papers", { id: "mismatch-paper", space_id: "mismatch", canonical_id: resource.canonicalId, title: resource.title, url: resource.url, horizon: "years" }),
        insert("paper_insights", { paper_id: "mismatch-paper", space_id: "mismatch", quality_score: 99, ever_recommended: 1 }),
        insert("learning_paths", { id: "mismatch-path", space_id: "mismatch", target: "KLS", target_track_id: "mismatch-track", title_zh: "KLS", title_en: "KLS", status: "active" }),
        insert("learning_path_steps", { id: "mismatch-step", space_id: "mismatch", path_id: "mismatch-path", title_zh: "Eldan 随机局部化与 KLS 界", title_en: "Eldan stochastic localization and KLS bounds", kind: "milestone", resources_json: JSON.stringify([resource]), status: "active" }),
      ]);
      const state = await request("/api/learning-path?spaceId=mismatch");
      assert.equal(state.path.status, "waiting_evidence");
      assert.equal(state.path.steps[0].resources.length, 0);
      assert.equal(state.path.steps[0].supplementaryResources[0].id, "monitor:mismatch-paper");
      assert.match(state.path.steps[0].evidenceQuery, /Eldan stochastic localization/);
      assert.ok(state.path.steps[0].discovery);
      await request("/api/learning-path", { spaceId: "mismatch", pathId: "mismatch-path", stepId: "mismatch-step", completed: true }, 409);
      const raw = await sql([{ sql: "SELECT resources_json FROM learning_path_steps WHERE id = 'mismatch-step'" }]);
      assert.equal(raw[0].results[0].resources_json, JSON.stringify([resource]));
      const target = { kind: "milestone", titleZh: "Eldan 随机局部化与 KLS 界", titleEn: "Eldan stochastic localization and KLS bounds", goalZh: "", goalEn: "", readFocusZh: "", readFocusEn: "" };
      const primaryTitle = "Eldan stochastic localization and KLS bounds";
      const supported = { id: "monitor:matched-paper", canonicalId: "fixture:matched-paper", title: primaryTitle, url: "https://example.org/fixture", source: "daily-scan", stageEvidence: groundedStageEvidence(target, { title: primaryTitle, authors: "", abstractText: "" }, { role: "primary", quote: primaryTitle, reason: "This fixture directly represents the named primary milestone for persistence testing." }) };
      await sql([
        insert("monitored_papers", { id: "matched-paper", space_id: "mismatch", canonical_id: supported.canonicalId, title: primaryTitle, url: supported.url, horizon: "years" }),
        insert("paper_insights", { paper_id: "matched-paper", space_id: "mismatch", quality_score: 90, ever_recommended: 1 }),
        { sql: "UPDATE learning_path_steps SET resources_json = ? WHERE id = 'mismatch-step'", values: [JSON.stringify([resource, supported])] },
      ]);
      const matched = await request("/api/learning-path?spaceId=mismatch");
      assert.equal(matched.path.steps[0].resources[0].id, "monitor:matched-paper");
      assert.equal(matched.path.steps[0].supplementaryResources[0].id, "monitor:mismatch-paper");
      assert.equal(matched.path.steps[0].evidenceStatus, "ready");
      // A historical explicit completion is preserved, not erased by new matching rules.
      await sql([{ sql: "UPDATE learning_path_steps SET status = 'completed', completed_at = '2026-09-01' WHERE id = 'mismatch-step'" }]);
      const regenerated = await request("/api/learning-path", { spaceId: "mismatch", target: "KLS", trackId: "mismatch-track" }, 200, "POST");
      const retained = regenerated.path.steps.find((step) => step.kind === "milestone");
      assert.equal(retained.status, "completed");
      assert.equal(retained.supplementaryResources[0].id, "monitor:mismatch-paper");
      assert.equal(retained.completedAt, "2026-09-01");
      const previous = await sql([{ sql: "SELECT status FROM learning_paths WHERE id = 'mismatch-path'" }]);
      assert.equal(previous[0].results[0].status, "superseded");
    });
    await t.test("failed model replans preserve prior paths and fallback retries bypass the evidence cache", async () => {
      await sql([
        insert("research_spaces", { id: "retry-model", owner_user_id: "anonymous:learning-loop-test-00000001", name: "KLS retry fixture", member_name: "Test" }),
        ...[1, 2, 3].flatMap((n) => [
          insert("monitored_papers", { id: `retry-${n}`, space_id: "retry-model", canonical_id: `retry:${n}`, title: `KLS stochastic localization result ${n}`, url: `https://example.org/fixture-${n}`, horizon: "years" }),
          insert("paper_insights", { paper_id: `retry-${n}`, space_id: "retry-model", quality_score: 90, ever_recommended: 1 }),
        ]),
      ]);
      const body = { spaceId: "retry-model", target: "KLS" };
      const first = await request("/api/learning-path", body, 200, "POST");
      assert.equal(first.path.model, "evidence-structure-v1");
      const before = await sql([{ sql: "SELECT * FROM learning_paths WHERE space_id = 'retry-model'" }, { sql: "SELECT * FROM learning_path_steps WHERE space_id = 'retry-model'" }]);
      const failed = await request("/api/learning-path", body, 503, "POST");
      assert.equal(failed.code, "learning_model_retryable", "same source revision must not hide a retry behind HTTP 200");
      assert.deepEqual((await sql([{ sql: "SELECT * FROM learning_paths WHERE space_id = 'retry-model'" }, { sql: "SELECT * FROM learning_path_steps WHERE space_id = 'retry-model'" }])).map((r) => r.results), before.map((r) => r.results));
      // A successful model revision remains cacheable; a changed target that
      // cannot be planned must not replace it with an evidence-only skeleton.
      await sql([{ sql: "UPDATE learning_paths SET analysis_model = 'deepseek-v4-pro' WHERE id = ?", values: [first.path.id] }]);
      const reused = await request("/api/learning-path", body, 200, "POST");
      assert.equal(reused.path.id, first.path.id);
      await request("/api/learning-path", { ...body, target: "A different KLS research target" }, 503, "POST");
      const retained = await request("/api/learning-path?spaceId=retry-model");
      assert.equal(retained.path.id, first.path.id);
      assert.equal(retained.path.target, "KLS");
      assert.equal((await sql([{ sql: "SELECT COUNT(*) AS count FROM learning_paths WHERE space_id = 'retry-model'" }]))[0].results[0].count, 1);
    });
  } finally { await mf.dispose(); }
});
