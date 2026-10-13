import {ensureSchema,getApiUser,getDatabase} from '../../../db/repository';
import {readTaskBrief} from '../../../lib/task-brief';
export async function GET(request:Request){
 const user=getApiUser(request);if(!user)return Response.json({error:'Authentication required'},{status:401});
 const params=new URL(request.url).searchParams,spaceId=params.get('spaceId')||'';
 const db=getDatabase();await ensureSchema(db);
 if(!await db.prepare('SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?').bind(spaceId,user.userId).first())return Response.json({error:'Space not found'},{status:404});
 const brief=await readTaskBrief(db,spaceId,params.get('jobId')||'',params.get('snapshotId')||'');
 return Response.json({brief:brief&&params.get('evidence')!=='1'?{...brief,records:brief.records.map(r=>({...r,abstractText:''}))}:brief},{headers:{'Cache-Control':'private, no-store'}});
}
