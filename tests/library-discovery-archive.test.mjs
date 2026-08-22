import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const monitor = readFileSync(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../app/research-app.tsx", import.meta.url), "utf8");

test("the paper library keeps the discovery archive separate from the recommendation inbox", () => {
  assert.match(monitor, /WHERE p\.space_id = \?\s+ORDER BY p\.discovered_at DESC, i\.quality_score DESC LIMIT 2000/);
  assert.match(monitor, /const historyPapers = papers\.results\.map\(\(paper\) => toPaper\(paper, now\)\)/);
  assert.match(monitor, /const recommendationHistoryPapers = historyPapers\.filter/);
  assert.match(monitor, /all: recommendationHistoryPapers\.length/);
});

test("archived discoveries are visible without being mislabeled as recommendations", () => {
  assert.match(app, /useState<LibraryFilter>\("all"\)/);
  assert.match(app, /"全部发现"/);
  assert.match(app, /"发现归档"/);
  assert.match(app, /"已评审归档"/);
  assert.match(app, /不等同于推荐/);
  assert.match(app, /if \(libraryFilter === "inbox" && !belongsToRecommendationInbox\) return false/);
});
