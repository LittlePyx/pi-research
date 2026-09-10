import assert from 'node:assert/strict';
import test from 'node:test';
import { matchScreeningRecords } from '../lib/screening-identity.mjs';

const record = (canonicalId, changes = {}) => ({ canonicalId, isPaper: true, relevanceScore: 80, qualityScore: 75, screeningReason: 'Supplied evidence.', ...changes });

test('one omitted or mistyped identity preserves the other thirteen records without guessing', () => {
  const ids = Array.from({ length: 14 }, (_, i) => `title:${String(i).padStart(64, '0')}`);
  for (const extra of [[], [record(ids[13] + 'typo')]]) {
    const result = matchScreeningRecords(ids, [...ids.slice(0, 13).map(id => record(id)), ...extra]);
    assert.deepEqual([...result.byId.keys()], ids.slice(0, 13));
    assert.deepEqual(result.diagnostics.missingIds, [ids[13]]);
    assert.equal(result.diagnostics.unexpectedCount, extra.length);
    assert.equal(result.byId.has(ids[13]), false);
  }
});

test('ambiguous duplicates and malformed evaluations stay pending, including false non-paper decisions', () => {
  const result = matchScreeningRecords(['a', 'b', 'c', 'd', 'e'], [
    record('a'), record('a', { isPaper: false }), record('b', { relevanceScore: undefined }),
    record('c', { isPaper: 'false' }), record('d', { screeningReason: '' }), record('e'), null,
  ]);
  assert.deepEqual([...result.byId.keys()], ['e']);
  assert.deepEqual(result.diagnostics.duplicateIds, ['a']);
  assert.deepEqual(result.diagnostics.invalidIds, ['b', 'c', 'd']);
  assert.equal(result.diagnostics.unexpectedCount, 1);
});

test('literal DOI angle brackets are identity characters, never HTML markup', () => {
  const id = 'doi:10.1130/0091-7613(1990)018<0812:lbotao>2.3.co;2';
  const result = matchScreeningRecords([id], [record(id)]);
  assert.equal(result.byId.get(id).canonicalId, id);
  assert.deepEqual(result.diagnostics.missingIds, []);
  assert.equal(result.diagnostics.unexpectedCount, 0);
  // Encoded or stripped alternatives must not be silently mapped to the DOI.
  for (const changed of [id.replace('<0812:lbotao>', ' '), id.replace('<', '&lt;').replace('>', '&gt;')]) {
    assert.equal(matchScreeningRecords([id], [record(changed)]).byId.size, 0);
  }
});
