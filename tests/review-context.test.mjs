import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {prioritizedReviewTracks} from '../lib/review-context.ts';

test('A newly confirmed question route remains available to deep review after the first six routes',async()=>{
 const sql=new DatabaseSync(':memory:');
 try {
  sql.exec('CREATE TABLE research_tracks(id TEXT,space_id TEXT,title_zh TEXT,title_en TEXT,summary_en TEXT,search_queries TEXT,intelligence_json TEXT,intelligence_updated_at TEXT,position INTEGER)');
  const insert=sql.prepare("INSERT INTO research_tracks VALUES(?,?,'Title','Title','','[]','{}',NULL,?)");
  for(let i=0;i<9;i++)insert.run('old-'+i,'owned',i);
  insert.run('new-question','owned',9);insert.run('foreign','another',0);
  const database={prepare(query){return{bind(...args){return{all(){return{results:sql.prepare(query).all(...args)}}}}}}};
  const baseline=await prioritizedReviewTracks(database,'owned',[]);
  assert.equal(baseline.results.length,6);assert.equal(baseline.results.some(r=>r.id==='new-question'),false);
  const current=await prioritizedReviewTracks(database,'owned',['new-question','new-question','foreign']);
  assert.equal(current.results.length,6);assert.equal(current.results[0].id,'new-question');
  assert.equal(current.results.some(r=>r.id==='foreign'),false);
  const allActive=await prioritizedReviewTracks(database,'owned',['new-question','old-8','old-7','old-6','old-5','old-4']);
  assert.deepEqual(new Set(allActive.results.map(r=>r.id)),new Set(['new-question','old-8','old-7','old-6','old-5','old-4']));
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM research_tracks').get().n,11);
 } finally {sql.close()}
});
