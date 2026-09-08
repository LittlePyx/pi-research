import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { readPaperDiagnostic } from '../lib/paper-diagnostic.mjs';

test('Paper diagnostic rejects unbounded inputs before accessing storage', async () => {
  const database = { prepare() { throw new Error('must not access storage'); } };
  await assert.rejects(readPaperDiagnostic(database, '', ['a']), /invalid_space/);
  await assert.rejects(readPaperDiagnostic(database, 'a', []), /invalid_identities/);
  await assert.rejects(readPaperDiagnostic(database, 'a', Array(9).fill('a')), /invalid_identities/);
});

test('Diagnostic SQL is compatible with the existing production bootstrap schema', { timeout:30000 }, async () => {
  const repository = await readFile(new URL('../db/repository.ts',import.meta.url),'utf8');
  const mf = new Miniflare({host:'127.0.0.1',cf:false,modules:true,d1Databases:['DB'],script:'export default {fetch(){return new Response("ok")}}'});
  try {
    const db = await mf.getD1Database('DB');
    const definitions = [...repository.matchAll(/database\.prepare\("(CREATE TABLE IF NOT EXISTS [^"]*)"\)/g)];
    for (const table of ['research_spaces','monitored_papers','paper_insights','monitor_candidate_sources','monitor_scan_jobs']) {
      const sql = definitions.find(match=>match[1].startsWith(`CREATE TABLE IF NOT EXISTS ${table} `))?.[1];
      assert.ok(sql,table);
      await db.prepare(sql).run();
    }
    const report = await readPaperDiagnostic(db,'absent',['doi:absent']);
    assert.equal(report.papers[0].found,false);
    assert.deepEqual(report.papers[0].recentJobs,[]);
  } finally {await mf.dispose();}
});

test('Internal diagnostic executes read-only D1 queries with workspace isolation and honest unknowns', { timeout: 30000 }, async () => {
  const mf = new Miniflare({ host:'127.0.0.1', cf:false, modules:true, d1Databases:['DB'], script:'export default {fetch(){return new Response("ok")}}' });
  try {
    const db = await mf.getD1Database('DB');
    // Match only the columns read; the production-schema contract below checks names.
    await db.batch([
      db.prepare('CREATE TABLE monitored_papers (id TEXT, space_id TEXT, canonical_id TEXT)'),
      db.prepare('CREATE TABLE paper_insights (paper_id TEXT, space_id TEXT, abstract_text TEXT, analysis_source TEXT, verification_status TEXT, ever_recommended INTEGER, updated_at TEXT)'),
      db.prepare('CREATE TABLE monitor_candidate_sources (paper_id TEXT, space_id TEXT, source_key TEXT)'),
      db.prepare('CREATE TABLE monitor_scan_jobs (id TEXT, space_id TEXT, status TEXT, checkpoint TEXT, started_at TEXT, work_queue_json TEXT)'),
      db.prepare("INSERT INTO monitored_papers VALUES ('p','a','doi:one'),('q','a','doi:two'),('foreign','b','doi:foreign')"),
      db.prepare("INSERT INTO paper_insights VALUES ('p','a','stored abstract','deepseek_screened','pending',0,'today'),('p','b','foreign secret','deepseek','verified',1,'today')"),
      db.prepare("INSERT INTO monitor_candidate_sources VALUES ('p','a','research-route:learning'),('p','b','research-route:learning')"),
      db.prepare('INSERT INTO monitor_scan_jobs VALUES (?,?,?,?,?,?)').bind('job','a','reviewing','deep_reviewing','2026-09-08',JSON.stringify({candidateIds:['doi:one'],deepIds:[],screens:[{canonicalId:'doi:one'}],privatePayload:'must not escape'})),
      db.prepare("INSERT INTO monitor_scan_jobs VALUES ('old','a','ready','ready','2026-09-07','invalid json')"),
      db.prepare("INSERT INTO monitor_scan_jobs VALUES ('foreign','b','ready','ready','2026-09-09','{}')"),
    ]);
    const before = await db.prepare('SELECT * FROM paper_insights').all();
    const report = await readPaperDiagnostic(db,'a',['doi:one','doi:two','doi:foreign',"' OR 1=1 --"]);
    assert.equal(report.papers[0].evidence.availability,'stored');
    assert.equal(report.papers[0].provenance.learningSourceCount,1);
    assert.equal(report.papers[0].review.everRecommended,false);
    assert.equal(report.papers[0].recentJobs[0].screened,true);
    assert.equal(report.papers[0].recentJobs[0].selectedForDeepReview,false);
    assert.equal(report.papers[0].recentJobs[1].candidate,null);
    assert.equal(report.papers[1].evidence.availability,'unknown');
    assert.equal(report.papers[2].found,false);
    assert.equal(report.papers[3].found,false);
    assert.equal(report.scope.historicalAbsenceIsUnknown,true);
    assert.ok(!JSON.stringify(report).includes('must not escape'));
    assert.ok(!JSON.stringify(report).includes('foreign secret'));
    assert.deepEqual((await db.prepare('SELECT * FROM paper_insights').all()).results,before.results);
    const source = await readFile(new URL('../lib/paper-diagnostic.mjs',import.meta.url),'utf8');
    assert.doesNotMatch(source,/\b(UPDATE|INSERT|DELETE|CREATE|ALTER)\b/);
  } finally { await mf.dispose(); }
});
