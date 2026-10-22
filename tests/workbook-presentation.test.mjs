import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookPresentation,workbookStatusLabel} from '../lib/workbook-presentation.ts';
test('comparison presentation distinguishes reviewed results, recoverable review and evidence rejection',()=>{
  const retry={id:'exact',status:'retryable',stage:'review',failure:{code:'rate_limited'},revisionFlow:null};
  let shown=workbookPresentation(retry,'','',true);
  assert.match(shown.title,/核对暂时中断/);assert.match(shown.retained,/草稿已保存/);assert.match(shown.failure,/请求较多/);
  shown=workbookPresentation({...retry,status:'rejected',failure:null},'','',true);assert.match(shown.next,/补充证据或收窄问题/);
  shown=workbookPresentation({...retry,status:'ready',failure:null},'','Conflicting save',true);assert.match(shown.title,/已有比较保留/);
  assert.equal(workbookStatusLabel('ready',true),'已核验');assert.equal(workbookStatusLabel('rejected',true),'待补证或调整问题');
});

test('correction has its own phase and a second review round explains preserved fields',()=>{
 const base={id:'exact',status:'verifying',stage:'review',reviewProgress:{completed:19,total:19},revisionFlow:{repairs:0,next:'repair',limit:1}};
 let shown=workbookPresentation(base,'verify','',true);
 assert.equal(shown.phase,'repair');assert.match(shown.title,/修订未通过项/);assert.match(shown.retained,/已通过内容保持不变/);
 shown=workbookPresentation({...base,status:'retryable',failure:{code:'rate_limited'}},'','',true);
 assert.match(shown.title,/修订暂时中断/);assert.match(shown.retained,/只修订未通过字段/);
 shown=workbookPresentation({...base,reviewProgress:{completed:6,total:19},revisionFlow:{repairs:1,next:'review',revisedFields:1,preservedFields:18}},'verify','',true);
 assert.equal(shown.phase,'review');assert.match(shown.reviewLabel,/第 2 轮核对 · 6 \/ 19/);assert.match(shown.preservation,/保留 18 个字段/);
});

test('a request resuming an interrupted step shows active work rather than its previous failure title',()=>{
 const state={id:'same',status:'retryable',stage:'draft',failure:{code:'invalid_evidence'}};
 assert.match(workbookPresentation(state,'verify','',true).title,/正在重新生成/);
 assert.match(workbookPresentation({...state,stage:'review'},'verify','',true).title,/正在继续第 1 轮核对/);
 assert.match(workbookPresentation({...state,stage:'review',revisionFlow:{next:'repair',repairs:0}},'verify','',true).title,/正在重试修订/);
 assert.match(workbookPresentation(state,'','',true).title,/比较暂未完成/);
});
