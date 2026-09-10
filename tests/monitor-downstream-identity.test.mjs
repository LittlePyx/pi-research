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
    recordUsage: async () => {}, ...dependencies };
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
