import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {workspaceHash} from '../lib/workspace-navigation.ts';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../app/components/today-continuation.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const hash=workspaceHash({view:'workbook',space:'s',id:'r',workbookId:'v1',workbookPanel:'task'});
function harness(status='ready',extra={}){
 let opened='',retries=0;
 const item={hash,titleZh:'比较两种假设',titleEn:'Compare the assumptions',status,savedRevision:2,sourceCount:2,...extra};
 const mod={exports:{}};
 new Function('require','exports',code)(name=>name==='react'?{useState:fn=>[fn(),()=>{}]}:name==='./use-saved-read'?{useSavedRead:()=>({data:{continuation:item},error:null,reload(){retries++}})}:name==='./math-text'?{MathText:({children})=>children}:name==='../../lib/workbook-continuation'?require('../lib/workbook-continuation.ts'):require(name),mod.exports);
 const tree=mod.exports.TodayContinuation({userId:'u',spaceId:'s',locale:'en',onResume:value=>{opened=value}});
 const nodes=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){nodes.push(n);walk(n.props?.children)}}walk(tree);
 return {tree,nodes,html:renderToStaticMarkup(tree),open:()=>opened,retries:()=>retries};
}
test('Today displays status-specific next actions and opening a task only navigates to its pinned version',()=>{
 for(const [status,action] of [['ready','Continue comparison &amp; notes'],['retryable','Review issues &amp; recovery'],['rejected','Review issues &amp; recovery'],['verifying','View generation progress'],['draft','View generation progress']]){
  const h=harness(status);assert.match(h.html,new RegExp(action));
  h.nodes.find(n=>n.type==='button').props.onClick();assert.equal(h.open(),hash);assert.equal(h.retries(),0);
 }
 const other=harness('ready',{hash:workspaceHash({view:'workbook',space:'other',id:'r',workbookId:'v1'})});assert.equal(other.tree,null);
});
test('a source-reading bookmark explains that the next step returns to the original passage',()=>{
 const paper=workspaceHash({view:'paper-detail',space:'s',id:'p',from:'workbook',returnTo:hash,readingFocus:'Check assumptions'});
 const h=harness('ready',{hash:paper});assert.match(h.html,/Continue checking the source/);assert.match(h.html,/saved revision 2/);
 h.nodes.find(n=>n.type==='button').props.onClick();assert.equal(h.open(),paper);
});

test('brief findings are collapsed initially with every source and reading action preserved',()=>{
 const digestCode=ts.transpileModule(readFileSync(new URL('../app/components/digest-overview.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};
 new Function('require','exports',digestCode)(name=>name==='./math-text'?{MathText:({children})=>children}:require(name),mod.exports);
 let read='';
 const tree=mod.exports.DigestOverview({locale:'en',demo:false,onRead:id=>{read=id},data:{date:'2026-10-15',historical:false,headline:'Latest finding',overview:'Summary remains visible',findings:[{id:'p',title:'Original source',text:'An evidence-backed finding',action:'Check the assumption'}]}});
 const html=renderToStaticMarkup(tree);
 assert.match(html,/<details class="pi-digest-findings"><summary>/);assert.doesNotMatch(html,/<details[^>]*\bopen\b/);assert.match(html,/Summary remains visible|An evidence-backed finding|Original source/);
 const nodes=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){nodes.push(n);walk(n.props?.children)}}walk(tree);
 nodes.find(n=>n.type==='button').props.onClick();assert.equal(read,'p');
});
