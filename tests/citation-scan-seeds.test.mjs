import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {CITATION_SCAN_SEEDS_SQL,citationDiscoveryDescription} from '../lib/citation-scan-seeds.ts';
test('one-hop roots include explicit interest and active routes, with isolated balanced deduplicated seeds',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec(`CREATE TABLE research_tracks(id TEXT,space_id TEXT,monitoring_status TEXT);
   CREATE TABLE research_track_papers(canonical_id TEXT,doi TEXT,url TEXT,title TEXT,track_id TEXT,citation_count INTEGER,space_id TEXT,curation_status TEXT);
   CREATE TABLE monitored_papers(id TEXT,canonical_id TEXT,doi TEXT,url TEXT,title TEXT,citation_count INTEGER,space_id TEXT);
   CREATE TABLE paper_feedback(paper_id TEXT,space_id TEXT,feedback TEXT);
   CREATE TABLE paper_reading_progress(paper_id TEXT,space_id TEXT,status TEXT);
   INSERT INTO research_tracks VALUES('route','mine','active'),('paused','mine','paused');`);
  for(let n=0;n<12;n++) db.prepare('INSERT INTO research_track_papers VALUES(?,?,?,?,?,?,?,?)').run(`doi:r${n}`,`r${n}`,'',`Route ${n}`,'route',100-n,'mine','active');
  for(const [id,space] of [['reading','mine'],['liked','mine'],['other','theirs'],['ignored','mine'],['ordinary','mine']]) {
   db.prepare('INSERT INTO monitored_papers VALUES(?,?,?,?,?,?,?)').run(id,`doi:${id}`,id,'',id,0,space);
  }
  db.exec(`INSERT INTO paper_reading_progress VALUES('reading','mine','reading'),('ignored','mine','reading');
   INSERT INTO paper_feedback VALUES('liked','mine','relevant'),('other','theirs','relevant'),('ignored','mine','not_relevant');
   INSERT INTO research_track_papers VALUES('doi:liked','liked','','liked','route',0,'mine','deactivated');
   INSERT INTO research_track_papers VALUES('doi:paused','paused','','paused','paused',1000,'mine','active');`);
  const rows=db.prepare(CITATION_SCAN_SEEDS_SQL).all('mine','mine','mine');
  assert.equal(rows.length,10);
  assert.ok(rows.some(p=>p.canonical_id==='doi:reading'));
  assert.ok(rows.some(p=>p.canonical_id==='doi:liked'));
  assert.equal(new Set(rows.map(p=>p.canonical_id)).size,rows.length);
  assert.ok(!rows.some(p=>['doi:other','doi:ignored','doi:ordinary','doi:paused'].includes(p.canonical_id)));
 } finally {db.close();}
});
test('citation explanations retain direction and never invent origins for old records',()=>{
 assert.match(citationDiscoveryDescription(JSON.stringify({seedTitle:'Seed',relation:'references'})).en,/Referenced by/);
 assert.match(citationDiscoveryDescription(JSON.stringify({seedTitle:'Seed',relation:'citations'})).en,/Cites/);
 assert.equal(citationDiscoveryDescription('DOI:old-record'),null);
});
