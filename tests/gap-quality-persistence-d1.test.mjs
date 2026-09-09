import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { enqueueMonitorCandidates } from '../lib/monitor-candidate-queue.ts';
import { completeResearchGapDiscovery } from '../lib/research-gap-discovery.ts';

test('partial source failure retains real D1 candidates, evidence, provenance and prior feedback', { timeout: 30000 }, async () => {
  const repository = await readFile(new URL('../db/repository.ts', import.meta.url), 'utf8');
  const tables = ['monitored_papers', 'paper_insights', 'monitor_candidate_sources', 'monitor_runs', 'paper_feedback', 'paper_reading_progress'];
  const statements = [...repository.matchAll(/database\.prepare\("(CREATE (?:TABLE|UNIQUE INDEX) IF NOT EXISTS [^"]*)"\)/g)]
    .map((match) => match[1]).filter((sql) => tables.some((table) => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${table} `) || sql.includes(` ON ${table}(`)));
  assert.equal(statements.filter((sql) => sql.startsWith('CREATE TABLE')).length, tables.length);
  const mf = new Miniflare({ host: '127.0.0.1', cf: false, modules: true, d1Databases: ['DB'],
    script: 'export default { fetch() { return new Response("isolated test"); } };' });
  try {
    const db = await mf.getD1Database('DB');
    await db.batch([
      db.prepare('CREATE TABLE research_spaces (id TEXT PRIMARY KEY)'),
      ...statements.map((sql) => db.prepare(sql)),
      db.prepare(`CREATE TABLE research_gap_discovery_jobs (id TEXT PRIMARY KEY, status TEXT, attempt_count INTEGER,
        queued_count INTEGER DEFAULT 0, source_status_json TEXT, error TEXT, next_retry_at TEXT,
        completed_at TEXT, lock_token TEXT, lock_expires_at TEXT, updated_at TEXT)`),
      db.prepare("INSERT INTO research_spaces VALUES ('fixture-space')"),
    ]);
    const candidate = { canonicalId: 'doi:fixture-original', doi: 'fixture-original', title: 'Fixture original paper',
      authors: 'Fixture author', venue: 'Fixture journal', url: 'https://example.org/fixture', publishedAt: '1948-01-01',
      source: 'crossref', horizon: 'years', citationCount: 100, relevanceScore: 95, abstractText: '', qualityScore: 90,
      priorityVenue: false, provenance: [{ sourceKey: 'research-route:learning', channel: 'topic', queryKey: 'fixture-gap' }] };
    const first = await enqueueMonitorCandidates(db, 'fixture-space', [candidate]);
    assert.equal(first.newCandidateCount, 1);
    assert.equal(first.queuedForReviewCount, 1);
    assert.equal(first.recommendedCount, 0);
    const identity = await db.prepare('SELECT id FROM monitored_papers WHERE canonical_id = ?').bind(candidate.canonicalId).first();
    const reviewed = { ...candidate, canonicalId: 'doi:fixture-history', doi: 'fixture-history', title: 'Older fixture paper' };
    await enqueueMonitorCandidates(db, 'fixture-space', [reviewed]);
    const history = await db.prepare('SELECT id FROM monitored_papers WHERE canonical_id = ?').bind(reviewed.canonicalId).first();
    await db.batch([
      db.prepare("UPDATE paper_insights SET analysis_source='deepseek', analysis_model='fixture-model', llm_recommended=1, ever_recommended=1, abstract_text='Prior reviewed evidence' WHERE paper_id=?").bind(history.id),
      db.prepare("INSERT INTO paper_feedback (id,space_id,paper_id,feedback,note) VALUES ('feedback','fixture-space',?,'not_relevant','Keep this feedback')").bind(history.id),
      db.prepare("INSERT INTO paper_reading_progress (id,space_id,paper_id,status,note) VALUES ('reading','fixture-space',?,'reading','Keep this note')").bind(history.id),
      db.prepare("INSERT INTO research_gap_discovery_jobs (id,status,attempt_count,queued_count,lock_token) VALUES ('fixture-gap','running',7,5,'fixture-lock')"),
    ]);
    const richer = { ...candidate, source: 'openalex', abstractText: 'Available structured abstract evidence from a healthy source.',
      provenance: [{ sourceKey: 'openalex:classic-rescue', channel: 'topic', queryKey: 'fixture-gap' }] };
    const second = await enqueueMonitorCandidates(db, 'fixture-space', [richer, reviewed]);
    assert.equal(second.newCandidateCount, 0);
    assert.equal(second.queuedForReviewCount, 1);
    assert.equal(second.recommendedCount, 0, 'ignored history cannot become a new recommendation');
    const result = await completeResearchGapDiscovery(db, { id: 'fixture-gap', lockToken: 'fixture-lock', degraded: true,
      discoveredCount: 1, queuedCount: second.queuedForReviewCount,
      sourceStatuses: [{ source: 'openalex', status: 'ok', candidateCount: 1 }, { source: 'semantic-scholar', status: 'failed', error: '429' }],
      error: 'source_unavailable', now: new Date('2026-09-09T00:00:00Z'), unboundedRetries: true });
    assert.equal(result.status, 'retryable');
    const gap = await db.prepare("SELECT * FROM research_gap_discovery_jobs WHERE id='fixture-gap'").first();
    assert.equal(gap.status, 'retryable');
    assert.equal(gap.queued_count, 6, 'cumulative enqueue observations are not unique paper counts');
    assert.equal(gap.lock_token, null);
    assert.equal(gap.completed_at, null);
    assert.equal(gap.error, 'source_unavailable');
    await enqueueMonitorCandidates(db, 'fixture-space', [candidate, reviewed]);
    assert.equal((await db.prepare('SELECT count(*) n FROM monitored_papers').first()).n, 2);
    assert.equal((await db.prepare('SELECT id FROM monitored_papers WHERE canonical_id=?').bind(candidate.canonicalId).first()).id, identity.id);
    const evidence = await db.prepare('SELECT abstract_text,analysis_source,llm_recommended,ever_recommended FROM paper_insights WHERE paper_id=?').bind(identity.id).first();
    assert.equal(evidence.abstract_text, richer.abstractText);
    assert.equal(evidence.analysis_source, 'metadata');
    assert.equal(evidence.llm_recommended, 0);
    assert.equal(evidence.ever_recommended, 0);
    assert.equal((await db.prepare('SELECT count(*) n FROM monitor_candidate_sources WHERE paper_id=?').bind(identity.id).first()).n, 2);
    assert.equal((await db.prepare('SELECT abstract_text FROM paper_insights WHERE paper_id=?').bind(history.id).first()).abstract_text, 'Prior reviewed evidence');
    assert.equal((await db.prepare("SELECT note FROM paper_feedback WHERE id='feedback'").first()).note, 'Keep this feedback');
    assert.equal((await db.prepare("SELECT status,note FROM paper_reading_progress WHERE id='reading'").first()).status, 'reading');
    assert.equal((await db.prepare("SELECT note FROM paper_reading_progress WHERE id='reading'").first()).note, 'Keep this note');
  } finally { await mf.dispose(); }
});

test('rediscovery enriches pending reviews without rewriting decisions or dismissed history', { timeout: 30000 }, async () => {
  const repository = await readFile(new URL('../db/repository.ts', import.meta.url), 'utf8');
  const tables = ['monitored_papers', 'paper_insights', 'monitor_candidate_sources', 'monitor_runs', 'paper_feedback'];
  const statements = [...repository.matchAll(/database\.prepare\("(CREATE (?:TABLE|UNIQUE INDEX) IF NOT EXISTS [^"]*)"\)/g)]
    .map((match) => match[1]).filter((sql) => tables.some((table) => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${table} `) || sql.includes(` ON ${table}(`)));
  const mf = new Miniflare({ host: '127.0.0.1', cf: false, modules: true, d1Databases: ['DB'],
    script: 'export default { fetch() { return new Response("isolated test"); } };' });
  try {
    const db = await mf.getD1Database('DB');
    await db.batch([db.prepare('CREATE TABLE research_spaces (id TEXT PRIMARY KEY)'),
      ...statements.map((sql) => db.prepare(sql)), db.prepare("INSERT INTO research_spaces VALUES ('fixture-space')")]);
    const base = { doi: null, authors: 'Fixture author', venue: 'Fixture venue', url: 'https://example.org/fixture',
      publishedAt: '1995-01-01', source: 'crossref', horizon: 'years', citationCount: 10, relevanceScore: 60,
      abstractText: '', qualityScore: 60, priorityVenue: false,
      provenance: [{ sourceKey: 'research-route:learning', channel: 'topic', queryKey: 'fixture-gap' }] };
    const cases = [
      ['screened', 'deepseek_screened', false, false, true],
      ['pending', 'deepseek_verification_pending', false, false, true],
      ['reviewed', 'deepseek', true, false, false],
      ['rejected', 'deepseek_rejected', false, false, false],
      ['dismissed', 'deepseek_screened', false, true, false],
      ['historical', 'deepseek_verification_pending', true, false, false],
    ];
    for (const [name, source, everRecommended, dismissed, shouldEnrich] of cases) {
      const candidate = { ...base, canonicalId: `fixture:${name}`, title: `Fixture ${name}` };
      const queued = await enqueueMonitorCandidates(db, 'fixture-space', [candidate]);
      const { id } = await db.prepare('SELECT id FROM monitored_papers WHERE canonical_id=?').bind(queued.canonicalIds[0]).first();
      await db.prepare(`UPDATE paper_insights SET analysis_source=?,analysis_model='fixture-model',
        verification_status='degraded',ever_recommended=?,quality_score=61,updated_at='2026-09-01 00:00:00' WHERE paper_id=?`)
        .bind(source, Number(everRecommended), id).run();
      if (dismissed) await db.prepare("INSERT INTO paper_feedback (id,space_id,paper_id,feedback) VALUES (?,'fixture-space',?,'not_relevant')").bind(name, id).run();
      const before = await db.prepare('SELECT * FROM paper_insights WHERE paper_id=?').bind(id).first();
      const abstract = 'Structured abstract from a healthy source; this fixture is not a real paper or a recommendation.';
      await enqueueMonitorCandidates(db, 'fixture-space', [{ ...candidate, abstractText: abstract, qualityScore: 99,
        provenance: [{ sourceKey: 'openalex:classic-rescue', channel: 'topic', queryKey: 'fixture-gap' }] }]);
      const after = await db.prepare('SELECT * FROM paper_insights WHERE paper_id=?').bind(id).first();
      assert.equal(after.abstract_text, shouldEnrich ? abstract : '', name);
      assert.deepEqual({ ...after, abstract_text: before.abstract_text }, before, `${name}: all decisions and review timestamps stay intact`);
      await enqueueMonitorCandidates(db, 'fixture-space', [candidate]);
      assert.deepEqual(await db.prepare('SELECT * FROM paper_insights WHERE paper_id=?').bind(id).first(), after, 'empty rediscovery cannot undo enrichment');
      assert.equal((await db.prepare('SELECT count(*) n FROM monitor_candidate_sources WHERE paper_id=?').bind(id).first()).n, 2);
    }
  } finally { await mf.dispose(); }
});
