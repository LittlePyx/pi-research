import {ensureSchema,getApiUser,getDatabase} from '../../../../db/repository';
import {readLibraryPage} from '../../monitor/route';
import {librarySearchOptions} from '../../../../lib/library-search.mjs';
export async function GET(request:Request) {
 const user=getApiUser(request);if(!user)return Response.json({error:'Authentication required'},{status:401});
 const params=new URL(request.url).searchParams,spaceId=params.get('spaceId')||'';
 let options;try{options=librarySearchOptions(params)}catch{return Response.json({error:'Invalid offset'},{status:400})}
 const db=getDatabase();await ensureSchema(db);
 if(!await db.prepare('SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?').bind(spaceId,user.userId).first())return Response.json({error:'Space not found'},{status:404});
 return Response.json(await readLibraryPage(db,spaceId,options),{headers:{'Cache-Control':'private, no-store'}});
}
