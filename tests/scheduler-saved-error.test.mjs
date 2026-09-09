import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SCHEDULED_MONITOR_ERROR_SPACE_SQL, RECORD_MONITOR_ERROR_ATTEMPT_SQL,
  SCHEDULED_MONITOR_SPACE_SQL, SCHEDULED_MONITOR_INCIDENT_SPACE_SQL,
  mergeScheduledMonitorSpaces, scheduledMonitorProgressSnapshot,
} from '../lib/monitor-scheduler.mjs';

test('saved errors remain recoverable after alerts expire and failed attempts rotate', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE research_spaces (id TEXT PRIMARY KEY, owner_user_id TEXT);
      CREATE TABLE monitor_runs (space_id TEXT, status TEXT, error TEXT, active_job_id TEXT,
        automation_paused_at TEXT, last_user_activity_at TEXT, next_run_at TEXT,
        lock_expires_at TEXT, updated_at TEXT, last_run_at TEXT);
      CREATE TABLE monitor_reliability_events (id TEXT PRIMARY KEY, space_id TEXT, kind TEXT,
        stage TEXT, source TEXT, outcome TEXT, message TEXT, error_code TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO research_spaces VALUES ('busy', 'anonymous:busy');
      INSERT INTO monitor_runs VALUES ('busy', 'deep_reviewing', NULL, 'job', NULL,
        datetime('now'), NULL, NULL, datetime('now'), NULL);`);
    for (let n = 0; n < 6; n++) {
      db.prepare('INSERT INTO research_spaces VALUES (?, ?)').run(`old-${n}`, `anonymous:w-${n}`);
      db.prepare(`INSERT INTO monitor_runs VALUES (?, 'error', 'stale_scheduler_recovery', NULL,
        NULL, datetime('now','-3 days'), NULL, NULL, datetime('now','-2 days'), NULL)`).run(`old-${n}`);
      db.prepare(`INSERT INTO monitor_reliability_events (id,space_id,kind,outcome,error_code,created_at)
        VALUES (?,?,'monitor_operational_alert','failed','stale_scheduler_recovery',datetime('now','-2 days'))`).run(`alert-${n}`, `old-${n}`);
    }
    assert.equal(db.prepare(SCHEDULED_MONITOR_SPACE_SQL).get(1).id, 'busy');
    assert.equal(db.prepare(SCHEDULED_MONITOR_INCIDENT_SPACE_SQL).get(), undefined);
    const visited = [];
    for (let n = 0; n < 6; n++) {
      const selected = db.prepare(SCHEDULED_MONITOR_ERROR_SPACE_SQL).get();
      visited.push(selected.id);
      db.prepare(RECORD_MONITOR_ERROR_ATTEMPT_SQL).run(`attempt-${n}`, selected.id);
      // Simulate a failing start: leave status, checkpoint linkage and history unchanged.
      assert.deepEqual(mergeScheduledMonitorSpaces([{ id: 'busy' }, selected], selected).map(s => s.id), [selected.id, 'busy']);
    }
    assert.equal(new Set(visited).size, 6);
    assert.equal(db.prepare("SELECT count(*) AS n FROM monitor_runs WHERE error='stale_scheduler_recovery'").get().n, 6);
    assert.equal(db.prepare("SELECT count(*) AS n FROM monitor_reliability_events WHERE kind='monitor_operational_alert'").get().n, 6);
    db.exec(`UPDATE monitor_runs SET automation_paused_at=CURRENT_TIMESTAMP WHERE space_id='old-0';
      UPDATE monitor_runs SET last_user_activity_at=datetime('now','-8 days') WHERE space_id='old-1';
      UPDATE monitor_runs SET lock_expires_at=datetime('now','+1 hour') WHERE space_id='old-2';
      UPDATE monitor_runs SET next_run_at=datetime('now','+1 hour') WHERE space_id='old-3';
      UPDATE monitor_runs SET active_job_id='live-job' WHERE space_id='old-4';
      UPDATE research_spaces SET owner_user_id='signed-in:owner' WHERE id='old-5';`);
    assert.equal(db.prepare(SCHEDULED_MONITOR_ERROR_SPACE_SQL).get(), undefined);
    db.exec(`UPDATE research_spaces SET owner_user_id='anonymous:w-5' WHERE id='old-5';
      UPDATE monitor_runs SET error='deepseek_credential_invalid' WHERE space_id='old-5';`);
    assert.equal(db.prepare(SCHEDULED_MONITOR_ERROR_SPACE_SQL).get(), undefined);
  } finally { db.close(); }
});

test('saved provider timeout receives a recovery slot while healthy active work continues', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE research_spaces (id TEXT PRIMARY KEY, owner_user_id TEXT);
      CREATE TABLE monitor_runs (space_id TEXT, status TEXT, error TEXT, active_job_id TEXT,
        automation_paused_at TEXT, last_user_activity_at TEXT, next_run_at TEXT,
        lock_expires_at TEXT, updated_at TEXT, last_run_at TEXT);
      CREATE TABLE monitor_reliability_events (id TEXT, space_id TEXT, kind TEXT, created_at TEXT);
      INSERT INTO research_spaces VALUES ('busy', 'anonymous:busy'), ('timeout', 'anonymous:timeout');
      INSERT INTO monitor_runs VALUES ('busy', 'deep_reviewing', NULL, 'job', NULL,
        CURRENT_TIMESTAMP, datetime('now','-1 minute'), NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO monitor_runs VALUES ('timeout', 'error', 'The operation was aborted due to timeout', NULL, NULL,
        CURRENT_TIMESTAMP, datetime('now','-1 minute'), NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`);
    const normal = db.prepare(SCHEDULED_MONITOR_SPACE_SQL).all(1);
    assert.equal(normal[0].id, 'busy');
    const recovery = db.prepare(SCHEDULED_MONITOR_ERROR_SPACE_SQL).get();
    assert.equal(recovery?.id, 'timeout');
    assert.deepEqual(mergeScheduledMonitorSpaces(normal, recovery).map(row => row.id), ['timeout', 'busy']);
    for (const error of ['deepseek_credential_invalid', 'deepseek_insufficient_balance', 'unexpected error']) {
      db.prepare("UPDATE monitor_runs SET error = ? WHERE space_id = 'timeout'").run(error);
      assert.equal(db.prepare(SCHEDULED_MONITOR_ERROR_SPACE_SQL).get(), undefined);
    }
  } finally { db.close(); }
});

test('progress snapshots retain job identity and unknown counts without lease or response data', () => {
  assert.equal(scheduledMonitorProgressSnapshot(null), null);
  const job = { id: 'job-a', checkpoint: 'deep_reviewing', discoveredCount: 320, reviewedCount: 4, recommendedCount: 0, leaseToken: 'fixture-private-value' };
  assert.deepEqual(scheduledMonitorProgressSnapshot(job), { jobId: 'job-a', checkpoint: 'deep_reviewing', discoveredCount: 320, reviewedCount: 4, recommendedCount: 0 });
  assert.equal(scheduledMonitorProgressSnapshot({ id: 'job-b', reviewedCount: -1 }).reviewedCount, null);
  assert.equal(scheduledMonitorProgressSnapshot({ id: 'job-b' }).recommendedCount, null);
  assert.equal(job.leaseToken, 'fixture-private-value');
});

test('worker uses the spare incident slot and records attempts only when monitor work runs', async () => {
  const worker = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8');
  assert.match(worker, /savedErrorRecoverySpace = incidentRecoverySpace \? null/);
  assert.match(worker, /incidentRecoverySpace \|\| savedErrorRecoverySpace/);
  const map = worker.slice(worker.indexOf('Promise.allSettled(monitorSpaces.map'));
  assert.ok(map.indexOf('RECORD_MONITOR_ERROR_ATTEMPT_SQL') < map.indexOf('handler.fetch'));
  assert.match(map, /recordProgress\("start", state.monitor.scanJob\)/);
  assert.match(map, /recordProgress\("advance", state.monitor.scanJob\)/);
});
