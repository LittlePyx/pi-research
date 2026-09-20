import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPilotAccess} from '../lib/pilot-access-check.mjs';
test('access check distinguishes edge blocks, closed experiments and the expected application auth gate',async()=>{
 const blocked=await checkPilotAccess(async(url,init)=>{
  assert.equal(new URL(url).pathname,'/api/personalization-pilot');assert.equal(init.headers.Authorization,undefined);assert.equal(init.body,'{}');assert.equal(init.redirect,'manual');
  return new Response('<title>Attention Required! | Cloudflare</title><p>private network detail</p>',{status:403,headers:{'cf-ray':'fixture-ray','server':'cloudflare'}});
 });
 assert.equal(blocked.code,'cloudflare_blocked');assert.equal(blocked.ready,false);assert.equal(blocked.rayId,'fixture-ray');assert.doesNotMatch(JSON.stringify(blocked),/private network detail/);
 const closed=await checkPilotAccess(async()=>Response.json({error:'experiment_closed'},{status:410}));assert.equal(closed.code,'experiment_closed');assert.equal(closed.ready,false);
 const reachable=await checkPilotAccess(async()=>Response.json({error:'unauthorized'},{status:401}));assert.equal(reachable.ready,true);
 const platform=await checkPilotAccess(async()=>new Response('Sign in',{status:401}));assert.equal(platform.ready,false);
});
test('network errors remain a separate condition without automatic retries or raw exception disclosure',async()=>{
 let calls=0;const result=await checkPilotAccess(async()=>{calls++;throw new Error('private proxy URL');});assert.equal(calls,1);assert.equal(result.code,'network_unavailable');assert.doesNotMatch(JSON.stringify(result),/private proxy/);
});
