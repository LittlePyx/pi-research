import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMathText } from '../lib/math-text.ts';

test('paper title renders the supplied KLS formula without changing its source identity', () => {
  const title = String.raw`The KLS constant is $O(\log^{1/4} n)$`;
  const parts = renderMathText(title);
  assert.equal(parts.map(p => p.source).join(''), title);
  assert.match(parts.map(p => p.html || '').join(''), /class="katex"/);
  assert.match(parts.map(p => p.html || '').join(''), /<math/);
  assert.match(parts.map(p => p.html || '').join(''), /<msup>/);
});

test('all supported delimiters work and currency, escaped dollars and code remain text', () => {
  assert.equal(renderMathText(String.raw`$x^2$ $$y_1$$ \(a+b\) \[c=d\]`).filter(p => p.html).length, 4);
  for (const text of [String.raw`Cost $5 and $10`, String.raw`\$x\$`, '`$x^2$`', '$unfinished', 'plain title']) {
    const parts = renderMathText(text);
    assert.equal(parts.some(p => p.html), false);
    assert.equal(parts.map(p => p.source).join(''), text);
  }
});

test('invalid and hostile expressions fail safely with bounded isolated expansion', () => {
  for (const text of [String.raw`$\notACommand{x}$`, String.raw`$\def\a{\a}\a$`, '$' + 'x'.repeat(4097) + '$']) {
    assert.equal(renderMathText(text).some(p => p.html), false);
    assert.equal(renderMathText(text).map(p => p.source).join(''), text);
  }
  const html = renderMathText(String.raw`$\href{javascript:alert(1)}{x}$ $\includegraphics{https://example.org/evil}$`).map(p => p.html || '').join('');
  assert.doesNotMatch(html, /<a\b|<img\b|href="javascript:/);
  renderMathText(String.raw`$\gdef\secretmacro{x}$`);
  assert.equal(renderMathText(String.raw`$\secretmacro$`).some(p => p.html), false);
});
