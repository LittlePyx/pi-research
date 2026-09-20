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

  assert.match(page, /import ResearchApp from "..\/research-app"/);
  assert.match(page, /<ResearchApp demo user=/);
  assert.match(app, /不影响正式资料/);
  assert.doesNotMatch(page, /fetch\(|\/api\//);
  assert.ok((data.match(/id: "/g) || []).length >= 14);
  assert.match(data, /Isoperimetric Problems for Convex Bodies and a Localization Lemma/);
  assert.match(data, /An Almost Constant Lower Bound of the Isoperimetric Coefficient/);
  assert.match(data, /Channel Coding Rate in the Finite Blocklength Regime/);
  assert.match(app, /<a className="v2-demo-entry" href="\/demo">/);
  assert.match(app, /"演示空间" : "Demo workspace"/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.doesNotMatch(css, /\.shell|\.paperList|\.hero/);
});
