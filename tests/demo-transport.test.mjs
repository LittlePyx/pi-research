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
  assert.equal(learning.path.completedSteps,0);
  const workbook=(await get('/api/research-workbook')).workbook;
  assert.deepEqual(workbook.sources.map(p=>p.id),monitor.papers.map(p=>p.id));
  assert.ok(workbook.content.dimensions.every(d=>d.cells.every(c=>c.status==='missing'&&!c.quote)));
  const client=await readFile(new URL('../app/research-app.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(client,/Pi 策展代表作|让 Pi 解释位置/);
  assert.match(client,/示例研究简报/);
  assert.match(client,/演示样例 · 未执行扫描/);
});
