import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/api/monitor/route.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
function load(name, dependencies) {
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, `production function ${name} must exist`);
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${code}; return ${name};`)(...Object.values(dependencies));
}
function constant(name) {
  const value = source.match(new RegExp(`const ${name} = ([\\d_]+);`))?.[1];
  assert.ok(value, `production constant ${name} must exist`);
  return Number(value.replaceAll('_', ''));
}
const size = constant('QUICK_SCREEN_BATCH_SIZE');
const concurrency = constant('QUICK_SCREEN_CONCURRENCY');
function screenDependencies(batch) {
  return {
    shanghaiDateKey: () => '2026-09-09', usageCount: async () => 0,
    developmentAnalysisUnbounded: () => true,
    QUICK_SCREEN_BATCH_SIZE: size, QUICK_SCREEN_CONCURRENCY: concurrency,
    quickScreenBatch: batch, isNonRetryableDeepSeekError: error => error?.fatal === true,
  };
}

test('both domains retain successful screening groups without rejecting a timed-out group', async () => {
  for (const domain of ['information_theory', 'applied_mathematics']) {
    const candidates = Array.from({ length: size * concurrency }, (_, i) => ({ canonicalId: `${domain}:${i}` }));
    const before = structuredClone(candidates);
    const seen = [];
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const run = load('quickScreenCandidates', screenDependencies(async (_db, _space, _user, group) => {
      seen.push(group.map(p => p.canonicalId));
      if (group[0].canonicalId.endsWith(':0')) throw timeout;
      return group.map(p => ({ ...p, isPaper: true, relevanceScore: 85, qualityScore: 80 }));
    }));
    const result = await run({}, { id: domain }, 'fixture-workspace', candidates, 'fixture-only');
    assert.equal(seen.length, concurrency);
    assert.deepEqual(result.screens.map(p => p.canonicalId), candidates.slice(size).map(p => p.canonicalId));
    assert.deepEqual(result.errors, [timeout]);
    assert.deepEqual(candidates, before);
    assert.equal(result.screens.some(p => p.isPaper === false), false);
  }
});

test('all screening timeouts remain errors, while fatal authentication failures are propagated', async () => {
  const candidates = [{ canonicalId: 'fixture:one' }];
  const timeout = new DOMException('timed out', 'TimeoutError');
  const run = load('quickScreenCandidates', screenDependencies(async () => { throw timeout; }));
  assert.deepEqual(await run({}, { id: 'fixture' }, 'fixture', candidates, 'fixture-only'), { screens: [], errors: [timeout] });
  const fatal = Object.assign(new Error('fixture credential failure'), { fatal: true });
  const fail = load('quickScreenCandidates', screenDependencies(async () => { throw fatal; }));
  await assert.rejects(fail({}, { id: 'fixture' }, 'fixture', candidates, 'fixture-only'), error => error === fatal);
});

test('screening timeout retries are bounded and never produce synthetic scores or usage success', async () => {
  const requests = [];
  const deadlines = [];
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  const run = load('quickScreenBatch', {
    loadRouteReviewTitles: async () => [],
    inferDomainProfile: () => ({ key: 'applied_mathematics' }),
    benchmarkCalibrationPrompt: () => '', routeReviewOrigins: () => [], MONITOR_MODEL: 'fixture-model',
    QUICK_SCREEN_FAST_TIMEOUT_MS: constant('QUICK_SCREEN_FAST_TIMEOUT_MS'),
    QUICK_SCREEN_RESCUE_TIMEOUT_MS: constant('QUICK_SCREEN_RESCUE_TIMEOUT_MS'),
    QUICK_SCREEN_RETRY_TIMEOUT_MS: constant('QUICK_SCREEN_RETRY_TIMEOUT_MS'),
    AbortSignal: { timeout(ms) { deadlines.push(ms); return undefined; } },
    fetch: async (_url, request) => { requests.push(JSON.parse(request.body)); throw timeout; },
    isNonRetryableDeepSeekError: () => false, setTimeout: callback => callback(),
    recordUsage: () => assert.fail('failed requests must not be recorded as successful screening'),
  });
  const database = { prepare: () => ({ bind: () => ({ first: async () => ({ profile_key: 'applied_mathematics' }) }) }) };
  const candidates = Array.from({ length: size }, (_, i) => ({ canonicalId: `fixture:${i}`, abstractText: 'Supplied abstract.' }));
  await assert.rejects(run(database, { id: 'fixture', name: 'QA mathematics' }, 'fixture', candidates, 'fixture-only'), error => error === timeout);
  assert.equal(requests.length, 2);
  assert.deepEqual(deadlines, [constant('QUICK_SCREEN_FAST_TIMEOUT_MS'), constant('QUICK_SCREEN_RETRY_TIMEOUT_MS')]);
  assert.equal(requests[0].messages[1].content, requests[1].messages[1].content);
  assert.equal(requests.every(r => r.response_format.type === 'json_object'), true);
});
