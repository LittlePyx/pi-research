import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const demoPageUrl = new URL("../app/demo/demo-workspace.tsx", import.meta.url);
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

  for (const label of ["今日", "研究", "学习", "论文库", "研究记忆", "概览", "材料", "问题与判断", "任务"]) assert.ok(page.includes(label));
  assert.match(page, /刷新后重置，不写入正式空间/);
  assert.match(page, /保存示例笔记/);
  assert.match(page, /不调用模型/);
  assert.match(page, /href="\/"/);
  assert.doesNotMatch(page, /fetch\(|\/api\//);
  assert.ok((data.match(/id: "/g) || []).length >= 14);
  assert.match(data, /Isoperimetric Problems for Convex Bodies and a Localization Lemma/);
  assert.match(data, /An Almost Constant Lower Bound of the Isoperimetric Coefficient/);
  assert.match(data, /Channel Coding Rate in the Finite Blocklength Regime/);
  assert.match(app, /<a className="v2-demo-entry" href="\/demo">/);
  assert.match(app, /"演示空间" : "Demo workspace"/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /\.compare \{ grid-template-columns:1fr; \}/);
});
