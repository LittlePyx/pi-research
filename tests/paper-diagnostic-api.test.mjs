import test from 'node:test';
import assert from 'node:assert/strict';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { paperDiagnosticResponse } from '../lib/paper-diagnostic-response.mjs';
import { shouldWakeMonitorScheduler } from '../lib/monitor-scheduler.mjs';

const path = '/api/internal/paper-diagnostic';
test('Diagnostic rejects unbounded or unauthenticated queries before storage and redacts failures', async () => {
  const user = () => ({ userId: 'owner' });
  const unavailable = () => { throw new Error('private runtime detail'); };
  const request = query => new Request(`https://test${path}?${query}`);
  assert.equal((await paperDiagnosticResponse(request(''), () => null, unavailable)).status, 401);
  for (const query of ['', 'spaceId=a', 'spaceId=a&spaceId=b&canonicalId=c',
    'spaceId=a&canonicalId=c&sql=SELECT', `spaceId=a&${Array(9).fill('canonicalId=c').join('&')}`,
    `spaceId=a&canonicalId=${'x'.repeat(301)}`]) {
    const result = await paperDiagnosticResponse(request(query), user, unavailable);
    assert.equal(result.status, 400);
    assert.match(result.headers.get('Cache-Control'), /no-store/);
  }
  const failure = await paperDiagnosticResponse(request('spaceId=a&canonicalId=c'), user, unavailable);
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: 'diagnostic_unavailable' });
  assert.equal(shouldWakeMonitorScheduler('GET', path), false);
});

test('Built diagnostic API enforces owner isolation and makes no schema or data changes', { timeout: 60000 }, async () => {
  const serverDir = fileURLToPath(new URL('../dist/server/', import.meta.url));
  const modules = [];
  for await (const file of glob('**/*.js', { cwd: serverDir })) modules.push({ type: 'ESModule', path: `${serverDir}${file}` });
  const mf = new Miniflare({ host: '127.0.0.1', cf: false, d1Databases: ['DB'],
    compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], modulesRoot: serverDir,
    modules: [{ type: 'ESModule', path: `${serverDir}diagnostic-test-entry.js`, contents:
      "import app from './index.js'; export default {fetch(request, env, ctx){return app.fetch(request,env,ctx)}}" }, ...modules],
    outboundService: () => { throw new Error('Diagnostic must not call external services'); },
  });
  try {
    const db = await mf.getD1Database('DB');
    const cookie = 'pi_anonymous_workspace=diagnostic-test-00000001';
    const url = `https://test${path}?spaceId=a&canonicalId=doi:one`;
    assert.equal((await mf.dispatchFetch(url)).status, 401);
    assert.deepEqual((await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).results, []);
    await db.batch([
      db.prepare('CREATE TABLE research_spaces (id TEXT, owner_user_id TEXT)'),
      db.prepare("INSERT INTO research_spaces VALUES ('a','anonymous:diagnostic-test-00000001'),('b','someone-else')"),
      db.prepare('CREATE TABLE monitored_papers (id TEXT, space_id TEXT, canonical_id TEXT)'),
      db.prepare('CREATE TABLE paper_insights (paper_id TEXT, space_id TEXT, abstract_text TEXT, analysis_source TEXT, verification_status TEXT, ever_recommended INTEGER, updated_at TEXT)'),
      db.prepare('CREATE TABLE monitor_candidate_sources (paper_id TEXT, space_id TEXT, source_key TEXT)'),
      db.prepare('CREATE TABLE monitor_scan_jobs (id TEXT, space_id TEXT, status TEXT, checkpoint TEXT, started_at TEXT, work_queue_json TEXT)'),
      db.prepare("INSERT INTO monitored_papers VALUES ('own','a','doi:one'),('foreign','b','doi:secret')"),
    ]);
    const tables = ['research_spaces', 'monitored_papers', 'paper_insights', 'monitor_candidate_sources', 'monitor_scan_jobs'];
    const snapshot = () => db.batch(tables.map(table => db.prepare(`SELECT * FROM ${table}`)));
    const before = (await snapshot()).map(result => result.results);
    for (const spaceId of ['b', 'nonexistent']) {
      const denied = await mf.dispatchFetch(`https://test${path}?spaceId=${spaceId}&canonicalId=doi:secret`, { headers: { cookie } });
      assert.equal(denied.status, 404);
      assert.deepEqual(await denied.json(), { error: 'space_not_found' });
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await mf.dispatchFetch(url, { headers: { cookie } });
      assert.equal(result.status, 200);
      assert.match(result.headers.get('Cache-Control'), /no-store/);
      assert.match(result.headers.get('Vary'), /Cookie/);
      const report = await result.json();
      assert.equal(report.papers[0].found, true);
      assert.equal(report.papers[0].evidence.availability, 'unknown');
      assert.deepEqual(report.papers[0].recentJobs, []);
      assert.ok(!JSON.stringify(report).includes('doi:secret'));
    }
    assert.deepEqual((await snapshot()).map(result => result.results), before);
    assert.equal((await mf.dispatchFetch(url, { method: 'POST', headers: { cookie } })).status, 405);
  } finally { await mf.dispose(); }
});
