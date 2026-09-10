import assert from 'node:assert/strict';
import test from 'node:test';
import { createScreeningRequestTrace } from '../lib/screening-request-trace.mjs';

const input = () => ({
  spaceId: 'math', scanJobId: 'resume-14', model: 'test-model', mode: 'fast', attempt: 1,
  timeoutMs: 24000, maxTokens: 2600, promptCharacters: 18000,
  records: [{ canonicalId: 'doi:qa/one', title: 'QA $\\alpha$', abstract: 'Evidence. '.repeat(90) }],
  apiKey: 'MUST_NOT_LOG_KEY', memoryContext: 'MUST_NOT_LOG_MEMORY',
});

test('request evidence distinguishes response headers, stalled body, and completed validation', () => {
  let clock = 100000;
  const events = [];
  const first = createScreeningRequestTrace(input(), { now: () => clock, emit: event => events.push(event) });
  clock += 250;
  first.headers(200);
  clock += 23750;
  const failed = first.finish('failed', 'timeout');
  assert.equal(failed.phase, 'body');
  assert.equal(failed.httpStatus, 200);
  assert.equal(failed.headersMs, 250);
  assert.equal(failed.bodyMs, null);
  assert.equal(failed.durationMs, 24000);
  assert.equal(failed.completed, 0);
  const fragments = events.filter(event => event.kind === 'screening_request_input');
  assert.deepEqual(JSON.parse(fragments.map(event => event.value).join('')), input().records[0]);
  assert.equal(fragments.every(event => !event.truncated && event.value.length <= 1200), true);
  assert.equal(JSON.stringify(events).includes('MUST_NOT_LOG'), false);

  const successEvents = [];
  const second = createScreeningRequestTrace(input(), { now: () => clock, emit: event => successEvents.push(event) });
  clock += 50;
  second.headers(200);
  clock += 500;
  second.body({ choices: [{ finish_reason: 'stop', message: { content: 'private output', reasoning_content: 'private reasoning' } }],
    usage: { prompt_tokens: 100, completion_tokens: 20 } });
  second.phase('validate');
  clock += 10;
  const passed = second.finish('success', '', 1);
  assert.equal(passed.bodyMs, 500);
  assert.equal(passed.finishReason, 'stop');
  assert.equal(passed.durationMs, 560);
  assert.equal(passed.contentCharacters, 14);
  assert.equal(passed.inputTokens, 100);
  assert.equal(successEvents.length, 2);
  assert.equal(JSON.stringify(successEvents).includes('private'), false);
});

test('timeouts before headers and malformed model output retain distinct failure phases', () => {
  const trace = createScreeningRequestTrace(input(), { emit: () => {} });
  const before = trace.finish('failed', 'timeout');
  assert.equal(before.phase, 'headers');
  assert.equal(before.httpStatus, null);
  assert.equal(before.headersMs, null);
  const parse = createScreeningRequestTrace(input(), { emit: () => {} });
  parse.headers(200);
  parse.body({ choices: [{ finish_reason: 'length', message: { content: '{"screens":[' } }] });
  const malformed = parse.finish('failed', 'invalid_model_output');
  assert.equal(malformed.phase, 'parse');
  assert.equal(malformed.finishReason, 'length');
  assert.equal(malformed.completed, 0);
});

test('trace logging failure never changes screening and oversized snapshots report truncation', () => {
  const trace = createScreeningRequestTrace(input(), { emit: () => { throw new Error('logging unavailable'); } });
  assert.doesNotThrow(() => trace.finish('failed', 'timeout'));
  const events = [];
  const oversized = createScreeningRequestTrace({ ...input(), records: [{ title: 'x'.repeat(25000) }] }, { emit: event => events.push(event) });
  oversized.finish('failed', 'timeout');
  const fragments = events.filter(event => event.kind === 'screening_request_input');
  assert.equal(fragments.length, 16);
  assert.equal(fragments.every(event => event.truncated), true);
});
