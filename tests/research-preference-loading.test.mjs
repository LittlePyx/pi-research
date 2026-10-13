import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

const require=createRequire(import.meta.url),settle=()=>new Promise(resolve=>setImmediate(resolve));
const root=ts.createSourceFile('research-app.tsx',readFileSync('app/research-app.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let attributes,reload;
function find(node){
 if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(root)==='ResearchPreferences')attributes=node.attributes.properties;
 if(ts.isVariableDeclaration(node)&&node.name.getText(root)==='reloadSavedMonitor')reload=node.initializer;
 ts.forEachChild(node,find);
}
find(root);
function expression(name){return attributes.find(a=>ts.isJsxAttribute(a)&&a.name.getText(root)===name).initializer.expression.getText(root)}
const binding=new Function('monitor','monitorLoadFailed','reloadingMonitor',`return {loading:${expression('loading')},failed:${expression('failed')},retrying:${expression('retrying')}}`);
const code=ts.transpileModule(readFileSync('app/components/research-preferences.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const signal={id:'method',layer:'explicit',kind:'method',labelZh:'有限码长方法',labelEn:'Finite blocklength methods',evidence:'A saved note',sourcePaperId:'paper'};
function harness(props){
 const cells=[];let index=0,tree;const mod={exports:{}};
 const hooks={useState(initial){const i=index++;cells[i]??={value:initial};return[cells[i].value,value=>{cells[i].value=typeof value==='function'?value(cells[i].value):value}]}};
 new Function('require','exports',code)(name=>name==='react'?hooks:require(name),mod.exports);
 props={signals:[],locale:'en',demo:false,loading:false,failed:false,retrying:false,onRetry:()=>{},onToggle:async()=>true,onRecords:()=>{},onPaper:()=>{},...props};
 const render=()=>{index=0;tree=mod.exports.ResearchPreferences(props)};
 const nodes=()=>{const found=[],visit=node=>{if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){found.push(node);visit(node.props?.children)}};visit(tree);return found};
 render();return{props,render,nodes,text:()=>JSON.stringify(tree)};
}

test('a failed scan cannot hide successfully loaded research interests',()=>{
 const state=binding({status:'error',preferenceSignals:[signal]},false,false),h=harness({...state,signals:[signal]});
 assert.equal(state.failed,false);assert.equal(state.loading,false);assert.match(h.text(),/Finite blocklength methods/);assert.equal(h.nodes().some(n=>n.props?.role==='alert'),false);
});

test('a genuine read failure has retry instead of perpetual loading or a false empty state',()=>{
 let attempts=0;const state=binding(null,true,false),h=harness({...state,onRetry:()=>{attempts++}});
 assert.equal(state.loading,false);assert.equal(state.failed,true);assert.match(h.text(),/saved records are retained/);assert.doesNotMatch(h.text(),/Start with a paper|Loading interests/);
 const retry=h.nodes().find(n=>n.type==='button'&&n.props.children==='Retry loading');retry.props.onClick();assert.equal(attempts,1);
 Object.assign(h.props,binding(null,true,true));h.render();assert.equal(h.nodes().find(n=>n.type==='button'&&n.props.children==='Loading…').props.disabled,true);
 Object.assign(h.props,{signals:[signal],...binding({status:'error'},false,false)});h.render();assert.match(h.text(),/Finite blocklength methods/);assert.doesNotMatch(h.text(),/Interests could not load/);
});

test('cached interests and their source actions remain visible when a later read fails',()=>{
 const opened=[],h=harness({signals:[signal],failed:true,onPaper:id=>opened.push(id)});
 assert.match(h.text(),/previously loaded records/);assert.match(h.text(),/Finite blocklength methods/);
 h.nodes().find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Open source paper')).props.onClick();assert.deepEqual(opened,['paper']);
});

test('initial loading remains distinct from an empty, successfully read preference collection',()=>{
 const h=harness(binding(null,false,false));assert.match(h.text(),/Loading interests/);assert.doesNotMatch(h.text(),/Start with a paper/);
 Object.assign(h.props,binding({status:'ready'},false,false));h.render();assert.match(h.text(),/Start with a paper/);assert.doesNotMatch(h.text(),/Loading interests/);
});

test('the actual retry callback reads saved monitor data, does not start discovery, and ignores another space',async()=>{
 const compiled=ts.transpileModule(`export const reload=${reload.getText(root)};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const requests=[],changes=[],scope={current:'owned'},mod={exports:{}};
 new Function('exports','fetch','activeSpace','paperNetworkSpaceRef','reloadingMonitor','setReloadingMonitor','setMonitor','setMonitorLoadFailed',compiled)(mod.exports,(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),{id:'owned'},scope,false,value=>changes.push(['busy',value]),value=>changes.push(['monitor',value]),value=>changes.push(['failed',value]));
 const retry=new Function('reloadSavedMonitor',`return ${expression('onRetry')}`)(mod.exports.reload);
 retry();const first=requests.shift();assert.equal(first.url,'/api/monitor?spaceId=owned');assert.equal(first.options.method,undefined);assert.equal(first.options.body,undefined);
 first.resolve({ok:true,json:async()=>({monitor:{status:'error',preferenceSignals:[signal]}})});await settle();assert.equal(changes.some(([kind,value])=>kind==='failed'&&value===false),true);assert.equal(requests.length,0,'retry has no scan request');
 changes.length=0;retry();const second=requests.shift();scope.current='different';second.resolve({ok:true,json:async()=>({monitor:{status:'ready'}})});await settle();assert.deepEqual(changes,[['busy',true]],'old-space response cannot overwrite current content');
});
