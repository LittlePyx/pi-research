import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {workbookSample,workbookSources} from './fixtures/research-workbook.mjs';
const require=createRequire(import.meta.url),settle=()=>new Promise(resolve=>setImmediate(resolve));
const code=ts.transpileModule(readFileSync(new URL('../app/components/workbook-practice.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const ready=(id='v1')=>({workbook:{id,revision:'source-rev',status:'ready',stale:false,content:workbookSample(),sources:workbookSources,candidates:workbookSources,artifact:{revision:2,value:{observations:{},decision:'Preserved comparison',unresolved:'Preserved gap'}},retryAt:0}});
function harness(){
 const cells=[],effects=[],requests=[],selected=[],opened=[];let index=0,tree;
 const hooks={useState(initial){const i=index++;cells[i]??={value:typeof initial==='function'?initial():initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}]},useRef(initial){const i=index++;cells[i]??={current:initial};return cells[i]},useEffect(fn,deps){const i=index++,old=cells[i];if(!old||deps.some((v,n)=>v!==old.deps[n]))effects.push(()=>{old?.cleanup?.();cells[i]={deps,cleanup:fn()}})}};
 const mod={exports:{}};new Function('require','exports',code)(name=>name==='react'?hooks:name.includes('workspace-request')?{workspaceFetch:(url,init)=>new Promise(resolve=>requests.push({url,init,resolve:(data,status=200)=>resolve({ok:status>=200&&status<300,status,json:async()=>data})}))}:name.endsWith('.css')?{}:name==='./math-text'?{MathText:({children})=>children}:name==='./draft-recovery'?{DraftRecovery:()=>null}:name.startsWith('../../lib/')?require('../lib/'+name.split('/').at(-1)+'.ts'):require(name),mod.exports);
 const props={userId:'u',spaceId:'s',trackId:'r',workbookId:'v1',practiceId:'task-0',locale:'en',onSelect:id=>selected.push(id),onOpenPaper:(...args)=>opened.push(args),onBack(){}};
 const render=()=>{index=0;tree=mod.exports.WorkbookPractice(props);effects.splice(0).forEach(fn=>fn());return tree};
 const nodes=()=>{const list=[];function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){list.push(n);visit(n.props?.children)}}visit(tree);return list};
 render();return{props,requests,selected,opened,render,nodes,text:()=>JSON.stringify(tree),input(value){nodes().find(n=>n.type==='textarea'&&n.props.maxLength===4000).props.onChange({target:{value}});render()},button(label){return nodes().find(n=>n.type==='button'&&n.props.children===label)}};
}
test('practice saves preserve inputs on conflict and submit no comparison-note or reading-status changes',async()=>{
 const h=harness();h.requests.shift().resolve(ready());await settle();h.render();h.render();
 assert.equal(h.button('Save, mark complete & continue').props.disabled,true);
 h.input('My sourced result and explicit conditions');h.button('Save result').props.onClick();
 const request=h.requests.shift(),body=JSON.parse(request.init.body);
 assert.equal(body.action,'save-practice');assert.equal(body.workbookId,'v1');assert.equal(body.baseRevision,2);assert.equal(body.value.entries['task-0'].completed,false);assert.equal(body.value.decision,undefined);assert.equal(body.readingStatus,undefined);
 request.resolve({},409);await settle();h.render();assert.match(h.text(),/Input preserved|Input preserved/i);assert.match(h.text(),/My sourced result/);
 h.button('Load latest and merge').props.onClick();const latest=ready();latest.workbook.artifact.revision=3;h.requests.shift().resolve(latest);await settle();h.render();h.render();
 assert.match(h.text(),/Review and save again/);assert.match(h.text(),/My sourced result/);
 h.button('Save, mark complete & continue').props.onClick();const save=h.requests.shift(),completed=JSON.parse(save.init.body).value;
 assert.equal(JSON.parse(save.init.body).baseRevision,3);
 assert.equal(completed.entries['task-0'].completed,true);assert.notEqual(completed.activeId,'task-0');
 const response=ready();response.workbook.artifact={revision:3,value:{...response.workbook.artifact.value,practice:completed}};save.resolve(response);await settle();h.render();
 assert.equal(h.selected.at(-1),completed.activeId);assert.match(h.text(),/Reading and mastery are unchanged/);
});
test('same-field conflict requires a choice; failed recovery and changed evidence retain local input',async()=>{
 const h=harness();h.requests.shift().resolve(ready());await settle();h.render();h.render();h.input('Local result');
 h.button('Save result').props.onClick();h.requests.shift().resolve({},409);await settle();h.render();
 h.button('Load latest and merge').props.onClick();h.requests.shift().resolve({},503);await settle();h.render();assert.match(h.text(),/Local result/);assert.match(h.text(),/Latest record unavailable/);
 h.button('Load latest and merge').props.onClick();const latest=ready();latest.workbook.artifact={revision:3,value:{...latest.workbook.artifact.value,practice:{activeId:'task-0',entries:{'task-0':{result:'Remote result',unresolved:'',completed:true}}}}};h.requests.shift().resolve(latest);await settle();h.render();h.render();
 assert.equal(h.button('Save result').props.disabled,true);assert.match(h.text(),/Remote result/);assert.match(h.text(),/Local result/);
 h.button('Keep local input').props.onClick();h.render();assert.equal(h.button('Save result').props.disabled,false);
 h.button('Save result').props.onClick();const save=h.requests.shift(),body=JSON.parse(save.init.body);assert.equal(body.baseRevision,3);assert.equal(body.value.entries['task-0'].result,'Local result');assert.equal(body.value.entries['task-0'].completed,false);
 save.resolve({},409);await settle();h.render();h.button('Load latest and merge').props.onClick();const changed=ready();changed.workbook.revision='new-evidence';h.requests.shift().resolve(changed);await settle();h.render();assert.match(h.text(),/Evidence changed/);assert.match(h.text(),/Local result/);assert.equal(h.button('Save result').props.disabled,true);
});
test('practice source links carry the real source and task; stale evidence disables writes',async()=>{
 const h=harness(),data=ready();data.workbook.stale=true;h.requests.shift().resolve(data);await settle();h.render();h.render();
 assert.equal(h.button('Save result').props.disabled,true);h.nodes().find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.includes('Open paper for this task')).props.onClick();
 assert.ok(workbookSources.some(source=>source.id===h.opened[0][0].id));assert.equal(h.opened[0][1],workbookSample().task.steps[0].textEn);
});
test('restoring a draft after refresh reconstructs conflicts against its original base',async()=>{
 const h=harness(),data=ready();data.workbook.artifact.value.practice={activeId:'task-0',entries:{'task-0':{result:'Server edit',unresolved:'',completed:false}}};h.requests.shift().resolve(data);await settle();h.render();h.render();
 const recovery=h.nodes().find(n=>n.props?.storageKey&&n.props?.onRestore);
 recovery.props.onRestore(JSON.stringify({activeId:'task-0',entries:{'task-0':{result:'Unsubmitted local edit',unresolved:'',completed:false}}}),'null');h.render();
 assert.equal(h.button('Save result').props.disabled,true);assert.match(h.text(),/Server edit/);assert.match(h.text(),/Unsubmitted local edit/);
 h.button('Use latest record').props.onClick();h.render();assert.match(h.text(),/Server edit/);assert.doesNotMatch(h.text(),/Unsubmitted local edit/);
});
test('a late response from a previous space cannot populate the new practice editor',async()=>{
 const h=harness(),old=h.requests.shift();h.props.spaceId='new-space';h.props.workbookId='v2';h.render();const current=h.requests.shift();
 current.resolve(ready('v2'));await settle();h.render();h.input('New-space result');old.resolve(ready('v1'));await settle();h.render();assert.match(h.text(),/New-space result/);
});
test('comparison practice does not trigger normal learning-path discovery',()=>{
 const ast=ts.createSourceFile('app.tsx',readFileSync(new URL('../app/research-app.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);const expressions=[];
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='needsLearningPath')expressions.push(node.initializer.getText(ast));ts.forEachChild(node,visit)}visit(ast);assert.equal(expressions.length,2);
 for(const expression of expressions){const needs=new Function('view','comparisonPractice','researchMapMode','paperNetworkMode','return '+expression);assert.equal(needs('learn',{},'directions','similarity'),false);assert.equal(needs('learn',null,'directions','similarity'),true);assert.equal(needs('threads',null,'papers','path'),true);}
});
