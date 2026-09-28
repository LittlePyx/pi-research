import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
const compiled=await build({entryPoints:['lib/paper-review-refresh.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {advanceReviewRefresh,readReviewRefresh,reviewRefreshSchema,reviewTextFields}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const textFields=[...reviewTextFields.flatMap(f=>[f+'_zh',f+'_en']),'research_questions_zh','research_questions_en'];
async function fixture(run){
 const mf=new Miniflare({host:'127.0.0.1',cf:false,modules:true,d1Databases:['DB'],script:'export default {fetch(){return new Response("QA")}}'});
 try{
  const db=await mf.getD1Database('DB');
  await db.batch([db.prepare(reviewRefreshSchema),db.prepare(`CREATE TABLE paper_insights(space_id TEXT,paper_id TEXT,abstract_text TEXT,${textFields.map(f=>f+" TEXT DEFAULT 'Original evidence-grounded draft'").join(',')},verification_json TEXT DEFAULT '{}',verification_status TEXT DEFAULT 'verified',verification_coverage_score INTEGER DEFAULT 95,analysis_source TEXT DEFAULT 'deepseek',llm_recommended INTEGER DEFAULT 1,updated_at TEXT,reading_note TEXT DEFAULT 'User note',reading_status TEXT DEFAULT 'reading',quality_score INTEGER DEFAULT 88,PRIMARY KEY(space_id,paper_id))`)]);
  await db.prepare('INSERT INTO paper_insights(space_id,paper_id,abstract_text) VALUES (?,?,?)').bind('s','p','An independently identified source abstract. '.repeat(20)).run();
  await run(db);
 }finally{await mf.dispose()}
}
function result(){
 const r={recommended:true,verificationStatus:'revised',verificationCoverageScore:95,verificationRetryable:false,verificationReport:{status:'revised'}};
 for(const f of textFields)r[f.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())]=f.startsWith('research_questions')?['Question one?','Question two?']:'Corrected scope, grounded in the full abstract.';
 return r;
}
test('verified refresh replaces explanation fields atomically, preserves user state, and does not repeat on retry',()=>fixture(async db=>{
 let calls=0;
 const audit=async()=>{calls++;return result()};
 assert.equal((await advanceReviewRefresh(db,'s','p',audit)).status,'ready');
 const row=await db.prepare('SELECT * FROM paper_insights').first();
 assert.match(row.limitations_zh,/Corrected scope/);
 assert.equal(row.reading_note,'User note');assert.equal(row.reading_status,'reading');assert.equal(row.quality_score,88);
 assert.equal((await advanceReviewRefresh(db,'s','p',audit)).status,'ready');assert.equal(calls,1);
 assert.equal((await readReviewRefresh(db,'another','p')).eligible,false);
}));
test('parallel requests share a lease and only one calls the model',()=>fixture(async db=>{
 let start,finish;const started=new Promise(r=>start=r),wait=new Promise(r=>finish=r);let calls=0;
 const first=advanceReviewRefresh(db,'s','p',async()=>{calls++;start();await wait;return result()});await started;
 const second=await advanceReviewRefresh(db,'s','p',async()=>{calls++;return result()});
 assert.equal(second.busy,true);finish();await first;assert.equal(calls,1);
}));
test('correction checkpoint survives transport failure without repeating its completed audit',()=>fixture(async db=>{
 let initial=0,correction=0;
 assert.equal((await advanceReviewRefresh(db,'s','p',async()=>{initial++;return {...result(),verificationStatus:'pending',verificationRetryable:true,verificationReport:{correctionRequested:true,audit:{verdict:'revise'}}}})).status,'correction');
 await assert.rejects(advanceReviewRefresh(db,'s','p',async draft=>{assert.ok(draft.verificationReport.correctionRequested);correction++;throw Error('timeout')}));
 assert.equal((await db.prepare('SELECT limitations_zh FROM paper_insights').first()).limitations_zh,'Original evidence-grounded draft');
 await advanceReviewRefresh(db,'s','p',async()=>{throw Error('must respect retry time')});
 await db.prepare('UPDATE paper_review_refresh SET retry_at=0').run();
 assert.equal((await advanceReviewRefresh(db,'s','p',async draft=>{assert.ok(draft.verificationReport.correctionRequested);correction++;return result()})).status,'ready');
 assert.equal(initial,1);assert.equal(correction,2);
}));
test('failed content verification retains the original review',()=>fixture(async db=>{
 await assert.rejects(advanceReviewRefresh(db,'s','p',async()=>({...result(),recommended:false,verificationStatus:'degraded'})),/verification_failed/);
 assert.equal((await db.prepare('SELECT limitations_zh FROM paper_insights').first()).limitations_zh,'Original evidence-grounded draft');
}));
test('a changed abstract or newer review cannot be overwritten by late model output',async()=>{
 for(const field of ['abstract_text','limitations_zh'])await fixture(async db=>{
  await assert.rejects(advanceReviewRefresh(db,'s','p',async()=>{await db.prepare(`UPDATE paper_insights SET ${field}=?`).bind('New concurrent content. '.repeat(30)).run();return result()}),/source_changed/);
  assert.match((await db.prepare(`SELECT ${field} FROM paper_insights`).first())[field],/New concurrent content/);
 });
});
test('a failed publication reuses the already verified checkpoint without paying for another audit',()=>fixture(async db=>{
 let fail=true,calls=0;
 const flaky={prepare:(...args)=>db.prepare(...args),batch:async statements=>{if(fail){fail=false;throw Error('temporary write failure')}return db.batch(statements)}};
 await assert.rejects(advanceReviewRefresh(flaky,'s','p',async()=>{calls++;return result()}),/temporary write failure/);
 await db.prepare('UPDATE paper_review_refresh SET retry_at=0').run();
 assert.equal((await advanceReviewRefresh(flaky,'s','p',async()=>{calls++;return result()})).status,'ready');
 assert.equal(calls,1);
}));
