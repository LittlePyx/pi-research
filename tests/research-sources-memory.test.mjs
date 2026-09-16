import test from 'node:test';
import assert from 'node:assert/strict';
import { researchSourcePlan, normalizeSourceTitle } from '../lib/research-source-plan.ts';
import { publicResearchMemory } from '../lib/research-memory-view.ts';

test('quantum timing uses a focused source set rather than high-energy physics and keeps its named scope', () => {
  for (const [name, description] of [['量子时钟同步','quantum communication and quantum metrology'], ['Quantum clock synchronization','entanglement and time transfer']]) {
    const plan = researchSourcePlan(name, description);
    assert.equal(plan.directionKey, 'quantum_timing');
    assert.ok(plan.defaultVenues.includes('Optics Letters'));
    assert.ok(plan.defaultVenues.includes('Metrologia'));
    assert.ok(!plan.defaultVenues.includes('Journal of High Energy Physics'));
    assert.ok(plan.suggestions.every(s => s.scopeUrl?.startsWith('https://') && s.reasonZh && s.reasonEn));
  }
  assert.notEqual(researchSourcePlan('Classical clock synchronization', 'network clock synchronization').directionKey, 'quantum_timing');
  assert.equal(researchSourcePlan('未知方向', '尚未提供具体问题').specificity, 'broad');
  assert.equal(normalizeSourceTitle('Quantum Science & Technology'), normalizeSourceTitle('Quantum Science and Technology'));
});

test('information theory and optimal transport retain field supplements and disclose matching terms', () => {
  const plan = researchSourcePlan('高斯率失真', 'information theory');
  assert.equal(plan.directionKey, 'rate_distortion'); assert.equal(plan.defaultVenues[0], 'IEEE Transactions on Information Theory');
  assert.ok(plan.matchedTerms.includes('率失真')); assert.ok(plan.suggestions.some(s => s.role === 'support'));
  assert.equal(researchSourcePlan('最优传输与泛函不等式', '').defaultVenues[0], 'Communications on Pure and Applied Mathematics');
});

test('changed reading notes never display previous model deductions as current memory', async () => {
  const note='Original note about a timing assumption';
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(note)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const row={paperId:'p',title:'Fixture',venue:'Fixture',note,updatedAt:'2026-09-16',readingStatus:'reading',analysisStatus:'ready',noteHash:hash,takeawayZh:'隔离总结',methodsZh:'["测试方法"]',questionsZh:'["测试问题"]'};
  assert.equal((await publicResearchMemory(row)).status,'ready');
  const stale=await publicResearchMemory({...row,note:'Corrected note'});
  assert.equal(stale.status,'stale'); assert.equal(stale.note,'Corrected note'); assert.equal(stale.takeawayZh,''); assert.deepEqual(stale.methodsZh,[]);
  assert.equal((await publicResearchMemory({...row,analysisStatus:null,noteHash:null})).status,'pending');
});
