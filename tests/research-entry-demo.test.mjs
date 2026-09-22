import test from 'node:test';
import assert from 'node:assert/strict';

test('Demo question flow is isolated, custom goals never inherit preset recommendations, and finished reading leaves the list',async()=>{
 const {demoResponse}=await import('../lib/demo-workspace.mjs?entry-flow');
 const get=async id=>(await demoResponse('/api/research-entry?spaceId='+id)).json();
 const before=await get('demo-mathematics'),info=await get('demo-information');
 assert.equal(before.papers.length,3);assert.equal(info.papers.length,3);
 const custom={spaceId:'demo-mathematics',question:'How do finite blocklength probability criteria differ?',seed:'Unverified title'};
 const saved=await (await demoResponse('/api/research-entry',{method:'POST',body:JSON.stringify(custom)})).json();
 assert.equal(saved.goal.question,custom.question);assert.deepEqual(saved.papers,[]);assert.equal(saved.goal.trackId,'');
 assert.deepEqual(await get('demo-information'),info);
 assert.equal((await demoResponse('/api/research-entry',{method:'POST',body:JSON.stringify({...custom,spaceId:'foreign'})})).status,403);
 await demoResponse('/api/research-entry',{method:'POST',body:JSON.stringify({spaceId:'demo-mathematics',action:'reset'})});
 assert.deepEqual(await get('demo-mathematics'),before);
 await demoResponse('/api/library',{method:'PATCH',body:JSON.stringify({spaceId:'demo-mathematics',paperId:before.papers[0].id,status:'read',note:'Test-only saved note'})});
 assert.deepEqual((await get('demo-mathematics')).papers.map(p=>p.id),before.papers.slice(1).map(p=>p.id));
});
