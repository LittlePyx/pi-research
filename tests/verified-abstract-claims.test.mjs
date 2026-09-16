import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedAbstractClaims } from '../lib/verified-abstract-claims.ts';
import { validateSynthesisReview } from '../lib/research-synthesis.ts';
import { nextReadableLearningStep, canChangeLearningStep } from '../lib/learning-browse.ts';

const quote = 'We establish a conditional upper bound for the specified class of log-concave measures.';
const row = () => ({ id:'paper-a', canonical_id:'doi:10.1/a', title:'A conditional bound', authors:'A. Author', venue:'Fixture', url:'https://example.org/a', published_at:null,
  abstract_text:quote + ' The additional hypotheses are necessary and no statement is made about arbitrary measures.',
  ever_recommended:1, verification_status:'verified', verification_coverage_score:90,
  verification_json:JSON.stringify({ claimChecks:[{field:'contribution', grounded:true, verdict:'supported', claimExcerpt:'A universal bound (incorrect paraphrase)', evidenceQuote:quote}] }) });

test('research consumes the actual audited passage without promoting an audit paraphrase', async () => {
  const [claim] = await verifiedAbstractClaims(row());
  assert.equal(claim.claim_en, quote); assert.equal(claim.claim_zh, quote);
  assert.equal(claim.evidence_level,'abstract'); assert.equal(claim.confidence,64);
  assert.match(claim.claim_id,/^abstract:paper-a:/);
  assert.deepEqual(await verifiedAbstractClaims(row()),[claim]);
});
test('rejection, stale quotes, low coverage and ungrounded audits do not become research evidence', async () => {
  for (const patch of [{ever_recommended:0},{verification_status:'pending'},{verification_coverage_score:69},
    {abstract_text:'A changed abstract without the reviewed sentence. '.repeat(4)}, {verification_json:'null'},
    {verification_json:JSON.stringify({claimChecks:[{field:'contribution',grounded:false,verdict:'supported',evidenceQuote:quote}]})}]) {
    assert.deepEqual(await verifiedAbstractClaims({...row(),...patch}),[]);
  }
});
test('source revision changes when the abstract or audit changes, stable identity survives unchanged quotes', async () => {
  const [a] = await verifiedAbstractClaims(row());
  const [b] = await verifiedAbstractClaims({...row(),abstract_text:row().abstract_text+' Additional qualifications apply.'});
  assert.equal(a.claim_id,b.claim_id); assert.notEqual(a.text_hash,b.text_hash);
});
test('independent synthesis review must cover every bilingual output field exactly once', () => {
  const checks=['question','overview','changeSummary','nextSearchQuery','statement:0','statement:1'].map(id=>({id,verdict:'supported'}));
  assert.doesNotThrow(()=>validateSynthesisReview({verdict:'supported',checks},2));
  for(const altered of [checks.slice(1),[...checks,checks[0]],checks.map(c=>c.id==='overview'?{...c,verdict:'unsupported'}:c)]) {
    assert.throws(()=>validateSynthesisReview({verdict:'supported',checks:altered},2));
  }
});
test('readable later-stage suggestion never advances past a missing foundation', () => {
  const foundation={id:'a',status:'pending',resources:[]};
  const method={id:'b',status:'pending',resources:[{qualification:'quality_approved'}]};
  assert.equal(nextReadableLearningStep([foundation,method],foundation),method);
  assert.equal(canChangeLearningStep(method,foundation),false);
  assert.equal(nextReadableLearningStep([foundation,method],method),null);
  assert.equal(foundation.status,'pending');
});
