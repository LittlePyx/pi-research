import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {BACKGROUND_ROLE_UPDATE_SQL,groundedRouteRole} from '../lib/route-role-evidence.ts';
import {parsePublisherAbstract,publisherAbstractUrl} from '../lib/publisher-abstract.ts';
import {sanitizeResearchRoutePrecisionJudgments,routePrecisionAcceptedForActiveNode} from '../lib/research-map-precision.ts';

const abstract='This paper presents a survey of distances between Gaussian measures on Hilbert spaces, with applications to covariance estimation.';
test('role judgment requires an exact abstract quote and treats useful background separately',()=>{
  const roleEvidence={role:'background',quote:abstract,reason:'The survey supplies comparison tools but no Gaussian extremality theorem.'};
  assert.equal(groundedRouteRole(roleEvidence,abstract).role,'background');
  assert.equal(groundedRouteRole({...roleEvidence,quote:'A fabricated statement establishes the Gaussian extremality theorem.'},abstract),null);
  assert.equal(groundedRouteRole(roleEvidence,''),null);
  const raw={directionKey:'r',canonicalId:'p',verdict:'borderline',confidence:90,reasonZh:'综述提供比较工具，摘要不支持极值定理。',reasonEn:roleEvidence.reason,roleEvidence};
  const [checked]=sanitizeResearchRoutePrecisionJudgments([raw],new Set(['r:p']),new Map([['r:p',abstract]]));
  assert.equal(routePrecisionAcceptedForActiveNode(checked),true);
  const [missing]=sanitizeResearchRoutePrecisionJudgments([raw],new Set(['r:p']),new Map());
  assert.equal(routePrecisionAcceptedForActiveNode(missing),false);
});
test('publisher recovery checks exact DOI and reads only the public abstract section',()=>{
  const doi='10.1007/s41884-024-00134-3';
  const html=`<meta content="${doi}" name="citation_doi"><section data-title="Abstract"><h2>Abstract</h2><p>${abstract}</p></section><section>Unrelated full text must never enter the abstract.</section>`;
  assert.equal(parsePublisherAbstract(html,doi),abstract);
  assert.equal(parsePublisherAbstract(html,'10.1007/wrong'),'');
  assert.equal(parsePublisherAbstract(`<meta name="citation_doi" content="${doi}"><meta name="description" content="${abstract}">`,doi),'');
  assert.equal(publisherAbstractUrl('https://127.0.0.1/private'),null);
  assert.equal(publisherAbstractUrl('10.1007/../../private'),null);
});

test('background correction retains the paper and protects changed evidence, confirmed choices and paused spaces',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE research_track_papers(id,space_id,track_id,canonical_id,title,role,curation_status,rationale_zh,rationale_en,curation_updated_at);
 CREATE TABLE monitored_papers(id,space_id,canonical_id); CREATE TABLE paper_insights(paper_id,space_id,abstract_text);
 CREATE TABLE research_tracks(id,space_id,title_en,title_zh,monitoring_status); CREATE TABLE monitor_runs(space_id,automation_paused_at);
 CREATE TABLE research_map_evidence_proposals(paper_id,space_id,track_id,status);
 INSERT INTO research_tracks VALUES('r','s','Gaussian extremality','高斯极值性','active');
 INSERT INTO research_track_papers VALUES('tp','s','r','doi:p','Survey','foundation','active','','',NULL);
 INSERT INTO monitored_papers VALUES('p','s','doi:p'); INSERT INTO paper_insights VALUES('p','s','Original abstract');
 INSERT INTO monitor_runs VALUES('s',NULL);`);
 const update=(a='Original abstract',space='s')=>db.prepare(BACKGROUND_ROLE_UPDATE_SQL).run('方法背景','Method background','tp',space,'foundation',a,'Survey','Gaussian extremality','高斯极值性').changes;
 assert.equal(update('Stale abstract'),0); assert.equal(update(undefined,'other-space'),0);
 db.exec("UPDATE monitor_runs SET automation_paused_at='paused'");assert.equal(update(),0);
 db.exec("UPDATE monitor_runs SET automation_paused_at=NULL; INSERT INTO research_map_evidence_proposals VALUES('p','s','r','confirmed')");assert.equal(update(),0);
 db.exec("UPDATE research_map_evidence_proposals SET status='proposed'");assert.equal(update(),1);
 assert.equal(db.prepare('SELECT role,curation_status FROM research_track_papers').get().role,'background');
 assert.equal(db.prepare('SELECT count(*) AS n FROM monitored_papers').get().n,1);db.close();
});
