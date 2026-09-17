import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {catalogWhere} from '../lib/library-catalog.ts';

test('route catalog keeps grounded connections and selections, not lexical candidates',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE monitored_papers(id TEXT,space_id TEXT,canonical_id TEXT,title TEXT,authors TEXT);
      CREATE TABLE paper_insights(paper_id TEXT,abstract_text TEXT);
      CREATE TABLE research_route_library(paper_id TEXT,status TEXT);
      CREATE TABLE research_route_library_reviews(paper_id TEXT,relevance TEXT);
      CREATE TABLE research_track_papers(space_id TEXT,track_id TEXT,canonical_id TEXT,curation_status TEXT);
      CREATE TABLE paper_feedback(space_id TEXT,paper_id TEXT,feedback TEXT);`);
    for(const [id,relevance] of [['lexical',null],['direct','direct'],['method','partial'],['rejected','unrelated'],['pending','insufficient'],['chosen',null]]) {
      db.prepare('INSERT INTO monitored_papers VALUES(?,?,?,?,?)').run(id,'s',id,'Gaussian approximation and entropy','A');
      db.prepare('INSERT INTO paper_insights VALUES(?,?)').run(id,'Gaussian entropy');
      db.prepare('INSERT INTO research_route_library_reviews VALUES(?,?)').run(id,relevance);
    }
    db.exec("INSERT INTO research_route_library VALUES('chosen','included')");
    const query=all=>{const w=catalogWhere('s','',['gaussian','entropy'],'t',all);return db.prepare(`SELECT p.id FROM monitored_papers p LEFT JOIN paper_insights i ON i.paper_id=p.id LEFT JOIN research_route_library m ON m.paper_id=p.id LEFT JOIN research_route_library_reviews rr ON rr.paper_id=p.id WHERE ${w.sql} ORDER BY p.id`).all(...w.bindings).map(r=>r.id);};
    assert.deepEqual(query(false),['chosen','direct','method']);
    assert.equal(query(true).length,6,'explicit full-library exploration retains candidates');
    db.exec("INSERT INTO paper_feedback VALUES('s','method','not_relevant')");
    assert.deepEqual(query(false),['chosen','direct']);
  } finally { db.close(); }
});

test('a recovered abstract requeues only a missing-evidence rejection',()=>{
  const source=readFileSync(new URL('../lib/abstract-recovery.ts',import.meta.url),'utf8');
  const marker='Abstract evidence unavailable after bounded enrichment';
  const sql=source.match(/db\.prepare\(`(UPDATE paper_insights SET abstract_text=\?[\s\S]*?)`\)/)[1].replaceAll('${ABSTRACT_BLOCK_REASON}',marker);
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE paper_insights(paper_id TEXT,space_id TEXT,abstract_text TEXT,analysis_model TEXT,analysis_source TEXT,ever_recommended INTEGER,screening_reason TEXT,updated_at TEXT);
      CREATE TABLE paper_abstract_recovery(paper_id TEXT,lock_token TEXT);`);
    for(const [id,reason,ever] of [['unrelated','Outside the research direction',0],['missing',marker,0],['recommended',marker,1]]) {
      db.prepare('INSERT INTO paper_insights VALUES(?,?,?,?,?,?,?,NULL)').run(id,'s','short','model','deepseek_rejected',ever,reason);
      db.prepare('INSERT INTO paper_abstract_recovery VALUES(?,?)').run(id,'lease');
      db.prepare(sql).run('A recovered abstract with more detail',id,'s','A recovered abstract with more detail',id,'lease');
    }
    const row=id=>db.prepare('SELECT * FROM paper_insights WHERE paper_id=?').get(id);
    assert.equal(row('unrelated').analysis_source,'deepseek_rejected');
    assert.equal(row('unrelated').analysis_model,'model');
    assert.equal(row('missing').analysis_source,'deepseek_screened');
    assert.equal(row('missing').analysis_model,'');
    assert.equal(row('recommended').analysis_source,'deepseek_rejected');
    assert.equal(row('unrelated').abstract_text,'A recovered abstract with more detail');
  } finally { db.close(); }
});
