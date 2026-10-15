import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {workbookSample,workbookSources} from './fixtures/research-workbook.mjs';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../app/components/research-workbook.tsx',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(extra={}){
 const cells=[],effects=[],requests=[],versions=[],views=[];let index=0,tree;
 const hooks={useState(initial){const i=index++;cells[i]??={value:typeof initial==='function'?initial():initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}]},
  useRef(initial){const i=index++;cells[i]??={current:initial};return cells[i]},
  useEffect(fn,deps){const i=index++,old=cells[i];if(!old||deps.some((v,n)=>v!==old.deps[n]))effects.push(()=>{old?.cleanup?.();cells[i]={deps,cleanup:fn()}})}};
 const mod={exports:{}};
 new Function('require','exports',code)(name=>name==='react'?hooks:name.includes('workspace-request')?{workspaceFetch:(url,init)=>new Promise(resolve=>requests.push({url,init,resolve:(data,ok=true)=>resolve({ok,json:async()=>data})}))}:name.endsWith('.css')?{}:name==='./math-text'?{MathText:({children})=>children}:name==='./draft-recovery'?{DraftRecovery:()=>null}:name.startsWith('../../lib/')?require('../lib/'+name.split('/').at(-1)+'.ts'):require(name),mod.exports);
 const props={userId:'u',spaceId:'s',trackId:'t',locale:'en',onBack(){},onOpenPaper(){},onWorkbookChange:id=>versions.push(id),onViewChange:(...v)=>views.push(v),...extra};
 const render=()=>{index=0;tree=mod.exports.ResearchWorkbook(props);effects.splice(0).forEach(fn=>fn());return tree};
 const nodes=()=>{const list=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){list.push(n);walk(n.props?.children)}}walk(tree);return list};
 render();return{props,render,nodes,requests,versions,views,text:()=>JSON.stringify(tree)};
}
const ready=id=>({workbook:{id,revision:'rev',status:'ready',stale:false,sources:workbookSources,candidates:workbookSources,content:workbookSample(),artifact:{revision:1,value:{observations:{},decision:'Saved decision',unresolved:'Check assumptions'}},retryAt:0},versions:[{id:'old',status:'ready',created_at:'yesterday'},{id:'new',status:'ready',created_at:'today'}]});

test('a graph comparison resumes reviewed content and saved notes instead of erasing them',async()=>{
 const taskContext={spaceId:'s',question:'My precise question',papers:workbookSources.map(s=>({canonicalId:s.canonicalId,title:s.title}))};
 const h=harness({taskContext});assert.match(h.requests[0].url,/selection=1/);
 h.requests.shift().resolve(ready('s:t:exact'));await settle();h.render();
 assert.match(h.text(),/Saved decision/);assert.match(h.text(),/Condition comparison/);
 assert.deepEqual(h.versions,['s:t:exact']);
});

test('refresh loads the pinned historical version and a missing version never falls back to latest',async()=>{
 const h=harness({initialWorkbookId:'s:t:old'});assert.match(h.requests[0].url,/workbookId=s%3At%3Aold/);
 h.requests.shift().resolve(ready('s:t:old'));await settle();h.render();assert.deepEqual(h.versions,['s:t:old']);
 h.props.initialWorkbookId='s:t:missing';h.render();h.render();assert.doesNotMatch(h.text(),/Saved decision/);
 h.requests.shift().resolve({error:'Workbook not found'},false);await settle();h.render();
 assert.match(h.text(),/Workbook not found/);assert.equal(h.requests.length,0);assert.deepEqual(h.versions,['s:t:old']);
});

test('choosing a history version pins its identity and clears the previous evidence-cell URL',async()=>{
 const h=harness();h.requests.shift().resolve(ready('new'));await settle();h.render();
 const select=h.nodes().find(n=>n.type==='select');const pending=select.props.onChange({target:{value:'old'}});
 h.requests.shift().resolve(ready('old'));await pending;await settle();h.render();
 assert.deepEqual(h.versions,['new','old']);assert.deepEqual(h.views.at(-1),['evidence','']);
});
