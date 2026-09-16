import assert from 'node:assert/strict';
import test from 'node:test';
import { graphSelection, groundedGraphRelevance, workbookFocus, storedWorkbookQuestion, focusedWorkbookQuestion } from '../lib/graph-task.ts';
test('graph handoff uses exact scholarly identities and does not replace missing papers with popular defaults',()=>{
  const candidates=[{id:'a',canonicalId:'DOI:10.1/a'},{id:'b',canonicalId:'doi:10.1/b'}];
  assert.deepEqual(graphSelection(candidates,['doi:10.1/b','doi:10.1/missing']),{selected:['b'],missing:['doi:10.1/missing']});
  assert.deepEqual(graphSelection(candidates,['doi:10.1/a','DOI:10.1/A']),{selected:['a'],missing:[]});
});
test('graph relevance requires exact abstract excerpts and never promotes a plausible unsupported reason',()=>{
  const sources=[{canonicalId:'a',abstractText:'This isolated test abstract requires a positive definite covariance matrix for the stated construction.'}];
  const raw=[{canonicalId:'a',relevance:'direct',quote:sources[0].abstractText,reasonZh:'隔离说明',reasonEn:'Fixture reason',limitationZh:'局限',limitationEn:'Limitation'}];
  assert.equal(groundedGraphRelevance(raw,sources)[0].relevance,'direct');
  assert.equal(groundedGraphRelevance(undefined,sources)[0].relevance,'insufficient');
  assert.equal(groundedGraphRelevance([...raw,...raw],sources)[0].relevance,'insufficient');
  assert.equal(groundedGraphRelevance([{...raw[0],quote:'An invented quote that is long enough but absent from this abstract.'}],sources)[0].relevance,'insufficient');
  assert.equal(groundedGraphRelevance(raw,[{...sources[0],abstractText:''}])[0].relevance,'insufficient');
});
test('comparison focus is versioned without changing the formal route question',()=>{
  const stored=storedWorkbookQuestion('Route question','My specific task');
  assert.equal(workbookFocus(stored),'My specific task');assert.equal(workbookFocus('Legacy question'),'');
  assert.notEqual(focusedWorkbookQuestion('Route question',workbookFocus(stored)),focusedWorkbookQuestion('Changed route question',workbookFocus(stored)));
});
