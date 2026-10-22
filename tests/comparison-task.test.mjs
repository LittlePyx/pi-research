import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonTaskTarget} from '../lib/comparison-task.ts';

test('the compact summary and continuation always belong to the same draft, selection or saved record',()=>{
 const selection={question:'new selection',papers:[{canonicalId:'a'}]};
 const record={id:'saved',question:'unfinished original',status:'retryable',savedRevision:0};
 assert.deepEqual(comparisonTaskTarget(selection,null,record),{kind:'record',question:record.question,saved:false});
 assert.equal(comparisonTaskTarget({...selection,papers:[...selection.papers,{canonicalId:'b'}]},null,record).kind,'selection');
 assert.deepEqual(comparisonTaskTarget(selection,{...selection,question:'separate local draft'},record),{kind:'draft',question:'separate local draft',saved:false});
 assert.equal(comparisonTaskTarget(selection,null,{...record,savedRevision:1}).kind,'selection');
 assert.deepEqual(comparisonTaskTarget({...selection,papers:[{canonicalId:'a'},{canonicalId:'b'}]},null,{...record,savedRevision:1},record.id),{kind:'record',question:record.question,saved:true});
 assert.deepEqual(comparisonTaskTarget({...selection,papers:[]},null,{...record,savedRevision:1}),{kind:'record',question:record.question,saved:true});
});
