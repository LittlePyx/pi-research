import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
const out=await build({entryPoints:['app/components/discovery-brief.tsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react/jsx-runtime'],jsx:'automatic',plugins:[{name:'math',setup(b){b.onResolve({filter:/math-text$/},()=>({path:'math',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const MathText=({children})=>children;'}))}}]});
const mod={exports:{}};new Function('require','module','exports',out.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const render=props=>renderToStaticMarkup(React.createElement(mod.exports.DiscoveryBrief,{papers:[],pending:0,awaiting:0,active:false,demo:false,locale:'zh',onRead:()=>{},onLibrary:()=>{},...props}));
const paper=(id,stage,date)=>({id,title:id,venue:'Real Journal',publishedAt:'2020-01-01',discoveredAt:date,qualityStage:stage});
test('discovery brief distinguishes queued, unselected and verified reading without inventing a fresh run',()=>{
 const papers=[paper('Older','discovered','2020-01-01'),paper('Selected','recommended','2026-09-28'),paper('Waiting','reviewing','2026-09-27'),paper('Checked','reviewed','2026-09-26'),paper('Evidence','awaiting_evidence','2026-09-25')];
 const html=render({papers,pending:8,awaiting:2});
 assert.match(html,/8 篇候选等待评审或核验/);assert.match(html,/2 篇待补充摘要/);assert.match(html,/尚非精选推荐/);assert.match(html,/Real Journal/);assert.match(html,/推荐依据待核验/);assert.match(html,/已评审 · 未入精选/);assert.match(html,/待补充摘要/);
 assert.doesNotMatch(html,/Selected|Older|本轮新发现|推荐分/);assert.equal(papers[0].id,'Older');
});
test('a run with no material shows an honest brief instead of fictional paper cards',()=>{
 assert.match(render({active:true}),/仍在进行/);assert.match(render({}),/暂未载入可展示的文献条目/);assert.doesNotMatch(render({}),/<li/);
 assert.match(render({demo:true}),/演示材料/);
});
