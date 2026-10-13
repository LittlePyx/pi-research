import test from 'node:test';
import assert from 'node:assert/strict';
import {glob} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
import {readingNoteHash} from '../lib/reading-note-consistency.mjs';

test('saved preference reads work without a model or successful scan and preserve notes, signals and scan state',{timeout:120000},async()=>{
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];let externalCalls=0;
 for await(const file of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+file});
 const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,
  modules:[{type:'ESModule',path:root+'saved-read-fixture.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules],outboundService:()=>{externalCalls++;throw Error('Saved preference reads cannot use a model or source')}});
 const owner='saved-read-owner-fixture',headers={cookie:`pi_anonymous_workspace=${owner}`,'Content-Type':'application/json'};
 const call=(path,body,cookie=headers.cookie)=>mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{...headers,cookie},...(body?{body:JSON.stringify(body)}:{})});
 const sql=async statements=>{const response=await call('/fixture',statements);assert.equal(response.status,200,await response.clone().text());return response.json()};
 const insert=(table,row)=>({sql:`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`,values:Object.values(row)});
 try{
  assert.equal((await call('/api/preference-signals?spaceId=owned')).status,404);
  const hash=await readingNoteHash('Current saved note');
  await sql([
   insert('research_spaces',{id:'owned',owner_user_id:'anonymous:'+owner,name:'Owned',member_name:'QA',description:'Finite blocklength lossy compression'}),
   insert('research_spaces',{id:'foreign',owner_user_id:'anonymous:another-owner',name:'Foreign',member_name:'QA'}),
   insert('research_spaces',{id:'empty',owner_user_id:'anonymous:'+owner,name:'Empty',member_name:'QA'}),
   insert('monitor_runs',{id:'run',space_id:'owned',status:'error',error:'Fixture scan failure',next_run_at:'2026-10-20T00:00:00Z'}),
   insert('monitored_papers',{id:'p',space_id:'owned',canonical_id:'fixture:p',title:'Saved paper',horizon:'years'}),
   insert('paper_reading_progress',{id:'reading',paper_id:'p',space_id:'owned',status:'reading',note:'Current saved note'}),
   insert('paper_reading_memories',{id:'memory',paper_id:'p',space_id:'owned',note_hash:hash,analysis_status:'ready'}),
   ...[{id:'explicit',space_id:'owned',source_type:'paper_feedback',source_id:'p:method_fit',layer:'explicit'},
    {id:'valid-note',space_id:'owned',source_type:'reading_note',source_id:`p:${hash}:method:0`,layer:'explicit'},
    {id:'stale-note',space_id:'owned',source_type:'reading_note',source_id:'p:stale-hash:method:0',layer:'explicit'},
    {id:'disabled',space_id:'owned',source_type:'behavior_interest',source_id:'disabled',active:0,layer:'inferred'},
    {id:'expired',space_id:'owned',source_type:'behavior_interest',source_id:'expired',expires_at:'2000-01-01',layer:'inferred'},
    {id:'foreign-signal',space_id:'foreign',source_type:'research_space',source_id:'foreign',layer:'explicit'}].map(row=>insert('research_preference_signals',{active:1,kind:'method',label_zh:row.id,label_en:row.id,evidence:'Fixture evidence',confidence:90,weight:90,...row})),
  ]);
  const snapshot=async()=>(await sql(['research_spaces','monitored_papers','paper_reading_progress','paper_reading_memories','research_preference_signals','monitor_runs','monitor_scan_jobs'].map(table=>({sql:`SELECT * FROM ${table} ORDER BY rowid`})))).map(result=>result.results);
  const before=await snapshot(),response=await call('/api/preference-signals?spaceId=owned');assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('cache-control'),'private, no-store');
  const data=await response.json();assert.equal(data.scopeDescription,'Finite blocklength lossy compression');assert.deepEqual(data.signals.map(signal=>signal.id).sort(),['explicit','valid-note']);assert.ok(data.signals.every(signal=>signal.sourcePaperId==='p'));
  assert.deepEqual(await snapshot(),before,'GET neither generates signals nor mutates existing research content or scan state');
  assert.equal((await call('/api/preference-signals?spaceId=foreign')).status,404);assert.equal((await call('/api/preference-signals?spaceId=owned',null, 'pi_anonymous_workspace=different-owner-fixture')).status,404);
  assert.equal((await call('/api/preference-signals?spaceId=owned',null,'')).status,401);assert.equal((await call('/api/preference-signals?spaceId=%20')).status,400);
  const empty=await (await call('/api/preference-signals?spaceId=empty')).json();assert.deepEqual(empty.signals,[]);
  await sql([{sql:'CREATE TABLE IF NOT EXISTS research_space_deletions(space_id TEXT PRIMARY KEY,deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'},insert('research_space_deletions',{space_id:'owned'})]);
  assert.equal((await call('/api/preference-signals?spaceId=owned')).status,410,'deleted spaces remain protected by the shared HTTP boundary');
  assert.equal(externalCalls,0);
 }finally{await mf.dispose()}
});
