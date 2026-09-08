import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import worker, { TARGET, wakeResearch } from "../infra/scheduler/worker.mjs";

const env = { MONITOR_SCHEDULER_SECRET: "synthetic-test-secret" };
const reply = (body) => Response.json(body);
test("independent scheduler uses one fixed authenticated request and allowlisted counts", async () => {
  let calls = 0;
  const result = await wakeResearch(env, async (url, options) => {
    calls++;
    assert.equal(url, TARGET);
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers.Authorization, "Bearer synthetic-test-secret");
    assert.ok(options.signal instanceof AbortSignal);
    return reply({ acquired: true, startedCount: 2, advancedCount: 1, completedCount: 0, failedCount: 0, privateData: "omit" });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { outcome: "sweep_finished", startedCount: 2, advancedCount: 1, completedCount: 0 });
});
test("scheduler uses public Worker routing without exposing a public trigger", async () => {
  const config = JSON.parse(await readFile(new URL('../infra/scheduler/wrangler.jsonc', import.meta.url), 'utf8'));
  assert.ok(config.compatibility_flags.includes('global_fetch_strictly_public'));
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  let calls = 0;
  await assert.rejects(wakeResearch(env, async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'manual');
    return new Response('private redirect body', { status: 302, headers: { Location: 'https://example.invalid/private' } });
  }), { message: 'scheduler_http_302' });
  assert.equal(calls, 1);
});
test("lease contention is not reported as completed work", async () => {
  assert.deepEqual(await wakeResearch(env, async () => reply({ acquired: false })), { outcome: "lease_not_acquired" });
});
test("missing secret and public requests cannot trigger research", async () => {
  let calls = 0;
  await assert.rejects(wakeResearch({}, async () => { calls++; }), /scheduler_secret_missing/);
  assert.equal(calls, 0);
  assert.equal(worker.fetch().status, 404);
});
test("failures never expose upstream content or retry requests", async () => {
  for (const [fetcher, message] of [
    [async () => { throw new Error("private upstream value"); }, "scheduler_network_failed"],
    [async () => { throw new DOMException("private timeout", "TimeoutError"); }, "scheduler_request_timeout"],
    [async () => new Response("private", { status: 401 }), "scheduler_http_401"],
    [async () => new Response("private", { status: 403 }), "scheduler_http_403"],
    [async () => new Response("private", { status: 502 }), "scheduler_http_502"],
    [async () => new Response("not json"), "scheduler_invalid_json"],
  ]) {
    let calls = 0;
    await assert.rejects(wakeResearch(env, (...args) => { calls++; return fetcher(...args); }), { message });
    assert.equal(calls, 1);
  }
});
test("malformed or failed sweeps cannot be reported as success", async () => {
  for (const payload of [null, {}, { acquired: "true" }, { acquired: true }, { acquired: true, startedCount: 1, advancedCount: -1, completedCount: 0, failedCount: 0 }]) {
    await assert.rejects(wakeResearch(env, async () => reply(payload)), /scheduler_invalid/);
  }
  await assert.rejects(wakeResearch(env, async () => reply({ acquired: true, startedCount: 1, advancedCount: 0, completedCount: 0, failedCount: 1 })), /scheduler_sweep_failed/);
});
