import test from 'node:test';
import assert from 'node:assert/strict';
import { routeNextAction } from '../lib/route-overview.ts';

test('the route action depends on eligible sources and exact saved comparison state',()=>{
  const empty={eligibleCount:1,routeEligibleCount:0,comparisons:[]};
  assert.equal(routeNextAction(null),'read');
  assert.equal(routeNextAction(empty),'read');
  assert.equal(routeNextAction({...empty,eligibleCount:2}),'compare');
  const latest={id:'exact-workbook',status:'verifying',stale:false,savedRevision:0};
  const withLatest=value=>({...empty,comparisons:[{...latest,...value}]});
  assert.equal(routeNextAction(withLatest({})),'resume');
  assert.equal(routeNextAction(withLatest({status:'retryable'})),'resume');
  assert.equal(routeNextAction(withLatest({status:'ready'})),'record');
  assert.equal(routeNextAction(withLatest({status:'ready',savedRevision:2})),'saved');
  assert.equal(routeNextAction(withLatest({status:'ready',savedRevision:2,stale:true})),'check');
  assert.equal(routeNextAction(withLatest({status:'rejected'})),'check');
});
