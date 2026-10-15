import assert from 'node:assert/strict';
import {glob} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {Miniflare} from 'miniflare';
import {workspaceHash,readWorkspaceLocation} from '../lib/workspace-navigation.ts';
import {storedWorkbookQuestion} from '../lib/graph-task.ts';

test('Today resumes only owned comparisons, preserves pinned versions and safely falls back when a bookmark disappears', {timeout:60000},async()=>{
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];
 for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
 const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,
  modules:[{type:'ESModule',path:root+'continuation-fixture.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules]});
 const owner='continuation-fixture-owner-001';
 const request=async(params={},status=200,who=owner)=>{const response=await mf.dispatchFetch('http://localhost/api/workspace-continuation?'+new URLSearchParams({spaceId:'s',...params}),{headers:who?{cookie:`pi_anonymous_workspace=${who}`}:{}});assert.equal(response.status,status,await response.clone().text());if(status===200)assert.match(response.headers.get('Cache-Control'),/no-store/);return response.json()};
 const sql=async statements=>{const r=await mf.dispatchFetch('http://localhost/fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(statements)});assert.equal(r.status,200,await r.clone().text());return r.json()};
 const insert=(table,v)=>({sql:`INSERT INTO ${table} (${Object.keys(v).join(',')}) VALUES (${Object.keys(v).map(()=>'?').join(',')})`,values:Object.values(v)});
 try {
  await request({},401,'');await request({},404);
  await sql([insert('research_spaces',{id:'s',owner_user_id:'anonymous:'+owner,name:'Fixture',member_name:'Fixture'}),insert('research_spaces',{id:'other',owner_user_id:'anonymous:'+owner,name:'Other',member_name:'Fixture'})]);
  assert.equal((await request()).continuation,null);
  await sql([insert('research_tracks',{id:'r',space_id:'s',title_zh:'中文方向',title_en:'Research route',summary_zh:'Fixture',summary_en:'Fixture',search_queries:'[]'}),insert('monitored_papers',{id:'p',space_id:'s',canonical_id:'doi:10.9999/fixture',title:'Source',authors:'Fixture',venue:'Fixture',url:'https://example.org/fixture',horizon:'years',discovered_at:'2026-10-01'})]);
  const base={space_id:'s',track_id:'r',question:storedWorkbookQuestion('Base question','Compare the two assumptions'),source_revision:'rev',source_ids_json:'["p","q"]',policy:'fixture'};
  await sql([insert('research_comparison_workbooks',{...base,id:'v1',status:'ready',updated_at:'2026-10-01'}),insert('research_comparison_workbooks',{...base,id:'v2',status:'retryable',updated_at:'2026-10-02'}),insert('research_comparison_artifacts',{id:'a',workbook_id:'v1',space_id:'s',revision:3,value_json:'{}',created_at:'2026-10-01'})]);
  assert.equal((await request()).continuation.status,'retryable');
  const workbook=workspaceHash({view:'workbook',space:'s',id:'r',workbookId:'v1',workbookPanel:'relations',workbookFocus:'assumptions:p',from:'library',returnTo:'#library?space=s&q=erasure'});
  const paper=workspaceHash({view:'paper-detail',space:'s',id:'p',track:'r',from:'workbook',paperPanel:'notes',readingFocus:'Check assumptions',returnTo:workbook});
  const pinned=(await request({location:paper})).continuation;
  assert.deepEqual(readWorkspaceLocation(pinned.hash),readWorkspaceLocation(paper));assert.equal(pinned.savedRevision,3);assert.equal(pinned.titleZh,'Compare the two assumptions');assert.equal(pinned.sourceCount,2);
  await request({},404,'continuation-other-owner-002');
  assert.equal((await request({spaceId:'other',location:paper})).continuation,null);
  const invalidPaper=workspaceHash({...readWorkspaceLocation(paper),id:'unrelated'});
  assert.equal((await request({location:invalidPaper})).continuation.hash,workspaceHash(readWorkspaceLocation(workbook)));
  await sql([{sql:"DELETE FROM monitored_papers WHERE id='p'"}]);
  assert.equal((await request({location:paper})).continuation.hash,workspaceHash(readWorkspaceLocation(workbook)),'deleted paper returns to its exact comparison');
  await sql([{sql:"DELETE FROM research_comparison_workbooks WHERE id='v1'"}]);
  const fallback=(await request({location:workbook})).continuation;
  assert.equal(readWorkspaceLocation(fallback.hash).workbookId,'v2');assert.equal(readWorkspaceLocation(fallback.hash).from,'today');assert.match(readWorkspaceLocation(fallback.hash).returnTo,/#today/);
  await sql([{sql:"CREATE TABLE IF NOT EXISTS research_space_deletions (space_id TEXT PRIMARY KEY,deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"},insert('research_space_deletions',{space_id:'s'})]);await request({},410);
  const counts=await sql([{sql:'SELECT COUNT(*) n FROM research_comparison_workbooks'},{sql:'SELECT COUNT(*) n FROM research_workbook_attempts'}]);
  assert.deepEqual(counts.map(r=>r.results[0].n),[1,0],'reading Today never advances or regenerates a task');
 } finally {await mf.dispose();}
});
