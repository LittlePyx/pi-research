import {readFile,writeFile,mkdir,appendFile,rename} from 'node:fs/promises';
import {openSync,closeSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PILOT_SCENARIOS} from '../benchmarks/personalization/scenarios.mjs';
import {freezePilot,executePilotRun,summarizePilot,digest,pilotRequest} from '../lib/personalization-pilot.mjs';
import {evaluatePersonalization} from '../lib/personalization-evaluation.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const command=process.argv[2]||'prepare';
const directory=resolve(option('--out-dir')||resolve(root,'outputs/personalization-pilot-v1'));
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const save=async(name,value)=>{const target=resolve(directory,name),temp=target+'.'+process.pid+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n');await rename(temp,target);};
const papers=(await json(resolve(root,'benchmarks/personalization/candidates.json'))).papers;
const experiment=freezePilot(PILOT_SCENARIOS,papers);
const path=name=>resolve(directory,name);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await mkdir(directory,{recursive:true});
if(command==='run'){
 const lockPath=path('.run.lock');const fd=openSync(lockPath,'wx');closeSync(fd);
 process.on('exit',()=>{try{unlinkSync(lockPath);}catch{/* A hard process kill may require manual lock inspection. */}});
}
if(command==='prepare') {
 try {
  const previous=await json(path('experiment.json'));
  if(previous.experimentHash!==experiment.experimentHash)throw new Error('Use a new output directory for a changed experiment.');
 } catch(error){if(error.code!=='ENOENT')throw error;await save('experiment.json',experiment);}
 // Never replace an edited reviewer file or any model runs.
 const review={experimentHash:experiment.experimentHash,reviewer:{name:'',role:'',independentOfRankings:false,completedAt:null},
  instructions:'Blind relevance review. Do not inspect model rankings before submitting. Gain: 0 unrelated, 1 useful background, 2 useful partial answer, 3 directly useful. Judge relevance separately from known status and scientific correctness. A known paper can have gain 3. Assign short facets only where supported by the abstract. Uncertain cases remain null. Personas are authored, not actual users.',
  cases:experiment.cases.map(t=>({id:t.id,contextId:t.contextId,goal:t.goal,goalZh:t.goalZh,persona:t.signals.map(s=>({layer:s.layer,text:s.labelEn,evidence:s.evidence})),
   candidates:t.candidates.map(p=>({...p,known:t.knownIds.includes(p.id),gain:null,facets:[],reason:''}))}))};
 await writeFile(path('blind-review.json'),JSON.stringify(review,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const html='<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pi Research · 盲审材料</title><style>body{font:16px/1.8 system-ui,sans-serif;color:#243b46;background:#fafaf8;max-width:860px;margin:50px auto;padding:0 24px}h1{font-size:30px}h2{margin-top:64px}h3{font-size:18px}article{border-top:1px solid #dce2e4;padding:20px 0}a{color:#236778}small{color:#687c85}blockquote{margin:12px 0;white-space:pre-wrap}li{margin:8px 0}</style><h1>推荐实验 · 盲审材料</h1><p>4 个问题，18 篇公开文献，每题 12 篇候选。本页不显示模型排序。相关性请记录在同目录 blind-review.json；未判断项保持 null，不按 0 处理。</p><p>0 不相关 · 1 有用背景 · 2 部分回应 · 3 直接有用。已掌握与相关性分别判断；原摘要不能证明全文正确。研究人物为实验设定。</p>'+experiment.cases.map(t=>'<section><h2>'+esc(t.goalZh)+'</h2><p>'+esc(t.goal)+'</p><ul>'+t.signals.map(s=>'<li>'+esc((s.layer==='explicit'?'明确反馈：':'暂定推断：')+s.labelEn)+'</li>').join('')+'</ul>'+t.candidates.map(p=>'<article><h3>'+esc(p.title)+'</h3><small>'+esc(p.id)+(t.knownIds.includes(p.id)?' · 设定中已掌握':'')+'</small><blockquote>'+esc(p.abstract)+'</blockquote><a href="'+esc(p.sourceUrl)+'" target="_blank" rel="noreferrer">核对公开来源 ↗</a></article>').join('')+'</section>').join('')+'</html>';
 await writeFile(path('blind-review.html'),html);
 // Save the exact whitelisted requests for auditing; never include a credential.
 await save('requests.json',experiment.cases.flatMap(t=>t.order.map(variant=>({caseId:t.id,variant,requestHash:digest(pilotRequest(experiment,t,variant)),request:pilotRequest(experiment,t,variant)}))));
 console.log(JSON.stringify({status:'prepared',cases:experiment.cases.length,uniquePapers:papers.length,plannedRuns:experiment.cases.length*3,experimentHash:experiment.experimentHash,directory}));
} else {
 const frozen=await json(path('experiment.json'));
 if(JSON.stringify(frozen)!==JSON.stringify(experiment))throw new Error('Frozen inputs changed. Prepare a new experiment directory.');
 let records=[];try{records=await json(path('runs.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 // The append-only attempt journal is authoritative if a process stopped before its projection was saved.
 try{const journal=(await readFile(path('attempts.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  records=[...new Map(journal.map(r=>[r.caseId+':'+r.variant,r])).values()];
 }catch(e){if(e.code!=='ENOENT')throw e;}
 summarizePilot(experiment,records);
 if(command==='run') {
  if(!process.argv.includes('--execute'))throw new Error('Use --execute to run the 12 bounded real model calls.');
  const key=process.env.DEEPSEEK_API_KEY?.trim();
  if(!key){await save('status.json',{status:'blocked',code:'model_credential_unavailable',completedRuns:records.filter(r=>r.status==='completed').length,plannedRuns:12,observedAt:new Date().toISOString()});throw new Error('DEEPSEEK_API_KEY is not configured in this process. No model request was sent. Do not paste credentials into chat.');}
  const sourceCommit=execFileSync('git',['rev-parse','--verify','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const files=['lib/personalization-pilot.mjs','lib/feedback-policy.mjs','scripts/run-personalization-pilot.mjs','benchmarks/personalization'];
  if(execFileSync('git',['status','--porcelain','--',...files],{cwd:root,encoding:'utf8'}).trim())throw new Error('Commit the experiment source before real calls.');
  if(records.some(r=>r.sourceCommit!==sourceCommit))throw new Error('Source revision changed; do not mix runs across revisions.');
  for(const task of experiment.cases)for(const variant of task.order) {
   const old=records.find(r=>r.caseId===task.id&&r.variant===variant);
   if(old?.status==='completed')continue;
   if(old&&!process.argv.includes('--retry-failed'))throw new Error('Prior failure retained; inspect attempts.jsonl before --retry-failed.');
   const cooldown=records.find(r=>r.retryNotBefore&&Date.parse(r.retryNotBefore)>Date.now());
   if(cooldown)throw new Error('Provider cooldown is still active.');
   const result=await executePilotRun(experiment,task,variant,{apiKey:key,sourceCommit});
   if(result.httpStatus===429){const seconds=Number(result.retryAfter);const timestamp=Number.isFinite(seconds)&&seconds>0?Date.now()+seconds*1000:Date.parse(result.retryAfter);result.retryNotBefore=new Date(Number.isFinite(timestamp)?timestamp:Date.now()+60_000).toISOString();}
   result.attempt=(old?.attempt||0)+1;
   await appendFile(path('attempts.jsonl'),JSON.stringify(result)+'\n');
   records=records.filter(r=>!(r.caseId===task.id&&r.variant===variant));records.push(result);
   await save('runs.json',records);await save('report.json',summarizePilot(experiment,records));
   console.log(JSON.stringify({caseId:task.id,variant,status:result.status,inputTokens:result.inputTokens,outputTokens:result.outputTokens}));
   if(result.status!=='completed')throw new Error('Run failed; results retained, no automatic retry.');
  }
  await save('status.json',{status:'rankings_recorded_awaiting_blind_review',observedAt:new Date().toISOString()});
 } else if(command==='score') {
  const review=await json(resolve(option('--judgments')||path('blind-review.json')));
  if(review.experimentHash!==experiment.experimentHash||review.reviewer?.independentOfRankings!==true||!review.reviewer?.name||!review.reviewer?.completedAt)throw new Error('Completed, identified blind review required.');
  if(summarizePilot(experiment,records).completedRuns!==12)throw new Error('All real rankings required before quality scoring.');
  if(new Set(records.map(r=>r.returnedModel)).size>1||new Set(records.map(r=>r.systemFingerprint).filter(Boolean)).size>1)throw new Error('Provider model changed during experiment.');
  if(review.cases.length!==experiment.cases.length)throw new Error('Incomplete review cases');
  for(const task of experiment.cases){
   const rows=review.cases.filter(c=>c.id===task.id);if(rows.length!==1)throw new Error('Missing or duplicate review case');
   const reviewed=rows[0];
   if(reviewed.contextId!==task.contextId||reviewed.candidates.length!==task.candidates.length)throw new Error('Review context mismatch');
   for(const p of task.candidates){const values=reviewed.candidates.filter(c=>c.id===p.id);if(values.length!==1||values[0].title!==p.title||values[0].abstract!==p.abstract||values[0].known!==task.knownIds.includes(p.id)||!values[0].reason?.trim())throw new Error('Changed, duplicated or unexplained judgment');}
  }
  await save('scored-report.json',{...evaluatePersonalization(review.cases,records),experimentHash:experiment.experimentHash,reviewer:review.reviewer});
  console.log('Scored recorded runs. This is an exploratory fixed-candidate pilot, not production uplift.');
 } else if(command==='report') {const report=summarizePilot(experiment,records);await save('report.json',report);console.log(JSON.stringify(report,null,2));}
 else throw new Error('Commands: prepare, run --execute, report, score --judgments file');
}
