import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import { enqueueMonitorCandidates } from '../lib/monitor-candidate-queue.ts';
import { activeResearchRouteSupplyPredicate } from '../lib/research-map-curation.ts';
import { parseResearchRouteExperimentQueryKey } from '../lib/research-route-experiment.ts';

test('the actual monitor reader reloads enriched evidence for frozen jobs in both fixture spaces', { timeout: 30000 }, async () => {
  const source = await readFile(new URL('../app/api/monitor/route.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
  const reader = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'pendingCandidateQueue');
  assert.ok(reader);
  const constants = ['HORIZON_POOL_LIMITS', 'CANDIDATE_WORK_QUEUE_LIMIT', 'MONITOR_REVIEW_PIPELINE_RELEASED_AT'];
  const declarations = constants.map((name) => {
    const statement = ast.statements.find((node) => ts.isVariableStatement(node)
      && node.declarationList.declarations.some((item) => item.name.getText(ast) === name));
    assert.ok(statement, name);
    return statement.getText(ast);
  });
  // Execute the real consumer, its actual SQL predicates and actual constants;
  // do not import the Worker or replace the queue with fixture filtering logic.
  const compiled = ts.transpileModule([...declarations, reader.getText(ast)].join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const pendingCandidateQueue = new Function('activeResearchRouteSupplyPredicate', 'parseResearchRouteExperimentQueryKey',
    `${compiled}\nreturn pendingCandidateQueue;`)(activeResearchRouteSupplyPredicate, parseResearchRouteExperimentQueryKey);
  const repository = await readFile(new URL('../db/repository.ts', import.meta.url), 'utf8');
  const tables = ['research_spaces', 'research_tracks', 'research_track_papers', 'monitored_papers', 'paper_insights',
    'monitor_candidate_sources', 'monitor_discovery_coverage', 'monitor_runs', 'paper_feedback'];
  const definitions = [...repository.matchAll(/database\.prepare\("(CREATE (?:TABLE|UNIQUE INDEX) IF NOT EXISTS [^"]*)"\)/g)]
    .map((match) => match[1]).filter((sql) => tables.some((table) => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${table} `) || sql.includes(` ON ${table}(`)));
  assert.equal(definitions.filter((sql) => sql.startsWith('CREATE TABLE')).length, tables.length);
  const mf = new Miniflare({ host: '127.0.0.1', cf: false, modules: true, d1Databases: ['DB'],
    script: 'export default { fetch() { return new Response("isolated QA only"); } };' });
  try {
    const db = await mf.getD1Database('DB');
    await db.batch(definitions.map((sql) => db.prepare(sql)));
    for (const [space, status] of [['fixture-information', 'deepseek_screened'], ['fixture-mathematics', 'deepseek_verification_pending']]) {
      await db.prepare("INSERT INTO research_spaces (id,owner_user_id,name,member_name) VALUES (?, 'fixture-owner', ?, 'QA only')").bind(space, space).run();
      const candidate = { canonicalId: `doi:${space}`, doi: space, title: `QA paper ${space}`, authors: 'Fixture author',
        venue: 'Fixture venue', url: 'https://example.org/fixture', publishedAt: '1995-01-01', abstractText: '',
        horizon: 'years', citationCount: 10, relevanceScore: 60, qualityScore: 60, priorityVenue: false, source: 'crossref',
        provenance: [{ sourceKey: 'research-route:learning', channel: 'topic', queryKey: 'fixture-stage' }] };
      const queued = await enqueueMonitorCandidates(db, space, [candidate]);
      const frozen = structuredClone(queued.canonicalIds);
      const { id } = await db.prepare('SELECT id FROM monitored_papers WHERE space_id=?').bind(space).first();
      await db.prepare("UPDATE paper_insights SET analysis_source=?,analysis_model='fixture-model' WHERE paper_id=?").bind(status, id).run();
      assert.equal((await pendingCandidateQueue(db, space, frozen))[0].abstractText, '');
      const fresh = `New structured abstract for ${space}; QA evidence only, not a real recommendation.`;
      await enqueueMonitorCandidates(db, space, [{ ...candidate, abstractText: fresh,
        provenance: [{ sourceKey: 'openalex:classic-rescue', channel: 'semantic', queryKey: 'fixture-stage' }] }]);
      for (const ids of [undefined, frozen]) {
        const result = await pendingCandidateQueue(db, space, ids);
        assert.equal(result.length, 1);
        assert.equal(result[0].canonicalId, frozen[0]);
        assert.equal(result[0].abstractText, fresh);
        assert.equal(result[0].qualityQueueLane, 'learning');
        assert.equal(result[0].verificationPending, status === 'deepseek_verification_pending');
        assert.deepEqual(new Set(result[0].provenance.map((entry) => entry.sourceKey)), new Set(['research-route:learning', 'openalex:classic-rescue']));
      }
      assert.deepEqual(await pendingCandidateQueue(db, space, []), []);
      assert.deepEqual(frozen, queued.canonicalIds, 'no replacement task or identity mutation required');
      await db.prepare('UPDATE paper_insights SET ever_recommended=1 WHERE paper_id=?').bind(id).run();
      assert.deepEqual(await pendingCandidateQueue(db, space), [], 'past recommendation is not fresh queue work');
      assert.equal((await pendingCandidateQueue(db, space, frozen))[0].abstractText, fresh, 'same-job reconciliation remains addressable');
      await db.prepare("INSERT INTO paper_feedback (id,space_id,paper_id,feedback) VALUES (?, ?, ?, 'not_relevant')").bind(space, space, id).run();
      assert.deepEqual(await pendingCandidateQueue(db, space, frozen), [], 'dismissal still applies to frozen jobs');
      assert.equal((await db.prepare('SELECT count(*) n FROM monitored_papers WHERE space_id=?').bind(space).first()).n, 1);
    }
  } finally { await mf.dispose(); }
});
