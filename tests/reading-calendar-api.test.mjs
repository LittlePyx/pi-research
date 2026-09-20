import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const compiled=await build({entryPoints:[fileURLToPath(new URL('../app/api/reading-calendar/route.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'isolated-database',setup(b){b.onLoad({filter:/db[\\/]repository\.ts$/},()=>({contents:`export const getDatabase=()=>globalThis.__calendarTestDb;export const ensureSchema=async()=>{};export const getApiUser=r=>r.headers.get('authorization')==='owner'?{userId:'owner'}:null;`,loader:'js'}));}}]});
const {GET}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
test('calendar API checks ownership, filters dates and kinds, paginates without leaking another space',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE research_spaces(id,owner_user_id);INSERT INTO research_spaces VALUES('a','owner'),('b','other');CREATE TABLE monitored_papers(id,space_id,title,authors,venue);CREATE TABLE reading_calendar_events(space_id,paper_id,day,kind,occurred_at);`);
 for(let i=0;i<53;i++){db.prepare('INSERT INTO monitored_papers VALUES(?,?,?,?,?)').run('p'+i,'a','Paper '+i,'Author','Venue');db.prepare('INSERT INTO reading_calendar_events VALUES(?,?,?,?,?)').run('a','p'+i,'2026-09-20','recommended','2026-09-20');}
 db.exec(`INSERT INTO monitored_papers VALUES('secret','b','Private','','');INSERT INTO reading_calendar_events VALUES('b','secret','2026-09-20','recommended','2026-09-20');`);
 globalThis.__calendarTestDb={prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};}};}};
 const request=(extra='',auth=true)=>new Request('http://test/api/reading-calendar?month=2026-09&day=2026-09-20'+extra,{headers:auth?{authorization:'owner'}:{}});
 assert.equal((await GET(request('&spaceId=a',false))).status,401);
 assert.equal((await GET(request('&spaceId=b'))).status,404);
 assert.equal((await GET(request('&spaceId=a&page=-1'))).status,400);
 const first=await (await GET(request('&spaceId=a'))).json();assert.equal(first.papers.length,50);assert.equal(first.hasMore,true);assert.equal(first.counts[0].count,53);assert.equal(first.papers.some(p=>p.id==='secret'),false);
 const second=await (await GET(request('&spaceId=a&page=1'))).json();assert.equal(second.papers.length,3);assert.equal(second.hasMore,false);assert.equal(new Set([...first.papers,...second.papers].map(p=>p.id)).size,53);
 const completed=await (await GET(request('&spaceId=a&kind=completed'))).json();assert.equal(completed.papers.length,0);
 delete globalThis.__calendarTestDb;db.close();
});
