import {readFile,writeFile} from 'node:fs/promises';
import {buildPreferenceGuidance,FEEDBACK_POLICY_VERSION} from '../lib/feedback-policy.mjs';
import {MEMORY_EVAL_CASES} from '../benchmarks/memory-ablation.mjs';
import {evaluatePersonalization} from '../lib/personalization-evaluation.mjs';
import {matchScreeningRecords} from '../lib/screening-identity.mjs';
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const rows=[];
for(const task of MEMORY_EVAL_CASES)for(const mode of ['none','explicit','all']) {
 const context=buildPreferenceGuidance(task.signals,{mode,now:Date.parse(task.asOf)});
 const routed=Object.entries(context).filter(([,v])=>Array.isArray(v)).flatMap(([channel,values])=>values.map(s=>({id:s.id,channel})));
 const expected=task.signals.filter(s=>s.expected && mode!=='none' && (mode==='all'||s.layer==='explicit'));
 rows.push({caseId:task.id,mode,expectedSignals:expected.length,retainedSignals:routed.length,
  correctlyRouted:expected.filter(s=>routed.some(r=>r.id===s.id&&r.channel===s.expected)).length,
  unwantedSignals:routed.filter(r=>!expected.some(s=>s.id===r.id&&s.expected===r.channel)).length,
  contextBytes:Buffer.byteLength(JSON.stringify(context))});
}
const id='doi:10.1130/0091-7613(1990)018<0812:lbotao>2.3.co;2';
const record={canonicalId:id,isPaper:true,relevanceScore:80,qualityScore:75,screeningReason:'Synthetic valid response for identity regression.'};
const corrupted={...record,canonicalId:id.replace(/<[^>]*>/g,'')};
const report={version:FEEDBACK_POLICY_VERSION,scope:'Production memory-input policy, authored scenarios; no LLM recommendation evaluation',
 memoryAblation:rows,
 identityReplay:{scope:'Deterministic reproduction of the historical identity-cleaning mechanism, not a new production run',
  corruptedMatched:matchScreeningRecords([id],[corrupted]).byId.size,
  preservedMatched:matchScreeningRecords([id],[record]).byId.size},
 recommendationQuality:{status:'not_run',reason:'No independently judged, paired model rankings supplied; do not infer recommendation uplift from policy tests.'}};
const runs=option('--runs'),judgments=option('--judgments');
if(Boolean(runs)!==Boolean(judgments))throw new Error('Provide both --runs and --judgments');
if(runs) report.recommendationQuality=evaluatePersonalization(JSON.parse(await readFile(judgments,'utf8')),JSON.parse(await readFile(runs,'utf8')));
report.passed=rows.every(r=>r.expectedSignals===r.correctlyRouted&&r.unwantedSignals===0)&&report.identityReplay.corruptedMatched===0&&report.identityReplay.preservedMatched===1;
const output=JSON.stringify(report,null,2)+'\n';
if(option('--out'))await writeFile(option('--out'),output);else process.stdout.write(output);
if(!report.passed)process.exitCode=1;
