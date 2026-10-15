import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const compiled=await build({entryPoints:['app/components/quality-review-status.tsx'],bundle:true,write:false,platform:'node',format:'esm'});
const {QualityReviewStatus}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const nodes=tree=>{const found=[];const visit=n=>{if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){found.push(n);visit(n.props?.children)}};visit(tree);return found};

test('candidate review is an explicit action for saved backlog, disabled while busy and absent for empty or running queues',()=>{
 let requests=0;
 const monitor={status:'ready',automation:{paused:true},qualityQueue:{pendingCount:3,verificationCount:1,retryCount:0,awaitingAbstractCount:0}};
 const props={monitor,locale:'zh',failureMessage:'',phase:'',formatTime:x=>x,onContinueReview:()=>requests++};
 const action=extra=>nodes(QualityReviewStatus({...props,...extra})).find(n=>n.type==='button'&&n.props.children==='继续评审候选');
 const button=action({reviewDisabled:false});assert.ok(button);assert.equal(requests,0,'rendering never resumes a paused space');button.props.onClick();assert.equal(requests,1);
 assert.equal(action({reviewDisabled:true}).props.disabled,true);
 assert.equal(action({monitor:{...monitor,automation:{paused:false},status:'screening',leaseExpiresAt:new Date(Date.now()+60000).toISOString()}}),undefined);
 assert.equal(action({monitor:{...monitor,qualityQueue:{...monitor.qualityQueue,pendingCount:0}}}),undefined);
 assert.equal(action({onContinueReview:undefined}),undefined);
});
