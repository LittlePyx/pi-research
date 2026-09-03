import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const demoPageUrl = new URL("../app/demo/page.tsx", import.meta.url);
const demoCssUrl = new URL("../app/demo/demo.module.css", import.meta.url);
const demoDataUrl = new URL("../lib/demo-research.ts", import.meta.url);
const appUrl = new URL("../app/research-app.tsx", import.meta.url);

test("the public demo opens a populated read-only research journey", async () => {
  const [page, css, data, app] = await Promise.all([
    readFile(demoPageUrl, "utf8"),
    readFile(demoCssUrl, "utf8"),
    readFile(demoDataUrl, "utf8"),
    readFile(appUrl, "utf8"),
  ]);

  assert.match(page, /应用数学 · 高维凸几何/);
  assert.match(page, /KLS 猜想与/);
  assert.match(page, /示例数据 · 只读/);
  assert.doesNotMatch(page, /不是从零开始|先看一条研究路线如何长出来|你可以直接查看 Pi 如何|不会修改你的研究空间/);
  assert.match(page, /id="today"/);
  assert.match(page, /id="routes"/);
  assert.match(page, /id="learn"/);
  assert.match(page, /id="library"/);
  assert.doesNotMatch(page, /fetch\(|\/api\//);
  assert.ok((data.match(/id: "/g) || []).length >= 14);
  assert.match(data, /Isoperimetric Problems for Convex Bodies and a Localization Lemma/);
  assert.match(data, /An Almost Constant Lower Bound of the Isoperimetric Coefficient/);
  assert.match(data, /Channel Coding Rate in the Finite Blocklength Regime/);
  assert.match(app, /href="\/demo"/);
  assert.match(app, /"演示空间" : "Demo workspace"/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /\.todayGrid \{ grid-template-columns: 1fr; \}/);
});
