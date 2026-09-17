import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {groundedGraphRelevance} from '../lib/graph-task.ts';
import {routeReviewCurrentSql,routeReviewEligibleSql,routeReviewQuestion,routeMaintenanceLane} from '../lib/research-maintenance-policy.ts';
import {scheduledRouteTaskOrder} from '../lib/monitor-scheduler.mjs';
const source=readFileSync(new URL('../lib/research-maintenance.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const abstract='This paper derives explicit bounds for Gaussian entropy under stated regularity assumptions. The result concerns comparison of random variables and gives a constructive method.';
function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE research_spaces(id TEXT PRIMARY KEY,owner_user_id TEXT);
  CREATE TABLE monitor_runs(space_id TEXT,automation_paused_at TEXT,last_user_activity_at TEXT);
  CREATE TABLE monitored_papers(id TEXT PRIMARY KEY,space_id TEXT,canonical_id TEXT,doi TEXT,title TEXT,discovered_at TEXT);
  CREATE TABLE paper_insights(paper_id TEXT,space_id TEXT,abstract_text TEXT,ever_recommended INTEGER);
  CREATE TABLE research_tracks(id TEXT PRIMARY KEY,space_id TEXT,title_en TEXT,title_zh TEXT,position INTEGER,monitoring_status TEXT);
  CREATE TABLE research_track_papers(track_id TEXT,space_id TEXT,canonical_id TEXT,curation_status TEXT);
  CREATE TABLE paper_feedback(paper_id TEXT,space_id TEXT,feedback TEXT);
  CREATE TABLE research_route_library(track_id TEXT,paper_id TEXT,status TEXT);
  CREATE TABLE library_graph_checks(paper_id TEXT PRIMARY KEY,space_id TEXT,retry_at INTEGER,lease_until INTEGER);
  `);
  db.exec(readFileSync(new URL('../drizzle/0064_watery_veda.sql',import.meta.url),'utf8'));
  const database={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};}};
  const context=vm.createContext({crypto,Date,JSON,console,routeReviewCurrentSql,routeReviewEligibleSql,routeReviewQuestion,routeMaintenanceLane,groundedGraphRelevance,
    refreshLibraryGraph:async(_db,space,p)=>{db.prepare('INSERT OR REPLACE INTO library_graph_checks VALUES(?,?,0,0,?)').run(p.id,space,Date.now()+604800000);return {status:'ready',relations:2};}});
  vm.runInContext(compiled,context);
  function addSpace(id,paused=false,inactive=false) {
    db.prepare('INSERT INTO research_spaces VALUES(?,?)').run(id,'anonymous:'+id);
    db.prepare("INSERT INTO monitor_runs VALUES(?,?,datetime('now',?))").run(id,paused?'paused':null,inactive?'-8 days':'-1 hour');
    db.prepare("INSERT INTO research_tracks VALUES(?,?, 'Gaussian entropy', '高斯熵',0,'active')").run('t'+id,id);
    for(let n=0;n<6;n++){db.prepare("INSERT INTO monitored_papers VALUES(?,?,?,?,?,datetime('now'))").run(id+n,id,'doi:'+id+n,'doi-'+n,'Paper '+n);db.prepare('INSERT INTO paper_insights VALUES(?,?,?,0)').run(id+n,id,abstract);}
  }
  const review=async input=>input.canonicalIds.map(canonicalId=>({canonicalId,relevance:'direct',quote:abstract.slice(0,91),reasonZh:'对象与条件相关',reasonEn:'Objects and conditions match',limitationZh:'尚未核对全文',limitationEn:'Full text not checked'}));
  const graph=async input=>{db.prepare('INSERT OR REPLACE INTO library_graph_checks VALUES(?,?,0,0,?)').run(input.paperId,input.spaceId,Date.now()+604800000);return {status:'ready',relations:2};};
  return {db,database,addSpace,review,run:(reviewer=review,now=Date.now())=>context.runResearchMaintenance(database,reviewer,now,graph)};
}
test('route scheduler rotates all three existing lanes instead of starving retries',()=>{assert.deepEqual([1,2,3,4].map(n=>scheduledRouteTaskOrder(n)[0]),['routeIntelligence','routeEvolution','routeRetry','routeIntelligence']);});
test('background maintenance rotates spaces, respects inactivity, exclusions and source changes without formal writes',async()=>{
  const f=fixture();try{
    f.addSpace('a');f.addSpace('b');f.addSpace('paused',true);f.addSpace('inactive',false,true);
    f.db.prepare("INSERT INTO research_route_library VALUES('ta','a0','excluded')").run();
    f.db.prepare("INSERT INTO paper_feedback VALUES('a1','a','not_relevant')").run();
    f.db.prepare("INSERT INTO research_track_papers VALUES('ta','a','doi:a2','deactivated')").run();
    assert.equal((await f.run()).spaceId,'a');assert.equal((await f.run()).spaceId,'b');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM research_maintenance').get().n,2);
    f.db.exec('UPDATE research_maintenance SET next_at=0');
    const a=await f.run();assert.equal(a.lane,'route');assert.equal(a.reviewed,3);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM research_route_library_reviews WHERE paper_id IN ('a0','a1','a2')").get().n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM research_track_papers').get().n,1);
    assert.equal(f.db.prepare('SELECT status FROM research_route_library').get().status,'excluded');
    f.db.exec("UPDATE paper_insights SET abstract_text='Changed abstract with no reliable evidence' WHERE paper_id='a3'");
    const stale=f.db.prepare(`SELECT rr.id FROM research_route_library_reviews rr JOIN monitored_papers p ON p.id=rr.paper_id JOIN paper_insights i ON i.paper_id=p.id JOIN research_tracks t ON t.id=rr.track_id WHERE rr.paper_id='a3' AND (${routeReviewCurrentSql})`).get();assert.equal(stale,undefined);
  }finally{f.db.close();}
});
test('a concurrent or superseded worker cannot publish a route classification',async()=>{
  const f=fixture();try{f.addSpace('a');await f.run();f.db.exec('UPDATE research_maintenance SET next_at=0');
    let release,started=false;const gate=new Promise(r=>release=r);
    const pending=f.run(async input=>{started=true;await gate;return f.review(input);});
    while(!started)await new Promise(r=>setTimeout(r,1));
    assert.equal((await f.run()).status,'idle');
    f.db.exec("UPDATE research_maintenance SET lock_token='new-worker'");release();
    assert.equal((await pending).status,'stale');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM research_route_library_reviews').get().n,0);
  }finally{f.db.close();}
});
test('changed source and a newly excluded paper are rejected at publication time',async()=>{
  const f=fixture();try{f.addSpace('a');await f.run();f.db.exec('UPDATE research_maintenance SET next_at=0');
    await f.run(async input=>{f.db.exec("UPDATE paper_insights SET abstract_text='modified' WHERE paper_id='a0'; INSERT INTO research_route_library VALUES('ta','a1','excluded')");return f.review(input);});
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM research_route_library_reviews WHERE paper_id IN ('a0','a1')").get().n,0);
  }finally{f.db.close();}
});
