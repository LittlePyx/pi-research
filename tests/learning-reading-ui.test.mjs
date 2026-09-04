import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as learningHelpers from "../lib/learning-path.ts";

const app = await readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8");
const component = await readFile(new URL("../app/components/learning-resource-list.tsx", import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const mod = { exports: {} };
const require = createRequire(import.meta.url);
new Function("require", "module", "exports", compile(component))((name) => name.endsWith("lib/learning-path") ? learningHelpers : require(name), mod, mod.exports);
const { LearningResourceList } = mod.exports;

function render(locale, openingId = null) {
  const events = [];
  const resources = [
    { id: "monitor:paper-a", title: "Real paper", authors: "Author", url: "https://doi.org/10.123/example", source: "daily-scan" },
    { id: "track:legacy", title: "Legacy paper", url: "https://example.org/legacy" },
    { id: "monitor:unsafe", title: "Unsafe URL", url: "javascript:alert(1)" },
  ];
  const tree = LearningResourceList({ resources, locale, openingId, onOpen: (resource) => events.push(resource.id), signals: () => ["90", "unread"] });
  const buttons = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (node.type === "button") buttons.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return { html: renderToStaticMarkup(tree), buttons, events };
}

test("learning papers expose exact internal identities and separate safe original links in both languages", () => {
  for (const locale of ["zh", "en"]) {
    const { html, buttons, events } = render(locale);
    assert.equal((html.match(/<article/g) || []).length, 3);
    assert.equal((html.match(/<a /g) || []).length, 2);
    assert.doesNotMatch(html, /javascript:/);
    assert.match(html, locale === "zh" ? /阅读与笔记/ : /Read &amp; note/);
    assert.equal(buttons.length, 2, "legacy title-only resources cannot open an unrelated paper");
    buttons[0].props.onClick();
    assert.deepEqual(events, ["monitor:paper-a"]);
    assert.ok(render(locale, "monitor:paper-a").buttons.every((button) => button.props.disabled));
  }
  assert.equal(learningHelpers.learningResourcePaperId({ id: "monitor:" }), null);
  assert.equal(learningHelpers.learningResourcePaperId({ id: "track:legacy" }), null);
});

function readingHarness(fetch) {
  const source = app.slice(app.indexOf("  const updateReadingProgress = async"), app.indexOf("  const openMonitorPaper ="));
  assert.ok(source.includes("readingWriteRef"));
  const paper = { id: "paper", readingStatus: "unread", readingNote: "original" };
  const state = { selected: paper, monitor: { papers: [paper], historyPapers: [paper] }, toast: "", reload: 0, saving: false };
  const readingWriteRef = { current: null };
  const paperNetworkSpaceRef = { current: "space-a" };
  const dependencies = {
    fetch, readingWriteRef, paperNetworkSpaceRef, activeSpace: { id: "space-a" }, locale: "en",
    setReadingSaving: (value) => { state.saving = value; }, setReadingMemoryAnalyzing: () => {},
    setSelectedMonitorPaper: (update) => { state.selected = update(state.selected); },
    setMonitor: (update) => { state.monitor = typeof update === "function" ? update(state.monitor) : update; },
    setLearningReloadNonce: (update) => { state.reload = update(state.reload); },
    setToast: (value) => { state.toast = value; }, historyCountsFor: () => ({}), readingStatusLabel: (status) => status,
  };
  const update = new Function(...Object.keys(dependencies), compile(source) + "\nreturn updateReadingProgress;")(...Object.values(dependencies));
  return { state, update, paper, readingWriteRef, paperNetworkSpaceRef };
}

test("failed reading saves leave the displayed persisted state and learning path unchanged", async () => {
  const harness = readingHarness(async () => new Response("failed", { status: 500 }));
  await harness.update(harness.paper, "mastered", "new note");
  assert.equal(harness.state.selected.readingStatus, "unread");
  assert.equal(harness.state.selected.readingNote, "original");
  assert.equal(harness.state.reload, 0);
  assert.equal(harness.state.saving, false);
  assert.match(harness.state.toast, /Could not save/);
});

test("reading saves are single-flight and update the learning path only after persistence", async () => {
  let finish;
  let requests = 0;
  const harness = readingHarness(() => { requests++; return new Promise((resolve) => { finish = resolve; }); });
  const pending = harness.update(harness.paper, "mastered", "new note");
  assert.equal(harness.state.selected.readingStatus, "unread");
  assert.equal(harness.state.saving, true);
  await harness.update(harness.paper, "read");
  assert.equal(requests, 1);
  finish(Response.json({ ok: true }));
  await pending;
  assert.equal(harness.state.selected.readingStatus, "mastered");
  assert.equal(harness.state.monitor.historyPapers[0].readingNote, "new note");
  assert.equal(harness.state.reload, 1);
  assert.equal(harness.state.saving, false);
});

test("a late reading response cannot alter the next workspace or clear its pending write", async () => {
  let finish;
  const harness = readingHarness(() => new Promise((resolve) => { finish = resolve; }));
  const pending = harness.update(harness.paper, "mastered", "old workspace note");
  harness.paperNetworkSpaceRef.current = "space-b";
  const newWrite = {};
  harness.readingWriteRef.current = newWrite;
  harness.state.selected = { id: "new-paper", readingStatus: "reading" };
  finish(Response.json({ ok: true }));
  await pending;
  assert.deepEqual(harness.state.selected, { id: "new-paper", readingStatus: "reading" });
  assert.equal(harness.state.reload, 0);
  assert.equal(harness.state.toast, "");
  assert.equal(harness.readingWriteRef.current, newWrite);
});

test("learning detail navigation returns to the path and retains original-resource fallback", () => {
  const open = app.slice(app.indexOf("  const openLearningResource ="), app.indexOf("  const shareSnapshot ="));
  assert.match(open, /paperId=\$\{encodeURIComponent\(paperId\)\}/);
  assert.match(open, /paperNetworkSpaceRef\.current !== spaceId/);
  assert.match(open, /openMonitorPaper\(paper, "learn"\)/);
  assert.match(app, /navigate\(paperReturnView\)/);
  assert.match(app, /paperReturnView === "learn" \? t\.learn/);
  assert.match(app, /<LearningResourceList resources=\{activeLearningStep\.resources\}/);
});

test("supplementary history remains readable without being presented as the required stage reading", () => {
  const tree = LearningResourceList({ resources: [{ id: "monitor:history", title: "Preserved paper", url: "https://example.org/paper" }], locale: "zh", openingId: null, onOpen: () => {}, signals: () => [], supplementary: true });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Preserved paper/);
  assert.match(html, /阅读与笔记/);
  assert.doesNotMatch(html, /现在读/);
  assert.match(app, /补充阅读（不计入本阶段）/);
});
