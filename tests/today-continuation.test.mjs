import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {workspaceHash,readWorkspaceLocation} from '../lib/workspace-navigation.ts';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../app/components/today-continuation.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const hash=workspaceHash({view:'workbook',space:'s',id:'r',workbookId:'v1',workbookPanel:'task'});
function harness(status='ready',extra={}){
 let opened='',retries=0;
 const item={hash,titleZh:'比较两种假设',titleEn:'Compare the assumptions',status,savedRevision:2,sourceCount:2,...extra};
 const mod={exports:{}};
 new Function('require','exports',code)(name=>name==='react'?{useState:fn=>[fn(),()=>{}]}:name==='./use-saved-read'?{useSavedRead:()=>({data:{continuation:item},error:null,reload(){retries++}})}:name==='./math-text'?{MathText:({children})=>children}:name.startsWith('../../lib/')?require('../lib/'+name.split('/').at(-1)+'.ts'):require(name),mod.exports);
 const tree=mod.exports.TodayContinuation({userId:'u',spaceId:'s',locale:'en',onResume:value=>{opened=value}});
 const nodes=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){nodes.push(n);walk(n.props?.children)}}walk(tree);
 return {tree,nodes,html:renderToStaticMarkup(tree),open:()=>opened,retries:()=>retries};
}
test('unfinished comparisons have a secondary return to their pinned comparison without advancing work',()=>{
 for(const status of ['ready','retryable','rejected','verifying','draft']){
  const h=harness(status);assert.match(h.html,/Continue last comparison/);assert.doesNotMatch(h.html,/<h[1-6]|class="primary"|saved revision/);
  h.nodes.find(n=>n.type==='button').props.onClick();const location=readWorkspaceLocation(h.open());assert.equal(location.view,'workbook');assert.equal(location.workbookId,'v1');assert.equal(location.id,'r');assert.equal(h.retries(),0);
 }
 const other=harness('ready',{hash:workspaceHash({view:'workbook',space:'other',id:'r',workbookId:'v1'})});assert.equal(other.tree,null);
});
test('a source-reading bookmark returns to the corresponding comparison rather than opening a lesson on Today',()=>{
 const paper=workspaceHash({view:'paper-detail',space:'s',id:'p',from:'workbook',returnTo:hash,readingFocus:'Check assumptions'});
 const h=harness('ready',{hash:paper});assert.match(h.html,/Continue last comparison/);
 h.nodes.find(n=>n.type==='button').props.onClick();assert.equal(readWorkspaceLocation(h.open()).workbookId,'v1');assert.equal(readWorkspaceLocation(h.open()).view,'workbook');
});

test('incomplete practice resumes inside its comparison; completed practice disappears even from a paper bookmark',()=>{
 const practice=workspaceHash({view:'learn',space:'s',track:'r',workbookId:'v1',practiceId:'learning',from:'workbook',returnTo:hash});
 const paper=workspaceHash({view:'paper-detail',space:'s',id:'p',from:'learn',returnTo:practice});
 for(const location of [practice,paper]){
  const unfinished=harness('ready',{hash:location,practice:{completed:1,total:3,allCompleted:false}});
  assert.doesNotMatch(unfinished.html,/1\/3|exercise|lesson|<h[1-6]/i);
  unfinished.nodes.find(n=>n.type==='button').props.onClick();const destination=readWorkspaceLocation(unfinished.open());assert.equal(destination.view,'workbook');assert.equal(destination.workbookId,'v1');assert.equal(destination.workbookPanel,'task');
  assert.equal(harness('ready',{hash:location,practice:{completed:3,total:3,allCompleted:true}}).tree,null);
 }
});

test('the reading brief and papers precede the optional comparison continuation on Today',()=>{
 const ast=ts.createSourceFile('app.tsx',readFileSync(new URL('../app/research-app.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);const elements=[];
 function visit(node){if(ts.isJsxSelfClosingElement(node)&&['ResearchEntry','TodayContinuation'].includes(node.tagName.getText(ast)))elements.push({name:node.tagName.getText(ast),position:node.pos});ts.forEachChild(node,visit)}visit(ast);
 const brief=elements.find(e=>e.name==='ResearchEntry'),continuation=elements.find(e=>e.name==='TodayContinuation');assert.ok(brief&&continuation);assert.ok(brief.position<continuation.position);
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
