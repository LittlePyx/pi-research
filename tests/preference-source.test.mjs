import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readPreferenceSignals} from '../lib/preference-memory.ts';

test('preference sources keep paper identity and remain scoped to active, unexpired signals',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 try {
  sqlite.exec("CREATE TABLE research_preference_signals(id TEXT,space_id TEXT,layer TEXT,kind TEXT,label_zh TEXT,label_en TEXT,evidence TEXT,confidence INTEGER,weight INTEGER,source_type TEXT,source_id TEXT,observed_at TEXT,expires_at TEXT,active INTEGER)");
  const insert=sqlite.prepare("INSERT INTO research_preference_signals VALUES(?,?,'explicit','method','方法','Method','Evidence',90,90,?,?,CURRENT_TIMESTAMP,?,?)");
  insert.run('feedback','a','paper_feedback','paper-one:method_fit',null,1);
  insert.run('note','a','reading_note','paper-two:hash:method:0',null,1);
  insert.run('scope','a','research_space','a',null,1);
  insert.run('foreign','b','paper_feedback','paper-three:method_fit',null,1);
  insert.run('disabled','a','paper_feedback','paper-four:method_fit',null,0);
  insert.run('expired','a','paper_feedback','paper-five:method_fit','2000-01-01',1);
  insert.run('legacy','a','paper_feedback','paper-six:weak_evidence',null,1);
  sqlite.exec("UPDATE research_preference_signals SET kind='exclusion',label_zh='排除：证据不足',label_en='Exclude: weak evidence' WHERE id='legacy'");
  const database={prepare(sql){return {bind(...args){return {async all(){return {results:sqlite.prepare(sql).all(...args)}}}}}}};
  const signals=await readPreferenceSignals(database,'a');
  assert.equal(signals.length,4);
  assert.equal(signals.find(s=>s.id==='legacy').kind,'quality');
  assert.equal(signals.find(s=>s.id==='legacy').reasonCode,'weak_evidence');
  assert.equal(signals.find(s=>s.id==='legacy').labelZh.startsWith('排除：'),false);
  assert.equal(sqlite.prepare("SELECT kind FROM research_preference_signals WHERE id='legacy'").get().kind,'exclusion');
  assert.equal(signals.find(s=>s.id==='feedback').sourcePaperId,'paper-one');
  assert.equal(signals.find(s=>s.id==='note').sourcePaperId,'paper-two');
  assert.equal(signals.find(s=>s.id==='scope').sourcePaperId,null);
 }finally{sqlite.close();}
});
