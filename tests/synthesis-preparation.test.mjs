import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesisPreparation, preparationReviewState } from '../lib/synthesis-preparation.ts';

test('material preparation never promotes collected or selected papers to eligible evidence', () => {
  const base = { title: 'Paper', url: '', confirmed: 0, selected: 0, grounded: 1 };
  const result = synthesisPreparation([
    { ...base, id: 'pending' },
    { ...base, id: 'missing', confirmed: 1, grounded: 0 },
    { ...base, id: 'qualified', confirmed: 1 },
  ], new Set(['qualified']));
  assert.deepEqual(result.map(p => p.state), ['needs_confirmation', 'needs_evidence', 'ready']);
  assert.equal(result[0].hasGroundedEvidence, true);
  assert.equal(result[1].hasGroundedEvidence, false);
});

test('review outcomes remain distinct from evidence preparation', () => {
  assert.equal(preparationReviewState('needs_confirmation', 'reviewed'), 'not_selected');
  assert.equal(preparationReviewState('needs_evidence', 'queued'), 'awaiting_review');
  assert.equal(preparationReviewState('needs_evidence', 'reviewing'), 'reviewing');
  assert.equal(preparationReviewState('needs_confirmation', undefined), 'needs_confirmation');
  assert.equal(preparationReviewState('ready', 'reviewed'), 'ready');
});
