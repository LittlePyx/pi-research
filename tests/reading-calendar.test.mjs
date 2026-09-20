import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { calendarMonth, calendarDay, readingCalendarBootstrapSql } from '../lib/reading-calendar.ts';

function fixture() {
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE research_spaces(id TEXT PRIMARY KEY); INSERT INTO research_spaces VALUES ('a'),('b');
 CREATE TABLE monitored_papers(id TEXT PRIMARY KEY,space_id TEXT); INSERT INTO monitored_papers VALUES ('p','a'),('q','b');
 CREATE TABLE paper_delivery_state(space_id TEXT,paper_id TEXT,opened_at TEXT);
 CREATE TABLE paper_reading_progress(space_id TEXT,paper_id TEXT,status TEXT,completed_at TEXT);
 CREATE TABLE paper_insights(space_id TEXT,paper_id TEXT,llm_recommended INTEGER,last_recommended_at TEXT);
 CREATE TABLE paper_engagement_events(space_id TEXT,paper_id TEXT,kind TEXT,occurred_at TEXT);
 CREATE TABLE monitor_daily_briefs(space_id TEXT,paper_ids TEXT,brief_date TEXT,created_at TEXT);`);
 return db;
}
test('calendar records immutable daily actions, separates completion and respects workspace and Beijing date',()=>{
 const db=fixture(); readingCalendarBootstrapSql.forEach(sql=>db.exec(sql));
 db.exec(`INSERT INTO paper_delivery_state VALUES('a','p','2026-09-20 16:01:00');
 UPDATE paper_delivery_state SET opened_at='2026-09-20 17:00:00';
 INSERT INTO paper_reading_progress VALUES('a','p','mastered','2026-09-20 17:00:00');`);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM reading_calendar_events WHERE kind='completed'").get().n,0);
 assert.equal(db.prepare("SELECT day FROM reading_calendar_events").get().day,'2026-09-21');
 db.exec(`UPDATE paper_reading_progress SET status='read'; UPDATE paper_reading_progress SET completed_at='2026-09-24 00:00:00';
 UPDATE paper_reading_progress SET status='unread',completed_at=NULL;
 INSERT INTO paper_delivery_state VALUES('b','p','2026-09-20 00:00:00');
 INSERT INTO paper_insights VALUES('a','p',0,'2026-09-20 00:00:00');`);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM reading_calendar_events").get().n,2);
 db.exec("UPDATE paper_insights SET llm_recommended=1,last_recommended_at='2026-09-22 00:00:00'; UPDATE paper_insights SET llm_recommended=0;");
 assert.equal(db.prepare("SELECT day FROM reading_calendar_events WHERE kind='completed'").get().day,'2026-09-21');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM reading_calendar_events WHERE kind='recommended'").get().n,1);
 db.exec("INSERT INTO paper_engagement_events VALUES('a','p','original_click','2026-09-23 00:00:00'); DELETE FROM paper_engagement_events;");
 assert.equal(db.prepare("SELECT COUNT(*) n FROM reading_calendar_events WHERE kind='browsed'").get().n,2);
 db.close();
});
test('migration restores saved brief dates and retained browsing but never invents read completions',()=>{
 const db=fixture();
 db.exec(`INSERT INTO monitor_daily_briefs VALUES('a','["p","p","q"]','2026-08-01','2026-08-02'),('a','bad json','2026-08-03','2026-08-03');
 INSERT INTO paper_reading_progress VALUES('a','p','read','2026-08-01');
 INSERT INTO paper_engagement_events VALUES('a','p','detail_open','2026-08-01 23:00:00');`);
 db.exec(readFileSync(new URL('../drizzle/0065_fantastic_hercules.sql',import.meta.url),'utf8'));
 const records=db.prepare('SELECT day,kind FROM reading_calendar_events ORDER BY day').all();
 assert.deepEqual(records.map(x=>({...x})),[{day:'2026-08-01',kind:'recommended'},{day:'2026-08-02',kind:'browsed'}]);
 readingCalendarBootstrapSql.forEach(sql=>db.exec(sql));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM reading_calendar_events').get().n,2);
 db.close();
});
test('calendar accepts leap days and bounds month and date input',()=>{
 assert.equal(calendarMonth('2024-02').days,29);
 for(const value of ['2026-13','2026-00','x','1999-12'])assert.equal(calendarMonth(value),null);
 assert.equal(calendarDay('2024-02-29','2024-02'),true);
 for(const value of ['2026-02-29','2026-02-00','2026-03-01'])assert.equal(calendarDay(value,'2026-02'),false);
});
