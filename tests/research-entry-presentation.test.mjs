import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../app/components/research-entry.tsx',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
function render(result,resume){
 let stateIndex=0;
 const mod={exports:{}};
 const hookReact={...React,useState:initial=>[stateIndex++===0?result:initial,()=>{}],useEffect:()=>{},useRef:value=>({current:value})};
 new Function('require','exports',code)(name=>name==='react'?hookReact:name==='./math-text'?{MathText:({children})=>children}:name.endsWith('.css')?{}:name.includes('workspace-request')?{workspaceFetch:()=>{throw Error('Rendering must not fetch')}}:require(name),mod.exports);
 return renderToStaticMarkup(React.createElement(mod.exports.ResearchEntry,{spaceId:'test',locale:'en',demo:true,refreshKey:'',scanStatus:'',blocked:'',resume,onRead:()=>{},onDiscover:()=>{},onRoute:()=>{},onSaved:()=>{},onReadingList:()=>{},onProgress:()=>{}}));
}
const paper=id=>({id,title:id,whyEn:'Saved reason',focusEn:'Saved focus',checkEn:'Saved check'});
const goal={id:'g',trackId:'t',question:'Current question',status:'active',monitoringStatus:'active'};
test('An in-progress paper appears once in the shared research panel; queued reading stays accessible',()=>{
 const html=render({goal,papers:[paper('In-progress paper'),paper('Next paper')]},{id:'In-progress paper',title:'In-progress paper',readingNote:'Original note'});
 assert.equal(html.split('In-progress paper').length-1,1);
 assert.match(html,/Original note/);assert.match(html,/Continue reading &amp; notes/);
 assert.match(html,/Next paper/);assert.match(html,/Up next/);
 assert.doesNotMatch(html,/Saved focus|Saved check/);
});
test('Without a resume, the first recommendation retains full guidance and later entries are concise',()=>{
 const html=render({goal,papers:[paper('First paper'),paper('Second paper')]},null);
 assert.equal(html.split('Saved focus').length-1,1);
 assert.equal(html.split('Saved check').length-1,1);
 assert.match(html,/Second paper/);
 const loading=render(null,{id:'resume',title:'Preserved reading',readingNote:'Preserved note'});
 assert.match(loading,/Loading your question/);assert.match(loading,/Preserved note/);
});
