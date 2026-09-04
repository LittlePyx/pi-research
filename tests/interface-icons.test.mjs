import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const app = await readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const source = await readFile(new URL("../app/components/interface-icon.tsx", import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const compile = (text) => ts.transpileModule(text, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const icons = { exports: {} };
new Function("require", "module", "exports", compile(source))(require, icons, icons.exports);
const { InterfaceIcon } = icons.exports;
function evaluate(text, dependencies = {}) {
  const scope = { exports: {}, InterfaceIcon, ...dependencies };
  return new Function("require", ...Object.keys(scope), compile(`const rendered = (${text});`) + "\nreturn rendered;")(require, ...Object.values(scope));
}

test("functional icons share a fixed vector grid and stay out of the accessibility name", () => {
  const names = [...source.matchAll(/^ {2}([a-z]+): /gm)].map((match) => match[1]);
  assert.ok(names.length >= 15);
  for (const name of names) {
    const tree = InterfaceIcon({ name });
    const html = renderToStaticMarkup(tree);
    assert.equal(tree.type, "svg");
    assert.equal(tree.props["aria-hidden"], "true");
    assert.equal(tree.props.focusable, "false");
    assert.equal(tree.props.viewBox, "0 0 24 24");
    assert.equal(tree.props.strokeWidth, "1.65");
    assert.match(html, /<(path|rect|circle) /);
    assert.doesNotMatch(html, /<text|<img|π|◎|tabindex|aria-label/);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.pi-icon-loading\s*\{ animation: none;/);
  assert.doesNotMatch(css, /\.pi-state-mark\s*\{[^}]*border-radius/);
  assert.doesNotMatch(css, /\.v2-(?:paper-network|direction-path)-canvas svg(?!:not\(\.pi-icon\))/);
});

test("the screenshot empty and loading states retain honest bilingual text without circular glyph badges", () => {
  const start = app.indexOf("{activeLearningLoading ? <section");
  const loading = app.slice(start + "{activeLearningLoading ? ".length, app.indexOf(" : activeLearningError", start));
  const emptyStart = app.indexOf('<section className="v2-learning-empty">');
  const empty = app.slice(emptyStart, app.indexOf("</section>", emptyStart) + "</section>".length);
  assert.ok(start > 0 && emptyStart > 0);
  for (const locale of ["zh", "en"]) {
    const loadingHtml = renderToStaticMarkup(evaluate(loading, { locale }));
    const emptyHtml = renderToStaticMarkup(evaluate(empty, { locale }));
    assert.match(loadingHtml, /role="status"/);
    assert.match(loadingHtml, /data-icon="loading"/);
    assert.match(emptyHtml, /data-icon="reading"/);
    assert.match(loadingHtml, locale === "zh" ? /正在生成学习路径/ : /Building the learning path/);
    assert.match(emptyHtml, locale === "zh" ? /还没有学习路径/ : /No learning path yet/);
    assert.doesNotMatch(emptyHtml + loadingHtml, /π|◎|<span>/);
  }
});

test("learning error keeps its retry action and alert semantics after the icon change", () => {
  const start = app.indexOf('<div className="v2-learning-empty error"');
  const jsx = app.slice(start, app.indexOf(" : activeLearningState.path", start));
  let reload = 0;
  const tree = evaluate(jsx, { locale: "zh", activeLearningError: "Connection interrupted", setLearningReloadNonce: (update) => { reload = update(reload); } });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /role="alert"/);
  assert.match(html, /data-icon="warning"/);
  assert.match(html, /Connection interrupted/);
  const button = tree.props.children.find((child) => child?.type === "button");
  button.props.onClick();
  assert.equal(reload, 1);
});

test("workspace choices display supplied metadata only and preserve selection callbacks", () => {
  const start = app.indexOf('<div className="v2-space-list">');
  const jsx = app.slice(start, app.indexOf("</div>", start) + 6);
  const spaces = [
    { id: "a", name: "Information theory", memberName: "Yilin", description: "Gaussian channels", accent: "blue" },
    { id: "b", name: "Applied mathematics", memberName: "Researcher", description: "Convex geometry", accent: "sage" },
  ];
  const selected = [];
  const tree = evaluate(jsx, { spaces, activeSpace: spaces[0], locale: "zh", initials: (name) => name[0], defaultSpaceName: (name) => name, switchSpace: (space) => selected.push(space.id) });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Information theory/);
  assert.match(html, /Applied mathematics/);
  assert.match(html, /<small>Yilin<\/small>/);
  assert.match(html, /<small>Researcher<\/small>/);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ""), /\d|undefined|NaN|论文|线索/);
  assert.equal(tree.props.children.length, 2);
  tree.props.children[1].props.onClick();
  assert.deepEqual(selected, ["b"]);
});

test("navigation uses named functional icons and keeps labels, counters and active-page semantics", () => {
  const start = app.indexOf('  const navItems:');
  const end = app.indexOf('  const activeNav', start);
  const t = { today: "今日", threads: "研究路线", learn: "学习路径", library: "论文库", memory: "研究记忆" };
  const navItems = new Function("t", compile(app.slice(start, end)) + "\nreturn navItems;")(t);
  assert.deepEqual(navItems.map((item) => item.mark), ["today", "route", "reading", "library", "notes"]);
  const navStart = app.indexOf('<nav className="v2-nav"');
  const nav = app.slice(navStart, app.indexOf("</nav>", navStart) + 6);
  const html = renderToStaticMarkup(evaluate(nav, { navItems, t, activeNav: "today", todayNavigationCount: 2, historyPapers: [{}, {}, {}], locale: "zh", compactNavCount: String, navigate: () => {} }));
  assert.match(html, /aria-current="page"/);
  assert.match(html, /今日<b>2<\/b>/);
  assert.match(html, /3 篇已保存论文/);
  assert.equal((html.match(/data-icon=/g) || []).length, 5);
  assert.doesNotMatch(app, /<span>π<\/span>|<span>◎<\/span>|>π \{|>◎ \{|index \+ 3|17 \+ index \* 5/);
});
