import {ensureSchema,getApiUser,getDatabase} from '../../../../db/repository';
import {readLibraryPage} from '../../monitor/route';
import {librarySearchOptions} from '../../../../lib/library-search.mjs';
export async function GET(request:Request) {
 const user=getApiUser(request);if(!user)return Response.json({error:'Authentication required'},{status:401});
 const params=new URL(request.url).searchParams,spaceId=params.get('spaceId')||'';
 let options;try{options=librarySearchOptions(params)}catch{return Response.json({error:'Invalid offset'},{status:400})}
 const db=getDatabase();await ensureSchema(db);
 if(!await db.prepare('SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?').bind(spaceId,user.userId).first())return Response.json({error:'Space not found'},{status:404});
 const page=await readLibraryPage(db,spaceId,options);
 const trackId=params.get('collection')||'';
 if(!trackId||!page.papers.length)return Response.json(page,{headers:{'Cache-Control':'private, no-store'}});
 const ids=page.papers.map(paper=>paper.id);
 const {results}=await db.prepare(`SELECT paper_id,status,category FROM research_route_library
   WHERE space_id=? AND track_id=? AND paper_id IN (${ids.map(()=>'?').join(',')})`)
   .bind(spaceId,trackId,...ids).all<{paper_id:string;status:'included'|'excluded';category:string}>();
 const membership=new Map(results.map(row=>[row.paper_id,row]));
 return Response.json({...page,papers:page.papers.map(paper=>({...paper,routeMembership:membership.get(paper.id)}))},{headers:{'Cache-Control':'private, no-store'}});
}
