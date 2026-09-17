import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DAILY_REVIEW_PROGRESS_SQL, dailyReviewTopupDue, needsDailyReviewTopup } from '../lib/daily-review-target.ts';
import { supplementaryReading } from '../lib/supplementary-reading.mjs';

test('daily depth counts distinct actual drafts by Shanghai day and space, not retries or verification', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE monitor_reliability_events(space_id TEXT,kind TEXT,created_at TEXT,metadata_json TEXT);
      CREATE TABLE monitor_scan_jobs(space_id TEXT,started_at TEXT,resume_of_job_id TEXT,work_queue_json TEXT);`);
    const event = db.prepare('INSERT INTO monitor_reliability_events VALUES (?,?,?,?)');
    for (const [space,kind,date,ids] of [
      ['mine','daily_deep_review_completed','2026-09-16 16:00:00',['a','b']],
      ['mine','daily_deep_review_completed','2026-09-17 02:00:00',['a']],
      ['other','daily_deep_review_completed','2026-09-17 02:00:00',['c']],
      ['mine','daily_deep_review_completed','2026-09-16 15:59:59',['yesterday']],
      ['mine','verification_completed','2026-09-17 02:00:00',['verified']]
    ]) event.run(space,kind,date,JSON.stringify({canonicalIds:ids}));
    const job = db.prepare('INSERT INTO monitor_scan_jobs VALUES (?,?,?,?)');
    job.run('mine','2026-09-17 00:00:00',null,'{"scanMode":"full"}');
    job.run('mine','2026-09-17 01:00:00','resume','{"scanMode":"full"}');
    job.run('mine','2026-09-17 02:00:00',null,'{"scanMode":"quality_queue"}');
    job.run('other','2026-09-17 02:00:00',null,'{}');
    const row = db.prepare(DAILY_REVIEW_PROGRESS_SQL).get('mine','2026-09-17','mine','2026-09-17');
    assert.equal(row.completed,2); assert.equal(row.discoveryRounds,1);
  } finally { db.close(); }
});

test('top-up is bounded by target, rounds, elapsed time and an explicit future backoff', () => {
  const now=Date.parse('2026-09-17T03:00:00Z');
  const progress={completed:0,target:5,discoveryRounds:1};
  assert.equal(dailyReviewTopupDue(progress,now,'2026-09-17 02:30:00','2026-09-17T03:00:00Z'),true);
  assert.equal(dailyReviewTopupDue(progress,now,'2026-09-17T02:45:00Z',null),false);
  assert.equal(dailyReviewTopupDue(progress,now,'2026-09-17T02:00:00Z','2026-09-17T04:00:00Z'),false);
  assert.equal(needsDailyReviewTopup({...progress,completed:5}),false);
  assert.equal(needsDailyReviewTopup({...progress,discoveryRounds:4}),false);
});

test('supplementary reading never promotes unreviewed, read, snoozed, duplicate or dismissed papers', () => {
  const p={id:'a',qualityStage:'recommended',readingStatus:'unread',userState:'unseen'};
  const rows=[p,p,{...p,id:'read',readingStatus:'read'},{...p,id:'candidate',qualityStage:'queued'},
    {...p,id:'dismissed',feedback:'not_relevant'},{...p,id:'later',userState:'snoozed'},
    {...p,id:'selected'},{...p,id:'b',readingStatus:'queued'}];
  assert.deepEqual(supplementaryReading(rows,['selected']).map(p=>p.id),['a','b']);
});
