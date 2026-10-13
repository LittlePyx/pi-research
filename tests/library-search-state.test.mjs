import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../app/components/use-library-search.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const cells=[],effects=[],timers=new Map(),requests=[];let index=0,nextTimer=0,state;
 const hooks={useState(initial){const i=index++;cells[i]??={value:initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}]},useRef(initial){const i=index++;cells[i]??={current:initial};return cells[i]},useEffect(fn,deps){const i=index++,old=cells[i];if(!old||deps.some((v,n)=>v!==old.deps[n]))effects.push(()=>{old?.cleanup?.();cells[i]={deps,cleanup:fn()}})}};
 const mod={exports:{}};
 new Function('require','exports','setTimeout','clearTimeout',code)(name=>name==='react'?hooks:{workspaceFetch:(url,init)=>new Promise(resolve=>requests.push({url,init,resolve:(data,ok=true)=>resolve({ok,json:async()=>data})}))},mod.exports,(fn)=>{timers.set(++nextTimer,fn);return nextTimer},id=>timers.delete(id));
 const props={spaceId:'s',enabled:true,q:'',filter:'all',stage:'all',inbox:'all',sort:'newest',tag:'all',refresh:'initial'};
 const render=()=>{index=0;state=mod.exports.useLibrarySearch(props);effects.splice(0).forEach(fn=>fn());return state};
 const flush=()=>{for(const [id,fn] of timers){timers.delete(id);fn()}};
 render();return{props,requests,render,flush,state:()=>state};
}
const page=(id,offset=0)=>({papers:[{id}],total:121,offset,nextOffset:offset===120?null:offset+60,counts:{total:121,inbox:0,accepted:0,dismissed:0}});
test('late search responses cannot overwrite a new query, and changing filters resets pagination',async()=>{
 const h=harness();h.flush();const old=h.requests.shift();h.props.q='DOI';h.render();h.flush();const current=h.requests.shift();
 current.resolve(page('match'));await settle();assert.equal(h.render().data.papers[0].id,'match');
 old.resolve(page('obsolete'));await settle();assert.equal(h.render().data.papers[0].id,'match');
 h.state().setOffset(60);h.render();h.flush();assert.match(h.requests[0].url,/offset=60/);h.requests.shift().resolve(page('next',60));await settle();h.render();
 h.props.tag='notes';assert.equal(h.render().offset,0);assert.equal(h.state().data,null);h.flush();assert.match(h.requests.shift().url,/offset=0/);
});
test('opening a paper and returning retains the page, while failed refresh preserves results',async()=>{
 const h=harness();h.flush();h.requests.shift().resolve(page('first'));await settle();h.render();h.state().setOffset(60);h.render();h.flush();h.requests.shift().resolve(page('second',60));await settle();h.render();
 h.props.enabled=false;h.render();assert.equal(h.state().data.offset,60);h.props.enabled=true;h.render();h.flush();assert.match(h.requests[0].url,/offset=60/);h.requests.shift().resolve({},false);await settle();h.render();assert.equal(h.state().error,true);assert.equal(h.state().data.papers[0].id,'second');
 h.state().retry();h.render();h.flush();h.requests.shift().resolve(page('restored',60));await settle();assert.equal(h.render().data.papers[0].id,'restored');assert.equal(h.state().error,false);
});
