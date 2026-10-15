import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as tasks from '../lib/learning-next-task.ts';
import * as paths from '../lib/learning-path.ts';

const source = await readFile(new URL('../app/components/learning-session-entry.tsx', import.meta.url), 'utf8');
const mod = { exports: {} };
const require = createRequire(import.meta.url);
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText)(name => name.endsWith('lib/learning-next-task') ? tasks
  : name.endsWith('lib/learning-path') ? paths
    : name === './math-text' ? { MathText: ({ children }) => children }
      : require(name), mod, mod.exports);

const paper = (status = 'unread') => ({ id:'monitor:paper-1', canonicalId:'paper-1', title:'Saved source paper', qualification:'quality_approved', readingStatus:status, readingFocusZh:'核对论文假设', readingFocusEn:'Check the assumptions' });
const step = resource => ({ id:'method', status:'active', titleZh:'核心方法', titleEn:'Core method', guidanceStatus:'grounded', readFocusZh:'比较方法条件', readFocusEn:'Compare method conditions', resources:[resource], supplementaryResources:[] });

test('the learning page exposes the admitted next paper and focus before the stage browser', () => {
  let opened = '';
  const html = renderToStaticMarkup(mod.exports.LearningSessionEntry({ step:step(paper()), locale:'zh', openingId:null, onOpen:value => { opened=value.id; } }));
  assert.match(html, /核心方法 · 下一篇阅读/);
  assert.match(html, /Saved source paper/);
  assert.match(html, /比较方法条件/);
  assert.match(html, /开始阅读/);
  assert.doesNotMatch(html, /完成本阶段/);
  assert.equal(opened, '');
});

test('an ongoing paper is presented as a continuation and opening state is disabled', () => {
  const html = renderToStaticMarkup(mod.exports.LearningSessionEntry({ step:step(paper('reading')), locale:'en', openingId:'monitor:paper-1', onOpen:() => {} }));
  assert.match(html, /Opening…/);
  assert.match(html, /disabled=""/);
});

test('a completed stage has no duplicate session entry', () => {
  assert.equal(mod.exports.LearningSessionEntry({ step:{...step(paper()),status:'completed'}, locale:'zh', openingId:null, onOpen:() => {} }), null);
});
