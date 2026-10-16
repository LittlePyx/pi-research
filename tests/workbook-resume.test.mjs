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
 new Function('require','exports',code)(name=>name==='react'?hooks:name.includes('workspace-request')?{workspaceFetch:(url,init)=>new Promise(resolve=>requests.push({url,init,resolve:(data,ok=true,status=ok?200:422)=>resolve({ok,status,json:async()=>data})}))}:name.endsWith('.css')?{}:name==='./math-text'?{MathText:({children})=>children}:name==='./draft-recovery'?{DraftRecovery:()=>null}:name.startsWith('../../lib/')?require('../lib/'+name.split('/').at(-1)+'.ts'):require(name),mod.exports);
 const props={userId:'u',spaceId:'s',trackId:'t',locale:'en',onBack(){},onOpenPaper(){},onWorkbookChange:id=>versions.push(id),onViewChange:(...v)=>views.push(v),...extra};
 const render=()=>{index=0;tree=mod.exports.ResearchWorkbook(props);effects.splice(0).forEach(fn=>fn());return tree};
 const nodes=()=>{const list=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){list.push(n);walk(n.props?.children)}}walk(tree);return list};
 render();return{props,render,nodes,requests,versions,views,text:()=>JSON.stringify(tree)};
}
const ready=id=>({workbook:{id,revision:'rev',status:'ready',stale:false,sources:workbookSources,candidates:workbookSources,content:workbookSample(),artifact:{revision:1,value:{observations:{},decision:'Saved decision',unresolved:'Check assumptions'}},retryAt:0},versions:[{id:'old',status:'ready',created_at:'yesterday'},{id:'new',status:'ready',created_at:'today'}]});

test('only field-patch checkpoints claim that approved fields were preserved',async()=>{
 const h=harness(),data=ready('patched');data.workbook.revisionFlow={engine:'langgraph-v1',repairs:1,limit:1,next:'stopped',revisedFields:1,preservedFields:18};
 h.requests.shift().resolve(data);await settle();h.render();assert.match(h.text(),/Changed only 1 failed fields; preserved 18 fields/);
 const legacy=harness();delete data.workbook.revisionFlow.revisedFields;delete data.workbook.revisionFlow.preservedFields;
 legacy.requests.shift().resolve(data);await settle();legacy.render();assert.doesNotMatch(legacy.text(),/Changed only/);
});

test('a graph comparison resumes reviewed content and saved notes instead of erasing them',async()=>{
 const taskContext={spaceId:'s',question:'My precise question',papers:workbookSources.map(s=>({canonicalId:s.canonicalId,title:s.title}))};
 const h=harness({taskContext});assert.match(h.requests[0].url,/selection=1/);
 h.requests.shift().resolve(ready('s:t:exact'));await settle();h.render();
 assert.match(h.text(),/Saved decision/);assert.match(h.text(),/Condition comparison/);
 assert.deepEqual(h.versions,['s:t:exact']);
});

test('returning practice results refreshes the exact mounted workbook and preserves unsaved comparison edits',async()=>{
 const h=harness();h.requests.shift().resolve(ready('s:t:exact'));await settle();h.render();
 h.props.refreshKey=1;h.render();assert.match(h.requests[0].url,/workbookId=s%3At%3Aexact/);
 h.requests.shift().resolve(ready('s:t:exact'));await settle();h.render();
 const note=h.nodes().find(n=>n.type==='textarea'&&n.props.value==='Saved decision');note.props.onChange({target:{value:'Unsaved comparison judgment'}});h.render();
 h.props.refreshKey=2;h.render();assert.equal(h.requests.length,0);assert.match(h.text(),/Unsaved comparison judgment/);
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

test('retry cooldown expires and continues the saved review using the same comparison ID',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const h=harness({initialWorkbookId:'recovery'}),data=ready('recovery');
 Object.assign(data.workbook,{content:null,artifact:null,status:'retryable',stage:'review',retryAt:2000,failure:{code:'rate_limited',stage:'review'}});
 h.requests.shift().resolve(data);await settle();h.render();
 const retry=()=>h.nodes().find(n=>n.type==='button'&&n.props.children==='Continue review');
 assert.equal(retry().props.disabled,true);assert.match(h.text(),/resumes independent review only/);
 t.mock.timers.tick(1100);h.render();assert.equal(retry().props.disabled,false);
 retry().props.onClick();assert.equal(h.requests.length,1);
 assert.deepEqual(JSON.parse(h.requests[0].init.body),{spaceId:'s',trackId:'t',action:'advance',workbookId:'recovery'});
 h.requests.shift().resolve(ready('recovery'));await settle();h.render();assert.match(h.text(),/Saved decision/);
});

test('an in-flight comparison can refresh its checkpoint without starting another model action',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const h=harness(),data=ready('in-flight');
 Object.assign(data.workbook,{content:null,artifact:null,status:'draft',stage:'draft',busyUntil:2000});
 h.requests.shift().resolve(data);await settle();h.render();
 assert.equal(h.nodes().find(n=>n.type==='button'&&n.props.children==='Continue generation').props.disabled,true);
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Refresh progress').props.onClick();h.render();
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].init?.method,undefined);assert.match(h.requests[0].url,/workbookId=in-flight/);
 h.requests.shift().resolve(ready('in-flight'));await settle();h.render();
});

test('a feedback correction preserves the original selected sources and focused question',async()=>{
 const h=harness(),data=ready('rejected-baseline');
 Object.assign(data.workbook,{content:null,artifact:null,status:'rejected',focusQuestion:'Keep this exact focused question',reviewIssues:[{id:'comparison',paperIds:[workbookSources[0].id],reason:'The claimed bound is not entailed by the quote.',issueType:'unclassified'}]});
 h.requests.shift().resolve(data);await settle();h.render();
 assert.match(h.text(),/claimed bound is not entailed/);assert.match(h.text(),/Comparison conclusion/);
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Try one feedback correction').props.onClick();
 const input=JSON.parse(h.requests[0].init.body);assert.equal(input.allowRepair,true);assert.equal(input.focusQuestion,data.workbook.focusQuestion);assert.deepEqual(input.paperIds,workbookSources.map(s=>s.id));
 h.requests.shift().resolve({...data,workbook:{...data.workbook,id:'pilot',revisionFlow:{engine:'langgraph-v1',repairs:1,limit:1,next:'stopped'}}});await settle();h.render();
 assert.equal(h.nodes().some(n=>n.type==='button'&&n.props.children==='Try one feedback correction'),false,'stopped trials cannot start another correction');
});
test('a rejected comparison can narrow its question without losing the original version or papers',async()=>{
 const h=harness(),data=ready('rejected-broad-question');Object.assign(data.workbook,{status:'rejected',content:null,artifact:null,focusQuestion:'Broad route question'});
 h.requests.shift().resolve(data);await settle();h.render();
 const question=h.nodes().find(n=>n.type==='textarea'&&n.props.maxLength===1000);assert.equal(question.props.value,'Broad route question');
 question.props.onChange({target:{value:'Compare only the channel assumptions stated in these abstracts'}});h.render();
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Prepare comparison and tasks').props.onClick();
 const body=JSON.parse(h.requests[0].init.body);assert.equal(body.action,'prepare');assert.equal(body.focusQuestion,'Compare only the channel assumptions stated in these abstracts');assert.deepEqual(body.paperIds,workbookSources.map(s=>s.id));
 h.requests.shift().resolve({...ready('narrow-version'),workbook:{...ready('narrow-version').workbook,focusQuestion:body.focusQuestion}});await settle();h.render();assert.deepEqual(h.versions,['rejected-broad-question','narrow-version']);
 assert.equal(h.nodes().find(n=>n.type==='textarea'&&n.props.maxLength===1000).props.value,body.focusQuestion);
});
test('changing spaces clears an old comparison question even if the new record cannot load',async()=>{
 const h=harness(),data=ready('old');data.workbook.focusQuestion='Old-space question';h.requests.shift().resolve(data);await settle();h.render();
 h.nodes().find(n=>n.type==='textarea'&&n.props.maxLength===1000).props.onChange({target:{value:'Unsubmitted old-space question'}});h.render();
 h.props.spaceId='another-space';h.render();h.render();h.requests.shift().resolve({error:'Unavailable'},false);await settle();h.render();
 assert.equal(h.nodes().find(n=>n.type==='textarea'&&n.props.maxLength===1000).props.value,'');
});

test('a refreshed unfinished comparison restores the exact selection and edited question, including an empty selection',async()=>{
 const before=globalThis.sessionStorage,values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 try{
  const data=ready('');Object.assign(data.workbook,{content:null,artifact:null,focusQuestion:''});
  const h=harness({taskContext:{spaceId:'s',question:'Original task',papers:[]}});h.requests.shift().resolve(data);await settle();h.render();
  h.nodes().find(n=>n.type==='textarea'&&n.props.maxLength===1000).props.onChange({target:{value:'My narrowed comparison question'}});h.render();
  const checkbox=h.nodes().find(n=>n.type==='input'&&n.props.type==='checkbox');checkbox.props.onChange();h.render();
  const fresh=harness();fresh.requests.shift().resolve(data);await settle();fresh.render();
  assert.match(fresh.text(),/My narrowed comparison question/);assert.equal(fresh.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.checked).length,1);
  fresh.nodes().find(n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.checked).props.onChange();fresh.render();
  const empty=harness();empty.requests.shift().resolve(data);await settle();empty.render();assert.equal(empty.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.checked).length,0);
 }finally{if(before===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=before;}
});

test('save-and-return waits for persistence; failure retains the judgment and original task',async()=>{
 let returned=0;const h=harness({onBack:()=>returned++});h.requests.shift().resolve(ready('exact'));await settle();h.render();
 h.nodes().find(n=>n.type==='textarea'&&n.props.value==='Saved decision').props.onChange({target:{value:'Unsubmitted sourced judgment'}});h.render();
 const button=()=>h.nodes().find(n=>n.type==='button'&&n.props.children==='Save & return to task');button().props.onClick();assert.equal(returned,0);
 h.requests.shift().resolve({error:'Conflicting version'},false);await settle();h.render();assert.match(h.text(),/Unsubmitted sourced judgment/);assert.equal(returned,0);
 button().props.onClick();const saved=ready('exact');saved.workbook.artifact.value.decision='Unsubmitted sourced judgment';h.requests.shift().resolve(saved);await settle();h.render();assert.equal(returned,1);
});

test('the persistent save bar distinguishes tab drafts, active saving, conflicts and confirmed server saves',async()=>{
 const before=globalThis.sessionStorage,values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 try{
  const h=harness();h.requests.shift().resolve(ready('exact'));await settle();h.render();assert.match(h.text(),/Saved to workspace/);
  assert.equal(h.nodes().filter(n=>n.type==='footer'&&n.props.className==='pi-workbook-savebar').length,1);
  h.nodes().find(n=>n.type==='textarea'&&n.props.value==='Saved decision').props.onChange({target:{value:'A new sourced judgment'}});h.render();assert.match(h.text(),/draft saved in this tab/);
  h.nodes().find(n=>n.type==='button'&&n.props.children==='Save notes').props.onClick();h.render();assert.match(h.text(),/Saving to workspace/);
  h.requests.shift().resolve({error:'Newer saved revision'},false,409);await settle();h.render();assert.match(h.text(),/Saved version changed/);assert.match(h.text(),/A new sourced judgment/);
  h.nodes().find(n=>n.type==='button'&&n.props.children==='Save notes').props.onClick();const saved=ready('exact');saved.workbook.artifact={revision:2,value:{observations:{},decision:'A new sourced judgment',unresolved:'Check assumptions'}};h.requests.shift().resolve(saved);await settle();h.render();assert.match(h.text(),/revision 2/);assert.doesNotMatch(h.text(),/Saved version changed/);
 }finally{if(before===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=before;}
});
