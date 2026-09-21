// Publish only validated, fixed-public-corpus experiment records, never user data.
import {readFile,writeFile} from 'node:fs/promises';
import {freezePilot,summarizePilot} from '../lib/personalization-pilot.mjs';
import {PILOT_SCENARIOS} from '../benchmarks/personalization/scenarios.mjs';
const corpus=JSON.parse(await readFile('benchmarks/personalization/candidates.json','utf8'));
const experiment=freezePilot(PILOT_SCENARIOS,corpus.papers);
const records=JSON.parse(await readFile('outputs/personalization-pilot-v1/runs.json','utf8'));
const summary=summarizePilot(experiment,records);
const report={
 version:experiment.version,experimentHash:experiment.experimentHash,model:experiment.model,
 status:summary.status,plannedRuns:summary.plannedRuns,completedRuns:summary.completedRuns,
 attemptedRuns:records.length,failedRuns:records.filter(r=>r.status==='failed').length,
 qualityMetrics:null,independentReview:'not_performed',repetitions:1,
 provenance:'First eight records: saved server metadata and accepted rankings exported from the operator DOM. Final four records: complete saved record JSON exported from the operator DOM. All accepted outputs revalidated against unchanged frozen requests and original abstracts. Original provider response bodies were not retained; failed samples were not retried or replaced.',
 scope:experiment.scope,
 cases:experiment.cases.map(task=>({id:task.id,goal:task.goalZh,knownIds:task.knownIds,
  comparisons:[['none','explicit'],['explicit','all']].map(([from,to])=>{
   const before=records.find(r=>r.caseId===task.id&&r.variant===from&&r.status==='completed');
   const after=records.find(r=>r.caseId===task.id&&r.variant===to&&r.status==='completed');
   const paper=id=>{const p=task.candidates.find(p=>p.id===id);return {id,title:p.title,sourceUrl:p.sourceUrl};};
   if(!before||!after)return {from,to,available:false,sameOrder:false,added:[],removed:[],rankChanges:[]};
   return {from,to,available:true,sameOrder:JSON.stringify(before.ranking)===JSON.stringify(after.ranking),
    added:after.ranking.filter(id=>!before.ranking.includes(id)).map(paper),
    removed:before.ranking.filter(id=>!after.ranking.includes(id)).map(paper),
    rankChanges:after.ranking.filter(id=>before.ranking.includes(id)&&before.ranking.indexOf(id)!==after.ranking.indexOf(id)).map(id=>({...paper(id),from:before.ranking.indexOf(id)+1,to:after.ranking.indexOf(id)+1}))};
  }),rows:summary.rows.filter(r=>r.caseId===task.id).map(row=>{
  const actual=records.find(r=>r.caseId===task.id&&r.variant===row.variant);
  return {...row,observedAt:actual?.observedAt??null,sourceCommit:actual?.sourceCommit??null,
   requestHash:actual?.requestHash??null,responseHash:actual?.responseHash??null,
   executionSourceCommit:actual?.executionSourceCommit??actual?.sourceCommit??null,
   validationVersion:actual?.validationVersion??'pilot-output-v1',
   systemFingerprint:actual?.systemFingerprint??null,
   errorCode:actual?.status==='failed'?actual.errorCode:null,
   validationFailure:actual?.validationFailure??null,
   recommendations:actual?.status==='completed'?actual.recommendations.map(rec=>{
    const paper=task.candidates.find(p=>p.id===rec.id);
    return {id:rec.id,title:paper.title,sourceUrl:paper.sourceUrl,reason:rec.reason,quote:rec.quote};
   }):[]};
 })})),
 limitations:[summary.limitation,'Twelve planned calls were attempted in two batches with unchanged inputs and acceptance gates. Three outputs failed validation; the first has a legacy combined error of unknown specific cause, and the two continuation failures have field-level diagnostics. No failed sample was retried or replaced.','Execution revisions are recorded separately from the frozen source baseline. Results use authored preferences and 18 shared public abstracts; they do not measure full production retrieval or scientific correctness.']
};
await writeFile('public/agent-personalization.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({planned:report.plannedRuns,attempted:report.attemptedRuns,completed:report.completedRuns,failed:report.failedRuns}));
