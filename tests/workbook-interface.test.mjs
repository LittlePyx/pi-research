import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookTaskPresentation,workbookSavePresentation} from '../lib/workbook-interface.ts';
import {workbookEvidenceSelection,inspectorOriginKey,rememberInspectorOrigin,readInspectorOrigin,clearInspectorOrigin} from '../lib/workbook-inspector.ts';
import {workbookSample,workbookSources} from './fixtures/research-workbook.mjs';

test('saved text never completes a check without explicit confirmation and actions follow the same state',()=>{
 assert.equal(workbookTaskPresentation(undefined,true).action,'开始核查');
 const partial={result:'Abstract check',unresolved:'Theorem number pending',completed:false};
 const shown=workbookTaskPresentation(partial,true);assert.equal(shown.kind,'saved');assert.equal(shown.action,'继续核查');assert.equal(shown.status,'已保存，待继续');
 assert.equal(workbookTaskPresentation({...partial,completed:true},true).action,'查看成果');
 assert.equal(workbookTaskPresentation({...partial,result:''},false).kind,'saved');
 assert.equal(workbookTaskPresentation({result:' ',unresolved:' ',completed:false},true).kind,'new');
});

test('save controls permit exactly the durable, editable or recoverable actions for their current state',()=>{
 const base={busy:'',stale:false,conflict:false,error:false,dirty:false,draftStored:true,pendingDraft:false,revision:3,zh:true};
 let view=workbookSavePresentation(base);assert.equal(view.mode,'saved');assert.equal(view.canSave,false);assert.equal(view.canLeave,true);assert.equal(view.taskBlocked,false);
 view=workbookSavePresentation({...base,dirty:true});assert.equal(view.canSave,true);assert.equal(view.canLeave,false);assert.equal(view.taskBlocked,true);
 view=workbookSavePresentation({...base,pendingDraft:true});assert.equal(view.editorLabel,'恢复本地草稿');assert.equal(view.canSave,false);assert.equal(view.taskBlocked,true);assert.equal(view.canLeave,false);
 for(const extra of [{busy:'save'},{stale:true}])assert.equal(workbookSavePresentation({...base,dirty:true,...extra}).canSave,false);
 view=workbookSavePresentation({...base,dirty:true,conflict:true,error:true});assert.equal(view.mode,'conflict');assert.match(view.status,/本地输入已保留/);assert.equal(view.canLeave,false);
 assert.match(workbookSavePresentation({...base,dirty:true,draftStored:false}).status,/无法暂存/);
});

test('evidence selection resolves exact cells without parsing paper IDs and rejects foreign or missing locations',()=>{
 const content=workbookSample(),d=content.dimensions[0],source=workbookSources[0],id=`${d.id}:${source.id}`;
 const shown=workbookEvidenceSelection(content,workbookSources,id);assert.equal(shown.source.id,source.id);assert.equal(shown.cell.paperId,source.id);assert.equal(shown.index,0);
 assert.equal(workbookEvidenceSelection(content,workbookSources,'missing:'+source.id),null);
 assert.equal(workbookEvidenceSelection(content,[],id),null);assert.equal(workbookEvidenceSelection(null,workbookSources,id),null);
});

test('the original evidence return anchor survives refresh and is scoped to user, workspace, route and version',()=>{
 const before=globalThis.sessionStorage,values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 try{
  const key=inspectorOriginKey('u','s','r','v');rememberInspectorOrigin(key,'dim:paper','task-1:dim:paper');
  assert.deepEqual(readInspectorOrigin(key),{id:'dim:paper',anchor:'task-1:dim:paper'});
  for(const args of [['other','s','r','v'],['u','other','r','v'],['u','s','other','v'],['u','s','r','other']])assert.equal(readInspectorOrigin(inspectorOriginKey(...args)),null);
  clearInspectorOrigin(key);assert.equal(readInspectorOrigin(key),null);values.set(key,'bad JSON');assert.equal(readInspectorOrigin(key),null);
 }finally{if(before===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=before;}
});
