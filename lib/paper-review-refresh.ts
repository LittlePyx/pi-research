import { isPossiblyTruncatedAbstract } from './abstract-integrity';

export const reviewRefreshSchema = `CREATE TABLE IF NOT EXISTS paper_review_refresh (
  paper_id TEXT NOT NULL, space_id TEXT NOT NULL, revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', source_json TEXT NOT NULL DEFAULT '{}',
  draft_json TEXT NOT NULL DEFAULT '', result_json TEXT NOT NULL DEFAULT '',
  lock_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(space_id,paper_id,revision))`;

export const reviewTextFields = ['summary','why_read','problem','method','contribution','limitations','reading_focus','research_problem_impact','research_decision'];
const fields = [...reviewTextFields.flatMap(f=>[f+'_zh',f+'_en']), 'research_questions_zh','research_questions_en','verification_json','verification_status','verification_coverage_score'];
type Insight = Record<string,string|number> & {abstract_text:string};
export type RefreshState = {status:string;retry_at:number;attempts:number;lease_until:number;revision:string;draft_json:string;source_json:string;result_json:string};
export async function evidenceRevision(text:string) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text.trim().replace(/\s+/g,' ')));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function insight(db:D1Database,spaceId:string,paperId:string) {
  return db.prepare(`SELECT abstract_text,${fields.join(',')},analysis_source,llm_recommended FROM paper_insights WHERE space_id=? AND paper_id=?`).bind(spaceId,paperId).first<Insight>();
}
export async function readReviewRefresh(db:D1Database,spaceId:string,paperId:string) {
  const paper=await insight(db,spaceId,paperId);
  if(!paper)return {eligible:false,status:'unavailable',retryAt:0};
  const revision=await evidenceRevision(paper.abstract_text);
  const row=await db.prepare('SELECT * FROM paper_review_refresh WHERE space_id=? AND paper_id=? AND revision=?').bind(spaceId,paperId,revision).first<RefreshState>();
  return {eligible:paper.analysis_source==='deepseek'&&!!paper.llm_recommended&&paper.abstract_text.length>=120&&!isPossiblyTruncatedAbstract(paper.abstract_text),status:row?.status||'pending',retryAt:row?.retry_at||0,busy:!!row&&row.lease_until>Date.now(),attempts:row?.attempts||0,revision};
}
export type Audited = {recommended:boolean;verificationStatus:string;verificationCoverageScore:number;verificationRetryable:boolean;verificationReport:Record<string,unknown>} & Record<string,unknown>;
export async function advanceReviewRefresh(db:D1Database,spaceId:string,paperId:string,audit:(draft?:Audited)=>Promise<Audited>) {
  const paper=await insight(db,spaceId,paperId);
  const state=await readReviewRefresh(db,spaceId,paperId);
  if(!paper||!state.eligible)throw Error('unavailable');
  if(state.status==='ready')return state;
  const revision=state.revision!;
  const snapshot=Object.fromEntries(fields.map(f=>[f,paper[f]]));
  await db.prepare(`INSERT OR IGNORE INTO paper_review_refresh(paper_id,space_id,revision,source_json) VALUES (?,?,?,?)`).bind(paperId,spaceId,revision,JSON.stringify(snapshot)).run();
  const token=crypto.randomUUID(),now=Date.now();
  const lock=await db.prepare(`UPDATE paper_review_refresh SET lock_token=?,lease_until=?,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP
    WHERE space_id=? AND paper_id=? AND revision=? AND status!='ready' AND lease_until<=? AND retry_at<=? AND attempts<4`)
    .bind(token,now+90000,spaceId,paperId,revision,now,now).run();
  if(!lock.meta.changes)return readReviewRefresh(db,spaceId,paperId);
  const row=(await db.prepare('SELECT * FROM paper_review_refresh WHERE space_id=? AND paper_id=? AND revision=?').bind(spaceId,paperId,revision).first<RefreshState>())!;
  try {
    if(row.source_json!==JSON.stringify(snapshot))throw Error('source_changed');
    // Save successful paid stages before any publication. A retry after a failed
    // write uses the checkpoint rather than calling the model again.
    const result:Audited=row.result_json?JSON.parse(row.result_json):await audit(row.draft_json?JSON.parse(row.draft_json):undefined);
    if(result.verificationRetryable && result.verificationReport.correctionRequested===true) {
      await db.prepare(`UPDATE paper_review_refresh SET draft_json=?,status='correction',lock_token=NULL,lease_until=0,retry_at=0 WHERE space_id=? AND paper_id=? AND revision=? AND lock_token=?`)
        .bind(JSON.stringify(result),spaceId,paperId,revision,token).run();
      return readReviewRefresh(db,spaceId,paperId);
    }
    if(!result.recommended||!['verified','revised'].includes(result.verificationStatus))throw Error('verification_failed');
    await db.prepare('UPDATE paper_review_refresh SET result_json=? WHERE space_id=? AND paper_id=? AND revision=? AND lock_token=?').bind(JSON.stringify(result),spaceId,paperId,revision,token).run();
    const values=fields.map(f=>{
      if(f==='verification_json')return JSON.stringify({...result.verificationReport,evidenceRevision:revision});
      if(f==='verification_status')return result.verificationStatus;
      if(f==='verification_coverage_score')return result.verificationCoverageScore;
      const key=f.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase());
      const value=result[key];
      if(f.startsWith('research_questions')) {if(!Array.isArray(value))throw Error('invalid_result');return JSON.stringify(value)}
      if(typeof value!=='string')throw Error('invalid_result');
      return value;
    });
    // Compare all old review fields AND the exact abstract in the write itself.
    // Notes, feedback, reading state, scores and recommendation history are not written.
    const update=db.prepare(`UPDATE paper_insights SET ${fields.map(f=>f+'=?').join(',')},updated_at=CURRENT_TIMESTAMP
      WHERE space_id=? AND paper_id=? AND abstract_text=? AND analysis_source=? AND llm_recommended=? AND ${fields.map(f=>f+' IS ?').join(' AND ')}
      AND EXISTS(SELECT 1 FROM paper_review_refresh WHERE space_id=? AND paper_id=? AND revision=? AND lock_token=? AND lease_until>?)`)
      .bind(...values,spaceId,paperId,paper.abstract_text,paper.analysis_source,paper.llm_recommended,...fields.map(f=>snapshot[f]),spaceId,paperId,revision,token,Date.now());
    const results=await db.batch([update,db.prepare(`UPDATE paper_review_refresh SET status=CASE WHEN changes()>0 THEN 'ready' ELSE 'conflict' END,lock_token=NULL,lease_until=0,updated_at=CURRENT_TIMESTAMP WHERE space_id=? AND paper_id=? AND revision=? AND lock_token=?`).bind(spaceId,paperId,revision,token)]);
    if(!results[0].meta.changes)throw Error('source_changed');
    return readReviewRefresh(db,spaceId,paperId);
  } catch(error) {
    await db.prepare(`UPDATE paper_review_refresh SET status='failed',lock_token=NULL,lease_until=0,retry_at=?,updated_at=CURRENT_TIMESTAMP WHERE space_id=? AND paper_id=? AND revision=? AND lock_token=?`)
      .bind(Date.now()+60000,spaceId,paperId,revision,token).run();
    throw error;
  }
}
