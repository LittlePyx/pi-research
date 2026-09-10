import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import * as identity from '../lib/canonical-response.mjs';
import * as evidence from '../lib/evidence-verification.ts';
import * as draft from '../lib/recommendation-draft.mjs';

const source = await readFile(new URL('../app/api/monitor/route.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
const helpers = ['cleanText', 'recommendationVerificationPayload', 'recommendationVerificationFields',
  'recommendationVerificationRequiredFields', 'correctedRecommendationReview', 'isPublishedRecommendation',
  'pendingRecommendationReview', 'degradedRecommendationReview', 'allocatedTokenShare', 'paperReviewMapRole'];
function load(name, dependencies) {
  const nodes = [...helpers, name].map(key => {
    const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === key);
    assert.ok(node, key);
    return node.getText(ast);
  });
  const deps = { ...identity, ...evidence, ...draft, parseJsonObject: JSON.parse,
    MONITOR_MODEL: 'fixture', VERIFICATION_TIMEOUT_MS: 1000, VERIFICATION_CORRECTION_TIMEOUT_MS: 1000,
    recordUsage: async () => {}, traceVerificationResponse: () => {}, ...dependencies };
  const code = ts.transpileModule(nodes.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(deps), `${code}; return ${name};`)(...Object.values(deps));
}
const id = 'doi:10.1130/0091-7613(1990)018<0812:lbotao>2.3.co;2';
const sentence = 'The supplied abstract describes a bounded estimate obtained with the stated mathematical method.';
const review = { canonicalId: id, recommended: true, trackId: '', verificationInputTokens: 0, verificationOutputTokens: 0,
  verificationStatus: 'pending', verificationRetryable: true, verificationReport: {},
  researchQuestionsZh: ['问题一', '问题二'], researchQuestionsEn: ['Question one?', 'Question two?'],
  researchProblemImpactZh: '', researchProblemImpactEn: '', researchDecisionZh: '', researchDecisionEn: '' };
for (const field of ['summary', 'whyRead', 'problem', 'method', 'contribution', 'limitations', 'readingFocus']) {
  review[field + 'Zh'] = '隔离测试摘要明确描述了有界估计及其使用的方法；所有结论仅限于提供的证据，不推断其适用范围。';
  review[field + 'En'] = sentence;
}
const verdict = { verdict: 'verified', coverageScore: 95, supportedFields: ['summary', 'problem', 'method', 'contribution'],
  unsupportedFields: [], overstatements: [], contradictionRisks: [], supportedEvidenceIds: ['abstract-1'],
  claimChecks: ['summary', 'problem', 'method', 'contribution'].map(field => ({ field, claimExcerpt: sentence,
    evidenceId: 'abstract-1', verdict: 'supported', reason: 'Within supplied evidence.' })), reason: 'Grounded in the supplied abstract.' };
const response = payload => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }],
  usage: { prompt_tokens: 20, completion_tokens: 10 } }) });
async function verify(records, correction = false) {
  const run = load('verifyRecommendationBatch', {
    recommendationVerificationEvidence: async () => ({ source: 'abstract', units: [{ id: 'abstract-1', text: sentence }] }),
    fetch: async () => response(correction ? { corrections: records } : { verifications: records }),
  });
  const inputReview = structuredClone(review);
  if (correction) inputReview.verificationReport = { correctionRequested: true, audit: { ...verdict, verdict: 'revise' } };
  const before = structuredClone(inputReview);
  try {
    return await run({ database: {}, spaceId: 'fixture', usageDate: '2026-09-10', workspaceScope: 'fixture',
      spaceScope: 'fixture', apiKey: 'fixture-only', candidates: [{ canonicalId: id, title: 'QA bounded estimate' }], reviews: [inputReview] });
  } finally { assert.deepEqual(inputReview, before); }
}

// Execute the production checkpoint's try/catch, including persistence and queue
// updates. A mocked transport result must not become a content rejection here.
async function verificationStep(result, attempt) {
  let checkpointTry;
  function visit(node) {
    if (ts.isTryStatement(node) && node.tryBlock.getText(ast).includes('const verified = await verifyRecommendationBatch(')) checkpointTry = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(checkpointTry);
  const saved = [], events = [];
  const work = { verificationFailureCount: 2, verificationAttempts: { [id]: attempt },
    verificationIds: [id], verificationCompletedIds: [], verificationDeferredIds: [] };
  const deps = { ...evidence, ...draft, work, database: {}, space: { id: 'space' }, job: { id: 'job' },
    usageDate: '2026-09-10', workspaceScope: 'fixture', spaceScope: 'fixture', apiKey: 'fixture-only',
    batchCandidates: [{ canonicalId: id }], batchDrafts: [review], batchIds: [id], verificationAttempts: new Map([[id, attempt]]),
    VERIFICATION_ATTEMPT_LIMIT: 3, VERIFICATION_CONTENT_PASS_LIMIT: 2, VERIFICATION_CIRCUIT_FAILURE_LIMIT: 3, MONITOR_MODEL: 'fixture',
    verifyRecommendationBatch: async () => { if (result instanceof Error) throw result; return [result]; },
    persistReviewBatch: async (_db, _space, _job, _candidates, reviews) => { saved.push(...reviews); return reviews; },
    persistRecommendationAuditBatch: async () => {}, recordReliabilityEvent: async (_db, event) => events.push(event),
    isNonRetryableDeepSeekError: () => false, monitorErrorCode: () => 'timeout', normalizedMonitorError: () => 'Timeout',
  };
  const functions = helpers.map(key => ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === key).getText(ast));
  const code = ts.transpileModule(`${functions.join('\n')}\nasync function run() { ${checkpointTry.getText(ast)} }`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  await new Function(...Object.keys(deps), `${code}; return run();`)(...Object.values(deps));
  return { saved, events, work };
}

test('last transport slot preserves a successful audit and defers only its unperformed correction', async () => {
  const pending = (await verify([{ canonicalId: id, ...verdict, verdict: 'revise', overstatements: ['Qualify the summary.'] }]))[0];
  assert.equal(pending.verificationRetryable, true);
  const before = structuredClone(pending);
  const last = await verificationStep(pending, 3);
  assert.deepEqual(last.saved, [before]);
  assert.deepEqual(last.work.verificationDeferredIds, [id]);
  assert.deepEqual(last.work.verificationCompletedIds, []);
  assert.equal(last.events[0].kind, 'verification_deferred');
  assert.equal(last.events[0].metadata.correctionRequested, true);
  assert.equal(last.events[0].metadata.retryScheduled, false);
  const earlier = await verificationStep(pending, 2);
  assert.deepEqual(earlier.work.verificationDeferredIds, []);
  assert.equal(earlier.events[0].kind, 'verification_retry_scheduled');
  assert.deepEqual(pending, before);

  const corrected = (await verify([{ canonicalId: id, corrected: review, verification: verdict }], true))[0];
  const completed = await verificationStep(corrected, 1);
  assert.equal(completed.saved[0].verificationStatus, 'revised');
  assert.equal(completed.saved[0].verificationRetryable, false);
  assert.deepEqual(completed.work.verificationCompletedIds, [id]);
});

test('transport exhaustion saves no fabricated verdict and real insufficient decisions remain terminal', async () => {
  const failed = await verificationStep(new Error('Timeout'), 3);
  assert.deepEqual(failed.saved, []);
  assert.deepEqual(failed.work.verificationDeferredIds, [id]);
  assert.deepEqual(failed.work.verificationCompletedIds, []);
  const rejected = (await verify([{ canonicalId: id, ...verdict, verdict: 'insufficient', unsupportedFields: ['method'] }]))[0];
  const completed = await verificationStep(rejected, 3);
  assert.equal(completed.saved[0].recommended, false);
  assert.equal(completed.saved[0].verificationStatus, 'degraded');
  assert.deepEqual(completed.work.verificationCompletedIds, [id]);
  assert.deepEqual(completed.work.verificationDeferredIds, []);
});

test('actual audit and correction functions preserve literal DOI and still enforce evidence quality', async () => {
  for (const correction of [false, true]) {
    const records = [{ canonicalId: ` ${id} `, ...verdict, corrected: review, verification: verdict }];
    const result = await verify(records, correction);
    assert.equal(result[0].canonicalId, id);
    assert.equal(result[0].recommended, true);
    assert.equal(result[0].verificationStatus, correction ? 'revised' : 'verified');
    const insufficient = { ...verdict, verdict: 'insufficient', unsupportedFields: ['method'], reason: 'Method lacks evidence.' };
    const rejected = await verify([{ canonicalId: id, ...insufficient, corrected: review, verification: insufficient }], correction);
    assert.equal(rejected[0].recommended, false);
    assert.equal(rejected[0].verificationStatus, 'degraded');
  }
});

test('a sparse bilingual correction preserves the complete draft and cannot drop a required core field', async () => {
  const changed = { summaryZh: review.summaryZh + '修订仅限定表述范围。', summaryEn: sentence + ' The scope is limited to this evidence.' };
  const result = (await verify([{ canonicalId: id, corrected: changed, verification: verdict }], true))[0];
  assert.equal(result.summaryZh, changed.summaryZh);
  assert.equal(result.summaryEn, changed.summaryEn);
  for (const key of ['methodZh', 'methodEn', 'problemZh', 'problemEn', 'contributionZh', 'contributionEn', 'readingFocusZh', 'readingFocusEn', 'researchQuestionsZh', 'researchQuestionsEn']) {
    assert.deepEqual(result[key], review[key], key);
  }
  assert.equal(result.verificationStatus, 'revised');
  assert.equal(result.verificationRetryable, false);
  for (const corrected of [{ methodZh: '', methodEn: '' }, { problemZh: '短', problemEn: 'Short' },
    { researchQuestionsZh: [], researchQuestionsEn: [] }]) {
    await assert.rejects(verify([{ canonicalId: id, corrected, verification: verdict }], true), /correction incomplete/);
  }
  const unsupported = { ...verdict, verdict: 'insufficient', unsupportedFields: ['summary'] };
  assert.equal((await verify([{ canonicalId: id, corrected: changed, verification: unsupported }], true))[0].recommended, false);
});

test('missing, encoded, stripped and duplicate audit identities retry without declaring quality rejection', async () => {
  for (const correction of [false, true]) {
    const entry = { canonicalId: id, ...verdict, corrected: review, verification: verdict };
    for (const records of [[], [{ ...entry, canonicalId: id.replace('<', '&lt;').replace('>', '&gt;') }],
      [{ ...entry, canonicalId: id.replace(/<[^>]*>/g, ' ') }], [entry, entry], [{ ...entry, canonicalId: 123 }]]) {
      await assert.rejects(verify(records, correction), /identity coverage incomplete/);
    }
    const result = await verify([entry, { ...entry, canonicalId: 'doi:unknown' }], correction);
    assert.equal(result.length, 1);
    assert.equal(result[0].canonicalId, id);
  }
});

test('actual route reconciliation preserves DOI, ignores ambiguous identity, and retains existing routes', async () => {
  const assignment = { canonicalId: id, trackId: 'track', mapRole: 'milestone', rationaleZh: '<b>可信关联</b>', rationaleEn: '<b>Evidence supports this route.</b>' };
  for (const records of [[assignment], [assignment, assignment], [{ ...assignment, canonicalId: id.replace('<', '&lt;') }], [{ ...assignment, trackId: 'unknown' }]]) {
    const run = load('reconcileRecommendedReviewTracks', {
      shanghaiDateKey: () => '2026-09-10', usageCount: async () => 0, developmentAnalysisUnbounded: () => true,
      fetch: async () => response({ assignments: records }),
    });
    const db = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ id: 'track', title_en: 'QA route' }] }) }) }) };
    const reviews = [{ ...review, verificationStatus: 'verified', verificationRetryable: false },
      { ...review, canonicalId: 'doi:existing', trackId: 'existing', verificationStatus: 'verified', verificationRetryable: false },
      { ...review, canonicalId: 'doi:pending' }];
    const before = structuredClone(reviews);
    const result = await run(db, { id: 'fixture' }, 'fixture', [{ canonicalId: id, abstractText: sentence }], reviews, 'fixture-only');
    assert.deepEqual(reviews, before);
    assert.deepEqual(result.slice(1), before.slice(1));
    assert.equal(result[0].canonicalId, id);
    assert.equal(result[0].trackId, records.length === 1 && records[0] === assignment ? 'track' : '');
    if (result[0].trackId) assert.equal(result[0].mapRationaleEn, 'Evidence supports this route.');
  }
});
