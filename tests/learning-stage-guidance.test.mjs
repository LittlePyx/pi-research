import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = await readFile(new URL('../app/components/learning-stage-guidance.tsx', import.meta.url), 'utf8');
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText)(createRequire(import.meta.url), mod, mod.exports);
const { LearningStageGuidance } = mod.exports;
const fixture = { guidanceStatus: 'grounded', resources: [{ id: 'paper' }],
  whyZh: '具体文献作用', whyEn: 'Specific paper contribution',
  readFocusZh: '具体假设', readFocusEn: 'Specific assumptions',
  checkpointZh: '具体判断', checkpointEn: 'Specific decision' };

test('only grounded guidance with actual materials is rendered, without mutating steps', () => {
  for (const locale of ['zh', 'en']) {
    for (const guidanceStatus of ['reading-task', 'pending', undefined]) {
      const step = { ...fixture, guidanceStatus };
      const saved = structuredClone(step);
      assert.equal(LearningStageGuidance({ step, locale }), null);
      assert.deepEqual(step, saved);
    }
    assert.equal(LearningStageGuidance({ step: { ...fixture, resources: [] }, locale }), null);
    const html = renderToStaticMarkup(LearningStageGuidance({ step: fixture, locale }));
    assert.equal((html.match(/<article>/g) || []).length, 3);
    assert.ok(html.includes(locale === 'zh' ? fixture.whyZh : fixture.whyEn));
    assert.doesNotMatch(html, /<button|<input/);
  }
});

test('empty grounded fields create no empty explanation panels', () => {
  const step = { ...fixture, whyZh: ' ', readFocusZh: '', checkpointZh: '' };
  assert.equal(LearningStageGuidance({ step, locale: 'zh' }), null);
  const html = renderToStaticMarkup(LearningStageGuidance({ step: { ...step, readFocusZh: '有据可查' }, locale: 'zh' }));
  assert.equal((html.match(/<article>/g) || []).length, 1);
});

test('both learning entry points share the same guidance visibility rule', async () => {
  const app = await readFile(new URL('../app/research-app.tsx', import.meta.url), 'utf8');
  assert.match(app, /<LearningStageGuidance step=\{activeStep\} locale=\{locale\} \/>/);
  assert.match(app, /<LearningStageGuidance step=\{activeLearningStep\} locale=\{locale\} \/>/);
  assert.doesNotMatch(app, /className="v2-learning-now-guidance"/);
});
