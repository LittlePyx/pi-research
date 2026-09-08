import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = await readFile(new URL('../app/research-app.tsx', import.meta.url), 'utf8');
function render(expression, props) {
  const mod = { exports: {} };
  const code = ts.transpileModule(`export default function Fixture({${Object.keys(props).join(',')}}) { return (${expression}); }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(createRequire(import.meta.url), mod, mod.exports);
  return renderToStaticMarkup(mod.exports.default(props));
}

test('actual loading branch describes reading, not model generation, in both locales', () => {
  const start = source.indexOf('<section className="v2-learning-loading"');
  const section = source.slice(start, source.indexOf('</section>', start) + '</section>'.length);
  for (const locale of ['zh', 'en']) {
    const html = render(section, { locale, InterfaceIcon: () => null });
    assert.match(html, /role="status"/);
    assert.ok(html.includes(locale === 'zh' ? '正在载入学习路径' : 'Loading the learning path'));
    assert.doesNotMatch(html, /正在生成|Building|核对方向|Checking the direction/);
  }
});

test('unloaded, loading and failed counts are unknown, not zero; real zero stays visible', () => {
  const start = source.indexOf('{activeLearningReady && !activeLearningLoading && (!activeLearningError || Boolean(activeLearningState.path)) && <small>');
  assert.ok(start >= 0);
  const expression = source.slice(start + 1, source.indexOf('</small>}', start) + '</small>'.length);
  for (const locale of ['zh', 'en']) {
    const base = { locale, activeLearningReady: true, activeLearningLoading: false, activeLearningError: '', activeLearningState: { availablePaperCount: 0, waitingQualityCount: 0 } };
    for (const override of [{ activeLearningReady: false }, { activeLearningLoading: true }, { activeLearningError: 'failed' }]) {
      assert.equal(render(expression, { ...base, ...override }), '');
    }
    assert.match(render(expression, base), /<small>0 /);
    const counts = render(expression, { ...base, activeLearningState: { availablePaperCount: 18, waitingQualityCount: 17 } });
    assert.match(counts, /18 /);
    assert.match(counts, /17 /);
    const retained = render(expression, { ...base, activeLearningError: 'replan failed', activeLearningState: { path: { id: 'saved' }, availablePaperCount: 18, waitingQualityCount: 17 } });
    assert.match(retained, /18 /);
    assert.match(retained, /17 /);
  }
});

test('read and generate keep separate request and status channels', () => {
  const start = source.indexOf('const generateLearningPath = async');
  const generate = source.slice(start, source.indexOf('const updateLearningStep', start));
  assert.match(generate, /setLearningAction\("generate"\)/);
  assert.match(generate, /method: "POST"/);
  assert.doesNotMatch(generate, /setLearningLoading\(true\)/);
  assert.match(source, /learningAction === "generate" \? \(locale === "zh" \? "正在生成…" : "Building…"\)/);
  assert.match(source, /fetch\("\/api\/learning-path\?spaceId="/);
});
