import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { isDatabaseVerifiedCitationEdge } from '../lib/paper-network.ts';
import { citationMap, citationWorkbenchSource } from './fixtures/citation-workbench.mjs';

const source = await citationWorkbenchSource();
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const Workbench = new Function('require', 'exports', 'useMemo', 'useEffect', 'MathText', 'isDatabaseVerifiedCitationEdge',
  `${compiled}; return CitationFlowWorkbench;`)(createRequire(import.meta.url), {}, fn => fn(), () => {}, ({ children }) => children, isDatabaseVerifiedCitationEdge);
function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants);
  return node && typeof node === 'object' && node.props ? [node, ...descendants(node.props.children)] : [];
}
function render(locale, overrides = {}) {
  const selected = [];
  const tree = Workbench({ map: citationMap, trackFilter: 'all', locale, selectedPaperId: 'cited',
    onSelect: id => selected.push(id), onExpandFocus() {}, onOpenFocus() {}, onAskFocus() {}, expanding: false, ...overrides });
  const ledger = descendants(tree).find(node => node.props.className === 'v2-citation-ledger');
  return { tree, ledger, selected };
}

test('citation ledger selects both exact stored endpoints even when publication years descend', () => {
  const before = structuredClone(citationMap);
  for (const locale of ['zh', 'en']) {
    const { ledger, selected } = render(locale);
    const rows = descendants(ledger).filter(node => node.type === 'article');
    assert.equal(rows.length, 2, 'Pi-inferred reading edges never enter the verified ledger');
    const buttons = descendants(rows[0]).filter(node => node.type === 'button');
    buttons.forEach(button => button.props.onClick());
    assert.deepEqual(selected, ['cited', 'citing']);
    assert.equal(buttons[0].props['aria-pressed'], true);
    assert.equal(buttons[1].props['aria-pressed'], false);
    const html = renderToStaticMarkup(rows[0]);
    assert.ok(html.indexOf('2023') < html.indexOf('2022'), 'stored citation direction is not reordered by year');
    for (const paper of citationMap.tracks[0].papers.slice(0, 2)) assert.ok(html.includes(paper.title));
    assert.ok(html.includes(locale === 'zh' ? '被引论文' : 'Cited paper'));
    assert.ok(html.includes(locale === 'zh' ? '引用它的论文' : 'Paper citing it'));
  }
  assert.deepEqual(citationMap, before);
});

test('provider occupies its own text row, outside the decorative direction arrow', () => {
  const { ledger } = render('en');
  const nodes = descendants(ledger);
  const providers = nodes.filter(node => node.props.className === 'v2-citation-ledger-source');
  assert.equal(providers.length, 2);
  assert.match(renderToStaticMarkup(providers[0]), /Semantic Scholar/);
  assert.match(renderToStaticMarkup(providers[1]), /OpenAlex/);
  for (const arrow of nodes.filter(node => node.props.className === 'v2-citation-ledger-arrow')) {
    assert.equal(arrow.props.children, '→');
    assert.equal(arrow.props['aria-hidden'], 'true');
  }
});

test('changing citation focus preserves the ledger; an unrelated route stays empty', () => {
  const { ledger } = render('zh', { selectedPaperId: 'citing' });
  assert.equal(descendants(ledger).filter(node => node.type === 'article').length, 2);
  assert.equal(render('zh', { trackFilter: 'different-route' }).ledger, undefined);
});
