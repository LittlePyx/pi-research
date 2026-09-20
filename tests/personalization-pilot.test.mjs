import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PILOT_SCENARIOS} from '../benchmarks/personalization/scenarios.mjs';
import {freezePilot,pilotRequest,parsePilotResponse,executePilotRun,summarizePilot} from '../lib/personalization-pilot.mjs';
const papers=JSON.parse(await readFile(new URL('../benchmarks/personalization/candidates.json',import.meta.url),'utf8')).papers;
const experiment=freezePilot(PILOT_SCENARIOS,papers),task=experiment.cases[0];
const valid=()=>({model:'provider-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify({recommendations:[{id:task.candidates[0].id,quote:task.candidates[0].abstract.slice(0,70),reason:'Fixture reason; this test is not an academic assessment.'}]})}}],usage:{prompt_tokens:100,completion_tokens:20}});

test('pilot freezes sourced pools and strips all judgments and hidden memory from model requests',()=>{
 assert.equal(experiment.cases.length,4);assert.equal(papers.length,18);
 for(const t of experiment.cases){
  assert.equal(t.candidates.length,12);
  const requests=['none','explicit','all'].map(mode=>pilotRequest(experiment,{...t,candidates:t.candidates.map(p=>({...p,gain:3,known:true,facets:['secret-label'],reason:'secret-review'}))},mode));
  const inputs=requests.map(r=>JSON.parse(r.messages[1].content));
  assert.deepEqual(inputs[0].candidates,inputs[1].candidates);assert.deepEqual(inputs[1].candidates,inputs[2].candidates);
  assert.equal(Object.values(inputs[0].memory).filter(Array.isArray).flat().length,0);
  assert.ok(Object.values(inputs[1].memory).filter(Array.isArray).flat().every(s=>s.layer==='explicit'));
  assert.ok(Object.values(inputs[2].memory).filter(Array.isArray).flat().some(s=>s.layer==='inferred'));
  for(const r of requests){assert.doesNotMatch(JSON.stringify(r),/secret-label|secret-review|"known":|"gain":|"facets":|"knownIds":/);assert.equal(r.max_tokens,2200);assert.equal(r.temperature,0);}
 }
 const changed=structuredClone(PILOT_SCENARIOS);changed[0].signals[0].labelEn+=' changed';
 assert.notEqual(freezePilot(changed,papers).experimentHash,experiment.experimentHash);
});
test('pilot rejects truncated, unknown, duplicate and ungrounded rankings without repairing them',()=>{
 assert.equal(parsePilotResponse(valid(),task).length,1);
 for(const mutate of [d=>d.choices[0].finish_reason='length',d=>d.choices[0].message.content='invalid',d=>{const p=JSON.parse(d.choices[0].message.content);p.recommendations[0].id='unknown';d.choices[0].message.content=JSON.stringify(p);},d=>{const p=JSON.parse(d.choices[0].message.content);p.recommendations.push(p.recommendations[0]);d.choices[0].message.content=JSON.stringify(p);},d=>{const p=JSON.parse(d.choices[0].message.content);p.recommendations[0].quote='Fabricated quote is not in any source abstract';d.choices[0].message.content=JSON.stringify(p);}]){const d=valid();mutate(d);assert.throws(()=>parsePilotResponse(d,task));}
});
test('real-call adapter records actual usage, preserves failures and never serializes credentials',async()=>{
 let calls=0;
 const run=await executePilotRun(experiment,task,'none',{apiKey:'test-secret-not-real',sourceCommit:'test-fixture',fetchImpl:async(url,init)=>{calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(init.headers.Authorization,'Bearer test-secret-not-real');return Response.json(valid());}});
 assert.equal(calls,1);assert.equal(run.status,'completed');assert.equal(run.inputTokens,100);assert.equal(run.outputTokens,20);assert.doesNotMatch(JSON.stringify(run),/test-secret/);
 const failed=await executePilotRun(experiment,task,'explicit',{apiKey:'test-secret-not-real',sourceCommit:'test-fixture',fetchImpl:async()=>new Response('upstream echoes secret',{status:429,headers:{'Retry-After':'120'}})});
 assert.equal(failed.status,'failed');assert.equal(failed.retryAfter,'120');assert.equal(failed.inputTokens,null);assert.equal(failed.ranking,undefined);assert.doesNotMatch(JSON.stringify(failed),/upstream|secret/);
 const report=summarizePilot(experiment,[run,failed]);assert.equal(report.completedRuns,1);assert.equal(report.qualityMetrics,null);
 assert.throws(()=>summarizePilot(experiment,[{...run,ranking:['invented']}]));
 assert.throws(()=>summarizePilot(experiment,[{...run,requestHash:'altered'}]));
 assert.throws(()=>summarizePilot(experiment,[run,run]));
});
