import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { hasNamedResearchClassicQuery, learningClassicSearchQuery, matchesResearchClassicRecord, selectResearchClassicSeeds } from "../lib/research-classic-seeds.ts";

const shannon = selectResearchClassicSeeds({ titleEn: "Shannon maximum entropy theorem Gaussian distribution covariance constraint", searchQueries: [] })[0];
const kls = selectResearchClassicSeeds({ titleEn: "Foundations of the KLS Conjecture Isoperimetric Constants original paper", searchQueries: [] })[0];

test("missing original stages get stable exact queries without replacing frontier work or refinements", () => {
  for (const seed of [shannon, kls]) {
    assert.ok(seed);
    const stage = { kind: "foundation", titleEn: seed.id === shannon.id ? "Shannon maximum entropy Gaussian theorem" : "Foundations of the KLS Conjecture" };
    assert.equal(learningClassicSearchQuery(stage, stage.titleEn + " original paper"), seed.title);
    const refined = seed.title + " seminal primary source exact theorem";
    assert.equal(learningClassicSearchQuery(stage, refined), refined);
    assert.equal(hasNamedResearchClassicQuery(refined), true);
    assert.deepEqual(selectResearchClassicSeeds({ titleEn: refined, searchQueries: [refined] }).map((item) => item.id), [seed.id]);
    assert.equal(learningClassicSearchQuery({ ...stage, kind: "frontier" }, stage.titleEn), null);
  }
  assert.equal(learningClassicSearchQuery({ kind: "foundation", titleEn: "Uncatalogued named theorem" }, "Uncatalogued original theorem"), null);
  assert.equal(learningClassicSearchQuery({ kind: "foundation", titleEn: "Wasserstein metric geometry" }, "KLS conjecture stochastic localization"), null,
    "a broad route query cannot overwrite a different named stage");
  assert.equal(hasNamedResearchClassicQuery("KLS conjecture recent frontier results"), false,
    "ordinary learning discovery must retain frontier and uncatalogued searches");
});

test("known original identities reject related papers, same-title reprints and wrong authors", () => {
  for (const seed of [shannon, kls]) {
    const exact = { title: seed.title, authors: seed.authorSignal, publishedAt: `${seed.publicationYear}-01-01` };
    assert.equal(matchesResearchClassicRecord(seed, exact), true);
    assert.equal(matchesResearchClassicRecord(seed, { ...exact, title: `${seed.title}: recent developments` }), false);
    assert.equal(matchesResearchClassicRecord(seed, { ...exact, publishedAt: "2026-01-01" }), false);
    assert.equal(matchesResearchClassicRecord(seed, { ...exact, authors: "Different author" }), false);
    assert.equal(matchesResearchClassicRecord(seed, { ...exact, publishedAt: null }), false);
  }
});

async function routeFunctions(dependencies = {}) {
  const source = await readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8");
  const section = source.slice(source.indexOf("function roleDates("), source.indexOf("async function discoverCandidates("));
  const compiled = ts.transpileModule(section, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const injected = {
    cleanText: (value) => String(value || "").replace(/\s+/g, " ").trim(),
    selectResearchClassicSeeds, matchesResearchClassicRecord,
    NON_PAPER_PHRASES: /^(?:erratum|correction)\b/i,
    normalizeItem: async (item, directionKey, proposedRole) => ({ ...item, directionKey, proposedRole, source: "crossref" }),
    ...dependencies,
  };
  return new Function(...Object.keys(injected), `${compiled}\nreturn { roleDates, fetchCrossrefClassic, fetchOpenAlexClassic, discoverClassicRescueCandidates };`)(...Object.values(injected));
}

test("real classic URL builders never apply rolling role dates to 1948 or old milestones", async () => {
  const urls = [];
  const capture = async (url) => { urls.push(url); return Response.json({ message: { items: [] }, results: [] }); };
  const functions = await routeFunctions({ fetch: capture, fetchExternalSource: capture });
  assert.ok(functions.roleDates("foundation").from < "1948-01-01");
  await functions.fetchCrossrefClassic(shannon.title);
  await functions.fetchOpenAlexClassic({}, "Mutual Information and Minimum Mean-Square Error in Gaussian Channels");
  assert.equal(urls[0].searchParams.get("query.title"), shannon.title);
  assert.equal(urls[0].searchParams.has("filter"), false);
  assert.equal(urls[1].searchParams.get("filter"), "is_paratext:false");
});

test("real retrieval keeps a partial original record and honestly reports failed enrichment", async () => {
  let calls = 0;
  const original = { title: shannon.title, authors: "C. E. Shannon", publishedAt: "1948-07-01", canonicalId: "doi:fixture-original", abstractText: "", citationCount: 100 };
  const functions = await routeFunctions({
    fetch: async () => { calls++; return Response.json({ message: { items: [original, { ...original, title: "Generalized Gaussian distributions via maximum entropy" }] } }); },
    fetchExternalSource: async () => { calls++; return new Response("rate limited", { status: 429 }); },
  });
  const result = await functions.discoverClassicRescueCandidates({}, { key: "track", titleEn: shannon.title, searchQueries: [shannon.title] });
  assert.equal(calls, 2);
  assert.deepEqual(result.candidates.map((item) => item.canonicalId), [original.canonicalId]);
  assert.deepEqual(result.sources.map((source) => source.status), ["ok", "failed"]);
  assert.deepEqual(result.sources[0].candidateCanonicalIds, [original.canonicalId]);
  assert.equal(result.topicalRejectedCount, 1);
  assert.match(result.errors[0], /429/);
});

test("an empty first provider falls through to the SAME original work, with bounded calls", async () => {
  const searched = [];
  const functions = await routeFunctions({
    fetch: async (url) => { searched.push(url.searchParams.get("query.title")); return Response.json({ message: { items: [] } }); },
    fetchExternalSource: async (url) => {
      searched.push(url.searchParams.get("search"));
      return Response.json({ results: [{ title: kls.title, doi: "https://doi.org/10.1007/bf02574061", publication_date: "1995-01-01",
        authorships: [{ author: { display_name: "Ravi Kannan" } }], abstract_inverted_index: { "Fixture abstract evidence": [0] } }] });
    },
  });
  const result = await functions.discoverClassicRescueCandidates({}, { key: "track", titleEn: kls.title, searchQueries: [kls.title] });
  assert.deepEqual(searched, [kls.title, kls.title]);
  assert.deepEqual(result.sources.map((source) => source.status), ["empty", "ok"]);
  assert.equal(result.candidates[0].classicRescueSeedId, kls.id);
  assert.equal(result.candidates[0].source, "openalex");
  assert.equal(result.errors.length, 0);
});
