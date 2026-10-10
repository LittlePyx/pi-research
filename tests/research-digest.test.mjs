import test from 'node:test';
import assert from 'node:assert/strict';
import {digestDiscoveries} from '../lib/research-digest.mjs';
test('digest respects source evidence, user exclusions and recommendation separation',()=>{
 const p=(id,extra={})=>({id,qualityStage:'queued',discoverySources:[{key:'crossref'}],discoveredAt:'2026-10-01',...extra});
 const papers=[p('older'),p('newer',{discoveredAt:'2026-10-09'}),p('newer'),p('recommended',{qualityStage:'recommended'}),p('unknown',{discoverySources:[]}),p('read',{readingStatus:'read'}),p('ignored',{feedback:'not_relevant'}),p('later',{userState:'snoozed'}),p('excluded'),p('reviewed',{qualityStage:'reviewed'})];
 assert.deepEqual(digestDiscoveries(papers,['excluded']).map(p=>p.id),['newer','older','reviewed']);
 assert.equal(digestDiscoveries(papers,[],1).length,1);
 assert.equal(papers[0].id,'older','sorting must not mutate the input');
});
