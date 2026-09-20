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
