import {createHash,timingSafeEqual} from 'node:crypto';
import {executePilotRun} from './personalization-pilot.mjs';
export async function handleServerPilot(request,{database,apiKey,experiment,accessHash,expiresAt,fetchImpl=fetch,now=Date.now()}) {
 const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
 if(now>=expiresAt)return reply({error:'experiment_closed'},410);
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 const hash=createHash('sha256').update(token).digest('hex');
 if(!/^[0-9a-f]{64}$/.test(accessHash)||!timingSafeEqual(Buffer.from(hash),Buffer.from(accessHash)))return reply({error:'unauthorized'},401);
 if((request.headers.get('content-length')||'').length>12)return reply({error:'invalid_request'},400);
 const raw=await request.text();if(raw.length>1000)return reply({error:'invalid_request'},400);
 let body;try{body=JSON.parse(raw);}catch{return reply({error:'invalid_request'},400);}
 if(!body||Object.keys(body).some(k=>!['caseId','variant','sourceCommit'].includes(k)))return reply({error:'fixed_experiment_only'},400);
 const task=experiment.cases.find(t=>t.id===body.caseId);
 if(!task||!['none','explicit','all'].includes(body.variant)||!/^[0-9a-f]{40}$/.test(body.sourceCommit||''))return reply({error:'invalid_case'},400);
 if(!apiKey)return reply({error:'server_model_unconfigured'},428);
 const id=experiment.experimentHash+':'+task.id+':'+body.variant;
 const previousSource=await database.prepare('SELECT source_commit FROM personalization_pilot_runs WHERE experiment_hash=? LIMIT 1').bind(experiment.experimentHash).first();
 if(previousSource&&previousSource.source_commit!==body.sourceCommit)return reply({error:'source_revision_mismatch'},409);
 const claim=await database.prepare('INSERT OR IGNORE INTO personalization_pilot_runs (id,experiment_hash,source_commit,case_id,variant,status,result_json,created_at) VALUES (?,?,?,?,?,\'pending\',\'{}\',?)')
  .bind(id,experiment.experimentHash,body.sourceCommit,task.id,body.variant,now).run();
 if(!claim.meta?.changes){
  const old=await database.prepare('SELECT status,result_json FROM personalization_pilot_runs WHERE id=?').bind(id).first();
  return old?.status==='pending'?reply({error:'request_already_claimed',detail:'No second call is made; inspect the existing run.'},409):reply({cached:true,record:JSON.parse(old.result_json)});
 }
 const record=await executePilotRun(experiment,task,body.variant,{apiKey,sourceCommit:body.sourceCommit,fetchImpl});
 await database.prepare('UPDATE personalization_pilot_runs SET status=?,result_json=? WHERE id=? AND status=\'pending\'').bind(record.status,JSON.stringify(record),id).run();
 return reply({cached:false,record});
}
