import { ensureSchema, getApiUser, getDatabase } from '../../../db/repository';
import { parseProblemQueries, problemSourceKey } from '../../../lib/problem-query-plan';

export async function GET(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({error:'Unauthorized'},{status:401});
  const url = new URL(request.url), spaceId = url.searchParams.get('spaceId') || '', problemId = url.searchParams.get('problemId') || '';
  const db = getDatabase(); await ensureSchema(db);
  const problem = await db.prepare(`SELECT p.id,p.track_id FROM research_problems p
    JOIN research_spaces s ON s.id=p.space_id WHERE p.id=? AND p.space_id=? AND s.owner_user_id=?`)
    .bind(problemId,spaceId,user.userId).first<{id:string;track_id:string}>();
  if (!problem) return Response.json({error:'Problem not found'},{status:404});
  const job = await db.prepare(`SELECT id,status,started_at,completed_at,work_queue_json FROM monitor_scan_jobs
    WHERE space_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1`).bind(spaceId)
    .first<{id:string;status:string;started_at:string;completed_at:string|null;work_queue_json:string}>();
  let work: Record<string,unknown> = {};
  try { work = JSON.parse(job?.work_queue_json || '{}'); } catch { /* Old tasks may not contain a saved plan. */ }
  const plan = work.frozenQueryPlan as {problemQueries?:unknown}|undefined;
  const queries = parseProblemQueries(plan?.problemQueries,problem);
  if (!job || !queries) return Response.json({job:null,branches:[],papers:[]},{headers:{'Cache-Control':'private, no-store'}});
  const keys = ['days','months','years'].map(h=>problemSourceKey(problemId,h));
  const branches = (await db.prepare(`SELECT horizon,query_text AS query,attempt_count AS attempts,
    candidate_count AS candidates,last_scanned_at AS lastScannedAt,last_error AS error
    FROM monitor_discovery_coverage WHERE space_id=? AND source_key IN (?,?,?)
    AND query_text IN (?,?,?) ORDER BY last_scanned_at DESC LIMIT 3`)
    .bind(spaceId,...keys,queries.days,queries.months,queries.years).all()).results;
  // Source appearances are cumulative. Only audit events with this exact job ID
  // describe this run; absence is not a rejection and is labelled explicitly.
  const papers = (await db.prepare(`SELECT DISTINCT p.id,p.title,c.query_text AS query,
    a.decision,a.screening_reason AS reason,a.verification_status AS verification,
    a.recommended,cs.first_seen_at AS firstSeenAt,cs.last_seen_at AS lastSeenAt
    FROM monitor_candidate_sources cs JOIN monitored_papers p ON p.id=cs.paper_id AND p.space_id=cs.space_id
    JOIN monitor_discovery_coverage c ON c.space_id=cs.space_id AND c.source_key=cs.source_key AND c.query_key=cs.query_key
    LEFT JOIN recommendation_audit_events a ON a.space_id=p.space_id AND a.paper_id=p.id AND a.scan_job_id=?
    WHERE cs.space_id=? AND cs.source_key IN (?,?,?) AND c.query_text IN (?,?,?)
    ORDER BY cs.last_seen_at DESC,p.id LIMIT 30`).bind(job.id,spaceId,...keys,queries.days,queries.months,queries.years).all()).results;
  return Response.json({job:{id:job.id,status:job.status,startedAt:job.started_at,completedAt:job.completed_at},queries,branches,papers},
    {headers:{'Cache-Control':'private, no-store'}});
}
