import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { briefPaperEntries, remainingBriefEntries, briefRunStatus, datedBriefText, coverageIdentity, scanDisplayProgress, scanFunnel, resumeReading, readingQueueExclusions, nextReadingPaperId } from '../lib/today-presentation.mjs';

test('Reading continuation skips persisted negative feedback, deferrals and finished reading but preserves saved unread work', () => {
  const papers = [
    {id:'ignored',feedback:'not_relevant',readingStatus:'reading'},
    {id:'later',userState:'snoozed',readingStatus:'reading'},
    {id:'future',snoozedUntil:'2026-10-01'},
    {id:'finished',readingStatus:'read'},
    {id:'mastered',readingStatus:'mastered'},
    {id:'cited',readingStatus:'cited'},
    {id:'saved',saved:true,userState:'accepted',readingStatus:'unread'},
    {id:'useful',feedback:'relevant',readingStatus:'reading'},
  ];
  const before=structuredClone(papers);
  const excluded=readingQueueExclusions(papers,Date.parse('2026-09-28'));
  assert.deepEqual(excluded,['ignored','later','future','finished','mastered','cited']);
  assert.equal(nextReadingPaperId(['ignored','later','finished','saved','useful'],[],excluded),'saved');
  assert.equal(nextReadingPaperId(['ignored','saved'],[papers[7]],excluded,['saved']),'useful');
  assert.equal(nextReadingPaperId(['ignored'],[],excluded),undefined);
  assert.equal(resumeReading(papers)?.id,'useful');
  assert.deepEqual(papers,before,'presentation preserves original notes, feedback and ordering');
});

test('Next reading excludes both the open paper and the feedback receipt subject, with question readings first',()=>{
  assert.equal(nextReadingPaperId(['receipt','open','question-next'],[{id:'fallback'}],[],['open','receipt']),'question-next');
  assert.equal(nextReadingPaperId(['receipt','open'],[{id:'fallback'}],[],['open','receipt']),'fallback');
  assert.equal(nextReadingPaperId(['from-question-api'],[],[],[]),'from-question-api','API results outside the bounded history remain readable');
  const expired={id:'expired',userState:'seen',snoozedUntil:'2026-09-20'};
  assert.deepEqual(readingQueueExclusions([expired],Date.parse('2026-09-28')),[]);
});

test('Featured reading removes duplicate cards without losing saved brief guidance or history', () => {
  const entries = briefPaperEntries(['a','b','c'],[{id:'a'},{id:'b'},{id:'c'}]);
  const original = structuredClone(entries);
  assert.deepEqual(remainingBriefEntries(entries,['a','b','a','outside']),[{paper:{id:'c'},briefIndex:2}]);
  assert.deepEqual(remainingBriefEntries(entries,[]),entries);
  assert.deepEqual(remainingBriefEntries(entries,['a','b','c']),[]);
  assert.deepEqual(entries,original);
});

test('Resume reading uses an explicit in-progress state, preserves source order and excludes finished or merely opened papers', () => {
  const papers = [
    {id:'earlier',readingStatus:'reading',openedAt:'2026-09-01'},
    {id:'opened',readingStatus:'unread',openedAt:'2026-09-22'},
    {id:'finished',readingStatus:'read',openedAt:'2026-09-22'},
    {id:'current',readingStatus:'reading',openedAt:'2026-09-20',readingNote:'Original note'},
    {id:'saved',readingStatus:'queued',openedAt:'2026-09-22'},
  ];
  const before = structuredClone(papers);
  assert.equal(resumeReading(papers)?.id,'current');
  assert.equal(resumeReading(papers)?.readingNote,'Original note');
  assert.deepEqual(papers,before);
  assert.equal(resumeReading(papers.filter(p=>p.readingStatus!=='reading')),null);
});

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
