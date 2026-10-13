import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const code=ts.transpileModule(readFileSync(new URL('../app/components/use-task-brief.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const cells=[],effects=[],requests=[];let index=0,state;
 const hooks={useState(initial){const i=index++;cells[i]??={value:initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}]},useRef(initial){const i=index++;cells[i]??={current:initial};return cells[i]},useEffect(fn,deps){const i=index++,old=cells[i];if(!old||deps.some((v,n)=>v!==old.deps[n]))effects.push(()=>{old?.cleanup?.();cells[i]={deps,cleanup:fn()}})}};
 const mod={exports:{}};
 new Function('require','exports',code)(name=>name==='react'?hooks:{workspaceFetch:(url,init)=>new Promise(resolve=>requests.push({url,init,resolve:(brief,ok=true)=>resolve({ok,json:async()=>({brief})})}))},mod.exports);
 const props={spaceId:'s',enabled:true,refresh:'initial'};
 const render=()=>{index=0;state=mod.exports.useTaskBrief(props.spaceId,props.enabled,props.refresh);effects.splice(0).forEach(fn=>fn());return state};
 render();return{props,requests,render,state:()=>state};
}
const brief=id=>({snapshotId:id,records:[{paperId:'p',abstractText:'Frozen evidence'}],currentStates:[{paperId:'p',readingStatus:'unread',feedback:null,saved:false,recommended:true,snoozed:false}]});

test('saved feedback prevents a late task response from restoring old reading eligibility',async()=>{
 const h=harness();h.requests.shift().resolve(brief('original'));await settle();h.render();
 h.props.refresh='pending';h.render();const late=h.requests.shift();
 h.state().patchPaper('p',{feedback:'not_relevant',readingStatus:'read'});h.render();
 late.resolve(brief('obsolete'));await settle();const view=h.render().brief;
 assert.equal(view.snapshotId,'original');assert.equal(view.currentStates[0].feedback,'not_relevant');assert.equal(view.currentStates[0].readingStatus,'read');assert.equal(view.records[0].abstractText,'Frozen evidence');
 h.props.refresh='retry';h.render();h.requests.shift().resolve(null,false);await settle();assert.equal(h.render().error,true);assert.equal(h.state().brief,view);
});

test('switching spaces isolates cached briefs, errors and responses from the previous space',async()=>{
 const h=harness(),old=h.requests.shift();h.props.spaceId='other';assert.equal(h.render().brief,null);const current=h.requests.shift();
 old.resolve(brief('wrong-space'));await settle();assert.equal(h.render().brief,null);
 current.resolve(brief('other-space'));await settle();assert.equal(h.render().brief.snapshotId,'other-space');
 h.props.refresh='failure';h.render();h.requests.shift().resolve(null,false);await settle();assert.equal(h.render().error,true);
 h.props.spaceId='third';assert.equal(h.render().error,false);assert.equal(h.state().brief,null);
 h.props.enabled=false;h.render();h.requests.shift().resolve(brief('stale-third'));await settle();assert.equal(h.render().brief,null);
});
