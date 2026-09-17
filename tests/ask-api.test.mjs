import test from 'node:test';
import assert from 'node:assert/strict';
import {glob} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';

test('ask isolates selected evidence and separates provider errors from configuration', {timeout:60000}, async()=>{
  const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];
  for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
  let reply='ok',input,calls=0;
  const mf=new Miniflare({host:'127.0.0.1',cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:{DEEPSEEK_API_KEY:'sk-isolated-ask-not-a-real-key'},modulesRoot:root,
    modules:[{type:'ESModule',path:root+'ask-test-entry.js',contents:`import app from './index.js'; export default {async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(({sql,values=[]})=>e.DB.prepare(sql).bind(...values))));return app.fetch(r,e,c);}};`},...modules],
    outboundService:async r=>{assert.equal(new URL(r.url).hostname,'api.deepseek.com');calls++;input=await r.json();if(reply==='busy')return Response.json({error:{message:'sensitive-provider-details'}},{status:429});return Response.json({choices:[{message:{content:reply==='empty'?'':'Isolated sourced answer'}}],usage:{prompt_tokens:2,completion_tokens:3}});}});
  const request=async(path,body)=>mf.dispatchFetch('http://localhost'+path,{method:'POST',headers:{cookie:'pi_anonymous_workspace=ask-fixture-owner-00001','Content-Type':'application/json'},body:JSON.stringify(body)});
  const sql=async rows=>{const r=await request('/fixture',rows);assert.equal(r.status,200);return r.json();};
  const ins=(table,v)=>({sql:`INSERT INTO ${table}(${Object.keys(v)}) VALUES(${Object.keys(v).map(()=>'?')})`,values:Object.values(v)});
  try {
    await request('/api/ask',{spaceId:'mine',question:'test'});
    await sql([ins('research_spaces',{id:'mine',owner_user_id:'anonymous:ask-fixture-owner-00001',name:'Test',member_name:'QA'}),ins('research_spaces',{id:'foreign',owner_user_id:'anonymous:other-ask-owner-00001',name:'Other',member_name:'QA'}),ins('research_tracks',{id:'t',space_id:'mine',title_en:'Route',title_zh:'路线'}),ins('monitored_papers',{id:'p',space_id:'mine',canonical_id:'doi:test',title:'Exact paper',horizon:'years'}),ins('paper_insights',{paper_id:'p',space_id:'mine',abstract_text:'UNIQUE ABSTRACT evidence with assumptions.'}),ins('research_track_papers',{id:'tp',track_id:'t',space_id:'mine',canonical_id:'doi:test',title:'Exact paper',role:'foundation',rationale_zh:'SAVED RATIONALE'} )]);
    const body={spaceId:'mine',question:'Why foundation?',trackId:'t',routePaperId:'tp',locale:'zh'};
    let r=await request('/api/ask',body);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).mode,'deepseek');
    assert.match(input.messages[0].content,/UNIQUE ABSTRACT/);assert.match(input.messages[0].content,/SAVED RATIONALE/);assert.match(input.messages[0].content,/not justified/);assert.equal(input.thinking.type,'disabled');
    const before=calls;r=await request('/api/ask',{...body,spaceId:'foreign'});assert.equal(r.status,404);assert.equal(calls,before);
    r=await request('/api/ask',{...body,routePaperId:'missing'});assert.equal(r.status,404);assert.equal(calls,before);
    reply='busy';r=await request('/api/ask',body);assert.equal(r.status,503);const failure=await r.json();assert.equal(failure.code,'provider_busy');assert.ok(failure.requestId);assert.equal(failure.answer,undefined);
    reply='empty';r=await request('/api/ask',body);assert.equal(r.status,502);assert.equal((await r.json()).code,'empty_response');
    const rows=await sql([{sql:'SELECT COUNT(*) AS n FROM research_conversations'}]);assert.equal(rows[0].results[0].n,1,'failures never saved as fake answers');
  }finally{await mf.dispose();}
});
