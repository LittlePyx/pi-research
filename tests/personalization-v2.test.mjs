import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {abstractExcerpts} from '../lib/abstract-excerpts.mjs';
import {freezePilotV2,pilotRequestV2,parsePilotResponseV2,executePilotRunV2,summarizePilotV2} from '../lib/personalization-pilot-v2.mjs';
import {V2_SCENARIOS} from '../benchmarks/personalization/scenarios-v2.mjs';
import {handleServerPilot} from '../lib/server-personalization-pilot.mjs';
import {continuePilot} from '../lib/pilot-continuation.mjs';
import {isReadReference,readingReferences,briefPaperEntries} from '../lib/today-presentation.mjs';
const papers=JSON.parse(await readFile(new URL('../benchmarks/personalization/candidates.json',import.meta.url),'utf8')).papers;
const experiment=freezePilotV2(V2_SCENARIOS,papers),task=experiment.cases[0];
const response=rows=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({rankedPapers:rows})}}]});
const item=paper=>({id:paper.id,reason:'Fixture reason, not model output.',evidenceId:paper.evidence[0].id});

test('v2 freeze retains exact excerpts and repeated inputs, without leaking known labels into none',async()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(experiment)),JSON.parse(await readFile(new URL('../benchmarks/personalization/protocol-v2.json',import.meta.url),'utf8')));
 assert.equal(experiment.cases.length*3,12);
 for(const t of experiment.cases)for(const p of t.candidates)for(const e of p.evidence)assert.ok(p.abstract.includes(e.text)&&e.text.length>=20&&e.text.length<=400);
 for(const s of V2_SCENARIOS)for(const variant of ['none','explicit','all']){
  const pair=experiment.cases.filter(t=>t.scenarioId===s.id);
  assert.deepEqual(pilotRequestV2(experiment,pair[0],variant),pilotRequestV2(experiment,pair[1],variant));
 }
 const none=JSON.parse(pilotRequestV2(experiment,task,'none').messages[1].content);
 assert.deepEqual(none.knownPaperIds,[]);assert.doesNotMatch(JSON.stringify(none.memory),/Already read/);
 assert.ok(none.candidates.every(p=>!('known' in p)&&!('gain' in p)));
 const long='Original  spacing stays. '+('An exact source sentence with mathematical symbols $x$. '.repeat(20));
 assert.ok(abstractExcerpts(long,'a').every(e=>long.includes(e.text)));
});

test('numbered references reject invented/cross-paper IDs and route only explicitly known papers',()=>{
 const known=task.candidates.find(p=>task.knownIds.includes(p.id)),other=task.candidates.find(p=>!task.knownIds.includes(p.id));
 const rows=[item(known),item(other)];
 const noMemory=parsePilotResponseV2(response(rows),task,'none');
 assert.deepEqual(noMemory.ranking,[known.id,other.id]);assert.deepEqual(noMemory.references,[]);
 const explicit=parsePilotResponseV2(response(rows),task,'explicit');
 assert.deepEqual(explicit.ranking,[other.id]);assert.deepEqual(explicit.referenceRanking,[known.id]);assert.deepEqual(explicit.rawRanking,[known.id,other.id]);
 assert.equal(explicit.references[0].quote,known.evidence[0].text);
 assert.throws(()=>parsePilotResponseV2(response([{...item(known),evidenceId:other.evidence[0].id}]),task,'all'),/invalid_evidence_id/);
 assert.throws(()=>parsePilotResponseV2(response([{...item(known),evidenceId:'invented'}]),task,'all'),/invalid_evidence_id/);
 assert.throws(()=>parsePilotResponseV2(response([item(known),item(known)]),task,'all'),/duplicate_candidate/);
 const unknowns=task.candidates.filter(p=>!task.knownIds.includes(p.id)).slice(0,6).map(item);
 assert.throws(()=>parsePilotResponseV2(response(unknowns),task,'explicit'),/reading_slot_limit/);
});

test('v2 records are separate immutable attempts and failed repetitions are never counted as stable',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../drizzle/0066_amused_crystal.sql',import.meta.url),'utf8'));
 const database={prepare(query){return {bind(...values){const s=sql.prepare(query);return {async first(){return s.get(...values)||null;},async run(){return {meta:{changes:Number(s.run(...values).changes)}};}};}};}};
 const token='test-only',sourceCommit='b'.repeat(40);let calls=0;
 const options={database,apiKey:'fixture-only',experiment,executeRun:executePilotRunV2,accessHash:createHash('sha256').update(token).digest('hex'),expiresAt:100,now:50,
  fetchImpl:async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);return Response.json(response([{id:input.candidates[0].id,reason:'Fixture reason',evidenceId:calls===2?'invalid':input.candidates[0].evidence[0].id}]));}};
 try{
  sql.prepare("INSERT INTO personalization_pilot_runs VALUES (?,?,?,?,?,?,?,?)").run('old','legacy','a'.repeat(40),'legacy','none','failed','{"legacy":true}',1);
  const settings={cases:experiment.cases,experimentHash:experiment.experimentHash,sourceCommit,executionSourceCommit:sourceCommit,token,endpoint:'/api/personalization-pilot-v2',fetchImpl:async(url,init)=>{assert.equal(url,'/api/personalization-pilot-v2');return handleServerPilot(new Request('https://fixture.test'+url,init),options);}};
  const records=await continuePilot(settings);assert.equal(calls,12);
  await continuePilot(settings);assert.equal(calls,12);
  assert.equal(sql.prepare('SELECT result_json FROM personalization_pilot_runs WHERE id=?').get('old').result_json,'{"legacy":true}');
  const summary=summarizePilotV2(experiment,records);assert.equal(summary.failedRuns,1);assert.equal(summary.qualityMetrics,null);
  assert.equal(summary.stability.filter(s=>!s.available).length,1);
  const corrupted=structuredClone(records);const first=corrupted.find(r=>r.status==='completed');(first.recommendations[0]||first.references[0]).quote='fabricated';
  assert.throws(()=>summarizePilotV2(experiment,corrupted),/changed_output/);
  assert.doesNotMatch(JSON.stringify(records),/fixture-only/);
 }finally{sql.close();}
});

test('read references preserve brief positions and distinguish saved/open from explicit reading',()=>{
 const papers=[{id:'read',readingStatus:'read',qualityStage:'recommended'},{id:'known',readingStatus:'mastered',qualityStage:'recommended'},{id:'new',readingStatus:'unread',saved:true,openedAt:'now',qualityStage:'recommended'},{id:'progress',readingStatus:'reading',qualityStage:'recommended'},{id:'unreviewed',readingStatus:'read',qualityStage:'queued'}];
 const before=structuredClone(papers);
 assert.deepEqual(readingReferences(papers).map(p=>p.id),['read','known']);
 assert.deepEqual(briefPaperEntries(papers.map(p=>p.id),papers).filter(e=>!isReadReference(e.paper)).map(e=>e.briefIndex),[2,3]);
 assert.deepEqual(papers,before);
 papers[1].readingStatus='unread';assert.equal(isReadReference(papers[1]),false);
});
