import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {freezePilotV2,pilotRequestV2} from '../lib/personalization-pilot-v2.mjs';
import {V2_SCENARIOS} from '../benchmarks/personalization/scenarios-v2.mjs';
const corpus=JSON.parse(await readFile('benchmarks/personalization/candidates.json','utf8'));
const experiment=freezePilotV2(V2_SCENARIOS,corpus.papers);
await writeFile('benchmarks/personalization/protocol-v2.json',JSON.stringify(experiment,null,2)+'\n',{flag:'wx'});
await mkdir('outputs/personalization-pilot-v2',{recursive:true});
await writeFile('outputs/personalization-pilot-v2/requests.json',JSON.stringify(experiment.cases.flatMap(task=>task.order.map(variant=>({caseId:task.id,variant,request:pilotRequestV2(experiment,task,variant)}))),null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({hash:experiment.experimentHash,cases:experiment.cases.length,calls:experiment.cases.length*3}));
