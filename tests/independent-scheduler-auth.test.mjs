import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { monitorSchedulerSecretMatches } from "../lib/monitor-scheduler.mjs";

test("actual scheduler route accepts either credential and fails closed", async () => {
  const source = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const body = source.split('if (url.pathname === "/api/internal/scheduler" && request.method === "POST") {')[1]
    .split('if (url.pathname === "/api/internal/reliability"')[0].replace(/}\s*$/, "");
  const execute = new Function("request", "env", "ctx", "Response", "monitorSchedulerSecretMatches", "runScheduledMonitorSweep", `return (async () => {${body}})()`);
  for (const [header, env, status, expectedCalls] of [
    ["Bearer old", { MONITOR_SCHEDULER_SECRET: "old", MONITOR_INDEPENDENT_SCHEDULER_SECRET: "new" }, 200, 1],
    ["Bearer new", { MONITOR_SCHEDULER_SECRET: "old", MONITOR_INDEPENDENT_SCHEDULER_SECRET: "new" }, 200, 1],
    ["Bearer new", { MONITOR_INDEPENDENT_SCHEDULER_SECRET: "new" }, 200, 1],
    ["Bearer old", { MONITOR_INDEPENDENT_SCHEDULER_SECRET: "new" }, 401, 0],
    ["Bearer wrong", { MONITOR_SCHEDULER_SECRET: "old" }, 401, 0],
    ["", {}, 503, 0],
  ]) {
    let calls = 0;
    const response = await execute(new Request("https://test.invalid", { headers: { Authorization: header } }), env, {}, Response, monitorSchedulerSecretMatches, async () => { calls++; return { acquired: false }; });
    assert.equal(response.status, status);
    assert.equal(calls, expectedCalls);
  }
  const healthRoute = source.split('if (url.pathname === "/api/internal/reliability"')[1].split('try {')[0];
  assert.doesNotMatch(healthRoute, /MONITOR_INDEPENDENT_SCHEDULER_SECRET/);
});
