import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  claimResearchTrackIntelligence,
  completeResearchTrackIntelligence,
  deferResearchTrackIntelligence,
  requestResearchTrackIntelligenceRefresh,
  SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL,
} from "../lib/research-map-intelligence.ts";

function d1Database(sqlite) {
  return {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...values) { bindings = values; return statement; },
        async run() {
          const result = sqlite.prepare(sql).run(...bindings);
          return { meta: { changes: Number(result.changes) } };
        },
        async first() { return sqlite.prepare(sql).get(...bindings) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...bindings) }; },
      };
      return statement;
    },
  };
}

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE research_tracks (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, build_status TEXT NOT NULL DEFAULT 'ready',
      user_role TEXT NOT NULL DEFAULT 'explore', monitoring_status TEXT NOT NULL DEFAULT 'active', position INTEGER NOT NULL DEFAULT 0,
      intelligence_json TEXT NOT NULL DEFAULT '{}', intelligence_model TEXT NOT NULL DEFAULT '',
      intelligence_updated_at TEXT, intelligence_status TEXT NOT NULL DEFAULT 'pending',
      intelligence_attempt_count INTEGER NOT NULL DEFAULT 0, intelligence_error TEXT,
      intelligence_retry_at TEXT, intelligence_lock_token TEXT, intelligence_lock_expires_at TEXT,
      intelligence_refresh_requested_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE research_track_papers (
      id TEXT PRIMARY KEY, track_id TEXT NOT NULL, space_id TEXT NOT NULL,
      curation_status TEXT NOT NULL DEFAULT 'active'
    );
    INSERT INTO research_tracks (
      id, space_id, user_role, position, intelligence_json, intelligence_model,
      intelligence_updated_at, intelligence_status
    ) VALUES ('track-a', 'space-a', 'core', 0, '{"assessmentZh":"旧研判"}', 'old-model',
      '2026-08-26T00:00:00.000Z', 'pending');
    INSERT INTO research_track_papers VALUES ('paper-a', 'track-a', 'space-a', 'active');
  `);
  return { sqlite, database: d1Database(sqlite) };
}

test("a direction-intelligence lease has one winner and a failure preserves the saved assessment", async () => {
  const { sqlite, database } = fixture();
  try {
    const now = new Date("2026-08-27T00:00:00.000Z");
    const first = await claimResearchTrackIntelligence(database, "space-a", { now });
    assert.ok(first);
    assert.equal((await claimResearchTrackIntelligence(database, "space-a", { now })), null);

    const deferred = await deferResearchTrackIntelligence(database, {
      spaceId: "space-a", trackId: "track-a", lockToken: first.lockToken,
      attemptCount: first.attemptCount, errorCode: "intelligence_timeout", now,
    });
    assert.equal(deferred.changed, 1);
    const row = sqlite.prepare(
      "SELECT intelligence_json, intelligence_model, intelligence_updated_at, intelligence_status, intelligence_error, intelligence_retry_at FROM research_tracks",
    ).get();
    assert.equal(row.intelligence_json, '{"assessmentZh":"旧研判"}');
    assert.equal(row.intelligence_model, "old-model");
    assert.equal(row.intelligence_updated_at, "2026-08-26T00:00:00.000Z");
    assert.equal(row.intelligence_status, "retryable");
    assert.equal(row.intelligence_error, "intelligence_timeout");
    assert.equal(row.intelligence_retry_at, "2026-08-27T00:05:00.000Z");
  } finally {
    sqlite.close();
  }
});

test("an expired lease is recoverable and only its current token can complete", async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.prepare(
      "UPDATE research_tracks SET intelligence_status = 'running', intelligence_lock_token = 'expired', intelligence_lock_expires_at = '2026-08-26T23:59:00.000Z'",
    ).run();
    const claim = await claimResearchTrackIntelligence(database, "space-a", { now: new Date("2026-08-27T00:00:00.000Z") });
    assert.ok(claim);
    assert.notEqual(claim.lockToken, "expired");

    assert.equal(await completeResearchTrackIntelligence(database, {
      spaceId: "space-a", trackId: "track-a", lockToken: "expired",
      intelligenceJson: '{"assessmentZh":"错误覆盖"}', model: "wrong-model",
    }), 0);
    assert.equal(await completeResearchTrackIntelligence(database, {
      spaceId: "space-a", trackId: "track-a", lockToken: claim.lockToken,
      intelligenceJson: '{"assessmentZh":"新研判"}', model: "new-model",
    }), 1);
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT intelligence_json, intelligence_model, intelligence_status, intelligence_lock_token, intelligence_retry_at FROM research_tracks",
    ).get() }, {
      intelligence_json: '{"assessmentZh":"新研判"}',
      intelligence_model: "new-model",
      intelligence_status: "ready",
      intelligence_lock_token: null,
      intelligence_retry_at: null,
    });
  } finally {
    sqlite.close();
  }
});

test("requesting a refresh keeps old intelligence visible and makes the route claimable", async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.prepare("UPDATE research_tracks SET intelligence_status = 'ready'").run();
    assert.equal(await requestResearchTrackIntelligenceRefresh(
      database, "space-a", "track-a", new Date("2026-08-27T01:00:00.000Z"),
    ), 1);
    const row = sqlite.prepare(
      "SELECT intelligence_json, intelligence_status, intelligence_refresh_requested_at FROM research_tracks",
    ).get();
    assert.equal(row.intelligence_json, '{"assessmentZh":"旧研判"}');
    assert.equal(row.intelligence_status, "pending");
    assert.equal(row.intelligence_refresh_requested_at, "2026-08-27T01:00:00.000Z");
    assert.ok(await claimResearchTrackIntelligence(database, "space-a", {
      preferredTrackId: "track-a", now: new Date("2026-08-27T01:00:01.000Z"),
    }));
  } finally {
    sqlite.close();
  }
});

test("pausing a route blocks automatic intelligence work without clearing the saved assessment", async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.prepare("UPDATE research_tracks SET monitoring_status = 'paused', intelligence_status = 'ready' WHERE id = 'track-a'").run();
    assert.equal(await requestResearchTrackIntelligenceRefresh(
      database, "space-a", "track-a", new Date("2026-08-27T02:00:00.000Z"),
    ), 0);
    assert.equal(await claimResearchTrackIntelligence(database, "space-a", {
      preferredTrackId: "track-a", now: new Date("2026-08-27T02:00:01.000Z"),
    }), null);
    assert.deepEqual({ ...sqlite.prepare(
      "SELECT monitoring_status, intelligence_json, intelligence_status FROM research_tracks WHERE id = 'track-a'",
    ).get() }, {
      monitoring_status: "paused",
      intelligence_json: '{"assessmentZh":"旧研判"}',
      intelligence_status: "ready",
    });

    sqlite.prepare("UPDATE research_tracks SET monitoring_status = 'active' WHERE id = 'track-a'").run();
    assert.equal(await requestResearchTrackIntelligenceRefresh(
      database, "space-a", "track-a", new Date("2026-08-27T02:01:00.000Z"),
    ), 1);
  } finally {
    sqlite.close();
  }
});

test("the background selector prioritizes explicit refreshes and respects retry, activity, and visible-evidence gates", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_spaces (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL);
      CREATE TABLE monitor_runs (
        space_id TEXT PRIMARY KEY, automation_paused_at TEXT, last_user_activity_at TEXT
      );
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, build_status TEXT NOT NULL DEFAULT 'ready',
        user_role TEXT NOT NULL DEFAULT 'explore', monitoring_status TEXT NOT NULL DEFAULT 'active',
        position INTEGER NOT NULL DEFAULT 0, intelligence_json TEXT NOT NULL DEFAULT '{}',
        intelligence_updated_at TEXT, intelligence_status TEXT NOT NULL DEFAULT 'pending',
        intelligence_attempt_count INTEGER NOT NULL DEFAULT 0, intelligence_retry_at TEXT,
        intelligence_lock_expires_at TEXT, intelligence_refresh_requested_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE research_track_papers (
        id TEXT PRIMARY KEY, track_id TEXT NOT NULL, space_id TEXT NOT NULL,
        curation_status TEXT NOT NULL DEFAULT 'active'
      );
      INSERT INTO research_spaces VALUES
        ('space-a', 'anonymous:workspace-a'),
        ('space-fresher', 'anonymous:workspace-fresher'),
        ('space-paused', 'anonymous:workspace-paused'),
        ('space-inactive', 'anonymous:workspace-inactive');
      INSERT INTO monitor_runs VALUES
        ('space-a', NULL, datetime('now', '-10 minutes')),
        ('space-fresher', NULL, datetime('now')),
        ('space-paused', datetime('now'), datetime('now')),
        ('space-inactive', NULL, datetime('now', '-8 days'));
      INSERT INTO research_tracks
        (id, space_id, user_role, position, intelligence_json, intelligence_status,
         intelligence_attempt_count, intelligence_retry_at, intelligence_refresh_requested_at)
      VALUES
        ('initial-core', 'space-a', 'core', 0, '{}', 'pending', 0, NULL, NULL),
        ('confirmed-refresh', 'space-a', 'explore', 4, '{"assessmentZh":"旧研判"}', 'pending', 0, NULL, datetime('now', '-2 hours')),
        ('newer-refresh', 'space-fresher', 'core', 0, '{"assessmentZh":"较新研判"}', 'pending', 0, NULL, datetime('now', '-1 hour')),
        ('future-retry', 'space-a', 'core', 1, '{"assessmentZh":"保留"}', 'retryable', 5, datetime('now', '+1 hour'), datetime('now', '-1 hour')),
        ('no-evidence', 'space-a', 'core', 2, '{}', 'pending', 0, NULL, datetime('now')),
        ('paused-route', 'space-paused', 'core', 0, '{}', 'pending', 0, NULL, datetime('now')),
        ('inactive-route', 'space-inactive', 'core', 0, '{}', 'pending', 0, NULL, datetime('now'));
      INSERT INTO research_track_papers VALUES
        ('paper-initial', 'initial-core', 'space-a', 'active'),
        ('paper-confirmed', 'confirmed-refresh', 'space-a', 'active'),
        ('paper-newer', 'newer-refresh', 'space-fresher', 'active'),
        ('paper-future', 'future-retry', 'space-a', 'active'),
        ('paper-paused', 'paused-route', 'space-paused', 'active'),
        ('paper-inactive', 'inactive-route', 'space-inactive', 'active');
    `);
    const preferred = sqlite.prepare(SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL).get(1);
    assert.equal(preferred.track_id, "confirmed-refresh");
    assert.equal(preferred.refresh_requested, 1);

    sqlite.prepare("UPDATE research_tracks SET intelligence_status = 'ready', intelligence_json = '{\"assessmentZh\":\"新研判\"}', intelligence_updated_at = CURRENT_TIMESTAMP WHERE id = 'confirmed-refresh'").run();
    assert.equal(sqlite.prepare(SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL).get(1).track_id, "newer-refresh");

    sqlite.prepare("UPDATE research_tracks SET intelligence_status = 'ready', intelligence_json = '{\"assessmentZh\":\"较新完成\"}', intelligence_updated_at = CURRENT_TIMESTAMP WHERE id = 'newer-refresh'").run();
    assert.equal(sqlite.prepare(SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL).get(1).track_id, "initial-core");

    sqlite.prepare("UPDATE research_tracks SET intelligence_status = 'ready', intelligence_json = '{\"assessmentZh\":\"初始研判\"}', intelligence_updated_at = CURRENT_TIMESTAMP WHERE id = 'initial-core'").run();
    assert.equal(sqlite.prepare(SCHEDULED_RESEARCH_TRACK_INTELLIGENCE_SQL).get(1), undefined);
  } finally {
    sqlite.close();
  }
});

test("the additive migration backfills saved intelligence and leaves empty routes pending", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE research_tracks (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
        intelligence_json TEXT NOT NULL DEFAULT '{}', intelligence_updated_at TEXT
      );
      INSERT INTO research_tracks VALUES
       ('saved', 'space-a', 0, '{"assessmentZh":"已保存"}', '2026-08-26T00:00:00.000Z'),
       ('empty', 'space-a', 1, '{}', NULL);
    `);
    sqlite.exec((await readFile(new URL("../drizzle/0045_thin_ravenous.sql", import.meta.url), "utf8"))
      .replaceAll("--> statement-breakpoint", ""));
    assert.deepEqual(sqlite.prepare(
      "SELECT id, intelligence_status FROM research_tracks ORDER BY id",
    ).all().map((row) => ({ ...row })), [
      { id: "empty", intelligence_status: "pending" },
      { id: "saved", intelligence_status: "ready" },
    ]);
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS count FROM pragma_index_list('research_tracks') WHERE name = 'idx_research_tracks_intelligence_due'",
    ).get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("the API advances one durable job per bounded request and the page never drains the whole queue", async () => {
  const [route, app, feedback, evidence, curation, dismissal] = await Promise.all([
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/research-map-evidence.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/research-map-curation.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/research-network-dismissal.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(route.indexOf('payload.action === "advance-intelligence"') < route.indexOf("const hydrating ="));
  assert.match(route, /thinking: "disabled", timeoutMs: 36_000/);
  assert.match(route, /const preferredTrackId = payload\.trackId\?\.trim\(\) \|\| undefined/);
  assert.match(route, /payload\.action === "interpret" && preferredTrackId/);
  assert.match(app, /intelligencePass < 2/);
  assert.match(app, /action: "advance-intelligence"/);
  for (const source of [route, feedback, evidence, curation, dismissal]) {
    assert.doesNotMatch(source, /intelligence_json\s*=\s*'\{\}'/);
    assert.match(source, /intelligence_status\s*=\s*'pending'/);
  }
});
