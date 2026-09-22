import { ensureSchema, getApiUser, getDatabase } from '../../../db/repository';
import { researchStartDigest, START_ELIGIBLE } from '../../../lib/research-start';

async function owned(request: Request, spaceId: string) {
  const user = getApiUser(request);
  if (!user) return null;
  const db = getDatabase(); await ensureSchema(db);
  return await db.prepare('SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?').bind(spaceId, user.userId).first() ? db : null;
}

async function read(db: D1Database, spaceId: string, goalId = '') {
  const goal = await db.prepare(`SELECT p.id, p.track_id AS trackId, p.question, p.scope,
    p.status, t.monitoring_status AS monitoringStatus FROM research_problems p
    JOIN research_tracks t ON t.id=p.track_id AND t.space_id=p.space_id
    WHERE p.space_id=? AND p.model='user-entry-v1' AND (?='' OR p.id=?) ORDER BY p.created_at DESC, p.rowid DESC LIMIT 1`)
    .bind(spaceId,goalId,goalId).first<{ id: string; trackId: string; question: string; scope: string; status: string; monitoringStatus: string }>();
  const papers = goal ? (await db.prepare(`SELECT p.id,p.title,i.why_read_zh AS whyZh,i.why_read_en AS whyEn,
    i.reading_focus_zh AS focusZh,i.reading_focus_en AS focusEn,
    i.research_decision_zh AS checkZh,i.research_decision_en AS checkEn
    FROM monitored_papers p JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id
    WHERE p.space_id=? AND i.research_problem_id=? AND ${START_ELIGIBLE}
    AND NOT EXISTS(SELECT 1 FROM paper_reading_progress r WHERE r.paper_id=p.id AND r.space_id=p.space_id AND r.status IN ('read','mastered','cited'))
    ORDER BY i.quality_score DESC,p.id LIMIT 5`).bind(spaceId, goal.id).all()).results : [];
  return { goal, papers };
}

export async function GET(request: Request) {
  const spaceId = new URL(request.url).searchParams.get('spaceId') || '';
  const db = await owned(request, spaceId);
  if (!db) return Response.json({error:'Space not found'}, {status:404});
  return Response.json(await read(db, spaceId, new URL(request.url).searchParams.get('goalId') || ''), {headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(request: Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({error:'Origin mismatch'}, {status:403});
  const parsed = await request.json().catch(() => null);
  const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string,unknown> : {};
  const question = typeof body.question === 'string' ? body.question.trim().replace(/\s+/g,' ') : '';
  const seed = typeof body.seed === 'string' ? body.seed.trim().replace(/\s+/g,' ') : '';
  if (question.length < 10 || question.length > 520 || seed.length > 300) return Response.json({error:'Invalid question or seed'}, {status:400});
  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
  const db = await owned(request, spaceId);
  if (!db) return Response.json({error:'Space not found'}, {status:404});
  const digest = await researchStartDigest([spaceId, question.toLowerCase(), seed.toLowerCase()]);
  const trackId = 'entry-' + digest, id = 'question-' + digest;
  const existing = await db.prepare(`SELECT p.status,t.monitoring_status AS monitoringStatus FROM research_problems p
    JOIN research_tracks t ON t.id=p.track_id AND t.space_id=p.space_id WHERE p.id=? AND p.space_id=?`).bind(id,spaceId).first<{status:string;monitoringStatus:string}>();
  if (existing && (existing.status !== 'active' || existing.monitoringStatus !== 'active')) return Response.json({error:'This question is paused or resolved. Manage it in Research.'},{status:409});
  // Atomic and idempotent. A seed is user-provided context, never verified evidence.
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO research_tracks(id,space_id,title_zh,title_en,summary_zh,summary_en,search_queries,position,expansion_count,build_status,user_role)
      VALUES(?,?,?,?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM research_tracks WHERE space_id=?),0),-1,'queued','core')`)
      .bind(trackId,spaceId,question,question,'用户确认的研究问题，材料待检索核对。','User-confirmed question; materials need discovery and verification.',JSON.stringify([question.slice(0,200)]),spaceId),
    db.prepare(`INSERT OR IGNORE INTO research_problems(id,space_id,track_id,status,working_language,question,objective,scope,success_criteria,stage,model,confirmed_at)
      VALUES(?,?,?,'active',?,?,?, ?,?,'literature','user-entry-v1',CURRENT_TIMESTAMP)`)
      .bind(id,spaceId,trackId,body.locale === 'en' ? 'en' : 'zh',question,
        'Find and check literature relevant to the confirmed question.',
        question + (seed ? '\nUser-provided starting paper (unverified): ' + seed : ''),
        'Identify useful papers and compare their assumptions, methods and limitations against the question.'),
    db.prepare('DELETE FROM monitor_query_plans WHERE space_id=? AND plan_date=?').bind(spaceId,new Date().toISOString().slice(0,10)),
  ]);
  // Return the requested goal, including on retries of an older saved question.
  const result = await read(db, spaceId,id);
  return Response.json({...result, confirmed:{id,trackId,question}, created:!existing});
}
