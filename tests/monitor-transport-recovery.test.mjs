import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { shouldReclaimMonitorLease } from '../lib/monitor-follower-control.mjs';
const source = fs.readFileSync(new URL('../app/research-app.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('client.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const compiled = ts.transpileModule(['advanceMonitorPipeline', 'followMonitorPipeline'].map(name =>
  ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast)).join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const active = { status: 'deep_reviewing', scanJob: { id: 'same-job' }, leaseToken: 'fixture', leaseGeneration: 1,
  leaseExpiresAt: new Date(Date.now() + 60000).toISOString() };
const ready = { ...active, status: 'ready', scanJob: { id: 'same-job', checkpoint: 'complete' } };
function run(fetch) {
  return new Function('fetch', 'window', 'shouldReclaimMonitorLease', compiled + ';return advanceMonitorPipeline;')(
    fetch, { setTimeout: fn => fn() }, shouldReclaimMonitorLease);
}
test('a canceled advance or response body follows the saved job without a duplicate stage call', async () => {
  for (const phase of ['headers', 'body']) {
    const calls = [], updates = [];
    const result = await run(async (url, options = {}) => {
      calls.push(options.method || 'GET');
      if (calls.length === 1) {
        if (phase === 'headers') throw new TypeError('fixture connection interrupted');
        return { ok: true, json: async () => { throw new DOMException('fixture body interrupted', 'AbortError'); } };
      }
      return { ok: true, json: async () => ({ monitor: ready }) };
    })('space', active, monitor => updates.push(monitor));
    assert.deepEqual(calls, ['POST', 'GET']);
    assert.deepEqual(result, ready);
    assert.deepEqual(updates, [ready]);
  }
});
test('a canceled view stops recovery and explicit server rejection stays visible', async () => {
  let canceled = false, calls = 0;
  const result = await run(async () => { calls++; canceled = true; throw new TypeError('offline'); })(
    'space', active, () => assert.fail('canceled update'), () => canceled);
  assert.equal(calls, 1);
  assert.deepEqual(result, active);
  await assert.rejects(run(async () => ({ ok: false, json: async () => ({ error: 'explicit server failure' }) }))(
    'space', active, () => {}), /explicit server failure/);
});
