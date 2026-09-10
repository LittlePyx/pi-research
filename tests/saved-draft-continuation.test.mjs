import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const ast = ts.createSourceFile('route.ts', fs.readFileSync(new URL('../app/api/monitor/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
let block;
function visit(node) {
  if (ts.isIfStatement(node) && node.expression.getText(ast) === 'job.checkpoint === "deep_reviewing"') block = node.thenStatement;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(block);
const guardEnd = block.statements.findIndex(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === 'completedIds'));
const compiled = ts.transpileModule('async function run() {' + block.statements.slice(0, guardEnd).map(n => n.getText(ast)).join('\n') + ';return null;}',
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
test('the real deep-review checkpoint verifies saved drafts before spending a call on new candidates', async () => {
  for (const state of ['pending', 'verified', 'deferred', 'not-yet-saved']) {
    const stages = [];
    const work = { verificationIds: ['saved-draft'], deepCompletedIds: state === 'not-yet-saved' ? [] : ['saved-draft'],
      verificationCompletedIds: state === 'verified' ? ['saved-draft'] : [], verificationDeferredIds: state === 'deferred' ? ['saved-draft'] : [] };
    const result = await new Function('work', 'setStage', 'readOwnedState', compiled + ';return run();')(
      work, async stage => stages.push(stage), async flags => flags);
    assert.deepEqual(stages, state === 'pending' ? ['verifying_recommendations'] : []);
    assert.equal(result?.status || null, state === 'pending' ? 202 : null);
  }
});
