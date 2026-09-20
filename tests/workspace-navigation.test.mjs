import assert from 'node:assert/strict';
import test from 'node:test';
import { focusWorkspaceSection } from '../lib/workspace-section-navigation.ts';
import { readWorkspaceLocation, workspaceHash } from '../lib/workspace-navigation.ts';

test('workspace links preserve paper identity, route subpage, scope and return destination', () => {
  const location = {view:'paper-detail', id:'paper-1', space:'space-1', from:'thread-detail', track:'route-2', tab:'evidence'};
  assert.deepEqual(readWorkspaceLocation(workspaceHash(location)), {...location, graph:undefined, step:undefined, path:undefined});
  assert.equal(readWorkspaceLocation('#thread/route-2/agenda').tab, 'agenda');
  assert.equal(readWorkspaceLocation('#workbook/route-2?from=learn').from, 'learn');
  assert.equal(readWorkspaceLocation('#threads?graph=paper-1').graph, 'paper-1');
});

test('invalid detail identities and unknown destinations fail closed', () => {
  for (const hash of ['#paper', '#thread/../../bad', '#workbook/%3Cscript%3E', '#unknown']) {
    assert.deepEqual(readWorkspaceLocation(hash), {view:'today'});
  }
  const location = readWorkspaceLocation('#thread/route-2/invented?from=paper-detail&space=%3Cscript%3E');
  assert.equal(location.tab, 'start'); assert.equal(location.from, undefined); assert.equal(location.space, undefined);
});

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
