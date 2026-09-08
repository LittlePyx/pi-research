import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { briefPaperEntries, briefRunStatus, datedBriefText, coverageIdentity, scanDisplayProgress, scanFunnel } from '../lib/today-presentation.mjs';

test('Historical brief prose uses its own date in both languages without changing stored history', () => {
  const brief = {date:'2026-09-07',isCurrent:false,headlineZh:'今天累计 4 篇',overviewEn:"Earlier today. Today's results."};
  const before = structuredClone(brief);
  assert.equal(datedBriefText(brief.headlineZh,brief),'2026-09-07累计 4 篇');
  assert.equal(datedBriefText(brief.overviewEn,brief),'Earlier on 2026-09-07. the 2026-09-07 results.');
  assert.equal(datedBriefText('今天 0 篇',{...brief,isCurrent:true}),'今天 0 篇');
  assert.deepEqual(brief,before);
});

test('Brief status uses one saved metrics snapshot, not the union of historical watchlists', () => {
  const brief = {watchlistZh:['7 篇待核对','2 篇未通过','8 篇待核对','1 篇未通过'],
    metrics:{verificationPending:8,verificationFailed:1,deepDeferred:0}};
  const before=structuredClone(brief);
  assert.deepEqual(briefRunStatus(brief,'zh'),['8 篇待核对','1 篇证据未通过']);
  assert.deepEqual(briefRunStatus({...brief,metrics:{verificationPending:0}},'zh'),[]);
  assert.deepEqual(briefRunStatus({...brief,metrics:{}},'en'),[]);
  assert.deepEqual(briefRunStatus({...brief,metrics:{verificationPending:-1,deepDeferred:1}},'en'),['1 deferred for retry']);
  assert.deepEqual(brief,before);
});

test('Today keeps a zero-valued current job separate from the saved brief', () => {
  const brief = { metrics: { scanned: 360, screened: 59, deepReviewed: 14, recommended: 9 } };
  assert.deepEqual(scanFunnel({ discoveredCount: 0, reviewedCount: 0, deepCompletedCount: 0, recommendedCount: 0 }, brief), { scanned: 0, screened: 0, deepReviewed: 0, recommended: 0 });
  assert.equal(scanFunnel(null, brief).recommended, 9);
  assert.equal(scanFunnel({ reviewedCount: 59 }, brief).deepReviewed, null);
  assert.equal(scanFunnel(null, { metrics: { reviewed: 59 } }).deepReviewed, null);
});

test('Brief entries require real records, deduplicate IDs and retain original guidance positions', () => {
  const papers = Array.from({ length: 9 }, (_, i) => ({ id: String(i), userState: 'accepted' }));
  const before = structuredClone(papers);
  const entries = briefPaperEntries(['missing', ...papers.map(p => p.id), '0'], papers);
  assert.equal(entries.length, 9);
  assert.equal(entries.slice(0, 6).length, 6);
  assert.equal(entries[0].briefIndex, 1);
  assert.equal(entries[8].briefIndex, 9);
  assert.deepEqual(briefPaperEntries(['missing'], papers), []);
  assert.deepEqual(papers, before);
});

test('Active scans cannot display completion from a stale saved percentage', () => {
  assert.equal(scanDisplayProgress(true, true, 75, 100), 99);
  assert.equal(scanDisplayProgress(true, false, 30, 60), 60);
  assert.equal(scanDisplayProgress(false, false, 100, 100), 0);
  assert.equal(scanDisplayProgress(false, true, 0, 0), 100);
});

test('Coverage identity matches the database source and channel grouping', () => {
  const source = { sourceKey: 'research-route:gap', channel: 'route', newCandidates: 1 };
  assert.notEqual(coverageIdentity(source), coverageIdentity({ ...source, channel: 'learning' }));
  assert.equal(coverageIdentity(source), coverageIdentity({ ...source, newCandidates: 2 }));
});

test('Today renders actual entries and one-scope counts without replacing activity history', () => {
  const source = readFileSync(new URL('../app/research-app.tsx', import.meta.url), 'utf8');
  assert.match(source, /visibleBriefEntries\.map\(\(\{ paper, briefIndex \}/);
  assert.match(source, /dailySignals\[briefIndex\]/);
  assert.match(source, /runFunnel\.recommended \?\? "—"/);
  assert.match(source, /key=\{coverageIdentity\(source\)\}/);
  assert.doesNotMatch(source, /index === 0 && monitor\?\.dailyBrief/);
  assert.doesNotMatch(source, /Math\.max\(dailyBriefPapers\.length, dailySignals\.length/);
});
