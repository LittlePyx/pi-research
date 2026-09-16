import assert from 'node:assert/strict';
import { glob, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Miniflare } from 'miniflare';

test('learning preview preserves the saved path, enforces ownership and source freshness, and commits once', { timeout: 60000 }, async () => {
  const root = fileURLToPath(new URL('../dist/server/', import.meta.url)); const modules = [];
  for await (const path of glob('**/*.js', { cwd: root })) modules.push({ type: 'ESModule', path: root + path });
  let modelCalls = 0; let failModel = false;
  const mf = new Miniflare({ cf: false, d1Databases: ['DB'], compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    bindings: { DEEPSEEK_API_KEY: 'sk-isolated-preview-not-real' }, modulesRoot: root, modules: [{ type: 'ESModule', path: root + 'preview-entry.js', contents: `import app from './index.js'; export default {async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}` }, ...modules],
    outboundService: async request => {
      modelCalls++; const payload = await request.json(); const input = JSON.parse(payload.messages[1].content);
      assert.match(input.learningOutcome, /Understand methods and proof strategies/);
      assert.match(input.learningOutcome, /Existing prerequisite knowledge/);
      if (failModel) return Response.json({ error: { message: 'Isolated upstream failure' } }, { status: 503 });
      return Response.json({ choices:[{finish_reason:'stop',message:{content:JSON.stringify({titleZh:'UNSUPPORTED CLAIM',titleEn:'UNSUPPORTED CLAIM',steps:['foundation','method','milestone','frontier','project'].map(kind=>({kind,titleZh:'UNSUPPORTED CLAIM',titleEn:'UNSUPPORTED CLAIM',goalZh:'UNSUPPORTED CLAIM',goalEn:'UNSUPPORTED CLAIM',checkpointZh:'UNSUPPORTED CLAIM',checkpointEn:'UNSUPPORTED CLAIM',resourceIds:[]}))})}}],usage:{prompt_tokens:1,completion_tokens:1} });
    } });
  const owner = 'preview-fixture-owner-001';
  const request = async (path, body, status = 200, who = owner) => {
    const response = await mf.dispatchFetch('http://localhost' + path, { method: body ? 'POST' : 'GET', headers: { cookie: `pi_anonymous_workspace=${who}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text(); assert.equal(response.status, status, text.slice(0, 1200)); return JSON.parse(text);
  };
  const sql = statements => request('/fixture', statements);
  const insert = (table, value) => ({ sql: `INSERT INTO ${table} (${Object.keys(value).join(',')}) VALUES (${Object.keys(value).map(() => '?').join(',')})`, values: Object.values(value) });
  const preview = extra => request('/api/learning-path', { spaceId: 'preview', action: 'preview', target: 'Gaussian rate distortion', goal: 'methods', ...extra });
  const commit = (id, status = 200, who = owner) => request('/api/learning-path', { spaceId: 'preview', action: 'commit-preview', previewId: id }, status, who);
  try {
    await request('/api/learning-path?spaceId=preview', null, 404);
    const migration = await readFile(new URL('../drizzle/0062_long_yellow_claw.sql', import.meta.url), 'utf8');
    await sql(migration.split('--> statement-breakpoint').filter(s => s.trim()).map(sql => ({ sql })));
    await sql([insert('research_spaces', { id: 'preview', owner_user_id: `anonymous:${owner}`, name: 'Isolated preview', member_name: 'Fixture' })]);
    await request('/api/learning-path', { spaceId: 'preview', action: 'preview', target: 'Gaussian rate distortion', goal: 'research' }, 400);
    const a = (await preview()).preview;
    assert.equal(a.goal, 'methods'); assert.equal(a.modelPlanned, false); assert.equal(a.materialCount, 0); assert.equal(a.steps.length, 5);
    assert.ok(a.steps.every(step => step.papers.length === 0));
    let counts = await sql(['learning_paths', 'paper_feedback', 'paper_reading_progress', 'research_gap_discovery_jobs'].map(table => ({ sql: `SELECT COUNT(*) n FROM ${table}` })));
    assert.deepEqual(counts.map(r => r.results[0].n), [0, 0, 0, 0], 'preview cannot replace, accept, mark read or enqueue discovery');
    await commit(a.id, 404, 'different-preview-owner-002');
    const b = (await preview({ target: 'Different learning topic' })).preview;
    const saved = await commit(a.id); assert.equal(saved.path.id, a.id); assert.equal(saved.path.learningGoal, 'methods');
    assert.equal(saved.path.targetTrackId, null); assert.equal(saved.path.completedSteps, 0);
    assert.equal((await commit(a.id)).path.id, a.id, 'confirmation is idempotent');
    await commit(b.id, 409);
    const c = (await preview({ goal: 'overview' })).preview;
    assert.equal((await request('/api/learning-path?spaceId=preview')).path.id, a.id, 'preparing a new preview preserves the old path');
    await sql([insert('research_tracks', { id: 'new-track', space_id: 'preview', title_zh: '新增材料范围', title_en: 'New material scope' })]);
    await commit(c.id, 409);
    const d = (await preview({ trackId: 'new-track', background: 'Existing prerequisite knowledge.' })).preview;
    const final = await commit(d.id); assert.equal(final.path.targetTrackId, 'new-track'); assert.equal(final.path.learnerBackground, 'Existing prerequisite knowledge.');
    counts = await sql([{ sql: "SELECT COUNT(*) n FROM learning_paths WHERE status != 'superseded'" }, { sql: 'SELECT COUNT(*) n FROM paper_reading_progress' }, { sql: 'SELECT COUNT(*) n FROM paper_feedback' }]);
    assert.deepEqual(counts.map(r => r.results[0].n), [1, 0, 0]); assert.equal(modelCalls, 0);
    const expired = (await preview()).preview;
    await sql([{ sql: "UPDATE learning_plan_previews SET created_at='2020-01-01 00:00:00' WHERE id=?", values: [expired.id] }]);
    await commit(expired.id, 409);
    await sql(['one','two','three'].flatMap(id => [
      insert('monitored_papers',{id,space_id:'preview',canonical_id:'doi:10.9999/'+id,title:'Gaussian rate distortion '+id,authors:'Fixture author',horizon:'years',url:'https://example.org/'+id}),
      insert('paper_insights',{paper_id:id,space_id:'preview',abstract_text:'An isolated abstract about Gaussian rate distortion and its assumptions. This paragraph is test data, not a research result.',ever_recommended:1,quality_score:90}),
    ]));
    const grounded = (await preview({background:'Existing prerequisite knowledge.'})).preview;
    assert.equal(grounded.modelPlanned,true); assert.equal(grounded.materialCount,0); assert.equal(grounded.candidateCount,3);
    assert.ok(grounded.steps.every(s=>!JSON.stringify(s).includes('UNSUPPORTED CLAIM')), 'preview must not expose unreviewed factual prose');
    failModel = true;
    await request('/api/learning-path',{spaceId:'preview',action:'preview',target:'Gaussian rate distortion',goal:'methods',background:'Existing prerequisite knowledge.'},503);
    assert.equal((await request('/api/learning-path?spaceId=preview')).path.id,final.path.id,'model failure cannot replace the saved path');
    assert.equal(modelCalls,2);
  } finally { await mf.dispose(); }
});
