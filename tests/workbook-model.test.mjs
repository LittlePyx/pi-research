import test from 'node:test';
import assert from 'node:assert/strict';
import {requestWorkbookModel} from '../lib/workbook-model.ts';
import {workbookFailure, workbookRetryDelay, workbookFailureText, workbookValidationCode, workbookRecoveryHint,workbookResponseDetailText} from '../lib/workbook-recovery.ts';
import {resolveAnchoredWorkbook} from '../lib/workbook-evidence.ts';
import {workbookSources,anchoredSample} from './fixtures/research-workbook.mjs';
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
 assert.match(workbookRecoveryHint('invalid_response'), /JSON-escape/);
 assert.match(workbookRecoveryHint('invalid_json_response'), /preserve the original source/);
 assert.match(workbookRecoveryHint('overlong_workbook_field'), /never truncate/);
});
test('review recovery requires a complete audit and cannot request draft or patch output',()=>{
 const hint=workbookRecoveryHint('incomplete_workbook_review',true);
 assert.match(hint,/EVERY supplied requiredCheckId exactly once/);assert.match(hint,/exact sources\[\]\.id/);assert.match(hint,/REVIEW ONLY/);
 assert.doesNotMatch(hint,/paperId uses the source key|Preserve every required bilingual field/);
 assert.equal(workbookRecoveryHint('private provider body',true),'');
});

test('complete JSON fences are harmless wrappers but malformed math escapes and surrounding prose remain invalid',async()=>{
 const reply=content=>async()=>Response.json({choices:[{finish_reason:'stop',message:{content}}]});
 const json=JSON.stringify({quote:String.raw`A valid mathematical quote with \epsilon and "conditions".`});
 assert.deepEqual((await requestWorkbookModel('fixture','source',false,reply('```json\n'+json+'\n```'))).raw,JSON.parse(json));
 for(const content of [String.raw`{"quote":"invalid \epsilon escape"}`,'Here is the answer: '+json]){
  await assert.rejects(requestWorkbookModel('fixture','source',false,reply(content)),e=>e.code==='invalid_response'&&e.detail==='invalid_json_response');
 }
});

test('protocol diagnostics use fixed codes without retaining model content or unknown finish values',async()=>{
 const cases=[[{},'empty_model_response'],[{choices:[{finish_reason:'private provider text',message:{content:'{}'}}]},'unexpected_finish_reason']];
 for(const [body,detail]of cases)await assert.rejects(requestWorkbookModel('fixture','source',false,async()=>Response.json(body)),e=>{
  assert.equal(e.detail,detail);assert.doesNotMatch(JSON.stringify(e),/private provider text/);return true;
 });
});

test('one malformed response is retried with serialization feedback, the same deadline and combined usage',async()=>{
 let calls=0,signal;const diagnostics=[];
 const result=await requestWorkbookModel('fixture','source',false,async(_url,init)=>{
  const body=JSON.parse(init.body);calls++;
  assert.match(body.messages[0].content,/JSON-escape every literal backslash/);
  if(calls===1)signal=init.signal;
  else {assert.equal(init.signal,signal);assert.match(body.messages[2].content,/preserve the original source/);}
  return Response.json({choices:[{finish_reason:'stop',message:{content:calls===1?'bad JSON':'{"valid":true}'}}],usage:{prompt_tokens:10,completion_tokens:20}});
 },async error=>{diagnostics.push(error.detail);});
 assert.equal(calls,2);assert.equal(result.requests,2);assert.deepEqual(result.raw,{valid:true});
 assert.deepEqual(result.usage,{prompt_tokens:20,completion_tokens:40});assert.deepEqual(diagnostics,['invalid_json_response']);
});

test('automatic protocol recovery is bounded and never retries provider limits, authentication or truncated output',async()=>{
 for(const [reply,expectedCalls] of [
  [()=>Response.json({choices:[{finish_reason:'stop',message:{content:'bad JSON'}}]}),2],
  [()=>Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]}),1],
  [()=>new Response('',{status:429}),1],[()=>new Response('',{status:401}),1],
 ]){
  let calls=0;await assert.rejects(requestWorkbookModel('fixture','source',true,async()=>{calls++;return reply();}));assert.equal(calls,expectedCalls);
 }
});

test('automatic reviewer recovery remains audit-only and cannot ask for patches or approve evidence',async()=>{
 let calls=0;
 await requestWorkbookModel('fixture','source',true,async(_url,init)=>{
  const body=JSON.parse(init.body);calls++;
  if(calls===2){assert.match(body.messages[2].content,/REVIEW ONLY/);assert.match(body.messages[2].content,/never approve unsupported content/);}
  return Response.json({choices:[{finish_reason:'stop',message:{content:calls===1?'bad JSON':'{}'}}]});
 });assert.equal(calls,2);
});

test('structural and evidence failures have useful safe explanations and exact reference recovery',()=>{
 assert.match(workbookResponseDetailText('untraceable_workbook_instruction',true),/不存在或缺少出处/);
 for(const code of ['unlocated_workbook_evidence','invalid_workbook_patch','overlong_workbook_field','incomplete_workbook_review','untraceable_workbook_review','inconsistent_workbook_layout'])for(const zh of [true,false])assert.ok(workbookResponseDetailText(code,zh));
 assert.equal(workbookResponseDetailText('private provider body',true),'');
 assert.match(workbookRecoveryHint('untraceable_workbook_instruction'),/NONEMPTY/);
 assert.match(workbookRecoveryHint('untraceable_workbook_instruction'),/Never reference missing cells/);
 assert.match(workbookRecoveryHint('untraceable_workbook_instruction',true),/REVIEW ONLY/);
});

test('reference self-correction receives the failed candidate and must pass the original evidence validator',async()=>{
 const invalid=anchoredSample();invalid.task.steps[0].evidenceIds=['invented:p1'];let calls=0;const failures=[];let signal;
 const result=await requestWorkbookModel('fixture','source',false,async(_url,init)=>{
  calls++;if(calls===1)signal=init.signal;
  else {assert.equal(init.signal,signal);const repair=JSON.parse(JSON.parse(init.body).messages[2].content);assert.deepEqual(repair.previousResponse,invalid);assert.match(repair.feedback,/Never reference missing cells/);}
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(calls===1?invalid:anchoredSample())}}]});
 },async error=>failures.push(error.message),raw=>resolveAnchoredWorkbook(raw,workbookSources));
 assert.equal(calls,2);assert.equal(result.recoveryKind,'references');assert.deepEqual(failures,['untraceable_workbook_instruction']);
 assert.doesNotThrow(()=>resolveAnchoredWorkbook(result.raw,workbookSources));
});

test('reference recovery shares the single retry allowance and never repairs unsupported quotations',async()=>{
 for(const mode of ['persistent','json-first','bad-evidence']){
  let calls=0;
  await assert.rejects(requestWorkbookModel('fixture','source',false,async()=>{
   calls++;const wire=anchoredSample();if(mode==='bad-evidence')wire.dimensions[0].cells[0].quoteIds=['p1.invented'];else wire.task.steps[0].evidenceIds=['invented:p1'];
   return Response.json({choices:[{finish_reason:'stop',message:{content:mode==='json-first'&&calls===1?'bad JSON':JSON.stringify(wire)}}]});
  },undefined,raw=>resolveAnchoredWorkbook(raw,workbookSources)),error=>workbookFailure(error)==='invalid_evidence');
  assert.equal(calls,mode==='bad-evidence'?1:2);
 }
});
