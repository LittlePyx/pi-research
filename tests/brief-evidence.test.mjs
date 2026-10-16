import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../app/components/task-brief-evidence.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const records=Array.from({length:8},(_,i)=>({paperId:'p'+i,canonicalId:'c'+i,title:'Paper '+i,selected:true,abstractText:'Original abstract '+i,url:'https://example.test/'+i,review:{limitationsEn:'Scope '+i}}));
const brief={snapshotId:'saved-version',job:{id:'saved-job'},capturedAt:'2026-10-16',scope:{description:'Actual research question'},coverage:{bounded:false},records};
function harness({paperId='p7',loaded=brief,response=brief,sourceBrief=brief}={}){
 let index=0;const effects=[],requests=[],changes=[];
 const hooks={...React,useState:initial=>{const slot=index++;return [slot===0?loaded:initial,value=>changes.push({slot,value})]},useRef:initial=>({current:initial}),useEffect:callback=>effects.push(callback)};
 const mod={exports:{}};
 new Function('require','exports',code)(name=>name==='react'?hooks:name.includes('workspace-request')?{workspaceFetch:async url=>{requests.push(url);return {ok:true,json:async()=>({brief:response})}}}:require(name),mod.exports);
 const tree=mod.exports.TaskBriefEvidence({spaceId:'s',brief:sourceBrief,locale:'en',demo:false,paperId,onRead:()=>{}});
 return {tree,html:renderToStaticMarkup(tree),requests,changes,effects};
}
test('opening a paper citation shows its own frozen abstract even beyond the general six-record preview',()=>{
 const h=harness();assert.match(h.html,/Original abstract 7/);assert.doesNotMatch(h.html,/Original abstract [0-6]/);assert.match(h.html,/Scope 7/);assert.match(h.html,/not full-text verification/);assert.match(h.html,/Read this paper &amp; take notes/);assert.match(h.html,/saved/);assert.match(h.html,/open=""/);
});
test('a missing paper citation never falls back to another paper or claims unavailable evidence',()=>{
 const h=harness({paperId:'missing'});assert.match(h.html,/No captured abstract is available/);assert.doesNotMatch(h.html,/Original abstract|Read this paper/);
});
test('citation loading pins both job and snapshot, deduplicates requests and rejects mismatched snapshots',async()=>{
 const h=harness({loaded:null,response:{...brief,snapshotId:'different'}});
 h.effects[0]();h.effects[1]();h.effects[1]();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.requests.length,1);const params=new URL(h.requests[0],'https://example.test').searchParams;
 assert.equal(params.get('jobId'),'saved-job');assert.equal(params.get('snapshotId'),'saved-version');assert.equal(params.get('evidence'),'1');assert.ok(h.changes.some(v=>v.slot===2&&v.value===true),'error is surfaced');assert.ok(!h.changes.some(v=>v.slot===0),'wrong snapshot is not adopted');
});
test('an earlier recommendation resolves its own selecting task instead of borrowing the latest task evidence',async()=>{
 const h=harness({loaded:null,sourceBrief:{...brief,records:[]}});h.effects[0]();h.effects[1]();await new Promise(resolve=>setImmediate(resolve));
 const params=new URL(h.requests[0],'https://example.test').searchParams;assert.equal(params.get('paperId'),'p7');assert.equal(params.has('jobId'),false);assert.equal(params.has('snapshotId'),false);assert.equal(h.changes.find(v=>v.slot===0)?.value.snapshotId,'saved-version');
});
