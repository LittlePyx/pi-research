import test from 'node:test';
import assert from 'node:assert/strict';
import {glob,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
test('space deletion preserves owned records, closes all scoped entry points and restoration does not resume scans',{timeout:60000},async()=>{
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];
 for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
 let outbound=0;
 const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,modules:[{type:'ESModule',path:root+'space-deletion-fixture.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules],outboundService:()=>{outbound++;throw Error('No model or external sources in deletion tests')}});
 const owner='space-delete-fixture-owner-12345',other='space-delete-other-owner-67890';
 const call=(path,method='GET',body,identity=owner,headers={})=>mf.dispatchFetch('http://localhost'+path,{method,headers:{cookie:'pi_anonymous_workspace='+identity,'Content-Type':'application/json',origin:'http://localhost',...headers},...(body?{body:JSON.stringify(body)}:{})});
 const sql=async(items)=>(await (await call('/fixture','POST',items)).json());
 const insert=(table,value)=>({sql:`INSERT INTO ${table}(${Object.keys(value).join(',')}) VALUES(${Object.keys(value).map(()=>'?').join(',')})`,values:Object.values(value)});
 try{
  assert.equal((await call('/api/spaces')).status,200);
  const migration=await readFile('drizzle/0072_space_deletions.sql','utf8');await sql([{sql:migration}]);
  const created=await call('/api/spaces','POST',{name:'Own source coding',description:'Original direction'});assert.equal(created.status,201);const space=(await created.json()).space;
  const second=(await (await call('/api/spaces','POST',{name:'Keep this space'})).json()).space;
  const token='fixture-public-share-token-123456';
  await sql([
   insert('monitored_papers',{id:'p',space_id:space.id,canonical_id:'fixture-p',title:'Fixture paper',authors:'Fixture',venue:'Fixture',url:'https://example.test/p',horizon:'years'}),
   insert('paper_insights',{paper_id:'p',space_id:space.id,abstract_text:'Original source evidence',analysis_source:'deepseek',quality_score:91,ever_recommended:1}),
   insert('paper_reading_progress',{id:'note',space_id:space.id,paper_id:'p',status:'reading',note:'Original saved note'}),
   insert('paper_feedback',{id:'f',space_id:space.id,paper_id:'p',saved:1,feedback:'relevant'}),
   insert('research_tracks',{id:'t',space_id:space.id,title_zh:'原路线',title_en:'Original route'}),
   insert('monitor_runs',{id:'run',space_id:space.id,status:'discovering',lock_token:'old-lease',active_job_id:'job',lease_generation:3,last_user_activity_at:new Date().toISOString()}),
   insert('monitor_scan_jobs',{id:'job',space_id:space.id,status:'discovering',advance_lock_token:'old-advance'}),
   insert('share_snapshots',{id:'share',space_id:space.id,token,kind:'paper',locale:'zh',title:'Fixture public snapshot',payload:JSON.stringify({version:1,kind:'paper',locale:'zh',spaceName:space.name,createdAt:new Date().toISOString(),papers:[{id:'p',title:'Fixture paper',authors:'Fixture',summaryZh:'Fixture saved text',summaryEn:'Fixture saved text'}]})}),
  ]);
  const queries=['research_spaces','monitored_papers','paper_insights','paper_reading_progress','paper_feedback','research_tracks','share_snapshots'].map(table=>({sql:`SELECT * FROM ${table} ORDER BY rowid`}));
  const before=(await sql(queries)).map(r=>r.results);
  assert.equal((await call('/api/spaces','DELETE',{id:space.id,confirmName:space.name},other)).status,404);
  assert.equal((await call('/api/spaces','DELETE',{id:space.id,confirmName:space.name},owner,{origin:'https://other.test'})).status,403);
  assert.equal((await call('/api/spaces','DELETE',{id:space.id,confirmName:'stale name'})).status,409);
  assert.equal((await call('/share/'+token)).status,200);
  const removed=await call('/api/spaces','DELETE',{id:space.id,confirmName:space.name});assert.equal(removed.status,200);const deletion=await removed.json();assert.equal(deletion.deleted,true);assert.ok(deletion.space.deletedAt);
  const list=await (await call('/api/spaces')).json();assert.deepEqual(list.spaces.map(s=>s.id),[second.id]);assert.equal(list.deletedSpaces[0].id,space.id);
  for(const [path,method,body] of [['/api/paper-reading?spaceId='+space.id+'&paperId=p','GET'],['/api/library/search?spaceId='+space.id,'GET'],['/api/library','PATCH',{spaceId:space.id,paperId:'p',readingStatus:'read',readingNote:'Must not be saved'}],['/api/ask','POST',{spaceId:space.id,question:'Must not call a model'}],['/api/monitor','POST',{spaceId:space.id,action:'start',trigger:'scheduled'}]])assert.equal((await call(path,method,body)).status,410,path);
  assert.equal((await call('/api/paper-reading?spaceId='+space.id+'&paperId=p','GET',undefined,other)).status,404,'deletion does not disclose other owners');
  assert.equal((await call('/api/monitor?spaceId='+encodeURIComponent(' '+space.id+' '))).status,410,'trimmed space IDs cannot bypass deletion');
  assert.equal((await call('/api/library','PATCH',{spaceId:space.id,paperId:'p',note:'Must not write'},owner,{'Content-Type':'text/plain'})).status,410,'JSON accepted by a route remains guarded regardless of its content type');
  assert.equal((await call('/share/'+token)).status,404,'public snapshot is hidden while its space is deleted');
  const pause=(await sql([{sql:'SELECT status,lock_token,active_job_id,lease_generation,automation_paused_at,automation_pause_reason FROM monitor_runs WHERE space_id=?',values:[space.id]},{sql:'SELECT status,advance_lock_token,failure_kind FROM monitor_scan_jobs WHERE space_id=?',values:[space.id]}])).map(r=>r.results[0]);
  assert.equal(pause[0].status,'idle');assert.equal(pause[0].lock_token,null);assert.equal(pause[0].active_job_id,null);assert.equal(pause[0].lease_generation,4);assert.equal(pause[0].automation_pause_reason,'space_deleted');assert.equal(pause[1].status,'error');assert.equal(pause[1].advance_lock_token,null);
  const again=await (await call('/api/spaces','DELETE',{id:space.id,confirmName:space.name})).json();assert.equal(again.space.deletedAt,deletion.space.deletedAt);
  assert.equal((await call('/api/spaces','PATCH',{id:space.id,action:'restore'},other)).status,404);
  assert.equal((await call('/api/spaces','PATCH',{id:space.id,action:'restore'})).status,200);
  assert.equal((await call('/api/spaces','PATCH',{id:space.id,action:'restore'})).status,200,'restore is idempotent');
  const restored=await (await call('/api/spaces')).json();assert.equal(restored.spaces.length,2);assert.equal(restored.deletedSpaces.length,0);
  assert.equal((await call('/api/paper-reading?spaceId='+space.id+'&paperId=p')).status,200);assert.equal((await call('/share/'+token)).status,200);
  const visit=await call('/api/monitor','POST',{spaceId:space.id,action:'start',trigger:'visit'});assert.equal(visit.status,200);const automation=(await visit.json()).monitor.automation;assert.equal(automation.paused,true);assert.equal(automation.pauseReason,'space_deleted');assert.match(automation.pauseMessageEn,/Scan now/);
  const after=(await sql(queries)).map(r=>r.results);assert.deepEqual(after,before,'spaces, owners, papers, notes, feedback, routes and snapshots retain their IDs and contents');assert.equal(outbound,0);
 }finally{await mf.dispose()}
});
