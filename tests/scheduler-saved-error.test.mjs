import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import {
  SCHEDULED_MONITOR_ERROR_SPACE_SQL, RECORD_MONITOR_ERROR_ATTEMPT_SQL,
  SCHEDULED_MONITOR_SPACE_SQL, SCHEDULED_MONITOR_INCIDENT_SPACE_SQL,
  mergeScheduledMonitorSpaces, scheduledMonitorProgressSnapshot,
} from '../lib/monitor-scheduler.mjs';

const jobsSchema = `CREATE TABLE monitor_scan_jobs (id TEXT PRIMARY KEY, space_id TEXT, status TEXT,
  checkpoint TEXT, failure_kind TEXT, error TEXT, next_retry_at TEXT, work_queue_json TEXT, started_at TEXT)`;

test('saved errors remain recoverable after alerts expire and failed attempts rotate', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(jobsSchema);
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
    db.exec(jobsSchema);
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

test('a due persisted D1 finalization retry gets the existing repair slot without bypassing recovery boundaries', () => {
  const db = new DatabaseSync(':memory:');
  const error = 'D1_ERROR: UNIQUE constraint failed: reading_calendar_events.space_id, reading_calendar_events.day';
  try {
    db.exec(jobsSchema);
    db.exec(`CREATE TABLE research_spaces (id TEXT PRIMARY KEY, owner_user_id TEXT);
      CREATE TABLE monitor_runs (space_id TEXT, status TEXT, error TEXT, active_job_id TEXT,
        automation_paused_at TEXT, last_user_activity_at TEXT, next_run_at TEXT,
        lock_expires_at TEXT, updated_at TEXT, last_run_at TEXT);
      CREATE TABLE monitor_reliability_events (id TEXT, space_id TEXT, kind TEXT, created_at TEXT);
      INSERT INTO research_spaces VALUES ('busy','anonymous:busy'),('saved','anonymous:saved');
      INSERT INTO monitor_runs VALUES ('busy','deep_reviewing',NULL,'live',NULL,CURRENT_TIMESTAMP,NULL,NULL,CURRENT_TIMESTAMP,NULL);
      INSERT INTO monitor_runs VALUES ('saved','error',NULL,NULL,NULL,datetime('now','-6 days'),datetime('now','-1 minute'),NULL,CURRENT_TIMESTAMP,NULL);`);
    db.prepare("UPDATE monitor_runs SET error=? WHERE space_id='saved'").run(error);
    db.prepare(`INSERT INTO monitor_scan_jobs VALUES('checkpoint','saved','error','retry_pending','stage_failed',?,
      datetime('now','-1 minute'),'{}',datetime('now','-2 hours'))`).run(error);
    const savedWork = JSON.stringify({resumeCheckpoint:'finalizing',deepCompletedIds:['paper-a','paper-b'],verificationCompletedIds:['paper-a']});
    db.prepare("UPDATE monitor_scan_jobs SET work_queue_json=?").run(savedWork);
    const select = () => db.prepare(SCHEDULED_MONITOR_ERROR_SPACE_SQL).get();
    assert.equal(db.prepare(SCHEDULED_MONITOR_SPACE_SQL).get(1).id,'busy');
    assert.equal(select()?.id,'saved');
    assert.deepEqual(mergeScheduledMonitorSpaces([{id:'busy'}],select()).map(s=>s.id),['saved','busy']);
    const jobBefore = db.prepare('SELECT * FROM monitor_scan_jobs').get();
    for (const [field,value] of [['automation_paused_at','2099-01-01'],['last_user_activity_at','2000-01-01'],['next_run_at','2099-01-01'],['lock_expires_at','2099-01-01'],['active_job_id','new-owner']]) {
      const before=db.prepare(`SELECT ${field} value FROM monitor_runs WHERE space_id='saved'`).get().value;
      db.prepare(`UPDATE monitor_runs SET ${field}=? WHERE space_id='saved'`).run(value);
      assert.equal(select(),undefined,field);
      db.prepare(`UPDATE monitor_runs SET ${field}=? WHERE space_id='saved'`).run(before);
    }
    for (const [field,value] of [['space_id','other'],['status','ready'],['checkpoint','main_complete'],['failure_kind','insufficient_balance'],['next_retry_at','2099-01-01'],['work_queue_json','bad json'],['work_queue_json','{"resumeCheckpoint":"deep_reviewing"}']]) {
      const before=db.prepare(`SELECT ${field} value FROM monitor_scan_jobs`).get().value;
      db.prepare(`UPDATE monitor_scan_jobs SET ${field}=?`).run(value);
      assert.equal(select(),undefined,field);
      db.prepare(`UPDATE monitor_scan_jobs SET ${field}=?`).run(before);
    }
    for (const value of ['deepseek_credential_invalid','deepseek_insufficient_balance','unexpected error','D1XERROR: unexpected']) {
      db.prepare("UPDATE monitor_runs SET error=? WHERE space_id='saved'").run(value);
      assert.equal(select(),undefined);
    }
    db.prepare("UPDATE monitor_runs SET error=? WHERE space_id='saved'").run(error);
    assert.equal(select()?.id,'saved');
    db.exec("INSERT INTO monitor_scan_jobs VALUES('newer','saved','ready','main_complete','',NULL,NULL,'{}',CURRENT_TIMESTAMP)");
    assert.equal(select(),undefined,'a superseded checkpoint cannot be scheduled');
    assert.deepEqual(db.prepare("SELECT * FROM monitor_scan_jobs WHERE id='checkpoint'").get(),jobBefore,'selection never changes work or retry time');
  } finally {db.close();}
});

test('progress snapshots retain job identity and unknown counts without lease or response data', () => {
  assert.equal(scheduledMonitorProgressSnapshot(null), null);
  const job = { id: 'job-a', checkpoint: 'deep_reviewing', discoveredCount: 320, reviewedCount: 4, recommendedCount: 0, leaseToken: 'fixture-private-value' };
  assert.deepEqual(scheduledMonitorProgressSnapshot(job), { jobId: 'job-a', checkpoint: 'deep_reviewing', discoveredCount: 320, reviewedCount: 4, recommendedCount: 0 });
  assert.equal(scheduledMonitorProgressSnapshot({ id: 'job-b', reviewedCount: -1 }).reviewedCount, null);
  assert.equal(scheduledMonitorProgressSnapshot({ id: 'job-b' }).recommendedCount, null);
  assert.equal(job.leaseToken, 'fixture-private-value');
});

test('the finalization recovery query executes in D1 with guarded checkpoint JSON', {timeout:30000}, async () => {
  const mf = new Miniflare({cf:false,modules:true,d1Databases:['DB'],script:`export default {
    async fetch(r,e) {
      try { const statements = (await r.json()).map(sql=>e.DB.prepare(sql)); return Response.json(await e.DB.batch(statements)); }
      catch(error) { return Response.json({error:error.message},{status:500}); }
    }
  }`});
  const run = async sql => {
    const r = await mf.dispatchFetch('http://localhost/fixture',{method:'POST',body:JSON.stringify(sql)});
    const result = await r.json(); assert.equal(r.status,200,JSON.stringify(result)); return result;
  };
  try {
    await run([jobsSchema,
      'CREATE TABLE research_spaces(id TEXT PRIMARY KEY,owner_user_id TEXT)',
      'CREATE TABLE monitor_runs(space_id TEXT,status TEXT,error TEXT,active_job_id TEXT,automation_paused_at TEXT,last_user_activity_at TEXT,next_run_at TEXT,lock_expires_at TEXT,updated_at TEXT)',
      'CREATE TABLE monitor_reliability_events(id TEXT,space_id TEXT,kind TEXT,created_at TEXT)',
      "INSERT INTO research_spaces VALUES('saved','anonymous:fixture')",
      "INSERT INTO monitor_runs VALUES('saved','error','D1_ERROR: fixture',NULL,NULL,CURRENT_TIMESTAMP,datetime('now','-1 minute'),NULL,CURRENT_TIMESTAMP)",
      `INSERT INTO monitor_scan_jobs VALUES('job','saved','error','retry_pending','stage_failed','D1_ERROR: fixture',datetime('now','-1 minute'),'{}',CURRENT_TIMESTAMP)`,
    ]);
    assert.equal((await run([SCHEDULED_MONITOR_ERROR_SPACE_SQL]))[0].results.length,0);
    await run([`UPDATE monitor_scan_jobs SET work_queue_json='{"resumeCheckpoint":"finalizing"}'`]);
    assert.equal((await run([SCHEDULED_MONITOR_ERROR_SPACE_SQL]))[0].results[0].id,'saved');
    await run(["UPDATE monitor_scan_jobs SET work_queue_json='not JSON'"]);
    assert.equal((await run([SCHEDULED_MONITOR_ERROR_SPACE_SQL]))[0].results.length,0);
  } finally {await mf.dispose();}
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
