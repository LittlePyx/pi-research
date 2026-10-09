import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
const out=await build({entryPoints:['app/components/discovery-brief.tsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react/jsx-runtime'],jsx:'automatic',plugins:[{name:'math',setup(b){b.onResolve({filter:/math-text$/},()=>({path:'math',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const MathText=({children})=>children;'}))}}]});
const mod={exports:{}};new Function('require','module','exports',out.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const goal={id:'current',question:'Finite blocklength coding?',status:'active',monitoringStatus:'active'};
const reading=id=>({id,title:id,whyZh:'已核验的关联依据',whyEn:'Verified rationale'});
const render=props=>renderToStaticMarkup(React.createElement(mod.exports.DiscoveryBrief,{context:{goal,papers:[],loading:false,unavailable:false},active:false,demo:false,locale:'zh',onRead:()=>{},onLibrary:()=>{},onProgress:()=>{},...props}));
test('brief uses exact question readings, not unscoped recent papers or queue counts',()=>{
 const html=render({context:{goal,papers:[reading('Related'),reading('Related')],loading:false,unavailable:false},papers:[{id:'unrelated',title:'Unrelated intrusion detection'}],pending:1297});
 assert.match(html,/Related/);assert.match(html,/已核验的关联依据/);assert.doesNotMatch(html,/1297|Unrelated|尚非精选/);assert.equal(html.split('<li>').length-1,1);
});
test('empty, paused and missing question states retain useful progress and library actions',()=>{
 assert.match(render({}),/没有已核验/);assert.match(render({active:true}),/本空间有检索或评审任务/);
 assert.match(render({context:{goal:{...goal,status:'paused'},papers:[]}}),/已暂停或结束/);
 assert.match(render({context:{goal:null,papers:[reading('Wrong')]}}),/按研究领域整理阅读/);
 assert.doesNotMatch(render({context:{goal:null,papers:[reading('Wrong')]}}),/Wrong/);
 assert.match(render({}),/查看发现进度/);assert.match(render({}),/浏览空间文献库/);assert.match(render({demo:true}),/演示材料/);
});
test('loading or failed question refresh never presents old links as checked current results',()=>{
 for(const state of [{loading:true},{unavailable:true}]){
  const html=render({context:{goal,papers:[reading('Stale link')],...state}});assert.doesNotMatch(html,/Stale link|以下阅读已关联/);
 }
});
