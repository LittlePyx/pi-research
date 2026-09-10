import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
const source = fs.readFileSync(new URL('../app/api/monitor/route.ts', import.meta.url), 'utf8');
const expression = source.match(/CASE\s+WHEN i\.llm_recommended = 1[\s\S]+?END AS quality_stage/)?.[0];
assert.ok(expression);
test('library SQL displays the latest final verdict instead of a historical pending audit', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE monitored_papers(id TEXT,space_id TEXT); INSERT INTO monitored_papers VALUES ('paper','space');");
    db.exec("CREATE TABLE paper_insights(paper_id TEXT,analysis_source TEXT,llm_recommended INTEGER,verification_status TEXT,screening_reason TEXT); INSERT INTO paper_insights VALUES ('paper','deepseek_rejected',0,'degraded','Final evidence gate did not pass');");
    db.exec("CREATE TABLE recommendation_audit_events(id TEXT,space_id TEXT,paper_id TEXT,relevance_score INTEGER,quality_score INTEGER,decision TEXT,verification_status TEXT,screening_reason TEXT,is_paper INTEGER,reviewed_at TEXT);");
    const insert = db.prepare("INSERT INTO recommendation_audit_events VALUES (?,'space','paper',78,85,?,?,?,1,?)");
    const stage = () => db.prepare('SELECT ' + expression + ' FROM monitored_papers p JOIN paper_insights i ON i.paper_id=p.id').get().quality_stage;
    insert.run('older-pending','verification_pending','pending','Waiting','2026-09-10 07:00:00');
    assert.equal(stage(), 'reviewing');
    insert.run('final','evidence_rejected','degraded','Final evidence gate did not pass','2026-09-10 07:01:00');
    assert.equal(stage(), 'reviewed');
    insert.run('retry-same-second','verification_pending','pending','Waiting','2026-09-10 07:01:00');
    assert.equal(stage(), 'reviewing');
    insert.run('final-same-second','evidence_rejected','degraded','Final evidence gate did not pass','2026-09-10 07:01:00');
    assert.equal(stage(), 'reviewed');
    db.exec("UPDATE paper_insights SET analysis_source='deepseek_verification_pending'");
    assert.equal(stage(), 'reviewing');
    db.exec("UPDATE paper_insights SET analysis_source='deepseek',llm_recommended=1");
    assert.equal(stage(), 'recommended');
    assert.equal(db.prepare('SELECT count(*) n FROM recommendation_audit_events').get().n, 4, 'history is retained');
  } finally { db.close(); }
});
