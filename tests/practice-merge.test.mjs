import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePractice} from '../lib/practice-merge.ts';
const value=(result='base',unresolved='gap',completed=false)=>({activeId:'task-0',entries:{'task-0':{result,unresolved,completed}}});
test('independent fields and tasks merge without mutating inputs or confirming mixed evidence',()=>{
 const base=value(),local=value('local'),remote=value('base','remote',true);
 remote.entries.learning={result:'other task',unresolved:'',completed:true};
 const merged=mergePractice(base,local,remote);
 assert.equal(merged.conflicts.length,0);assert.deepEqual(merged.value.entries['task-0'],{result:'local',unresolved:'remote',completed:false});
 assert.equal(merged.value.entries.learning.completed,true);assert.equal(local.entries.learning,undefined);assert.equal(remote.entries['task-0'].result,'base');
});
test('same field conflict includes deletion and preserves both alternatives',()=>{
 const merged=mergePractice(value(),value(''),value('remote'));
 assert.deepEqual(merged.conflicts,[{taskId:'task-0',field:'result',local:'',remote:'remote'}]);
 assert.equal(merged.value.entries['task-0'].result,'');
 assert.equal(mergePractice(value(),value('same'),value('same')).conflicts.length,0);
 assert.equal(mergePractice(null,value('local'),value('remote')).conflicts.length,1);
});
test('confirmation follows only an exact confirmed entry and local selection is preserved',()=>{
 const remote=value('remote','gap',true),local={...value(),activeId:'learning'};
 assert.equal(mergePractice(value(),local,remote).value.entries['task-0'].completed,true);
 assert.equal(mergePractice(value(),local,remote).value.activeId,'learning');
 assert.equal(mergePractice(value(),value('local','gap',true),value('base','changed')).value.entries['task-0'].completed,false);
 assert.equal(mergePractice(value('base','gap',true),value(),value('base','gap',true)).value.entries['task-0'].completed,false,'local revoked confirmation must not be restored by the old remote flag');
});
