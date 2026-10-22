import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../app/components/use-route-selection.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(shared=false){
 const cells=[];let index=0;
 const hooks={useRef(initial){const i=index++;cells[i]??={current:initial};return cells[i];},useState(initial){const i=index++;cells[i]??={value:typeof initial==='function'?initial():initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}];},useMemo(fn,deps){const i=index++,old=cells[i];if(!old||deps.some((d,n)=>d!==old.deps[n]))cells[i]={value:fn(),deps};return cells[i].value;}};
 const mod={exports:{}};new Function('require','exports',code)(name=>name==='react'?hooks:require('../lib/'+name.split('/').at(-1)+'.ts'),mod.exports);
 return (user='u',space='s',route='r')=>{index=0;const select=mod.exports.useRouteSelections(user,space);return shared?select:select(route);};
}

test('library and route pickers share changes while preserving other route drafts even without storage',()=>{
 const render=harness(true),paper={canonicalId:'doi:A',title:'Paper A'};
 let select=render();select('r').toggle(paper);
 select=render();assert.equal(select('r').value.papers.length,1);
 select('other').change({spaceId:'s',question:'Other route question',papers:[]});
 select=render();select('r').toggle(paper);
 select=render();assert.deepEqual(select('r').value.papers,[]);
 assert.equal(select('other').value.question,'Other route question');
 assert.equal(select('r').storageError,true);
 assert.deepEqual(render('other-user')('r').value.papers,[]);
 assert.deepEqual(render('u','other-space')('r').value.papers,[]);
});
test('selection persists across remounts, empty selections and route or workspace changes without mixing identities',()=>{
 const before=globalThis.sessionStorage,values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 try{
  const render=harness();let selection=render();selection.toggle({canonicalId:'doi:A',title:'Actual paper A'});selection=render();selection.seedQuestion('Exact research question');
  selection=render();selection.toggle({canonicalId:'doi:B',title:'Actual paper B'});selection=render();assert.equal(selection.value.papers.length,2);
  assert.deepEqual(render('u','s','other').value.papers,[]);assert.deepEqual(render('u','other','r').value.papers,[]);assert.deepEqual(render('other','s','r').value.papers,[]);
  selection=render();assert.equal(selection.value.question,'Exact research question');assert.equal(selection.value.papers.length,2);
  const fresh=harness();selection=fresh();assert.equal(selection.value.papers.length,2);selection.toggle({canonicalId:'DOI:a',title:'Same paper'});selection=fresh();assert.deepEqual(selection.value.papers.map(p=>p.canonicalId),['doi:B']);
  selection.toggle({canonicalId:'doi:B',title:'Actual paper B'});assert.deepEqual(harness()().value.papers,[]);
 }finally{if(before===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=before;}
});
test('selection storage failures keep live choices and enforce a maximum of three papers',()=>{
 const render=harness();let selection;
 for(let n=0;n<4;n++){selection=render();selection.toggle({canonicalId:'doi:'+n,title:'Paper '+n});}
 selection=render();assert.equal(selection.value.papers.length,3);assert.equal(selection.storageError,true);
});

test('a delayed route question never replaces papers chosen after its request started',()=>{
 const render=harness();const initial=render();
 initial.toggle({canonicalId:'doi:live',title:'Chosen while the route was loading'});
 initial.seedQuestion('Delayed question',true);
 assert.deepEqual(render().value.papers.map(p=>p.canonicalId),['doi:live']);
 assert.equal(render().value.question,'');
});
test('library seeding fills a new question once and preserves an explicitly cleared question across refresh',()=>{
 const before=globalThis.sessionStorage,values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 try{
  const render=harness();let selection=render();selection.seedQuestion('Default route question',true);selection=render();assert.equal(selection.value.question,'Default route question');
  selection.change({...selection.value,question:''});selection=harness()();selection.seedQuestion('Default route question',true);assert.equal(harness()().value.question,'');
 }finally{if(before===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=before;}
});
