import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../app/components/research-entry.tsx',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const goal={id:'question-one',trackId:'entry-one',question:'What assumptions govern finite blocklength compression?',status:'active',monitoringStatus:'active'};
function harness(){
 const cells=[],requests=[],effects=[];let index=0,tree,saved=0,discovered=0;
 const hooks={useState(initial){const i=index++;cells[i]??={value:initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}]},
  useRef(initial){const i=index++;cells[i]??={current:initial};return cells[i]},
  useEffect(fn,deps){const i=index++,old=cells[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){effects.push(()=>{old?.cleanup?.();cells[i]={deps,cleanup:fn()}})}}};
 const mod={exports:{}};
 new Function('require','exports',code)(name=>name==='../../lib/research-digest.mjs'?require('../lib/research-digest.mjs'):name==='./digest-overview'?{DigestOverview:()=>null}:name==='./task-brief-evidence'?{TaskBriefEvidence:()=>null}:name==='../../lib/task-brief-presentation.mjs'?require('../lib/task-brief-presentation.mjs'):name==='react'?hooks:name==='./paper-figure'?{PaperFigure:()=>null}:name==='./problem-discovery'?{ProblemDiscovery:()=>null}:name==='./math-text'?{MathText:({children})=>children}:name.endsWith('.css')?{}:name.includes('workspace-request')?{workspaceFetch:(url,init)=>new Promise(resolve=>requests.push({url,init,resolve:data=>resolve({ok:true,json:async()=>data})}))}:require(name),mod.exports);
 const props={spaceId:'owned',spaceName:'Information theory',locale:'en',demo:false,refreshKey:'initial',scanStatus:'Restoring earlier scan',blocked:'An earlier scan is running',resume:null,onProgress(){},onRead(){},onRoute(){},onReadingList(){},onSaved(){saved++},onDiscover(){discovered++}};
 const nodes=()=>{const found=[];function visit(node){if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){found.push(node);visit(node.props?.children)}}visit(tree);return found};
 const render=()=>{index=0;tree=mod.exports.ResearchEntry(props);effects.splice(0).forEach(fn=>fn());return tree};
 render();
 return{requests,props,render,nodes,counts:()=>({saved,discovered}),input(value){nodes().find(n=>n.type==='textarea').props.onChange({target:{value}});render()},submit(){nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}})},text(){return JSON.stringify(tree)}};
}
test('A null save receipt preserves the draft and never triggers discovery or a success callback',async()=>{
 const h=harness();h.requests.shift().resolve({goal:null,papers:[]});await settle();h.render();h.input(goal.question);h.submit();
 h.requests.shift().resolve({goal:null,papers:[],confirmed:{id:goal.id}});await settle();h.render();
 assert.equal(h.nodes().find(n=>n.type==='textarea').props.value,goal.question);
 assert.match(h.text(),/Could not confirm the save/);assert.deepEqual(h.counts(),{saved:0,discovered:0});
});
test('A confirmed question survives an empty refresh and exposes its space, progress and route',async()=>{
 const h=harness();h.requests.shift().resolve({goal:null,papers:[]});await settle();h.render();h.input(goal.question);h.submit();
 h.requests.shift().resolve({goal,papers:[]});await settle();h.render();
 assert.match(h.text(),/Information theory/);assert.match(h.text(),/Restoring earlier scan/);assert.match(h.text(),/Open research route/);
 assert.deepEqual(h.counts(),{saved:1,discovered:0});
 h.props.refreshKey='next';h.render();assert.match(h.requests[0].url,/goalId=question-one/);
 h.requests.shift().resolve({goal:null,papers:[]});await settle();h.render();
 assert.match(h.text(),/Could not load the research question/);assert.match(h.text(),/What assumptions govern/);
 assert.equal(h.nodes().filter(n=>n.type==='form').length,0);
});
test('A refresh while saving cannot replace the pending submission or erase its draft',async()=>{
 const h=harness();h.requests.shift().resolve({goal:null,papers:[]});await settle();h.render();h.input(goal.question);
 h.props.refreshKey='before-save';h.render();const stale=h.requests.shift();h.submit();const post=h.requests.shift();
 h.props.refreshKey='during-save';h.render();assert.equal(h.requests.length,0);
 stale.resolve({goal:null,papers:[]});await settle();h.render();assert.equal(h.nodes().find(n=>n.type==='textarea').props.value,goal.question);
 post.resolve({goal,papers:[]});await settle();h.render();assert.match(h.text(),/Question saved/);assert.deepEqual(h.counts(),{saved:1,discovered:0});
});

test('question removal requires confirmation, survives late polling, and never triggers a scan',async()=>{
 const h=harness();h.requests.shift().resolve({goal,papers:[]});await settle();h.render();
 h.props.refreshKey='before-remove';h.render();const stale=h.requests.shift();
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Remove question').props.onClick();h.render();
 assert.equal(h.requests.length,0);assert.match(h.text(),/Papers, saves, notes/);
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Confirm removal').props.onClick();
 const del=h.requests.shift();assert.equal(del.init.method,'DELETE');assert.equal(JSON.parse(del.init.body).goalId,goal.id);
 stale.resolve({goal,papers:[]});await settle();
 del.resolve({removed:true,goal:null,papers:[]});await settle();h.render();
 assert.doesNotMatch(h.text(),/What assumptions govern/);assert.ok(h.nodes().some(n=>n.type==='textarea'));assert.deepEqual(h.counts(),{saved:1,discovered:0});
 h.props.refreshKey='after-remove';h.render();assert.match(h.requests[0].url,/goalId=$/);
 h.requests.shift().resolve({goal:null,papers:[]});await settle();h.render();assert.doesNotMatch(h.text(),/Could not load/);
});
test('unconfirmed removal preserves the question and allows retry',async()=>{
 const h=harness();h.requests.shift().resolve({goal,papers:[]});await settle();h.render();
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Remove question').props.onClick();h.render();
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Confirm removal').props.onClick();h.requests.shift().resolve({});await settle();h.render();
 assert.match(h.text(),/Could not confirm removal/);assert.match(h.text(),/What assumptions govern/);assert.deepEqual(h.counts(),{saved:0,discovered:0});
});

test('removing a question returns immediately to the field cover rather than forcing another question',async()=>{
 const h=harness();h.props.mode='home';h.props.fallbackPapers=[{id:'field',title:'Published field reading',whyEn:'Field recommendation reason'}];
 h.requests.shift().resolve({goal,papers:[]});await settle();h.render();
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Remove question').props.onClick();h.render();
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Confirm removal').props.onClick();h.requests.shift().resolve({removed:true,goal:null,papers:[]});await settle();h.render();
 assert.match(h.text(),/Published field reading|FIELD BRIEF/);assert.equal(h.nodes().some(n=>n.type==='form'),false);assert.deepEqual(h.counts(),{saved:1,discovered:0});
});

test('demo reset validates its response and preserves the current question if the response is malformed',async()=>{
 const h=harness();h.props.demo=true;h.requests.shift().resolve({goal:{...goal,trackId:''},papers:[]});await settle();h.render();
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Restore sample question').props.onClick();h.requests.shift().resolve({papers:'not-an-array'});await settle();h.render();
 assert.match(h.text(),/What assumptions govern/);assert.equal(h.nodes().some(n=>n.props?.role==='alert'),true);assert.deepEqual(h.counts(),{saved:0,discovered:0});
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Restore sample question').props.onClick();h.requests.shift().resolve({goal,papers:[]});await settle();h.render();
 assert.match(h.text(),/Open research route/);assert.deepEqual(h.counts(),{saved:0,discovered:0});
});

test('a fresh empty home opens a question draft without starting a scan',async()=>{
 const h=harness();h.props.mode='home';h.props.blocked='';h.props.scanStatus='';h.requests.shift().resolve({goal:null,papers:[]});await settle();h.render();
 h.nodes().find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Define a research question')).props.onClick();h.render();
 assert.equal(h.nodes().filter(n=>n.type==='textarea').length,1);
 assert.equal(h.requests.length,0);
 assert.equal(h.counts().discovered,0);
});

test('the empty waiting home opens progress instead of launching a duplicate scan',async()=>{
 const h=harness();let progress=0;h.props.mode='home';h.props.scanStatus='Reviewing';h.props.onProgress=()=>{progress++};
 h.requests.shift().resolve({goal,papers:[]});await settle();h.render();
 h.nodes().find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('View progress & recovery')).props.onClick();
 assert.equal(progress,1);assert.equal(h.counts().discovered,0);assert.equal(h.requests.length,0);
});
