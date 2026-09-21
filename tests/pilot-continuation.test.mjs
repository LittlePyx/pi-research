import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PILOT_SCENARIOS} from '../benchmarks/personalization/scenarios.mjs';
import {freezePilot,summarizePilot} from '../lib/personalization-pilot.mjs';
import {handleServerPilot} from '../lib/server-personalization-pilot.mjs';
import {continuePilot} from '../lib/pilot-continuation.mjs';
const papers=JSON.parse(await readFile(new URL('../benchmarks/personalization/candidates.json',import.meta.url),'utf8')).papers;
const experiment=freezePilot(PILOT_SCENARIOS,papers),sourceCommit='a'.repeat(40),executionSourceCommit='b'.repeat(40),token='fixture-only';

test('continuation runs only four missing cases, retains old failure and success bytes, and never retries any case',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../drizzle/0066_amused_crystal.sql',import.meta.url),'utf8'));
 const database={prepare(query){return {bind(...values){const s=sql.prepare(query);return {async first(){return s.get(...values)||null;},async run(){return {meta:{changes:Number(s.run(...values).changes)}};}};}};}};
 let modelCalls=0;
 const options={database,apiKey:'fixture',experiment,accessHash:createHash('sha256').update(token).digest('hex'),expiresAt:100,now:50,fetchImpl:async()=>{
  modelCalls++;return Response.json({model:'fixture',choices:[{finish_reason:'stop',message:{content:modelCalls===8||modelCalls===10?'{"recommendations":[{"id":"unknown"}]}':'{"recommendations":[]}'}}]});
 }};
 const invoke=(body)=>handleServerPilot(new Request('https://example.test/api/personalization-pilot',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)}),options);
 try {
  const jobs=experiment.cases.flatMap(t=>t.order.map(variant=>({caseId:t.id,variant,sourceCommit})));
  for(const job of jobs.slice(0,8))assert.equal((await invoke(job)).status,200);
  const old=sql.prepare('SELECT id,result_json FROM personalization_pilot_runs ORDER BY id').all();
  const cached=[],fresh=[];
  const settings={cases:experiment.cases,experimentHash:experiment.experimentHash,sourceCommit,executionSourceCommit,token,
   fetchImpl:async(_url,init)=>invoke(JSON.parse(init.body)),onRecord:(r,hit)=>{(hit?cached:fresh).push(r);}};
  const records=await continuePilot(settings);
  assert.equal(modelCalls,12);assert.equal(cached.length,8);assert.equal(fresh.length,4);
  for(const r of old)assert.equal(sql.prepare('SELECT result_json FROM personalization_pilot_runs WHERE id=?').get(r.id).result_json,r.result_json);
  assert.ok(fresh.every(r=>r.executionSourceCommit===executionSourceCommit&&r.sourceCommit===sourceCommit));
  assert.equal(records.filter(r=>r.status==='failed').length,2);
  assert.equal(summarizePilot(experiment,records).status,'completed_with_failures');
  await continuePilot(settings);assert.equal(modelCalls,12);
  assert.equal((await invoke({...jobs[0],executionSourceCommit:'invalid'})).status,400);
 } finally {sql.close();}
});

test('a new provider failure halts subsequent calls and preserves the terminal record',async()=>{
 let calls=0;const saved=[];
 await assert.rejects(continuePilot({cases:experiment.cases,experimentHash:experiment.experimentHash,sourceCommit,executionSourceCommit,token,
  fetchImpl:async(_url,init)=>{calls++;const body=JSON.parse(init.body);return Response.json({cached:false,record:{...body,experimentHash:experiment.experimentHash,status:'failed',errorCode:'rate_limited'}});},onRecord:r=>saved.push(r)}),/rate_limited/);
 assert.equal(calls,1);assert.equal(saved.length,1);assert.equal(saved[0].status,'failed');
});
