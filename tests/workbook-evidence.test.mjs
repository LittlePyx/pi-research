import test from 'node:test';
import assert from 'node:assert/strict';
import { workbookEvidenceCatalog, anchoredWorkbookPrompt, resolveAnchoredWorkbook, workbookPatchPrompt, applyWorkbookPatches, validateWorkbookLayout } from '../lib/workbook-evidence.ts';
import { workbookReviewFields, workbookRevision, validateWorkbook, workbookPaperLabel } from '../lib/research-workbook.ts';
import { workbookReviewPrompt } from '../lib/workbook-graph.ts';
import { workbookSources, anchoredSample, resolvedSample } from './fixtures/research-workbook.mjs';

const issue = id => ({id,paperIds:workbookSources.map(s=>s.id),reason:'Isolated correction fixture',issueType:'repairable'});
test('generated task layout must agree with dimension rows and paper columns',()=>{
 const wire=anchoredSample();wire.task.steps[0].textEn='Make one column per dimension with the two papers as rows.';
 assert.throws(()=>resolveAnchoredWorkbook(wire,workbookSources),/inconsistent_workbook_layout/);
 const content=resolvedSample();content.task.steps[0].textZh='为每个维度建一列，两篇论文各占一行。';assert.throws(()=>validateWorkbookLayout(content),/inconsistent_workbook_layout/);
 const p=JSON.parse(anchoredWorkbookPrompt('q',workbookSources));assert.deepEqual(p.tableLayout,{rows:'comparison dimensions',columns:'selected papers'});
});

test('new drafts and field corrections cannot assign hidden catalog identifiers to readers',()=>{
 for(const [key,text] of [['exerciseEn','For each claim cite the displayed source-passage identifiers.'],['checkpointEn','Attach source-passage IDs to every cell.'],['goalEn','List p1.q3 and quoteIds.'],['prerequisiteZh','填写原文片段ID。']]){
  const wire=anchoredSample();wire.learning[key]=text;
  assert.throws(()=>resolveAnchoredWorkbook(wire,workbookSources),/internal_workbook_instruction/);
 }
 const before=resolvedSample(),value={criterionZh:'填写证据ID。',criterionEn:'Attach evidence IDs.'};
 assert.throws(()=>applyWorkbookPatches({patches:[{id:'f1',value}]},before,workbookSources,[issue('task:criterion')]),/internal_workbook_instruction/);
 assert.deepEqual(before,resolvedSample(),'invalid instructions cannot mutate approved content');
 const visible=resolvedSample();visible.learning.exerciseEn='Name P1 and P2 and quote the exact words from their displayed passages.';
 assert.doesNotThrow(()=>validateWorkbookLayout(visible));
 const legacy=structuredClone(visible);legacy.learning.exerciseEn='Cite source-passage IDs.';
 assert.doesNotThrow(()=>validateWorkbook(legacy,workbookSources),'historical canonical records remain readable');
});

test('channel repetitions cannot be translated into qubit dimension in a supported observation',()=>{
 const content=resolvedSample(),cell=content.dimensions[0].cells[0];
 cell.quote='Four uses of the qubit erasure channel and four messages give a strict gap.';cell.quotes=[cell.quote];
 cell.textZh='四比特擦除信道与四条消息存在严格差距。';cell.textEn='Four uses of the qubit erasure channel give a gap.';
 assert.throws(()=>validateWorkbookLayout(content),/workbook_channel_uses_translation/);
 cell.textZh='量子比特擦除信道使用四次、发送四条消息时存在严格差距。';assert.doesNotThrow(()=>validateWorkbookLayout(content));
 cell.textEn='A four-qubit erasure channel gives a gap.';assert.throws(()=>validateWorkbookLayout(content),/workbook_channel_uses_translation/);
 cell.quote='Ten uses of the qubit erasure channel give a gap.';cell.quotes=[cell.quote];cell.textZh='量子比特信道使用十次。';cell.textEn='Ten channel uses.';assert.doesNotThrow(()=>validateWorkbookLayout(content));
 cell.textZh='十比特擦除信道。';assert.throws(()=>validateWorkbookLayout(content),/workbook_channel_uses_translation/);
 cell.textZh='1比特擦除信道使用十次。';assert.doesNotThrow(()=>validateWorkbookLayout(content),'ten repetitions do not contradict a single-qubit dimension');
});
test('separate passages are preserved individually and every passage must belong to the same source',()=>{
 const sources=structuredClone(workbookSources);sources[0].abstractText='The object is a model with twelve configurations. '+ 'Intervening context is retained in the source. '.repeat(40)+'The evaluation reports context gain under matched conditions.';
 const wire=anchoredSample(sources.map((s,i)=>i?s:{...s,abstractText:workbookSources[0].abstractText+' '+s.abstractText}));
 const augmented=sources.map((s,i)=>i?s:{...s,abstractText:workbookSources[0].abstractText+' '+s.abstractText}),bank=workbookEvidenceCatalog(augmented),paper=bank.find(s=>s.paperId===sources[0].id);
 const first=paper.quotes.find(q=>q.text.includes('twelve configurations')),last=paper.quotes.find(q=>q.text==='The evaluation reports context gain under matched conditions.');
 wire.dimensions[0].cells[0].quoteIds=[first.id,last.id];
 const resolved=resolveAnchoredWorkbook(wire,augmented),cell=resolved.dimensions[0].cells[0];assert.equal(cell.quotes.length,2);assert.ok(cell.quotes[0].includes(first.text));assert.ok(cell.quotes[1].includes(last.text));assert.equal(cell.quote,cell.quotes[0]);assert.ok(cell.quotes.every(q=>augmented[0].abstractText.includes(q)));assert.equal(cell.quotes.some(q=>q.includes('…')),false);
 const forged=structuredClone(resolved);forged.dimensions[0].cells[0].quotes[1]='Invented second passage that is absent from the abstract.';assert.throws(()=>validateWorkbook(forged,augmented),/unlocated_workbook_evidence/);
 wire.dimensions[0].cells[0].quoteIds=[first.id,bank.find(s=>s.paperId!==sources[0].id).quotes[0].id];assert.throws(()=>resolveAnchoredWorkbook(wire,augmented),/unlocated_workbook_evidence/);
 wire.dimensions[0].cells[0].quoteIds=[first.id,first.id];assert.throws(()=>resolveAnchoredWorkbook(wire,augmented),/unlocated_workbook_evidence/);
});

test('a short exponent citation retains its exact antecedent in both the prompt and materialized evidence',()=>{
 const sources=structuredClone(workbookSources),context='Reliability is measured using an error exponent. A universal reliability bound matches the converse at high rates. Specifically, these exponents depend on the stated divergences.';sources[0].abstractText+='. '+context;
 const catalog=workbookEvidenceCatalog(sources).find(s=>s.paperId===sources[0].id),anchor=catalog.quotes.filter(q=>q.id.includes('.q')).at(-1);
 const prompt=JSON.parse(anchoredWorkbookPrompt('q',sources)),shown=prompt.sources.find(s=>s.key===catalog.key).quotes.find(q=>q.id===anchor.id);
 assert.equal(shown.text,context);assert.equal(shown.text,sources[0].abstractText.slice(shown.start,shown.end));assert.ok(prompt.sources.every(s=>s.quotes.every(q=>q.id.includes('.q'))));
 const wire=anchoredSample(sources);wire.dimensions[0].cells[0].quoteIds=[anchor.id,catalog.quotes.find(q=>q.text===context).id];
 const content=resolveAnchoredWorkbook(wire,sources),cell=content.dimensions[0].cells[0];assert.deepEqual(cell.quotes,[shown.text],'contained selections collapse to one contiguous original passage');
 const patch=JSON.parse(workbookPatchPrompt('q',sources,content,[issue(`cell:${content.dimensions[0].id}:${cell.paperId}`)]));
 assert.ok(patch.correction.targets[0].currentQuoteIds.length,'correction can retain the contextual source span');
});
test('adjacent-sentence windows preserve a continuous source passage and enforce cell-specific review',()=>{
 const sources=structuredClone(workbookSources);sources[0].abstractText='The first sentence names the study object. The second sentence reports a value of 0.248. The third sentence states an explicit qualification.';
 const bank=workbookEvidenceCatalog(sources),source=bank.find(s=>s.paperId===sources[0].id);
 const window=source.quotes.find(q=>q.text===sources[0].abstractText);assert.ok(window);assert.match(window.id,/\.w/);
 assert.equal(workbookPaperLabel(sources[0].id,[...sources].reverse()).toLowerCase(),source.key);
 const prompt=JSON.parse(workbookReviewPrompt('q',workbookSources,resolvedSample(),['comparison'],true));
 assert.match(prompt.rules,/THAT CELL'S SELECTED passages/);assert.match(prompt.rules,/elsewhere in the full abstract does not validate/);
});
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
 assert.equal(prompt.evidenceProtocol,'anchors-v2');assert.ok(prompt.sources.every(s=>!('paperId'in s)));
 const content=resolveAnchoredWorkbook(anchoredSample(),workbookSources);
 assert.deepEqual(content,validateWorkbook(content,workbookSources));
 for(const d of content.dimensions)for(const c of d.cells)if(c.status==='supported')assert.ok(workbookSources.find(s=>s.id===c.paperId).abstractText.includes(c.quote));
 const unknown=anchoredSample();unknown.dimensions[0].cells[0].quoteIds=['p3.q999'];assert.throws(()=>resolveAnchoredWorkbook(unknown,workbookSources),/unlocated_workbook_evidence/);
 const cross=anchoredSample();cross.dimensions[0].cells[0].quoteIds=['p1.q1'];assert.throws(()=>resolveAnchoredWorkbook(cross,workbookSources),/unlocated_workbook_evidence/);
 const copied=anchoredSample();copied.dimensions[0].cells[0].quote='Do not accept arbitrary quote text';assert.throws(()=>resolveAnchoredWorkbook(copied,workbookSources),/unlocated_workbook_evidence/);
 const badref=anchoredSample();badref.comparison.evidenceIds=['conditions:p1'];assert.throws(()=>resolveAnchoredWorkbook(badref,workbookSources),/untraceable_workbook_instruction/);
});
test('a comparison patch preserves the independently approved question and every other field exactly',()=>{
 const before=resolvedSample(), issues=[issue('comparison')];
 const prompt=JSON.parse(workbookPatchPrompt('question',workbookSources,before,issues));
 assert.match(prompt.referenceProtocol.rule,/previousWorkbook/);
 assert.match(prompt.referenceProtocol.rule,/only the supplied patches envelope/);
 assert.doesNotMatch(prompt.referenceProtocol.rule,/actual dimensions in this response/);
 assert.equal(prompt.correction.targets[0].id,'f1');assert.equal(prompt.contract,undefined);
 assert.deepEqual(Object.keys(prompt.output.patches[0].value),prompt.correction.targets[0].valueKeys);
 assert.equal(prompt.output.patches[0].id,'f1');
 const comparison={...anchoredSample().comparison,textZh:'摘要信息不足，不能直接比较结果。',textEn:'The abstracts are insufficient for direct comparison.'};
 const after=applyWorkbookPatches({patches:[{id:'f1',value:comparison}]},before,workbookSources,issues);
 assert.notEqual(after.comparison.textZh,before.comparison.textZh);
 const approved=Object.fromEntries(Object.entries(before).filter(([key])=>key!=='comparison')),preserved=Object.fromEntries(Object.entries(after).filter(([key])=>key!=='comparison'));assert.deepEqual(approved,preserved);assert.deepEqual(before,resolvedSample(),'input checkpoint is never mutated');
 assert.deepEqual(workbookReviewFields(before),workbookReviewFields(after));
});
test('field patches reject unreviewed targets, extra properties, omissions, duplicates and full rewrites',()=>{
 const content=resolvedSample(),issues=[issue('comparison')],value=anchoredSample().comparison;
 for(const raw of [content,{patches:[]},{patches:[{id:'f2',value}]},{patches:[{id:'f1',value:{...value,questionZh:'Injected unapproved research question'}}]},{patches:[{id:'f1',value}],questionZh:'injected'}])assert.throws(()=>applyWorkbookPatches(raw,content,workbookSources,issues),/invalid_workbook_patch/);
 assert.throws(()=>applyWorkbookPatches({patches:[{id:'f1',value},{id:'f1',value}]},content,workbookSources,[issue('comparison'),issue('question')]),/invalid_workbook_patch/);
 assert.throws(()=>applyWorkbookPatches({patches:[{id:'f1',value}]},content,workbookSources,[{...issue('comparison'),issueType:'evidence_gap'}]),/invalid_workbook_patch/);
});
test('cell correction targets identify the correct paper even when the old cell was missing',()=>{
 const content=resolvedSample(),missing=content.dimensions[2].cells[0];
 const p=JSON.parse(workbookPatchPrompt('q',workbookSources,content,[issue(`cell:conditions:${missing.paperId}`)]));
 const key=workbookEvidenceCatalog(workbookSources).find(s=>s.paperId===missing.paperId).key;
 assert.equal(p.correction.targets[0].sourceKey,key);
 assert.match(p.output.patches[0].value.quoteIds[0],new RegExp(`^${key}\\.q`));
 assert.equal(p.previousWorkbook.dimensions[2].cells[0].paperId,key);
 assert.ok(p.previousWorkbook.comparison.evidenceIds.every(id=>/:p[123]$/.test(id)));
 assert.equal(content.dimensions[2].cells[0].paperId,missing.paperId);
});
test('each bilingual field group and cell can be corrected without changing identities or order',()=>{
 const content=resolvedSample(),wire=anchoredSample(),cell=content.dimensions[1].cells[0];
 const ids=['question','dimension:metric',`cell:method:${cell.paperId}`,'task:title','task:step:0','task:criterion','learning:goal','learning:prerequisite','learning:exercise','learning:checkpoint'];
 const values=[{questionZh:'仅核对摘要中的工具。',questionEn:'Check only the tools named in the abstracts.'},{labelZh:'指标',labelEn:'Quantities',purposeZh:'核对名称。',purposeEn:'Check the names.'},{status:'supported',textZh:'核对原文。',textEn:'Check the source.',quoteIds:wire.dimensions[1].cells[0].quoteIds},{titleZh:'核对表',titleEn:'Audit table'},wire.task.steps[0],{criterionZh:'保留缺失项。',criterionEn:'Retain missing items.'},...['goal','prerequisite','exercise','checkpoint'].map(k=>({[`${k}Zh`]:'核对摘要。',[`${k}En`]:'Audit the abstracts.'}))];
 const after=applyWorkbookPatches({patches:values.map((value,i)=>({id:`f${i+1}`,value}))},content,workbookSources,ids.map(issue));
 assert.deepEqual(after.dimensions.map(d=>[d.id,d.cells.map(c=>c.paperId)]),content.dimensions.map(d=>[d.id,d.cells.map(c=>c.paperId)]));assert.deepEqual(after.comparison,content.comparison);assert.equal(after.task.steps.length,content.task.steps.length);
 const patch={patches:[{id:'f1',value:{status:'missing',textZh:'',textEn:'',quoteIds:[]}}]};
 assert.throws(()=>applyWorkbookPatches(patch,content,workbookSources,[issue(`cell:method:${cell.paperId}`)]),/untraceable_workbook_instruction/,'a cell correction cannot leave approved instructions with dangling references');
 const independent=structuredClone(content);independent.dimensions[2].cells[0]={...cell};
 const missing=applyWorkbookPatches(patch,independent,workbookSources,[issue(`cell:conditions:${cell.paperId}`)]);
 assert.equal(missing.dimensions[2].cells[0].status,'missing');assert.deepEqual(missing.questionEn,content.questionEn);
});
