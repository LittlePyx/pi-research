import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Explicit allowlist: never publish original IDs, raw prompts, notes, queues or credentials.
const read=async path=>{const raw=await readFile(path,'utf8');return {value:JSON.parse(raw),sha256:createHash('sha256').update(raw).digest('hex')};};
const screening=await read('outputs/screening-9e4bab7f-recovery.json');
const verification=await read('outputs/original-four-closure-20260910.json');
if(screening.value.trace.completed!==14||verification.value.records.length!==4)throw new Error('Historical evidence changed; review before exporting');
const v=verification.value;
const result={
 kind:'redacted-historical-excerpts',observedDate:'2026-09-10',
 screening:{version:screening.value.version,completed:screening.value.interpretation.screeningCompleted,total:screening.value.interpretation.totalScreeningCandidates,
  batchMatched:screening.value.trace.validation.matchedCount,batchSize:screening.value.trace.recordCount,
  durationMs:screening.value.trace.durationMs,queuedForDeepReview:screening.value.interpretation.deepCandidatesQueued,formalRecommendationsAtSnapshot:screening.value.interpretation.formalRecommendations},
 verification:{version:v.version,subsetSize:v.originalFour.total,published:v.originalFour.published,withheld:v.originalFour.finalGateWithheld,pending:v.originalFour.remaining,
  outcomes:v.records.map((r,index)=>({record:'paper-'+(index+1),status:r.verificationStatus,published:r.published,retryable:r.verificationRetryable,corrected:r.correctionCompleted})),
  incompleteResponseObserved:v.responseEvidence.some(r=>r.finishReason==='length')},
 sourceDigests:{screening:screening.sha256,verification:verification.sha256},
 limitations:['Historical excerpts across recovery tasks, not a complete initial retrieval trace.','Four verification drafts are a subset; do not treat them as all eight queued papers.','These records do not measure personalized recommendation accuracy.'],
};
await writeFile('public/agent-evidence.json',JSON.stringify(result,null,2)+'\n');
