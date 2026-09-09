import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { reviewLearningStage, reviewLearningStageBatches } from '../lib/learning-stage-review-job.ts';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE research_spaces(id TEXT PRIMARY KEY); CREATE TABLE learning_paths(id TEXT PRIMARY KEY); INSERT INTO research_spaces VALUES ('one'),('two'); INSERT INTO learning_paths VALUES ('path');");
  sqlite.exec(readFileSync(new URL('../drizzle/0056_real_karen_page.sql', import.meta.url), 'utf8'));
  const database = { prepare(sql) { return { bind(...values) { return {
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
  }; } }; } };
  const input = { pathId: 'path', stepId: 'step',
    stage: { kind: 'foundation', titleEn: 'Gaussian rate distortion', titleZh: '', goalEn: '', goalZh: '', readFocusEn: '', readFocusZh: '' },
    candidates: [{ canonicalId: 'doi:qa', title: 'Gaussian rate distortion original QA', authors: 'QA fixture',
      abstractText: 'We derive Gaussian rate distortion bounds for a specified source model. This abstract is an isolated synthetic fixture, not a production paper or real recommendation.',
      qualityApproved: true, dismissed: false }],
  };
  const decision = () => ({ decisions: [{ canonicalId: 'doi:qa', role: 'primary', quote: input.candidates[0].abstractText.slice(0, 69),
    reason: 'The abstract directly establishes the Gaussian rate distortion bound for this exact stage.' }] });
  return { sqlite, database, input, decision };
}

test('negative first batch does not starve later candidates or cause unbounded calls', async () => {
  const f = setup();
  try {
    f.input.candidates = Array.from({ length: 10 }, (_, n) => ({ ...f.input.candidates[0], canonicalId: `doi:${n}` }));
    let calls = 0;
    const options = { ...f, spaceId: 'one', judge: async prompt => {
      calls++;
      return { decisions: prompt.papers[0].canonicalId === 'doi:8' ? [{ ...f.decision().decisions[0], canonicalId: 'doi:8' }] : [] };
    } };
    assert.equal((await reviewLearningStageBatches(options)).assignments.length, 0);
    assert.equal(calls, 1);
    assert.equal((await reviewLearningStageBatches(options)).assignments[0].canonicalId, 'doi:8');
    assert.equal(calls, 2);
    assert.equal((await reviewLearningStageBatches(options)).assignments.length, 1);
    assert.equal(calls, 2);
  } finally { f.sqlite.close(); }
});

test('durable stage review: concurrent requests share one model call and verified results survive reuse', async () => {
  const f = setup();
  try {
    let release; let calls = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const opts = { ...f, spaceId: 'one', now: 1000, judge: async () => { calls++; await gate; return f.decision(); } };
    const first = reviewLearningStage(opts);
    while (!calls) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal((await reviewLearningStage(opts)).status, 'waiting');
    release();
    assert.equal((await first).assignments.length, 1);
    assert.equal((await reviewLearningStage(opts)).assignments.length, 1);
    assert.equal(calls, 1);
    assert.equal((await reviewLearningStage({ ...opts, spaceId: 'two' })).assignments.length, 1);
    assert.equal(calls, 2, 'cached data cannot cross workspace boundaries');
  } finally { f.sqlite.close(); }
});

test('stage model failure and invalid evidence are retryable, never complete, and never store error bodies', async () => {
  const f = setup();
  try {
    let calls = 0;
    const opts = { ...f, spaceId: 'one', now: 1000, judge: async () => { calls++; throw new Error('sensitive-provider-body'); } };
    assert.equal((await reviewLearningStage(opts)).status, 'retryable');
    assert.equal((await reviewLearningStage({ ...opts, now: 2000 })).status, 'waiting');
    assert.equal(calls, 1);
    const bad = () => ({ decisions: [{ ...f.decision().decisions[0], quote: 'Invented evidence cannot enter a learning stage.' }] });
    assert.equal((await reviewLearningStage({ ...opts, now: 302000, judge: async () => bad() })).status, 'retryable');
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM learning_stage_reviews').all()).includes('sensitive-provider-body'), false);
    assert.equal((await reviewLearningStage({ ...opts, now: 603000, judge: async () => f.decision() })).assignments.length, 1);
  } finally { f.sqlite.close(); }
});

test('expired lease can be recovered and old worker cannot overwrite the new decision', async () => {
  const f = setup();
  try {
    let release; let started = false;
    const gate = new Promise(resolve => { release = resolve; });
    const opts = { ...f, spaceId: 'one', now: 1000 };
    const first = reviewLearningStage({ ...opts, judge: async () => { started = true; await gate; return f.decision(); } });
    while (!started) await new Promise(resolve => setTimeout(resolve, 1));
    const recovered = await reviewLearningStage({ ...opts, now: 152000, judge: async () => ({ decisions: [] }) });
    assert.equal(recovered.status, 'valid');
    release();
    assert.equal((await first).status, 'stale');
    assert.equal((await reviewLearningStage({ ...opts, now: 153000, judge: async () => { throw Error('must use cache'); } })).assignments.length, 0);
  } finally { f.sqlite.close(); }
});
