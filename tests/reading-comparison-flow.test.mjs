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
