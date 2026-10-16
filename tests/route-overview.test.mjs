import test from 'node:test';
import assert from 'node:assert/strict';
import { routeNextAction } from '../lib/route-overview.ts';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

const require=createRequire(import.meta.url);
function overviewHarness(){
 const cells=[],effects=[],requests=[],opened=[];let index=0,tree;
 const hooks={useState(initial){const i=index++;cells[i]??={value:typeof initial==='function'?initial():initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}];},useEffect(fn,deps){const i=index++,old=cells[i];if(!old||deps.some((v,n)=>v!==old.deps[n]))effects.push(()=>{old?.cleanup?.();cells[i]={deps,cleanup:fn()};});}};
 const code=ts.transpileModule(readFileSync(new URL('../app/components/route-start.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 new Function('require','exports',code)(name=>name==='react'?hooks:name.includes('workspace-request')?{workspaceFetch:()=>new Promise(resolve=>requests.push(data=>resolve({ok:true,json:async()=>({overview:data})})))}:name.endsWith('.css')?{}:name==='./math-text'?{MathText:({children})=>children}:name==='./interface-icon'?{InterfaceIcon:()=>null}:name.startsWith('../../lib/')?require('../lib/'+name.split('/').at(-1)+'.ts'):require(name),mod.exports);
 const props={spaceId:'s',active:true,track:{id:'r',papers:[]},locale:'zh',synthesis:null,loading:false,failed:false,selection:{value:{papers:[]},seedQuestion(){}},onCompare:(...args)=>opened.push(args)};
 const render=()=>{index=0;tree=mod.exports.RouteStart(props);effects.splice(0).forEach(fn=>fn());return JSON.stringify(tree);};
 const nodes=()=>{const list=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){list.push(n);walk(n.props?.children);}}walk(tree);return list;};
 render();return{props,render,requests,opened,nodes};
}

test('overview shows a saved decision and unresolved next check together, opens the exact comparison and isolates routes',async()=>{
 const h=overviewHarness(),item={id:'exact-saved',question:'Research question',status:'ready',savedRevision:2,papers:[],decision:'Keep qualified judgment',unresolved:'Check theorem 3 assumptions',observationCount:1};
 const overview={spaceId:'s',trackId:'r',question:'Route question',eligibleCount:2,routeEligibleCount:2,comparisons:[item],savedJudgment:item};
 h.requests.shift()(overview);await new Promise(resolve=>setImmediate(resolve));
 let text=h.render();assert.match(text,/Keep qualified judgment/);assert.match(text,/Check theorem 3 assumptions/);assert.match(text,/下一步核查/);
 h.nodes().find(n=>n.type==='button'&&n.props.children?.[0]==='继续这项核查').props.onClick();assert.deepEqual(h.opened,[['exact-saved']]);
 h.props.track={id:'other',papers:[]};text=h.render();assert.doesNotMatch(text,/Keep qualified judgment|Check theorem 3 assumptions/);
 h.requests.shift()({...overview,trackId:'other',comparisons:[],savedJudgment:null});await new Promise(resolve=>setImmediate(resolve));assert.doesNotMatch(h.render(),/Check theorem 3 assumptions/);
 h.props.track={id:'r',papers:[]};h.render();h.requests.shift()(overview);await new Promise(resolve=>setImmediate(resolve));assert.match(h.render(),/Check theorem 3 assumptions/);
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
