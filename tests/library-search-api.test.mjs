import test from 'node:test';
import assert from 'node:assert/strict';
import {glob} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
test('full-library search and exports find oldest notes beyond display limits and enforce ownership',{timeout:120000},async()=>{
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];
 for await(const p of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+p});
 const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,
 modules:[{type:'ESModule',path:root+'library-fixture.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules],outboundService:()=>{throw Error('Read-only library must not call a model or source')}});
 const call=(path,body,owner='library-fixture-owner')=>mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{cookie:`pi_anonymous_workspace=${owner}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const sql=async items=>{const r=await call('/fixture',items);assert.equal(r.status,200,await r.clone().text());return r.json()};
 const insert=(table,values)=>({sql:`INSERT INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(()=>'?').join(',')})`,values:Object.values(values)});
 const search=async(query='')=>{const r=await call('/api/library/search?spaceId=s&'+query);assert.equal(r.status,200,await r.clone().text());return r.json()};
 try{
  await call('/api/library/search?spaceId=s');
  await sql([insert('research_spaces',{id:'s',owner_user_id:'anonymous:library-fixture-owner',name:'Fixture',member_name:'Fixture'}),insert('research_spaces',{id:'other',owner_user_id:'anonymous:other-owner',name:'Other',member_name:'Other'})]);
  for(let start=0;start<2102;start+=80)await sql(Array.from({length:Math.min(80,2102-start)},(_,i)=>{const n=start+i,id='p'+String(n).padStart(4,'0');return insert('monitored_papers',{id,space_id:'s',canonical_id:'fixture:'+id,doi:'10.fixture/'+n,title:n===0?'Oldest Lossy Compression':n<130?'Sequence row '+n:'Literature '+n,authors:n===0?'Oldest Author':'Fixture',venue:'Fixture Journal',url:'https://example.test/'+id,horizon:'years',discovered_at:n===0?'2020-01-01':'2026-10-13'})}));
  await sql([insert('paper_feedback',{id:'f',space_id:'s',paper_id:'p0000',saved:1,feedback:'relevant',reason_code:'method_fit',note:'Useful assumption'}),insert('paper_reading_progress',{id:'r',space_id:'s',paper_id:'p0000',status:'reading',note:'Unique dispersion note'}),insert('monitored_papers',{id:'foreign',space_id:'other',canonical_id:'foreign',title:'Oldest Lossy Compression',authors:'Foreign',venue:'Other',url:'https://example.test/foreign',horizon:'years'})]);
  for(const q of ['Oldest Lossy','oldest author','10.fixture/0','Unique dispersion']){
   const result=await search('q='+encodeURIComponent(q));assert.deepEqual(result.papers.map(p=>p.id),['p0000']);assert.equal(result.papers[0].readingNote,'Unique dispersion note');assert.equal(result.total,1);
  }
  assert.equal((await search('tag=saved')).papers[0].id,'p0000');assert.equal((await search('tag=notes')).total,1);
  const first=await search('q=Sequence&sort=newest'),second=await search('q=Sequence&sort=newest&offset=60'),third=await search('q=Sequence&sort=newest&offset=120');
  assert.equal(first.total,129);assert.equal(first.nextOffset,60);assert.equal(third.nextOffset,null);assert.equal(new Set([...first.papers,...second.papers,...third.papers].map(p=>p.id)).size,129);
  assert.equal((await search()).counts.total,2102);
  assert.equal((await search("q="+encodeURIComponent("%' OR 1=1 --"))).total,0,'query is literal, not SQL');
  assert.equal((await call('/api/library/search?spaceId=other')).status,404);assert.equal((await call('/api/library/search?spaceId=s&offset=-1')).status,400);
  await sql([insert('paper_insights',{space_id:'s',paper_id:'p0001',llm_recommended:1,analysis_source:'deepseek',quality_score:90}),insert('paper_insights',{space_id:'s',paper_id:'p0002',analysis_source:'deepseek_rejected',screening_reason:'Abstract evidence unavailable after bounded enrichment'}),insert('paper_insights',{space_id:'s',paper_id:'p0003',analysis_source:'deepseek_verification_pending'})]);
  assert.deepEqual((await search('stage=evaluated')).papers.map(p=>p.id),['p0001','p0003']);
  assert.equal((await search('q=Sequence&filter=inbox')).total,2);
  assert.equal((await search('filter=accepted')).total,1);
  const backupResponse=await call('/api/library?spaceId=s&format=json');assert.equal(backupResponse.status,200);const backup=await backupResponse.json();
  assert.equal(backup.papers.length,2102);const old=backup.papers.find(p=>p.id==='p0000');assert.equal(old.readingNote,'Unique dispersion note');assert.equal(old.saved,true);assert.equal(old.feedbackReasonCode,'method_fit');assert.equal(old.feedbackNote,'Useful assumption');assert.equal(backup.papers.some(p=>p.id==='foreign'),false);
  const ris=await (await call('/api/library?spaceId=s&format=ris&scope=all')).text();assert.equal((ris.match(/TY  - JOUR/g)||[]).length,2102);assert.match(ris,/Oldest Lossy Compression/);
  const bib=await (await call('/api/library?spaceId=s&format=bibtex&scope=accepted')).text();assert.equal((bib.match(/@article/g)||[]).length,1);assert.match(bib,/Oldest Lossy Compression/);
  assert.equal((await call('/api/library?spaceId=other&format=json')).status,404);
 }finally{await mf.dispose()}
});
