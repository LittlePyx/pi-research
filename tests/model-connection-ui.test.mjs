import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { modelConnectionFailureState, modelConnectionProblemCopy } from "../lib/model-connection-state.ts";
import { activateModalFocus } from "../lib/modal-focus.ts";

test("balance, authentication, provider limits and transport failures have distinct model states", () => {
  for (const error of ["deepseek_insufficient_balance", "Insufficient Balance", "余额不足"]) {
    assert.equal(modelConnectionFailureState(new Error(error)), "balance");
  }
  for (const error of ["deepseek_credential_invalid", "Invalid API key"]) assert.equal(modelConnectionFailureState(error), "invalid");
  for (const error of ["DeepSeek returned 429", "Rate limit reached", "Too many requests"]) assert.equal(modelConnectionFailureState(error), "rate_limited");
  for (const error of ["fetch failed", "timeout", "502", "Unauthorized workspace", "Anonymous workspace is not initialized"]) assert.equal(modelConnectionFailureState(error), "unavailable");
  for (const state of ["balance", "rate_limited", "unavailable"]) {
    for (const locale of ["zh", "en"]) {
      const copy = modelConnectionProblemCopy(state, locale);
      assert.ok(copy.title && copy.detail && copy.modal);
      assert.doesNotMatch(copy.title, /失效|expired|invalid/i);
    }
  }
  assert.equal(modelConnectionProblemCopy("connected", "zh"), null);
});

test("sidebar entry handlers close mobile navigation before opening either dialog", async () => {
  const source = await readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8");
  for (const setter of ["setSpaceDialog", "setModelSettingsOpen"]) {
    const body = source.match(new RegExp(`onClick=\\{\\(\\) => \\{ (setMobileNav\\(false\\); ${setter}\\(true\\);) \\}\\}`))?.[1];
    assert.ok(body);
    const calls = [];
    new Function("setMobileNav", setter, body)((value) => calls.push(["nav", value]), (value) => calls.push(["dialog", value]));
    assert.deepEqual(calls, [["nav", false], ["dialog", true]]);
  }
  assert.doesNotMatch(source, /isModelCredentialFailure\(error\) \? "invalid" : "checking"/);
  assert.match(source, /if \(!statusResponse.ok\) throw new Error/);
});

test("modal focuses content, traps both Tab directions, closes on Escape and restores the mobile entry", () => {
  const original = globalThis.HTMLElement;
  let keyHandler, closed = 0;
  const doc = { activeElement: null, body: { style: { overflow: "auto" } }, addEventListener: (_, fn) => { keyHandler = fn; }, removeEventListener: (_, fn) => { assert.equal(fn, keyHandler); keyHandler = null; } };
  class Element {
    constructor(sidebar = false) { this.sidebar = sidebar; this.inert = false; this.isConnected = true; this.ownerDocument = doc; this.classList = { contains: () => false }; }
    getClientRects() { return [1]; }
    focus() { doc.activeElement = this; }
    closest(selector) { return selector === ".v2-sidebar" && this.sidebar ? this : null; }
  }
  globalThis.HTMLElement = Element;
  try {
    const trigger = new Element(true), menu = new Element(), background = new Element(), dialog = new Element();
    const first = new Element(), last = new Element();
    dialog.parentElement = { children: [background, dialog] };
    dialog.querySelectorAll = () => [first, last];
    trigger.focus();
    const cleanup = activateModalFocus(dialog, () => { closed++; }, menu);
    assert.equal(doc.activeElement, first);
    assert.equal(background.inert, true);
    assert.equal(doc.body.style.overflow, "hidden");
    let prevented = 0, stopped = 0;
    const event = (key, shiftKey = false) => ({ key, shiftKey, preventDefault: () => { prevented++; }, stopImmediatePropagation: () => { stopped++; } });
    keyHandler(event("Tab", true));
    assert.equal(doc.activeElement, last);
    keyHandler(event("Tab"));
    assert.equal(doc.activeElement, first);
    keyHandler(event("Escape"));
    assert.equal(closed, 1);
    assert.equal(stopped, 1);
    assert.equal(prevented, 3);
    cleanup();
    assert.equal(doc.activeElement, menu);
    assert.equal(background.inert, false);
    assert.equal(doc.body.style.overflow, "auto");
    assert.equal(keyHandler, null);
  } finally { globalThis.HTMLElement = original; }
});
