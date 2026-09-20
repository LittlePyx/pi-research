import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PILOT_SCENARIOS} from '../benchmarks/personalization/scenarios.mjs';
import {freezePilot} from '../lib/personalization-pilot.mjs';
import {handleServerPilot} from '../lib/server-personalization-pilot.mjs';
const papers=JSON.parse(await readFile(new URL('../benchmarks/personalization/candidates.json',import.meta.url),'utf8')).papers;
const experiment=freezePilot(PILOT_SCENARIOS,papers),token='isolated-test-token',accessHash=createHash('sha256').update(token).digest('hex');
test('server pilot authenticates a fixed expiring capability and atomically limits each case to one call',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../drizzle/0066_amused_crystal.sql',import.meta.url),'utf8'));
 const database={prepare(query){return {bind(...values){
  const statement=sql.prepare(query);
  return {async first(){return statement.get(...values)||null;},async run(){return {meta:{changes:Number(statement.run(...values).changes)}};}};
 }};}};
 let calls=0;
 const options={database,apiKey:'fixture-not-real',experiment,accessHash,expiresAt:100,now:50,fetchImpl:async()=>{calls++;return Response.json({model:'fixture',choices:[{finish_reason:'stop',message:{content:'{"recommendations":[]}'}}]});}};
 const body={caseId:experiment.cases[0].id,variant:'none',sourceCommit:'a'.repeat(40)};
 const request=(b=body,key=token)=>new Request('https://example.test/api/personalization-pilot',{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify(b)});
 try{
  assert.equal((await handleServerPilot(request(body,'wrong'),options)).status,401);
  assert.equal((await handleServerPilot(request(),{...options,now:100})).status,410);
  assert.equal((await handleServerPilot(request({...body,prompt:'arbitrary'}),options)).status,400);
  assert.equal((await handleServerPilot(request({...body,caseId:'unknown'}),options)).status,400);
  assert.equal(calls,0);
  const [a,b]=await Promise.all([handleServerPilot(request(),options),handleServerPilot(request(),options)]);
  assert.equal(calls,1);assert.ok([a.status,b.status].includes(200));
  const cached=await (await handleServerPilot(request(),options)).json();assert.equal(cached.cached,true);assert.equal(calls,1);
  assert.equal(cached.record.sourceCommit,body.sourceCommit);assert.equal(cached.record.status,'completed');
  assert.equal((await handleServerPilot(request({...body,variant:'all',sourceCommit:'b'.repeat(40)}),options)).status,409);
  const failedOptions={...options,fetchImpl:async()=>{calls++;return new Response('unavailable',{status:503});}};
  const failed=await (await handleServerPilot(request({...body,variant:'explicit'}),failedOptions)).json();assert.equal(failed.record.status,'failed');
  await handleServerPilot(request({...body,variant:'explicit'}),failedOptions);assert.equal(calls,2);
  assert.doesNotMatch(JSON.stringify(cached),/fixture-not-real|isolated-test-token/);
 }finally{sql.close();}
});
