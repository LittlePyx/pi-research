import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
const output=await build({entryPoints:['app/components/today-discovery-status.tsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react/jsx-runtime'],jsx:'automatic'});
const mod={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const render=props=>renderToStaticMarkup(React.createElement(mod.exports.TodayDiscoveryStatus,{state:'running',hasReading:false,phase:'正在核对推荐依据',href:'#today?panel=discovery',locale:'zh',...props}));
test('empty discovery explains the wait and exposes the real phase without invented percentages',()=>{
 const html=render({candidates:12,reviewed:3});
 assert.match(html,/is-empty/);assert.match(html,/Pi 正在为你寻找文献/);assert.match(html,/通过评审的材料会自动出现在这里/);assert.match(html,/12 篇候选/);assert.match(html,/3 篇/);assert.match(html,/正在核对推荐依据/);assert.match(html,/href="#today\?panel=discovery"/);assert.doesNotMatch(html,/%|预计|分钟后/);
 assert.doesNotMatch(render({candidates:NaN,reviewed:-1}),/NaN|-1|已找到|已评审/);
});
test('existing reading gets a compact notice; failure and completion do not pretend work is running',()=>{
 assert.match(render({hasReading:true}),/is-compact/);assert.doesNotMatch(render({hasReading:true}),/通过评审的材料会自动出现在这里/);
 const failed=render({state:'error',candidates:12});assert.match(failed,/暂时中断/);assert.match(failed,/查看原因与恢复/);assert.doesNotMatch(failed,/is-running|正在为你|12 篇候选/);
 assert.equal(render({state:'idle'}),'');
});
