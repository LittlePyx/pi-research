import test from 'node:test';
import assert from 'node:assert/strict';
import {taskBriefOverview,taskBriefReading,taskBriefLeads} from '../lib/task-brief-presentation.mjs';
const task={summary:{briefDate:'2026-10-13',model:'evidence-summary',overviewZh:'今天完成核对。'},scope:{problemId:'goal'},records:[{paperId:'a',selected:true,title:'A',signalZh:'Frozen finding',review:{whyReadZh:'Frozen reason'}},{paperId:'b',selected:false,title:'B',source:'crossref',review:{verificationStatus:'pending',screeningReason:'Awaiting verification'}}],currentStates:[{paperId:'a',recommended:true,readingStatus:'unread',feedback:null},{paperId:'b',recommended:false,readingStatus:'unread',feedback:null}]};
test('task findings use frozen content; reading eligibility still respects current feedback and goal scope',()=>{
 assert.equal(taskBriefOverview(task).overview,'[1] Frozen finding');assert.equal(taskBriefOverview(task).process,'2026-10-13完成核对。');assert.equal(taskBriefOverview(task).findings[0].text,'Frozen finding');
 assert.equal(taskBriefReading(task,'different'),null);assert.equal(taskBriefReading(task,'goal')[0].whyZh,'Frozen reason');
 assert.deepEqual(taskBriefReading(task,'goal',['a']),[]);
 const changed={...task,currentStates:task.currentStates.map(s=>s.paperId==='a'?{...s,recommended:false}:s)};
 assert.equal(taskBriefOverview(changed).findings[0].text,'Frozen finding');assert.deepEqual(taskBriefReading(changed,'goal'),[]);
 assert.equal(taskBriefLeads(task)[0].qualityStage,'reviewing');
});
test('dismissal and snooze never reappear from a historical task snapshot',()=>{
 const excluded={...task,currentStates:task.currentStates.map(s=>({...s,snoozed:true}))};
 assert.deepEqual(taskBriefReading(excluded,'goal'),[]);assert.deepEqual(taskBriefLeads(excluded),[]);assert.deepEqual(taskBriefOverview(excluded).findings,[]);
});
