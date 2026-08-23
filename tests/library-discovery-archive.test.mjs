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

test("library overview counts the archive instead of repeating recommendation inbox metrics", () => {
  assert.match(app, /const libraryArchiveCounts = useMemo/);
  assert.match(app, /all: historyPapers\.length/);
  assert.match(app, /libraryArchiveCounts\.all}<\/strong><b>{locale === "zh" \? "全部发现"/);
  assert.match(app, /"已完成评审"/);
  assert.match(app, /"待处理推荐"/);
  assert.doesNotMatch(app, /monitor\?\.historyCounts\?\.unseen \|\| 0}<\/strong><b>{t\.unseen/);
});
