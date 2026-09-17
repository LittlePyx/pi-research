import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

const source=readFileSync(new URL('../app/api/monitor/route.ts',import.meta.url),'utf8');
const start=source.indexOf('async function discoveryOffset(');
const end=source.indexOf('async function countNewCandidates(',start);
const {code}=await transform(source.slice(start,end),{loader:'ts',target:'es2022'});
const {discoveryOffset,advanceDiscoveryOffset}=new Function('discoveryQueryKey','DISCOVERY_OFFSET_LIMIT',`${code}; return {discoveryOffset,advanceDiscoveryOffset};`)(async()=> 'query',1000);

test('recent route queries always revisit page zero without changing historical pagination',async()=>{
  let reads=0,writes=0;
  const db={prepare:()=>({bind:()=>({first:async()=>{reads++;return {next_offset:90};},run:async()=>{writes++;return {};}})})};
  const rotating={rotating:true};
  assert.equal(await discoveryOffset(db,'space','days',rotating),0);
  assert.equal(await advanceDiscoveryOffset(db,'space','days',rotating,90,30),0);
  assert.equal(reads,0);assert.equal(writes,0);
  assert.equal(await discoveryOffset(db,'space','months',rotating),90);
  assert.equal(await advanceDiscoveryOffset(db,'space','months',rotating,90,30),120);
  assert.equal(reads,1);assert.equal(writes,1);
  assert.equal(await advanceDiscoveryOffset(db,'space','years',rotating,990,30),0);
  assert.equal(await discoveryOffset(db,'space','years',{rotating:false}),0);
});
