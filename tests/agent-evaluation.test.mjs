import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {buildPreferenceGuidance,feedbackChannel,feedbackExampleContext,feedbackSignalKind,PREFERENCE_GUIDANCE_RULES} from '../lib/feedback-policy.mjs';
import {candidatePoolHash,evaluatePersonalization} from '../lib/personalization-evaluation.mjs';
import {MEMORY_EVAL_CASES} from '../benchmarks/memory-ablation.mjs';

test('production guidance separates feedback intent and ablation scope',()=>{
 for(const task of MEMORY_EVAL_CASES)for(const mode of ['none','explicit','all']){
  const context=buildPreferenceGuidance(task.signals,{mode,now:Date.parse(task.asOf)});
  const routed=Object.entries(context).filter(([,v])=>Array.isArray(v)).flatMap(([channel,values])=>values.map(s=>[s.id,channel]));
  const expected=task.signals.filter(s=>s.expected&&mode!=='none'&&(mode==='all'||s.layer==='explicit')).map(s=>[s.id,s.expected]);
  assert.deepEqual(routed.sort(),expected.sort());
 }
 assert.equal(feedbackChannel('__proto__'),'paper');
 assert.equal(feedbackChannel('constructor'),'paper');
 assert.equal(feedbackSignalKind('weak_evidence','exclusion'),'quality');
 assert.throws(()=>buildPreferenceGuidance([],{mode:'unknown'}));
});

test('saved, quality and depth examples cannot silently become topic exclusion or mastery',async()=>{
 const rows=[
  {title:'Tentative',saved:1,feedback:null},
  {title:'Quality',feedback:'not_relevant',reason_code:'weak_evidence'},
  {title:'Depth',feedback:'not_relevant',reason_code:'too_shallow'},
  {title:'Mastered',feedback:'not_relevant',reason_code:'duplicate_known'},
  {title:'Scope',feedback:'not_relevant',reason_code:'topic_drift'},
  {title:'Unknown',feedback:'not_relevant',reason_code:null},
 ];
 const context=feedbackExampleContext(rows);
 assert.deepEqual(context.scope,['Scope [explicitly outside research scope]']);
 assert.match(context.interest[0],/not proof of relevance or mastery/);
 assert.equal(context.constraints.length,4);
 // Execute the production context assembly, rather than a parallel evaluator.
 const source=await readFile(new URL('../app/api/monitor/route.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true);
 const declaration=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='enrichSpaceWithImportedMemory');
 const code=ts.transpileModule(declaration.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const run=new Function('feedbackExampleContext','PREFERENCE_GUIDANCE_RULES','cleanText','parseVenues',code+';return enrichSpaceWithImportedMemory;')(feedbackExampleContext,PREFERENCE_GUIDANCE_RULES,s=>s,s=>JSON.parse(s||'[]'));
 const db={prepare(sql){return {bind(){return {async all(){return {results:sql.includes('FROM paper_feedback f')?rows:[]}}}}}}};
 const enriched=await run(db,{id:'fixture',name:'Fixture'});
 assert.match(enriched.negativeExamples,/Scope/);
 assert.doesNotMatch(enriched.negativeExamples,/Quality|Depth|Mastered|Tentative|Unknown/);
 assert.match(enriched.memoryContext,/quality: Quality/);
 assert.match(enriched.memoryContext,/mastery: Mastered/);
 assert.match(source,/JSON\.stringify\(buildPreferenceGuidance\(signals\)\)/);
 assert.match(source,/FEEDBACK_POLICY_VERSION \+ ":" \+ guidanceIdentity/);
});

const task={id:'a',contextId:'frozen',candidates:[
 {id:'x',title:'X',abstract:'A',gain:3,known:false,facets:['method']},
 {id:'y',title:'Y',abstract:'B',gain:1,known:true,facets:['foundation']},
 {id:'z',title:'Z',abstract:'C',gain:0,known:false,facets:[]},
]};
const runs=()=>['none','explicit','all'].map(variant=>({caseId:'a',variant,contextId:'frozen',poolHash:candidatePoolHash(task.candidates),model:'fixture-model',promptVersion:'p1',sourceCommit:'fixture',observedAt:'2026-09-20',ranking:['x','y','z']}));
test('ranking evaluator measures supplied order, handles missing costs and penalizes unfilled slots',()=>{
 const result=evaluatePersonalization([task],runs(),5);
 for(const row of result.metrics){assert.equal(row.precisionAtK,2/5);assert.equal(row.ndcgAtK,1);assert.equal(row.knownRate,1/3);assert.equal(row.facetCoverage,1);assert.equal(row.inputTokens,null);}
 const changed=runs();changed[0].ranking=['z','y','x'];
 assert.ok(evaluatePersonalization([task],changed).metrics[0].ndcgAtK<1);
 assert.equal(candidatePoolHash(task.candidates),candidatePoolHash(task.candidates.map(c=>({...c,gain:0,known:!c.known}))));
});
test('ranking evaluator refuses incomparable or malformed experiments',()=>{
 for(const mutate of [
  r=>r.pop(),r=>r[0].ranking.push('x'),r=>r[0].ranking.push('unknown'),
  r=>r[0].poolHash='wrong',r=>r[0].contextId='wrong',r=>r[0].model='other',
  r=>r[0].inputTokens=-1,r=>r[0].variant='invented'
 ]){const r=runs();mutate(r);assert.throws(()=>evaluatePersonalization([task],r));}
});
test('published evidence keeps historical stage boundaries and excludes private identifiers',async()=>{
 const raw=await readFile(new URL('../public/agent-evidence.json',import.meta.url),'utf8');
 const value=JSON.parse(raw);
 assert.equal(value.screening.formalRecommendationsAtSnapshot,0);
 assert.equal(value.verification.subsetSize,4);
 assert.equal(value.verification.published+value.verification.withheld+value.verification.pending,4);
 assert.doesNotMatch(raw,/"(?:spaceId|space_id|scanJobId|paperId|work_queue_json|note|prompt|token|apiKey)"/);
 assert.doesNotMatch(raw,/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
 const report=JSON.parse(await readFile(new URL('../public/agent-evaluation.json',import.meta.url),'utf8'));
 assert.equal(report.recommendationQuality.status,'not_run');
});
