import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {build} from 'esbuild';
const require=createRequire(import.meta.url),settle=()=>new Promise(resolve=>setImmediate(resolve));
async function module(path){const result=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)}
const integrity=await module('lib/abstract-integrity.ts'),presentation=await module('lib/abstract-recovery-presentation.ts');
function harness(){
 const cells=[],pending=[],requests=[],timers=new Map();let index=0,tree,dirty=false,clock=100000,timerId=0;
 const props={spaceId:'s',paperId:'p',locale:'zh',stage:'awaiting_evidence',reason:''};
 const hooks={useState(initial){const i=index++;cells[i]??={value:typeof initial==='function'?initial():initial};return[cells[i].value,value=>{const next=typeof value==='function'?value(cells[i].value):value;if(!Object.is(cells[i].value,next)){cells[i].value=next;dirty=true}}]},useEffect(fn,deps){const i=index++,old=cells[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j]))){cells[i]={deps,cleanup:old?.cleanup};pending.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn()})}}};
 const code=ts.transpileModule(readFileSync('app/components/paper-reading-content.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 const timer=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:clock+ms});return id};
 new Function('require','exports','Date','setTimeout','clearTimeout',code)(name=>name==='react'?hooks:name.includes('abstract-integrity')?integrity:name.includes('abstract-recovery-presentation')?presentation:name.includes('workspace-request')?{workspaceFetch:(url,init={})=>new Promise(resolve=>requests.push({url,init,resolve:(data,ok=true)=>resolve({ok,json:async()=>data})}))}:name.includes('paper-review-refresh')?{PaperReviewRefresh:()=>null}:name.includes('math-text')?{MathText:()=>null}:name.endsWith('.css')?{}:require(name),mod.exports,class extends Date{static now(){return clock}},timer,id=>timers.delete(id));
 const render=()=>{let passes=0;do{if(++passes>20)throw Error('Unstable render');dirty=false;index=0;tree=mod.exports.PaperReadingContent(props);for(const run of pending.splice(0))run()}while(dirty);return tree};
 const nodes=()=>{const found=[],visit=node=>{if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){found.push(node);visit(node.props?.children)}};visit(tree);return found};
 render();return{props,requests,render,nodes,text:()=>JSON.stringify(tree),advance(ms){clock+=ms;for(const[id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn()}render()}};
}
const placeholder='This classic paper describes an information measure. '.repeat(10)+'The abstract is missing, so specific results cannot be verified.';
test('missing source evidence is separate from the legacy description and retry enables only after cooldown',async()=>{
 const h=harness();h.requests.shift().resolve({paper:{abstractText:placeholder},recovery:{status:'source_error',source_url:'',retry_at:101000,attempted_json:JSON.stringify([{source:'crossref',outcome:'not_found'},{source:'arxiv',outcome:'timeout'}])}});await settle();h.render();
 assert.equal(h.requests.length,0);assert.equal(h.nodes().find(n=>n.type==='h2').props.children,'论文摘要');assert.ok(h.nodes().some(n=>n.type==='details'&&n.props.className==='pi-paper-saved-description'));assert.match(h.text(),/尚未获取原始摘要/);assert.match(h.text(),/arXiv：请求超时/);assert.doesNotMatch(h.text(),/摘要已补到/);
 let retry=h.nodes().find(n=>n.type==='button');assert.equal(retry.props.disabled,true);
 h.advance(1051);retry=h.nodes().find(n=>n.type==='button');assert.equal(retry.props.disabled,false);assert.equal(retry.props.children,'重试读取');assert.equal(h.requests.length,0,'time passing does not launch new source calls');
 retry.props.onClick();h.render();h.requests.shift().resolve({},false);await settle();h.render();assert.match(h.text(),/The abstract is missing/);assert.match(h.text(),/读取失败/);assert.equal(h.nodes().find(n=>n.type==='button').props.disabled,false);
});
test('a complete short source abstract is readable without another enrichment request',async()=>{
 const h=harness(),abstract='An exact source abstract for an isolated test only. '.repeat(4);h.requests.shift().resolve({paper:{abstractText:abstract},recovery:{status:'found',source_url:'https://example.org/abstract',retry_at:0}});await settle();h.render();
 assert.equal(h.nodes().find(n=>n.type==='h2').props.children,'论文摘要');assert.equal(h.nodes().some(n=>n.type==='details'),false);assert.equal(h.nodes().some(n=>n.type==='button'),false);assert.equal(h.requests.length,0);
});
test('changing the paper clears previous evidence and ignores an older pending response',async()=>{
 const h=harness(),old=h.requests.shift();h.props.paperId='different';h.render();old.resolve({paper:{abstractText:placeholder}});await settle();h.render();assert.doesNotMatch(h.text(),/This classic paper/);
 h.requests.shift().resolve({paper:{abstractText:'Current verified source text. '.repeat(20)}});await settle();h.render();assert.match(h.text(),/Current verified source text/);assert.doesNotMatch(h.text(),/This classic paper/);
});
test('source diagnostics distinguish unavailable, absent and legacy outcomes without displaying arbitrary source labels',()=>{
 const value=JSON.stringify([{source:'crossref',outcome:'source_error'},{source:'crossref',outcome:'not_found'},{source:'openalex',outcome:'not_found'},'arxiv',{source:'constructor',outcome:'unknown'},{source:'<script>',outcome:'not_found'}]);
 assert.equal(presentation.abstractRecoverySummary(value,'zh'),'Crossref：暂不可访问 · OpenAlex：未返回匹配摘要 · arXiv：结果未记录');assert.equal(presentation.abstractRecoverySummary('invalid','en'),'');
});
