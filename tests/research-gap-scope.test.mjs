import assert from "node:assert/strict";
import test from "node:test";
import { researchGapQuestion } from "../lib/research-gap-scope.mjs";
import { readFile } from "node:fs/promises";
import ts from "typescript";

test("gap projection never repeats field-wide absence claims, even with legitimate source IDs", () => {
  for (const raw of [
    "当前证据缺少经典工作。因此，高斯极值性在多终端下的传输证明仍属空白。",
    "随机局域化方法尚未被证明能将薄壳控制转化为与维度无关的谱隙。",
    "No known work has solved this problem.",
  ]) {
    const zh = researchGapQuestion(raw, "Gaussian extremality transport", "zh");
    assert.equal(zh, "检索“Gaussian extremality transport”能找到哪些文献，补充当前路线的证据？");
    assert.doesNotMatch(zh, /空白|尚未被证明|No known/);
    assert.equal(researchGapQuestion(zh, "Gaussian extremality transport", "zh"), zh);
    assert.match(researchGapQuestion(raw, "Gaussian extremality transport", "en"), /^Which papers/);
  }
});

test("missing gaps stay absent and malformed queries do not leak into the question", () => {
  assert.equal(researchGapQuestion("", "Gaussian transport"), "");
  assert.equal(researchGapQuestion(null, "Gaussian transport"), "");
  for (const query of [null, {}, "x".repeat(221), "中文检索"]) {
    assert.equal(researchGapQuestion("unsupported claim", query), "还需要哪些文献，才能核对当前路线的证据？");
  }
});

test("actual route write and legacy read boundaries preserve source IDs and query without mutating history", async () => {
  const source = await readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8");
  const start = source.indexOf("function sanitizeIntelligence(");
  const end = source.indexOf("function publicationDate(", start);
  assert.ok(start > 0 && end > start);
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const { sanitizeIntelligence, parseStoredIntelligence } = new Function("researchGapQuestion", "cleanText", "boundedScore", "MODEL", `${code}; return {sanitizeIntelligence, parseStoredIntelligence};`)(researchGapQuestion, (v) => String(v).trim(), (v) => v, "test");
  const draft = { directionKey: "route", assessmentZh: "研判", assessmentEn: "Assessment", opportunityZh: "机会", opportunityEn: "Opportunity", watchSignalZh: "信号", watchSignalEn: "Signal", evidenceGapZh: "整个领域尚未解决。", evidenceGapEn: "Nobody has solved this.", confidence: 65, evidenceCanonicalIds: ["c", "invented"], nextSearchQuery: "Gaussian extremality transport" };
  const original = structuredClone(draft);
  const result = sanitizeIntelligence(draft, "route", new Set(["c"]));
  assert.match(result.evidenceGapEn, /^Which papers/);
  assert.deepEqual(result.evidenceCanonicalIds, ["c"]);
  assert.equal(result.nextSearchQuery, draft.nextSearchQuery);
  assert.deepEqual(draft, original);
  assert.equal(sanitizeIntelligence(draft, "route", new Set()), null);
  const row = { intelligence_json: JSON.stringify(draft), intelligence_updated_at: "2026-09-08" };
  const saved = row.intelligence_json;
  assert.equal(parseStoredIntelligence(row).evidenceGapZh, result.evidenceGapZh);
  assert.equal(row.intelligence_json, saved);
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(monitor, /evidenceGapEn: researchGapQuestion\(parsed.evidenceGapEn, parsed.nextSearchQuery, "en"\)/);
});
