import assert from 'node:assert/strict';
import test from 'node:test';
import { stageReviewKey, stageReviewPapers, stageReviewPrompt, validateStageReview } from '../lib/learning-stage-review.ts';

const fixture = () => ({ pathId: 'qa-path', stepId: 'qa-step',
  stage: { kind: 'foundation', titleEn: 'Gaussian rate distortion', titleZh: '', goalEn: '', goalZh: '', readFocusEn: '', readFocusZh: '' },
  candidates: [{ canonicalId: 'doi:qa', title: 'Gaussian rate distortion original QA', authors: 'QA only',
    abstractText: 'We derive Gaussian rate distortion bounds for a specified source model. This abstract is a synthetic test fixture and does not describe a production paper.',
    qualityApproved: true, dismissed: false }],
});
const decision = input => ({ decisions: [{ canonicalId: 'doi:qa', role: 'primary',
  quote: input.candidates[0].abstractText.slice(0, 69), reason: 'The abstract establishes the Gaussian rate distortion bound required by this exact stage.' }] });

test('automatic stage review only consumes approved, evidenced, unsuppressed candidates', () => {
  const input = fixture();
  input.candidates.push({ ...input.candidates[0], canonicalId: 'pending', qualityApproved: false },
    { ...input.candidates[0], canonicalId: 'dismissed', dismissed: true },
    { ...input.candidates[0], canonicalId: 'empty', abstractText: '' });
  assert.deepEqual(stageReviewPapers(input).map(p => p.canonicalId), ['doi:qa']);
  assert.deepEqual(stageReviewPrompt(input).papers.map(p => p.canonicalId), ['doi:qa']);
});

test('valid grounded decisions are proposals and changed path or evidence invalidates them', async () => {
  const input = fixture(); const key = await stageReviewKey(input);
  const result = await validateStageReview(input, key, decision(input));
  assert.equal(result.status, 'valid'); assert.equal(result.assignments.length, 1);
  for (const change of [i => { i.pathId = 'other'; }, i => { i.stepId = 'other'; },
    i => { i.stage.goalEn = 'Different goal'; }, i => { i.candidates[0].abstractText += ' New evidence'; },
    i => { i.candidates[0].dismissed = true; }, i => { i.candidates[0].qualityApproved = false; }]) {
    const changed = structuredClone(input); change(changed);
    assert.deepEqual(await validateStageReview(changed, key, decision(input)), { status: 'stale', assignments: [] });
  }
});

test('fabricated quotes, title-only grounding, unknown IDs and duplicates fail closed', async () => {
  const input = fixture(); const key = await stageReviewKey(input);
  for (const patch of [{ quote: 'A fabricated abstract quote which was never supplied to this model.' },
    { quote: input.candidates[0].title }, { canonicalId: 'foreign-id' }, { role: 'accepted' }]) {
    const raw = decision(input); Object.assign(raw.decisions[0], patch);
    assert.equal((await validateStageReview(input, key, raw)).status, 'invalid');
  }
  const duplicate = decision(input); duplicate.decisions.push(duplicate.decisions[0]);
  assert.equal((await validateStageReview(input, key, duplicate)).status, 'invalid');
  assert.equal((await validateStageReview(input, key, 'not JSON')).status, 'invalid');
});

test('supplementary decisions cannot fill an original-work stage and surveys cannot be primary', async () => {
  const input = fixture(); const key = await stageReviewKey(input);
  const raw = decision(input); raw.decisions[0].role = 'supplementary';
  assert.deepEqual(await validateStageReview(input, key, raw), { status: 'valid', assignments: [] });
  input.candidates[0].title += ': a survey';
  assert.equal((await validateStageReview(input, await stageReviewKey(input), decision(input))).status, 'invalid');
});
