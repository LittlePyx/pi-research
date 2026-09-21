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
 provenance:'Provider metadata from saved server records; accepted rankings and quotes exported from the operator results DOM, then revalidated against the frozen requests and original abstracts. Original provider response bodies were not retained.',
 scope:experiment.scope,
 cases:experiment.cases.map(task=>({id:task.id,goal:task.goalZh,knownIds:task.knownIds,rows:summary.rows.filter(r=>r.caseId===task.id).map(row=>{
  const actual=records.find(r=>r.caseId===task.id&&r.variant===row.variant);
  return {...row,observedAt:actual?.observedAt??null,sourceCommit:actual?.sourceCommit??null,
   requestHash:actual?.requestHash??null,responseHash:actual?.responseHash??null,
   errorCode:actual?.status==='failed'?'output_validation_failed':null,
   recommendations:actual?.status==='completed'?actual.recommendations.map(rec=>{
    const paper=task.candidates.find(p=>p.id===rec.id);
    return {id:rec.id,title:paper.title,sourceUrl:paper.sourceUrl,reason:rec.reason,quote:rec.quote};
   }):[]};
 })})),
 limitations:[summary.limitation,'One response failed the combined identity, uniqueness, field and exact-quote validation. The run halted; four planned calls were not made. No retry replaced the failed sample.','Results use authored preferences and 18 shared public abstracts; they do not measure full production retrieval or scientific correctness.']
};
await writeFile('public/agent-personalization.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({planned:report.plannedRuns,attempted:report.attemptedRuns,completed:report.completedRuns,failed:report.failedRuns}));
