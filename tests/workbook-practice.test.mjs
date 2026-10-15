import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookSample} from './fixtures/research-workbook.mjs';
import {workbookPracticeTasks,validateWorkbookPractice,completePractice,practiceProgress} from '../lib/workbook-practice.ts';
import {validateWorkbookArtifact} from '../lib/research-workbook.ts';
import {workspaceHash,readWorkspaceLocation} from '../lib/workspace-navigation.ts';
import {comparisonLocation} from '../lib/workbook-continuation.ts';
const content=workbookSample();
test('practice uses only reviewed task steps and exercise, and completion advances to the next unfinished item',()=>{
 const tasks=workbookPracticeTasks(content);assert.equal(tasks.length,content.task.steps.length+1);assert.equal(tasks[0].goalEn,content.task.steps[0].textEn);assert.equal(tasks.at(-1).checkpointZh,content.learning.checkpointZh);
 const initial={activeId:tasks[0].id,entries:{[tasks[0].id]:{result:'A sourced result under explicit assumptions',unresolved:'Check full text',completed:false}}};
 const next=completePractice(content,initial);assert.equal(next.entries[tasks[0].id].completed,true);assert.equal(practiceProgress(content,next).completed,1);assert.equal(next.activeId,tasks[1].id);assert.equal(initial.entries[tasks[0].id].completed,false);
 assert.equal(practiceProgress(content,{...next,activeId:tasks[0].id}).active.id,tasks[1].id,'reviewing a completed result must not make it the next unfinished task');
 let value=initial;for(const task of tasks){value={...value,activeId:task.id,entries:{...value.entries,[task.id]:{result:'Recorded check',unresolved:'',completed:false}}};value=completePractice(content,value)}assert.equal(practiceProgress(content,value).allCompleted,true);
});
test('empty results, fabricated tasks and oversized notes cannot become completed practice records',()=>{
 for(const value of [null,{}, {activeId:'invented',entries:{}},{activeId:'learning',entries:{invented:{result:'x',unresolved:'',completed:false}}},{activeId:'learning',entries:{learning:{result:' ',unresolved:'',completed:true}}},{activeId:'learning',entries:{learning:{result:'x'.repeat(4001),unresolved:'',completed:false}}}])assert.throws(()=>validateWorkbookPractice(value,content));
 assert.throws(()=>completePractice(content,{activeId:'learning',entries:{}}));
 const notes={observations:{},decision:'Preserved judgment',unresolved:'Preserved gap'};
 const valid={activeId:'learning',entries:{learning:{result:'User evidence',unresolved:'Still open',completed:false}}};
 assert.deepEqual(validateWorkbookArtifact({...notes,practice:valid},content),{...notes,practice:valid});assert.deepEqual(validateWorkbookArtifact(notes,content),notes);
});
test('practice, source reading and original comparison remain pinned across refresh and back navigation',()=>{
 const original=workspaceHash({view:'workbook',space:'s',id:'r',workbookId:'v1',workbookPanel:'task',from:'today',returnTo:'#today?space=s'});
 const practice=workspaceHash({view:'learn',space:'s',track:'r',workbookId:'v1',practiceId:'learning',from:'workbook',returnTo:original});
 const paper=workspaceHash({view:'paper-detail',space:'s',id:'p',from:'learn',readingFocus:'Check this original assumption',paperPanel:'notes',returnTo:practice});
 const restored=readWorkspaceLocation(paper);assert.equal(restored.readingFocus,'Check this original assumption');assert.equal(restored.returnTo,practice);assert.equal(readWorkspaceLocation(restored.returnTo).returnTo,original);
 assert.equal(comparisonLocation(practice,'s').workbook.workbookId,'v1');assert.equal(comparisonLocation(paper,'s').workbook.workbookId,'v1');
 assert.equal(readWorkspaceLocation('#learn?space=s&practice=learning').practiceId,undefined);assert.equal(readWorkspaceLocation('#today?space=s&workbookId=v1&practice=learning').workbookId,undefined);
 assert.equal(readWorkspaceLocation(workspaceHash({view:'learn',space:'s',track:'r',workbookId:'v1',from:'workbook',returnTo:'#workbook/r?space=other&workbookId=v1'})).returnTo,undefined);
});
