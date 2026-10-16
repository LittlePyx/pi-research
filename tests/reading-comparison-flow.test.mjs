import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {readWorkspaceLocation,workspaceHash} from '../lib/workspace-navigation.ts';
const app=readFileSync(new URL('../app/research-app.tsx',import.meta.url),'utf8');
const source=app.slice(app.indexOf('  const compareFromReading='),app.indexOf('  const openWorkbookPaper ='));
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(fetch){
 const origin=workspaceHash({view:'thread-detail',space:'s',id:'r',tab:'problem',libraryPage:3});
 const location={hash:workspaceHash({view:'paper-detail',space:'s',id:'p',track:'r',from:'thread-detail',readingFocus:'Real research question',returnTo:origin})};
 const opened=[],messages=[];const scope={window:{location},readWorkspaceLocation,workspaceHash,activeSpace:{id:'s'},selectedMonitorPaper:{id:'p'},readingComparisonBusy:false,setReadingComparisonBusy:()=>{},fetch,paperNetworkSpaceRef:{current:'s'},workbookPaperFocus:'Real research question',paperReturnView:'thread-detail',openWorkbook:(...args)=>opened.push(args),locale:'en',setToast:m=>messages.push(m)};
 return {run:new Function(...Object.keys(scope),code+';return compareFromReading')(...Object.values(scope)),opened,messages,location,origin};
}
test('internal reading seeds the exact paper and research question, then returns to the original task rather than the paper',async()=>{
 const h=harness(async()=>({ok:true,json:async()=>({workbook:{candidates:[{id:'p',canonicalId:'doi:actual',title:'Exact source'}]}})}));await h.run();
 assert.equal(h.opened.length,1);assert.equal(h.opened[0][0],'r');assert.deepEqual(h.opened[0][1],{spaceId:'s',question:'Real research question',papers:[{canonicalId:'doi:actual',title:'Exact source'}]});assert.deepEqual(h.opened[0][2],{view:'thread-detail',hash:h.origin});
});
test('unavailable evidence is never replaced with another paper',async()=>{
 const h=harness(async()=>({ok:true,json:async()=>({workbook:{candidates:[{id:'other',canonicalId:'doi:other',title:'Other source'}]}})}));await h.run();assert.equal(h.opened.length,0);assert.match(h.messages[0],/not eligible/);
});
test('a late source lookup cannot redirect a reader who already left the task',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>{resolve=r}));const pending=h.run();h.location.hash='#today?space=s';resolve({ok:true,json:async()=>({workbook:{candidates:[{id:'p',canonicalId:'doi:actual',title:'Exact source'}]}})});await pending;assert.equal(h.opened.length,0);
});

test('a cold route-material entry resolves the paper alias and loads its active question without generating content',async()=>{
 const routeSource=app.slice(app.indexOf('  const openRoutePaper ='),app.indexOf('  const openResearchQuestion='));
 const routeCode=ts.transpileModule(routeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const opened=[],requests=[],location={hash:'#thread/r/evidence?space=s'};
 const scope={activeSpace:{id:'s'},window:{location},learningPaperRequestRef:{current:0},historyPapers:[],setToast:()=>{},locale:'en',AbortSignal,
  fetch:async(url,options)=>{requests.push([url,options]);return{ok:true,json:async()=>url.startsWith('/api/monitor')?{monitor:{resolvedPaperId:'actual',historyPapers:[{id:'actual'}]}}:{problemState:{problem:{status:'active',question:'Exact active research question'}}}}},
  paperNetworkSpaceRef:{current:'s'},researchMap:{tracks:[]},selectedThread:{id:'r',titleEn:'Generic route title'},researchProblemTrackRef:{current:''},researchProblemState:undefined,setSelectedThread:()=>{},openMonitorPaper:(...args)=>opened.push(args),showPaperLoadError:()=>assert.fail('Valid alias should open')};
 const run=new Function(...Object.keys(scope),routeCode+';return openRoutePaper')(...Object.values(scope));await run('route-alias');
 assert.deepEqual(opened,[[{id:'actual'},'thread-detail','Exact active research question','r']]);assert.equal(requests.length,2);assert.ok(requests.every(([,options])=>!options.method),'Entry must only read existing question and evidence');
});

test('a refreshed comparison loads its original route before returning, retaining the exact tab and preventing late redirects',async()=>{
 const source=app.slice(app.indexOf('  const returnFromWorkbook='),app.indexOf('  const compareFromReading='));
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const origin=workspaceHash({view:'thread-detail',id:'r',space:'s',tab:'evidence',libraryPage:3});
 const location={hash:workspaceHash({view:'workbook',id:'r',space:'s',from:'thread-detail',workbookId:'w',returnTo:origin})};
 const events=[],messages=[];let resolve;
 const scope={workbookReturnView:'thread-detail',workbookTrackId:'r',activeSpace:{id:'s'},window:{location},readWorkspaceLocation,researchMap:{tracks:[]},
  readResearchMapState:()=>new Promise(r=>{resolve=r}),paperNetworkSpaceRef:{current:'s'},setResearchMap:v=>events.push(['map',v]),setSelectedThread:v=>events.push(['route',v]),navigate:(...args)=>events.push(['navigate',...args]),locale:'en',setToast:v=>messages.push(v)};
 const run=new Function(...Object.keys(scope),compiled+';return returnFromWorkbook')(...Object.values(scope));
 let pending=run();assert.deepEqual(events,[]);resolve({tracks:[{id:'r'}]});await pending;
 assert.deepEqual(events.map(e=>e[0]),['map','route','navigate']);assert.deepEqual(events[2],['navigate','thread-detail','r',{id:'r',tab:'evidence'}]);
 events.length=0;pending=run();location.hash='#today?space=s';resolve({tracks:[{id:'r'}]});await pending;assert.deepEqual(events,[]);
 location.hash=workspaceHash({view:'workbook',id:'r',space:'s',from:'thread-detail',workbookId:'w',returnTo:origin});
 pending=run();resolve({tracks:[]});await pending;assert.deepEqual(events,[]);assert.match(messages[0],/preserved/);
});

test('cold and cross-space route restoration waits for that space to load before announcing a missing route',()=>{
 const start=app.indexOf('    const restore = () => {');
 const source=app.slice(app.indexOf('    let hash =',start),app.indexOf('    setNavigationIssue(null);',start));
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [loaded,loading,expected] of [['',false,[]],['other-space',false,[]],['s',true,[]],['s',false,['missing']]]){
  const issues=[];const scope={window:{location:{hash:'#thread/unknown/start?space=s'}},activeSpace:{id:'s'},restoredLocationRef:{current:''},readWorkspaceLocation,researchMap:{tracks:[]},mapReadSpaceId:loaded,mapLoading:loading,setView:()=>{},setRequestedLocation:()=>{},setNavigationIssue:v=>issues.push(v)};
  new Function(...Object.keys(scope),compiled)(...Object.values(scope));assert.deepEqual(issues,expected);
 }
});
