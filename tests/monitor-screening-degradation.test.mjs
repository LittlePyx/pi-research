import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createScreeningRequestTrace } from '../lib/screening-request-trace.mjs';
import { matchScreeningRecords } from '../lib/screening-identity.mjs';

const source = await readFile(new URL('../app/api/monitor/route.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
function load(name, dependencies) {
  dependencies = {
    matchScreeningRecords,
    createScreeningRequestTrace: input => createScreeningRequestTrace(input, { emit: () => {} }),
    recordReliabilityEvent: async () => {},
    ...dependencies,
  };
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
  const diagnostics = [];
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  const run = load('quickScreenBatch', {
    createScreeningRequestTrace: input => createScreeningRequestTrace(input, { emit: () => {} }),
    recordReliabilityEvent: async (_database, event) => { diagnostics.push(event); },
    loadRouteReviewTitles: async () => [],
    inferDomainProfile: () => ({ key: 'applied_mathematics' }),
    benchmarkCalibrationPrompt: () => '', routeReviewOrigins: () => [], MONITOR_MODEL: 'fixture-model',
    QUICK_SCREEN_FAST_TIMEOUT_MS: constant('QUICK_SCREEN_FAST_TIMEOUT_MS'),
    QUICK_SCREEN_RESCUE_TIMEOUT_MS: constant('QUICK_SCREEN_RESCUE_TIMEOUT_MS'),
    QUICK_SCREEN_RETRY_TIMEOUT_MS: constant('QUICK_SCREEN_RETRY_TIMEOUT_MS'),
    AbortSignal: { timeout(ms) { deadlines.push(ms); return undefined; } },
    fetch: async (_url, request) => { requests.push(JSON.parse(request.body)); throw timeout; },
    isNonRetryableDeepSeekError: () => false, monitorErrorCode: () => 'timeout', setTimeout: callback => callback(),
    recordUsage: () => assert.fail('failed requests must not be recorded as successful screening'),
  });
  const database = { prepare: () => ({ bind: () => ({ first: async () => ({ profile_key: 'applied_mathematics' }) }) }) };
  const candidates = Array.from({ length: size }, (_, i) => ({ canonicalId: `fixture:${i}`, abstractText: 'Supplied abstract.' }));
  await assert.rejects(run(database, { id: 'fixture', name: 'QA mathematics' }, 'fixture', candidates, 'fixture-only', 'fast', 'resume-14'), error => error === timeout);
  assert.equal(requests.length, 2);
  assert.deepEqual(deadlines, [constant('QUICK_SCREEN_FAST_TIMEOUT_MS'), constant('QUICK_SCREEN_RETRY_TIMEOUT_MS')]);
  const inputs = requests.map(r => JSON.parse(r.messages[1].content.split('Records: ')[1]));
  assert.equal(inputs[0].length, size);
  assert.equal(inputs[1].length, Math.ceil(size / 2));
  assert.deepEqual(inputs[1], inputs[0].slice(0, Math.ceil(size / 2)));
  assert.equal(requests.every(r => r.response_format.type === 'json_object'), true);
  assert.equal(diagnostics.length, 2);
  assert.deepEqual(diagnostics.map(event => event.metadata.recordCount), [size, Math.ceil(size / 2)]);
  assert.equal(diagnostics.every(event => event.scanJobId === 'resume-14' && event.metadata.phase === 'headers' && event.metadata.completed === 0), true);
});

test('smaller timeout retry returns only evaluated IDs; rescue and non-timeout retries keep full coverage', async () => {
  for (const [mode, errorCode] of [['fast', 'timeout'], ['rescue', 'timeout'], ['fast', 'invalid_response']]) {
    let calls = 0;
    let usageWrites = 0;
    const inputs = [];
    const run = load('quickScreenBatch', {
      loadRouteReviewTitles: async () => [], benchmarkCalibrationPrompt: () => '', routeReviewOrigins: () => [],
      MONITOR_MODEL: 'fixture-model',
      QUICK_SCREEN_FAST_TIMEOUT_MS: constant('QUICK_SCREEN_FAST_TIMEOUT_MS'),
      QUICK_SCREEN_RESCUE_TIMEOUT_MS: constant('QUICK_SCREEN_RESCUE_TIMEOUT_MS'),
      QUICK_SCREEN_RETRY_TIMEOUT_MS: constant('QUICK_SCREEN_RETRY_TIMEOUT_MS'),
      AbortSignal: { timeout: () => undefined },
      fetch: async (_url, request) => {
        const body = JSON.parse(request.body);
        const papers = JSON.parse(body.messages[1].content.split('Records: ')[1]);
        inputs.push(papers);
        if (++calls === 1) throw new Error('fixture failure');
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ screens: papers.map(p => ({
          canonicalId: p.canonicalId, isPaper: true, relevanceScore: 85, qualityScore: 80, screeningReason: 'Direct evidence',
        })) }) } }] }) };
      },
      monitorErrorCode: () => errorCode, isNonRetryableDeepSeekError: () => false, setTimeout: callback => callback(),
      parseQuickScreenPayload: content => JSON.parse(content).screens, inferModelScoreScale: () => 100,
      normalizeModelScore: score => score, cleanText: text => text, hasStrongFitScoreContradiction: () => false,
      shanghaiDateKey: () => '2026-09-10', recordUsage: async () => { usageWrites++; },
    });
    const database = { prepare: () => ({ bind: () => ({ first: async () => ({ profile_key: 'applied_mathematics' }) }) }) };
    const candidates = Array.from({ length: size }, (_, i) => ({ canonicalId: `fixture:${i}`, abstractText: 'Evidence.', horizon: 'years' }));
    const original = structuredClone(candidates);
    const first = await run(database, { id: 'fixture' }, 'fixture', candidates, 'fixture-only', mode);
    const expected = mode === 'fast' && errorCode === 'timeout' ? Math.ceil(size / 2) : size;
    assert.equal(first.length, expected);
    assert.equal(inputs[1].length, expected);
    assert.equal(calls, 2);
    assert.equal(usageWrites, 3);
    assert.deepEqual(candidates, original);
    const completed = new Set(first.map(p => p.canonicalId));
    const remaining = candidates.filter(p => !completed.has(p.canonicalId));
    if (remaining.length) {
      const next = await run(database, { id: 'fixture' }, 'fixture', remaining, 'fixture-only', mode);
      assert.deepEqual([...first, ...next].map(p => p.canonicalId), original.map(p => p.canonicalId));
      assert.equal(calls, 3);
    }
  }
});

test('real HTTP keep-alive without a model result is diagnosed as body timeout, never screened', { timeout: 10000 }, async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.flushHeaders();
    response.write('\n');
    const keepAlive = setInterval(() => response.write('\n'), 30);
    response.on('close', () => clearInterval(keepAlive));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const events = [];
  const diagnostics = [];
  const run = load('quickScreenBatch', {
    createScreeningRequestTrace: input => createScreeningRequestTrace(input, { emit: event => events.push(event) }),
    recordReliabilityEvent: async (_db, event) => { diagnostics.push(event); },
    loadRouteReviewTitles: async () => [], inferDomainProfile: () => ({ key: 'applied_mathematics' }),
    benchmarkCalibrationPrompt: () => '', routeReviewOrigins: () => [], MONITOR_MODEL: 'fixture-model',
    QUICK_SCREEN_FAST_TIMEOUT_MS: 1000, QUICK_SCREEN_RESCUE_TIMEOUT_MS: 1000, QUICK_SCREEN_RETRY_TIMEOUT_MS: 500,
    AbortSignal, fetch: (_url, request) => fetch(`http://127.0.0.1:${server.address().port}`, request),
    isNonRetryableDeepSeekError: () => false, monitorErrorCode: () => 'timeout', setTimeout: callback => callback(),
    recordUsage: () => assert.fail('an HTTP 200 without a model result is not a successful evaluation'),
  });
  const database = { prepare: () => ({ bind: () => ({ first: async () => ({ profile_key: 'applied_mathematics' }) }) }) };
  try {
    await assert.rejects(run(database, { id: 'fixture' }, 'fixture', [
      { canonicalId: 'fixture:body-stall', abstractText: 'Supplied evidence.' },
    ], 'fixture-only', 'fast', 'resume-body-stall'), error => /abort|timeout/i.test(error.name + error.message));
    assert.equal(diagnostics.length, 2);
    assert.equal(diagnostics.every(event => event.metadata.httpStatus === 200 && event.metadata.phase === 'body' && event.metadata.completed === 0), true);
    assert.equal(events.filter(event => event.kind === 'screening_request_input').length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('fast screening retains thirteen valid papers after one identity mismatch and finishes only the remaining paper next', async () => {
  for (const domain of ['applied_mathematics', 'information_theory']) {
    const candidates = Array.from({ length: 14 }, (_, i) => ({ canonicalId: `${domain}:${i}`, abstractText: 'Evidence.', horizon: 'months' }));
    const requests = [];
    const diagnostics = [];
    const run = load('quickScreenBatch', {
      loadRouteReviewTitles: async () => [], benchmarkCalibrationPrompt: () => '', routeReviewOrigins: () => [],
      MONITOR_MODEL: 'fixture-model', QUICK_SCREEN_FAST_TIMEOUT_MS: 24000,
      QUICK_SCREEN_RESCUE_TIMEOUT_MS: 28000, QUICK_SCREEN_RETRY_TIMEOUT_MS: 12000,
      AbortSignal: { timeout: () => undefined },
      fetch: async (_url, request) => {
        const papers = JSON.parse(JSON.parse(request.body).messages[1].content.split('Records: ')[1]);
        requests.push(papers.map(p => p.canonicalId));
        if (requests.length > 1 && papers.length === 14) throw new DOMException('timeout', 'TimeoutError');
        const screens = (papers.length === 14 ? papers.slice(0, 13) : papers).map(p => ({
          canonicalId: p.canonicalId, isPaper: true, relevanceScore: 85, qualityScore: 80, screeningReason: 'Direct evidence.',
        }));
        if (papers.length === 14) screens.push({ ...screens[0], canonicalId: 'unknown-model-identity' });
        return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ screens }) } }] }) };
      },
      monitorErrorCode: () => 'timeout', isNonRetryableDeepSeekError: () => false, setTimeout: callback => callback(),
      parseQuickScreenPayload: content => JSON.parse(content).screens, inferModelScoreScale: () => 'percent',
      normalizeModelScore: score => score, cleanText: text => text, hasStrongFitScoreContradiction: () => false,
      shanghaiDateKey: () => '2026-09-10', recordUsage: async () => {},
      recordReliabilityEvent: async (_db, event) => diagnostics.push(event),
    });
    const database = { prepare: () => ({ bind: () => ({ first: async () => ({ profile_key: domain }) }) }) };
    const first = await run(database, { id: domain }, 'fixture', candidates, 'fixture-only', 'fast', 'resume-14');
    assert.equal(first.length, 13);
    assert.equal(requests.length, 1, 'do not repeat a whole group after preserving valid results');
    assert.equal(diagnostics[0].outcome, 'degraded');
    assert.deepEqual(diagnostics[0].metadata.validation.missingIds, [candidates[13].canonicalId]);
    assert.equal(diagnostics[0].metadata.validation.unexpectedCount, 1);
    const done = new Set(first.map(p => p.canonicalId));
    const remaining = candidates.filter(p => !done.has(p.canonicalId));
    const second = await run(database, { id: domain }, 'fixture', remaining, 'fixture-only', 'fast', 'resume-14');
    assert.deepEqual([...first, ...second].map(p => p.canonicalId), candidates.map(p => p.canonicalId));
    assert.deepEqual(requests[1], [candidates[13].canonicalId]);
    await assert.rejects(run(database, { id: domain }, 'fixture', candidates, 'fixture-only', 'rescue', 'rescue-14'));
  }
});
