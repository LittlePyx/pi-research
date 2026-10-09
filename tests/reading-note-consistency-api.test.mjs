import assert from 'node:assert/strict';
import {glob} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {Miniflare} from 'miniflare';
import {readingNoteHash} from '../lib/reading-note-consistency.mjs';
import {currentReadingMemories} from '../lib/current-reading-memories.ts';
import {readPreferenceSignals} from '../lib/preference-memory.ts';

test('reading-note edits, clears and overlapping analysis preserve only current evidence', {timeout:60000}, async()=>{
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];
 for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
 const replies=[];let arrived;
 const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,
  modules:[{type:'ESModule',path:root+'note-fixture.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules],
  outboundService:async request=>{assert.equal(new URL(request.url).hostname,'api.deepseek.com');return new Promise(resolve=>{replies.push(resolve);arrived?.();})}});
 const owner='note-consistency-fixture-owner';
 const request=async(path,body,method='POST')=>{
  const response=await mf.dispatchFetch('http://localhost'+path,{method,headers:{cookie:`pi_anonymous_workspace=${owner}; pi_deepseek_api_key=sk-fixture-not-a-real-key-1234567890`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(path==='/api/library')assert.equal(response.status,200,JSON.stringify(data));return data;
 };
 const sql=items=>request('/fixture',items);
 const insert=(table,values)=>({sql:`INSERT INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(()=>'?').join(',')})`,values:Object.values(values)});
 const noteA='First note about a reusable covariance method and its assumptions.';
 const noteB='Second note instead discusses finite blocklength coding and dispersion.';
 const patch=(note,analyze=false)=>request('/api/library',{spaceId:'s',paperId:'p',status:'reading',note,analyze},'PATCH');
 const finish=(index,label,failed=false)=>replies[index](Response.json(failed?{error:{message:'Fixture failure'}}:{choices:[{message:{content:JSON.stringify({takeawayZh:label,takeawayEn:label,topicsZh:[label],topicsEn:[label],trackId:'t'})}}],usage:{prompt_tokens:2,completion_tokens:3}},{status:failed?500:200}));
 const start=async note=>{const waiting=new Promise(resolve=>arrived=resolve);const pending=patch(note,true);await waiting;return {pending};};
 try {
  await request('/api/library?spaceId=s',null,'GET');
  await sql([
   insert('research_spaces',{id:'s',owner_user_id:'anonymous:'+owner,name:'Fixture',member_name:'Fixture'}),
   insert('monitored_papers',{id:'p',space_id:'s',canonical_id:'fixture:p',title:'Fixture paper',authors:'Fixture',venue:'Fixture',url:'https://example.test/p',horizon:'years'}),
   insert('monitored_papers',{id:'other',space_id:'s',canonical_id:'fixture:other',title:'Other paper',authors:'Fixture',venue:'Fixture',url:'https://example.test/other',horizon:'years'}),
   insert('research_tracks',{id:'t',space_id:'s',title_zh:'方向',title_en:'Track',interaction_score:0,depth_score:0}),
  ]);
  const hashA=await readingNoteHash(noteA);
  await patch(noteA);
  await sql([
   insert('paper_reading_memories',{id:'old-attempt',space_id:'s',paper_id:'p',note_hash:hashA,analysis_status:'ready',takeaway_en:'Old'}),
   ...[['old','reading_note',`p:${hashA}:reading_topic:0`],['disabled','reading_note',`p:${hashA}:reading_method:0`],['explicit','paper_feedback','p:method_fit'],['other','paper_feedback','other:method_fit']].map(([id,type,source])=>insert('research_preference_signals',{id,space_id:'s',layer:type==='reading_note'?'inferred':'explicit',kind:'method',label_zh:id,label_en:id,source_type:type,source_id:source,active:id==='disabled'?0:1})),
   insert('monitor_query_plans',{id:'cache',space_id:'s',plan_date:new Date().toISOString().slice(0,10),exploration_mode:'balanced'}),
  ]);
  await patch(noteA);
  let rows=await sql([{sql:'SELECT id,active FROM research_preference_signals ORDER BY id'},{sql:'SELECT COUNT(*) n FROM monitor_query_plans'}]);
  assert.equal(rows[0].results.find(r=>r.id==='old').active,1);assert.equal(rows[0].results.find(r=>r.id==='disabled').active,0);assert.equal(rows[1].results[0].n,1);
  await patch('short');
  rows=await sql([{sql:'SELECT id,active FROM research_preference_signals ORDER BY id'},{sql:'SELECT analysis_status FROM paper_reading_memories'},{sql:'SELECT COUNT(*) n FROM monitor_query_plans'}]);
  assert.equal(rows[0].results.find(r=>r.id==='old').active,0);assert.equal(rows[0].results.find(r=>r.id==='explicit').active,1);assert.equal(rows[0].results.find(r=>r.id==='other').active,1);
  assert.equal(rows[1].results[0].analysis_status,'stale');assert.equal(rows[2].results[0].n,0);
  // An older successful response must not replace a newer successful analysis.
  const first=await start(noteA),second=await start(noteB);
  finish(1,'Latest');assert.equal((await second.pending).memoryAnalysis.status,'ready');
  finish(0,'Obsolete');assert.equal((await first.pending).memoryAnalysis.status,'stale');
  rows=await sql([{sql:'SELECT takeaway_en,note_hash FROM paper_reading_memories'},{sql:"SELECT label_en FROM research_preference_signals WHERE active=1 AND source_type='reading_note'"},{sql:"SELECT interaction_score FROM research_tracks WHERE id='t'"}]);
  assert.equal(rows[0].results[0].takeaway_en,'Latest');assert.equal(rows[0].results[0].note_hash,await readingNoteHash(noteB));assert.deepEqual(rows[1].results.map(r=>r.label_en),['Latest']);assert.equal(rows[2].results[0].interaction_score,2);
  const db=await mf.getD1Database('DB');
  assert.equal((await readPreferenceSignals(db,'s')).some(r=>r.labelEn==='Latest'),true);
  assert.equal((await currentReadingMemories(db,'s',16)).results.length,1);
  await patch('');
  assert.equal((await currentReadingMemories(db,'s',16)).results.length,0);
  assert.equal((await readPreferenceSignals(db,'s')).some(r=>r.sourceType==='reading_note'),false);
  // Legacy rows from before this fix also fail the source-revision check.
  await sql([{sql:"UPDATE paper_reading_progress SET note='Different legacy source note' WHERE paper_id='p'"},{sql:"UPDATE paper_reading_memories SET analysis_status='ready'"},{sql:"UPDATE research_preference_signals SET active=1 WHERE label_en='Latest'"}]);
  assert.equal((await readPreferenceSignals(db,'s')).some(r=>r.sourceType==='reading_note'),false);
  assert.equal((await currentReadingMemories(db,'s',16)).results.length,0);
  // Same-note overlapping calls use attempt IDs, not just matching hashes.
  const older=await start(noteA),newer=await start(noteA);
  finish(3,'Newest same note');await newer.pending;finish(2,'Ignored failure',true);await older.pending;
  rows=await sql([{sql:'SELECT takeaway_en,analysis_status FROM paper_reading_memories'}]);
  assert.equal(rows[0].results[0].analysis_status,'ready');assert.equal(rows[0].results[0].takeaway_en,'Newest same note');
  await sql(Array.from({length:105},(_,index)=>insert('research_preference_signals',{id:'legacy-'+index,space_id:'s',layer:'inferred',kind:'method',label_zh:'旧',label_en:'Legacy '+index,source_type:'reading_note',source_id:`p:obsolete-${index}:method:0`,confidence:100,active:1})));
  assert.equal((await readPreferenceSignals(db,'s',3)).some(r=>r.labelEn==='Newest same note'),true,'obsolete rows cannot consume the valid result limit');
  const clearDuring=await start(noteB);await patch('');finish(4,'After clear');
  assert.equal((await clearDuring.pending).memoryAnalysis.status,'stale');
  assert.equal((await readPreferenceSignals(db,'s')).some(r=>r.sourceType==='reading_note'),false);
 } finally {for(const reply of replies)reply(new Response('{}'));await mf.dispose();}
});
