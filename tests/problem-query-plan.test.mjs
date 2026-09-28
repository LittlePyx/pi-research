import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build,transform} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {parseProblemQueries,protectProblemQueries,problemSourceKey} from '../lib/problem-query-plan.ts';
const query={problemId:'q',trackId:'t',days:'finite blocklength lossy compression',months:'excess distortion second order source assumptions',years:'rate distortion dispersion memoryless sources theorem'};
test('problem slots survive a full broad plan in every horizon without growing the budget',()=>{
 for(const limit of [2,3,4]){
  const plan=protectProblemQueries({days:['calibration','broad','third','fourth'],months:['broad','other'],years:['broad','other']},query,limit);
  for(const h of ['days','months','years']){assert.equal(plan[h][0],query[h]);assert.ok(plan[h].length<=limit)}
 }
 assert.equal(parseProblemQueries(query,{id:'other',track_id:'t'}),undefined);
 assert.equal(parseProblemQueries({...query,years:''},{id:'q',track_id:'t'}),undefined);
 assert.equal(parseProblemQueries({...query,years:'中文查询测试'}, {id:'q',track_id:'t'}),undefined);
 assert.deepEqual(parseProblemQueries(query,{id:'q',track_id:'t'}),query);
});
test('UTC database start time does not become an eight-hour-old scan in Shanghai',async()=>{
 const app=readFileSync('app/research-app.tsx','utf8');
 const fn=app.slice(app.indexOf('function timeValue('),app.indexOf('\nfunction recommendationTierLabel'));
 const code=(await transform(fn,{loader:'ts'})).code;
 const get=vm.runInNewContext(code+';timeValue');
 assert.equal(get('2026-09-28 09:12:49'),Date.parse('2026-09-28T09:12:49Z'));
 assert.match(app,/Date\.now\(\) - timeValue\(startedAt\)/);
});
test('live trace isolates owner, problem and review job; unreviewed matches remain undecided',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE research_spaces(id TEXT,owner_user_id TEXT);
 CREATE TABLE research_problems(id TEXT,space_id TEXT,track_id TEXT);
 CREATE TABLE monitor_scan_jobs(id TEXT,space_id TEXT,status TEXT,started_at TEXT,completed_at TEXT,work_queue_json TEXT);
 CREATE TABLE monitor_discovery_coverage(space_id TEXT,source_key TEXT,query_key TEXT,horizon TEXT,query_text TEXT,attempt_count INT,candidate_count INT,last_scanned_at TEXT,last_error TEXT);
 CREATE TABLE monitor_candidate_sources(space_id TEXT,paper_id TEXT,source_key TEXT,query_key TEXT,first_seen_at TEXT,last_seen_at TEXT);
 CREATE TABLE monitored_papers(id TEXT,space_id TEXT,title TEXT);
 CREATE TABLE recommendation_audit_events(space_id TEXT,paper_id TEXT,scan_job_id TEXT,decision TEXT,screening_reason TEXT,verification_status TEXT,recommended INT);
 INSERT INTO research_spaces VALUES('s','owner'); INSERT INTO research_problems VALUES('q','s','t');
 INSERT INTO monitored_papers VALUES('p','s','Paper');`);
 sqlite.prepare('INSERT INTO monitor_scan_jobs VALUES(?,?,?,?,?,?)').run('job','s','ready','2026-09-28',null,JSON.stringify({frozenQueryPlan:{problemQueries:query}}));
 const key=problemSourceKey('q','years');
 sqlite.prepare('INSERT INTO monitor_discovery_coverage VALUES(?,?,?,?,?,?,?,?,?)').run('s',key,'key','years',query.years,1,1,'2026-09-28',null);
 sqlite.prepare('INSERT INTO monitor_candidate_sources VALUES(?,?,?,?,?,?)').run('s','p',key,'key','2026-09-28','2026-09-28');
 sqlite.exec("INSERT INTO recommendation_audit_events VALUES('s','p','old-job','recommended','Old reason','verified',1)");
 const db={prepare(sql){const statement=sqlite.prepare(sql);return {bind(...args){return {async first(){return statement.get(...args)||null},async all(){return {results:statement.all(...args)}}}}}}};
 const out=await build({entryPoints:['app/api/problem-discovery/route.ts'],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'db',setup(b){b.onResolve({filter:/db\/repository$/},()=>({path:'db',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const getApiUser=r=>({userId:r.headers.get("x-test-user")});export const getDatabase=()=>testDb;export const ensureSchema=async()=>{};'}))}}]});
 const context={exports:{},module:{exports:{}},testDb:db,Response,URL};vm.runInNewContext(out.outputFiles[0].text,context);const GET=context.module.exports.GET;
 const request=(user,space='s')=>new Request('https://site/api/problem-discovery?spaceId='+space+'&problemId=q',{headers:{'x-test-user':user}});
 assert.equal((await GET(request('intruder'))).status,404);
 assert.equal((await GET(request('owner','other'))).status,404);
 let result=await (await GET(request('owner'))).json();assert.equal(result.papers[0].decision,null);
 sqlite.exec("INSERT INTO recommendation_audit_events VALUES('s','p','job','rejected','No direct evidence','not_required',0)");
 result=await (await GET(request('owner'))).json();assert.equal(result.papers[0].reason,'No direct evidence');assert.equal(result.papers[0].recommended,0);
 sqlite.close();
});
