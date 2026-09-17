import {ensureSchema,getApiUser,getDatabase} from '../../../db/repository';
import {routeReviewCurrentSql,routeReviewEligibleSql} from '../../../lib/research-maintenance-policy';
export async function GET(request:Request) {
  const user=getApiUser(request);if(!user)return Response.json({error:'Authentication required'},{status:401});
  const url=new URL(request.url),spaceId=url.searchParams.get('spaceId')||'',trackId=url.searchParams.get('trackId')||'';
  const db=getDatabase();await ensureSchema(db);
  if(!await db.prepare('SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?').bind(spaceId,user.userId).first())return Response.json({error:'Space not found'},{status:404});
  if(trackId&&!await db.prepare('SELECT id FROM research_tracks WHERE id=? AND space_id=?').bind(trackId,spaceId).first())return Response.json({error:'Route not found'},{status:404});
  const [state,monitor,graph,routes]=await Promise.all([
    db.prepare('SELECT status,lane,last_attempt_at AS lastAttemptAt,last_success_at AS lastSuccessAt,next_at AS nextAt,lease_until AS leaseUntil,result_json AS resultJson FROM research_maintenance WHERE space_id=?').bind(spaceId).first(),
    db.prepare("SELECT automation_paused_at AS pausedAt,CASE WHEN datetime(last_user_activity_at)>datetime('now','-7 days') THEN 1 ELSE 0 END AS active FROM monitor_runs WHERE space_id=?").bind(spaceId).first(),
    db.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN g.status IN ('ready','empty') THEN 1 ELSE 0 END) AS complete,
      SUM(CASE WHEN g.status='partial' THEN 1 ELSE 0 END) AS partial,SUM(CASE WHEN g.status IN ('error','missing_id') THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN g.paper_id IS NULL OR g.status='pending' THEN 1 ELSE 0 END) AS pending
      FROM monitored_papers p LEFT JOIN library_graph_checks g ON g.paper_id=p.id AND g.space_id=p.space_id WHERE p.space_id=?`).bind(spaceId).first(),
    db.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN rr.id IS NOT NULL AND (${routeReviewCurrentSql}) THEN 1 ELSE 0 END) AS checked,
      SUM(CASE WHEN (${routeReviewCurrentSql}) AND rr.relevance IN ('direct','partial') THEN 1 ELSE 0 END) AS related,
      SUM(CASE WHEN (${routeReviewCurrentSql}) AND rr.relevance='insufficient' THEN 1 ELSE 0 END) AS insufficient
      FROM research_tracks t JOIN monitored_papers p ON p.space_id=t.space_id LEFT JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id
      LEFT JOIN research_route_library_reviews rr ON rr.track_id=t.id AND rr.paper_id=p.id WHERE t.space_id=? AND (?='' OR t.id=?) AND ${routeReviewEligibleSql}`)
      .bind(spaceId,trackId,trackId).first(),
  ]);
  return Response.json({state,monitor,graph,routes},{headers:{'Cache-Control':'private, no-store'}});
}
