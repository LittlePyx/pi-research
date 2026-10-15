import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const key = "sk-test-placeholder-for-probe-only";
const models = () => Response.json({ data: [{ id: "deepseek-flash" }] });
const chat = () => Response.json({ choices: [{ message: { content: "OK" } }] });
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness(plan = []) {
  const calls = [], timers = new Map(), logs = [];
  let timerId = 0, clock = 0, authenticated = true;
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const step = plan.shift();
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step() : step ?? new Promise(() => {});
  };
  function load(file, dependencies) {
    const exports = {};
    const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("require", "exports", "fetch", "setTimeout", "clearTimeout", "console", code)(
      name => dependencies[name] ?? require(name), exports, fetch,
      (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: clock + ms }); return id; },
      id => timers.delete(id), { warn: (...args) => logs.push(args) },
    );
    return exports;
  }
  const credentials = load("lib/model-credentials.ts", { "../db/repository": { getRuntimeEnv: () => ({}) } });
  const route = load("app/api/model-settings/route.ts", { "../../../db/repository": { getApiUser: () => authenticated ? { id: "test" } : null }, "../../../lib/model-credentials": credentials });
  const client = load("lib/model-settings-request.ts", { "./workspace-request": { workspaceFetch: fetch } });
  const request = (method = "POST", body = { apiKey: key }) => new Request("https://test.invalid/api/model-settings?verify=1", {
    method, headers: { "Content-Type": "application/json", cookie: `pi_deepseek_api_key=${key}` }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
  return { calls, logs, timers, credentials, route, client, request, setAuthenticated(value) { authenticated = value; }, advance(ms) { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); } } };
}

test("the saved key is verified with a real non-thinking completion, then stored only in a secure cookie", async () => {
  const h = harness([models, chat]);
  const result = await h.route.POST(h.request());
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.configured, true);
  assert.deepEqual(body.availableModels, ["deepseek-flash"]);
  assert.deepEqual(JSON.parse(h.calls[1].init.body).thinking, { type: "disabled" });
  assert.equal(JSON.parse(h.calls[1].init.body).max_tokens, 4);
  assert.match(result.headers.get("set-cookie"), /HttpOnly; SameSite=Strict; Max-Age=2592000; Secure/);
  assert.equal(JSON.stringify(body).includes(key), false);
  assert.equal(h.timers.size, 0);
});

for (const [status, code] of [[401, "deepseek_credential_invalid"], [402, "deepseek_insufficient_balance"], [429, "deepseek_rate_limited"], [403, "deepseek_access_denied"], [500, "deepseek_unavailable"], [503, "deepseek_unavailable"]]) {
  for (const phase of ["models", "chat"]) test(`${phase} HTTP ${status} is classified without leaking provider text or saving a key`, async () => {
    const failure = () => new Response(`provider echoed ${key}`, { status });
    const h = harness(phase === "chat" ? [models, failure] : [failure]);
    const response = await h.route.POST(h.request());
    assert.equal(response.status, status === 429 ? 429 : 502);
    assert.deepEqual(await response.json(), { error: code, phase });
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(JSON.stringify(h.logs).includes(key), false);
    assert.equal(h.calls.length, phase === "chat" ? 2 : 1);
    assert.equal(h.timers.size, 0);
  });
}

for (const phase of ["models", "chat"]) test(`${phase} timeout ends the probe even if fetch ignores abort; retry succeeds`, async () => {
  const h = harness(phase === "chat" ? [models] : []);
  const pending = h.route.POST(h.request());
  await settle();
  h.advance(phase === "chat" ? 25_000 : 20_000);
  const response = await pending;
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: "deepseek_timeout", phase });
  assert.equal(h.calls.at(-1).init.signal.aborted, true);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(h.timers.size, 0);
  // A fresh invocation has its own deadline and can recover normally.
  const recovered = harness([models, chat]);
  assert.equal((await recovered.route.POST(recovered.request())).status, 200);
});

test("a stalled response body is covered by the server deadline", async () => {
  const h = harness([() => ({ ok: true, json: () => new Promise(() => {}) })]);
  const pending = h.route.POST(h.request());
  await settle(); h.advance(20_000);
  assert.equal((await pending).status, 504);
  assert.equal(h.timers.size, 0);
});

test("network errors remain transport failures with safe logs", async () => {
  const h = harness([new TypeError(`fetch failed ${key}`)]);
  const response = await h.route.GET(h.request("GET"));
  assert.deepEqual(await response.json(), { error: "deepseek_network_error", phase: "models" });
  assert.equal(JSON.stringify(h.logs).includes(key), false);
});

for (const bad of [() => new Response("<html>bad gateway</html>"), () => Response.json(null), () => Response.json({}), () => Response.json({ choices: [{ message: { content: "" } }] })]) {
  test("HTTP 200 without an actual completion does not verify or save a key", async () => {
    const h = harness([models, bad]);
    const response = await h.route.POST(h.request());
    assert.deepEqual(await response.json(), { error: "deepseek_invalid_response", phase: "chat" });
    assert.equal(response.headers.get("set-cookie"), null);
  });
}

test("malformed model metadata is rejected before attempting completion", async () => {
  const h = harness([() => Response.json({ data: [null] })]);
  const response = await h.route.GET(h.request("GET"));
  assert.deepEqual(await response.json(), { error: "deepseek_invalid_response", phase: "models" });
  assert.equal(h.calls.length, 1);
});

test("missing workspace sessions and malformed key values never reach the provider", async () => {
  const h = harness(); h.setAuthenticated(false);
  for (const method of ["GET", "POST", "DELETE"]) {
    const response = await h.route[method](h.request(method));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "workspace_session_required");
  }
  h.setAuthenticated(true);
  for (const apiKey of [null, 123, {}, "bad"]) assert.equal((await h.route.POST(h.request("POST", { apiKey }))).status, 400);
  assert.equal(h.calls.length, 0);
});

test("browser requests time out without late results replacing a successful retry", async () => {
  let resolveLate;
  const h = harness([() => new Promise(resolve => { resolveLate = resolve; }), () => Response.json({ configured: true })]);
  const first = h.client.modelSettingsRequest("/api/model-settings?verify=1");
  const rejected = assert.rejects(first, /deepseek_timeout/);
  h.advance(50_000); await rejected;
  assert.equal(h.calls[0].init.signal.aborted, true);
  assert.equal((await h.client.modelSettingsRequest("/api/model-settings?verify=1")).data.configured, true);
  resolveLate(Response.json({ configured: false })); await settle();
  assert.equal(h.timers.size, 0);
});

test("browser response bodies share the deadline; HTML proxy failures and auth failures get useful codes", async () => {
  const h = harness([() => ({ ok: true, json: () => new Promise(() => {}) })]);
  const pending = h.client.modelSettingsRequest("/api/model-settings");
  const rejected = assert.rejects(pending, /deepseek_timeout/);
  await settle(); h.advance(50_000); await rejected;
  for (const [status, expected] of [[401, "workspace_session_required"], [403, "workspace_session_required"], [429, "deepseek_rate_limited"], [504, "deepseek_timeout"], [502, "deepseek_unavailable"], [200, "deepseek_invalid_response"]]) {
    const next = harness([() => new Response("<html>proxy error</html>", { status })]);
    await assert.rejects(next.client.modelSettingsRequest("/api/model-settings"), new RegExp(expected));
    assert.equal(next.timers.size, 0);
  }
});

test("the browser preserves structured provider failure codes", async () => {
  const h = harness([() => Response.json({ error: "deepseek_insufficient_balance", phase: "chat" }, { status: 502 })]);
  await assert.rejects(h.client.modelSettingsRequest("/api/model-settings"), /deepseek_insufficient_balance/);
});
