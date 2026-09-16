import assert from 'node:assert/strict';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Miniflare } from 'miniflare';

test('real Worker bridges audited abstracts, checks selection, independently reviews synthesis and invalidates withdrawn evidence', {timeout:60000}, async () => {
  const root=fileURLToPath(new URL('../dist/server/',import.meta.url)); const modules=[];
  for await(const path of glob('**/*.js',{cwd:root})) modules.push({type:'ESModule',path:root+path});
  let modelCalls=0; let rejectReview=false;
  const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],
    bindings:{DEEPSEEK_API_KEY:'sk-isolated-fixture-not-real'},modulesRoot:root,
    modules:[{type:'ESModule',path:root+'bridge-entry.js',contents:`import app from './index.js'; export default {async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules],
    outboundService:async request=>{
      assert.equal(new URL(request.url).hostname,'api.deepseek.com'); modelCalls++;
      const body=await request.json(); const prompt=body.messages[1].content;
      let output;
      if(body.messages[0].content.startsWith('Independently audit')) {
        const input=JSON.parse(prompt); output={verdict:rejectReview?'unsupported':'supported',checks:input.requiredIds.map(id=>({id,verdict:'supported',reason:'Isolated contract fixture.'}))};
      } else {
        const claims=JSON.parse(prompt.split('Grounded claim records: ')[1]);
        output={questionZh:'隔离比较问题',questionEn:'Isolated comparison question',overviewZh:'在各自条件下比较。',overviewEn:'Compare under the respective conditions.',changeSummaryZh:'',changeSummaryEn:'',nextSearchQuery:'',confidence:60,
          statements:[0,1].map(i=>({kind:'qualification',titleZh:`条件 ${i}`,titleEn:`Condition ${i}`,textZh:'这是隔离测试的条件说明。',textEn:'This is an isolated test condition.',confidence:60,sourceClaimIds:[claims[i].claimId]}))};
      }
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:1,completion_tokens:1}});
    }});
  const owner='bridge-fixture-owner-00001';
  const request=async(path,body,status=200,who=owner)=>{
    const r=await mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{cookie:`pi_anonymous_workspace=${who}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const raw=await r.text();assert.equal(r.status,status,raw.slice(0,1000));return JSON.parse(raw);
  };
  const sql=s=>request('/fixture',s);
  const insert=(table,v)=>({sql:`INSERT INTO ${table} (${Object.keys(v).join(',')}) VALUES (${Object.keys(v).map(()=>'?').join(',')})`,values:Object.values(v)});
  const path='/api/research-synthesis?spaceId=bridge&trackId=route';
  const quote='The result holds for isotropic log-concave measures under the stated additional regularity assumptions.';
  try {
    await request(path,null,404);
    await sql([insert('research_spaces',{id:'bridge',owner_user_id:`anonymous:${owner}`,name:'Isolated evidence bridge',member_name:'Fixture'}),insert('research_tracks',{id:'route',space_id:'bridge',title_zh:'隔离路线',title_en:'Isolated route'}),
      ...['a','b','c'].flatMap(id=>[
        insert('monitored_papers',{id,space_id:'bridge',canonical_id:`doi:10.999/${id}`,title:id==='c'?'Paper b':`Paper ${id}`,authors:'Fixture Author',horizon:'years',url:`https://example.org/${id}`}),
        insert('paper_insights',{paper_id:id,space_id:'bridge',abstract_text:quote+' This source is an isolated testing fixture and is not a real academic finding.',ever_recommended:1,verification_status:'verified',verification_coverage_score:90,
          verification_json:JSON.stringify({claimChecks:[{field:'contribution',grounded:true,verdict:'supported',evidenceQuote:quote}]})}),
        insert('research_map_evidence_proposals',{id:'proposal-'+id,space_id:'bridge',track_id:'route',paper_id:id,status:id==='a'?'confirmed':'pending',rationale_zh:'Fixture',rationale_en:'Fixture',confidence:90})])]);
    const initial=await request(path);
    assert.equal(initial.synthesis.availablePaperCount,1); assert.equal(initial.synthesis.canGenerate,false);
    assert.equal(initial.synthesis.preparation.find(p=>p.id==='b').hasGroundedEvidence,true);
    assert.equal(initial.synthesis.preparation.find(p=>p.id==='c').hasGroundedEvidence,true,'version deduplication must not hide an individual record’s audited evidence');
    assert.equal(initial.synthesis.preparation.find(p=>p.id==='b').state,'needs_confirmation');
    await request(path,null,404,'different-fixture-owner-002');
    assert.equal(modelCalls,0);
    await sql([{sql:"UPDATE research_map_evidence_proposals SET status='confirmed' WHERE space_id='bridge'"}]);
    assert.equal((await request(path)).synthesis.availablePaperCount,2,'duplicate version cannot count as a third independent paper');
    const generated=await request('/api/research-synthesis',{spaceId:'bridge',trackId:'route'});
    assert.equal(generated.synthesis.status,'ready'); assert.equal(modelCalls,2);
    assert.equal(generated.synthesis.statements.length,2);
    assert.ok(generated.synthesis.statements.every(s=>s.sources.every(x=>x.evidenceLevel==='abstract'&&x.evidenceQuote===quote)));
    rejectReview=true;
    await request('/api/research-synthesis',{spaceId:'bridge',trackId:'route',force:true},502);
    assert.equal((await request(path)).synthesis.statements.length,2,'failed independent review preserves saved findings');
    await sql([{sql:"UPDATE paper_insights SET abstract_text='Changed without original quote' WHERE paper_id IN ('b','c') AND space_id='bridge'"}]);
    const stale=await request(path); assert.equal(stale.synthesis.stale,true); assert.equal(stale.synthesis.canGenerate,false); assert.equal(stale.synthesis.statements.length,0);
    const problem=await request('/api/research-problem?spaceId=bridge&trackId=route');
    assert.equal(problem.problemState.evidence.canDraft,false,'withdrawn synthesis must not seed a new research problem');
    const rows=await sql([{sql:'SELECT COUNT(*) AS n FROM paper_evidence_claims'},{sql:'SELECT COUNT(*) AS n FROM paper_reading_progress'},{sql:'SELECT COUNT(*) AS n FROM paper_feedback'}]);
    assert.deepEqual(rows.map(r=>r.results[0].n),[0,0,0],'read projection never writes confirmation, legacy claims or reading');
  } finally { await mf.dispose(); }
});
