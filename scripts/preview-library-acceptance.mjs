// Test-only built Worker/D1. No production credentials or external provider access.
import {Miniflare} from 'miniflare';
import {glob,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {workbookEvidenceCatalog,resolveAnchoredWorkbook} from '../lib/workbook-evidence.ts';
const sample=JSON.parse(await readFile(new URL('../tests/fixtures/library-comparison.json',import.meta.url),'utf8'));
const sources=sample.sources.map(source=>({...source,routeMember:true}));
const catalog=workbookEvidenceCatalog(sources),anchored=structuredClone(sample.content);
const ref=id=>{const source=catalog.find(s=>id.endsWith(':'+s.paperId));if(!source)throw Error('Unknown sample source');return id.slice(0,-source.paperId.length)+source.key;};
for(const dimension of anchored.dimensions)for(const cell of dimension.cells){
  const source=catalog.find(s=>s.paperId===cell.paperId);
  cell.quoteIds=cell.status==='missing'?[]:(cell.quotes||[cell.quote]).map(text=>{const quote=source.quotes.find(q=>q.text===text);if(!quote)throw Error('Unlocated sample quote');return quote.id;});
  cell.paperId=source.key;delete cell.quote;delete cell.quotes;
}
anchored.comparison.evidenceIds=anchored.comparison.evidenceIds.map(ref);
for(const step of anchored.task.steps)step.evidenceIds=step.evidenceIds.map(ref);
resolveAnchoredWorkbook(anchored,sources);
const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];
for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
const owner='browser-acceptance-owner-001',space='acceptance-library',track='acceptance-quantum';
let mode='',failed=false,corrected=false,counts={draft:0,review:0,repair:0};
const mf=new Miniflare({host:'127.0.0.1',port:8146,cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:{DEEPSEEK_API_KEY:'sk-isolated-browser-fixture-no-provider-access'},modulesRoot:root,assets:{directory:fileURLToPath(new URL('../dist/client/',import.meta.url)),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},modules:[{type:'ESModule',path:root+'browser-acceptance-entry.js',contents:`import app from './index.js';export default{async fetch(r,e,c){const u=new URL(r.url);
if(u.pathname==='/__acceptance/start')return new Response(null,{status:302,headers:{Location:'/#library?space=${space}&q=erasure','Set-Cookie':'pi_anonymous_workspace=${owner}; Path=/; SameSite=Lax'}});
if(u.pathname==='/__acceptance/reset'){await e.DB.batch(['DELETE FROM research_comparison_artifacts','DELETE FROM research_workbook_attempts','DELETE FROM research_comparison_workbooks'].map(sql=>e.DB.prepare(sql)));return new Response('reset');}
if(u.pathname==='/__acceptance/release'){await e.DB.prepare('UPDATE research_comparison_workbooks SET retry_at=0,lease_until=0').run();return new Response('released');}
if(u.pathname==='/_next/image'&&u.searchParams.get('url')?.startsWith('/pi-'))return e.ASSETS.fetch(new Request(new URL(u.searchParams.get('url'),r.url)));
if(u.pathname.startsWith('/_next/')||/\\.(png|svg|ico|woff2?)$/.test(u.pathname))return e.ASSETS.fetch(r);
return app.fetch(r,e,c)}}`},...modules],outboundService:async request=>{
  const url=new URL(request.url);
  if(!url.hostname.endsWith('deepseek.com'))return new Response('External services disabled in isolated browser acceptance',{status:503});
  if(url.pathname.endsWith('/models'))return Response.json({data:[{id:'deepseek-chat'},{id:'deepseek-reasoner'},{id:'deepseek-v4.1-flash'}]});
  const body=await request.json();
  if(body.messages?.length===1&&body.messages[0].content==='Reply OK.')return Response.json({choices:[{finish_reason:'stop',message:{content:'OK'}}]});
  const input=JSON.parse(body.messages?.[1]?.content||'{}');
  if(!input.requiredCheckIds&&!input.contract?.dimensions&&!input.correction)return new Response('Unrelated model work disabled in browser acceptance',{status:503});
  if(input.requiredCheckIds){
    counts.review++;
    if(mode==='review-rate-limit'&&!failed){failed=true;return Response.json({error:{message:'Isolated provider rate limit'}},{status:429});}
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({verdict:mode==='repair'&&!corrected&&input.requiredCheckIds.includes('comparison')?'unsupported':'supported',checks:input.requiredCheckIds.map(id=>({id,verdict:mode==='repair'&&!corrected&&id==='comparison'?'unsupported':'supported',...(mode==='repair'&&!corrected&&id==='comparison'?{issueType:'repairable'}:{}),paperIds:sources.map(s=>s.id),reason:'Deterministic browser regression reply, not a live academic audit.'}))})}}],usage:{prompt_tokens:1,completion_tokens:1}});
  }
  if(input.correction){
    counts.repair++;corrected=true;
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({patches:[{id:'f1',value:{...anchored.comparison,textEn:'The abstracts do not provide enough shared conditions for a direct comparison.'}}]})}}]});
  }
  counts.draft++;
  if((mode==='draft-json-once'&&!failed)||mode==='draft-json-always'){
    failed=true;return Response.json({choices:[{finish_reason:'stop',message:{content:'invalid JSON fixture'}}]});
  }
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(anchored)}}],usage:{prompt_tokens:1,completion_tokens:1}});
}});
const call=path=>mf.dispatchFetch('http://localhost'+path,{headers:{cookie:'pi_anonymous_workspace='+owner}});
await call('/api/spaces');const db=await mf.getD1Database('DB');
for(const file of ['0063_fair_kulan_gath.sql','0064_watery_veda.sql']){
  const statements=(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint').filter(sql=>sql.trim()&&(file.startsWith('0064')||sql.includes('library_graph')||sql.includes('research_route_library')));
  await db.batch(statements.map(sql=>db.prepare(sql)));
}
const insert=(table,value)=>db.prepare(`INSERT INTO ${table} (${Object.keys(value).join(',')}) VALUES (${Object.keys(value).map(()=>'?').join(',')})`).bind(...Object.values(value));
await db.batch([
  insert('research_spaces',{id:space,owner_user_id:'anonymous:'+owner,name:'浏览器自动验收 · 隔离论文库',member_name:'Regression'}),
  insert('research_tracks',{id:track,space_id:space,title_zh:'量子编码条件比较',title_en:'Quantum coding conditions',summary_zh:'区分反馈擦除信道与通用编码的条件。',summary_en:'Separate feedback erasure channels and universal coding.',build_status:'ready'}),
  insert('research_problems',{id:'acceptance-question',space_id:space,track_id:track,question:sample.content.questionZh,objective:'Check explicit abstract conditions',scope:'Abstract evidence only',success_criteria:'Preserve qualifications',status:'active',model:'user-entry-v1'}),
  insert('research_tracks',{id:'acceptance-other',space_id:space,title_zh:'另一条研究路线',title_en:'Another research route',summary_zh:'另一条独立研究问题。',summary_en:'An independent research question.',build_status:'ready'}),
  insert('research_problems',{id:'acceptance-other-question',space_id:space,track_id:'acceptance-other',question:'通用编码需要哪些信道未知条件？',objective:'Check universal coding',scope:'Only this route',success_criteria:'Keep scope',status:'active',model:'user-entry-v1'}),
  insert('research_track_edges',{id:'acceptance-edge',space_id:space,source_track_id:track,target_track_id:'acceptance-other',kind:'supports',relationship_zh:'条件核对',relationship_en:'Check conditions'}),
  ...sources.flatMap((source,index)=>[
    insert('monitored_papers',{id:source.id,space_id:space,canonical_id:source.canonicalId,title:source.title,authors:source.authors,url:source.url,venue:'arXiv',horizon:'years',discovered_at:index?'2026-01-01':'2026-10-20'}),
    insert('paper_insights',{paper_id:source.id,space_id:space,abstract_text:source.abstractText,reading_focus_zh:source.readingFocusZh,reading_focus_en:source.readingFocusEn,quality_score:90,ever_recommended:1,llm_recommended:1,analysis_source:'deepseek',verification_status:'verified',why_read_zh:'核对摘要所述信道与编码限制。',why_read_en:'Check the stated channel and coding restrictions.'}),
    insert('paper_reading_progress',{id:'progress-'+source.id,space_id:space,paper_id:source.id,status:'queued',note:'erasure: offline browser acceptance source'}),
    insert('research_track_papers',{id:'acceptance-route-'+index,space_id:space,track_id:track,canonical_id:source.canonicalId,title:source.title,authors:source.authors,url:source.url,role:'background',summary_zh:'',summary_en:'',rationale_zh:'自动验收的公开论文摘要。',rationale_en:'Public abstract for browser regression.'}),
  ]),
]);
await db.batch(Array.from({length:61},(_,index)=>[
  insert('monitored_papers',{id:'acceptance-filler-'+String(index).padStart(3,'0'),space_id:space,canonical_id:'fixture:filler-'+index,title:'Erasure pagination fixture '+index,authors:'Regression fixture',venue:'Synthetic pagination record',url:'https://example.test/'+index,horizon:'years',discovered_at:'2026-06-01'}),
  insert('paper_reading_progress',{id:'filler-progress-'+index,space_id:space,paper_id:'acceptance-filler-'+String(index).padStart(3,'0'),status:'queued',note:'erasure pagination fixture'}),
]).flat());
// The fixture has an explicit control plane outside the deployed application.
const {createServer}=await import('node:http');
// Separate local-only port keeps test controls out of application requests.
const controls=createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1:8147');if(url.pathname==='/scenario'){mode=url.searchParams.get('mode')||'';failed=false;corrected=false;counts={draft:0,review:0,repair:0};res.end('ok');}else if(url.pathname==='/counts'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(counts));}else{res.statusCode=404;res.end();}});
await new Promise(resolve=>controls.listen(8147,'127.0.0.1',resolve));
await mf.ready;console.log('Isolated browser acceptance: http://127.0.0.1:8146/__acceptance/start');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{controls.close();await mf.dispose();process.exit(0);});
