import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { advanceWorkbookGraph, initialWorkbookGraphReview, restoreWorkbookGraphReview, workbookGraphNext } from '../lib/workbook-graph.ts';
import { workbookReviewFields, WORKBOOK_REVIEW_BATCH_SIZE } from '../lib/research-workbook.ts';
import { workbookSources, anchoredSample, resolvedSample } from './fixtures/research-workbook.mjs';

function fixture(mode='repairable') {
  const calls=[];
  const model=async(prompt,reviewer)=>{
    const input=JSON.parse(prompt);calls.push({input,reviewer});
    if(!reviewer)return input.correction ? {patches:[{id:'f1',value:{...anchoredSample().comparison,textEn:'The supplied excerpts do not provide definitions or assumptions needed for a direct result comparison.'}}]} : anchoredSample();
    const checks=input.requiredCheckIds.map(id=>({id,verdict:id==='comparison'&&mode!=='supported'?'unsupported':'supported',paperIds:workbookSources.map(s=>s.id),reason:'Isolated review fixture, not an academic judgment.',...(id==='comparison'&&mode!=='supported'?{issueType:mode}: {})}));
    return {verdict:checks.some(c=>c.verdict==='unsupported')?'unsupported':'supported',checks};
  };
  return {calls,model};
}
const empty=()=>({content:null,review:initialWorkbookGraphReview(),status:'verifying'});
const reload=s=>({...s,content:JSON.parse(JSON.stringify(s.content)),review:restoreWorkbookGraphReview(JSON.parse(JSON.stringify(s.review)),s.content,workbookSources)});
async function finish(s,model){for(let i=0;i<20&&s.status==='verifying';i++)s=await advanceWorkbookGraph('Compare only supplied excerpts',workbookSources,reload(s),model);return s;}

test('graph checkpoints one call per request and rechecks every corrected field with a bounded repair',async()=>{
  const {calls,model}=fixture();let s=empty();
  s=await advanceWorkbookGraph('question',workbookSources,s,model);assert.equal(calls.length,1);
  const total=workbookReviewFields(s.content).length;
  while(workbookGraphNext(s.content,s.review)==='review'){
    const before=calls.length;s=await advanceWorkbookGraph('question',workbookSources,reload(s),model);
    assert.equal(calls.length,before+1);assert.ok(calls.at(-1).input.requiredCheckIds.length<=WORKBOOK_REVIEW_BATCH_SIZE);
  }
  assert.equal(s.status,'verifying');assert.equal(s.review.checks.length,total);assert.equal(workbookGraphNext(s.content,s.review),'repair');
  const before=calls.length;s=await advanceWorkbookGraph('question',workbookSources,reload(s),model);
  assert.equal(calls.length,before+1);assert.equal(s.review.workflow.repairs,1);assert.equal(s.review.checks.length,0);
  assert.equal(s.review.workflow.previousIssues[0].id,'comparison');assert.equal(calls.at(-1).input.correction.issues[0].id,'comparison');
  s=await finish(s,model);assert.equal(s.status,'rejected');assert.equal(s.review.checks.length,total);
  assert.equal(calls.filter(c=>!c.reviewer).length,2,'one initial draft and at most one successful correction');
  const count=calls.length;await advanceWorkbookGraph('question',workbookSources,reload(s),model);assert.equal(calls.length,count,'a stopped run cannot call the model again');
});

test('evidence gaps stop without a correction or publication',async()=>{
  const {model,calls}=fixture('evidence_gap');const s=await finish(empty(),model);
  assert.equal(s.status,'rejected');assert.equal(s.review.workflow.repairs,0);assert.equal(calls.filter(c=>!c.reviewer).length,1);
});

test('all-supported fixtures use the same model-call budget as the baseline and validate identical content',async()=>{
  const {model,calls}=fixture('supported'),started=performance.now();const s=await finish(empty(),model);
  assert.equal(s.status,'ready');assert.deepEqual(s.content,resolvedSample());
  assert.equal(calls.length,1+Math.ceil(workbookReviewFields(s.content).length/WORKBOOK_REVIEW_BATCH_SIZE));
  assert.ok(performance.now()-started<3000,'isolated graph overhead should not consume a model-sized latency budget');
});

test('a transient model failure preserves earlier review batches for a fresh graph invocation',async()=>{
  const {model,calls}=fixture('supported');let s=await advanceWorkbookGraph('question',workbookSources,empty(),model);
  s=await advanceWorkbookGraph('question',workbookSources,reload(s),model);const persisted=JSON.stringify(s);
  await assert.rejects(advanceWorkbookGraph('question',workbookSources,reload(s),async()=>{throw new Error('timeout')}),/timeout/);
  assert.equal(JSON.stringify(s),persisted);
  const next=await advanceWorkbookGraph('question',workbookSources,reload(s),model);
  assert.equal(next.review.checks.length,WORKBOOK_REVIEW_BATCH_SIZE*2);
  assert.equal(calls.at(-1).input.requiredCheckIds.some(id=>s.review.checks.some(c=>c.id===id)),false);
});

test('invalid correction evidence cannot advance or consume the persisted repair allowance',async()=>{
  const {model}=fixture();let s=empty();while(workbookGraphNext(s.content,s.review)!=='repair')s=await advanceWorkbookGraph('question',workbookSources,reload(s),model);
  const before=JSON.stringify(s),invalid={patches:[{id:'f1',value:{...anchoredSample().comparison,evidenceIds:['invented:p1']}}]};
  await assert.rejects(advanceWorkbookGraph('question',workbookSources,reload(s),async()=>invalid),/untraceable_workbook_instruction/);
  assert.equal(JSON.stringify(s),before);assert.equal(s.review.workflow.repairs,0);
});

test('unclassified unsupported judgments cannot silently enter the repair branch',async()=>{
  const {model}=fixture('unclassified');await assert.rejects(finish(empty(),model),/invalid_workbook_review/);
  assert.throws(()=>restoreWorkbookGraphReview({workflow:{engine:'langgraph-v1',repairs:2},checks:[]},null,workbookSources),/invalid_workbook_review/);
});
