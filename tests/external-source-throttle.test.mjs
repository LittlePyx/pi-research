import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { ExternalSourceCooldownError, fetchExternalSource } from "../lib/external-source-throttle.ts";

function d1Database(sqlite) {
  return {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...values) { bindings = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...bindings) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...bindings) }; },
        async run() {
          const result = sqlite.prepare(sql).run(...bindings);
          return { meta: { changes: Number(result.changes || 0) } };
        },
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}

function throttleDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE external_source_throttles (
      source_key TEXT PRIMARY KEY NOT NULL,
      failure_count INTEGER NOT NULL DEFAULT 0,
      next_allowed_at TEXT,
      last_status INTEGER NOT NULL DEFAULT 0,
      lease_token TEXT,
      lease_expires_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return sqlite;
}

test("a 429 opens one durable source circuit and blocks repeated requests", async () => {
  const sqlite = throttleDatabase();
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  let now = Date.parse("2026-08-27T10:00:00.000Z");
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(null, { status: 429, headers: { "Retry-After": "120" } });
  };
  try {
    const context = { database: d1Database(sqlite), sourceKey: "openalex", maxInlineWaitMs: 0, now: () => now };
    await assert.rejects(fetchExternalSource("https://api.openalex.org/works", {}, context), (error) => {
      assert.ok(error instanceof ExternalSourceCooldownError);
      assert.equal(error.retryAfterSeconds, 120);
      assert.equal(error.lastStatus, 429);
      return true;
    });
    await assert.rejects(fetchExternalSource("https://api.openalex.org/works", {}, context), ExternalSourceCooldownError);
    assert.equal(requestCount, 1);
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT source_key, failure_count, last_status, lease_token, lease_expires_at FROM external_source_throttles",
    ).get() }, {
      source_key: "openalex",
      failure_count: 1,
      last_status: 429,
      lease_token: null,
      lease_expires_at: null,
    });

    now += 121_000;
    globalThis.fetch = async () => {
      requestCount += 1;
      return Response.json({ results: [] });
    };
    const recovered = await fetchExternalSource("https://api.openalex.org/works", {}, context);
    assert.equal(recovered.status, 200);
    assert.equal(requestCount, 2);
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT failure_count, last_status, lease_token, lease_expires_at FROM external_source_throttles WHERE source_key = 'openalex'",
    ).get() }, { failure_count: 0, last_status: 200, lease_token: null, lease_expires_at: null });
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("one cooling provider does not block a healthy provider", async () => {
  const sqlite = throttleDatabase();
  const originalFetch = globalThis.fetch;
  let now = Date.parse("2026-08-27T10:00:00.000Z");
  globalThis.fetch = async (url) => String(url).includes("openalex")
    ? new Response(null, { status: 429, headers: { "Retry-After": "300" } })
    : Response.json({ message: "healthy" });
  try {
    const database = d1Database(sqlite);
    await assert.rejects(fetchExternalSource("https://api.openalex.org/works", {}, {
      database, sourceKey: "openalex", maxInlineWaitMs: 0, now: () => now,
    }), ExternalSourceCooldownError);
    const response = await fetchExternalSource("https://api.crossref.org/works", {}, {
      database, sourceKey: "crossref", maxInlineWaitMs: 0, now: () => now,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(sqlite.prepare(
      "SELECT source_key, failure_count, last_status FROM external_source_throttles ORDER BY source_key",
    ).all().map((row) => ({ ...row })), [
      { source_key: "crossref", failure_count: 0, last_status: 200 },
      { source_key: "openalex", failure_count: 1, last_status: 429 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("retryable server failures use a bounded retry and then recover", async () => {
  const sqlite = throttleDatabase();
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  let now = Date.parse("2026-08-27T10:00:00.000Z");
  globalThis.fetch = async () => {
    requestCount += 1;
    return requestCount === 1 ? new Response(null, { status: 503 }) : Response.json({ results: [] });
  };
  try {
    const response = await fetchExternalSource("https://api.openalex.org/works", {}, {
      database: d1Database(sqlite), sourceKey: "openalex", maxInlineWaitMs: 3_000,
      now: () => now, wait: async (milliseconds) => { now += milliseconds; },
    });
    assert.equal(response.status, 200);
    assert.equal(requestCount, 2);
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT failure_count, last_status FROM external_source_throttles WHERE source_key = 'openalex'",
    ).get() }, { failure_count: 0, last_status: 200 });
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("every production OpenAlex path uses the shared D1 source circuit", async () => {
  const [monitor, researchMap, researchNetwork, schema, repository] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-network/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /fetchExternalSource\(endpoint, options, \{ database, sourceKey: "openalex" \}\)/);
  assert.match(monitor, /fetchOpenAlexAbstracts\(database: D1Database/);
  assert.match(researchMap, /fetchOpenAlex\(database: D1Database/);
  assert.match(researchMap, /discoverCandidates\(database, \[direction\]/);
  assert.match(researchNetwork, /database: budget\.database, sourceKey: "openalex"/);
  assert.match(researchNetwork, /remaining: OPENALEX_CALL_LIMIT, database/);
  assert.match(researchNetwork, /if \(error instanceof ExternalSourceCooldownError\) circuitOpen = true/);
  assert.match(researchNetwork, /if \(circuitOpen\) break/);
  assert.match(schema, /external_source_throttles/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS external_source_throttles/);
});

test("the generated migration creates the durable source circuit lookup", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(await readFile(new URL("../drizzle/0048_dry_jazinda.sql", import.meta.url), "utf8"));
    const columns = sqlite.prepare("PRAGMA table_info(external_source_throttles)").all();
    assert.deepEqual(columns.map((column) => column.name), [
      "source_key", "failure_count", "next_allowed_at", "last_status",
      "lease_token", "lease_expires_at", "updated_at",
    ]);
    assert.equal(columns.find((column) => column.name === "source_key")?.pk, 1);
    const plan = sqlite.prepare(
      "EXPLAIN QUERY PLAN SELECT failure_count FROM external_source_throttles WHERE source_key = ?",
    ).all("openalex");
    assert.match(plan.map((row) => row.detail).join("\n"), /sqlite_autoindex_external_source_throttles_1/);
  } finally {
    sqlite.close();
  }
});
