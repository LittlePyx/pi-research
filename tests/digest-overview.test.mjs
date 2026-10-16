import test from 'node:test';
import assert from 'node:assert/strict';
import {digestOverview} from '../lib/digest-overview.mjs';
const brief={date:'2026-09-20',isCurrent:false,model:'evidence-summary',overviewZh:'今天确认两篇。',paperIds:['a','missing','b'],signalsZh:['A的发现','缺失论文发现','B的发现'],readingPlanZh:['核对A','','核对B']};
const p=id=>({id,title:id,qualityStage:'recommended'});
test('saved overview uses its own date and keeps evidence aligned after unavailable papers',()=>{
 const result=digestOverview(brief,[p('b'),p('a')]);
 assert.equal(result.overview,'[1] A的发现\n\n[2] B的发现');
 assert.equal(result.process,'2026-09-20确认两篇。');
 assert.deepEqual(result.overviewSources.map(p=>p.id),['a','b']);
 assert.deepEqual(result.findings.map(p=>[p.id,p.text,p.action]),[['a','A的发现','核对A'],['b','B的发现','核对B']]);
 assert.equal(result.historical,true);
});
test('unreviewed and dismissed papers cannot supply highlighted findings',()=>{
 assert.equal(digestOverview(brief,[{...p('a'),qualityStage:'queued'},{...p('b'),feedback:'not_relevant'}]).findings.length,0);
 assert.equal(digestOverview(null,[]),null);
 const fallback=digestOverview({...brief,signalsZh:[]},[{...p('a'),contributionZh:'已保存贡献'}]);
 assert.equal(fallback.findings[0].text,'已保存贡献');
});
