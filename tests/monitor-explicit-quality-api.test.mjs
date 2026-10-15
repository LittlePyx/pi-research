import test from 'node:test';
import assert from 'node:assert/strict';
import {glob} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';

test('explicit candidate review resumes a restored backlog without discovery or altering approved records', {timeout:60000}, async()=>{
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[],calls=[];
 for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
 const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,
  modules:[{type:'ESModule',path:root+'explicit-quality-fixture.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules],
  bindings:{DEEPSEEK_API_KEY:'sk-nonfunctional-fixture-only',PI_DEVELOPMENT_UNBOUNDED:'1'},
  outboundService:async request=>{const u=new URL(request.url);calls.push(u.href);assert.equal(u.hostname,'api.deepseek.com','candidate admission never queries discovery sources');return Response.json(u.pathname==='/models'?{data:[{id:'deepseek-flash'}]}:{choices:[{message:{content:'OK'}}]})},
 });
 const owner='explicit-quality-fixture-00001';
 const call=(path,body,identity=owner)=>mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{cookie:'pi_anonymous_workspace='+identity,'Content-Type':'application/json',origin:'http://localhost'},...(body?{body:JSON.stringify(body)}:{})});
 const sql=async rows=>(await(await call('/fixture',rows)).json());
 const insert=(table,value)=>({sql:`INSERT INTO ${table}(${Object.keys(value).join(',')}) VALUES(${Object.keys(value).map(()=>'?').join(',')})`,values:Object.values(value)});
 const clock='2026-08-20T00:00:00Z',pipelineVersion='continuous-recommendation-v17-core-evidence';
 try{
  await call('/api/monitor?spaceId=missing');
  for(const [id,status,checkpoint,failure] of [['restored','error','paused_space','space_deleted'],['ready','ready','main_complete',''],['interrupted','error','retry_pending','timeout'],['empty','ready','main_complete','']]){
   const work=JSON.stringify({pipelineVersion,scanMode:'quality_queue',candidateIds:[id],deepIds:[id],screens:[],resumeCheckpoint:id==='interrupted'?'deep_reviewing':''});
   await sql([
    insert('research_spaces',{id,owner_user_id:'anonymous:'+owner,name:id,member_name:'QA'}),
    insert('monitor_runs',{id:'run-'+id,space_id:id,status:id==='restored'?'idle':status,last_run_at:clock,last_user_activity_at:new Date().toISOString(),automation_pause_reason:id==='restored'?'space_deleted':'',automation_paused_at:id==='restored'?clock:null}),
    insert('monitor_scan_jobs',{id:'old-'+id,space_id:id,status,checkpoint,failure_kind:failure,work_queue_json:work,started_at:clock}),
    ...(id==='empty'?[]:[insert('monitored_papers',{id,space_id:id,canonical_id:'doi:'+id,title:'Quantum information '+id,url:'https://example.org/'+id,horizon:'years'}),insert('paper_insights',{paper_id:id,space_id:id,abstract_text:'Verifiable quantum communication source abstract. '.repeat(6),analysis_source:'metadata'})]),
    insert('monitored_papers',{id:'approved-'+id,space_id:id,canonical_id:'doi:approved-'+id,title:'Approved paper',horizon:'years'}),
    insert('paper_insights',{paper_id:'approved-'+id,space_id:id,analysis_source:'deepseek',ever_recommended:1,verification_status:'verified',summary_en:'Preserve this approved analysis.'}),
    insert('paper_reading_progress',{id:'note-'+id,paper_id:'approved-'+id,space_id:id,note:'Preserve my note.',status:'reading'}),
   ]);
  }
  const snapshot=async()=>(await sql([{sql:'SELECT * FROM paper_insights ORDER BY paper_id'},{sql:'SELECT * FROM paper_reading_progress ORDER BY id'},{sql:"SELECT * FROM monitor_scan_jobs WHERE id LIKE 'old-%' ORDER BY id"}])).map(x=>x.results);
  const before=await snapshot();
  const start={action:'start',trigger:'manual',reviewPending:true};
  assert.equal((await call('/api/monitor',{...start,spaceId:'restored'},'another-quality-fixture-0001')).status,404);
  assert.equal((await call('/api/monitor',{...start,spaceId:'restored',trigger:'visit'})).status,400);
  assert.equal((await call('/api/monitor',{...start,spaceId:'restored',trigger:'scheduled'})).status,400);
  const visit=await(await call('/api/monitor',{spaceId:'restored',action:'start',trigger:'visit'})).json();assert.equal(visit.monitor.automation.paused,true);assert.equal(calls.length,0);
  const empty=await call('/api/monitor',{...start,spaceId:'empty'});assert.equal(empty.status,200);assert.equal(calls.length,0,'empty review cannot fall back to discovery or model calls');
  for(const id of ['restored','ready','interrupted']){
   const r=await call('/api/monitor',{...start,spaceId:id});assert.equal(r.status,202,await r.clone().text());const m=(await r.json()).monitor;assert.equal(m.leaseOwner,true);
   const j=(await sql([{sql:'SELECT checkpoint,work_queue_json FROM monitor_scan_jobs WHERE id=?',values:[m.scanJob.id]}]))[0].results[0];
   assert.equal(j.checkpoint,id==='interrupted'?'deep_reviewing':'deduplicating');assert.equal(JSON.parse(j.work_queue_json).scanMode,'quality_queue');
   if(id!=='interrupted')assert.deepEqual(JSON.parse(j.work_queue_json).discoveredCandidateIds,['doi:'+id]);
   const follower=await call('/api/monitor',{...start,spaceId:id});assert.equal(follower.status,202);assert.equal((await follower.json()).monitor.leaseOwner,false);
   assert.equal((await sql([{sql:'SELECT last_run_at,automation_pause_reason FROM monitor_runs WHERE space_id=?',values:[id]}]))[0].results[0].last_run_at,clock);
  }
  assert.equal(calls.length,6,'only one credential probe pair per claimed run');
  assert.deepEqual(await snapshot(),before,'admission preserves papers, notes and old checkpoints');
  assert.equal((await sql([{sql:"SELECT automation_pause_reason FROM monitor_runs WHERE space_id='restored'"}]))[0].results[0].automation_pause_reason,'');
 }finally{await mf.dispose()}
});
