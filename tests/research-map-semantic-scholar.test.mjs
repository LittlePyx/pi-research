import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routePath = new URL("../app/api/research-map/route.ts", import.meta.url);

test("research map reuses the shared Semantic Scholar throttle and preserves partial cache semantics", async () => {
  const route = await readFile(routePath, "utf8");
  const start = route.indexOf("async function fetchScholarlyEdges");
  const end = route.indexOf("async function generatePaperNetworkEdges", start);
  assert.ok(start >= 0 && end > start, "scholarly edge function should remain inspectable");
  const scholarlyFetch = route.slice(start, end);

  assert.match(route, /import \{ fetchSemanticScholar \} from "\.\.\/\.\.\/\.\.\/lib\/semantic-scholar"/);
  assert.match(scholarlyFetch, /fetchSemanticScholar\(endpoint, options, \{/);
  assert.match(scholarlyFetch, /database,/);
  assert.match(scholarlyFetch, /spaceId,/);
  assert.match(scholarlyFetch, /scopeKey: `research-map:verified:/);
  assert.match(scholarlyFetch, /feature: "research-map"/);
  assert.doesNotMatch(scholarlyFetch, /\bfetch\(endpoint, options\)/);
  assert.doesNotMatch(scholarlyFetch, /setTimeout\([^)]*900/);

  assert.match(route, /cachedWithinCoverage/);
  assert.match(route, /sources\.push\("semantic-scholar-cache"\)/);
  assert.match(route, /const status = errors\.length \? \(allEdges\.length \? "partial" : "error"\) : "ready"/);
  assert.match(route, /coverageRevision: \(stored\.coverage\?\.coverageRevision \|\| 0\) \+ 1/);
  assert.match(route, /fetchScholarlyEdges\(database, space\.id, papers\)/);
});
