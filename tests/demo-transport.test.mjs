import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { workspaceFetch } from '../lib/workspace-request.ts';
import { demoResponse } from '../lib/demo-workspace.mjs';

test('demo transport is closed to real network, including unknown operations and secrets', async()=>{
  const original=globalThis.fetch;const originalWindow=globalThis.window;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response('{}');};globalThis.window={location:{pathname:'/demo/'}};
  try {
    for(const path of ['/api/ask','/api/model-settings','/api/email-subscription','/api/spaces','/api/new-endpoint','https://other.invalid/api/ask']) {
      const result=await workspaceFetch(path,{method:'POST',body:JSON.stringify({apiKey:'not-a-real-key',spaceId:'demo-mathematics'})});assert.equal(result.status,403);
    }
    assert.equal((await workspaceFetch('/api/spaces')).status,200);assert.equal(calls,0);
    const c=new AbortController();c.abort();await assert.rejects(workspaceFetch('/api/spaces',{signal:c.signal}),{name:'AbortError'});
    globalThis.window.location.pathname='/';await workspaceFetch('/api/spaces');assert.equal(calls,1);
  } finally {globalThis.fetch=original;if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;}
});
test('demo notes are per-space and model analysis cannot be reported as successful',async()=>{
  const patch=(spaceId,note,analyze=false)=>demoResponse('/api/library',{method:'PATCH',body:JSON.stringify({spaceId,paperId:'kls-localization',status:'reading',note,analyze})});
  assert.equal((await patch('demo-mathematics','sample note')).status,200);
  const memory=await (await demoResponse('/api/research-memory?spaceId=demo-mathematics')).json();assert.ok(memory.items.some(p=>p.note==='sample note'));
  assert.equal((await patch('demo-information','should not cross spaces')).status,403);
  assert.equal((await patch('demo-mathematics','should not analyze',true)).status,403);
  await patch('demo-mathematics','');
  const cleared=await (await demoResponse('/api/research-memory?spaceId=demo-mathematics')).json();assert.ok(!cleared.items.some(p=>p.paperId==='kls-localization'));
});
test('all client API callers retain the explicit demo boundary',async()=>{
  const files=['../app/research-app.tsx',...(await readdir(new URL('../app/components/',import.meta.url))).filter(f=>f.endsWith('.tsx')).map(f=>'../app/components/'+f)];
  for(const file of files){const source=await readFile(new URL(file,import.meta.url),'utf8');if(/\bfetch\(/.test(source))assert.match(source,/import \{ workspaceFetch as fetch \}/,file);assert.doesNotMatch(source,/globalThis\.fetch\(|window\.fetch\(|sendBeacon\(|new XMLHttpRequest/);}
});

test('mathematics demo connects the same papers across reading, route, comparison and learning', async()=>{
  const spaceId='demo-mathematics';
  const get=async path=>(await demoResponse(path+'?spaceId='+spaceId)).json();
  const monitor=(await get('/api/monitor')).monitor;
  assert.deepEqual(monitor.papers.map(p=>p.id),['kls-localization','eldan-thin-shell']);
  assert.equal(monitor.scannedCount,0);
  const map=await (await demoResponse('/api/research-map',{method:'POST',body:JSON.stringify({spaceId,action:'read'})})).json();
  assert.equal(map.tracks[0].confirmedEvidenceCount,0);
  const learning=await get('/api/learning-path');
  assert.equal(learning.path.targetTrackId,map.tracks[0].id);
  assert.deepEqual(learning.path.steps[1].resources.map(p=>p.canonicalId),['eldan-thin-shell']);
  assert.equal(learning.path.completedSteps,1);
  const workbook=(await get('/api/research-workbook')).workbook;
  assert.deepEqual(workbook.sources.map(p=>p.id),monitor.papers.map(p=>p.id));
  assert.ok(workbook.content.dimensions[0].cells.every(c=>c.status==='supported'&&c.quote));
  assert.ok(workbook.content.dimensions[1].cells.every(c=>c.status==='missing'&&!c.quote));
  assert.equal(workbook.artifact.revision,1);
  const client=await readFile(new URL('../app/research-app.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(client,/Pi 策展代表作|让 Pi 解释位置/);
  assert.match(client,/示例研究简报/);
  assert.match(client,/演示样例 · 未执行扫描/);
});

test('every demo paper has a sourced reading summary without pretending it is abstract evidence', async()=>{
  for(const spaceId of ['demo-mathematics','demo-information']) {
    const {monitor}=await (await demoResponse(`/api/monitor?spaceId=${spaceId}`)).json();
    for(const paper of monitor.historyPapers) {
      const result=await demoResponse(`/api/paper-reading?spaceId=${spaceId}&paperId=${paper.id}`);
      assert.equal(result.status,200);const data=await result.json();
      assert.equal(data.paper.abstractText,'');assert.ok(data.paper.readingSummary.zh.length>30);assert.ok(data.paper.readingSummary.en.length>30);
      assert.equal(new URL(data.paper.readingSummary.sourceUrl).protocol,'https:');
      assert.ok(['overview','abstract-summary'].includes(data.paper.readingSummary.kind));assert.equal(data.recovery,undefined);
    }
  }
  assert.equal((await demoResponse('/api/paper-reading?spaceId=demo-information&paperId=kls-localization')).status,404);
  assert.equal((await demoResponse('/api/paper-reading?spaceId=demo-mathematics&paperId=unknown')).status,404);
  assert.equal((await demoResponse('/api/paper-reading',{method:'POST',body:JSON.stringify({spaceId:'demo-mathematics',paperId:'kls-localization'})})).status,403);
});

test('demo history is coherent, editable and resettable without background work', async()=>{
  const {learningFixture}=await import('../lib/demo-workspace.mjs');
  for(const spaceId of ['demo-mathematics','demo-information']) {
    const initial=learningFixture(spaceId);
    assert.equal(initial.monitor.historyPapers.length,15);
    assert.equal(initial.monitor.historyPapers.filter(p=>p.readingNote).length,4);
    assert.ok(initial.monitor.historyPapers.some(p=>p.readingStatus==='read'));
    assert.ok(initial.monitor.historyPapers.some(p=>p.readingStatus==='reading'));
    assert.ok(initial.monitor.historyPapers.some(p=>p.readingStatus==='queued'));
    assert.equal(initial.monitor.historyPapers.filter(p=>p.qualityStage==='recommended').length,2);
    const path=initial.learning.path;
    const update=(stepId,completed)=>demoResponse('/api/learning-path',{method:'PATCH',body:JSON.stringify({spaceId,pathId:path.id,stepId,completed})});
    assert.equal((await update(path.steps[4].id,true)).status,403);
    const result=await (await update(path.steps[1].id,true)).json();assert.equal(result.path.completedSteps,2);assert.equal(result.path.steps[2].status,'active');
    await update(path.steps[1].id,false);
    assert.equal(learningFixture(spaceId).learning.path.completedSteps,1);
    const {workbook}=await (await demoResponse(`/api/research-workbook?spaceId=${spaceId}`)).json();
    assert.ok(workbook.artifact.value.decision.includes('示例'));
    assert.equal(workbook.content.task.steps.length,3);
    assert.ok(workbook.content.dimensions[0].cells.every(c=>workbook.sources.find(s=>s.id===c.paperId).abstractText.includes(c.quote)));
  }
});
