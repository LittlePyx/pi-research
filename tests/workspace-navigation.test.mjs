import assert from 'node:assert/strict';
import test from 'node:test';
import { focusWorkspaceSection } from '../lib/workspace-section-navigation.ts';
import { readWorkspaceLocation, workspaceHash } from '../lib/workspace-navigation.ts';

test('workspace links preserve paper identity, route subpage, scope and return destination', () => {
  const location = {view:'paper-detail', id:'paper-1', space:'space-1', from:'thread-detail', track:'route-2', tab:'evidence'};
  assert.deepEqual(readWorkspaceLocation(workspaceHash(location)), {...location, graph:undefined, step:undefined, path:undefined});
  assert.equal(readWorkspaceLocation('#thread/route-2/agenda').tab, 'agenda');
  assert.equal(readWorkspaceLocation('#workbook/route-2?from=learn').from, 'learn');
  assert.equal(readWorkspaceLocation('#threads?graph=paper-1').graph, 'paper-1');
});

test('recovery and library graph origins survive only on their valid routes', () => {
  const recovery = {view:'today', space:'space-1', panel:'discovery', focus:'recovery'};
  assert.deepEqual(readWorkspaceLocation(workspaceHash(recovery)), {...recovery, id:undefined, tab:'start', from:undefined, track:undefined, graph:undefined, step:undefined, path:undefined});
  const graph = {view:'threads', space:'space-1', graph:'paper-1', graphFrom:'library'};
  assert.deepEqual(readWorkspaceLocation(workspaceHash(graph)), {...graph, id:undefined, tab:'start', from:undefined, track:undefined, step:undefined, path:undefined});
  assert.equal(readWorkspaceLocation('#today?panel=home&focus=recovery').focus, undefined);
  assert.equal(readWorkspaceLocation('#threads?graph=paper-1&graphFrom=unknown').graphFrom, undefined);
  assert.equal(readWorkspaceLocation('#library?graph=paper-1&graphFrom=library').graphFrom, undefined);
});

test('invalid detail identities and unknown destinations fail closed', () => {
  for (const hash of ['#paper', '#thread/../../bad', '#workbook/%3Cscript%3E', '#unknown']) {
    assert.deepEqual(readWorkspaceLocation(hash), {view:'today'});
  }
  const location = readWorkspaceLocation('#thread/route-2/invented?from=paper-detail&space=%3Cscript%3E');
  assert.equal(location.tab, 'start'); assert.equal(location.from, undefined); assert.equal(location.space, undefined);
});

test('section navigation reveals nested notes, focuses content and respects reduced motion', () => {
  const previous = { document: globalThis.document, window: globalThis.window, HTMLDetailsElement: globalThis.HTMLDetailsElement };
  try {
    class Details { open = false; parentElement = null; }
    globalThis.HTMLDetailsElement = Details;
    const outer = new Details(), inner = new Details(); inner.parentElement = outer;
    let focused, scrolled;
    const note = { parentElement: inner, tabIndex: 0, focus: options => { focused = options; }, scrollIntoView: options => { scrolled = options; } };
    globalThis.document = { querySelector: target => target === '#notes' ? note : null };
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    assert.equal(focusWorkspaceSection('#notes'), true);
    assert.equal(inner.open, true); assert.equal(outer.open, true);
    assert.deepEqual(focused, { preventScroll: true });
    assert.deepEqual(scrolled, { block: 'start', behavior: 'auto' });
    assert.equal(note.tabIndex, -1);
    globalThis.window.matchMedia = () => ({ matches: false });
    focusWorkspaceSection('#notes'); assert.equal(scrolled.behavior, 'smooth');
    assert.equal(focusWorkspaceSection('#missing'), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

test('today secondary surfaces survive a shareable hash and reject unknown panel names',()=>{
 const location=readWorkspaceLocation(workspaceHash({view:'today',space:'s',panel:'discovery'}));
 assert.equal(location.panel,'discovery');assert.equal(location.space,'s');
 assert.equal(readWorkspaceLocation('#today?panel=unknown').panel,undefined);
});
test('paper panels preserve reading origin and route context without leaking into other pages',()=>{
 const original={view:'paper-detail',id:'p',space:'s',from:'today',panel:'reading',track:'t',tab:'evidence',paperPanel:'notes'};
 assert.deepEqual(readWorkspaceLocation(workspaceHash(original)),{...original,graph:undefined,step:undefined,path:undefined});
 assert.equal(readWorkspaceLocation('#paper/p?paperPanel=unknown').paperPanel,undefined);
 assert.equal(readWorkspaceLocation('#today?paperPanel=notes').paperPanel,undefined);
});

test('library exploration survives refresh with search, scope, page and citation focus',()=>{
 const location={view:'thread-detail',id:'route-2',space:'s',tab:'evidence',libraryQuery:'Gaussian concentration',libraryScope:'all',libraryPage:3,libraryFocus:'paper-9'};
 assert.deepEqual(readWorkspaceLocation(workspaceHash(location)),{...location,from:undefined,track:undefined,graph:undefined,step:undefined,path:undefined});
 const graphLibrary={view:'threads',space:'s',graph:'all',libraryQuery:'transport inequality',libraryPage:2};
 assert.deepEqual(readWorkspaceLocation(workspaceHash(graphLibrary)),{...graphLibrary,id:undefined,tab:'start',from:undefined,track:undefined,step:undefined,path:undefined});
 assert.equal(readWorkspaceLocation('#today?q=hidden&scope=all&page=4&libraryFocus=p').libraryQuery,undefined);
});

test('the primary library restores its filters, sort and service page',()=>{
 const location={view:'library',space:'s',libraryQuery:'optimal transport',libraryFilter:'accepted',libraryStage:'evaluated',libraryInbox:'seen',librarySort:'newest',libraryTag:'notes',libraryPage:4};
 assert.deepEqual(readWorkspaceLocation(workspaceHash(location)),{...location,id:undefined,tab:'start',from:undefined,track:undefined,graph:undefined,step:undefined,path:undefined});
 const invalid=readWorkspaceLocation('#library?filter=unknown&stage=pending&inbox=removed&sort=random&tag=pdf&page=0');
 assert.equal(invalid.libraryFilter,undefined);assert.equal(invalid.libraryStage,undefined);assert.equal(invalid.libraryPage,undefined);
});

test('research graph scope and focus survive only on an active graph route',()=>{
 const location={view:'threads',space:'s',graph:'all',graphSurface:'routes',graphMode:'citations',graphScope:'one-hop',graphTrack:'route-2',graphFocus:'paper-9'};
 assert.deepEqual(readWorkspaceLocation(workspaceHash(location)),{...location,id:undefined,tab:'start',from:undefined,track:undefined,step:undefined,path:undefined});
 const inactive=readWorkspaceLocation('#threads?graphMode=citations&graphScope=one-hop&graphFocus=paper-9');
 assert.equal(inactive.graphMode,undefined);assert.equal(inactive.graphScope,undefined);assert.equal(inactive.graphFocus,undefined);
});

test('workbook tab and evidence cell survive refresh without leaking to other pages',()=>{
 const location={view:'workbook',id:'route-2',space:'s',from:'threads',workbookPanel:'relations',workbookFocus:'assumptions:paper-9'};
 assert.deepEqual(readWorkspaceLocation(workspaceHash(location)),{...location,tab:'start',track:undefined,graph:undefined,step:undefined,path:undefined});
 assert.equal(readWorkspaceLocation('#library?workbookPanel=task&workbookFocus=x').workbookPanel,undefined);
 assert.equal(readWorkspaceLocation('#workbook/route-2?workbookPanel=unknown&workbookFocus=%00').workbookFocus,undefined);
});

test('comparison identity is pinned through paper return URLs and rejects invalid values',()=>{
 const comparison=workspaceHash({view:'workbook',id:'r',space:'s',from:'threads',workbookId:'s:r:revision-1',workbookFocus:'conditions:p'});
 const paper=readWorkspaceLocation(workspaceHash({view:'paper-detail',id:'p',space:'s',from:'workbook',track:'r',returnTo:comparison}));
 assert.equal(readWorkspaceLocation(paper.returnTo).workbookId,'s:r:revision-1');
 assert.equal(readWorkspaceLocation('#library?workbookId=hidden').workbookId,undefined);
 assert.equal(readWorkspaceLocation('#workbook/r?workbookId='+encodeURIComponent('x'.repeat(241))).workbookId,undefined);
 assert.equal(readWorkspaceLocation('#workbook/r?workbookId=bad%00').workbookId,undefined);
});

test('URL text rejects control characters while preserving Unicode queries and evidence focus',()=>{
 for(const character of ['\u0000','\u001f','\u007f']){
  assert.equal(readWorkspaceLocation('#library?q='+encodeURIComponent('query'+character)).libraryQuery,undefined);
  assert.equal(readWorkspaceLocation('#workbook/route-2?workbookFocus='+encodeURIComponent('cell:'+character)).workbookFocus,undefined);
 }
 assert.equal(readWorkspaceLocation('#library?q='+encodeURIComponent('协方差 α')).libraryQuery,'协方差 α');
 assert.equal(readWorkspaceLocation('#workbook/route-2?workbookFocus='+encodeURIComponent('假设:论文')).workbookFocus,'假设:论文');
});

test('a paper retains the exact library, graph or learning location to return to after refresh',()=>{
 for(const origin of [
  {view:'library',space:'s',libraryQuery:'协方差',libraryFilter:'accepted',libraryTag:'notes',librarySort:'newest',libraryPage:3},
  {view:'threads',space:'s',graph:'all',graphSurface:'routes',graphMode:'citations',graphScope:'one-hop',graphFocus:'p2'},
  {view:'learn',space:'s',step:'stage-2',path:'path-1'},
  {view:'today',space:'s',panel:'reading'},
 ]){
  const returnTo=workspaceHash(origin);
  const detail=readWorkspaceLocation(workspaceHash({view:'paper-detail',id:'p1',space:'s',from:origin.view,returnTo,paperPanel:'notes'}));
  assert.equal(detail.returnTo,returnTo);
  assert.deepEqual(readWorkspaceLocation(detail.returnTo),readWorkspaceLocation(returnTo));
 }
});

test('comparison context survives paper reading and still returns to the original research route',()=>{
 const route=workspaceHash({view:'thread-detail',id:'r1',space:'s',tab:'evidence',libraryQuery:'Gaussian',libraryPage:2});
 const workbook=workspaceHash({view:'workbook',id:'r1',space:'s',from:'thread-detail',returnTo:route,workbookPanel:'relations',workbookFocus:'assumptions:p1'});
 const paper=readWorkspaceLocation(workspaceHash({view:'paper-detail',id:'p1',space:'s',from:'workbook',returnTo:workbook}));
 assert.equal(paper.returnTo,workbook);
 const restored=readWorkspaceLocation(paper.returnTo);
 assert.equal(restored.workbookFocus,'assumptions:p1');
 assert.equal(restored.returnTo,route);
});

test('return locations reject external links, another workspace, mismatched origins and nested cycles',()=>{
 const detail={view:'paper-detail',id:'p',space:'s',from:'library'};
 for(const returnTo of ['https://example.com','#unknown?space=s','#paper/p?space=s','#library?space=other','#today?space=s','#library?space=s&q=%00']){
  assert.equal(readWorkspaceLocation(workspaceHash({...detail,returnTo})).returnTo,undefined);
 }
 assert.equal(readWorkspaceLocation('#today?space=s&returnTo='+encodeURIComponent('#library?space=s')).returnTo,undefined);
 let nested=workspaceHash({view:'library',space:'s'});
 for(let i=0;i<8;i++)nested=workspaceHash({view:'workbook',id:'r'+i,space:'s',from:i?'workbook':'library',returnTo:nested});
 assert.ok(nested.length<5000);
});

test('a comparison reading retains its specific check across refresh without leaking into unrelated pages',()=>{
 const paper=readWorkspaceLocation(workspaceHash({view:'paper-detail',id:'p',space:'s',from:'workbook',readingFocus:'核对协方差的假设条件'}));
 assert.equal(paper.readingFocus,'核对协方差的假设条件');
 assert.equal(readWorkspaceLocation('#library?readingFocus=hidden').readingFocus,undefined);
 assert.equal(readWorkspaceLocation('#paper/p?from=workbook&readingFocus=%00').readingFocus,undefined);
 const library=workspaceHash({view:'library',space:'s',libraryQuery:'协方差'.repeat(80),libraryPage:4});
 const workbook=workspaceHash({view:'workbook',id:'r',space:'s',from:'library',returnTo:library});
 assert.equal(readWorkspaceLocation(workspaceHash({view:'paper-detail',id:'p',space:'s',from:'workbook',returnTo:workbook})).returnTo,workbook);
});
