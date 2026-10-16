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
 new Function('require','exports',code)(name=>name==='../../lib/research-digest.mjs'?require('../lib/research-digest.mjs'):name==='./digest-overview'?{DigestOverview:()=>null}:name==='./task-brief-evidence'?{TaskBriefEvidence:()=>null}:name==='../../lib/task-brief-presentation.mjs'?require('../lib/task-brief-presentation.mjs'):name==='react'?hookReact:name==='./paper-figure'?{PaperFigure:()=>null}:name==='./problem-discovery'?{ProblemDiscovery:()=>null}:name==='./math-text'?{MathText:({children})=>children}:name.endsWith('.css')?{}:name.includes('workspace-request')?{workspaceFetch:()=>{throw Error('Rendering must not fetch')}}:require(name),mod.exports);
 return renderToStaticMarkup(React.createElement(mod.exports.ResearchEntry,{mode,fallbackPapers,spaceId:'test',locale:'en',demo,refreshKey:'',scanStatus:'',blocked:'',resume,excludedReadingIds,onRead:()=>{},onDiscover:()=>{},onRoute:()=>{},onSaved:()=>{},onReadingList:()=>{},onProgress:()=>{},...extra}));
}
const paper=id=>({id,title:id,whyEn:'Saved reason',focusEn:'Saved focus',checkEn:'Saved check'});
const goal={id:'g',trackId:'t',question:'Current question',status:'active',monitoringStatus:'active'};
test('home shows discovered reading even before a research question is supplied',()=>{
 const html=render({goal:null,papers:[]},null,[],false,'home',[paper('Discovered paper')]);
 assert.match(html,/Discovered paper/);assert.match(html,/Add a research question/);assert.match(html,/Read &amp; take notes/);assert.doesNotMatch(html,/<form/);
 const resumed=render({goal:null,papers:[]},{id:'resume',title:'Saved reading',readingNote:'Original note'},[],false,'home');
 assert.equal(resumed.split('Saved reading').length-1,1);assert.match(resumed,/Original note/);
 assert.doesNotMatch(render({goal:null,papers:[]},null,[],false,'home'),/<form/);
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

test('home gives up to six readings equal weight without an oversized lead',()=>{
 const html=render({goal,papers:[paper('First'),paper('Second'),paper('Third'),paper('Fourth'),paper('Fifth')]},null,[],false,'home',[paper('Unrelated')]);
 assert.match(html,/Fifth/);assert.match(html,/pi-digest-grid/);assert.doesNotMatch(html,/pi-reading-poster|Up next|Unrelated|Discovery record/);
 assert.equal(html.split('First').length-1,1);
 const resumed=render({goal,papers:[paper('First'),paper('Second')]},{id:'First',title:'First',readingNote:'User note'},[],false,'home');
 assert.equal(resumed.split('First').length-1,1);assert.match(resumed,/User note/);assert.match(resumed,/Continue reading:/);
});
test('digest includes publication metadata and retains a useful empty edition',()=>{
 const extra={bibliography:[{id:'Paper',venue:'Verified Journal',authors:'Actual Author',publishedAt:'2024-01-01'}]};
 const selected=render({goal,papers:[paper('Paper')]},null,[],false,'home',[],extra);
 assert.match(selected,/Verified Journal · 2024/);assert.match(selected,/Actual Author/);assert.match(selected,/Discovery leads/);
 const empty=render({goal:null,papers:[]},null,[],false,'home',[],extra);
 assert.match(empty,/pi-research-digest/);assert.doesNotMatch(empty,/<form/);assert.match(empty,/No published reading/);
});

test('every home paper explains relevance, a reading action and limits with a task-bound evidence entry',()=>{
 const records=[{paperId:'A',selected:true,title:'A',review:{whyReadEn:'Relevant to the actual question',readingFocusEn:'Check the channel assumptions',contributionEn:'A saved result',limitationsEn:'Abstract does not establish a common scale'}}];
 const taskBrief={snapshotId:'frozen',summary:{briefDate:'2026-10-16'},records,scope:{problemId:'g'},currentStates:[{paperId:'A',recommended:true,readingStatus:'unread',feedback:null}]};
 const html=render({goal,papers:[]},null,[],false,'home',[],{taskBrief});
 assert.match(html,/Why read/);assert.match(html,/Relevant to the actual question/);assert.match(html,/Start with/);assert.match(html,/Check the channel assumptions/);assert.match(html,/A saved result/);assert.match(html,/Abstract does not establish a common scale/);assert.match(html,/View abstract evidence/);
 assert.match(html,/<details class="pi-digest-boundaries"><summary>/);
 const fallback=render({goal:null,papers:[]},null,[],false,'home',[{...paper('Legacy'),whyEn:'',focusEn:''}]);
 assert.match(fallback,/No saved reading rationale/);assert.doesNotMatch(fallback,/View abstract evidence/,'no snapshot means no invented citation');
});

test('without a question the field brief keeps multiple readings and a compact continuation, not an empty form',()=>{
 const html=render({goal:null,papers:[]},{id:'resume',title:'Earlier reading',readingNote:'User note'},[],false,'home',[paper('Field recommendation'),paper('Next field reading')],{fieldDescription:'Finite blocklength coding',homeBrief:React.createElement('p',null,'Empty placeholder')});
 assert.match(html,/YOUR RESEARCH FIELD/);assert.match(html,/Finite blocklength coding/);assert.match(html,/pi-digest-grid/);assert.match(html,/Field recommendation/);assert.match(html,/Next field reading/);assert.match(html,/Continue reading: /);
 assert.doesNotMatch(html,/<form|Empty placeholder/);assert.equal(html.split('Field recommendation').length-1,1);
});
test('question mode never borrows unrelated field recommendations to fill a missing match',()=>{
 const html=render({goal,papers:[]},null,[],false,'home',[paper('Unrelated field paper')]);
 assert.doesNotMatch(html,/Unrelated field paper|FIELD BRIEF/);
});

test('discovery leads retain provenance and status without becoming recommendations',()=>{
 const source={key:'crossref',labelZh:'Crossref',labelEn:'Crossref'};
 const extra={searchPapers:[{id:'candidate',title:'Search candidate',qualityStage:'queued',discoveredAt:'2026-10-01',discoverySources:[source]}, {id:'rejected',title:'Reviewed lead',qualityStage:'reviewed',screeningReason:'Different assumptions',discoverySources:[source]}, {id:'hidden',title:'Hidden feedback',qualityStage:'queued',discoverySources:[source]}]};
 const html=render({goal,papers:[paper('Selected')]},null,['hidden'],false,'home',[],extra);
 assert.match(html,/Search candidate/);assert.match(html,/Awaiting review/);assert.match(html,/Crossref · Found 2026-10-01/);assert.match(html,/Different assumptions/);assert.match(html,/Reviewed · not selected/);assert.doesNotMatch(html,/Hidden feedback/);
 assert.ok(html.indexOf('Search candidate')>html.indexOf('Discovery leads'));
 assert.match(html,/not necessarily new this run or recommended for this question/);
});

test('returning readers can resume before the brief without duplicate titles or notes',()=>{
 const html=render({goal,papers:[paper('Reading now'),paper('Next reading')]},{id:'Reading now',title:'Reading now',readingNote:'Saved note'},[],false,'home');
 assert.ok(html.indexOf('pi-field-resume')<html.indexOf('pi-research-digest'));
 assert.equal(html.split('Reading now').length-1,1);
 assert.equal(html.split('Saved note').length-1,1);
 assert.match(html,/Next reading/);
});

test('unselected leads are closed by default while preserving sources and honest review status',()=>{
 const html=render({goal,papers:[paper('Selected')]},null,[],false,'home',[],{searchPapers:[{id:'candidate',title:'Candidate lead',qualityStage:'queued',discoveredAt:'2026-10-01',discoverySources:[{key:'crossref',labelEn:'Crossref',labelZh:'Crossref'}]}]});
 const summary=html.match(/<details class="pi-digest-leads"([^>]*)><summary>([\s\S]*?)<\/summary>/);
 assert.ok(summary);
 assert.doesNotMatch(summary[1],/\bopen\b/);
 assert.match(summary[2],/Discovery leads/);
 assert.match(summary[2],/1/);
 assert.match(html,/Candidate lead|Awaiting review/);
});

test('an empty home offers a concrete next action and waiting never starts another scan',()=>{
 const fresh=render({goal:null,papers:[]},null,[],false,'home');
 assert.match(fresh,/pi-home-next-action/);
 assert.match(fresh,/Define a research question/);
 const saved=render({goal,papers:[]},null,[],false,'home');
 assert.match(saved,/Find related papers/);
 const waiting=render({goal,papers:[]},null,[],false,'home',[],{scanStatus:'Reviewing candidates',blocked:'Scan already running'});
 assert.match(waiting,/View progress &amp; recovery/);
 assert.doesNotMatch(waiting,/>Find related papers</);
 const loading=render(null,null,[],false,'home');
 assert.doesNotMatch(loading,/pi-home-next-action/);
});
