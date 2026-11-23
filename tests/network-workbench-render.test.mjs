import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const mod = { exports: {} };
  modules.set(file, mod.exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name.endsWith('.css')) return {};
    if (!name.startsWith('.')) return require(name);
    const base = resolve(dirname(file), name);
    const dependency = extname(base) ? base : ['.ts', '.tsx', '.mjs', '.js'].map(ext => base + ext).find(existsSync);
    if (!dependency) throw Error(`Unresolved test dependency: ${name}`);
    return /\.tsx?$/.test(dependency) ? load(dependency) : require(dependency);
  }, mod, mod.exports);
  return mod.exports;
}

const { CitationFlowWorkbench } = load(resolve('app/components/citation-flow-workbench.tsx'));
const paper = (id, year, extra = {}) => ({
  id, canonicalId: `doi:${id}`, title: `Paper ${id}`, authors: 'Author', venue: 'Journal',
  publishedAt: `${year}-01-01`, citationCount: 4, role: 'foundation', position: 0,
  rationaleZh: '路线依据', rationaleEn: 'Route evidence', url: '', doi: id, ...extra,
});
const edge = (sourcePaperId, targetPaperId, extra = {}) => ({
  id: `${sourcePaperId}:${targetPaperId}`, sourcePaperId, targetPaperId,
  kind: 'citation', relationKind: 'cites', evidenceSource: 'openalex', confidence: 100, ...extra,
});
const map = {
  tracks: [{ id: 'route', titleZh: '路线', titleEn: 'Route', papers: [paper('prior', 2000), paper('focus', 2010), paper('later', 2020), paper('unverified', 2025)] }],
  paperEdges: [edge('focus', 'prior'), edge('later', 'focus'), edge('unverified', 'focus', { evidenceSource: 'pi' })],
};
const renderCitation = locale => renderToStaticMarkup(createElement(CitationFlowWorkbench, {
  map, trackFilter: 'route', spaceId:'s', locale, selectedPaperId: 'focus',
  onSelect() {}, onRead() {}, onAgenda() {},
}));

test('extracted citation workbench preserves reference direction and hides unverified links in both languages', () => {
  for (const locale of ['zh', 'en']) {
    const html = renderCitation(locale);
    const priorStart=html.indexOf('<section data-kind="reference">');
    const laterStart=html.indexOf('<section data-kind="citation">');
    assert.ok(html.indexOf('id="citation-focus-paper"')<priorStart);
    const prior = html.slice(priorStart,laterStart);
    const later = html.slice(laterStart,html.indexOf('</section>',laterStart));
    assert.match(prior, /Paper prior/);
    assert.doesNotMatch(prior, /Paper later/);
    assert.match(later, /Paper later/);
    assert.doesNotMatch(later, /Paper prior/);
    assert.doesNotMatch(html, /Paper unverified/);
    assert.match(html, /OpenAlex/);
    assert.match(html, /Research plan|\u7814\u7A76\u8BA1\u5212/);
  }
});
