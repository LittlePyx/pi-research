import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as tasks from '../lib/learning-next-task.ts';

const resource = (id, status = 'unread') => ({ id: `monitor:${id}`, title: id, url: '', qualification: 'quality_approved', readingStatus: status });
const stage = () => ({ status: 'pending', resources: [], supplementaryResources: [], completedAt: null });

test('next task continues reading, prefers primary material and never mutates progress', () => {
  const step = { ...stage(), resources: [resource('finished', 'read'), resource('new'), resource('ongoing', 'reading')], supplementaryResources: [resource('bridge')] };
  const before = structuredClone(step);
  assert.equal(tasks.learningNextTask(step).resource.id, 'monitor:ongoing');
  assert.equal(tasks.learningNextTask(step).supplementary, false);
  assert.equal(tasks.learningNextTask({ ...step, resources: step.resources.slice(0, 2) }).resource.id, 'monitor:new');
  assert.equal(tasks.learningNextTask({ ...step, resources: [resource('finished', 'read')] }).revisit, true);
  assert.deepEqual(step, before);
  assert.equal(tasks.learningNextTask({ ...step, status: 'completed' }), null);
});

test('empty original stage can offer only an approved accessible supplement', () => {
  const step = { ...stage(), supplementaryResources: [{ ...resource('pending'), qualification: undefined }, { ...resource('unsafe'), id: 'legacy', url: 'javascript:alert(1)' }, resource('bridge')] };
  const task = tasks.learningNextTask(step);
  assert.equal(task.resource.id, 'monitor:bridge');
  assert.equal(task.supplementary, true);
  assert.equal(tasks.learningNextTask(stage()), null);
  assert.equal(step.resources.length, 0);
});

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', compile(await readFile(new URL('../app/components/learning-next-task.tsx', import.meta.url), 'utf8')))(name => name.endsWith('lib/learning-next-task') ? tasks : name === './math-text' ? { MathText: ({ children }) => children } : require(name), mod, mod.exports);

test('both languages show paper-specific focus, prerequisites and a note task without completion actions', () => {
  const step = { ...stage(), supplementaryResources: [{ ...resource('approved bridge'), readingFocusZh: '核对已评估的假设 <script>bad</script>', readingFocusEn: 'Check reviewed assumptions <script>bad</script>' }] };
  for (const locale of ['zh', 'en']) {
    let selected;
    const html = renderToStaticMarkup(mod.exports.LearningNextTask({ step, locale, renderResource: paper => { selected = paper.id; return paper.title; } }));
    assert.equal(selected, 'monitor:approved bridge');
    assert.match(html, locale === 'zh' ? /前置知识|本次阅读重点/ : /prerequisites|Reading focus/);
    assert.match(html, locale === 'zh' ? /本阶段原始材料仍待补齐/ : /original material is still missing/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>|<input|<button/);
    assert.equal((html.match(/<li>/g) || []).length, 3);
  }
});
