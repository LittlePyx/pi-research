import { ensureSchema,getApiUser,getDatabase } from '../../../db/repository';
import { catalogWhere,routeCatalogTerms,type LibraryPaper } from '../../../lib/library-catalog';
import {routeReviewCurrentSql} from '../../../lib/research-maintenance-policy';
export async function GET(request:Request) {
  const user=getApiUser(request);if(!user)return Response.json({error:'Authentication required'},{status:401});
  const url=new URL(request.url),spaceId=url.searchParams.get('spaceId')||'',trackId=url.searchParams.get('trackId')||'',q=(url.searchParams.get('q')||'').trim().slice(0,160),offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return Response.json({error:'Invalid offset'},{status:400});
  const db=getDatabase();await ensureSchema(db);
  if(!await db.prepare('SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?').bind(spaceId,user.userId).first())return Response.json({error:'Space not found'},{status:404});
  const track=trackId?await db.prepare('SELECT title_en FROM research_tracks WHERE id=? AND space_id=?').bind(trackId,spaceId).first<{title_en:string}>():null;
  if(trackId&&!track)return Response.json({error:'Route not found'},{status:404});
  const terms=routeCatalogTerms(track?.title_en||'');const where=catalogWhere(spaceId,q,terms,trackId,url.searchParams.get('scope')==='all');
  const from=`FROM monitored_papers p LEFT JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id LEFT JOIN research_tracks t ON t.id=? AND t.space_id=p.space_id LEFT JOIN research_route_library m ON m.paper_id=p.id AND m.space_id=p.space_id AND m.track_id=t.id LEFT JOIN research_route_library_reviews rr ON rr.paper_id=p.id AND rr.track_id=t.id AND (${routeReviewCurrentSql}) LEFT JOIN library_graph_checks g ON g.paper_id=p.id AND g.space_id=p.space_id WHERE ${where.sql}`;
  const args=[trackId,...where.bindings];
  const [count,rows,coverage]=await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total ${from}`).bind(...args).first<{total:number}>(),
    db.prepare(`SELECT rr.relevance,rr.assessment_json AS assessmentJson,rr.checked_at AS reviewedAt,p.id,p.canonical_id AS canonicalId,p.title,p.authors,p.venue,p.url,p.doi,p.published_at AS publishedAt,COALESCE(i.abstract_text,'') AS abstractText,COALESCE(i.ever_recommended,0) AS recommended,CASE WHEN i.verification_status IN ('verified','revised') THEN 1 ELSE 0 END AS verified,m.status AS membership,m.category,g.status AS graphStatus,g.checked_at AS checkedAt,EXISTS(SELECT 1 FROM research_track_papers tp WHERE tp.space_id=p.space_id AND tp.canonical_id=p.canonical_id AND tp.curation_status='active' AND (?='' OR tp.track_id=?)) AS inRoute ${from} ORDER BY COALESCE(i.ever_recommended,0) DESC,p.discovered_at DESC,p.id LIMIT 24 OFFSET ?`).bind(trackId,trackId,...args,offset).all<LibraryPaper>(),
    db.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN g.status IN ('ready','partial','empty') THEN 1 ELSE 0 END) AS checked,SUM(CASE WHEN g.status='empty' THEN 1 ELSE 0 END) AS noLinks,SUM(CASE WHEN g.status IN ('error','missing_id') THEN 1 ELSE 0 END) AS blocked FROM monitored_papers p LEFT JOIN library_graph_checks g ON g.paper_id=p.id AND g.space_id=p.space_id WHERE p.space_id=?`).bind(spaceId).first(),
  ]);
  return Response.json({items:rows.results.map(p=>({...p,matchTerms:terms.filter(t=>(p.title+' '+p.abstractText).toLowerCase().includes(t))})),total:count?.total||0,nextOffset:offset+rows.results.length<(count?.total||0)?offset+rows.results.length:null,coverage,terms},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request) {
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origin mismatch'},{status:403});
  const user=getApiUser(request);if(!user)return Response.json({error:'Authentication required'},{status:401});
  const raw=await request.json().catch(()=>({})) as Record<string,unknown>; const b={spaceId:String(raw.spaceId||''),trackId:String(raw.trackId||''),paperId:String(raw.paperId||''),status:String(raw.status||''),category:String(raw.category||''),action:String(raw.action||''),email:String(raw.email||''),sendTime:String(raw.sendTime||'10:00'),locale:String(raw.locale||'zh'),code:String(raw.code||''),enabled:raw.enabled===true};const db=getDatabase();await ensureSchema(db);
  if(!['included','excluded'].includes(b.status)||!['related','method','background','evidence'].includes(b.category))return Response.json({error:'Invalid selection'},{status:400});
  const exists=await db.prepare(`SELECT p.id FROM monitored_papers p JOIN research_spaces s ON s.id=p.space_id JOIN research_tracks t ON t.space_id=s.id WHERE p.id=? AND s.id=? AND s.owner_user_id=? AND t.id=?`).bind(b.paperId,b.spaceId,user.userId,b.trackId).first();
  if(!exists)return Response.json({error:'Paper or route not found'},{status:404});
  await db.prepare(`INSERT INTO research_route_library (id,space_id,track_id,paper_id,status,category) VALUES (?,?,?,?,?,?) ON CONFLICT(track_id,paper_id) DO UPDATE SET status=excluded.status,category=excluded.category,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(),b.spaceId,b.trackId,b.paperId,b.status,b.category).run();
  return Response.json({saved:true,formal:false});
}
