import assert from "node:assert/strict";

import { parseArxivAtom } from "../lib/discovery/arxiv.ts";

const headers = { Accept: "*/*", "User-Agent": "PiResearch/1.0 (live source contract check)" };

async function checkJson(name, url, validate, optional = false) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    validate(data);
    return { name, status: "healthy" };
  } catch (error) {
    if (!optional) throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    return { name, status: "degraded", reason: error instanceof Error ? error.message : String(error) };
  }
}

async function checkArxiv() {
  const endpoint = new URL("https://export.arxiv.org/api/query");
  endpoint.searchParams.set("search_query", 'all:"information theory"');
  endpoint.searchParams.set("start", "0");
  endpoint.searchParams.set("max_results", "1");
  endpoint.searchParams.set("sortBy", "submittedDate");
  endpoint.searchParams.set("sortOrder", "descending");
  const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`arXiv: HTTP ${response.status}`);
  const xml = await response.text();
  assert.match(xml, /<feed\b/i);
  const records = parseArxivAtom(xml);
  assert.ok(records.length > 0);
  assert.ok(records[0].title && records[0].url && records[0].publishedAt);
  return { name: "arXiv", status: "healthy" };
}

const results = await Promise.all([
  checkJson(
    "Crossref journal",
    "https://api.crossref.org/journals/0018-9448/works?filter=from-pub-date:2025-01-01&rows=1&select=DOI,title,type,container-title,published",
    (data) => assert.ok(Array.isArray(data?.message?.items) && data.message.items.length > 0),
  ),
  checkJson(
    "OpenAlex",
    "https://api.openalex.org/works?search=information%20theory&filter=is_paratext:false&per-page=1&select=id,doi,display_name,publication_date",
    (data) => assert.ok(Array.isArray(data?.results) && data.results.length > 0),
  ),
  checkJson(
    "Semantic Scholar",
    "https://api.semanticscholar.org/graph/v1/paper/search?query=information%20theory&limit=1&fields=paperId,title,abstract,publicationDate",
    (data) => assert.ok(Array.isArray(data?.data) && data.data.length > 0),
    true,
  ),
  checkArxiv(),
]);

const healthy = results.filter((result) => result.status === "healthy").length;
assert.ok(healthy >= 3, `Expected at least three healthy discovery providers, received ${healthy}`);
process.stdout.write(`${JSON.stringify({ healthy, providers: results }, null, 2)}\n`);
