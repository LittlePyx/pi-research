import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";

const theme = await readFile(new URL("../app/interface-theme.css", import.meta.url), "utf8");
const root = postcss.parse(theme);
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const demo = await readFile(new URL("../app/demo/demo.module.css", import.meta.url), "utf8");
const rules = [];
root.walkRules((rule) => rules.push(rule));
const declarations = (rule) => Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
const tokens = declarations(rules.find((rule) => rule.selector === ":root"));
const ruleFor = (selector) => rules.find((rule) => rule.selector.includes(selector));

function luminance(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i);
  const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}

test("shared ink, metadata, action and exception colors meet normal-text contrast", () => {
  for (const [foreground, background] of [
    ["ink", "surface"], ["ink", "canvas"], ["muted", "surface-subtle"],
    ["accent", "surface"], ["accent", "accent-soft"],
    ["warning", "warning-soft"], ["error", "error-soft"],
  ]) {
    const a = luminance(tokens[`--pi-${foreground}`]), b = luminance(tokens[`--pi-${background}`]);
    const contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert.ok(contrast >= 4.5, `${foreground}/${background}: ${contrast.toFixed(2)}`);
  }
});

test("common metadata is square and neutral while source text is not styled as a button", () => {
  assert.equal(tokens["--pi-label-radius"], "0");
  const metadata = declarations(ruleFor(".v2-app .v2-freshness-badge,"));
  assert.equal(metadata["border-radius"], "var(--pi-label-radius)");
  assert.equal(metadata.background, "var(--pi-surface-subtle)");
  assert.equal(metadata.color, "var(--pi-muted)");
  for (const selector of [".v2-history-state", ".v2-route-stage-counts", ".v2-learning-resource-signals", ".v2-learning-now > header > b"]) {
    assert.ok(ruleFor(selector), selector);
  }
  const source = declarations(ruleFor(":is(span.v2-freshness-badge, span.v2-paper-discovery-source)"));
  assert.equal(source.border, "0");
  assert.equal(source.background, "transparent");
  assert.equal(source["padding-inline"], "0");
});

test("warning and error exceptions follow metadata normalization and retain distinct tokens", () => {
  const warning = ruleFor(".v2-route-operational.retryable");
  const failure = ruleFor(".v2-learning-empty.error");
  assert.ok(rules.indexOf(warning) > rules.indexOf(ruleFor(".v2-app .v2-freshness-badge,")));
  assert.equal(declarations(warning).color, "var(--pi-warning)");
  assert.equal(declarations(warning).background, "var(--pi-warning-soft)");
  assert.equal(declarations(failure).color, "var(--pi-error)");
  assert.equal(declarations(failure)["border-inline-start"], "2px solid var(--pi-error)");
  for (const state of ["retryable", "degraded", "insufficient", "missing"]) assert.ok(warning.selector.includes(`.v2-learning-now.${state}`));
  const selected = declarations(ruleFor(".v2-library-tabs button.active"));
  assert.equal(selected["border-color"], "var(--pi-accent)");
  assert.ok(ruleFor(":focus-visible"));
});

test("theme is presentation-only and cannot hide statuses, rewrite graph encoding or disable controls", () => {
  root.walkDecls((decl) => {
    assert.ok(!["display", "visibility", "opacity", "pointer-events", "content", "fill", "stroke", "filter", "width", "height", "position"].includes(decl.prop), decl.toString());
    assert.equal(Boolean(decl.important), false);
  });
  root.walkRules((rule) => {
    assert.doesNotMatch(rule.selector, /svg|\.v2-paper-network-edge|\.v2-direction-edge/);
  });
  assert.doesNotMatch(theme, /url\(|gradient\(/);
});

test("the existing app, demo and share surfaces use the same documented visual tokens", () => {
  assert.ok(layout.indexOf('"./interface-theme.css"') > layout.indexOf('"./globals.css"'));
  assert.match(globals, /--v2-canvas: var\(--pi-canvas\)/);
  assert.match(demo, /--demo-ink: var\(--pi-ink\)/);
  assert.match(demo, /border-radius: var\(--pi-label-radius\)/);
  assert.equal(declarations(ruleFor(".share-page .share-badges")).background, "var(--pi-surface-subtle)");
  for (const value of [theme, globals, demo]) {
    for (const [, name] of value.matchAll(/var\((--pi-[\w-]+)/g)) assert.ok(name in tokens, `Undefined token ${name}`);
  }
});
