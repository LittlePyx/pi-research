import assert from "node:assert/strict";
import test from "node:test";
import { researchGapQuestion, researchGapSubject, scopedSynthesisGap } from "../lib/research-gap-scope.mjs";
import { sanitizeResearchSynthesisStatements, primaryResearchSynthesisGap, researchSynthesisDiscoveryQuery } from "../lib/research-synthesis.ts";
import { readFile } from "node:fs/promises";
import ts from "typescript";

test("gap projection never repeats field-wide absence claims, even with legitimate source IDs", () => {
  for (const raw of [
    "当前证据缺少经典工作。因此，高斯极值性在多终端下的传输证明仍属空白。",
    "随机局域化方法尚未被证明能将薄壳控制转化为与维度无关的谱隙。",
    "No known work has solved this problem.",
  ]) {
    const zh = researchGapQuestion(raw, "Gaussian extremality transport", "zh");
    assert.equal(zh, "关于“Gaussian extremality transport”，当前材料有哪些支持或反例？");
    assert.doesNotMatch(zh, /空白|尚未被证明|No known/);
    assert.equal(researchGapQuestion(zh, "Gaussian extremality transport", "zh"), zh);
    assert.match(researchGapQuestion(raw, "Gaussian extremality transport", "en"), /^What support or counterexamples/);
  }
});

test("missing gaps stay absent and malformed queries do not leak into the question", () => {
  assert.equal(researchGapQuestion("", "Gaussian transport"), "");
  assert.equal(researchGapQuestion(null, "Gaussian transport"), "");
  for (const query of [null, {}, "x".repeat(97), "Gaussian AND transport", "全领域尚未解决", "No known proof"]) {
    assert.equal(researchGapQuestion("unsupported claim", query), "当前材料有哪些支持或反例，还需要核对哪些文献？");
  }
  assert.equal(researchGapSubject("无维谱隙的显式界"), "无维谱隙的显式界");
});

test("actual route write and legacy read boundaries preserve source IDs and query without mutating history", async () => {
  const source = await readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8");
  const start = source.indexOf("function sanitizeIntelligence(");
  const end = source.indexOf("function publicationDate(", start);
  assert.ok(start > 0 && end > start);
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const { sanitizeIntelligence, parseStoredIntelligence } = new Function("researchGapQuestion", "researchGapSubject", "cleanText", "boundedScore", "MODEL", `${code}; return {sanitizeIntelligence, parseStoredIntelligence};`)(researchGapQuestion, researchGapSubject, (v) => String(v).trim(), (v) => v, "test");
  const draft = { directionKey: "route", assessmentZh: "研判", assessmentEn: "Assessment", opportunityZh: "机会", opportunityEn: "Opportunity", watchSignalZh: "信号", watchSignalEn: "Signal", evidenceGapZh: "整个领域尚未解决。", evidenceGapEn: "Nobody has solved this.", confidence: 65, evidenceCanonicalIds: ["c", "invented"], nextSearchQuery: "Gaussian extremality transport" };
  const original = structuredClone(draft);
  const result = sanitizeIntelligence(draft, "route", new Set(["c"]));
  assert.match(result.evidenceGapEn, /^What support or counterexamples/);
  assert.deepEqual(result.evidenceCanonicalIds, ["c"]);
  assert.equal(result.nextSearchQuery, draft.nextSearchQuery);
  assert.deepEqual(draft, original);
  assert.equal(sanitizeIntelligence(draft, "route", new Set()), null);
  const row = { intelligence_json: JSON.stringify(draft), intelligence_updated_at: "2026-09-08" };
  const saved = row.intelligence_json;
  assert.equal(parseStoredIntelligence(row).evidenceGapZh, result.evidenceGapZh);
  assert.equal(row.intelligence_json, saved);
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(monitor, /evidenceGapEn: researchGapQuestion\(parsed.evidenceGapEn, parsed.gapSubjectEn, "en"\)/);
  const legacy = parseStoredIntelligence({ ...row, title_zh: "随机局域化与谱隙", title_en: "Stochastic localization and spectral gaps" });
  assert.match(legacy.evidenceGapZh, /随机局域化与谱隙/);
  assert.doesNotMatch(legacy.evidenceGapZh, /Gaussian extremality/);
  const specific = sanitizeIntelligence({ ...draft, gapSubjectZh: "无维谱隙的显式界", gapSubjectEn: "Explicit dimension-free spectral bounds" }, "route", new Set(["c"]));
  assert.equal(parseStoredIntelligence({ ...row, intelligence_json: JSON.stringify(specific) }).evidenceGapZh, specific.evidenceGapZh);
  assert.equal(specific.evidenceScope, "current_materials");
});

test("multiple synthesis gaps keep distinct topics and sources without sharing the primary query", () => {
  const sources = new Map([["a", { paperId: "pa", evidenceLevel: "abstract" }], ["b", { paperId: "pb", evidenceLevel: "abstract" }]]);
  const drafts = [
    { kind: "evidence_gap", titleZh: "无维谱隙的显式界", titleEn: "Explicit spectral bounds", textZh: "尚未被证明。", textEn: "No known proof.", sourceClaimIds: ["a"], confidence: 60 },
    { kind: "evidence_gap", titleZh: "非凸条件下的鞅方法", titleEn: "Martingale methods without convexity", textZh: "整个领域空白。", textEn: "An unexplored field.", sourceClaimIds: ["b"], confidence: 50 },
  ];
  const before = structuredClone(drafts);
  const result = sanitizeResearchSynthesisStatements(drafts, sources);
  assert.equal(result.length, 2);
  assert.match(result[0].textZh, /无维谱隙的显式界/);
  assert.match(result[1].textZh, /非凸条件下的鞅方法/);
  assert.deepEqual(result.map((s) => s.sourcePaperIds), [["pa"], ["pb"]]);
  assert.equal(primaryResearchSynthesisGap(result), result[0]);
  assert.equal(researchSynthesisDiscoveryQuery("spectral gap explicit bounds", result), "spectral gap explicit bounds");
  assert.deepEqual(drafts, before);
  assert.deepEqual(result.map(scopedSynthesisGap), result);
  const unsafe = scopedSynthesisGap({ ...drafts[0], titleZh: "领域空白", titleEn: "Unsolved everywhere" });
  assert.doesNotMatch(unsafe.titleZh + unsafe.textZh, /空白/);
  assert.deepEqual(scopedSynthesisGap(unsafe), unsafe);
  const normal = { ...drafts[0], kind: "qualification" };
  assert.equal(scopedSynthesisGap(normal), normal);
});

test("the synthesis API read path scopes legacy gaps and keeps stale-source discovery disabled", async () => {
  const source = await readFile(new URL("../app/api/research-synthesis/route.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function readState(");
  const end = source.indexOf("async function usageCount(", start);
  assert.ok(start > 0 && end > start);
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const claims = ["a", "b"].map((id) => ({ claim_id: id, paper_id: `p${id}`, title: `Paper ${id}`, evidence_level: "abstract", evidence_quote: `Evidence ${id}` }));
  const saved = { id: "s", status: "ready", input_revision: "revision", next_search_query: "spectral gap bounds" };
  const rows = [
    { id: "ga", kind: "evidence_gap", title_zh: "谱隙界", title_en: "Spectral bounds", text_zh: "全领域空白", text_en: "No known proof", confidence: 60, source_claim_ids: '["a"]', source_paper_ids: '["pa"]' },
    { id: "gb", kind: "evidence_gap", title_zh: "鞅方法", title_en: "Martingale methods", text_zh: "尚未被证明", text_en: "Unsolved", confidence: 50, source_claim_ids: '["b"]', source_paper_ids: '["pb"]' },
  ];
  const before = structuredClone(rows);
  const db = { prepare: (sql) => {
    assert.match(sql, /^SELECT/);
    return { bind: () => ({ first: async () => saved, all: async () => ({ results: rows }) }) };
  } };
  const dependencies = { sourceClaims: async () => claims, researchSynthesisInputRevision: async () => "revision", sourceSummary: (items) => ({ paperCount: items.length, fulltextPaperCount: 0, claimCount: items.length }), scopedSynthesisGap, parseJsonArray: JSON.parse, primaryResearchSynthesisGap, researchSynthesisDiscoveryQuery, MODEL: "test" };
  const readState = new Function(...Object.keys(dependencies), `${code}; return readState;`)(...Object.values(dependencies));
  const result = (await readState(db, "space", "track")).synthesis;
  assert.equal(result.nextSearchSourceStatementId, "ga");
  assert.equal(result.nextSearchQuery, saved.next_search_query);
  assert.deepEqual(result.statements.map((s) => s.sources[0].claimId), ["a", "b"]);
  assert.match(result.statements[1].textZh, /鞅方法/);
  assert.doesNotMatch(JSON.stringify(result.statements), /全领域空白|尚未被证明|No known proof/);
  assert.deepEqual(rows, before);
  saved.input_revision = "old";
  assert.equal((await readState(db, "space", "track")).synthesis.nextSearchQuery, "");
  claims.pop();
  const withdrawn = (await readState(db, "space", "track")).synthesis;
  assert.equal(withdrawn.status, "empty");
  assert.deepEqual(withdrawn.statements, []);
});
