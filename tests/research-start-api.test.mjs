import assert from 'node:assert/strict';
import {glob,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {Miniflare} from 'miniflare';

test('reviewed paper starts an owned route once, with source freshness and explicit exclusions preserved', {timeout:60000},async()=>{
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];
 for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
 const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,
 modules:[{type:'ESModule',path:root+'start-entry.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules]});
 const owner='research-start-fixture-owner-001';
 const request=async(path,body,status=200,who=owner)=>{const r=await mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{cookie:`pi_anonymous_workspace=${who}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();assert.equal(r.status,status,text.slice(0,1500));return JSON.parse(text);};
 const sql=statements=>request('/fixture',statements);
 const insert=(table,v)=>({sql:`INSERT INTO ${table} (${Object.keys(v).join(',')}) VALUES (${Object.keys(v).map(()=>'?').join(',')})`,values:Object.values(v)});
 try{
  await request('/api/research-start?spaceId=start',null,404);
  const migration=await readFile(new URL('../drizzle/0063_fair_kulan_gath.sql',import.meta.url),'utf8');
  await sql(migration.split('--> statement-breakpoint').filter(s=>s.includes('research_route_library')||s.includes('idx_route_library')).map(sql=>({sql})));
  await sql([insert('research_spaces',{id:'start',owner_user_id:'anonymous:'+owner,name:'Quantum clocks',member_name:'Test'}),insert('research_spaces',{id:'other',owner_user_id:'anonymous:another-start-owner-002',name:'Other',member_name:'Other'})]);
  const abstract='We study clock synchronization under asymmetric communication delays and test detection limits under specified experimental conditions. These are isolated test data, not scientific findings.';
  for(const [id,space,approved] of [['seed','start',1],['candidate','start',0],['foreign','other',1]])await sql([
   insert('monitored_papers',{id,space_id:space,canonical_id:'doi:10.9999/'+id,title:'Clock synchronization '+id,authors:'Fixture',venue:'Fixture',url:'https://example.com/'+id,horizon:'years',discovered_at:'2026-09-17T00:00:00Z'}),
   insert('paper_insights',{paper_id:id,space_id:space,abstract_text:abstract,llm_recommended:approved,ever_recommended:approved,analysis_source:'deepseek',verification_status:'verified',problem_zh:'如何核对时钟同步中的非对称延迟？',problem_en:'How can asymmetric synchronization delays be checked?',reading_focus_zh:'比较攻击假设与检测条件。',quality_score:90}),
  ]);
  const list=(await request('/api/research-start?spaceId=start')).suggestions;assert.deepEqual(list.map(s=>s.id),['seed']);
  const body={spaceId:'start',action:'confirm',paperId:'seed',revision:list[0].revision,target:'Check asymmetric quantum clock synchronization delays'};
  await request('/api/research-start',body,404,'another-start-owner-002');
  await request('/api/research-start',{...body,paperId:'foreign'},409);
  await request('/api/research-start',{...body,paperId:'candidate'},409);
  await sql([{sql:"UPDATE paper_insights SET abstract_text=abstract_text || ' Updated.' WHERE paper_id='seed'"}]);
  await request('/api/research-start',body,409);
  body.revision=(await request('/api/research-start?spaceId=start')).suggestions[0].revision;
  const first=await request('/api/research-start',body),again=await request('/api/research-start',body);
  assert.equal(first.formal,false);assert.equal(first.created,true);assert.equal(again.created,false);assert.equal(first.track.id,again.track.id);
  assert.deepEqual(first.task.papers,[{canonicalId:'doi:10.9999/seed',title:'Clock synchronization seed'}]);
  const counts=await sql(['research_tracks','research_route_library','research_track_papers','paper_reading_progress','learning_paths'].map(t=>({sql:`SELECT COUNT(*) n FROM ${t}`})));
  assert.deepEqual(counts.map(r=>r.results[0].n),[1,1,0,0,0],'confirmation creates a route and reading membership, not formal evidence, reading completion or an unconfirmed learning plan');
  await sql([{sql:"UPDATE research_route_library SET status='excluded' WHERE paper_id='seed'"}]);await request('/api/research-start',body,409);
  await sql([{sql:"UPDATE research_tracks SET monitoring_status='paused'"}]);await request('/api/research-start',body,409);
  await sql([insert('paper_feedback',{id:'ignore',space_id:'start',paper_id:'seed',feedback:'not_relevant'})]);assert.equal((await request('/api/research-start?spaceId=start')).suggestions.length,0);
 }finally{await mf.dispose();}
});
