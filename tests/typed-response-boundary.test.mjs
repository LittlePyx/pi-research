import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

const require=createRequire(import.meta.url),settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(file,name,props){
 const cells=[],effects=[],requests=[];let index=0,dirty=false,tree;
 const hooks={useState(initial){const i=index++;cells[i]??={value:typeof initial==='function'?initial():initial};return[cells[i].value,value=>{const next=typeof value==='function'?value(cells[i].value):value;if(!Object.is(next,cells[i].value)){cells[i].value=next;dirty=true}}]},useRef(initial){const i=index++;cells[i]??={current:initial};return cells[i]},useId(){return 'test-panel'},useEffect(fn,deps){const i=index++,old=cells[i];if(!old||deps.some((value,n)=>!Object.is(value,old.deps[n]))){cells[i]={deps,cleanup:old?.cleanup};effects.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn()})}}};
 const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const componentModule={exports:{}};
 const loadCalendar=()=>{const mod={exports:{}};new Function('exports',compile('lib/reading-calendar.ts'))(mod.exports);return mod.exports};
 new Function('require','exports',compile(file))(id=>id==='react'?hooks:id.includes('workspace-request')?{workspaceFetch:(url,init={})=>new Promise(resolve=>requests.push({url,init,resolve:(data,status=200)=>resolve({ok:status<400,status,json:async()=>data})}))}:id.endsWith('.css')?{}:id==='./math-text'?{MathText:({children})=>children}:id==='../../lib/reading-calendar'?loadCalendar():require(id),componentModule.exports);
 const render=()=>{let passes=0;do{if(++passes>20)throw Error('Unstable render');index=0;dirty=false;tree=componentModule.exports[name](props);for(const effect of effects.splice(0))effect()}while(dirty);return tree};
 const nodes=()=>{const found=[],visit=node=>{if(Array.isArray(node))node.forEach(visit);else if(node&&typeof node==='object'){found.push(node);visit(node.props?.children)}};visit(tree);return found};
 render();return{props,requests,render,nodes,text:()=>JSON.stringify(tree),unmount(){for(const cell of cells)cell?.cleanup?.()}};
}
const suggestion={id:'paper-one',canonicalId:'canonical-one',title:'Source paper',revision:'saved-revision',problemZh:'问题',problemEn:'Saved research question',reasonZh:'理由',reasonEn:'Source evidence',taskZh:'先读',taskEn:'Read the theorem',limitationZh:'局限',limitationEn:'Check assumptions',abstractText:'Saved abstract',updatedAt:'2026-10-14'};
const receipt={track:{id:'track-one',titleZh:'研究目标',titleEn:'Research goal'},task:{spaceId:'owned',question:'Saved research question',papers:[{canonicalId:'canonical-one',title:'Source paper'}],readingTask:{paperId:'paper-one',focusZh:'先读',focusEn:'Read the theorem'}}};
async function startWithSuggestion(onStart){
 const h=harness('app/components/research-start.tsx','ResearchStart',{spaceId:'owned',locale:'en',onRead:()=>{},onStart});
 h.nodes().find(n=>n.props?.className==='pi-start-entry').props.onClick();h.render();h.requests.shift().resolve({suggestions:[suggestion]});await settle();h.render();
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Choose and refine goal →').props.onClick();h.render();return h;
}

test('malformed first-figure data is never rendered as an image or modal',async()=>{
 for(const figure of [{url:12,caption:'Figure',sourceUrl:'https://example.test/paper'},{url:'https://example.test/figure',caption:{text:'wrong'},sourceUrl:'https://example.test/paper'}]){
  const h=harness('app/components/paper-figure.tsx','PaperFigure',{spaceId:'owned',paperId:'paper-one',demo:false,locale:'en'});
  h.requests.shift().resolve({figure});await settle();h.render();assert.equal(h.nodes().length,0);h.unmount();
 }
});

test('invalid calendar rows end loading with a retryable error instead of a false empty date',async()=>{
 const h=harness('app/components/reading-calendar.tsx','ReadingCalendar',{spaceId:'owned',locale:'en',onPaper:()=>{}});await settle();h.render();
 h.nodes().find(n=>n.props?.className==='pi-calendar-toggle').props.onClick();h.render();
 h.requests.shift().resolve({counts:[{day:'2026-10-14',kind:'invented-kind',count:4}],papers:[],hasMore:false});await settle();h.render();
 assert.match(h.text(),/Records could not be loaded/);assert.doesNotMatch(h.text(),/No records of this type/);
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Retry').props.onClick();h.render();h.requests.shift().resolve({counts:[],papers:[{id:'p',title:'Saved calendar paper',authors:'Author',venue:'Venue'}],hasMore:false});await settle();h.render();
 assert.match(h.text(),/Saved calendar paper/);assert.doesNotMatch(h.text(),/Records could not be loaded/);h.unmount();
});

test('malformed research suggestions show a load error without offering an invalid goal',async()=>{
 const h=harness('app/components/research-start.tsx','ResearchStart',{spaceId:'owned',locale:'en',onRead:()=>{},onStart:()=>{throw Error('Unexpected confirmation')}});
 h.nodes().find(n=>n.props?.className==='pi-start-entry').props.onClick();h.render();h.requests.shift().resolve({suggestions:[{...suggestion,revision:null}]});await settle();h.render();
 assert.match(h.text(),/Suggestions could not load/);assert.doesNotMatch(h.text(),/Source paper|starting points will appear/);h.unmount();
});

test('invalid or cross-workspace confirmation never activates a route and leaves the editable target intact',async()=>{
 for(const body of [{track:{id:'wrong'},task:receipt.task},{...receipt,task:{...receipt.task,spaceId:'foreign'}},{...receipt,task:{...receipt.task,papers:[null]}}]){
  const opened=[],h=await startWithSuggestion((...args)=>opened.push(args));
  h.nodes().find(n=>n.type==='button'&&n.props.children==='Confirm goal & plan learning').props.onClick();h.requests.shift().resolve(body);await settle();h.render();
  assert.deepEqual(opened,[]);assert.match(h.text(),/Could not save this goal/);assert.equal(h.nodes().find(n=>n.type==='textarea').props.value,suggestion.problemEn);h.unmount();
 }
});

test('validated confirmation retains the exact space, source paper and reading task',async()=>{
 const opened=[],h=await startWithSuggestion((...args)=>opened.push(args));
 h.nodes().find(n=>n.type==='button'&&n.props.children==='Confirm goal & plan learning').props.onClick();h.requests.shift().resolve(receipt);await settle();h.render();
 assert.deepEqual(opened,[[receipt.track,receipt.task]]);assert.equal(h.requests.length,0);h.unmount();
});
