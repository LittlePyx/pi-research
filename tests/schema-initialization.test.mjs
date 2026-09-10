import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { schemaInitializer, SCHEMA_BOOTSTRAP_REVISION } from "../lib/schema-initialization.ts";

function database() {
  const state = { table: false, revision: null, reads: 0, writes: 0 };
  return { state, prepare(sql) {
    let values = [];
    return { bind(...args) { values = args; return this; },
      async first() { state.reads++; return sql.includes("sqlite_master") ? state.table ? { name: "pi_schema_bootstrap" } : null : state.revision === values[0] ? { revision: state.revision } : null; },
      async run() { state.writes++; if (sql.startsWith("CREATE")) state.table = true; else state.revision = values[0]; },
    };
  } };
}

test("schema initialization shares concurrent work and skips compatibility writes on warm and cold reads", async () => {
  const db = database(); let bootstraps = 0;
  const initialize = async () => { bootstraps++; };
  const ensure = schemaInitializer(initialize);
  await Promise.all([ensure(db), ensure(db), ensure(db)]);
  assert.equal(bootstraps, 1); assert.equal(db.state.revision, SCHEMA_BOOTSTRAP_REVISION);
  const before = { ...db.state }; await ensure(db); assert.deepEqual(db.state, before);
  await schemaInitializer(initialize)(db);
  assert.equal(bootstraps, 1); assert.equal(db.state.writes, before.writes);
  assert.equal(db.state.reads - before.reads, 2);
  const other = database(); await ensure(other); assert.equal(bootstraps, 2);
});

test("failed bootstrap is never marked ready and is retried; old revisions run new repairs", async () => {
  const db = database(); let attempts = 0;
  const ensure = schemaInitializer(async () => { if (++attempts === 1) throw new Error("interrupted migration"); });
  await assert.rejects(ensure(db), /interrupted/); assert.equal(db.state.revision, null);
  await ensure(db); assert.equal(attempts, 2);
  db.state.revision = "old";
  await schemaInitializer(async () => { attempts++; })(db);
  assert.equal(attempts, 3); assert.equal(db.state.revision, SCHEMA_BOOTSTRAP_REVISION);
});

test("paper audit lookup uses a paper-scoped index and preserves latest-event ordering", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE recommendation_audit_events (id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT, reviewed_at TEXT);
      CREATE INDEX idx_recommendation_audit_space_reviewed ON recommendation_audit_events(space_id, reviewed_at);
      INSERT INTO recommendation_audit_events VALUES ('old','s','p','2026-09-10 00:00:00'),('new','s','p','2026-09-10 00:00:00'),('other','s','q','2026-09-11 00:00:00');`);
    const query = "SELECT id FROM recommendation_audit_events WHERE space_id = ? AND paper_id = ? ORDER BY datetime(reviewed_at) DESC, rowid DESC LIMIT 1";
    const plan = () => db.prepare("EXPLAIN QUERY PLAN " + query).all("s", "p").map(row => row.detail).join("\n");
    assert.doesNotMatch(plan(), /space_id=\? AND paper_id=\?/);
    await db.exec(await readFile(new URL("../drizzle/0059_handy_smiling_tiger.sql", import.meta.url), "utf8"));
    assert.match(plan(), /idx_recommendation_audit_space_paper_reviewed.*space_id=\? AND paper_id=\?/);
    assert.equal(db.prepare(query).get("s", "p").id, "new");
  } finally { db.close(); }
});
