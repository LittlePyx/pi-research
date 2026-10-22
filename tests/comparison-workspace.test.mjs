import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {comparisonInputKey,comparisonQuestionKey,migrateComparisonQuestionDraft,readComparisonInput,writeComparisonInput} from '../lib/comparison-input.ts';
import {sessionDraftKey,writeSessionDraft,readSessionDraft} from '../lib/session-draft.ts';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../app/components/use-comparison-workspace.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

test('legacy question recovery requires the exact comparison input and never migrates across versions',()=>{
 const before=globalThis.sessionStorage,values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 try{
  writeSessionDraft(sessionDraftKey('u','s','workbook-question:r'),'Saved question','Local revision');
  writeComparisonInput(comparisonInputKey('u','s','r','v1'),{spaceId:'s',question:'Local revision',papers:[]});
  migrateComparisonQuestionDraft('u','s','r','v2','Saved question');
  assert.equal(readSessionDraft(comparisonQuestionKey('u','s','r','v2')),null);
  migrateComparisonQuestionDraft('u','s','r','v1','Saved question');
  assert.equal(readSessionDraft(comparisonQuestionKey('u','s','r','v1')).value,'Local revision');
 }finally{if(before===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=before;}
});

test('opening a saved comparison preserves a separate ungenerated draft while preparing that draft clears only its own input',()=>{
  const before=globalThis.sessionStorage,values=new Map();
  globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  try{
    const cells=[];let cursor=0;
    const hooks={useState(initial){const i=cursor++;cells[i]??={value:initial};return[cells[i].value,next=>{cells[i].value=typeof next==='function'?next(cells[i].value):next;}];},useRef(initial){const i=cursor++;cells[i]??={current:initial};return cells[i];}};
    const mod={exports:{}};new Function('require','exports',code)(name=>name==='react'?hooks:require('../lib/'+name.split('/').at(-1)+'.ts'),mod.exports);
    const render=()=>{cursor=0;return mod.exports.useComparisonWorkspace('u','s');};
    const draft={spaceId:'s',question:'Unfinished question',papers:[{canonicalId:'doi:one',title:'One'},{canonicalId:'doi:two',title:'Two'}]};
    const key=comparisonInputKey('u','s','r');writeComparisonInput(key,draft);
    let state=render();state.beginComparison('r',undefined,'saved-id','library');state=render();state.rememberVersion('r','saved-id');
    assert.deepEqual(readComparisonInput(key,'s'),draft);
    assert.equal(state.workbookVersionId,'saved-id');assert.equal(state.workbookReturnView,'library');
    state.beginComparison('r',draft,'','library');state=render();state.rememberVersion('r','generated-id');
    assert.equal(readComparisonInput(key,'s'),undefined);
  }finally{if(before===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=before;}
});
