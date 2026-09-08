import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { learningBrowseStep, canChangeLearningStep } from '../lib/learning-browse.ts';

const steps = [
  {id:'foundation',titleZh:'基础文献',titleEn:'Foundations',status:'active',resources:[]},
  {id:'method',titleZh:'核心方法',titleEn:'Methods',status:'pending',resources:[{id:'paper'}]},
  {id:'done',titleZh:'已完成阶段',titleEn:'Completed stage',status:'completed',resources:[{id:'old'}]},
];
const source = await readFile(new URL('../app/components/learning-stage-navigation.tsx',import.meta.url),'utf8');
const component = {exports:{}};
new Function('require','module','exports',ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText)(createRequire(import.meta.url),component,component.exports);

test('Stage navigation opens existing materials without advancing progress',()=>{
  const before=JSON.stringify(steps);
  let selection=null;
  const render=()=>component.exports.LearningStageNavigation({steps,locale:'zh',selectedId:selection?.stepId||steps[0].id,
    currentId:steps[0].id,label:()=> '材料状态',onSelect:stepId=>{selection={scope:'a:path',stepId};}});
  const tree=render();
  const buttons=tree.props.children;
  buttons[1].props.onClick();
  const viewed=learningBrowseStep(steps,steps[0],'a:path',selection);
  assert.equal(viewed.id,'method');
  assert.equal(viewed.resources[0].id,'paper');
  assert.equal(canChangeLearningStep(viewed,steps[0]),false);
  assert.equal(canChangeLearningStep(steps[0],steps[0]),false);
  assert.equal(canChangeLearningStep(steps[2],steps[0]),true);
  assert.equal(JSON.stringify(steps),before);
  const html=renderToStaticMarkup(render());
  assert.match(html,/aria-label="查看学习阶段"/);
  assert.match(html,/aria-pressed="true"/);
  assert.match(html,/aria-controls="learning-stage-content"/);
  assert.match(html,/当前进度/);
});

test('Selections cannot leak to another space or replacement path, and stale steps fall back',()=>{
  const selection={scope:'a:path',stepId:'method'};
  assert.equal(learningBrowseStep(steps,steps[0],'b:path',selection).id,'foundation');
  assert.equal(learningBrowseStep(steps,steps[0],'a:new',selection).id,'foundation');
  assert.equal(learningBrowseStep([steps[0]],steps[0],'a:path',selection).id,'foundation');
  assert.equal(learningBrowseStep(steps,steps[0],'a:path',null).id,'foundation');
  assert.equal(learningBrowseStep([steps[2]],null,'a:path',null).id,'done');
  assert.equal(learningBrowseStep([],null,'a:path',selection),null);
  assert.equal(canChangeLearningStep({...steps[0],resources:[{id:'p'}]},steps[0]),true);
});

test('Main learning page binds browse state separately from completion and paper opening',async()=>{
  const app=await readFile(new URL('../app/research-app.tsx',import.meta.url),'utf8');
  assert.match(app,/LearningStageNavigation steps=\{activeLearningState.path.steps\}/);
  assert.match(app,/onSelect=\{\(stepId\) => setLearningBrowseSelection/);
  assert.match(app,/!canChangeLearningStep\(activeLearningStep, currentLearningStep\)/);
  assert.match(app,/resources=\{activeLearningStep.resources\}/);
  assert.match(app,/id="learning-stage-content"/);
});
