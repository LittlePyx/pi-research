import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runLearningStageScheduler } from '../lib/learning-stage-scheduler.ts';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE research_spaces(id TEXT PRIMARY KEY, owner_user_id TEXT);
    CREATE TABLE learning_paths(id TEXT PRIMARY KEY, space_id TEXT, status TEXT);
    CREATE TABLE learning_path_steps(path_id TEXT, status TEXT);
    CREATE TABLE monitor_runs(space_id TEXT, automation_paused_at TEXT, last_user_activity_at TEXT);`);
  db.exec(readFileSync(new URL('../drizzle/0057_nervous_thanos.sql', import.meta.url), 'utf8'));
  for (const id of ['a', 'b', 'inactive', 'paused', 'superseded']) {
    db.prepare('INSERT INTO research_spaces VALUES (?, ?)').run(id, `anonymous:${id}`);
    db.prepare('INSERT INTO learning_paths VALUES (?, ?, ?)').run(id, id, id === 'superseded' ? 'superseded' : 'waiting_evidence');
    db.prepare("INSERT INTO learning_path_steps VALUES (?, 'pending')").run(id);
    db.prepare("INSERT INTO monitor_runs VALUES (?, ?, datetime('now', ?))").run(id, id === 'paused' ? 'paused' : null, id === 'inactive' ? '-8 days' : '-1 day');
  }
  const database = { prepare(sql) {
    const bound = (values = []) => ({
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; },
      async first() { return db.prepare(sql).get(...values) || null; },
    });
    return { ...bound(), bind: (...values) => bound(values) };
  } };
  return { db, database };
}

test('independent learning rotation serves both domains and excludes paused/inactive/superseded paths', async () => {
  const f = fixture();
  try {
    const visits = [];
    const dispatch = async item => { visits.push(item); return { ok: true, status: 'empty' }; };
    await runLearningStageScheduler({ database: f.database, dispatch, now: 1000 });
    await runLearningStageScheduler({ database: f.database, dispatch, now: 1000 });
    assert.deepEqual(visits.map(item => item.pathId), ['a', 'b']);
    assert.equal(visits[0].workspaceId, 'a');
    assert.equal((await runLearningStageScheduler({ database: f.database, dispatch, now: 2000 })).attempted, false);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM learning_stage_dispatches').get().n, 2);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM learning_path_steps').get().n, 5);
    assert.match(f.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM learning_stage_dispatches WHERE next_at <= ? AND lease_until <= ? ORDER BY next_at').get(1, 1).detail, /idx_learning_stage_dispatch_due/);
  } finally { f.db.close(); }
});

test('failure rotates away, preserves history and retries after backoff without retaining errors', async () => {
  const f = fixture();
  try {
    const failing = async () => { throw Error('private-response'); };
    assert.equal((await runLearningStageScheduler({ database: f.database, dispatch: failing, now: 1000 })).status, 'retryable');
    assert.equal((await runLearningStageScheduler({ database: f.database, dispatch: async () => ({ ok: true, status: 'attached' }), now: 2000 })).pathId, 'b');
    f.db.prepare("UPDATE monitor_runs SET automation_paused_at = 'paused' WHERE space_id = 'b'").run();
    assert.equal((await runLearningStageScheduler({ database: f.database, dispatch: failing, now: 3000 })).attempted, false);
    assert.equal((await runLearningStageScheduler({ database: f.database, dispatch: async () => ({ ok: true, status: 'empty' }), now: 302000 })).pathId, 'a');
    assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM learning_stage_dispatches').all()).includes('private-response'), false);
  } finally { f.db.close(); }
});

test('expired background lease can be reclaimed without accepting old completion', async () => {
  const f = fixture();
  try {
    f.db.prepare("UPDATE monitor_runs SET automation_paused_at = 'paused' WHERE space_id = 'b'").run();
    let release; let started = false;
    const gate = new Promise(resolve => { release = resolve; });
    const first = runLearningStageScheduler({ database: f.database, now: 1000, dispatch: async () => { started = true; await gate; return { ok: true, status: 'attached' }; } });
    while (!started) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal((await runLearningStageScheduler({ database: f.database, now: 2000, dispatch: async () => { throw Error('must not run'); } })).attempted, false);
    assert.equal((await runLearningStageScheduler({ database: f.database, now: 182000, dispatch: async () => ({ ok: true, status: 'empty' }) })).status, 'empty');
    release();
    assert.equal((await first).status, 'stale');
  } finally { f.db.close(); }
});

test('worker starts learning independently and waits for it before releasing the scheduler lease', () => {
  const source = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
  assert.match(source, /learningStageWork = trigger !== "visit_backstop"/);
  assert.match(source, /action: "review-stage"/);
  assert.ok(source.indexOf('const learningStageWork') < source.indexOf('routeIntelligence = await runScheduledResearchRouteIntelligence'));
  assert.match(source, /finally \{\s+await learningStageWork;/);
});
