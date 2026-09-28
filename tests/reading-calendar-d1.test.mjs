import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { readingCalendarBootstrapSql } from '../lib/reading-calendar.ts';
import { monitorPaperNotDismissedSql } from '../lib/monitor-route-planning.ts';

const route = fs.readFileSync(new URL('../app/api/monitor/route.ts',import.meta.url),'utf8');
const match = route.match(/`INSERT INTO paper_insights\s*\(([^`]+?)\)\s*SELECT ([^`]+?)\s*WHERE \$\{monitorPaperNotDismissedSql\("\?", "\?"\)\}([^`]+?)`/);
assert.ok(match);
const columns = match[1].split(',').map(x=>x.trim());
const upsert = `INSERT INTO paper_insights (${match[1]}) SELECT ${match[2]} WHERE ${monitorPaperNotDismissedSql('?', '?')}${match[3]}`;
const snapshot = JSON.parse(fs.readFileSync(new URL('../drizzle/meta/0066_snapshot.json',import.meta.url),'utf8'));
const schema = Object.values(snapshot.tables.paper_insights.columns).map(c=>`${c.name} ${c.type}${c.primaryKey?' PRIMARY KEY':''}${c.notNull?' NOT NULL':''}${c.default!==undefined?' DEFAULT '+c.default:''}`);
const migration = fs.readFileSync(new URL('../drizzle/0067_calendar_trigger_idempotency.sql',import.meta.url),'utf8');
const oldMigration = fs.readFileSync(new URL('../drizzle/0065_fantastic_hercules.sql',import.meta.url),'utf8');
const split = sql=>sql.split('--> statement-breakpoint').map(sql=>({sql:sql.trim()})).filter(x=>x.sql);
function review(paperId, at) {
  const values = Object.fromEntries(columns.map(c=>[c,snapshot.tables.paper_insights.columns[c].type==='integer'?0:'']));
  Object.assign(values,{paper_id:paperId,space_id:'a',llm_recommended:1,ever_recommended:1,verification_status:'verified',analysis_source:'deepseek',summary_zh:'Preserved review',first_recommended_at:at,last_recommended_at:at});
  return {sql:upsert,values:[...columns.map(c=>values[c]),'a',paperId]};
}

test('D1 calendar triggers preserve a repeated production review upsert and the entire batch', {timeout:30000}, async () => {
  const mf = new Miniflare({cf:false,modules:true,d1Databases:['DB'],script:`export default {async fetch(r,e){try{return Response.json(await e.DB.batch((await r.json()).map(s=>e.DB.prepare(s.sql).bind(...(s.values||[])))))}catch(error){return Response.json({error:error.message},{status:500})}}}`});
  const execute = async (statements,status=200)=>{
    const r=await mf.dispatchFetch('http://localhost/fixture',{method:'POST',body:JSON.stringify(statements)});
    const data=await r.json(); assert.equal(r.status,status,JSON.stringify(data)); return data;
  };
  const query = async sql=>(await execute([{sql}]))[0].results;
  try {
    await execute([
      'CREATE TABLE research_spaces(id TEXT PRIMARY KEY)', "INSERT INTO research_spaces VALUES('a'),('b')",
      'CREATE TABLE monitored_papers(id TEXT PRIMARY KEY,space_id TEXT)', "INSERT INTO monitored_papers VALUES('p','a'),('q','a'),('foreign','b')",
      'CREATE TABLE paper_delivery_state(paper_id TEXT PRIMARY KEY,space_id TEXT,opened_at TEXT)',
      'CREATE TABLE paper_reading_progress(paper_id TEXT PRIMARY KEY,space_id TEXT,status TEXT,completed_at TEXT)',
      `CREATE TABLE paper_insights(${schema.join(',')})`,
      'CREATE TABLE paper_feedback(space_id TEXT,paper_id TEXT,feedback TEXT)',
      'CREATE TABLE paper_engagement_events(id TEXT PRIMARY KEY,space_id TEXT,paper_id TEXT,kind TEXT,occurred_at TEXT)',
      'CREATE TABLE monitor_daily_briefs(space_id TEXT,paper_ids TEXT,brief_date TEXT,created_at TEXT)',
    ].map(sql=>({sql})));
    await execute(split(oldMigration));
    await execute([review('p','2026-09-28T02:00:00Z')]);
    const original = (await query('SELECT * FROM reading_calendar_events'))[0];
    const failed = await execute([review('q','2026-09-28T03:00:00Z'),review('p','2026-09-28T03:00:00Z')],500);
    assert.match(failed.error,/UNIQUE constraint failed: reading_calendar_events/);
    assert.equal((await query("SELECT COUNT(*) n FROM paper_insights WHERE paper_id='q'"))[0].n,0,'old trigger rolls back unrelated result in same batch');
    await execute(split(migration));
    assert.deepEqual(await query('SELECT * FROM reading_calendar_events'),[original],'migration preserves history');
    await execute([review('q','2026-09-28T03:00:00Z'),review('p','2026-09-28T03:00:00Z')]);
    assert.equal((await query('SELECT COUNT(*) n FROM paper_insights'))[0].n,2);
    assert.deepEqual((await query("SELECT * FROM reading_calendar_events WHERE paper_id='p'"))[0],original);
    assert.equal((await query("SELECT last_recommended_at FROM paper_insights WHERE paper_id='p'"))[0].last_recommended_at,'2026-09-28T03:00:00Z');
    await execute([review('p','2026-09-28T16:01:00Z')]);
    assert.deepEqual((await query("SELECT day FROM reading_calendar_events WHERE paper_id='p' ORDER BY day")).map(x=>x.day),['2026-09-28','2026-09-29']);

    // Browsing and finishing use UPSERT too. Repeating within a day must not
    // roll back saved user state, and a repeat read keeps the first event.
    for (const time of ['02:00:00','03:00:00']) {
      await execute([{sql:`INSERT INTO paper_delivery_state VALUES('p','a','2026-09-28T${time}Z') ON CONFLICT(paper_id) DO UPDATE SET opened_at=excluded.opened_at`},
        {sql:`INSERT INTO paper_reading_progress VALUES('p','a','read','2026-09-28T${time}Z') ON CONFLICT(paper_id) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at`}]);
      await execute([{sql:"UPDATE paper_reading_progress SET status='unread' WHERE paper_id='p'"}]);
    }
    await execute([{sql:"INSERT INTO paper_engagement_events VALUES('e1','a','p','detail_open','2026-09-28T04:00:00Z')"},
      {sql:"INSERT INTO paper_engagement_events VALUES('e2','a','p','original_click','2026-09-28T04:30:00Z')"}]);
    assert.deepEqual((await query("SELECT kind,COUNT(*) n FROM reading_calendar_events WHERE paper_id='p' AND day='2026-09-28' GROUP BY kind ORDER BY kind")),[{kind:'browsed',n:1},{kind:'completed',n:1},{kind:'recommended',n:1}]);
    const history = await query('SELECT * FROM reading_calendar_events ORDER BY id');
    await execute([
      {sql:"DELETE FROM paper_insights WHERE paper_id='p'"},
      {sql:"DELETE FROM paper_delivery_state WHERE paper_id='p'"},
      {sql:"DELETE FROM paper_reading_progress WHERE paper_id='p'"},
      review('p','2026-09-28T05:00:00Z'),
      {sql:"INSERT INTO paper_delivery_state VALUES('p','a','2026-09-28T05:00:00Z') ON CONFLICT(paper_id) DO UPDATE SET opened_at=excluded.opened_at"},
      {sql:"INSERT INTO paper_reading_progress VALUES('p','a','read','2026-09-28T05:00:00Z') ON CONFLICT(paper_id) DO UPDATE SET status=excluded.status"},
      {sql:"INSERT OR REPLACE INTO paper_engagement_events VALUES('e1','a','p','detail_open','2026-09-28T05:00:00Z')"},
    ]);
    assert.deepEqual(await query('SELECT * FROM reading_calendar_events ORDER BY id'),history,'all insert triggers retain original daily events');
    // A bootstrap for a fresh database must match the migrated triggers.
    const expected=readingCalendarBootstrapSql.filter(sql=>sql.startsWith('CREATE TRIGGER'));
    for (const sql of expected) assert.ok(migration.includes(sql+';'));
    await execute([{sql:"INSERT INTO paper_delivery_state VALUES('foreign','a','2026-09-28T04:00:00Z')"}]);
    assert.equal((await query("SELECT COUNT(*) n FROM reading_calendar_events WHERE paper_id='foreign'"))[0].n,0);
  } finally {await mf.dispose();}
});
