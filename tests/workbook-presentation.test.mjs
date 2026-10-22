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
