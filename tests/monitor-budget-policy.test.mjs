import assert from "node:assert/strict";
import test from "node:test";
import { buildMonitorBudgetDecision } from "../lib/monitor-budget-policy.mjs";

test("manual scanning falls back to a compact fresh-only pass when six calls remain", () => {
  const decision = buildMonitorBudgetDecision({
    globalRemaining: 486,
    workspaceRemaining: 6,
    spaceRemaining: 37,
    otherSpaceUsages: [42, 45],
  });
  assert.equal(decision.remaining, 6);
  assert.equal(decision.fullAvailable, false);
  assert.equal(decision.compactAvailable, true);
  assert.equal(decision.available, true);
  assert.equal(decision.recommendedMode, "fresh_only");
});

test("background scanning preserves the base reserve of other research spaces", () => {
  const decision = buildMonitorBudgetDecision({
    globalRemaining: 400,
    workspaceRemaining: 80,
    spaceRemaining: 64,
    otherSpaceUsages: [0, 0],
  });
  assert.equal(decision.protectedForOtherSpaces, 48);
  assert.equal(decision.backgroundRemaining, 32);
  assert.equal(decision.backgroundAvailable, true);
});

test("compact scanning waits when fewer than six calls remain", () => {
  const decision = buildMonitorBudgetDecision({
    globalRemaining: 400,
    workspaceRemaining: 5,
    spaceRemaining: 20,
    otherSpaceUsages: [30],
  });
  assert.equal(decision.available, false);
  assert.equal(decision.recommendedMode, "wait");
});

test("checkpoint resumes use their smaller requirement instead of compact mode", () => {
  const decision = buildMonitorBudgetDecision({
    globalRemaining: 3,
    workspaceRemaining: 3,
    spaceRemaining: 3,
    minimumCalls: 2,
  });
  assert.equal(decision.fullAvailable, true);
  assert.equal(decision.compactAvailable, false);
  assert.equal(decision.recommendedMode, "full");
});
