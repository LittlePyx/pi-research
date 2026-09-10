import assert from "node:assert/strict";
import { glob } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";
import { workbookSample, workbookSources } from "./fixtures/research-workbook.mjs";
import { workbookReviewFields } from "../lib/research-workbook.ts";

test("built workbook API checkpoints review, isolates owners and versions artifacts without research-state writes", { timeout: 60000 }, async t => {
  const serverDir = fileURLToPath(new URL("../dist/server/", import.meta.url));
  const modules = [];
  for await (const path of glob("**/*.js", { cwd: serverDir })) modules.push({ type: "ESModule", path: `${serverDir}${path}` });
  let calls = 0; let beforeReply = async () => {}; let invalidReview = false;
  const mf = new Miniflare({ host: "127.0.0.1", cf: false, d1Databases: ["DB"], compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
    bindings: { DEEPSEEK_API_KEY: "sk-isolated-fixture-not-a-real-key" }, modulesRoot: serverDir,
    modules: [{ type: "ESModule", path: `${serverDir}workbook-test-entry.js`, contents: `import app from './index.js'; export default { async fetch(request, env, ctx) {
      if (new URL(request.url).pathname === '/fixture') return Response.json(await env.DB.batch((await request.json()).map(({sql,values=[]}) => env.DB.prepare(sql).bind(...values))));
      return app.fetch(request,env,ctx); } };` }, ...modules],
    outboundService: async request => {
      if (new URL(request.url).hostname !== "api.deepseek.com") return new Response("No external access in fixture", { status: 503 });
      calls++; const input = JSON.parse((await request.json()).messages[1].content); await beforeReply();
      const output = input.requiredCheckIds ? { verdict: "supported", checks: workbookReviewFields(workbookSample()).map(id => ({ id,
        verdict: invalidReview && id === "comparison" ? "unsupported" : "supported", paperIds: workbookSources.map(s => s.id), reason: "Isolated deterministic review; not a live academic judgment." })) } : workbookSample();
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    },
  });
  let cookie = "pi_anonymous_workspace=workbook-fixture-owner-00001";
  const request = async (path, body, expected = 200) => {
    const response = await mf.dispatchFetch(`http://localhost${path}`, { method: body ? "POST" : "GET", headers: { cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const raw = await response.text(); assert.equal(response.status, expected, raw.slice(0, 2000)); return JSON.parse(raw);
  };
  const sql = statements => request("/fixture", statements);
  const insert = (table, values) => ({ sql: `INSERT INTO ${table} (${Object.keys(values).join(",")}) VALUES (${Object.keys(values).map(() => "?").join(",")})`, values: Object.values(values) });
  const base = { spaceId: "math", trackId: "kls" };
  const path = "/api/research-workbook?spaceId=math&trackId=kls";
  const post = (body, status) => request("/api/research-workbook", { ...base, ...body }, status);
  try {
    await request(path, null, 404);
    await sql([
      insert("research_spaces", { id: "math", owner_user_id: "anonymous:workbook-fixture-owner-00001", name: "KLS fixture", member_name: "Test" }),
      insert("research_tracks", { id: "kls", space_id: "math", title_zh: "KLS 条件比较", title_en: "KLS conditions comparison" }),
      ...workbookSources.flatMap(s => [
        insert("monitored_papers", { id: s.id, space_id: "math", canonical_id: s.canonicalId, title: s.title, authors: s.authors, url: s.url, horizon: "years" }),
        insert("paper_insights", { paper_id: s.id, space_id: "math", quality_score: 90, ever_recommended: 1, verification_status: "verified", abstract_text: s.abstractText }),
      ]),
      insert("monitored_papers", { id: "unreviewed", space_id: "math", canonical_id: "unreviewed", title: "KLS unreviewed", horizon: "years" }),
      insert("paper_insights", { paper_id: "unreviewed", space_id: "math", ever_recommended: 0, abstract_text: workbookSources[0].abstractText }),
    ]);
    await t.test("synthesis preparation identifies pending materials and manual problem definition needs no generated synthesis", async () => {
      await sql([insert("research_map_evidence_proposals", { id: "pending-material", space_id: "math", track_id: "kls", paper_id: workbookSources[0].id, status: "pending" })]);
      const synthesis = (await request("/api/research-synthesis?spaceId=math&trackId=kls")).synthesis;
      assert.equal(synthesis.canGenerate, false);
      assert.equal(synthesis.preparation[0].id, workbookSources[0].id);
      assert.equal(synthesis.preparation[0].state, "needs_confirmation");
      assert.equal(synthesis.preparation[0].hasGroundedEvidence, false);
      assert.equal(calls, 0);
      const defined = await request("/api/research-problem", { ...base, action: "confirm", question: "Which assumptions should I compare?", objective: "Inspect the two supplied papers", scope: "Only the supplied abstracts", successCriteria: "Record supported and missing assumptions", hypotheses: [] });
      assert.equal(defined.problemState.problem.status, "active");
      assert.equal(defined.problemState.problem.question, "Which assumptions should I compare?");
      assert.equal(calls, 0);
      await request("/api/research-synthesis?spaceId=other-owner&trackId=kls", null, 404);
    });
    let state;
    await t.test("reads never generate; approval and source identities are checked", async () => {
      assert.equal((await request(path)).workbook.candidates.length, 2); assert.equal(calls, 0);
      await post({ action: "prepare", paperIds: [workbookSources[0].id, "unreviewed"] }, 422);
      state = (await post({ action: "prepare", paperIds: workbookSources.map(s => s.id) })).workbook;
      assert.equal(state.status, "verifying"); assert.equal(state.content, null); assert.equal(calls, 1);
      assert.equal((await request(path)).workbook.status, "verifying"); assert.equal(calls, 1);
    });
    await t.test("independent review publishes one shared table, task and learning unit", async () => {
      state = (await post({ action: "advance", workbookId: state.id })).workbook;
      assert.equal(state.status, "ready"); assert.equal(state.content.comparison.status, "insufficient"); assert.equal(calls, 2);
      await post({ action: "prepare", paperIds: workbookSources.map(s => s.id) }); assert.equal(calls, 2);
    });
    await t.test("artifact saves use optimistic revisions and preserve reading/route states", async () => {
      const artifact = { observations: { "conditions:sample-klartag": "Need the stated assumptions" }, decision: "These excerpts are insufficient for direct comparison", unresolved: "Constant definitions" };
      const save = { action: "save-artifact", workbookId: state.id, sourceRevision: state.revision, baseRevision: 0, value: artifact };
      state = (await post(save)).workbook; assert.equal(state.artifact.revision, 1);
      await post(save, 409);
      const read = (await request(path)).workbook; assert.deepEqual(read.artifact.value, artifact);
      const rows = await sql([{ sql: "SELECT COUNT(*) AS n FROM paper_reading_progress" }, { sql: "SELECT COUNT(*) AS n FROM research_problems" }, { sql: "SELECT COUNT(*) AS n FROM research_track_papers" }]);
      assert.deepEqual(rows.map(r => r.results[0].n), [0, 1, 0]); // Only the explicitly confirmed fixture problem exists.
    });
    await t.test("same IDs cannot be read or written by another owner", async () => {
      cookie = "pi_anonymous_workspace=workbook-other-owner-0000001";
      await request(path, null, 404); await post({ action: "advance", workbookId: state.id }, 404);
      cookie = "pi_anonymous_workspace=workbook-fixture-owner-00001";
    });
    await t.test("source changes invalidate saved content and guard artifacts", async () => {
      await sql([{ sql: "UPDATE paper_insights SET abstract_text = abstract_text || ' Revised.' WHERE paper_id = ?", values: [workbookSources[0].id] }]);
      assert.equal((await request(path)).workbook.stale, true);
      await post({ action: "save-artifact", workbookId: state.id, sourceRevision: state.revision, baseRevision: 1, value: {} }, 409);
      state = (await post({ action: "prepare", paperIds: workbookSources.map(s => s.id) })).workbook;
      invalidReview = true;
      state = (await post({ action: "advance", workbookId: state.id })).workbook;
      assert.equal(state.status, "rejected"); assert.equal(state.content, null);
      invalidReview = false;
    });
    await t.test("a changed source during generation cannot publish a current result", async () => {
      await sql([{ sql: "UPDATE paper_insights SET abstract_text = abstract_text || ' Next.' WHERE paper_id = ?", values: [workbookSources[0].id] }]);
      beforeReply = async () => { await sql([{ sql: "UPDATE paper_insights SET ever_recommended = 0 WHERE paper_id = ?", values: [workbookSources[0].id] }]); };
      state = (await post({ action: "prepare", paperIds: workbookSources.map(s => s.id) })).workbook;
      assert.equal(state.stale, true); assert.equal(state.content, null);
    });
  } finally { await mf.dispose(); }
});
