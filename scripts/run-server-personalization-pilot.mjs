// Receives only the short-lived experiment capability on stdin, never a model API key.
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {summarizePilot} from '../lib/personalization-pilot.mjs';
const index=process.argv.indexOf('--source-commit'),sourceCommit=process.argv[index+1];
if(index<0||!/^[a-f0-9]{40}$/.test(sourceCommit))throw new Error('Pass the verified deployed source commit.');
const directory=resolve('outputs/personalization-pilot-v1');
const experiment=JSON.parse(await readFile(resolve(directory,'experiment.json'),'utf8'));
const input=createInterface({input:process.stdin,terminal:false});
console.log('Waiting for the temporary experiment capability on stdin.');
const token=await new Promise(resolve=>input.once('line',line=>{input.close();process.stdin.pause();resolve(line.trim());}));
if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid temporary capability');
const records=[];
for(const task of experiment.cases)for(const variant of task.order){
 const response=await fetch('https://pi-research-agent.qiudao-pika.chatgpt.site/api/personalization-pilot',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({caseId:task.id,variant,sourceCommit}),signal:AbortSignal.timeout(75_000)});
 if(!response.ok)throw new Error('Experiment endpoint returned '+response.status+'; no automatic retry.');
 const data=await response.json(),record=data.record;
 if(record.caseId!==task.id||record.variant!==variant||record.sourceCommit!==sourceCommit)throw new Error('Run identity mismatch');
 records.push(record);summarizePilot(experiment,records);
 if(!data.cached)await appendFile(resolve(directory,'attempts.jsonl'),JSON.stringify(record)+'\n');
 await writeFile(resolve(directory,'runs.json'),JSON.stringify(records,null,2)+'\n');
 await writeFile(resolve(directory,'report.json'),JSON.stringify(summarizePilot(experiment,records),null,2)+'\n');
 console.log(JSON.stringify({caseId:task.id,variant,status:record.status,inputTokens:record.inputTokens,outputTokens:record.outputTokens,durationMs:record.durationMs,cached:data.cached}));
 if(record.status!=='completed')throw new Error('Recorded model failure; experiment halted without a fabricated ranking.');
}
await writeFile(resolve(directory,'status.json'),JSON.stringify({status:'rankings_recorded_awaiting_blind_review',completedRuns:records.length,sourceCommit},null,2)+'\n');
console.log('All 12 real model rankings saved. Independent relevance review is still required.');
