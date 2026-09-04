import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

const route = await readFile(new URL("../app/api/learning-path/route.ts", import.meta.url), "utf8");
const repository = await readFile(new URL("../db/repository.ts", import.meta.url), "utf8");

function sqlConstant(name) {
  const match = route.match(new RegExp("const " + name + " = `([\\s\\S]*?)`;"));
  assert.ok(match, `${name} must come from the production query`);
  return match[1];
}

const tables = ["research_tracks", "research_track_papers", "monitored_papers", "paper_insights", "paper_reading_progress", "paper_feedback"];
const schema = ["CREATE TABLE research_spaces (id TEXT PRIMARY KEY)", ...tables.map((table) => {
  const match = [...repository.matchAll(/database\.prepare\("(CREATE TABLE IF NOT EXISTS [^"]*)"\)/g)]
    .find((item) => item[1].startsWith(`CREATE TABLE IF NOT EXISTS ${table} `));
  assert.ok(match, `${table} must use the existing schema`);
  return match[1];
})];

function insert(table, values) {
  return { sql: `INSERT INTO ${table} (${Object.keys(values).join(", ")}) VALUES (${Object.keys(values).map(() => "?").join(", ")})`, values: Object.values(values) };
}

function paper(id, overrides = {}) {
  return insert("monitored_papers", { id, space_id: "space-a", canonical_id: id, title: id, horizon: "years", url: `https://example.org/${id}`, ...overrides });
}

function routePaper(id, overrides = {}) {
  return insert("research_track_papers", { id: `route-${id}`, track_id: "track-a", space_id: "space-a", canonical_id: id, title: id, role: "foundation", ...overrides });
}

const fixtures = [
  insert("research_spaces", { id: "space-a" }), insert("research_spaces", { id: "space-b" }),
  ...["track-a", "track-bridge"].map((id) => insert("research_tracks", { id, space_id: "space-a", title_zh: id, title_en: id })),
  // Identity priority must not depend on insertion order or a title alias's ID.
  paper("a-title-alias", { title: "Canonical paper" }),
  paper("canonical", { canonical_id: "DOI:10.123/canonical", doi: "10.123/canonical", title: "Canonical paper" }),
  routePaper("canonical", { canonical_id: "doi:10.123/CANONICAL", doi: "10.123/canonical", title: "Canonical paper" }),
  paper("a-doi-title-alias", { title: "DOI paper" }),
  paper("doi-match", { canonical_id: "openalex:doi-match", doi: "10.123/doi", title: "DOI paper" }),
  routePaper("doi-match", { canonical_id: "legacy:doi", doi: "10.123/DOI", title: "DOI paper" }),
  paper("title-match", { title: " Title fallback " }), routePaper("title-match", { canonical_id: "", title: "title FALLBACK" }),
  paper("bridge"), routePaper("bridge", { track_id: "track-bridge" }),
  paper("waiting"), routePaper("waiting"),
  paper("dismissed"), routePaper("dismissed"),
  paper("inactive"), routePaper("inactive", { curation_status: "deactivated" }),
  paper("foreign", { space_id: "space-b" }), routePaper("foreign"),
  ...["a-title-alias", "canonical", "a-doi-title-alias", "doi-match", "title-match", "bridge", "waiting", "dismissed", "inactive", "foreign"].map((id) => insert("paper_insights", {
    paper_id: id, space_id: id === "foreign" ? "space-b" : "space-a", ever_recommended: id === "waiting" ? 0 : 1, quality_score: 85,
  })),
  insert("paper_feedback", { id: "feedback", space_id: "space-a", paper_id: "dismissed", feedback: "not_relevant" }),
  insert("paper_reading_progress", { id: "progress", space_id: "space-a", paper_id: "canonical", status: "reading", note: "Preserve my notes" }),
];

test("learning route SQL executes in D1 and preserves identity, quality gates and history", { timeout: 30000 }, async (t) => {
  // Execute through a Worker request, not node:sqlite: its newer SQLite accepts
  // correlated ORDER BY expressions that the deployed D1 engine rejects.
  const mf = new Miniflare({
    host: "127.0.0.1", cf: false, modules: true, d1Databases: ["DB"],
    script: `export default { async fetch(request, env) {
      try {
        const statements = await request.json();
        const results = await env.DB.batch(statements.map(({sql, values = []}) => env.DB.prepare(sql).bind(...values)));
        return Response.json(results);
      } catch (error) { return Response.json({error: error.message}, {status: 500}); }
    } };`,
  });
  async function execute(statements) {
    const response = await mf.dispatchFetch("http://localhost/query", { method: "POST", body: JSON.stringify(statements) });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  }
  const select = sqlConstant("routePaperSelect");
  const join = sqlConstant("routePaperJoin");
  const visible = sqlConstant("visibleRouteWhere");
  async function query(scope = "", values = []) {
    return (await execute([{ sql: `${select}${join} WHERE p.space_id = ?${scope}${visible} ORDER BY mp.id`, values: ["space-a", ...values] }]))[0].results;
  }
  try {
    await execute([...schema.map((sql) => ({ sql })), ...fixtures]);
    await t.test("target route prefers canonical identity, then DOI, then title", async () => {
      const rows = await query(" AND p.track_id = ?", ["track-a"]);
      assert.deepEqual(rows.map((row) => row.resource_id), ["monitor:canonical", "monitor:doi-match", "monitor:title-match"]);
      assert.equal(rows[0].reading_status, "reading");
      assert.ok(rows.every((row) => row.source === "research-map" && row.quality_score === 85));
    });
    await t.test("all-space and cross-direction queries retain their scope", async () => {
      assert.equal((await query()).length, 4);
      assert.deepEqual((await query(" AND p.track_id != ?", ["track-a"])).map((row) => row.resource_id), ["monitor:bridge"]);
      assert.deepEqual(await query(" AND p.track_id = ?", ["missing-track"]), []);
    });
    await t.test("repeat reads exclude pending, dismissed and deactivated evidence without erasing it", async () => {
      assert.deepEqual(await query(), await query());
      const results = await execute([
        { sql: "SELECT COUNT(*) AS count FROM monitored_papers" },
        { sql: "SELECT COUNT(*) AS count FROM research_track_papers" },
        { sql: "SELECT feedback FROM paper_feedback WHERE id = 'feedback'" },
        { sql: "SELECT status, note FROM paper_reading_progress WHERE id = 'progress'" },
      ]);
      assert.equal(results[0].results[0].count, 10);
      assert.equal(results[1].results[0].count, 8);
      assert.equal(results[2].results[0].feedback, "not_relevant");
      assert.deepEqual(results[3].results[0], { status: "reading", note: "Preserve my notes" });
    });
  } finally {
    await mf.dispose();
  }
});
