import test from 'node:test';
import assert from 'node:assert/strict';
import {glob,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';

test('onboarding and account recovery preserve all original records and isolate browser/account identities',{timeout:60000},async()=>{
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url)),modules=[];
 for await(const path of glob('**/*.js',{cwd:root}))modules.push({type:'ESModule',path:root+path});
 const mf=new Miniflare({cf:false,d1Databases:['DB'],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],modulesRoot:root,modules:[{type:'ESModule',path:root+'workspace-fixture.js',contents:`import app from './index.js';export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/fixture')return Response.json(await e.DB.batch((await r.json()).map(x=>e.DB.prepare(x.sql).bind(...(x.values||[])))));return app.fetch(r,e,c)}}`},...modules],outboundService:()=>{throw Error('Identity recovery must not invoke a model or source')}});
 const old='original-browser-workspace-12345',other='different-browser-workspace-67890';
 const browser=id=>`pi_anonymous_workspace=${id}`;
 const call=(path,body,cookie=browser(old),account='',extra={})=>mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{cookie,'Content-Type':'application/json',origin:'http://localhost',...(account?{'oai-authenticated-user-id':account,'oai-authenticated-user-email':account+'@example.test'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
 const sql=async(items)=>{const r=await call('/fixture',items);assert.equal(r.status,200,await r.clone().text());return r.json()};
 const insert=(table,value)=>({sql:`INSERT INTO ${table} (${Object.keys(value).join(',')}) VALUES (${Object.keys(value).map(()=>'?').join(',')})`,values:Object.values(value)});
 const cookies=r=>r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
 try{
  const empty=await call('/api/spaces');assert.deepEqual((await empty.json()).spaces,[]);
  const migration=await readFile(new URL('../drizzle/0071_workspace_accounts.sql',import.meta.url),'utf8');await sql(migration.split('--> statement-breakpoint').map(sql=>({sql})));
  const fresh=await call('/api/workspace-session',{action:'initialize',legacyWorkspaceId:old},'');assert.equal(fresh.status,200);assert.equal((await fresh.json()).spaceCount,0);assert.match(fresh.headers.get('set-cookie'),/HttpOnly/);assert.match(fresh.headers.get('set-cookie'),/SameSite=Strict/);
  assert.equal((await sql([{sql:'SELECT COUNT(*) n FROM research_spaces'}]))[0].results[0].n,0,'GET and initialize never seed sample spaces');
  const created=await call('/api/spaces',{name:'My source coding',description:'Finite blocklength assumptions'});assert.equal(created.status,201);const space=(await created.json()).space;
  await sql([insert('research_spaces',{id:'second',owner_user_id:'anonymous:'+old,name:'Original mathematics',member_name:'Original',description:'Original direction'}),insert('research_spaces',{id:'other',owner_user_id:'anonymous:'+other,name:'Other browser work',member_name:'Original'}),insert('monitored_papers',{id:'paper',space_id:space.id,canonical_id:'fixture:paper',title:'Original paper',authors:'Fixture',venue:'Fixture',url:'https://example.test/p',horizon:'years'}),insert('paper_reading_progress',{id:'note',space_id:space.id,paper_id:'paper',status:'reading',note:'Original personal note'}),insert('paper_feedback',{id:'feedback',space_id:space.id,paper_id:'paper',saved:1,feedback:'relevant'}),insert('research_tracks',{id:'track',space_id:space.id,title_zh:'原研究路线',title_en:'Original route'})]);
  const unchanged=(await sql([{sql:'SELECT * FROM research_spaces ORDER BY id'},{sql:'SELECT * FROM paper_reading_progress'},{sql:'SELECT * FROM monitored_papers'},{sql:'SELECT * FROM paper_feedback'},{sql:'SELECT * FROM research_tracks'}])).map(x=>x.results);
  assert.equal((await call('/api/workspace-session',{action:'connect'})).status,401);
  assert.equal((await call('/api/workspace-session',{action:'connect'},browser(old),'alice',{origin:'https://other.test'})).status,403);
  const connected=await call('/api/workspace-session',{action:'connect'},browser(old),'alice');assert.equal(connected.status,200);const accountCookies=cookies(connected);assert.match(accountCookies,/pi_workspace_account=alice/);assert.equal((await connected.json()).spaceCount,2);
  assert.equal((await call('/api/workspace-session',{action:'connect'},accountCookies,'alice')).status,200,'repeat connection is idempotent');
  assert.equal((await call('/api/workspace-session',{action:'connect'},browser(old),'bob')).status,409,'one browser workspace is not claimed by two accounts');
  const recovered=await call('/api/workspace-session',{action:'initialize',legacyWorkspaceId:'brand-new-browser-000000000000'},'','alice');const recoveredState=await recovered.json();assert.equal(recoveredState.mode,'account');assert.equal(recoveredState.spaceCount,2);assert.equal(JSON.stringify(recoveredState).includes(old),false,'no browser credential returned in JSON');
  const restoredCookies=cookies(recovered);const saved=await call('/api/spaces',null,restoredCookies,'alice');const savedBody=await saved.json();assert.equal(savedBody.spaces.length,2);assert.equal(savedBody.user.userId,undefined);
  const retained=await call('/api/workspace-session',{action:'initialize',legacyWorkspaceId:other},restoredCookies,'alice');assert.match(cookies(retained),new RegExp(old),'a stale local-storage identity cannot overwrite the recovered server cookie');
  assert.equal((await call('/api/spaces',null,restoredCookies)).status,401,'signed-out account cookie fails closed');assert.equal((await call('/api/spaces',null,restoredCookies,'bob')).status,401,'different signed-in account fails closed');
  const locked=await call('/api/workspace-session',{action:'initialize'},restoredCookies,'bob');assert.equal((await locked.json()).mode,'locked');assert.equal(locked.headers.get('set-cookie'),null,'locked access is not replaced with an empty identity');
  const conflict=await call('/api/workspace-session',{action:'initialize'},browser(other),'alice');const conflictState=await conflict.json();assert.equal(conflictState.mode,'browser');assert.equal(conflictState.differentWorkspace,true);assert.equal(conflictState.spaceCount,1);assert.match(cookies(conflict),new RegExp(other));
  assert.equal((await call('/api/workspace-session',{action:'connect'},browser(other),'alice')).status,409,'existing account connection is not overwritten');
  const switched=await call('/api/workspace-session',{action:'restore'},browser(other),'alice');assert.equal((await switched.json()).spaceCount,2);assert.match(cookies(switched),new RegExp(old));
  const switchCookies=cookies(switched);
  const returnOption=await call('/api/workspace-session',{action:'initialize',legacyWorkspaceId:other},switchCookies,'alice');assert.equal((await returnOption.json()).canReturnToBrowser,true);
  const returned=await call('/api/workspace-session',{action:'browser',legacyWorkspaceId:other},switchCookies,'alice');assert.equal(returned.status,200);assert.equal((await returned.json()).spaceCount,1);assert.match(returned.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await (await call('/api/spaces',null,cookies(returned),'alice')).json()).spaces[0].id,'other');
  assert.equal((await call('/api/workspace-session',{action:'browser',legacyWorkspaceId:old},browser(other),'bob')).status,401,'a return action cannot bypass another account connection');
  assert.equal((await call('/api/workspace-session',{action:'restore'},browser(other),'bob')).status,404);
  const secure=await mf.dispatchFetch('https://localhost/api/workspace-session',{method:'POST',headers:{cookie:accountCookies,'Content-Type':'application/json',origin:'https://localhost','oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test'},body:JSON.stringify({action:'initialize'})});assert.match(secure.headers.get('set-cookie'),/Secure/);
  const after=(await sql([{sql:'SELECT * FROM research_spaces ORDER BY id'},{sql:'SELECT * FROM paper_reading_progress'},{sql:'SELECT * FROM monitored_papers'},{sql:'SELECT * FROM paper_feedback'},{sql:'SELECT * FROM research_tracks'}])).map(x=>x.results);assert.deepEqual(after,unchanged,'all original IDs, owners, documents, notes, feedback and tracks remain unchanged');
 }finally{await mf.dispose()}
});
