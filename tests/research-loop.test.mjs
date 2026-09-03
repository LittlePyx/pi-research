import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("discovery branches persist cursors, yield, and cooldown state", async () => {
  const [monitor, schema] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /zeroYieldStreak/);
  assert.match(schema, /cooldownUntil/);
  assert.match(schema, /totalCandidateCount/);
  assert.match(monitor, /shouldRunDiscoveryQuery/);
  assert.match(monitor, /branchStatus = error \? "error" : cooldownUntil \? "cooling"/);
  assert.match(monitor, /explorationLedger/);
});

test("scan jobs measure new, duplicate, reviewed, recommended, and rejected papers", async () => {
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(monitor, /new_candidate_count/);
  assert.match(monitor, /duplicate_count/);
  assert.match(monitor, /rejected_count/);
  assert.match(monitor, /operationsDashboard/);
  assert.match(monitor, /tokensPerRecommendation/);
});

test("reading notes are deduplicated before LLM memory synthesis", async () => {
  const [library, memory, ask, monitor] = await Promise.all([
    readFile(new URL("../app/api/library/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/preference-memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ask/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(library, /contentHash/);
  assert.match(library, /existing\?\.note_hash === noteHash/);
  assert.match(library, /research-memory editor/);
  assert.match(library, /sourceType: "reading_note"/);
  assert.match(memory, /layer: PreferenceLayer/);
  assert.match(ask, /Insights distilled from the researcher's own reading notes/);
  assert.match(monitor, /FROM paper_reading_memories WHERE space_id/);
});

test("research memory stays visible while operational quality telemetry stays internal", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /const SHOW_INTERNAL_QUALITY_UI = false/);
  assert.match(client, /SHOW_INTERNAL_QUALITY_UI && monitor\?\.operationsDashboard/);
  assert.match(client, /v2-reading-memory/);
  assert.match(client, /保存到研究记忆/);
  assert.match(styles, /Pi Research V16/);
});
