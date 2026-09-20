import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionDraftKey, readSessionDraft, writeSessionDraft, clearSessionDraft } from '../lib/session-draft.ts';

test('tab drafts isolate users, spaces and records, including intentional empty notes', () => {
  const previous = globalThis.sessionStorage;
  const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  try {
    const key = sessionDraftKey('user-a', 'space-a', 'note:1');
    assert.equal(writeSessionDraft(key, 'saved note', ''), true);
    assert.deepEqual(readSessionDraft(key), {base:'saved note', value:''});
    assert.equal(readSessionDraft(sessionDraftKey('user-b', 'space-a', 'note:1')), null);
    assert.equal(readSessionDraft(sessionDraftKey('user-a', 'space-b', 'note:1')), null);
    assert.equal(readSessionDraft(sessionDraftKey('user-a', 'space-a', 'note:2')), null);
    clearSessionDraft(key, 'older submission');
    assert.ok(readSessionDraft(key));
    clearSessionDraft(key, ''); assert.equal(readSessionDraft(key), null);
    values.set(key, 'invalid json'); assert.equal(readSessionDraft(key), null);
    globalThis.sessionStorage.setItem = () => { throw new Error('quota'); };
    assert.equal(writeSessionDraft(key, '', 'keep in editor'), false);
  } finally { if (previous === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previous; }
});
