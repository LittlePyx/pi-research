import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { selectBalancedByGroup, selectAgedProvenanceFairCandidates } from '../lib/discovery/candidate-selection.mjs';
import { isMonitorRouteProvenance, monitorRouteOriginKind } from '../lib/monitor-route-planning.ts';

const source = await readFile(new URL('../app/api/monitor/route.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
const functions = ['cleanText', 'normalizedResearchText', 'candidateScreeningPriority', 'candidateDirectionKey',
  'selectHorizonScreeningCandidates', 'researchLeadLane', 'selectResearchLeadScreeningCandidates', 'selectCurrentAndBacklogReviewBatch'];
const constants = ['GENERIC_TERMS', 'HORIZON_REVIEW_LIMITS', 'VERIFICATION_BATCH_SIZE'];
const declarations = [...functions.map(name => ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)),
  ...constants.map(name => ast.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === name)))];
assert.ok(declarations.every(Boolean));
const deps = { selectBalancedByGroup, selectAgedProvenanceFairCandidates, isMonitorRouteProvenance, monitorRouteOriginKind };
const compiled = ts.transpileModule(declarations.map(n => n.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const select = new Function(...Object.keys(deps), compiled + '; return selectCurrentAndBacklogReviewBatch;')(...Object.values(deps));
function candidate(id, horizon, pending = false, route = false) {
  return { canonicalId: id, title: id, abstractText: pending ? 'Evidence retained. '.repeat(10) : 'High scoring discovery abstract. '.repeat(60),
    venue: 'Fixture', horizon, relevanceScore: pending ? 5 : 100, qualityScore: pending ? 20 : 95, citationCount: 100,
    verificationPending: pending, discoveryChannel: 'topic',
    provenance: [{ sourceKey: route ? 'research-route:learning' : 'crossref', queryKey: id, queryText: '', channel: 'topic' }],
    qualityQueueLane: route ? 'learning' : '', qualityQueueFirstSeenAt: route ? '2020-01-01' : null };
}
test('actual horizon selector resumes pending audits within existing limits and retains route reservations', () => {
  const all = ['days', 'months', 'years'].flatMap(horizon => [
    ...Array.from({ length: 3 }, (_, i) => candidate(horizon + '-pending-' + i, horizon, true)),
    ...Array.from({ length: 2 }, (_, i) => candidate(horizon + '-route-' + i, horizon, false, true)),
    ...Array.from({ length: 60 }, (_, i) => candidate(horizon + '-fresh-' + i, horizon)),
  ]);
  for (const current of [[], all.filter(x => !x.verificationPending).map(x => x.canonicalId)]) {
    const result = select(all, current);
    assert.equal(result.length, 56);
    assert.equal(new Set(result.map(x => x.canonicalId)).size, 56);
    for (const [horizon, size] of [['days', 12], ['months', 16], ['years', 28]]) {
      const subset = result.filter(x => x.horizon === horizon);
      assert.equal(subset.length, size);
      assert.equal(subset.filter(x => x.verificationPending).length, 3);
      assert.equal(subset.filter(x => x.qualityQueueLane === 'learning').length, 2);
      assert.ok(subset.some(x => !x.verificationPending && !x.qualityQueueLane));
    }
  }
  const sameRoute = candidate('pending-route', 'days', true, true);
  assert.deepEqual(select([sameRoute], []), [sameRoute], 'a pending route paper consumes one position');
  const extra = candidate('additional-missing-abstract', 'days', true);
  extra.abstractText = '';
  assert.equal(select([...all, extra], []).length, 56, 'a full batch cannot add an evidence-gap slot beyond its limit');
});
