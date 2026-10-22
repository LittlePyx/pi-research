import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {readWorkspaceLocation,workspaceHash} from '../lib/workspace-navigation.ts';

const source=readFileSync(new URL('../app/research-app.tsx',import.meta.url),'utf8');
const navigation=source.slice(source.indexOf('  const navigate = ('),source.indexOf('  const navigatePrimary ='));
const code=ts.transpileModule(navigation,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(hash,overrides={}){
 const scrolls=[],frames=[];
 const browser={location:{hash},scrollY:320,history:{pushState(_state,_title,next){browser.location.hash=next}}};
 const state={view:readWorkspaceLocation(hash).view,workbookTrackId:'r',activeSpace:{id:'s'},selectedThread:{id:'r'},selectedMonitorPaper:{id:'p'},
  graphReturnView:'threads',todaySurface:'home',researchRouteTab:'start',researchMapMode:'directions',libraryGraphPaperId:'',
  paperNetworkMode:'similarity',graphSurface:'library',paperNetworkScope:'all',paperNetworkTrackId:'all',selectedNetworkPaperId:null,
  libraryComparisonTrackId:readWorkspaceLocation(hash).track||'',librarySearch:'',libraryViewState:{query:'',scope:'related',page:1,focusId:''},libraryPageNumber:1,libraryFilter:'all',libraryStageFilter:'all',inboxFilter:'all',librarySort:'priority',libraryTag:'all',
  workbookReturnView:'threads',workbookViewState:{panel:'evidence',focus:''},learningBrowseSelection:null,
  navigationScroll:{current:new Map()},workbookScrollRef:{current:0},restoredLocationRef:{current:''},
  rememberCurrentLocation(){},setPaperPanel(){},setNavigationIssue(){},setTodaySurface(value){state.todaySurface=value},setRecoveryFocusRequested(){},setView(value){state.view=value},setMobileNav(){},...overrides};
 browser.scrollTo=options=>scrolls.push(options.top);
 const navigate=new Function('state','window','requestAnimationFrame','readWorkspaceLocation','workspaceHash',`with(state){${code};return navigate;}`)(state,browser,fn=>frames.push(fn),readWorkspaceLocation,workspaceHash);
 return{navigate,state,browser,scrolls,flush(){while(frames.length)frames.shift()()}};
}

test('the real navigation handler restores the filtered library URL and scroll after a refreshed paper',()=>{
 const original=workspaceHash({view:'library',space:'s',libraryQuery:'Gaussian',libraryPage:3,libraryFilter:'accepted',libraryTag:'notes'});
 const opening=harness(original,{librarySearch:'Gaussian',libraryPageNumber:3,libraryFilter:'accepted',libraryTag:'notes'});
 opening.navigate('paper-detail',undefined,{id:'p',from:'library'});
 assert.equal(readWorkspaceLocation(opening.browser.location.hash).returnTo,original);
 const refreshed=harness(opening.browser.location.hash);
 refreshed.state.navigationScroll.current.set(original,320);
 refreshed.navigate('library');refreshed.flush();
 assert.equal(refreshed.browser.location.hash,original);
 assert.equal(refreshed.scrolls.at(-1),320);
 assert.equal(refreshed.state.restoredLocationRef.current,'');
});

test('paper reading returns to the exact comparison cell, then to its original graph task',()=>{
 const graph=workspaceHash({view:'threads',space:'s',graph:'all',graphSurface:'routes',graphMode:'citations',graphFocus:'p'});
 const opening=harness(graph,{researchMapMode:'papers',graphSurface:'routes',paperNetworkMode:'citations',selectedNetworkPaperId:'p'});
 opening.navigate('workbook','r',{from:'threads'});
 const workbook=harness(opening.browser.location.hash,{workbookViewState:{panel:'relations',focus:'assumptions:p'}});
 // The comparison UI updates its selected cell in the URL before opening a source.
 workbook.browser.location.hash=workspaceHash({...readWorkspaceLocation(workbook.browser.location.hash),workbookPanel:'relations',workbookFocus:'assumptions:p'});
 const comparison=workbook.browser.location.hash;
 workbook.navigate('paper-detail','r',{id:'p',from:'workbook'});
 const paper=harness(workbook.browser.location.hash);
 paper.navigate('workbook');
 assert.equal(paper.browser.location.hash,comparison);
 const returned=harness(paper.browser.location.hash);
 returned.navigate('threads');
 assert.equal(returned.browser.location.hash,graph);
});

test('an explicit main Today action opens the home panel instead of restoring All reading',()=>{
 const origin=workspaceHash({view:'today',space:'s',panel:'reading'});
 const paper=harness(workspaceHash({view:'paper-detail',id:'p',space:'s',from:'today',returnTo:origin}));
 paper.navigate('today',undefined,{panel:'home'});
 assert.equal(readWorkspaceLocation(paper.browser.location.hash).panel,'home');
 assert.equal(readWorkspaceLocation(paper.browser.location.hash).returnTo,undefined);
});

test('leaving a comparison for Today remembers the precise location without replacing it with the home page',()=>{
 const comparison=workspaceHash({view:'workbook',space:'s',id:'r',workbookId:'v1',workbookPanel:'task',workbookFocus:'cell:p'});
 const remembered=[];
 const current=harness(comparison,{rememberCurrentLocation(hash){remembered.push(hash||current.browser.location.hash)}});
 current.navigate('today',undefined,{panel:'home'});
 assert.equal(remembered[0],comparison);assert.equal(readWorkspaceLocation(remembered[1]).view,'today');
});

test('restoring the already mounted comparison keeps unsaved inputs; cold or different versions load the pinned record',()=>{
 const start=source.indexOf('    const comparisonLocation =');
 const end=source.indexOf('    if (location.view === "workbook")',start);
 const restore=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const location=readWorkspaceLocation(workspaceHash({view:'workbook',space:'s',id:'r',workbookId:'v1'}));
 for(const loaded of ['s:r:v1','s:r:v2','other:r:v1','']){
  const versions=[],tasks=[];
  new Function('location','activeSpace','loadedWorkbookRef','setWorkbookVersionId','setWorkbookTask','readWorkspaceLocation',restore)(location,{id:'s'},{current:loaded},v=>versions.push(v),v=>tasks.push(v),readWorkspaceLocation);
  assert.deepEqual(versions,loaded==='s:r:v1'?[]:['v1']);assert.equal(tasks.length,loaded==='s:r:v1'?0:1);
 }
});
test('refreshing a paper opened from comparison practice restores the pinned practice context',()=>{
 const start=source.indexOf("    if (location.view === 'learn') setComparisonPractice");
 const end=source.indexOf('    if (!location.space)',start);
 const restore=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const workbook=workspaceHash({view:'workbook',id:'r',space:'s',workbookId:'v1',from:'threads'});
 const practice=workspaceHash({view:'learn',space:'s',track:'r',workbookId:'v1',practiceId:'task-1',from:'workbook',returnTo:workbook});
 const location=readWorkspaceLocation(workspaceHash({view:'paper-detail',id:'p',space:'s',from:'learn',readingFocus:'Check the original assumptions',returnTo:practice}));
 let restored=null;
 const apply=(value,space='s')=>new Function('location','activeSpace','setComparisonPractice','readWorkspaceLocation',restore)(value,{id:space},value=>restored=value,readWorkspaceLocation);
 apply(location);assert.equal(restored.workbookId,'v1');assert.equal(restored.practiceId,'task-1');assert.equal(restored.returnTo,workbook);assert.equal(location.readingFocus,'Check the original assumptions');
 apply(location,'other');assert.equal(restored,null);
 apply(readWorkspaceLocation(workspaceHash({view:'paper-detail',id:'p',space:'s',from:'learn',returnTo:'#learn?space=s'})));assert.equal(restored,null,'ordinary paper reading must not mount comparison practice');
});
