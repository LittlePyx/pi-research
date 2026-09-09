import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { Miniflare } from 'miniflare';

async function loadFunction(name, dependencies) {
  const source = await readFile(new URL('../app/api/monitor/route.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, `actual ${name} must exist`);
  const compiled = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}; return ${name};`)(...Object.values(dependencies));
}

test('abstract enrichment continues past short evidence and uses a healthy DOI source', async () => {
  const calls = [];
  const writes = [];
  const fresh = 'Structured abstract evidence. '.repeat(10);
  const database = { prepare(sql) { return { bind(...args) { return { sql, args }; } }; },
    async batch(statements) { writes.push(...statements); } };
  const enrich = await loadFunction('enrichDeepReviewAbstracts', {
    fetchSemanticScholarAbstracts: async () => new Map([['short', 'Too short']]),
    fetchOpenAlexAbstracts: async (_db, candidates) => { calls.push(['openalex', candidates.map(c => c.canonicalId)]); return new Map(); },
    fetchCrossrefAbstracts: async (_db, candidates) => { calls.push(['crossref', candidates.map(c => c.canonicalId)]); return new Map([['short', fresh], ['empty', fresh]]); },
  });
  const result = await enrich(database, 'fixture', [
    { canonicalId: 'short', doi: '10.0000/short', abstractText: '' },
    { canonicalId: 'empty', doi: '10.0000/empty', abstractText: '' },
    { canonicalId: 'ready', doi: '10.0000/ready', abstractText: fresh },
  ]);
  assert.deepEqual(calls, [['openalex', ['short', 'empty']], ['crossref', ['short', 'empty']]]);
  assert.equal(result.enriched, 2);
  assert.equal(writes.length, 2);
  assert.ok(writes.every(write => write.args[1] === fresh));
  assert.ok(writes.every(write => !/SET\s+(?:analysis_source|ever_recommended)/i.test(write.sql)));
});

test('Crossref fallback checks returned DOI, cleans JATS and keeps successful partial evidence', async () => {
  const calls = [];
  const fetcher = await loadFunction('fetchCrossrefAbstracts', {
    cleanText: value => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    fetchExternalSource: async (url, init, context) => {
      calls.push({ url: String(url), context, signal: init.signal });
      if (calls.length === 3) throw new Error('source cooling down');
      return { ok: true, json: async () => ({ message: { DOI: calls.length === 1 ? '10.0000/a' : '10.0000/wrong', abstract: '<jats:p>Structured abstract evidence.</jats:p>' } }) };
    },
  });
  const result = await fetcher({}, [
    { canonicalId: 'a', doi: '10.0000/a' }, { canonicalId: 'b', doi: '10.0000/b' },
    { canonicalId: 'c', doi: '10.0000/c' }, { canonicalId: 'd', doi: '10.0000/d' },
  ]);
  assert.deepEqual([...result], [['a', 'Structured abstract evidence.']]);
  assert.equal(calls.length, 3, 'a source-wide failure stops additional calls without losing prior evidence');
  assert.ok(calls.every(call => call.context.sourceKey === 'crossref' && call.context.maxRetries === 1));
  assert.ok(calls.every(call => call.signal === calls[0].signal), 'one deadline bounds the entire fallback');
});

test('actual D1 enrichment preserves longer stored evidence and never promotes a pending candidate', { timeout: 30000 }, async () => {
  const mf = new Miniflare({ host: '127.0.0.1', cf: false, modules: true, d1Databases: ['DB'],
    script: 'export default { fetch() { return new Response("isolated QA"); } };' });
  try {
    const database = await mf.getD1Database('DB');
    const repository = await readFile(new URL('../db/repository.ts', import.meta.url), 'utf8');
    const definitions = [...repository.matchAll(/database\.prepare\("(CREATE TABLE IF NOT EXISTS [^"]*)"\)/g)]
      .map(match => match[1]).filter(sql => ['research_spaces', 'monitored_papers', 'paper_insights'].some(table => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${table} `)));
    assert.equal(definitions.length, 3);
    await database.batch(definitions.map(sql => database.prepare(sql)));
    await database.prepare("INSERT INTO research_spaces (id,owner_user_id,name,member_name) VALUES ('qa','qa','QA only','QA')").run();
    const stored = 'Already persisted structured evidence. '.repeat(10);
    await database.prepare("INSERT INTO monitored_papers (id,space_id,canonical_id,title,authors,venue,url,source,horizon) VALUES ('qa','qa','doi:qa','QA','QA','QA','https://example.org','crossref','years')").run();
    await database.prepare("INSERT INTO paper_insights (paper_id,space_id,abstract_text,analysis_source,ever_recommended) VALUES ('qa','qa',?,'deepseek_screened',0)").bind(stored).run();
    const before = await database.prepare("SELECT analysis_source,ever_recommended,quality_score,verification_status FROM paper_insights WHERE paper_id='qa'").first();
    const enrich = await loadFunction('enrichDeepReviewAbstracts', {
      fetchSemanticScholarAbstracts: async () => new Map([['doi:qa', 'short but useful']]),
      fetchOpenAlexAbstracts: async () => new Map([['doi:qa', 'tiny']]),
      fetchCrossrefAbstracts: async () => new Map(),
    });
    // A stale caller snapshot must not overwrite evidence already enriched in D1.
    await enrich(database, 'qa', [{ canonicalId: 'doi:qa', doi: 'qa', abstractText: '' }]);
    assert.equal((await database.prepare("SELECT abstract_text FROM paper_insights WHERE paper_id='qa'").first()).abstract_text, stored);
    assert.deepEqual(await database.prepare("SELECT analysis_source,ever_recommended,quality_score,verification_status FROM paper_insights WHERE paper_id='qa'").first(), before);
  } finally { await mf.dispose(); }
});
