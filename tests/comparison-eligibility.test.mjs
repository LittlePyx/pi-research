import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonEligibility,comparisonEligibilityText} from '../lib/comparison-eligibility.ts';
test('collection, user acceptance and reading never substitute for verified comparison evidence',()=>{
 const ready={recommended:1,verified:1,abstractText:'Exact abstract evidence. '.repeat(8)};
 assert.equal(comparisonEligibility(null),'not_found');
 assert.equal(comparisonEligibility({...ready,recommended:0,inRoute:1,readingStatus:'read'}),'not_recommended');
 assert.equal(comparisonEligibility({...ready,verified:0}),'unverified');
 assert.equal(comparisonEligibility({...ready,abstractText:'short'}),'missing_abstract');
 assert.equal(comparisonEligibility({...ready,excluded:1}),'excluded');
 assert.equal(comparisonEligibility(ready),'eligible');
 assert.match(comparisonEligibilityText('not_recommended',true),/尚未通过/);
 assert.doesNotMatch(comparisonEligibilityText('not_recommended',true),/可比较|已核验/);
});
