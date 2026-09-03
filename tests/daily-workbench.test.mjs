import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("LLM review produces evidence-disciplined reading intelligence", async () => {
  const [monitor, schema] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /recommendationTier/);
  assert.match(monitor, /problemZh\/En, methodZh\/En, contributionZh\/En, limitationsZh\/En/);
  assert.match(monitor, /metadata is insufficient instead of inventing/);
  assert.match(schema, /researchQuestionsZh/);
  assert.match(schema, /readDepth/);
});

test("daily discovery can follow authors and measure source performance", async () => {
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(monitor, /trackedAuthors/);
  assert.match(monitor, /query\.author/);
  assert.match(monitor, /discoveryPerformance/);
  assert.match(monitor, /sourcePerformance/);
});

test("library keeps reading progress and exports citation-manager formats", async () => {
  const [library, client] = await Promise.all([
    readFile(new URL("../app/api/library/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(library, /paper_reading_progress/);
  assert.match(library, /application\/x-bibtex/);
  assert.match(library, /application\/x-research-info-systems/);
  assert.match(client, /v2-daily-paper-queue/);
  assert.match(client, /v2-today-more-compact/);
  assert.match(client, /v2-paper-analysis/);
  assert.match(client, /RIS \/ Zotero/);
});

test("research direction intelligence identifies evidence gaps", async () => {
  const [route, client] = await Promise.all([
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /evidenceGapZh/);
  assert.match(route, /nextSearchQuery/);
  assert.match(route, /current route cannot yet establish/);
  assert.match(client, /证据缺口/);
});
