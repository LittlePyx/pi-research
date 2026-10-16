import test from 'node:test';
import assert from 'node:assert/strict';
import {briefEditorial} from '../lib/brief-editorial.mjs';
test('process-only briefs lead with saved research findings and keep exact paper IDs as citations',()=>{
 const brief={model:'evidence-summary',overviewZh:'筛选 360 篇，确认 3 篇。'};
 const findings=[{id:'source-b',title:'B',text:'成功概率与误差指数不能直接排序。'},{id:'source-a',title:'A',text:'编码限制改变可用的可靠性界。'},{id:'source-c',title:'C',text:'第三项仍在完整关注点中。'}];
 const output=briefEditorial(brief,findings);
 assert.equal(output.overview,'[1] 成功概率与误差指数不能直接排序。\n\n[2] 编码限制改变可用的可靠性界。');
 assert.equal(output.process,brief.overviewZh);assert.deepEqual(output.overviewSources,[{id:'source-b',title:'B'},{id:'source-a',title:'A'}]);
 assert.doesNotMatch(output.overview,/360|最新|证明|同一尺度/);
});
test('empty and editorial briefs retain their original message rather than inventing discoveries',()=>{
 assert.deepEqual(briefEditorial({model:'evidence-summary',overviewEn:'No verified paper this run'},[],'en'),{overview:'No verified paper this run'});
 assert.deepEqual(briefEditorial({model:'deepseek',overviewEn:'A supported cross-paper qualification'},[{id:'p',title:'P',text:'Saved analysis'}],'en'),{overview:'A supported cross-paper qualification'});
 const empty=briefEditorial({model:'evidence-summary',metrics:{recommended:0},overviewZh:'本轮筛选360篇。'},[]);
 assert.match(empty.overview,/暂无可展示的已核验发现/);assert.equal(empty.process,'本轮筛选360篇。');assert.doesNotMatch(empty.overview,/360/);
});
test('long findings end at a complete sentence when possible and remain visibly excerpted otherwise',()=>{
 const first='This finding applies under the stated channel assumptions.';
 const text=first+' '+('Additional scope and qualifications. '.repeat(25));
 const result=briefEditorial({model:'evidence-summary'},[{id:'p',title:'P',text}],'en');
 assert.ok(result.overview.length<450);assert.ok(result.overview.endsWith('.'));assert.match(result.overview,/stated channel assumptions/);
 const unbroken=briefEditorial({model:'evidence-summary'},[{id:'p',title:'P',text:'条'.repeat(300)}]);assert.ok(unbroken.overview.endsWith('…'));
});
