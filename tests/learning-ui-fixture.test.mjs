import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fixtureResponse, learningFixture, spaces } from './fixtures/learning-ui-state.mjs';

test('isolated dual-domain fixture preserves stages and history across visits', () => {
  for (const space of spaces) {
    const before = learningFixture(space.id);
    assert.equal(before.learning.path.steps.length, 5);
    assert.equal(before.learning.path.completedSteps, 0);
    assert.equal(before.monitor.historyPapers.length, 2);
    assert.equal(before.learning.path.steps[0].guidanceStatus, 'reading-task');
    assert.equal(before.learning.path.steps[1].guidanceStatus, 'grounded');
    fixtureResponse('/api/monitor', 'POST', space.id);
    fixtureResponse('/api/feedback', 'POST', space.id);
    assert.deepEqual(learningFixture(space.id), before);
  }
  assert.equal(learningFixture('unknown'), null);
});

test('fixture denies generation, progress writes and unrecognized APIs without forwarding', () => {
  for (const path of ['/api/learning-path', '/api/library', '/api/model-settings', '/api/internal/scheduler', '/api/unknown']) {
    for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal(fixtureResponse(path, method, spaces[0].id).status, 403);
  }
  assert.equal(fixtureResponse('/api/learning-path?spaceId=unknown', 'GET', 'unknown').status, 404);
});

test('legacy timeline styles do not size nested learning material buttons as 22px markers', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.v2-learning-path\s+article\s*>/);
  assert.match(css, /\.v2-learning-path > article > button\s*\{[^}]*width: 22px/);
  assert.match(css, /\.v2-learning-reading-list > article > button\s*\{[^}]*display: flex/);
});
