import assert from 'node:assert/strict';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Miniflare } from 'miniflare';

test('source and notebook APIs isolate owners, paginate raw notes, expose real source output and save without review reset', {timeout:60000}, async()=>{
  const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];
  for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
  let externalCalls=0;
  const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,
    modules:[{type:'ESModule',path:root+'memory-fixture.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules],
    outboundService:async()=>{externalCalls++;return new Response('No external calls allowed',{status:503});}});
  const request=async(path,body,status=200,owner='memory-fixture-owner-00001',method=body?'POST':'GET')=>{const r=await mf.dispatchFetch('http://localhost'+path,{method,headers:{cookie:`pi_anonymous_workspace=${owner}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const raw=await r.text();assert.equal(r.status,status,raw.slice(0,1000));return JSON.parse(raw);};
  const sql=rows=>request('/fixture',rows);const insert=(table,v)=>({sql:`INSERT INTO ${table} (${Object.keys(v).join(',')}) VALUES (${Object.keys(v).map(()=>'?').join(',')})`,values:Object.values(v)});
  try{
    await request('/api/research-memory?spaceId=mine',null,404);
    await sql([insert('research_spaces',{id:'mine',owner_user_id:'anonymous:memory-fixture-owner-00001',name:'量子时钟同步',member_name:'QA',description:'quantum clock synchronization'}),
      insert('research_spaces',{id:'other',owner_user_id:'anonymous:another-owner-fixture-00002',name:'Other',member_name:'QA'}),
      insert('monitor_runs',{id:'run',space_id:'mine',status:'ready',last_run_at:'2026-09-16T00:00:00Z',next_run_at:'2026-09-17T00:00:00Z'}),
      insert('monitor_preferences',{id:'pref',space_id:'mine',profile_key:'physics',priority_venues:'["Journal of High Energy Physics"]',tracked_authors:'["Preserved Author"]',exploration_mode:'focused',user_modified:0})]);
    const statements=[];
    for(let n=0;n<26;n++){
      statements.push(insert('monitored_papers',{id:`p${n}`,space_id:'mine',canonical_id:`fixture:${n}`,title:`Fixture note ${n}`,venue:'Optics Letters',horizon:'days'}));
      statements.push(insert('paper_insights',{paper_id:`p${n}`,space_id:'mine',analysis_source:n===0?'deepseek_rejected':'metadata',analysis_model:n===0?'preserved-model':'',ever_recommended:n===1?1:0}));
      statements.push(insert('paper_reading_progress',{id:`r${n}`,paper_id:`p${n}`,space_id:'mine',note:n===0?'unique100% literal query':'A saved raw note',status:'reading'}));
    }
    await sql(statements);
    await request('/api/research-memory?spaceId=other',null,404);
    await request('/api/research-sources?spaceId=other',null,404);
    const page=await request('/api/research-memory?spaceId=mine');assert.equal(page.total,26);assert.equal(page.items.length,24);assert.equal(page.nextOffset,24);
    assert.equal(page.items[0].status,'pending');assert.ok(page.items[0].note);
    const next=await request('/api/research-memory?spaceId=mine&offset=24');assert.equal(next.items.length,2);assert.equal(next.nextOffset,null);
    const search=await request('/api/research-memory?spaceId=mine&q=unique100%25');assert.equal(search.total,1);assert.equal(search.items[0].paperId,'p0');
    await request('/api/research-memory?spaceId=mine&offset=-1',null,400);
    const sources=await request('/api/research-sources?spaceId=mine');assert.equal(sources.plan.directionKey,'quantum_timing');
    const ol=sources.activity.find(a=>a.venue==='Optics Letters');assert.equal(ol.discovered,26);assert.equal(ol.recommended,1);assert.equal(ol.papers.length,2);
    // The normal reader refreshes untouched automatic defaults; manual choices survive.
    const state=await request('/api/monitor?spaceId=mine');assert.ok(state.monitor.preferences.priorityVenues.includes('Metrologia'));
    const payload={spaceId:'mine',priorityVenues:['Optics Letters'],trackedAuthors:['Preserved Author'],explorationMode:'focused'};
    await request('/api/monitor',payload,200,'memory-fixture-owner-00001','PATCH');
    const rows=await sql([{sql:"SELECT analysis_model FROM paper_insights WHERE paper_id='p0'"},{sql:"SELECT last_run_at,next_run_at FROM monitor_runs WHERE space_id='mine'"}]);
    assert.equal(rows[0].results[0].analysis_model,'preserved-model');assert.equal(rows[1].results[0].next_run_at,'2026-09-17T00:00:00Z');
    const customized=await request('/api/monitor?spaceId=mine');assert.deepEqual(customized.monitor.preferences.priorityVenues,['Optics Letters']);
    const reset=await request('/api/monitor',{spaceId:'mine',reset:true},200,'memory-fixture-owner-00001','PATCH');assert.deepEqual(reset.monitor.preferences.trackedAuthors,['Preserved Author']);assert.equal(reset.monitor.preferences.explorationMode,'focused');
    const counts=await sql([{sql:'SELECT COUNT(*) n FROM paper_feedback'},{sql:'SELECT COUNT(*) n FROM monitor_scan_jobs'}]);assert.deepEqual(counts.map(r=>r.results[0].n),[0,0]);
    assert.equal(externalCalls,0);
  }finally{await mf.dispose();}
});
