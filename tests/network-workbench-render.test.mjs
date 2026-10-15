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
    if (!name.startsWith('.')) return require(name);
    const base = resolve(dirname(file), name);
    const dependency = extname(base) ? base : ['.ts', '.tsx', '.mjs', '.js'].map(ext => base + ext).find(existsSync);
    if (!dependency) throw Error(`Unresolved test dependency: ${name}`);
    return /\.tsx?$/.test(dependency) ? load(dependency) : require(dependency);
  }, mod, mod.exports);
  return mod.exports;
}

const { CitationFlowWorkbench } = load(resolve('app/components/citation-flow-workbench.tsx'));
const { ReadingOrderWorkbench } = load(resolve('app/components/reading-order-workbench.tsx'));
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
  map, trackFilter: 'route', locale, selectedPaperId: 'focus', expanding: false,
  onSelect() {}, onExpandFocus() {}, onOpenFocus() {}, onAskFocus() {},
}));

test('extracted citation workbench preserves reference direction and hides unverified links in both languages', () => {
  for (const locale of ['zh', 'en']) {
    const html = renderCitation(locale);
    const prior = html.slice(html.indexOf('<section class="prior">'), html.indexOf('<article id="citation-focus-paper"'));
    const later = html.slice(html.indexOf('<section class="later">'), html.indexOf('<section class="pi-citation-ledger"'));
    assert.match(prior, /Paper prior/);
    assert.doesNotMatch(prior, /Paper later/);
    assert.match(later, /Paper later/);
    assert.doesNotMatch(later, /Paper prior/);
    assert.doesNotMatch(html, /Paper unverified/);
    assert.match(html, /OpenAlex/);
  }
});

const resource = (id, extra = {}) => ({
  id: `track:${id}`, canonicalId: `doi:${id}`, title: `Paper ${id}`, authors: 'Author', venue: 'Journal',
  publishedAt: '2010-01-01', url: '', qualification: 'quality_approved', readingStatus: 'unread', ...extra,
});
const step = (id, status, resources) => ({
  id, kind: 'foundation', status, titleZh: id, titleEn: id, goalZh: '学习目标', goalEn: 'Learning goal',
  estimatedMinutes: 60, evidenceStatus: 'ready', guidanceStatus: 'pending', resources, supplementaryResources: [],
});
const path = {
  id: 'saved-path', targetTrackId: 'route', target: 'Route', titleZh: '已保存路径', titleEn: 'Saved path',
  revision: 2, completedSteps: 0, steps: [step('Current stage', 'active', [resource('focus')]), step('Later stage', 'pending', [resource('later')])],
};
const renderReading = overrides => renderToStaticMarkup(createElement(ReadingOrderWorkbench, {
  map, trackFilter: 'route', locale: 'en', selectedPaperId: 'focus',
  learningState: { path, waitingQualityCount: 2 }, learningLoading: false, learningError: '', learningAction: null,
  onSelect() {}, onToggleStep() {}, onGenerate() {}, onRetry() {}, ...overrides,
}));

test('extracted reading workbench retains a saved path after refresh failure and renders exact paper identity', () => {
  const html = renderReading({ learningError: 'Unavailable' });
  assert.match(html, /Saved path/);
  assert.match(html, /The last update did not finish; the saved path remains/);
  assert.match(html, /Paper focus/);
  assert.match(html, /class="selected"/);
  assert.match(html, /Quality approved/);
  assert.doesNotMatch(html, /Loading the saved learning path/);
});

test('reading workbench keeps external DOI fallback safe and does not silently advance an empty stage', () => {
  const external = resource('external', { id: 'monitor:external', title: 'External paper', url: 'javascript:alert(1)', canonicalId: 'doi:10.1234/source' });
  const html = renderReading({ learningState: { path: { ...path, steps: [step('Empty current stage', 'active', []), step('Future reading', 'pending', [external])] }, waitingQualityCount: 0 } });
  assert.match(html, /Empty current stage/);
  assert.match(html, /disabled="">Complete stage/);
  assert.doesNotMatch(html, /href="javascript:/);
  const withPaper = renderReading({ learningState: { path: { ...path, steps: [step('Current stage', 'active', [external])] }, waitingQualityCount: 0 } });
  assert.match(withPaper, /href="https:\/\/doi.org\/10.1234\/source"/);
  assert.doesNotMatch(withPaper, /href="javascript:/);
});
