import assert from "node:assert/strict";
import test from "node:test";
import worker, { TARGET, wakeResearch } from "../infra/scheduler/worker.mjs";

const env = { MONITOR_SCHEDULER_SECRET: "synthetic-test-secret" };
const reply = (body) => Response.json(body);
test("independent scheduler uses one fixed authenticated request and allowlisted counts", async () => {
  let calls = 0;
  const result = await wakeResearch(env, async (url, options) => {
    calls++;
    assert.equal(url, TARGET);
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer synthetic-test-secret");
    assert.ok(options.signal instanceof AbortSignal);
    return reply({ acquired: true, startedCount: 2, advancedCount: 1, completedCount: 0, failedCount: 0, privateData: "omit" });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { outcome: "sweep_finished", startedCount: 2, advancedCount: 1, completedCount: 0 });
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
  for (const fetcher of [async () => { throw new Error("private upstream value"); }, async () => new Response("private", { status: 401 }), async () => new Response("not json")]) {
    let calls = 0;
    await assert.rejects(wakeResearch(env, (...args) => { calls++; return fetcher(...args); }), { message: "scheduler_request_failed" });
    assert.equal(calls, 1);
  }
});
test("malformed or failed sweeps cannot be reported as success", async () => {
  for (const payload of [null, {}, { acquired: "true" }, { acquired: true }, { acquired: true, startedCount: 1, advancedCount: -1, completedCount: 0, failedCount: 0 }]) {
    await assert.rejects(wakeResearch(env, async () => reply(payload)), /scheduler_invalid/);
  }
  await assert.rejects(wakeResearch(env, async () => reply({ acquired: true, startedCount: 1, advancedCount: 0, completedCount: 0, failedCount: 1 })), /scheduler_sweep_failed/);
});
