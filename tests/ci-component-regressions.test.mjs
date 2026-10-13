import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

const require=createRequire(import.meta.url),settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(file,name,props){
 const cells=[],pending=[],requests=[],timers=new Map(),elements=new Map();let index=0,tree,dirty=false,clock=100000,timerId=0;
 const same=(a,b)=>a&&a.length===b.length&&b.every((v,i)=>Object.is(v,a[i]));
 const hooks={
  useState(initial){const i=index++;cells[i]??={value:typeof initial==='function'?initial():initial};return[cells[i].value,value=>{const next=typeof value==='function'?value(cells[i].value):value;if(!Object.is(next,cells[i].value)){cells[i].value=next;dirty=true}}]},
  useRef(initial){const i=index++;cells[i]??={current:initial};return cells[i]},
  useCallback(fn,deps){const i=index++;if(!same(cells[i]?.deps,deps))cells[i]={deps,value:fn};return cells[i].value},
  useEffect(fn,deps){const i=index++,old=cells[i];if(!same(old?.deps,deps)){cells[i]={deps,cleanup:old?.cleanup};pending.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn()})}}
 };
 const timer=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:clock+ms});return id};
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 new Function('require','exports','Date','setTimeout','clearTimeout',code)(module=>module==='react'?hooks:module.includes('workspace-request')?{workspaceFetch:(url,init={})=>new Promise((resolve,reject)=>requests.push({url,init,reject,resolve:(data,ok=true)=>resolve({ok,json:async()=>data})}))}:require(module),mod.exports,class extends Date{static now(){return clock}},timer,id=>timers.delete(id));
 const nodes=()=>{const found=[],visit=node=>{if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){found.push(node);visit(node.props?.children)}};visit(tree);return found};
 const render=()=>{let passes=0;do{
  if(++passes>20)throw Error('Unstable render');dirty=false;index=0;tree=mod.exports[name](props);
  for(const node of nodes())if(node.props?.ref){const ref=node.props.ref;if(!elements.has(ref)){const listeners=new Map();elements.set(ref,{open:false,focusCount:0,showModal(){this.open=true},close(){this.open=false},focus(){this.focusCount++},addEventListener(type,fn){listeners.set(type,fn)},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type)},listeners})}ref.current=elements.get(ref)}
  for(const run of pending.splice(0))run();
 }while(dirty);return tree};
 render();return{props,requests,render,nodes,text:()=>JSON.stringify(tree),advance(ms){clock+=ms;for(const[id,value]of [...timers])if(value.at<=clock){timers.delete(id);value.fn()}if(dirty)render()},unmount(){for(const cell of cells)cell?.cleanup?.()}};
}

test('review cooldown expires without a render-time clock or automatic model call and uses the latest callback',async()=>{
 const old=[],latest=[];let updates=0;
 const h=harness('app/components/paper-review-refresh.tsx','PaperReviewRefresh',{spaceId:'s',paperId:'p',locale:'en',onReady:value=>old.push(value),onUpdated:async()=>{updates++}});
 const initial=h.requests.shift();h.props.onReady=value=>latest.push(value);h.render();
 initial.resolve({eligible:true,status:'pending',retryAt:101000});await settle();h.render();
 assert.equal(h.nodes().find(n=>n.type==='button').props.disabled,true);
 h.advance(1002);const button=h.nodes().find(n=>n.type==='button');assert.equal(Boolean(button.props.disabled),false);assert.equal(h.requests.length,0,'cooldown expiry does not request an assessment');
 button.props.onClick();h.render();const request=h.requests.shift();assert.equal(request.init.method,'POST');request.resolve({eligible:true,status:'ready',retryAt:0});await settle();h.render();
 assert.equal(updates,1);assert.deepEqual(old,[]);assert.deepEqual(latest,[false,true]);assert.match(h.text(),/Review checked/);h.unmount();
});

test('review attempt limit still disables manual assessment after cooldown',async()=>{
 const h=harness('app/components/paper-review-refresh.tsx','PaperReviewRefresh',{spaceId:'s',paperId:'p',locale:'zh',onReady:()=>{},onUpdated:async()=>{}});
 h.requests.shift().resolve({eligible:true,status:'pending',retryAt:0,attempts:4});await settle();h.render();
 assert.equal(h.nodes().find(n=>n.type==='button').props.disabled,true);assert.match(h.text(),/重试上限/);assert.equal(h.requests.length,0);h.unmount();
});

test('expanded discovery records show loading, timeout releases refresh, and failed refresh preserves saved results',async()=>{
 const h=harness('app/components/problem-discovery.tsx','ProblemDiscovery',{spaceId:'s',problemId:'q',locale:'en',onRead:()=>{},expanded:true});
 assert.match(h.text(),/Loading/);const request=h.requests.shift();h.advance(20001);assert.equal(request.init.signal.aborted,true);request.reject(new DOMException('Timed out','AbortError'));await settle();h.render();
 assert.match(h.text(),/Could not load/);let button=h.nodes().find(n=>n.type==='button');assert.equal(button.props.disabled,false);
 button.props.onClick();h.requests.shift().resolve({job:null,branches:[],papers:[]});await settle();h.render();assert.match(h.text(),/no separate query record/);
 button=h.nodes().find(n=>n.type==='button');button.props.onClick();h.requests.shift().reject(Error('offline'));await settle();h.render();
 assert.match(h.text(),/no separate query record/);assert.match(h.text(),/Could not load/);h.unmount();
});

test('changing discovery identity aborts its old request and ignores a late response',async()=>{
 const h=harness('app/components/problem-discovery.tsx','ProblemDiscovery',{spaceId:'s',problemId:'old',locale:'en',onRead:()=>{},expanded:true}),old=h.requests.shift();
 h.props.problemId='new';h.render();assert.equal(old.init.signal.aborted,true);
 old.resolve({job:{status:'done'},queries:{days:'Old query',months:'Old query',years:'Old query'},branches:[],papers:[]});await settle();h.render();assert.doesNotMatch(h.text(),/Old query/);
 const current=h.requests.shift();assert.match(current.url,/problemId=new/);current.resolve({job:null,branches:[],papers:[]});await settle();h.render();assert.match(h.text(),/no separate query record/);h.unmount();
});

test('first-figure modal keeps native dialog semantics, focuses close on opening, and cleans up backdrop dismissal',async()=>{
 const h=harness('app/components/paper-figure.tsx','PaperFigure',{spaceId:'s',paperId:'p',locale:'en',demo:false});
 h.requests.shift().resolve({figure:{url:'https://example.test/figure.png',caption:'Figure 1: Test only',sourceUrl:'https://example.test/paper'}});await settle();h.render();
 const dialog=h.nodes().find(n=>n.type==='dialog'),buttons=h.nodes().filter(n=>n.type==='button'),element=dialog.props.ref.current;
 assert.equal(dialog.props['aria-label'],'First figure');assert.equal(dialog.props.onClick,undefined);assert.equal(buttons[1].props.autoFocus,undefined);
 buttons[0].props.onClick();assert.equal(element.open,true);assert.equal(buttons[1].props.ref.current.focusCount,1);
 element.listeners.get('click')({target:{}});assert.equal(element.open,true);element.listeners.get('click')({target:element});assert.equal(element.open,false);
 buttons[0].props.onClick();buttons[1].props.onClick();assert.equal(element.open,false);h.unmount();assert.equal(element.listeners.size,0);
});
