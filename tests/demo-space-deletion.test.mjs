import test from 'node:test';
import assert from 'node:assert/strict';

test('demo deletion hides both spaces without losing papers, saved notes or feedback on restore',async()=>{
 const {demoResponse:request}=await import('../lib/demo-workspace.mjs?space-delete-test');
 const send=(method,body)=>request('/api/spaces',{method,body:JSON.stringify(body)});
 const original=await (await request('/api/spaces')).json();
 const space=original.spaces[0],spaceId=space.id;
 const {monitor}=await (await request('/api/monitor?spaceId='+spaceId)).json();
 const paperId=monitor.historyPapers[0].id;
 await request('/api/library',{method:'PATCH',body:JSON.stringify({spaceId,paperId,note:'Saved before deletion',status:'reading'})});
 await request('/api/feedback',{method:'POST',body:JSON.stringify({spaceId,paperId,kind:'save',value:true})});
 const before=await (await request('/api/monitor?spaceId='+spaceId)).json();
 assert.equal((await send('DELETE',{id:spaceId,confirmName:'wrong'})).status,403);
 for(const row of original.spaces)assert.equal((await send('DELETE',{id:row.id,confirmName:row.name})).status,200);
 const removed=await (await request('/api/spaces')).json();
 assert.equal(removed.spaces.length,0);assert.equal(removed.deletedSpaces.length,2);
 assert.equal((await request('/api/monitor?spaceId='+spaceId)).status,410);
 assert.equal((await request('/api/library',{method:'PATCH',body:JSON.stringify({spaceId,paperId,note:'Must not write'})})).status,410);
 const restored=await (await send('PATCH',{id:spaceId,action:'restore'})).json();assert.equal(restored.space.id,spaceId);assert.equal(restored.deleted,false);
 assert.deepEqual((await (await request('/api/monitor?spaceId='+spaceId)).json()).monitor.historyPapers,before.monitor.historyPapers);
 for(const row of original.spaces)await send('PATCH',{id:row.id,action:'restore'});
 assert.equal((await (await request('/api/spaces')).json()).deletedSpaces.length,0);
});
