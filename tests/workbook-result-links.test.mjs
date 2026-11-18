import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookSample} from './fixtures/research-workbook.mjs';
import {validateWorkbookArtifact} from '../lib/research-workbook.ts';
import {associateWorkbookResult,bindResultLinks,currentLinkedText,removeWorkbookResultLink,validateResultLinks} from '../lib/workbook-result-links.ts';
const content=workbookSample(),practice={activeId:'task-0',entries:{'task-0':{result:'Source: abstract. Conditions are retained.',unresolved:'Check full-text definitions.',completed:false}}};
const original={decision:'My qualified judgment.',unresolved:'My original question.',observations:{},practice};
test('stable links retain task, source evidence and snapshots without changing legacy prose or duplicating associations',()=>{
 const linked=associateWorkbookResult(original,content,practice,4,'task-0','decision');assert.equal(linked.decision,original.decision);assert.equal(linked.unresolved,original.unresolved);assert.equal(linked.links.length,1);assert.deepEqual(linked.links[0].evidenceIds,content.task.steps[0].evidenceIds);
 const renamed=structuredClone(content);renamed.task.titleZh='New display title';assert.equal(associateWorkbookResult(linked,renamed,practice,4,'task-0','decision').links.length,1);
 assert.deepEqual(validateWorkbookArtifact(original,content),original,'old records require no migration');assert.deepEqual(validateWorkbookArtifact(linked,content),linked);
 const removed=removeWorkbookResultLink(linked,'decision:task-0');assert.equal(removed.links.length,0);assert.equal(removed.decision,original.decision);
});
test('revising a task preserves the old association until the user explicitly updates it',()=>{
 const linked=associateWorkbookResult(original,content,practice,4,'task-0','decision');
 const latest={...linked,practice:{...practice,entries:{'task-0':{...practice.entries['task-0'],result:'Revised source result.'}}}};
 assert.notEqual(currentLinkedText(latest.practice,linked.links[0]),linked.links[0].snapshot);
 assert.deepEqual(bindResultLinks({...latest,decision:'My edited judgment.'},latest,5).links,linked.links,'retaining a historical snapshot is valid');
 const updated=associateWorkbookResult(latest,content,latest.practice,5,'task-0','decision');assert.equal(updated.links.length,1);assert.equal(updated.links[0].snapshot,'Revised source result.');assert.equal(updated.decision,original.decision);
 assert.equal(bindResultLinks(updated,latest,6).links[0].artifactRevision,6,'a new link binds to the current durable revision');
 assert.throws(()=>bindResultLinks({...original,links:linked.links},{...latest,links:[]},6),/saved check changed/);
});
test('links reject foreign tasks, evidence, duplicate identities and unbounded snapshots',()=>{
 const link=associateWorkbookResult(original,content,practice,4,'task-0','decision').links[0];
 for(const value of [null,{},[{...link,taskId:'foreign'}],[{...link,evidenceIds:['foreign:paper']}],[link,link],[{...link,snapshot:''}],[{...link,snapshot:'x'.repeat(4001)}],[{...link,artifactRevision:0}]])assert.throws(()=>validateResultLinks(value,content));
});
