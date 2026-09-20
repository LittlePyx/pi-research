import assert from 'node:assert/strict';
import {glob,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import {focusCitationRelations,graphIdentifier} from '../lib/library-graph.ts';
import {nextDigestAt,shanghaiDate,escapeEmail} from '../lib/email-digest.ts';

test('citation focus separates direct, intermediate and disconnected links',()=>{const edges=[{sourcePaperId:'b',targetPaperId:'a'},{sourcePaperId:'c',targetPaperId:'b'},{sourcePaperId:'y',targetPaperId:'x'}];const s=focusCitationRelations(edges,'a');assert.deepEqual(s.direct,[edges[0]]);assert.deepEqual(s.indirect,[edges[1]]);assert.deepEqual(s.others,[edges[2]]);assert.equal(graphIdentifier({doi:null,canonical_id:'arxiv:2401.12345'}),'ARXIV:2401.12345');});
test('digest uses Beijing 10am boundaries and escapes paper text',()=>{const now=Date.parse('2026-09-16T01:59:00Z');assert.equal(new Date(nextDigestAt('10:00',now)).toISOString(),'2026-09-16T02:00:00.000Z');assert.equal(new Date(nextDigestAt('10:00',now+60000)).toISOString(),'2026-09-17T02:00:00.000Z');assert.equal(shanghaiDate(Date.parse('2026-09-15T18:00:00Z')),'2026-09-16');assert.equal(escapeEmail('<script>"&'),'&lt;script&gt;&quot;&amp;');});

test('library, route collections, graph checks and opted-in email delivery isolate users and preserve formal evidence',{timeout:90000},async()=>{
  const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
  const emailSource=ts.transpileModule(await readFile(new URL('../lib/email-digest.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const messages=[];let graphCalls=0,failDigestOnce=false;
  const mf=new Miniflare({cf:false,d1Databases:['DB'],bindings:{RESEND_API_KEY:'fixture-only',EMAIL_FROM:'Pi <fixture@example.test>'},compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,modules:[{type:'ESModule',path:root+'library-email-fixture.js',contents:`import app from './index.js';import {runEmailDigests} from './email-module-fixture.js';export default{async fetch(r,e,c){const p=new URL(r.url).pathname;if(p==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));if(p==='/dispatch')return Response.json(await runEmailDigests(e,Number(new URL(r.url).searchParams.get('now'))));return app.fetch(r,e,c)}}`},{type:'ESModule',path:root+'email-module-fixture.js',contents:emailSource},...modules],outboundService:async request=>{
    if(request.url.startsWith('https://api.resend.com/emails')){messages.push({key:request.headers.get('Idempotency-Key'),body:await request.json()});if(failDigestOnce){failDigestOnce=false;return new Response('temporary',{status:503});}return Response.json({id:`fixture-${messages.length}`});}
    if(request.url.includes('api.semanticscholar.org')){graphCalls++;return Response.json({data:request.url.includes('/references')?[{citedPaper:{paperId:'neighbor',externalIds:{DOI:'10.1234/p1'},title:'Gaussian entropy comparison',year:2025,authors:[]}}]:[]});}
    return new Response('External call blocked',{status:503});}});
  const call=async(path,body,status=200,owner='library-email-owner-00001')=>{const r=await mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{cookie:`pi_anonymous_workspace=${owner}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const raw=await r.text();assert.equal(r.status,status,raw.slice(0,1000));return JSON.parse(raw);};
  const sql=rows=>call('/fixture',rows),ins=(table,v)=>({sql:`INSERT INTO ${table}(${Object.keys(v).join(',')}) VALUES(${Object.keys(v).map(()=>'?').join(',')})`,values:Object.values(v)});
  try{
    await call('/api/research-memory?spaceId=mine',null,404);
    const migration=(await readFile(new URL('../drizzle/0063_fair_kulan_gath.sql',import.meta.url),'utf8'))+'\n--> statement-breakpoint\n'+(await readFile(new URL('../drizzle/0064_watery_veda.sql',import.meta.url),'utf8'));await sql(migration.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(sql=>({sql})));
    await sql([ins('research_spaces',{id:'mine',owner_user_id:'anonymous:library-email-owner-00001',name:'Gaussian entropy',member_name:'QA'}),ins('research_spaces',{id:'other',owner_user_id:'anonymous:other-library-owner-0002',name:'Other',member_name:'QA'}),ins('research_tracks',{id:'route',space_id:'mine',title_en:'Gaussian entropy inequalities',title_zh:'高斯熵不等式'})]);
    const papers=[];for(let n=0;n<27;n++)papers.push(ins('monitored_papers',{id:`p${n}`,space_id:'mine',canonical_id:`doi:10.1234/p${n}`,doi:n===26?null:`10.1234/p${n}`,title:n===26?'unrelated 100% topic':`Gaussian entropy comparison ${n}`,horizon:'days'}));await sql(papers);
    await call('/api/research-maintenance?spaceId=other',null,404); const maintenance=await call('/api/research-maintenance?spaceId=mine');assert.equal(maintenance.graph.total,27);assert.equal(maintenance.routes.total,27);
    const catalog=await call('/api/library-catalog?spaceId=mine');assert.equal(catalog.total,27);assert.equal(catalog.items.length,24);assert.equal(catalog.coverage.checked,0);assert.equal((await call('/api/library-catalog?spaceId=mine&offset=24')).items.length,3);
    assert.equal((await call('/api/library-catalog?spaceId=mine&q=100%25')).total,1);
    await call('/api/library-catalog?spaceId=other',null,404);await call('/api/library-graph?spaceId=other&paperId=p0',null,404);
    assert.equal((await call('/api/library-catalog?spaceId=mine&trackId=route')).total,0,'keyword-only candidates stay outside the default route');
    await call('/api/library-catalog',{spaceId:'mine',trackId:'route',paperId:'p0',status:'excluded',category:'related'});
    assert.equal((await call('/api/library-catalog?spaceId=mine&trackId=route')).total,0);
    assert.equal((await call('/api/library-catalog?spaceId=mine&trackId=route&scope=all')).total,27);
    await call('/api/library-catalog',{spaceId:'mine',trackId:'route',paperId:'p26',status:'included',category:'background'});
    assert.equal((await call('/api/library-catalog?spaceId=mine&trackId=route')).total,1,'explicit user selection remains visible');
    assert.equal((await sql([{sql:'SELECT COUNT(*) AS n FROM research_track_papers'}]))[0].results[0].n,0);
    assert.equal((await call('/api/library-graph?spaceId=mine&paperId=p0')).status,'pending');
    const graph=await call('/api/library-graph',{spaceId:'mine',paperId:'p0'});assert.equal(graph.status,'ready');assert.equal(graph.items[0].paperId,'p1');assert.equal(graph.items[0].kind,'reference');assert.equal(graphCalls,2);
    await call('/api/library-graph',{spaceId:'mine',paperId:'p0'},202);assert.equal(graphCalls,2);
    const email=await call('/api/email-subscription?spaceId=mine');assert.equal(email.configured,true);assert.equal(email.subscription,null);await call('/api/email-subscription?spaceId=other',null,404);
    await call('/api/email-subscription',{spaceId:'mine',action:'save',email:'reader@example.test',enabled:true},409);assert.equal(messages.length,0);
    await call('/api/email-subscription',{spaceId:'mine',action:'request-code',email:'reader@example.test',sendTime:'10:00'});assert.equal(messages.length,1);
    await call('/api/email-subscription',{spaceId:'mine',action:'request-code',email:'reader@example.test'},429);
    const code=messages[0].body.text.match(/\b\d{6}\b/)[0];
    const verified=await call('/api/email-subscription',{spaceId:'mine',action:'verify',email:'reader@example.test',code,enabled:true,sendTime:'10:00'});assert.equal(verified.subscription.enabled,1);assert.ok(verified.subscription.verifiedAt);assert.equal(verified.subscription.sendTime,'10:00');
    // This scenario tests same-day retry, not a retry that crosses the Shanghai date boundary.
    const now=Date.parse(new Date().toISOString().slice(0,10)+'T04:00:00Z');await sql([{sql:'UPDATE email_subscriptions SET next_send_at=? WHERE space_id=?',values:[now-1,'mine']}]);
    const results=await Promise.all([call(`/dispatch?now=${now}`),call(`/dispatch?now=${now}`)]);assert.equal(results.reduce((n,r)=>n+r.sent,0),1);assert.equal(messages.length,2);assert.match(messages[1].body.text,/尚未就绪/);
    await call(`/dispatch?now=${now+1000}`);assert.equal(messages.length,2);
    const tomorrow=now+86400000;await sql([
      ins('paper_insights',{paper_id:'p0',space_id:'mine',ever_recommended:1,verification_status:'verified',verification_coverage_score:90,summary_zh:'Verified <script>summary</script>',why_read_zh:'Read this verified result'}),
      ins('paper_insights',{paper_id:'p1',space_id:'mine',ever_recommended:1,verification_status:'pending',summary_zh:'MUST NOT SEND'}),
      ins('monitor_daily_briefs',{id:'daily',space_id:'mine',brief_date:shanghaiDate(tomorrow),status:'ready',paper_ids:'["p0","p1"]'}),
      {sql:'UPDATE email_subscriptions SET next_send_at=? WHERE space_id=?',values:[tomorrow-1,'mine']},
    ]);failDigestOnce=true;
    assert.equal((await call(`/dispatch?now=${tomorrow}`)).sent,0);assert.equal(messages.length,3);assert.match(messages[2].body.html,/&lt;script&gt;/);assert.doesNotMatch(messages[2].body.text,/MUST NOT SEND/);
    await sql([{sql:"UPDATE paper_insights SET summary_zh='Changed after first attempt' WHERE paper_id='p0'"}]);
    assert.equal((await call(`/dispatch?now=${tomorrow+1800001}`)).sent,1);assert.equal(messages[2].key,messages[3].key);assert.deepEqual(messages[2].body,messages[3].body,'retry uses exact stored payload and idempotency key');
    const token=(await sql([{sql:'SELECT unsubscribe_token FROM email_subscriptions WHERE space_id=?',values:['mine']}]))[0].results[0].unsubscribe_token;
    const get=await mf.dispatchFetch(`http://localhost/api/email-subscription/unsubscribe?token=${token}`);assert.equal(get.status,200);assert.equal((await call('/api/email-subscription?spaceId=mine')).subscription.enabled,1);
    const unsub=await mf.dispatchFetch(`http://localhost/api/email-subscription/unsubscribe?token=${token}`,{method:'POST'});assert.equal(unsub.status,200);assert.equal((await call('/api/email-subscription?spaceId=mine')).subscription.enabled,0);
    assert.equal((await sql([{sql:'SELECT COUNT(*) AS n FROM research_map_evidence_proposals'}]))[0].results[0].n,0);
    const abstract='This is a sufficiently detailed abstract with a directly relevant construction and explicit assumptions. The shared source remains authoritative.';
    const assessment={canonicalId:'doi:10.1234/p25',relevance:'direct',quote:abstract.slice(0,70),reasonZh:'原摘要支持路线相关性',reasonEn:'Relevant under stated assumptions',limitationZh:'不是正式证据',limitationEn:'Not formal evidence'};
    await sql([{sql:"UPDATE monitored_papers SET title='No keyword overlap' WHERE id='p25'"},ins('paper_insights',{paper_id:'p25',space_id:'mine',abstract_text:abstract}),ins('research_route_library_reviews',{id:'review',space_id:'mine',track_id:'route',paper_id:'p25',paper_title:'No keyword overlap',abstract_text:abstract,route_title:'Gaussian entropy inequalities\n高斯熵不等式',relevance:'direct',assessment_json:JSON.stringify(assessment),checked_at:Date.now()})]);
    const related=await call('/api/library-catalog?spaceId=mine&trackId=route&q=No%20keyword');assert.equal(related.total,1);assert.equal(related.items[0].relevance,'direct');assert.equal(JSON.parse(related.items[0].assessmentJson).quote,assessment.quote);
    await sql([{sql:"UPDATE paper_insights SET abstract_text='Changed evidence' WHERE paper_id='p25'"}]);
    assert.equal((await call('/api/library-catalog?spaceId=mine&trackId=route&q=No%20keyword')).total,0,'stale classification never appears as current relevance');
  }finally{await mf.dispose();}
});
