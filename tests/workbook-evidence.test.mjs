import test from 'node:test';
import assert from 'node:assert/strict';
import { workbookEvidenceCatalog, anchoredWorkbookPrompt, resolveAnchoredWorkbook, workbookPatchPrompt, applyWorkbookPatches } from '../lib/workbook-evidence.ts';
import { workbookReviewFields, workbookRevision, validateWorkbook } from '../lib/research-workbook.ts';
import { workbookSources, anchoredSample, resolvedSample } from './fixtures/research-workbook.mjs';

const issue = id => ({id,paperIds:workbookSources.map(s=>s.id),reason:'Isolated correction fixture',issueType:'repairable'});
test('catalog spans preserve original math and whitespace and remain stable across source order',async()=>{
 const sources=structuredClone(workbookSources);sources[0].abstractText='  '+String.raw`A mathematical statement about $\alpha$ and "quoted text".  `+'x'.repeat(1300)+' final words.';
 const bank=workbookEvidenceCatalog(sources);
 assert.deepEqual(bank,workbookEvidenceCatalog([...sources].reverse()));
 for(const source of bank)for(const quote of source.quotes){assert.equal(quote.text,sources.find(s=>s.id===source.paperId).abstractText.slice(quote.start,quote.end));assert.ok(quote.text.length>=20&&quote.text.length<=1200);}
 assert.ok(bank.some(s=>s.quotes.some(q=>q.text.includes(String.raw`\alpha`))));
 assert.notEqual(await workbookRevision('q',sources),await workbookRevision('q',workbookSources),'catalog is fenced by the exact source revision');
});
test('anchored generation restores only server-owned quotes and canonical source references',()=>{
 const prompt=JSON.parse(anchoredWorkbookPrompt('question',workbookSources));
 assert.equal(prompt.evidenceProtocol,'anchors-v1');assert.ok(prompt.sources.every(s=>!('paperId'in s)));
 const content=resolveAnchoredWorkbook(anchoredSample(),workbookSources);
 assert.deepEqual(content,validateWorkbook(content,workbookSources));
 for(const d of content.dimensions)for(const c of d.cells)if(c.status==='supported')assert.ok(workbookSources.find(s=>s.id===c.paperId).abstractText.includes(c.quote));
 const unknown=anchoredSample();unknown.dimensions[0].cells[0].quoteId='p3.q999';assert.throws(()=>resolveAnchoredWorkbook(unknown,workbookSources),/unlocated_workbook_evidence/);
 const cross=anchoredSample();cross.dimensions[0].cells[0].quoteId='p1.q1';assert.throws(()=>resolveAnchoredWorkbook(cross,workbookSources),/unlocated_workbook_evidence/);
 const copied=anchoredSample();copied.dimensions[0].cells[0].quote='Do not accept arbitrary quote text';assert.throws(()=>resolveAnchoredWorkbook(copied,workbookSources),/unlocated_workbook_evidence/);
 const badref=anchoredSample();badref.comparison.evidenceIds=['conditions:p1'];assert.throws(()=>resolveAnchoredWorkbook(badref,workbookSources),/untraceable_workbook_instruction/);
});
test('a comparison patch preserves the independently approved question and every other field exactly',()=>{
 const before=resolvedSample(), issues=[issue('comparison')];
 const prompt=JSON.parse(workbookPatchPrompt('question',workbookSources,before,issues));
 assert.equal(prompt.correction.targets[0].id,'f1');assert.equal(prompt.contract,undefined);
 const comparison={...anchoredSample().comparison,textZh:'摘要信息不足，不能直接比较结果。',textEn:'The abstracts are insufficient for direct comparison.'};
 const after=applyWorkbookPatches({patches:[{id:'f1',value:comparison}]},before,workbookSources,issues);
 assert.notEqual(after.comparison.textZh,before.comparison.textZh);
 const {comparison: _old,...approved}=before,{comparison:_new,...preserved}=after;assert.deepEqual(approved,preserved);assert.deepEqual(before,resolvedSample(),'input checkpoint is never mutated');
 assert.deepEqual(workbookReviewFields(before),workbookReviewFields(after));
});
test('field patches reject unreviewed targets, extra properties, omissions, duplicates and full rewrites',()=>{
 const content=resolvedSample(),issues=[issue('comparison')],value=anchoredSample().comparison;
 for(const raw of [content,{patches:[]},{patches:[{id:'f2',value}]},{patches:[{id:'f1',value:{...value,questionZh:'Injected unapproved research question'}}]},{patches:[{id:'f1',value}],questionZh:'injected'}])assert.throws(()=>applyWorkbookPatches(raw,content,workbookSources,issues),/invalid_workbook_patch/);
 assert.throws(()=>applyWorkbookPatches({patches:[{id:'f1',value},{id:'f1',value}]},content,workbookSources,[issue('comparison'),issue('question')]),/invalid_workbook_patch/);
 assert.throws(()=>applyWorkbookPatches({patches:[{id:'f1',value}]},content,workbookSources,[{...issue('comparison'),issueType:'evidence_gap'}]),/invalid_workbook_patch/);
});
test('each bilingual field group and cell can be corrected without changing identities or order',()=>{
 const content=resolvedSample(),wire=anchoredSample(),cell=content.dimensions[1].cells[0];
 const ids=['question','dimension:metric',`cell:method:${cell.paperId}`,'task:title','task:step:0','task:criterion','learning:goal','learning:prerequisite','learning:exercise','learning:checkpoint'];
 const values=[{questionZh:'仅核对摘要中的工具。',questionEn:'Check only the tools named in the abstracts.'},{labelZh:'指标',labelEn:'Quantities',purposeZh:'核对名称。',purposeEn:'Check the names.'},{status:'supported',textZh:'核对原文。',textEn:'Check the source.',quoteId:wire.dimensions[1].cells[0].quoteId},{titleZh:'核对表',titleEn:'Audit table'},wire.task.steps[0],{criterionZh:'保留缺失项。',criterionEn:'Retain missing items.'},...['goal','prerequisite','exercise','checkpoint'].map(k=>({[`${k}Zh`]:'核对摘要。',[`${k}En`]:'Audit the abstracts.'}))];
 const after=applyWorkbookPatches({patches:values.map((value,i)=>({id:`f${i+1}`,value}))},content,workbookSources,ids.map(issue));
 assert.deepEqual(after.dimensions.map(d=>[d.id,d.cells.map(c=>c.paperId)]),content.dimensions.map(d=>[d.id,d.cells.map(c=>c.paperId)]));assert.deepEqual(after.comparison,content.comparison);assert.equal(after.task.steps.length,content.task.steps.length);
 const patch={patches:[{id:'f1',value:{status:'missing',textZh:'',textEn:'',quoteId:''}}]};
 assert.throws(()=>applyWorkbookPatches(patch,content,workbookSources,[issue(`cell:method:${cell.paperId}`)]),/untraceable_workbook_instruction/,'a cell correction cannot leave approved instructions with dangling references');
 const independent=structuredClone(content);independent.dimensions[2].cells[0]={...cell};
 const missing=applyWorkbookPatches(patch,independent,workbookSources,[issue(`cell:conditions:${cell.paperId}`)]);
 assert.equal(missing.dimensions[2].cells[0].status,'missing');assert.deepEqual(missing.questionEn,content.questionEn);
});
