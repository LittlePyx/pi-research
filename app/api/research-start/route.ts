import {ensureSchema,getApiUser,getDatabase} from '../../../db/repository';
import {START_ELIGIBLE,START_SOURCES_SQL,researchStartDigest,type ResearchStartSource} from '../../../lib/research-start';

async function context(request:Request,spaceId:string) {
 const user=getApiUser(request);if(!user)return null;
 const db=getDatabase();await ensureSchema(db);
 return await db.prepare('SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?').bind(spaceId,user.userId).first()?db:null;
}
export async function GET(request:Request) {
 const url=new URL(request.url),spaceId=url.searchParams.get('spaceId')||'',paperId=url.searchParams.get('paperId')||'';
 const db=await context(request,spaceId);if(!db)return Response.json({error:'Space not found'},{status:404});
 const rows=await db.prepare(`${START_SOURCES_SQL}${paperId?' AND p.id=?':''} ORDER BY i.quality_score DESC,p.id LIMIT 3`).bind(spaceId,...(paperId?[paperId]:[])).all<ResearchStartSource>();
 return Response.json({suggestions:await Promise.all(rows.results.map(async source=>({...source,revision:await researchStartDigest(source)})))},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request) {
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origin mismatch'},{status:403});
 const b=await request.json().catch(()=>({})) as Record<string,unknown>;
 const spaceId=typeof b.spaceId==='string'?b.spaceId:'',paperId=typeof b.paperId==='string'?b.paperId:'',target=typeof b.target==='string'?b.target.trim():'';
 if(target.length<4||target.length>240||b.action!=='confirm')return Response.json({error:'Choose a specific goal (4–240 characters)'},{status:400});
 const db=await context(request,spaceId);if(!db)return Response.json({error:'Space not found'},{status:404});
 const source=await db.prepare(`${START_SOURCES_SQL} AND p.id=?`).bind(spaceId,paperId).first<ResearchStartSource>();
 if(!source||await researchStartDigest(source)!==b.revision)return Response.json({error:'Source changed; refresh the suggestions'},{status:409});
 const id='start-'+await researchStartDigest([spaceId,target.toLowerCase()]);
 const existing=await db.prepare('SELECT monitoring_status FROM research_tracks WHERE id=? AND space_id=?').bind(id,spaceId).first<{monitoring_status:string}>();
 if(existing?.monitoring_status==='paused')return Response.json({error:'This route is paused; manage it in Research routes'},{status:409});
 // Every write rechecks the exact source and user exclusions. Creation is idempotent;
 // an explicitly excluded membership is never overwritten by a repeated confirmation.
 const guard=`FROM monitored_papers p JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id
 WHERE p.id=? AND p.space_id=? AND ${START_ELIGIBLE} AND i.updated_at=? AND i.abstract_text=? AND i.problem_zh=? AND i.problem_en=?`;
 const args=[paperId,spaceId,source.updatedAt,source.abstractText,source.problemZh,source.problemEn];
 const writes=await db.batch([
  db.prepare(`INSERT OR IGNORE INTO research_tracks(id,space_id,title_zh,title_en,summary_zh,summary_en,search_queries,position,expansion_count,build_status,user_role)
   SELECT ?,p.space_id,?,?,?, ?,?,COALESCE((SELECT MAX(position)+1 FROM research_tracks WHERE space_id=p.space_id),0),-1,'queued','core' ${guard}`)
   .bind(id,target,target,'用户确认的研究目标；从已评审论文开始阅读与核对。','User-confirmed goal, starting from a reviewed paper.',JSON.stringify([source.title.slice(0,200)]),...args),
  db.prepare(`INSERT OR IGNORE INTO research_route_library(id,space_id,track_id,paper_id,status,category)
   SELECT ?,p.space_id,?,p.id,'included','related' ${guard} AND EXISTS(SELECT 1 FROM research_tracks t WHERE t.id=? AND t.space_id=p.space_id AND t.monitoring_status='active')`)
   .bind(crypto.randomUUID(),id,...args,id),
 ]);
 const member=await db.prepare("SELECT status FROM research_route_library WHERE track_id=? AND paper_id=? AND space_id=?").bind(id,paperId,spaceId).first<{status:string}>();
 if(!member||member.status!=='included')return Response.json({error:'Source changed or excluded; refresh before continuing'},{status:409});
 return Response.json({track:{id,titleZh:target,titleEn:target},created:Boolean(writes[0].meta.changes),task:{spaceId,question:target,papers:[{canonicalId:source.canonicalId,title:source.title}],readingTask:{paperId:source.id,focusZh:source.taskZh,focusEn:source.taskEn}},formal:false});
}
