import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {workbookSample,workbookSources} from './fixtures/research-workbook.mjs';
import {workbookPaperLabel} from '../lib/research-workbook.ts';
const require=createRequire(import.meta.url),mod={exports:{}};
const code=ts.transpileModule(readFileSync(new URL('../app/components/workbook-evidence-links.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','exports',code)(name=>name==='./math-text'?{MathText:({children})=>children}:name.startsWith('../../lib/')?require('../lib/'+name.split('/').at(-1)+'.ts'):require(name),mod.exports);
const nodes=tree=>{const found=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){found.push(n);walk(n.props?.children)}}walk(tree);return found;};

test('shared dimensions appear once while each paper retains a distinct evidence target and stable identity',()=>{
 const content=workbookSample(),[a,b]=content.dimensions,[p,q]=workbookSources;
 const ids=[`${a.id}:${p.id}`,`${a.id}:${q.id}`,`${a.id}:${p.id}`,`${b.id}:${q.id}`],opened=[];
 for(const locale of ['zh','en']){
  const tree=mod.exports.WorkbookEvidenceLinks({content,sources:[...workbookSources].reverse(),evidenceIds:ids,locale,focus:ids[1],onInspect:id=>opened.push(id)});
  const all=nodes(tree),groups=all.filter(n=>n.props.role==='group'),buttons=all.filter(n=>n.type==='button');
  assert.equal(groups.length,2);assert.equal(groups[0].props['aria-label'],locale==='zh'?a.labelZh:a.labelEn);
  assert.equal(buttons.length,3,'repeated input IDs do not duplicate an evidence control');
  assert.equal(nodes(groups[0]).filter(n=>n.props.className==='pi-workbook-evidence-dimension').length,1);
  assert.equal(new Set(buttons.map(n=>n.props['aria-label'])).size,3);
  for(const button of buttons){
   const source=workbookSources.find(s=>button.props.title===s.title);
   assert.ok(button.props['aria-label'].includes(workbookPaperLabel(source.id,workbookSources)));
   button.props.onClick();assert.equal(opened.at(-1),button.props['data-evidence-id']);
  }
  assert.equal(buttons.filter(n=>n.props['aria-pressed']).map(n=>n.props['data-evidence-id']).join(),ids[1]);
 }
});
