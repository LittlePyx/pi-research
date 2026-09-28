import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { traceReviewPersistenceFailure } from '../lib/review-progress-trace.mjs';

const source = fs.readFileSync(new URL('../app/api/monitor/route.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
const post = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'POST');
const returns = [];
let recovery, cleanup;
function visit(node) {
  if (ts.isReturnStatement(node) && /^(?:await )?(?:finalizeMain|continueAfterFreshLane)\(/.test(node.expression?.getText(ast) || '')) returns.push(node.getText(ast));
  if (ts.isTryStatement(node) && node.catchClause?.getText(ast).includes('work.resumeCheckpoint = job.checkpoint;')) recovery = node.catchClause.getText(ast);
  if (ts.isTryStatement(node) && node.finallyBlock?.getText(ast).includes('leaseHeartbeat?.stop()')) cleanup = node.finallyBlock.getText(ast);
  ts.forEachChild(node, visit);
}
visit(post);
assert.equal(returns.length, 4);
assert.ok(recovery && cleanup);

function harness(returnStatement, fail) {
  const events = [], writes = [], recorded = [];
  const work = { candidateIds: ['paper'], screens: [{canonicalId:'paper'}], deepCompletedIds: ['paper'], resumeCheckpoint: '' };
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const finish = async () => { await pending; events.push('write settled'); if (fail) throw new Error('D1_ERROR: fixture failure'); return Response.json({ready:true}); };
  const deps = {
    work, candidates: [], persistedReviews: [], finalizeMain: finish, continueAfterFreshLane: finish,
    database: {prepare: sql => ({bind: (...values) => ({sql, values, run: async () => {events.push('lock released');}})}),
      batch: async statements => {writes.push(...statements); events.push('failure saved'); return statements.map(() => ({meta:{changes:1}}));}},
    job: {id:'job',checkpoint:'finalizing',current_source:'fixture',retry_count:0,progress:99}, space:{id:'space'},
    lockToken:'fixture-lock', leaseGeneration:1, stageStartedAt:Date.now(), advanceLockJobId:'job', advanceLockToken:'fixture-advance',
    leaseHeartbeat: {stop:()=>events.push('heartbeat stopped')}, MonitorLeaseLostError: class extends Error {},
    normalizedMonitorError: e=>e.message, monitorRetryDecision:()=>({errorCode:'stage_failed',retryCount:1,nextRetryAt:'future',retryable:true}),
    recordReliabilityEvent: async (_db, event)=>recorded.push(event), readState:async()=>({status:'error'}),
  };
  const code = ts.transpileModule(`async function run(){try {${returnStatement}} ${recovery} finally ${cleanup}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const run = new Function(...Object.keys(deps), `${code};return run;`)(...Object.values(deps));
  return {run, resolve, events, writes, recorded, work};
}

for (const [index, statement] of returns.entries()) {
  test(`async completion exit ${index + 1} keeps ownership until success and records failures`, async () => {
    for (const fail of [false, true]) {
      const h = harness(statement, fail);
      const response = h.run();
      // Attach a rejection handler immediately; the pre-fix return escapes catch.
      const settled = response.then(value=>({value}), error=>({error}));
      await Promise.resolve();
      assert.deepEqual(h.events, [], 'pending completion must retain heartbeat and advance lock');
      h.resolve();
      const result = await settled;
      assert.equal(result.error, undefined);
      assert.equal(result.value.status, fail ? 502 : 200);
      assert.deepEqual(h.events, fail ? ['write settled','failure saved','heartbeat stopped','lock released'] : ['write settled','heartbeat stopped','lock released']);
      assert.equal(h.recorded.length, fail ? 1 : 0);
      if (fail) {
        assert.equal(h.work.resumeCheckpoint, 'finalizing');
        assert.deepEqual(h.work.deepCompletedIds, ['paper']);
        assert.equal(h.writes.length, 2);
        assert.equal(h.recorded[0].metadata.retryable, true);
        assert.match(h.writes[0].sql, /lease_generation = \?/);
      }
    }
  });
}

test('persistence diagnostics classify causes without exposing exception content', () => {
  const log = [];
  const error = new Error('D1_ERROR: SQL contains PRIVATE_DATA', {cause:new Error('NOT NULL constraint failed: paper_insights.summary_zh')});
  traceReviewPersistenceFailure({spaceId:'space',scanJobId:'job',batchSize:2,error}, entry=>log.push(entry));
  assert.equal(log[0].errorCode,'not_null_constraint');
  assert.doesNotMatch(JSON.stringify(log), /PRIVATE_DATA|summary_zh|constraint failed/);
  assert.doesNotThrow(()=>traceReviewPersistenceFailure({error},()=>{throw new Error('sink unavailable');}));
});
