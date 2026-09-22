import assert from 'node:assert/strict';
import {glob} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {Miniflare} from 'miniflare';

test('Question entry persists an owned idempotent problem and exposes only verified related unread papers', {timeout:60000}, async()=>{
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];
 for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
 const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,
  modules:[{type:'ESModule',path:root+'entry-fixture.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules]});
 const owner='question-entry-fixture-owner-001';
 const request=async(path,body,status=200,who=owner)=>{const r=await mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{cookie:`pi_anonymous_workspace=${who}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();assert.equal(r.status,status,text.slice(0,1500));return JSON.parse(text)};
 const sql=statements=>request('/fixture',statements);
 const insert=(table,v)=>({sql:`INSERT INTO ${table} (${Object.keys(v).join(',')}) VALUES (${Object.keys(v).map(()=>'?').join(',')})`,values:Object.values(v)});
 try {
  await request('/api/research-entry?spaceId=entry',null,404);
  await sql([insert('research_spaces',{id:'entry',owner_user_id:'anonymous:'+owner,name:'Fixture',member_name:'Fixture'})]);
  assert.deepEqual(await request('/api/research-entry?spaceId=entry'),{goal:null,papers:[]});
  await request('/api/research-entry',{spaceId:'entry',question:'short'},400);
  const body={spaceId:'entry',question:'How does stochastic localization control the spectral gap?',seed:'Unverified starting title',locale:'en'};
  await request('/api/research-entry',body,404,'question-entry-other-owner-002');
  const first=await request('/api/research-entry',body),again=await request('/api/research-entry',body);
  assert.equal(first.created,true);assert.equal(again.created,false);assert.equal(first.goal.id,again.goal.id);assert.deepEqual(first.papers,[]);
  const rows=await sql([{sql:'SELECT status,question,scope,model FROM research_problems'},{sql:'SELECT COUNT(*) n FROM research_tracks'},{sql:'SELECT COUNT(*) n FROM research_track_papers'},{sql:'SELECT COUNT(*) n FROM paper_reading_progress'}]);
  assert.equal(rows[0].results[0].status,'active');assert.equal(rows[0].results[0].question,body.question);assert.match(rows[0].results[0].scope,/unverified.*Unverified starting title/);assert.equal(rows[0].results[0].model,'user-entry-v1');
  assert.deepEqual(rows.slice(1).map(r=>r.results[0].n),[1,0,0]);
  for(const [id,problem,verified] of [['related',first.goal.id,'verified'],['unrelated','other-question','verified'],['unverified',first.goal.id,'pending'],['read',first.goal.id,'verified'],['ignored',first.goal.id,'verified']])await sql([
   insert('monitored_papers',{id,space_id:'entry',canonical_id:'doi:10.9999/'+id,title:id,authors:'Fixture',venue:'Fixture',url:'https://example.org/'+id,horizon:'years',discovered_at:'2026-09-22T00:00:00Z'}),
   insert('paper_insights',{paper_id:id,space_id:'entry',abstract_text:'A source abstract containing enough verifiable context for this isolated test. This fixture does not represent a real paper or a real quality evaluation.',llm_recommended:1,analysis_source:'deepseek',verification_status:verified,research_problem_id:problem,why_read_en:'Linked to the confirmed question',quality_score:90}),
  ]);
  await sql([insert('paper_reading_progress',{id:'read-progress',space_id:'entry',paper_id:'read',status:'read'}),insert('paper_feedback',{id:'ignore',space_id:'entry',paper_id:'ignored',feedback:'not_relevant'})]);
  assert.deepEqual((await request('/api/research-entry?spaceId=entry')).papers.map(p=>p.id),['related']);
  const newer=await request('/api/research-entry',{...body,question:'Which assumptions connect concentration to isoperimetric bounds?'});
  assert.notEqual(newer.goal.id,first.goal.id);
  assert.equal((await request('/api/research-entry',body)).goal.id,first.goal.id,'retry returns requested goal, never another recent goal');
  assert.equal((await request('/api/research-entry?spaceId=entry&goalId='+first.goal.id)).goal.id,first.goal.id);
  await sql([{sql:"UPDATE research_tracks SET monitoring_status='paused' WHERE id=?",values:[first.goal.trackId]}]);
  await request('/api/research-entry',body,409);
  assert.equal((await sql([{sql:'SELECT monitoring_status FROM research_tracks WHERE id=?',values:[first.goal.trackId]}]))[0].results[0].monitoring_status,'paused');
 } finally {await mf.dispose()}
});
