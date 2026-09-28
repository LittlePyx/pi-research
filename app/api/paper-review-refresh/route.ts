import {ensureSchema,getApiUser,getDatabase} from '../../../db/repository';
import {resolveDeepSeekCredential} from '../../../lib/model-credentials';
import {advanceReviewRefresh,readReviewRefresh,type Audited} from '../../../lib/paper-review-refresh';
import {auditSavedPaperReview} from '../monitor/route';

async function owned(request:Request,input:{spaceId?:unknown;paperId?:unknown}) {
  const user=getApiUser(request);
  if(!user)return {error:Response.json({error:'Authentication required'},{status:401})} as const;
  if(typeof input.spaceId!=='string'||typeof input.paperId!=='string')return {error:Response.json({error:'Missing identity'},{status:400})} as const;
  const db=getDatabase();await ensureSchema(db);
  const paper=await db.prepare('SELECT p.id FROM monitored_papers p JOIN research_spaces s ON s.id=p.space_id WHERE p.id=? AND p.space_id=? AND s.owner_user_id=?').bind(input.paperId,input.spaceId,user.userId).first();
  if(!paper)return {error:Response.json({error:'Paper not found'},{status:404})} as const;
  return {db,user,spaceId:input.spaceId,paperId:input.paperId} as const;
}
export async function GET(request:Request) {
  const url=new URL(request.url),context=await owned(request,{spaceId:url.searchParams.get('spaceId'),paperId:url.searchParams.get('paperId')});
  if(context.error)return context.error;
  return Response.json(await readReviewRefresh(context.db,context.spaceId,context.paperId),{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request) {
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
  let input;try{input=await request.json()}catch{return Response.json({error:'Invalid request'},{status:400})}
  if(!input||typeof input!=='object')return Response.json({error:'Invalid request'},{status:400});
  const context=await owned(request,input);if(context.error)return context.error;
  const {apiKey}=resolveDeepSeekCredential(request);
  if(!apiKey)return Response.json({error:'Connect a model first'},{status:400});
  try {
    const result=await advanceReviewRefresh(context.db,context.spaceId,context.paperId,async draft=>
      await auditSavedPaperReview(context.db,context.spaceId,context.user.userId,context.paperId,apiKey,draft as unknown as Parameters<typeof auditSavedPaperReview>[5]) as unknown as Audited);
    return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    const budget=error instanceof Error&&error.message==='budget_reached';
    return Response.json({error:budget?'今日评审额度已用完，原内容已保留。':'评审尚未更新，已保留原内容与已完成步骤；稍后可重试。'},{status:budget?429:502});
  }
}
