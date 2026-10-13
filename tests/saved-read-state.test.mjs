import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

const require=createRequire(import.meta.url),settle=()=>new Promise(resolve=>setImmediate(resolve));
const signal=id=>({id,layer:'explicit',kind:'method',labelZh:id,labelEn:id,evidence:'Saved evidence',sourceType:'research_space'});
const note=id=>({paperId:id,title:id,note:`Saved note ${id}`,updatedAt:'2026-10-13',status:'pending',takeawayZh:'',takeawayEn:'',methodsZh:[],methodsEn:[],questionsZh:[],questionsEn:[]});
function harness(entry='hook',props={scope:'a',url:'/api/preference-signals?spaceId=a'}){
 const cells=[],pending=[],requests=[],timers=new Map(),modules=new Map();let index=0,tree,dirty=false,clock=0,timerId=0,mounted=true;
 const same=(a,b)=>a&&a.length===b.length&&b.every((value,i)=>Object.is(value,a[i]));
 const hooks={
  useState(initial){const i=index++;cells[i]??={value:typeof initial==='function'?initial():initial};return[cells[i].value,value=>{if(!mounted)return;const next=typeof value==='function'?value(cells[i].value):value;if(!Object.is(next,cells[i].value)){cells[i].value=next;dirty=true}}]},
  useRef(initial){const i=index++;cells[i]??={current:initial};return cells[i]},
  useCallback(fn,deps){const i=index++;if(!same(cells[i]?.deps,deps))cells[i]={deps,value:fn};return cells[i].value},
  useEffect(fn,deps){const i=index++,old=cells[i];if(!same(old?.deps,deps)){cells[i]={deps,cleanup:old?.cleanup};pending.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn()})}}
 };
 const timer=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:clock+ms});return id};
 const files={'../../lib/saved-read':'lib/saved-read.ts','./saved-read':'lib/saved-read.ts','./use-saved-read':'app/components/use-saved-read.ts','../../lib/saved-memory-response':'lib/saved-memory-response.ts','./research-preferences':'app/components/research-preferences.tsx'};
 function load(file){
  if(modules.has(file))return modules.get(file);const mod={exports:{}};modules.set(file,mod.exports);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','exports','setTimeout','clearTimeout',code)(name=>name==='react'?hooks:name.includes('workspace-request')?{workspaceFetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,reject,resolve:(body,status=200)=>resolve({ok:status<400,status,json:async()=>body})}))}:name==='./math-text'?{MathText:({children})=>children}:files[name]?load(files[name]):require(name),mod.exports,timer,id=>timers.delete(id));return mod.exports;
 }
 const decoder=load('lib/saved-memory-response.ts').preferenceResponse;
 const component=entry==='hook'?p=>load('app/components/use-saved-read.ts').useSavedRead(p.scope,p.url,decoder):entry==='notes'?load('app/components/research-memory-notebook.tsx').ResearchMemoryNotebook:entry==='resume'?load('app/components/memory-resume.tsx').MemoryResume:load('app/components/research-preferences-panel.tsx').ResearchPreferencesPanel;
 const render=()=>{let passes=0;do{if(++passes>20)throw Error('Unstable render');dirty=false;index=0;tree=component(props);for(const effect of pending.splice(0))effect()}while(dirty);return tree};
 const nodes=()=>{const found=[],visit=node=>{if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){found.push(node);visit(node.props?.children)}};visit(tree);return found};
 render();return{props,requests,render,nodes,tree:()=>tree,text:()=>JSON.stringify(tree),advance(ms){clock+=ms;for(const[id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn()}},unmount(){mounted=false;for(const cell of cells)cell?.cleanup?.()},timerCount:()=>timers.size};
}

test('a saved read times out even when fetch ignores cancellation, releases loading, and permits one new retry',async()=>{
 const h=harness(),first=h.requests.shift();h.advance(20001);await settle();h.render();
 assert.equal(h.tree().loading,false);assert.equal(h.tree().error,'timeout');assert.equal(first.options.signal.aborted,true);
 h.tree().reload();h.tree().reload();h.render();assert.equal(h.requests.length,1);assert.equal(h.tree().loading,true);
 const next=h.requests.shift();next.resolve({signals:[signal('current')]});await settle();h.render();first.resolve({signals:[signal('late')]});await settle();h.render();
 assert.equal(h.tree().data.signals[0].id,'current');assert.equal(h.tree().loading,false);assert.equal(h.timerCount(),0);h.unmount();
});

test('same-workspace failures retain a saved snapshot but another workspace never receives it',async()=>{
 const h=harness();h.requests.shift().resolve({signals:[signal('owned-a')]});await settle();h.render();h.tree().reload();h.render();h.requests.shift().reject(Error('offline'));await settle();h.render();
 assert.equal(h.tree().data.signals[0].id,'owned-a');assert.equal(h.tree().error,'unavailable');
 const oldReload=h.tree().reload;h.props.scope='b';h.props.url='/api/preference-signals?spaceId=b';h.render();assert.equal(h.tree().data,null);assert.equal(h.tree().loading,true);
 h.requests.shift().resolve({signals:[]});await settle();h.render();oldReload();h.render();assert.equal(h.requests.length,0);assert.equal(h.tree().error,null);h.unmount();
});

test('access and missing-space responses discard protected cached records instead of masquerading as empty results',async()=>{
 for(const status of [401,403,404,410]){
  const h=harness();h.requests.shift().resolve({signals:[signal('private')]});await settle();h.render();h.tree().reload();h.render();h.requests.shift().resolve({error:'no access'},status);await settle();h.render();
  assert.equal(h.tree().data,null);assert.equal(h.tree().error,status<404?'access':'missing');assert.equal(h.tree().loading,false);h.unmount();
 }
});

test('A to B to A reads cannot accept the first A response after returning to A',async()=>{
 const h=harness(),oldA=h.requests.shift();h.props.scope='b';h.props.url='/api/preference-signals?spaceId=b';h.render();const oldB=h.requests.shift();
 h.props.scope='a';h.props.url='/api/preference-signals?spaceId=a';h.render();const current=h.requests.shift();assert.equal(oldA.options.signal.aborted,true);assert.equal(oldB.options.signal.aborted,true);
 current.resolve({signals:[signal('fresh-a')]});await settle();h.render();oldA.resolve({signals:[signal('old-a')]});oldB.resolve({signals:[signal('old-b')]});await settle();h.render();
 assert.equal(h.tree().data.signals[0].id,'fresh-a');h.unmount();
});

test('malformed saved responses fail explicitly without creating a false empty success',async()=>{
 const h=harness();h.requests.shift().resolve({signals:{}});await settle();h.render();assert.equal(h.tree().data,null);assert.equal(h.tree().error,'invalid');assert.equal(h.tree().loading,false);h.unmount();
});

test('unmount aborts a saved read and removes its deadline without accepting a later result',async()=>{
 const h=harness(),request=h.requests.shift();h.unmount();await settle();assert.equal(request.options.signal.aborted,true);assert.equal(h.timerCount(),0);request.resolve({signals:[signal('late')]});await settle();assert.equal(h.tree().data,null);
});

test('research preferences load only their own GET endpoint and revalidate after confirmed feedback',async()=>{
 const writes=[],h=harness('preferences',{spaceId:'owned',locale:'en',demo:false,onToggle:async(item,active)=>{writes.push([item.id,active]);return true},onRecords:()=>{},onPaper:()=>{}});
 const first=h.requests.shift();assert.equal(first.url,'/api/preference-signals?spaceId=owned');assert.equal(first.options.method,'GET');first.resolve({signals:[signal('method')]});await settle();h.render();
 assert.equal(h.tree().props.failed,false);assert.equal(h.tree().props.signals.length,1);await h.tree().props.onToggle(signal('method'),false);h.render();assert.deepEqual(writes,[['method',false]]);
 const refreshed=h.requests.shift();assert.equal(refreshed.options.method,'GET');refreshed.resolve({signals:[]});await settle();h.render();assert.equal(h.tree().props.signals.length,0);assert.equal(h.requests.length,0);h.unmount();
});

test('note searches retain previous results with their original query and paging metadata after a failed search',async()=>{
 const h=harness('notes',{spaceId:'owned',locale:'en',onOpenPaper:()=>{},onQuestion:()=>{},onLibrary:()=>{}});
 h.requests.shift().resolve({items:[note('Original paper')],total:25,offset:0,nextOffset:24});await settle();h.render();
 h.nodes().find(n=>n.type==='input').props.onChange({target:{value:'new-query'}});h.render();h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();
 const next=h.requests.shift();assert.match(next.url,/q=new-query/);assert.match(h.text(),/Original paper/);assert.match(h.text(),/previously loaded/);next.reject(Error('offline'));await settle();h.render();
 assert.match(h.text(),/25 reading notes/);assert.doesNotMatch(h.text(),/25 matching records/);assert.match(h.text(),/Original paper/);assert.equal(h.nodes().find(n=>n.type==='button'&&n.props.children==='Next').props.disabled,true);
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Retry').props.onClick();h.render();h.requests.shift().resolve({items:[note('New paper')],total:1,offset:0,nextOffset:null});await settle();h.render();assert.match(h.text(),/New paper|1 matching records/);assert.doesNotMatch(h.text(),/Original paper/);h.unmount();
});

test('note timeout does not claim there are no notes and switching workspace clears old note contents',async()=>{
 const h=harness('notes',{spaceId:'owned',locale:'en',onOpenPaper:()=>{},onQuestion:()=>{},onLibrary:()=>{}}),request=h.requests.shift();h.advance(20001);await settle();h.render();assert.match(h.text(),/timed out/);assert.doesNotMatch(h.text(),/Start with a note/);
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Retry').props.onClick();h.render();h.requests.shift().resolve({items:[note('Private note')],total:1,offset:0,nextOffset:null});await settle();h.render();
 h.props.spaceId='different';h.render();assert.doesNotMatch(h.text(),/Private note/);assert.match(h.text(),/Loading notes/);request.resolve({items:[note('Late old note')],total:1,offset:0,nextOffset:null});await settle();h.render();assert.doesNotMatch(h.text(),/Late old note/);h.unmount();
});

test('an emptied last page preserves the workspace count and offers access to the previous notes',async()=>{
 const h=harness('notes',{spaceId:'owned',locale:'en',onOpenPaper:()=>{},onQuestion:()=>{},onLibrary:()=>{}});
 h.requests.shift().resolve({items:[note('First page')],total:25,offset:0,nextOffset:24});await settle();h.render();
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Next').props.onClick();h.render();
 h.requests.shift().resolve({items:[],total:24,offset:24,nextOffset:null});await settle();h.render();
 assert.match(h.text(),/24 reading notes/);assert.match(h.text(),/No notes on this page/);assert.doesNotMatch(h.text(),/Start with a note/);
 assert.equal(h.nodes().find(n=>n.type==='button'&&n.props.children==='Previous').props.disabled,false);
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Previous').props.onClick();h.render();assert.match(h.requests.shift().url,/offset=0/);h.unmount();
});

test('comparison route changes clear another route while a failed refresh retains the current saved comparison',async()=>{
 const h=harness('resume',{spaceId:'owned',locale:'en',routes:[{id:'a',title:'Route A'},{id:'b',title:'Route B'}],onCompare:()=>{}});
 h.requests.shift().resolve({workbook:{artifact:{value:{unresolved:'Saved question A'}}}});await settle();h.render();h.nodes().find(n=>n.type==='select').props.onChange({target:{value:'b'}});h.render();
 assert.doesNotMatch(h.text(),/Saved question A/);h.requests.shift().resolve({workbook:{artifact:{value:{unresolved:'Saved question B'}}}});await settle();h.render();
 h.nodes().find(n=>n.type==='button'&&n.props.className==='pi-saved-refresh').props.onClick();h.render();h.requests.shift().reject(Error('offline'));await settle();h.render();
 assert.match(h.text(),/Saved question B/);assert.match(h.text(),/Previously loaded comparison/);assert.doesNotMatch(h.text(),/No saved comparison/);
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Retry').props.onClick();h.render();h.requests.shift().resolve({workbook:{artifact:{value:{unresolved:'Refreshed question B'}}}});await settle();h.render();assert.match(h.text(),/Refreshed question B/);h.unmount();
});
