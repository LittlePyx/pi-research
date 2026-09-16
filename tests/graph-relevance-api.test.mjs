import assert from 'node:assert/strict';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Miniflare } from 'miniflare';
test('graph question review checks ownership, independent rejection and changed abstracts without acceptance writes',{timeout:60000},async()=>{
  const root=fileURLToPath(new URL('../dist/server/',import.meta.url));const modules=[];
  for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
  let calls=0,reject=false;let beforeReview=async()=>{};
  const quote='The construction in this isolated fixture assumes a positive definite covariance matrix throughout.';
  const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:{DEEPSEEK_API_KEY:'sk-isolated-fixture-not-real'},modulesRoot:root,
    modules:[{type:'ESModule',path:root+'graph-fixture.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules],
    outboundService:async req=>{calls++;const body=await req.json();assert.equal(body.model,'deepseek-flash');const input=JSON.parse(body.messages[1].content);assert.equal(input.question,'Which covariance assumptions are required?');
      const audit=body.messages[0].content.startsWith('Independently');if(audit)await beforeReview();
      const result=audit?{checks:[{canonicalId:'doi:fixture',supported:!reject}]}:{assessments:[{canonicalId:'doi:fixture',relevance:'direct',quote,reasonZh:'隔离测试需要正定条件。',reasonEn:'The fixture requires positive definiteness.',limitationZh:'未核对全文。',limitationEn:'Full text not checked.'}]};
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:1,completion_tokens:1}});
    }});
  const request=async(path,body,status=200,owner='graph-fixture-owner-00001')=>{const r=await mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{cookie:`pi_anonymous_workspace=${owner}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const raw=await r.text();assert.equal(r.status,status,raw.slice(0,1000));return JSON.parse(raw);};
  const sql=rows=>request('/fixture',rows);const insert=(table,v)=>({sql:`INSERT INTO ${table} (${Object.keys(v).join(',')}) VALUES (${Object.keys(v).map(()=>'?').join(',')})`,values:Object.values(v)});
  const body={spaceId:'graph',question:'Which covariance assumptions are required?',canonicalIds:['doi:fixture']};
  try{
    await request('/api/graph-relevance',body,404);
    await sql([insert('research_spaces',{id:'graph',owner_user_id:'anonymous:graph-fixture-owner-00001',name:'Isolated graph',member_name:'Fixture'}),insert('research_network_candidates',{id:'candidate',space_id:'graph',canonical_id:'doi:fixture',title:'Covariance fixture',abstract_text:quote+' These sentences are an isolated API contract fixture, not a published result.'})]);
    await request('/api/graph-relevance',body,404,'graph-other-owner-000002');assert.equal(calls,0);
    assert.equal((await request('/api/graph-relevance',body)).assessments[0].relevance,'direct');assert.equal(calls,2);
    reject=true;assert.equal((await request('/api/graph-relevance',body)).assessments[0].relevance,'insufficient');
    reject=false;beforeReview=()=>sql([{sql:"UPDATE research_network_candidates SET abstract_text='Withdrawn' WHERE id='candidate'"}]);
    await request('/api/graph-relevance',body,409);
    const counts=await sql([{sql:'SELECT COUNT(*) n FROM paper_feedback'},{sql:'SELECT COUNT(*) n FROM paper_reading_progress'},{sql:"SELECT status FROM research_network_candidates WHERE id='candidate'"}]);
    assert.deepEqual(counts.map(r=>r.results[0]),[{n:0},{n:0},{status:'ghost'}]);
  }finally{await mf.dispose();}
});
