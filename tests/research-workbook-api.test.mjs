import assert from "node:assert/strict";
import { glob, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";
import { workbookSample, workbookSources, anchoredSample } from "./fixtures/research-workbook.mjs";
import { workbookReviewFields, WORKBOOK_REVIEW_BATCH_SIZE } from "../lib/research-workbook.ts";

test("built workbook API checkpoints review, isolates owners and versions artifacts without research-state writes", { timeout: 60000 }, async t => {
  const serverDir = fileURLToPath(new URL("../dist/server/", import.meta.url));
  const modules = [];
  for await (const path of glob("**/*.js", { cwd: serverDir })) modules.push({ type: "ESModule", path: `${serverDir}${path}` });
  let abstractCalls = 0; const modelQuestions=[];
  let calls = 0; let beforeReply = async () => {}; let invalidReview = false; let failureMode=''; const reviewFlags=[];
  let graphMode='supported',graphCorrections=0;
  const persist=await mkdtemp(join(tmpdir(),'pi-workbook-graph-'));
  const options = { host: "127.0.0.1", cf: false, d1Databases: ["DB"], d1Persist:persist, compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
    bindings: { DEEPSEEK_API_KEY: "sk-isolated-fixture-not-a-real-key" }, modulesRoot: serverDir,
    modules: [{ type: "ESModule", path: `${serverDir}workbook-test-entry.js`, contents: `import app from './index.js'; export default { async fetch(request, env, ctx) {
      if (new URL(request.url).pathname === '/fixture') return Response.json(await env.DB.batch((await request.json()).map(({sql,values=[]}) => env.DB.prepare(sql).bind(...values))));
      return app.fetch(request,env,ctx); } };` }, ...modules],
    outboundService: async request => {
      const target = new URL(request.url);
      if (target.hostname === "api.crossref.org" && target.pathname.includes("version-fixture")) return Response.json({message:{DOI:"10.9999/version-fixture"}});
      if (target.hostname === "api.crossref.org" && target.searchParams.get("query.title") === "Isolated related version") return Response.json({message:{items:[{DOI:"10.9999/alternate-version",title:["Isolated related version"],author:[{given:"First",family:"Author"},{given:"Second",family:"Author"}],abstract:"Separate DOI version abstract, isolated test only. ".repeat(12)}]}});
      if (new URL(request.url).hostname === "api.crossref.org" && request.url.includes("abstract-fixture")) {
        abstractCalls++;
        return Response.json({ message: { DOI: "10.9999/abstract-fixture", abstract: "Isolated abstract recovery evidence, for integration testing only. ".repeat(8) } });
      }
      if (new URL(request.url).hostname !== "api.deepseek.com") return new Response("No external access in fixture", { status: 503 });
      calls++; const input = JSON.parse((await request.json()).messages[1].content); await beforeReply();
      modelQuestions.push(input.question);assert.doesNotMatch(input.question,/Researcher's comparison question:/,'explicit focus must not be concatenated with unrelated route background');
      reviewFlags.push(Boolean(input.requiredCheckIds));
      if(failureMode==='rate')return Response.json({error:{message:'sensitive provider fixture text'}},{status:429});
      if(failureMode==='truncated')return Response.json({choices:[{finish_reason:'length',message:{content:'partial fixture output'}}]});
      if(failureMode==='bad-json')return Response.json({choices:[{finish_reason:'stop',message:{content:'private invalid output'}}]});
      if(failureMode==='unauthorized-patch')return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({patches:[{id:'f1',value:{...anchoredSample().comparison,questionZh:'Unapproved question rewrite'}}]})}}]});
      if(failureMode==='invalid-evidence'){const invalid=anchoredSample();invalid.dimensions[0].cells[0].quoteIds=['p1.fabricated'];return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(invalid)}}]});}
      if(failureMode==='recover-evidence')assert.match(input.recovery,/unlocated_workbook_evidence/);
      if(failureMode==='recover-json'&&!input.requiredCheckIds)assert.match(input.recovery,/JSON-escape/);
      if(input.requiredCheckIds)assert.doesNotMatch(input.recovery||'',/Return only the patches array|previous response could not be used/i,'draft recovery instructions cannot leak into independent review');
      if(input.correction){graphCorrections++;assert.ok(input.correction.issues.some(i=>i.id==='comparison'));}
      const output = input.requiredCheckIds ? { verdict: "supported", checks: input.requiredCheckIds.map(id => ({ id,
        verdict: (invalidReview || input.issuePolicy && graphMode!=='supported' && (!graphCorrections || graphMode==='evidence_gap')) && id === "comparison" ? "unsupported" : "supported", paperIds: workbookSources.map(s => s.id), reason: "Isolated deterministic review; not a live academic judgment.",
        ...(input.issuePolicy && id==='comparison'?{issueType:graphMode==='evidence_gap'?'evidence_gap':'repairable'}:{}) })) } : input.correction ? {patches:[{id:'f1',value:{...anchoredSample().comparison,textEn:'The excerpts lack definitions and assumptions needed for direct comparison.'}}]} : anchoredSample();
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    },
  };
  let mf = new Miniflare(options);
  let cookie = "pi_anonymous_workspace=workbook-fixture-owner-00001";
  const request = async (path, body, expected = 200) => {
    const response = await mf.dispatchFetch(`http://localhost${path}`, { method: body ? "POST" : "GET", headers: { cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const raw = await response.text(); assert.equal(response.status, expected, raw.slice(0, 2000)); return JSON.parse(raw);
  };
  const sql = statements => request("/fixture", statements);
  const insert = (table, values) => ({ sql: `INSERT INTO ${table} (${Object.keys(values).join(",")}) VALUES (${Object.keys(values).map(() => "?").join(",")})`, values: Object.values(values) });
  const base = { spaceId: "math", trackId: "kls" };
  const path = "/api/research-workbook?spaceId=math&trackId=kls";
  const post = (body, status) => request("/api/research-workbook", { ...base, ...body }, status);
  const reviewCalls=Math.ceil(workbookReviewFields(workbookSample()).length/WORKBOOK_REVIEW_BATCH_SIZE);
  const finishReview=async state=>{for(let i=0;i<10&&state.status==='verifying';i++)state=(await post({action:'advance',workbookId:state.id})).workbook;return state;};
  try {
    await request(path, null, 404);
    await sql([
      insert("research_spaces", { id: "math", owner_user_id: "anonymous:workbook-fixture-owner-00001", name: "KLS fixture", member_name: "Test" }),
      insert("research_tracks", { id: "kls", space_id: "math", title_zh: "KLS 条件比较", title_en: "KLS conditions comparison" }),
      ...workbookSources.flatMap(s => [
        insert("monitored_papers", { id: s.id, space_id: "math", canonical_id: s.canonicalId, title: s.title, authors: s.authors, url: s.url, horizon: "years" }),
        insert("paper_insights", { paper_id: s.id, space_id: "math", quality_score: 90, ever_recommended: 1, verification_status: "verified", abstract_text: s.abstractText }),
      ]),
      insert("monitored_papers", { id: "unreviewed", space_id: "math", canonical_id: "unreviewed", title: "KLS unreviewed", horizon: "years" }),
      insert("paper_insights", { paper_id: "unreviewed", space_id: "math", ever_recommended: 0, abstract_text: workbookSources[0].abstractText }),
    ]);
    await t.test("missing abstract recovery preserves owner scope, requeues only missing-evidence reviews and persists its source", async () => {
      await sql([
        insert("monitored_papers", { id: "abstract-fixture", space_id: "math", canonical_id: "doi:10.9999/abstract-fixture", doi: "10.9999/abstract-fixture", title: "Isolated abstract recovery", authors: "Fixture author", horizon: "years" }),
        insert("paper_insights", { paper_id: "abstract-fixture", space_id: "math", analysis_source: "deepseek_rejected", analysis_model: "old-review", screening_reason: "Abstract evidence unavailable after bounded enrichment" }),
      ]);
      await request("/api/paper-reading", { spaceId: "other-owner", paperId: "abstract-fixture" }, 404);
      assert.equal(abstractCalls, 0);
      const result = await request("/api/paper-reading", { spaceId: "math", paperId: "abstract-fixture" });
      assert.equal(result.recovery.status, "found");
      assert.match(result.recovery.source_url, /crossref/);
      assert.ok(result.paper.abstractText.length >= 120);
      await request("/api/paper-reading", { spaceId: "math", paperId: "abstract-fixture" });
      assert.equal(abstractCalls, 1, "saved abstract prevents duplicate enrichment");
      const rows = await sql([{ sql: "SELECT analysis_source,analysis_model,ever_recommended,llm_recommended FROM paper_insights WHERE paper_id='abstract-fixture'" }]);
      assert.deepEqual(rows[0].results[0], { analysis_source: "deepseek_screened", analysis_model: "", ever_recommended: 0, llm_recommended: 0 });
      assert.equal(calls, 0, "recovery cannot manufacture a model review");
      await sql([{ sql: "UPDATE paper_insights SET abstract_text='',analysis_source='deepseek_rejected',analysis_model='real-review',screening_reason='Quality review did not select this paper' WHERE paper_id='abstract-fixture'" }, { sql: "UPDATE paper_abstract_recovery SET status='not_found',retry_at=? WHERE paper_id='abstract-fixture'", values:[Date.now()+3600000] }]);
      const waiting = await request("/api/paper-reading", { spaceId: "math", paperId: "abstract-fixture" });
      assert.equal(waiting.recovery.status, "not_found");
      assert.equal(abstractCalls, 1, "paper cooldown cannot be bypassed by reopening");
      await sql([{ sql: "UPDATE paper_abstract_recovery SET retry_at=0 WHERE paper_id='abstract-fixture'" }]);
      await request("/api/paper-reading", { spaceId: "math", paperId: "abstract-fixture" });
      const preserved = await sql([{ sql: "SELECT analysis_source,analysis_model FROM paper_insights WHERE paper_id='abstract-fixture'" }]);
      assert.deepEqual(preserved[0].results[0], { analysis_source:"deepseek_rejected", analysis_model:"real-review" });
    });
    await t.test("alternate DOI abstracts stay separate and do not overwrite or requeue the original record", async () => {
      await sql([
        insert("monitored_papers", {id:"version-fixture",space_id:"math",canonical_id:"doi:10.9999/version-fixture",doi:"10.9999/version-fixture",title:"Isolated related version",authors:"First Author, Second Author",horizon:"years"}),
        insert("paper_insights", {paper_id:"version-fixture",space_id:"math",abstract_text:"Saved short text",analysis_source:"deepseek_rejected",analysis_model:"previous-review"}),
      ]);
      const result = await request("/api/paper-reading", {spaceId:"math",paperId:"version-fixture"});
      assert.equal(result.recovery.status,"related_version");
      assert.equal(result.recovery.related.doi,"10.9999/alternate-version");
      assert.equal(result.paper.abstractText,"Saved short text");
      assert.equal(result.paper.analysisSource,"deepseek_rejected");
      const saved = await request("/api/paper-reading?spaceId=math&paperId=version-fixture");
      assert.deepEqual(saved.recovery.related,result.recovery.related);
    });
    await t.test("synthesis preparation identifies pending materials and manual problem definition needs no generated synthesis", async () => {
      await sql([insert("research_map_evidence_proposals", { id: "pending-material", space_id: "math", track_id: "kls", paper_id: workbookSources[0].id, status: "pending" })]);
      const synthesis = (await request("/api/research-synthesis?spaceId=math&trackId=kls")).synthesis;
      assert.equal(synthesis.canGenerate, false);
      assert.equal(synthesis.preparation[0].id, workbookSources[0].id);
      assert.equal(synthesis.preparation[0].state, "needs_confirmation");
      assert.equal(synthesis.preparation[0].hasGroundedEvidence, false);
      assert.equal(calls, 0);
      const reading = await request(`/api/paper-reading?spaceId=math&paperId=${workbookSources[0].id}`);
      assert.equal(reading.paper.abstractText, workbookSources[0].abstractText);
      await request(`/api/paper-reading?spaceId=other-owner&paperId=${workbookSources[0].id}`, null, 404);
      assert.equal(calls, 0);
      const defined = await request("/api/research-problem", { ...base, action: "confirm", question: "Which assumptions should I compare?", objective: "Inspect the two supplied papers", scope: "Only the supplied abstracts", successCriteria: "Record supported and missing assumptions", hypotheses: [] });
      assert.equal(defined.problemState.problem.status, "active");
      assert.equal(defined.problemState.problem.question, "Which assumptions should I compare?");
      assert.equal(calls, 0);
      await request("/api/research-synthesis?spaceId=other-owner&trackId=kls", null, 404);
    });
    let state;
    await t.test("reads never generate; approval and source identities are checked", async () => {
      assert.equal((await request(path)).workbook.candidates.length, 2); assert.equal(calls, 0);
      await post({ action: "prepare", paperIds: [workbookSources[0].id, "unreviewed"] }, 422);
      state = (await post({ action: "prepare", paperIds: workbookSources.map(s => s.id) })).workbook;
      assert.equal(state.status, "verifying"); assert.equal(state.content, null); assert.equal(calls, 1);
      assert.equal((await request(path)).workbook.status, "verifying"); assert.equal(calls, 1);
    });
    await t.test("independent review publishes one shared table, task and learning unit", async () => {
      const checkpoint=(await post({action:'advance',workbookId:state.id})).workbook;
      assert.equal(checkpoint.status,'verifying');assert.equal(checkpoint.content,null);
      assert.equal(checkpoint.reviewProgress.completed,WORKBOOK_REVIEW_BATCH_SIZE);
      const reloaded=(await request(path+'&workbookId='+encodeURIComponent(state.id))).workbook;
      assert.deepEqual(reloaded.reviewProgress,checkpoint.reviewProgress);
      state = await finishReview(state);
      assert.equal(state.status, "ready"); assert.equal(state.content.comparison.status, "insufficient"); assert.equal(calls, 1+reviewCalls);
      await post({ action: "prepare", paperIds: workbookSources.map(s => s.id) }); assert.equal(calls, 1+reviewCalls);
    });
    await t.test("artifact saves use optimistic revisions and preserve reading/route states", async () => {
      const artifact = { observations: { "conditions:sample-klartag": "Need the stated assumptions" }, decision: "These excerpts are insufficient for direct comparison", unresolved: "Constant definitions" };
      const save = { action: "save-artifact", workbookId: state.id, sourceRevision: state.revision, baseRevision: 0, value: artifact };
      state = (await post(save)).workbook; assert.equal(state.artifact.revision, 1);
      await post(save, 409);
      const read = (await request(path)).workbook; assert.deepEqual(read.artifact.value, artifact);
      const rows = await sql([{ sql: "SELECT COUNT(*) AS n FROM paper_reading_progress" }, { sql: "SELECT COUNT(*) AS n FROM research_problems" }, { sql: "SELECT COUNT(*) AS n FROM research_track_papers" }]);
      assert.deepEqual(rows.map(r => r.results[0].n), [0, 1, 0]); // Only the explicitly confirmed fixture problem exists.
    });
    await t.test("same IDs cannot be read or written by another owner", async () => {
      cookie = "pi_anonymous_workspace=workbook-other-owner-0000001";
      await request(path, null, 404); await post({ action: "advance", workbookId: state.id }, 404);
      cookie = "pi_anonymous_workspace=workbook-fixture-owner-00001";
    });
    await t.test("graph question is carried into a separate comparison and survives independent review", async () => {
      const question = "Which assumptions differ for my selected Gaussian research task?";
      const graphDraft = (await post({action:"prepare",paperIds:workbookSources.map(s=>s.id),focusQuestion:question})).workbook;
      assert.notEqual(graphDraft.id,state.id);
      assert.equal(graphDraft.status,"verifying"); assert.equal(graphDraft.stale,false);
      const graphReady = await finishReview(graphDraft);
      assert.equal(graphReady.status,"ready"); assert.equal(graphReady.stale,false);
      const saved=await sql([{sql:"SELECT question FROM research_comparison_workbooks WHERE id=?",values:[graphReady.id]}]);
      assert.ok(saved[0].results[0].question.includes(question));
      assert.equal((await request(path+"&workbookId="+encodeURIComponent(graphReady.id))).workbook.stale,false);
      const selectedPath=path+"&selection=1&canonicalIds="+encodeURIComponent(workbookSources.map(s=>s.canonicalId).reverse().join(','))+"&focus="+encodeURIComponent(question);
      const callsBeforeRead=calls;
      assert.equal((await request(selectedPath)).workbook.id,graphReady.id);
      assert.equal((await request(selectedPath+"%20different")).workbook.id,null);
      assert.equal((await request(path+"&selection=1&canonicalIds=unavailable")).workbook.id,null);
      await request(path+"&workbookId=missing-version",null,404);
      assert.equal(calls,callsBeforeRead);
      // Keep following the original route comparison in subsequent withdrawal checks.
    });
    await t.test('truncated generation and rate-limited review retain identity, checkpoint and safe failure codes',async()=>{
      failureMode='truncated';
      let recovery=(await post({action:'prepare',paperIds:workbookSources.map(s=>s.id),focusQuestion:'A dedicated recovery task'})).workbook;
      assert.equal(recovery.status,'retryable');assert.equal(recovery.failure.code,'output_truncated');assert.equal(recovery.stage,'draft');assert.equal(recovery.content,null);
      const id=recovery.id,before=calls;
      recovery=(await post({action:'advance',workbookId:id})).workbook;assert.equal(calls,before,'cooldown must not call model');
      assert.equal((await request(path+'&workbookId='+encodeURIComponent(id))).workbook.failure.code,'output_truncated');
      await sql([{sql:'UPDATE research_comparison_workbooks SET retry_at=0 WHERE id=?',values:[id]}]);failureMode='';
      recovery=(await post({action:'advance',workbookId:id})).workbook;assert.equal(recovery.status,'verifying');assert.equal(recovery.id,id);
      recovery=(await post({action:'advance',workbookId:id})).workbook;
      assert.equal(recovery.reviewProgress.completed,WORKBOOK_REVIEW_BATCH_SIZE);
      failureMode='rate';recovery=(await post({action:'advance',workbookId:id})).workbook;
      assert.equal(recovery.failure.code,'rate_limited');assert.equal(recovery.stage,'review');assert.equal(recovery.content,null);
      assert.equal(recovery.reviewProgress.completed,WORKBOOK_REVIEW_BATCH_SIZE,'a failed batch preserves earlier reviewed fields');
      assert.doesNotMatch(JSON.stringify(recovery),/sensitive provider/);
      await sql([{sql:'UPDATE research_comparison_workbooks SET retry_at=0,lock_token=?,lease_until=1 WHERE id=?',values:['expired-owner',id]}]);failureMode='';
      const checkpoint=reviewFlags.length;recovery=await finishReview({...recovery,status:"verifying"});
      assert.equal(recovery.status,'ready');assert.equal(recovery.id,id);assert.equal(recovery.failure,null);assert.deepEqual(reviewFlags.slice(checkpoint),Array(reviewCalls-1).fill(true),'saved draft and completed review batches must not be generated again');
      const attempts=await sql([{sql:'SELECT stage,code,provider_status,finish_reason FROM research_workbook_attempts WHERE workbook_id=? ORDER BY rowid',values:[id]}]);
      assert.deepEqual(attempts[0].results.map(r=>[r.stage,r.code]),[['draft','output_truncated'],['review','rate_limited']]);
    });
    await t.test('a lost client can read an active checkpoint without launching duplicate model work',async()=>{
      let entered,release;const started=new Promise(resolve=>{entered=resolve});const hold=new Promise(resolve=>{release=resolve});
      beforeReply=async()=>{entered();await hold};
      const pending=post({action:'prepare',paperIds:workbookSources.map(s=>s.id),focusQuestion:'Concurrent checkpoint recovery'});
      try {
        await started;const checkpoint=(await request(path)).workbook;const count=calls;
        assert.equal(checkpoint.stage,'draft');assert.ok(checkpoint.busyUntil>Date.now());
        const duplicate=(await post({action:'advance',workbookId:checkpoint.id})).workbook;
        assert.equal(duplicate.id,checkpoint.id);assert.equal(calls,count);
      } finally {release();beforeReply=async()=>{}}
      assert.equal((await pending).workbook.status,'verifying');
    });
    await t.test('an evidence retry receives the exact safe validation failure without relaxing publication checks',async()=>{
      failureMode='invalid-evidence';
      const failed=(await post({action:'prepare',paperIds:workbookSources.map(s=>s.id),focusQuestion:'Evidence repair task'})).workbook;
      assert.equal(failed.failure.code,'invalid_evidence');assert.equal(failed.failure.detail,'unlocated_workbook_evidence');assert.equal(failed.content,null);
      await sql([{sql:'UPDATE research_comparison_workbooks SET retry_at=0 WHERE id=?',values:[failed.id]}]);failureMode='recover-evidence';
      const repaired=(await post({action:'advance',workbookId:failed.id})).workbook;assert.equal(repaired.status,'verifying');assert.equal(repaired.content,null);
      failureMode='';assert.equal((await finishReview(repaired)).status,'ready');
    });
    await t.test('invalid JSON is persisted as a safe diagnostic and the same graph resumes with protocol feedback',async()=>{
      failureMode='bad-json';
      let pilot=(await post({action:'prepare',paperIds:workbookSources.map(s=>s.id),focusQuestion:'Graph JSON recovery acceptance',allowRepair:true})).workbook;
      assert.equal(pilot.failure.code,'invalid_response');assert.equal(pilot.failure.detail,'invalid_json_response');assert.doesNotMatch(JSON.stringify(pilot),/private invalid output/);
      await sql([{sql:'UPDATE research_comparison_workbooks SET retry_at=0 WHERE id=?',values:[pilot.id]}]);failureMode='recover-json';
      const id=pilot.id;pilot=(await post({action:'advance',workbookId:id})).workbook;assert.equal(pilot.id,id);assert.equal(pilot.failure,null);assert.equal((await finishReview(pilot)).status,'ready');failureMode='';
    });
    await t.test('opt-in graph versions recover across a Worker restart and recheck every repaired field',async()=>{
      graphMode='repairable';graphCorrections=0;
      let pilot=(await post({action:'prepare',paperIds:workbookSources.map(s=>s.id),focusQuestion:'Graph persistence acceptance',allowRepair:true})).workbook;
      assert.equal(modelQuestions.at(-1),'Graph persistence acceptance');
      assert.match(pilot.id,/:revision-v8$/);assert.equal(pilot.revisionFlow.engine,'langgraph-v1');assert.equal(pilot.content,null);
      pilot=(await post({action:'advance',workbookId:pilot.id})).workbook;
      const count=calls,checkpoint=pilot.reviewProgress;
      await mf.dispose();mf=new Miniflare(options);
      const restored=(await request(path+'&workbookId='+encodeURIComponent(pilot.id))).workbook;
      assert.equal(calls,count);assert.deepEqual(restored.reviewProgress,checkpoint);assert.equal(restored.id,pilot.id);
      for(let i=0;i<10&&pilot.revisionFlow.next!=='repair';i++)pilot=(await post({action:'advance',workbookId:pilot.id})).workbook;
      assert.equal(pilot.revisionFlow.next,'repair');assert.equal(pilot.status,'verifying');assert.equal(pilot.reviewIssues[0].issueType,'repairable');
      const savedDraft=(await sql([{sql:'SELECT draft_json FROM research_comparison_workbooks WHERE id=?',values:[pilot.id]}]))[0].results[0].draft_json;
      failureMode='unauthorized-patch';pilot=(await post({action:'advance',workbookId:pilot.id})).workbook;
      assert.equal(pilot.failure.detail,'invalid_workbook_patch');assert.equal(pilot.revisionFlow.repairs,0);
      assert.equal((await sql([{sql:'SELECT draft_json FROM research_comparison_workbooks WHERE id=?',values:[pilot.id]}]))[0].results[0].draft_json,savedDraft);
      await sql([{sql:'UPDATE research_comparison_workbooks SET retry_at=0 WHERE id=?',values:[pilot.id]}]);
      failureMode='rate';pilot=(await post({action:'advance',workbookId:pilot.id})).workbook;
      assert.equal(pilot.status,'retryable');assert.equal(pilot.revisionFlow.repairs,0);assert.equal(pilot.revisionFlow.next,'repair');
      await sql([{sql:'UPDATE research_comparison_workbooks SET retry_at=0 WHERE id=?',values:[pilot.id]}]);failureMode='';
      failureMode='unauthorized-patch';pilot=(await post({action:'advance',workbookId:pilot.id})).workbook;
      assert.equal(pilot.failure.detail,'invalid_workbook_patch');assert.equal(pilot.revisionFlow.repairs,0);
      await sql([{sql:'UPDATE research_comparison_workbooks SET retry_at=0 WHERE id=?',values:[pilot.id]}]);failureMode='';
      pilot=(await post({action:'advance',workbookId:pilot.id})).workbook;
      assert.equal(pilot.revisionFlow.repairs,1);assert.equal(pilot.reviewProgress.completed,0);assert.equal(pilot.content,null);
      assert.equal(pilot.revisionFlow.revisedFields,1);assert.equal(pilot.revisionFlow.preservedFields,workbookReviewFields(workbookSample()).length-1);
      const corrected=JSON.parse((await sql([{sql:'SELECT draft_json FROM research_comparison_workbooks WHERE id=?',values:[pilot.id]}]))[0].results[0].draft_json);
      const {comparison:beforeComparison,...beforeApproved}=JSON.parse(savedDraft),{comparison:afterComparison,...afterApproved}=corrected;
      assert.deepEqual(afterApproved,beforeApproved);assert.notDeepEqual(afterComparison,beforeComparison);
      pilot=await finishReview(pilot);assert.equal(pilot.status,'ready');assert.equal(graphCorrections,1);
      assert.equal(pilot.reviewProgress.completed,workbookReviewFields(workbookSample()).length);
      const before=calls;await post({action:'advance',workbookId:pilot.id});assert.equal(calls,before);
      // An evidence withdrawal must remain readable and prevent further writes, including in a fresh isolate.
      await sql([{sql:'UPDATE paper_insights SET ever_recommended=0 WHERE paper_id=?',values:[workbookSources[0].id]}]);
      assert.equal((await request(path+'&workbookId='+encodeURIComponent(pilot.id))).workbook.stale,true);
      await post({action:'save-artifact',workbookId:pilot.id,sourceRevision:pilot.revision,baseRevision:0,value:{}},409);
      await sql([{sql:'UPDATE paper_insights SET ever_recommended=1 WHERE paper_id=?',values:[workbookSources[0].id]}]);
      graphMode='supported';
    });
    await t.test('an evidence-gap graph stops, exposes reasons, and preserves the baseline comparison',async()=>{
      graphMode='evidence_gap';graphCorrections=0;
      const baseline=state.id;
      let pilot=(await post({action:'prepare',paperIds:workbookSources.map(s=>s.id),focusQuestion:'Missing evidence acceptance',allowRepair:true})).workbook;
      pilot=await finishReview(pilot);assert.equal(pilot.status,'rejected');assert.equal(pilot.content,null);assert.equal(graphCorrections,0);
      assert.equal(pilot.reviewIssues[0].issueType,'evidence_gap');assert.equal(pilot.revisionFlow.next,'stopped');
      const before=calls;await post({action:'prepare',paperIds:workbookSources.map(s=>s.id),focusQuestion:'Missing evidence acceptance',allowRepair:true});assert.equal(calls,before);
      assert.equal((await request(path+'&workbookId='+encodeURIComponent(baseline))).workbook.status,'ready');
      graphMode='supported';
    });
    await t.test("source changes invalidate saved content and guard artifacts", async () => {
      await sql([{ sql: "UPDATE paper_insights SET abstract_text = abstract_text || ' Revised.' WHERE paper_id = ?", values: [workbookSources[0].id] }]);
      assert.equal((await request(path)).workbook.stale, true);
      await post({ action: "save-artifact", workbookId: state.id, sourceRevision: state.revision, baseRevision: 1, value: {} }, 409);
      state = (await post({ action: "prepare", paperIds: workbookSources.map(s => s.id) })).workbook;
      invalidReview = true;
      state = await finishReview(state);
      assert.equal(state.status, "rejected"); assert.equal(state.content, null);
      invalidReview = false;
    });
    await t.test("a changed source during generation cannot publish a current result", async () => {
      await sql([{ sql: "UPDATE paper_insights SET abstract_text = abstract_text || ' Next.' WHERE paper_id = ?", values: [workbookSources[0].id] }]);
      beforeReply = async () => { await sql([{ sql: "UPDATE paper_insights SET ever_recommended = 0 WHERE paper_id = ?", values: [workbookSources[0].id] }]); };
      state = (await post({ action: "prepare", paperIds: workbookSources.map(s => s.id) })).workbook;
      assert.equal(state.stale, true); assert.equal(state.content, null);
    });
  } finally { await mf.dispose(); assert.ok(resolve(persist).startsWith(resolve(tmpdir())+sep+'pi-workbook-graph-')); await rm(persist,{recursive:true,force:true}); }
});
