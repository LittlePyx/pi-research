import assert from 'node:assert/strict';
import test from 'node:test';
import { focusWorkspaceSection } from '../lib/workspace-section-navigation.ts';

test('section navigation reveals nested notes, focuses content and respects reduced motion', () => {
  const previous = { document: globalThis.document, window: globalThis.window, HTMLDetailsElement: globalThis.HTMLDetailsElement };
  try {
    class Details { open = false; parentElement = null; }
    globalThis.HTMLDetailsElement = Details;
    const outer = new Details(), inner = new Details(); inner.parentElement = outer;
    let focused, scrolled;
    const note = { parentElement: inner, tabIndex: 0, focus: options => { focused = options; }, scrollIntoView: options => { scrolled = options; } };
    globalThis.document = { querySelector: target => target === '#notes' ? note : null };
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    assert.equal(focusWorkspaceSection('#notes'), true);
    assert.equal(inner.open, true); assert.equal(outer.open, true);
    assert.deepEqual(focused, { preventScroll: true });
    assert.deepEqual(scrolled, { block: 'start', behavior: 'auto' });
    assert.equal(note.tabIndex, -1);
    globalThis.window.matchMedia = () => ({ matches: false });
    focusWorkspaceSection('#notes'); assert.equal(scrolled.behavior, 'smooth');
    assert.equal(focusWorkspaceSection('#missing'), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
