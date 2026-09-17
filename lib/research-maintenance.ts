import {groundedGraphRelevance,type GraphRelevance} from './graph-task';
import {routeReviewCurrentSql,routeReviewEligibleSql,routeReviewQuestion,routeMaintenanceLane} from './research-maintenance-policy';

export const MAINTENANCE_ELIGIBLE_SQL = `SELECT s.id,s.owner_user_id FROM research_spaces s JOIN monitor_runs r ON r.space_id=s.id
 WHERE s.owner_user_id LIKE 'anonymous:%' AND r.automation_paused_at IS NULL
 AND datetime(r.last_user_activity_at)>datetime('now','-7 days')
 AND EXISTS(SELECT 1 FROM monitored_papers p WHERE p.space_id=s.id)`;
type RoutePaper={id:string;canonicalId:string;title:string;abstractText:string;trackId:string;titleEn:string;titleZh:string};
export type MaintenanceReview=(input:{spaceId:string;workspaceId:string;question:string;canonicalIds:string[]})=>Promise<GraphRelevance[]>;
export type MaintenanceGraph=(input:{spaceId:string;workspaceId:string;paperId:string})=>Promise<{status:string;relations:number;updated?:boolean}>;

/** Runs outside page requests. One small batch per lease, spaces and lanes rotate. */
export async function runResearchMaintenance(database:D1Database,review?:MaintenanceReview,now=Date.now(),refreshGraph?:MaintenanceGraph,refreshRoles?:(input:{spaceId:string;workspaceId:string})=>Promise<void>) {
  await database.prepare(`INSERT OR IGNORE INTO research_maintenance(space_id) SELECT id FROM (${MAINTENANCE_ELIGIBLE_SQL})`).run();
  const due=await database.prepare(`SELECT m.space_id,m.attempts,m.result_json,e.owner_user_id FROM research_maintenance m
    JOIN (${MAINTENANCE_ELIGIBLE_SQL}) e ON e.id=m.space_id
    WHERE m.next_at<=? AND m.lease_until<=? ORDER BY m.last_attempt_at,m.space_id LIMIT 1`)
    .bind(now,now).first<{space_id:string;attempts:number;result_json:string;owner_user_id:string}>();
  if(!due)return {status:'idle'};
  const token=crypto.randomUUID(),lane=routeMaintenanceLane(due.attempts);
  const claim=await database.prepare(`UPDATE research_maintenance SET lock_token=?,lease_until=?,last_attempt_at=?,attempts=attempts+1,status='running',lane=?
    WHERE space_id=? AND next_at<=? AND lease_until<=?`).bind(token,now+180000,now,lane,due.space_id,now,now).run();
  if(!claim.meta.changes)return {status:'busy'};
  let status='idle';let graphProgress=false;let detail:Record<string,unknown>={};
  try{detail.routeCursor=JSON.parse(due.result_json).routeCursor||'';}catch{detail.routeCursor='';}
  try {
    if(lane==='graph') {
      const paper=await database.prepare(`SELECT p.id,p.canonical_id,p.doi,p.title FROM monitored_papers p
        LEFT JOIN library_graph_checks g ON g.paper_id=p.id AND g.space_id=p.space_id
        LEFT JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id
        WHERE p.space_id=? AND COALESCE(g.auto_next_at,0)<=? AND COALESCE(g.retry_at,0)<=? AND COALESCE(g.lease_until,0)<=?
        AND NOT EXISTS(SELECT 1 FROM paper_feedback f WHERE f.space_id=p.space_id AND f.paper_id=p.id AND f.feedback='not_relevant')
        ORDER BY COALESCE(g.auto_next_at,0),EXISTS(SELECT 1 FROM research_track_papers tp WHERE tp.space_id=p.space_id AND tp.canonical_id=p.canonical_id AND tp.curation_status='active') DESC,
        COALESCE(i.ever_recommended,0) DESC,p.discovered_at,p.id LIMIT 1`).bind(due.space_id,now,now,now)
        .first<{id:string;canonical_id:string;doi:string|null;title:string}>();
      if(paper&&refreshGraph){const result=await refreshGraph({spaceId:due.space_id,workspaceId:due.owner_user_id.slice('anonymous:'.length),paperId:paper.id});status=result.status;graphProgress=result.updated===true;detail={...detail,paperId:paper.id,title:paper.title,relations:result.relations||0};}
      else if(paper)status='unconfigured';
    } else if(!review) {status='unconfigured';}
    else if(refreshRoles && due.attempts % 4 === 1) {
      await refreshRoles({spaceId:due.space_id,workspaceId:due.owner_user_id.slice('anonymous:'.length)});
      status='reviewed';
    } else {
      // Read the entire library over successive batches, not just title keyword hits.
      const query=`FROM research_tracks t JOIN monitored_papers p ON p.space_id=t.space_id
        LEFT JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id
        LEFT JOIN research_route_library_reviews rr ON rr.track_id=t.id AND rr.paper_id=p.id
        WHERE t.space_id=? AND ${routeReviewEligibleSql}
        AND (rr.id IS NULL OR NOT (${routeReviewCurrentSql}) OR (rr.relevance='insufficient' AND rr.retry_at<=?))`;
      const first=await database.prepare(`SELECT t.id AS trackId ${query} ORDER BY CASE WHEN t.id>? THEN 0 ELSE 1 END,t.id,COALESCE(rr.checked_at,0),p.discovered_at,p.id LIMIT 1`)
        .bind(due.space_id,now,String(detail.routeCursor)).first<{trackId:string}>();
      if(first){
        detail={routeCursor:first.trackId,trackId:first.trackId};
        const rows=await database.prepare(`SELECT p.id,p.canonical_id AS canonicalId,p.title,substr(COALESCE(i.abstract_text,''),1,5000) AS abstractText,t.id AS trackId,t.title_en AS titleEn,t.title_zh AS titleZh ${query} AND t.id=?
          ORDER BY COALESCE(rr.checked_at,0),COALESCE(i.ever_recommended,0) DESC,p.discovered_at,p.id LIMIT 4`).bind(due.space_id,now,first.trackId).all<RoutePaper>();
        const papers=rows.results,eligible=papers.filter(p=>p.abstractText.length>=120);
        const reviewed=eligible.length?await review({spaceId:due.space_id,workspaceId:due.owner_user_id.slice('anonymous:'.length),question:routeReviewQuestion(papers[0].titleEn,papers[0].titleZh),canonicalIds:eligible.map(p=>p.canonicalId)}):[];
        const checked=groundedGraphRelevance(reviewed,papers);let saved=0,related=0;
        for(const paper of papers) {
          const assessment=checked.find(a=>a.canonicalId===paper.canonicalId)!;
          // Re-check exact source and user exclusions inside the atomic write. A stale worker cannot publish.
          const write=await database.prepare(`INSERT INTO research_route_library_reviews(id,space_id,track_id,paper_id,paper_title,abstract_text,route_title,relevance,assessment_json,retry_at,checked_at)
            SELECT ?,p.space_id,t.id,p.id,p.title,substr(COALESCE(i.abstract_text,''),1,5000),t.title_en || char(10) || t.title_zh,?,?,?,?
            FROM monitored_papers p JOIN research_tracks t ON t.space_id=p.space_id LEFT JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id
            WHERE p.id=? AND p.space_id=? AND t.id=? AND p.title=? AND substr(COALESCE(i.abstract_text,''),1,5000)=? AND t.title_en=? AND t.title_zh=? AND p.canonical_id=?
            AND ${routeReviewEligibleSql} AND EXISTS(SELECT 1 FROM research_maintenance m WHERE m.space_id=p.space_id AND m.lock_token=? AND m.lease_until>?)
            AND EXISTS(SELECT 1 FROM monitor_runs run WHERE run.space_id=p.space_id AND run.automation_paused_at IS NULL)
            ON CONFLICT(track_id,paper_id) DO UPDATE SET paper_title=excluded.paper_title,abstract_text=excluded.abstract_text,route_title=excluded.route_title,relevance=excluded.relevance,assessment_json=excluded.assessment_json,retry_at=excluded.retry_at,checked_at=excluded.checked_at`)
            .bind(crypto.randomUUID(),assessment.relevance,JSON.stringify(assessment),now+86400000,now,paper.id,due.space_id,paper.trackId,paper.title,paper.abstractText,paper.titleEn,paper.titleZh,paper.canonicalId,token,Date.now()).run();
          if(write.meta.changes){saved++;if(['direct','partial'].includes(assessment.relevance))related++;}
        }
        status=saved?'reviewed':'stale';detail={...detail,title:papers[0].titleZh||papers[0].titleEn,reviewed:saved,related};
      }
    }
  }catch{status='retryable';}
  const succeeded=graphProgress||status==='reviewed';
  const finish=await database.prepare(`UPDATE research_maintenance SET status=?,result_json=?,last_success_at=CASE WHEN ? THEN ? ELSE last_success_at END,
    next_at=?,lease_until=0,lock_token=NULL WHERE space_id=? AND lock_token=?`)
    .bind(status,JSON.stringify(detail),succeeded?1:0,now,now+(status==='retryable'?1800000:600000),due.space_id,token).run();
  return {status:finish.meta.changes?status:'stale',spaceId:due.space_id,lane,...detail};
}
