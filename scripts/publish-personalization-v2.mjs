import {readFile,writeFile} from 'node:fs/promises';
import {summarizePilotV2} from '../lib/personalization-pilot-v2.mjs';
const experiment=JSON.parse(await readFile('benchmarks/personalization/protocol-v2.json','utf8'));
const records=JSON.parse(await readFile('outputs/personalization-pilot-v2/runs.json','utf8'));
const summary=summarizePilotV2(experiment,records);
const report={version:experiment.version,experimentHash:experiment.experimentHash,model:experiment.model,scope:experiment.scope,...summary,
 provenance:'Real server run records exported through the operator results page. Source quotes are deterministically recovered by evidenceId from the frozen protocol; model does not author quotes. No failed attempt is replaced. No original provider response bodies retained.',
 independentReview:'not_performed',limitations:['New authored questions with the same public corpus; not a held-out quality evaluation.','Two repetitions cannot establish general stability. Different goals and protocol from v1 prevent causal claims about an improvement.','Read-reference routing is a deterministic product rule based only on visible explicit memory, not evidence that the model learned the preference.'],
 cases:[...new Set(experiment.cases.map(t=>t.scenarioId))].map(id=>({id,goal:experiment.cases.find(t=>t.scenarioId===id).goalZh})),
 runs:summary.rows.map(row=>{
  const actual=records.find(r=>r.caseId===row.caseId&&r.variant===row.variant),task=experiment.cases.find(t=>t.id===row.caseId);
  const enrich=rec=>{const p=task.candidates.find(p=>p.id===rec.id);return {...rec,title:p.title,sourceUrl:p.sourceUrl};};
  return {...row,observedAt:actual?.observedAt??null,inputTokens:actual?.inputTokens??null,outputTokens:actual?.outputTokens??null,durationMs:actual?.durationMs??null,errorCode:actual?.errorCode??null,validationFailure:actual?.validationFailure??null,
   sourceCommit:actual?.sourceCommit??null,executionSourceCommit:actual?.executionSourceCommit??null,validationVersion:actual?.validationVersion??null,systemFingerprint:actual?.systemFingerprint??null,requestHash:actual?.requestHash??null,responseHash:actual?.responseHash??null,
   rawRanking:actual?.rawRanking??[],recommendations:(actual?.recommendations??[]).map(enrich),references:(actual?.references??[]).map(enrich)};
 })};
await writeFile('public/agent-personalization-v2.json',JSON.stringify(report,null,2)+'\n');
await writeFile('outputs/personalization-pilot-v2/report.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({attempted:summary.attemptedRuns,completed:summary.completedRuns,failed:summary.failedRuns,stability:summary.stability}));
