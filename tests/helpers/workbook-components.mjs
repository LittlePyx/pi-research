import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
export function workbookComponent(name){
 const mod={exports:{}};
 const code=ts.transpileModule(readFileSync(new URL(`../../app/components/${name}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)(name=>name==='react'?{useRef:current=>({current})}:name==='./workbook-dimension-navigation'?{WorkbookDimensionNavigation:()=>null}:name.endsWith('.css')?{}:name==='./math-text'?{MathText:({children})=>children}:name.startsWith('../../lib/')?require('../../lib/'+name.split('/').at(-1)+'.ts'):require(name),mod.exports);
 return mod.exports;
}
export function componentNodes(tree){
 const list=[];function walk(node){if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==='object'){list.push(node);walk(node.props?.children)}}walk(tree);return list;
}
