import assert from 'node:assert/strict';
import test from 'node:test';
import { withSupplementaryReading } from '../lib/learning-supplementary.ts';

const path = () => ({ status: 'waiting_evidence', completedSteps: 0, steps: [{
  id: 'foundation', kind: 'foundation', titleEn: 'Gaussian rate distortion', titleZh: '',
  goalEn: '', goalZh: '', readFocusEn: '', readFocusZh: '',
  status: 'active', resources: [], supplementaryResources: [], evidenceStatus: 'retryable',
  evidenceQuery: 'Original source', completedAt: null,
}] });
const candidate = (id, title = 'Gaussian rate distortion: a survey') => ({
  resource: { id: `monitor:${id}`, canonicalId: `doi:${id}`, qualification: 'quality_approved' },
  paper: { title, authors: 'QA only', abstractText: '' },
});

test('approved subject-matched bridge is readable without changing original evidence or completion', () => {
  const original = path();
  const copy = structuredClone(original);
  const result = withSupplementaryReading(original, [candidate('a')]);
  assert.equal(result.steps[0].supplementaryResources[0].id, 'monitor:a');
  assert.deepEqual({ ...result.steps[0], supplementaryResources: [] }, original.steps[0]);
  assert.equal(result.status, 'waiting_evidence');
  assert.equal(result.completedSteps, 0);
  assert.deepEqual(original, copy);
});

test('pending, unrelated and generic stage evidence cannot supply bridge readings', () => {
  const pending = candidate('pending');
  delete pending.resource.qualification;
  assert.equal(withSupplementaryReading(path(), [pending, candidate('wrong', 'KLS stochastic localization')]).steps[0].supplementaryResources.length, 0);
  const generic = path(); generic.steps[0].titleEn = 'Foundations';
  assert.equal(withSupplementaryReading(generic, [candidate('a')]).steps[0].supplementaryResources.length, 0);
});

test('bridge selection is bounded and idempotent and preserves historical supplements', () => {
  const candidates = ['a', 'a', 'b', 'c'].map(id => candidate(id));
  const once = withSupplementaryReading(path(), candidates);
  assert.equal(once.steps[0].supplementaryResources.length, 2);
  assert.deepEqual(withSupplementaryReading(once, candidates), once);
  const completed = path(); completed.steps[0].status = 'completed';
  assert.deepEqual(withSupplementaryReading(completed, candidates), completed);
});
