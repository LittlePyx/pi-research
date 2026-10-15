import test from 'node:test';
import assert from 'node:assert/strict';
import {requestWorkbookModel} from '../lib/workbook-model.ts';
import {workbookFailure, workbookRetryDelay, workbookFailureText, workbookValidationCode, workbookRecoveryHint} from '../lib/workbook-recovery.ts';
test('comparison calls classify provider and response failures without forwarding error bodies',async()=>{
 const cases=[
  [()=>Response.json({error:'secret-key-and-prompt'}, {status:401}),'model_auth'],
  [()=>new Response('sensitive body',{status:429}),'rate_limited'],
  [()=>new Response('sensitive body',{status:503}),'model_unavailable'],
  [()=>Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]}),'output_truncated'],
  [()=>Response.json({choices:[{finish_reason:'stop',message:{content:'bad JSON'}}]}),'invalid_response'],
  [()=>new Response('not JSON'),'invalid_response'],
  [()=>{throw new DOMException('sensitive timeout','TimeoutError')},'timeout'],
 ];
 for(const [reply,expected] of cases){await assert.rejects(requestWorkbookModel('fixture','private source',false,async()=>reply()),e=>{
  assert.equal(workbookFailure(e),expected);assert.doesNotMatch(workbookFailureText(expected,true),/sensitive|secret-key|private source/);return true;
 });}
 assert.equal(workbookRetryDelay('timeout'),15000);assert.equal(workbookRetryDelay('rate_limited'),60000);
});
test('a successful comparison retains independent review and uses a finite deadline',async()=>{
 const result=await requestWorkbookModel('fixture','source',true,async(url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body.model,'deepseek-flash');assert.equal(body.thinking.type,'enabled');
  assert.equal(body.reasoning_effort,'low');assert.ok(init.signal instanceof AbortSignal);
  assert.match(body.messages[0].content,/Independently audit/);
  return Response.json({choices:[{finish_reason:'stop',message:{content:'{"valid":true}'}}]});
 });assert.deepEqual(result.raw,{valid:true});
});
test('draft extraction reserves its token budget for structured output, followed by separate review',async()=>{
 await requestWorkbookModel('fixture','source',false,async(_url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body.thinking.type,'disabled');assert.equal(body.reasoning_effort,undefined);
  assert.equal(body.max_tokens,12000);return Response.json({choices:[{finish_reason:'stop',message:{content:'{}'}}]});
 });
});
test('recovery feedback accepts only known validation codes and never arbitrary error text',()=>{
 assert.equal(workbookValidationCode(new Error('unlocated_workbook_evidence')),'unlocated_workbook_evidence');
 assert.match(workbookRecoveryHint('unlocated_workbook_evidence'),/without ellipses or paraphrase/);
 assert.equal(workbookRecoveryHint('private prompt or key'), '');
});
