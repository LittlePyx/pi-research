import test from 'node:test';
import assert from 'node:assert/strict';
import { routeNextAction } from '../lib/route-overview.ts';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

const require=createRequire(import.meta.url);
function overviewHarness(){
 const calls=[];
 const snapshots=new Map();
 const exports={};
 const code=ts.transpileModule(readFileSync(new URL('../app/components/route-start.tsx',import.meta.url),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)(name=>{
  if(name==='react')return {useEffect:effect=>effect()};
  if(name==='./use-comparison-task')return {useComparisonTask:(_user,_space,track)=>snapshots.get(track)||{overview:null}};
  if(name==='./math-text')return {MathText:({children})=>children};
  if(name.endsWith('.css'))return {};
  if(name.startsWith('../../lib/'))return require('../lib/'+name.split('/').at(-1)+'.ts');
  return require(name);
 },exports);
 const props={userId:'user',spaceId:'s',trackId:'r',active:true,locale:'zh',selection:{value:{question:'',papers:[]},seedQuestion(){}},
  onResume:(...args)=>calls.push(args),onCompare:(...args)=>calls.push(args)};
 function render(){
  const tree=exports.RouteStart(props),buttons=[];
  function walk(node){if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==='object'){if(node.type==='button')buttons.push(node);walk(node.props?.children)}}
  walk(tree);
  return {buttons,text:JSON.stringify(tree)};
 }
 return {props,snapshots,render,calls};
}

test('overview has one exact continuation and isolates saved judgments and local drafts by route',()=>{
 const h=overviewHarness(),item={id:'exact-saved',question:'Research question',status:'ready',savedRevision:2,papers:[],decision:'Keep qualified judgment',unresolved:'Check theorem 3 assumptions',observationCount:1};
 const overview={spaceId:'s',trackId:'r',question:'Route question',eligibleCount:2,routeEligibleCount:2,comparisons:[item],savedJudgment:item};
 h.snapshots.set('r',{overview,continuation:item});
 let view=h.render();
 assert.match(view.text,/Keep qualified judgment/);
 assert.match(view.text,/Check theorem 3 assumptions/);
 assert.equal(view.buttons.length,1);
 view.buttons[0].props.onClick();assert.deepEqual(h.calls,[['exact-saved',true]]);
 h.props.trackId='other';
 assert.doesNotMatch(h.render().text,/Keep qualified judgment|Check theorem 3 assumptions/);
 h.props.trackId='r';
 const draft={spaceId:'s',question:'Unsaved task',papers:[{canonicalId:'p1',title:'First'}]};
 h.snapshots.set('r',{overview,continuation:item,draft});
 view=h.render();assert.equal(view.buttons.length,1);
 assert.match(view.text,/Unsaved task/);
 assert.doesNotMatch(view.text,/Check theorem 3 assumptions/);
 view.buttons[0].props.onClick();assert.deepEqual(h.calls[1],[draft]);
});

test('the route action depends on eligible sources and exact saved comparison state',()=>{
  const empty={eligibleCount:1,routeEligibleCount:0,comparisons:[]};
  assert.equal(routeNextAction(null),'read');
  assert.equal(routeNextAction(empty),'read');
  assert.equal(routeNextAction({...empty,eligibleCount:2}),'compare');
  const latest={id:'exact-workbook',status:'verifying',stale:false,savedRevision:0};
  const withLatest=value=>({...empty,comparisons:[{...latest,...value}]});
  assert.equal(routeNextAction(withLatest({})),'resume');
  assert.equal(routeNextAction(withLatest({status:'retryable'})),'resume');
  assert.equal(routeNextAction(withLatest({status:'ready'})),'record');
  assert.equal(routeNextAction(withLatest({status:'ready',savedRevision:2})),'saved');
  assert.equal(routeNextAction(withLatest({status:'ready',savedRevision:2,stale:true})),'check');
  assert.equal(routeNextAction(withLatest({status:'rejected'})),'check');
});
