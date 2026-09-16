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

test('planning material counts are shown only after a preview response', async () => {
  const planner = await readFile(new URL('../app/components/learning-goal-planner.tsx', import.meta.url), 'utf8');
  assert.match(planner, /preview && <section/);
  const expression = '<p>{preview.materialCount} selected papers / {preview.candidateCount} available</p>';
  assert.match(render(expression, {preview:{materialCount:0,candidateCount:0}}), /0 selected papers \/ 0 available/);
  assert.match(planner, /data\.preview/);
  assert.doesNotMatch(planner, /candidateCount\s*\|\|\s*0/);
});

test('read and generate keep separate request and status channels', async () => {
  const start = source.indexOf('const generateLearningPath = async');
  const generate = source.slice(start, source.indexOf('const updateLearningStep', start));
  assert.match(generate, /setLearningAction\("generate"\)/);
  assert.match(generate, /method: "POST"/);
  assert.doesNotMatch(generate, /setLearningLoading\(true\)/);
  const planner = await readFile(new URL('../app/components/learning-goal-planner.tsx', import.meta.url), 'utf8');
  assert.match(planner, /正在匹配材料与规划/);
  assert.match(planner, /busy \? \(zh \? '正在保存…'/);
  assert.match(source, /fetch\("\/api\/learning-path\?spaceId="/);
});
