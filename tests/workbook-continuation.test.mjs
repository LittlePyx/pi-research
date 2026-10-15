import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonLocation, continuationKey, rememberComparison, readComparisonLocation, decodeContinuation } from '../lib/workbook-continuation.ts';
import { workspaceHash, readWorkspaceLocation } from '../lib/workspace-navigation.ts';

const origin = workspaceHash({view:'threads',space:'s',graph:'p',graphMode:'citations',graphFocus:'p'});
const workbook = workspaceHash({view:'workbook',space:'s',id:'r',workbookId:'s:r:version-1',workbookPanel:'relations',workbookFocus:'assumptions:p',from:'threads',returnTo:origin});
const paper = workspaceHash({view:'paper-detail',space:'s',id:'p',from:'workbook',track:'r',readingFocus:'Check the noise assumption',paperPanel:'notes',returnTo:workbook});

test('comparison bookmarks retain the exact version, cell, source-reading task and graph return chain',()=>{
  const old=globalThis.localStorage, values=new Map();
  globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  try {
    rememberComparison('alice','s',workbook);
    rememberComparison('alice','s',paper);
    rememberComparison('alice','s','#today?space=s');
    const saved=readWorkspaceLocation(readComparisonLocation('alice','s'));
    assert.equal(saved.id,'p');assert.equal(saved.readingFocus,'Check the noise assumption');assert.equal(saved.paperPanel,'notes');
    const back=readWorkspaceLocation(saved.returnTo);
    assert.equal(back.workbookId,'s:r:version-1');assert.equal(back.workbookFocus,'assumptions:p');assert.equal(back.workbookPanel,'relations');assert.equal(back.returnTo,origin);
    assert.equal(readComparisonLocation('bob','s'),'');assert.equal(readComparisonLocation('alice','other'),'');
    assert.equal(values.size,1,'bookmark stores only the location, not notes or model output');
    values.set(continuationKey('alice','other'),paper);assert.equal(readComparisonLocation('alice','other'),'');
  } finally {globalThis.localStorage=old;}
});

test('unprepared comparisons, malformed routes, foreign spaces and unsafe origins cannot become resumable tasks',()=>{
  for(const hash of ['https://example.org', '#workbook/r?space=s', '#workbook/r?space=other&workbookId=v', '#paper/p?space=s&from=today', '#today?space=s', '#workbook/r?space=s&workbookId=v'+ 'x'.repeat(8000)])assert.equal(comparisonLocation(hash,'s'),null);
  const invalid=workspaceHash({view:'workbook',space:'s',id:'r',workbookId:'v',from:'library',returnTo:'#library?space=other'});
  assert.equal(comparisonLocation(invalid,'s').location.returnTo,undefined);
  const old=globalThis.localStorage;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Storage blocked')}});
  try {assert.doesNotThrow(()=>rememberComparison('u','s',workbook));assert.equal(readComparisonLocation('u','s'),'');}
  finally {Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:old});}
});

test('task reads reject incomplete or invalid state rather than presenting a false ready card',()=>{
  assert.deepEqual(decodeContinuation({continuation:null}),{continuation:null});
  for(const value of [null,{}, {continuation:{}}, {continuation:{hash:workbook,titleZh:'x',titleEn:'x',status:'invented',savedRevision:1,sourceCount:2}}])assert.throws(()=>decodeContinuation(value));
});
