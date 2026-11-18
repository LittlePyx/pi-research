import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookComponent,componentNodes} from './helpers/workbook-components.mjs';
import {workbookSample,workbookSources} from './fixtures/research-workbook.mjs';
import {workbookPaperLabel} from '../lib/research-workbook.ts';
const {WorkbookComparison}=workbookComponent('workbook-comparison');
const {WorkbookEvidenceContext}=workbookComponent('workbook-evidence-context');

test('two or three papers share one evidence target per dimension regardless of layout or source order',()=>{
 for(const count of [2,3]){
  const content=workbookSample(),sources=structuredClone(workbookSources),third={...sources[0],id:'third:paper',title:'A third paper with a long identity'};
  if(count===3){sources.push(third);content.dimensions.forEach(d=>d.cells.push({...d.cells[0],paperId:third.id}));}
  for(const order of [sources,[...sources].reverse()]){
   const opened=[],id=`${content.dimensions[0].id}:${sources[0].id}`;
   const nodes=componentNodes(WorkbookComparison({content,sources:order,observations:{[id]:'Retained note'},locale:'zh',focus:id,onInspect:value=>opened.push(value)}));
   const buttons=nodes.filter(n=>n.type==='button');assert.equal(buttons.length,content.dimensions.length*count);assert.equal(new Set(buttons.map(n=>n.props['data-evidence-origin'])).size,buttons.length);
   assert.equal(buttons.filter(n=>n.props['aria-pressed']).length,1);
   for(const button of buttons){button.props.onClick();assert.equal(opened.at(-1),button.props['data-evidence-id']);const source=order.find(s=>button.props['data-evidence-id'].endsWith(':'+s.id));assert.ok(button.props['aria-label'].includes(workbookPaperLabel(source.id,order)));}
   assert.match(JSON.stringify(nodes),/已有核查笔记/);
  }
 }
});

test('evidence context binds the exact statement, source quotes and comparison boundary, including missing cells',()=>{
 const content=workbookSample();
 for(const dimension of content.dimensions)for(const cell of dimension.cells){
  const source=workbookSources.find(s=>s.id===cell.paperId),focus=`${dimension.id}:${cell.paperId}`;
  for(const locale of ['zh','en']){
   const tree=WorkbookEvidenceContext({content,sources:workbookSources,focus,locale}),nodes=componentNodes(tree),serialized=JSON.stringify(tree);
   assert.match(serialized,new RegExp(source.title.slice(0,15).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   const statement=nodes.find(n=>n.props['aria-label']===(locale==='zh'?'本项比较陈述':'Current comparison statement'));
   if(cell.status==='supported'){assert.ok(JSON.stringify(statement).includes(locale==='zh'?cell.textZh:cell.textEn));assert.ok(nodes.some(n=>n.type==='blockquote'));}
   else assert.equal(nodes.filter(n=>n.type==='blockquote').length,0);
   assert.ok(serialized.includes(locale==='zh'?content.comparison.textZh:content.comparison.textEn));
  }
 }
 assert.equal(WorkbookEvidenceContext({content,sources:workbookSources,focus:'foreign:paper',locale:'zh'}),null);
});
