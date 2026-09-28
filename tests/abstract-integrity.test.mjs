import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import ts from 'typescript';
import { Miniflare } from 'miniflare';

async function loadModule(path) {
  const result = await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const integrity = await loadModule('lib/abstract-integrity.ts');
const {abstractEvidenceUnits} = await loadModule('lib/evidence-verification.ts');
async function loadFunction(path,name,deps) {
  const source = await readFile(path,'utf8');
  const ast = ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  const fn = ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(fn);
  const code=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText.replace(/^export /gm,'');
  return new Function('exports',...Object.keys(deps),`${code};return ${name}`)({},...Object.values(deps));
}
test('long discovery abstracts retain the closing scope statement',async()=>{
  const full='A source coding abstract. '.repeat(110)+'The final setting includes sources with memory.';
  const fetcher=await loadFunction('app/api/monitor/route.ts','fetchCrossrefAbstracts',{
    cleanText:s=>s.trim(),fetchExternalSource:async()=>Response.json({message:{DOI:'10.0000/a',abstract:full}}),
  });
  assert.equal((await fetcher({},[{doi:'10.0000/a',canonicalId:'a'}])).get('a'),full);
  const units=abstractEvidenceUnits(full,{prefix:'a',complete:true});
  assert.equal(units.map(x=>x.text).join(' '),full);
  assert.ok(units.at(-1).text.endsWith('sources with memory.'));
  assert.equal(integrity.needsAbstractRecovery(full),false);
  assert.equal(integrity.needsAbstractRecovery(full.slice(0,2200)),true);
});
test('complete audit spans include a tail after many short sentences and a long sentence',()=>{
  for(const full of ['Fact. '.repeat(300)+'Tail condition.', 'abcdefghij '.repeat(900)+'Tail condition.']) {
    const units=abstractEvidenceUnits(full,{complete:true});
    assert.equal(units.map(x=>x.text).join(' '),full);
    assert.ok(units.every(x=>x.text.length<=900));
  }
});
test('legacy recovery is bounded, preserves review and notes, and retains longer evidence',async()=>{
  const mf=new Miniflare({host:'127.0.0.1',cf:false,modules:true,d1Databases:['DB'],script:'export default {fetch(){return new Response("QA")}}'});
  try {
    const db=await mf.getD1Database('DB');
    await db.batch([
      db.prepare('CREATE TABLE monitored_papers(id TEXT,space_id TEXT,doi TEXT,title TEXT,authors TEXT,url TEXT)'),
      db.prepare("CREATE TABLE paper_insights(paper_id TEXT,space_id TEXT,abstract_text TEXT,analysis_model TEXT,analysis_source TEXT,ever_recommended INTEGER,screening_reason TEXT,updated_at TEXT,notes TEXT)"),
      db.prepare("CREATE TABLE paper_abstract_recovery(paper_id TEXT PRIMARY KEY,space_id TEXT,status TEXT,source_url TEXT,retry_at INTEGER DEFAULT 0,attempted_json TEXT,result_json TEXT,lock_token TEXT,lease_until INTEGER DEFAULT 0,updated_at TEXT)"),
    ]);
    const old='a'.repeat(2200),full=old+' A verified closing statement.';
    await db.prepare("INSERT INTO monitored_papers VALUES ('p','s','10.0000/a','Title','Author','https://example.org')").run();
    await db.prepare("INSERT INTO paper_insights VALUES ('p','s',?,'existing-model','deepseek',1,'saved review','','User note')").bind(old).run();
    let calls=0;
    const recover=await loadFunction('lib/abstract-recovery.ts','recoverPaperAbstract',{
      ...integrity,ABSTRACT_BLOCK_REASON:'Abstract evidence unavailable after bounded enrichment',
      readAbstractRecovery:async(db,s,p)=>db.prepare('SELECT * FROM paper_abstract_recovery WHERE paper_id=? AND space_id=?').bind(p,s).first(),
      lookupAbstract:async()=>{calls++;return {hit:{abstractText:full,sourceUrl:'https://example.org'},diagnostics:[],retryMs:0,related:null,failed:false}},
      fetchExternalSource:()=>{throw Error('No network in fixture')},
    });
    const result=await recover(db,'s','p');
    assert.equal(result.status,'found');
    assert.match(result.attempted_json,/legacy_truncated/);
    const row=await db.prepare('SELECT * FROM paper_insights').first();
    assert.equal(row.abstract_text,full);
    assert.equal(row.analysis_model,'existing-model');assert.equal(row.analysis_source,'deepseek');
    assert.equal(row.notes,'User note');assert.equal(row.screening_reason,'saved review');
    await recover(db,'s','p');assert.equal(calls,1,'complete evidence does not trigger repeated lookups');
    await db.prepare('UPDATE paper_insights SET abstract_text=?').bind(old).run();
    await db.prepare('UPDATE paper_abstract_recovery SET retry_at=?').bind(Date.now()+60000).run();
    await recover(db,'s','p');assert.equal(calls,1,'cooldown remains authoritative');
  } finally {await mf.dispose()}
});

test('verification uses the full current abstract even when old claim snippets exist',async()=>{
 const full='A source coding abstract. '.repeat(110)+'Tail scope: sources with memory.';
 const evidence=await loadFunction('app/api/monitor/route.ts','recommendationVerificationEvidence',{cleanText:s=>s.trim(),abstractEvidenceUnits});
 const database={prepare:()=>({bind:()=>({all:async()=>({results:[{id:'old',evidence_quote:'An earlier narrow excerpt without the closing scope statement.'}]})})})};
 const result=await evidence(database,'s',{canonicalId:'a',abstractText:full});
 assert.equal(result.source,'abstract');
 assert.equal(result.units.map(x=>x.text).join(' '),full);
});
