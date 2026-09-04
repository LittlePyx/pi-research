import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = await readFile(new URL("../app/components/route-evolution-workbench.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const componentModule = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), componentModule, componentModule.exports);
const { RouteEvolutionWorkbench } = componentModule.exports;

function revision(status, version) {
  return {
    id: `revision-${version}`, status, version, model: "test-model", confidence: 80,
    titleZh: "研究方向", titleEn: "Research direction", summaryZh: "摘要", summaryEn: "Summary",
    previousTitleZh: "原方向", previousTitleEn: "Previous direction", previousSummaryZh: "原摘要", previousSummaryEn: "Previous summary",
    searchQueries: ["query"], previousSearchQueries: ["previous"], rationaleZh: "理由", rationaleEn: "Reason",
    sourcePapers: [{ paperId: "paper", title: "Paper evidence", authors: "Author", venue: "Journal", publishedAt: "2020-01-01" }],
    sourceStatements: [{ statementId: "statement", titleZh: "推断结论", titleEn: "Inference", textZh: "推断内容", textEn: "Inference detail" }],
    sourcePaperIds: ["paper"], sourceStatementIds: ["statement"], updatedAt: "2026-09-04 00:00:00",
  };
}

function render(overrides = {}) {
  const events = [];
  const tree = RouteEvolutionWorkbench({
    track: { id: "track", confirmedEvidenceCount: 1, routeRevisions: [revision("proposed", 2), revision("confirmed", 1)] },
    locale: "zh", action: null, formatNotificationTime: (value) => value,
    onPropose: () => events.push(["propose"]), onDecision: (...args) => events.push(args), ...overrides,
  });
  const buttons = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (node.type === "button") buttons.push(node);
    visit(node.props?.children);
  };
  visit(tree);
  return { html: renderToStaticMarkup(tree), buttons, events };
}

test("extracted route revisions retain separate evidence, history and exact decision callbacks", () => {
  const { html, buttons, events } = render();
  assert.match(html, /已确认论文证据/);
  assert.match(html, /Pi 跨论文综合（推断）/);
  assert.match(html, /Paper evidence/);
  assert.match(html, /推断内容/);
  assert.match(html, /路线版本历史/);
  assert.match(html, /当前正式版本/);
  assert.equal(buttons.length, 3);
  buttons.forEach((button) => button.props.onClick());
  assert.deepEqual(events, [["propose"], ["revision-2", "dismiss"], ["revision-2", "confirm"]]);
});

test("busy and evidence-empty revisions keep their original disabled actions", () => {
  assert.ok(render({ action: "evolution-confirm:revision-2" }).buttons.every((button) => button.props.disabled));
  const empty = render({ track: { id: "track", confirmedEvidenceCount: 0, routeRevisions: [] } });
  assert.match(empty.html, /还没有足够的正式证据/);
  assert.equal(empty.buttons.length, 1);
  assert.equal(empty.buttons[0].props.disabled, true);
});

test("English rendering retains the same confirmation boundary and history", () => {
  const { html, buttons } = render({ locale: "en" });
  assert.match(html, /Confirmed paper evidence/);
  assert.match(html, /Pi cross-paper synthesis \(inferred\)/);
  assert.match(html, /Route version history/);
  assert.match(html, /Only confirmation replaces the formal route definition/);
  assert.equal(buttons.length, 3);
  assert.doesNotMatch(source, /\bfetch\(|localStorage|useEffect/);
});
