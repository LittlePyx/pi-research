import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../app/components/research-entry.tsx',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
function render(result,resume,excludedReadingIds=[],demo=true,mode="reading",fallbackPapers=[],extra={}){
 let stateIndex=0;
 const mod={exports:{}};
 const hookReact={...React,useState:initial=>[stateIndex++===0?result:initial,()=>{}],useEffect:()=>{},useRef:value=>({current:value})};
 new Function('require','exports',code)(name=>name==='react'?hookReact:name==='./paper-figure'?{PaperFigure:()=>null}:name==='./problem-discovery'?{ProblemDiscovery:()=>null}:name==='./math-text'?{MathText:({children})=>children}:name.endsWith('.css')?{}:name.includes('workspace-request')?{workspaceFetch:()=>{throw Error('Rendering must not fetch')}}:require(name),mod.exports);
 return renderToStaticMarkup(React.createElement(mod.exports.ResearchEntry,{...extra,mode,fallbackPapers,spaceId:'test',locale:'en',demo,refreshKey:'',scanStatus:'',blocked:'',resume,excludedReadingIds,onRead:()=>{},onDiscover:()=>{},onRoute:()=>{},onSaved:()=>{},onReadingList:()=>{},onProgress:()=>{}}));
}
const paper=id=>({id,title:id,whyEn:'Saved reason',focusEn:'Saved focus',checkEn:'Saved check'});
const goal={id:'g',trackId:'t',question:'Current question',status:'active',monitoringStatus:'active'};
test('home shows discovered reading even before a research question is supplied',()=>{
 const html=render({goal:null,papers:[]},null,[],false,'home',[paper('Discovered paper')]);
 assert.match(html,/Discovered paper/);assert.match(html,/Add a research question/);assert.match(html,/Start reading/);assert.doesNotMatch(html,/<form/);
 const resumed=render({goal:null,papers:[]},{id:'resume',title:'Saved reading',readingNote:'Original note'},[],false,'home');
 assert.equal(resumed.split('Saved reading').length-1,1);assert.match(resumed,/Original note/);
 assert.match(render({goal:null,papers:[]},null,[],false,'home'),/<form/);
});
test('Saved feedback removes stale question cards immediately while replacement readings load',()=>{
 const result={goal,papers:[paper('Ignored paper'),paper('Deferred paper'),paper('Available paper')]};
 const html=render(result,null,['Ignored paper','Deferred paper']);
 assert.doesNotMatch(html,/Ignored paper|Deferred paper/);
 assert.match(html,/Available paper/);assert.match(html,/Saved focus/);
 const empty=render(result,null,result.papers.map(p=>p.id));
 assert.match(empty,/No further preset papers/);
 assert.doesNotMatch(empty,/Continue your current reading|Available paper/);
 assert.match(render(result,null,[]),/Ignored paper/,'withdrawn feedback can restore the card');
});
test('An in-progress paper appears once in the shared research panel; queued reading stays accessible',()=>{
 const html=render({goal,papers:[paper('In-progress paper'),paper('Next paper')]},{id:'In-progress paper',title:'In-progress paper',readingNote:'Original note'});
 assert.equal(html.split('In-progress paper').length-1,1);
 assert.match(html,/Original note/);assert.match(html,/Continue reading &amp; notes/);
 assert.match(html,/Next paper/);assert.match(html,/Up next/);
 assert.doesNotMatch(html,/Saved focus|Saved check/);
});
test('Without a resume, the first recommendation retains full guidance and later entries are concise',()=>{
 const html=render({goal,papers:[paper('First paper'),paper('Second paper')]},null);
 assert.equal(html.split('Saved focus').length-1,1);
 assert.equal(html.split('Saved check').length-1,1);
 assert.match(html,/Second paper/);
 const loading=render(null,{id:'resume',title:'Preserved reading',readingNote:'Preserved note'});
 assert.match(loading,/Loading your question/);assert.match(loading,/Preserved note/);
});

test('Live linked readings replace the waiting receipt without claiming new search adoption',()=>{
 const html=render({goal,papers:[paper('Matched paper')]},null,[],false);
 assert.match(html,/Related readings are available/);
 assert.doesNotMatch(html,/have not been recalculated|new search completed/);
 const inactive=render({goal:{...goal,status:'paused'},papers:[paper('Matched paper')]},null,[],false);
 assert.match(inactive,/paused or resolved/);
 assert.doesNotMatch(inactive,/Related readings are available/);
});

test('home has one lead and at most three deduplicated next papers without review or scan detail',()=>{
 const html=render({goal,papers:[paper('First'),paper('Second'),paper('Third'),paper('Fourth'),paper('Fifth')]},null,[],false,'home',[paper('First'),paper('Extra')]);
 assert.match(html,/Start reading/);assert.match(html,/Up next/);assert.doesNotMatch(html,/Saved focus|Saved check|Fifth|Extra|Discovery record/);
 assert.equal(html.split('First').length-1,1);
 const resume=render({goal,papers:[paper('First'),paper('Second')]},{id:'First',title:'First',readingNote:'User note'},[],false,'home');
 assert.equal(resume.split('First').length-1,1);assert.match(resume,/User note/);assert.doesNotMatch(resume,/START HERE/);
});

 test('home brief remains visible with and without selected reading, ahead of the empty form',()=>{
 const extra={homeBrief:React.createElement('section',null,'Persistent discovery brief'),bibliography:[{id:'Cover paper',venue:'Verified Journal',authors:'Actual Author',publishedAt:'2024-01-01'}]};
 const selected=render({goal,papers:[paper('Cover paper'),paper('Next paper')]},null,[],false,'home',[],extra);
 assert.equal(selected.split('Persistent discovery brief').length-1,1);
 assert.ok(selected.indexOf('Cover paper')<selected.indexOf('Persistent discovery brief'));
 assert.ok(selected.indexOf('Persistent discovery brief')<selected.indexOf('Up next'));
 assert.match(selected,/Verified Journal · 2024/);assert.match(selected,/Actual Author/);
 const empty=render({goal:null,papers:[]},null,[],false,'home',[],extra);
 assert.ok(empty.indexOf('Persistent discovery brief')<empty.indexOf('<form'));
 assert.doesNotMatch(render({goal,papers:[]},null,[],false,'reading',[],extra),/Persistent discovery brief/);
 });
