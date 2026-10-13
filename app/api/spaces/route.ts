import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";
import {spaceDeletionAvailable} from '../../../lib/space-deletion';

type SpaceRow = {
  id: string;
  name: string;
  member_name: string;
  description: string;
  accent: string;
  preferred_locale: string;
  created_at: string;
  deleted_at?:string|null;
};

function toSpace(row: SpaceRow) {
  return {
    id: row.id,
    name: row.name,
    memberName: row.member_name,
    description: row.description,
    accent: row.accent,
    preferredLocale: row.preferred_locale,
    createdAt: row.created_at,
    ...(row.deleted_at?{deletedAt:row.deleted_at}:{}),
  };
}

export async function GET(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });

  try {
    const database = getDatabase();
    await ensureSchema(database);
    const deletionAvailable=await spaceDeletionAvailable(database);
    const result = await database
      .prepare(deletionAvailable?"SELECT s.id,s.name,s.member_name,s.description,s.accent,s.preferred_locale,s.created_at,d.deleted_at FROM research_spaces s LEFT JOIN research_space_deletions d ON d.space_id=s.id WHERE s.owner_user_id=? ORDER BY s.created_at ASC":"SELECT id, name, member_name, description, accent, preferred_locale, created_at FROM research_spaces WHERE owner_user_id = ? ORDER BY created_at ASC")
      .bind(user.userId)
      .all<SpaceRow>();

    const credential = resolveDeepSeekCredential(request);
    const modelConfigured = Boolean(credential.apiKey);
    return Response.json({
      spaces: result.results.filter(row=>!row.deleted_at).map(toSpace),
      deletedSpaces:result.results.filter(row=>row.deleted_at).map(toSpace),deletionAvailable,
      user: {displayName:user.displayName},
      modelConfigured,
      modelConnectionState: modelConfigured ? "checking" : "unconfigured",
      provider: modelConfigured ? "deepseek" : null,
      model: modelConfigured ? "deepseek-flash" : null,
      modelCredentialSource: credential.source,
    },{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load research spaces";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function changeSpace(request:Request,remove:boolean){
 const user=getApiUser(request);
 if(!user)return Response.json({error:'Authentication required'},{status:401});
 if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin))return Response.json({error:'Invalid origin'},{status:403});
 if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required'},{status:415});
 const body=await request.json().catch(()=>null) as {id?:unknown;confirmName?:unknown;action?:unknown}|null;
 if(!body||typeof body.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(body.id)||(!remove&&body.action!=='restore'))return Response.json({error:'Invalid space action'},{status:400});
 const db=getDatabase();await ensureSchema(db);
 if(!await spaceDeletionAvailable(db))return Response.json({error:'Deletion is not yet available'},{status:503});
 const space=await db.prepare('SELECT id,name,member_name,description,accent,preferred_locale,created_at FROM research_spaces WHERE id=? AND owner_user_id=?').bind(body.id,user.userId).first<SpaceRow>();
 if(!space)return Response.json({error:'Space not found'},{status:404});
 if(remove&&body.confirmName!==space.name)return Response.json({error:'Space name changed; check before deleting'},{status:409});
 const previousDeletion=await db.prepare('SELECT deleted_at FROM research_space_deletions WHERE space_id=?').bind(space.id).first<{deleted_at:string}>();
 if(remove&&previousDeletion)return Response.json({space:toSpace({...space,deleted_at:previousDeletion.deleted_at}),deleted:true},{headers:{'Cache-Control':'private, no-store'}});
 if(remove){
  await db.batch([
   db.prepare('INSERT OR IGNORE INTO research_space_deletions(space_id) SELECT id FROM research_spaces WHERE id=? AND owner_user_id=?').bind(space.id,user.userId),
   db.prepare(`INSERT INTO monitor_runs(id,space_id,status,automation_paused_at,automation_pause_reason) VALUES(?,?,'idle',CURRENT_TIMESTAMP,'space_deleted')
     ON CONFLICT(space_id) DO UPDATE SET automation_paused_at=COALESCE(monitor_runs.automation_paused_at,CURRENT_TIMESTAMP),automation_pause_reason='space_deleted',status='idle',lock_token=NULL,lock_expires_at=NULL,active_job_id=NULL,lease_generation=monitor_runs.lease_generation+1,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(),space.id),
   db.prepare("UPDATE monitor_scan_jobs SET status='error',checkpoint='paused_space',failure_kind='space_deleted',error='space_deleted',advance_lock_token=NULL,advance_lock_expires_at=NULL,completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE space_id=? AND status NOT IN ('ready','error')").bind(space.id),
  ]);
 }else await db.prepare('DELETE FROM research_space_deletions WHERE space_id=? AND EXISTS(SELECT 1 FROM research_spaces WHERE id=? AND owner_user_id=?)').bind(space.id,space.id,user.userId).run();
 const deleted=await db.prepare('SELECT deleted_at FROM research_space_deletions WHERE space_id=?').bind(space.id).first<{deleted_at:string}>();
 return Response.json({space:toSpace({...space,deleted_at:deleted?.deleted_at}),deleted:Boolean(deleted)},{headers:{'Cache-Control':'private, no-store'}});
}
export const DELETE=(request:Request)=>changeSpace(request,true);
export const PATCH=(request:Request)=>changeSpace(request,false);

export async function POST(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });

  try {
    const payload = await request.json() as {
      name?: string;
      memberName?: string;
      description?: string;
      preferredLocale?: string;
    };
    const name = payload.name?.trim().slice(0, 80) ?? "";
    const memberName = payload.memberName?.trim().slice(0, 80) || user.displayName;
    const description = payload.description?.trim().slice(0, 300) ?? "";
    if (!name) return Response.json({ error: "Space name is required" }, { status: 400 });

    const database = getDatabase();
    await ensureSchema(database);
    const id = crypto.randomUUID();
    const accents = ["blue", "umber", "sage", "plum"];
    const accent = accents[Math.floor(Math.random() * accents.length)];
    await database.prepare("INSERT INTO research_spaces (id, owner_user_id, name, member_name, description, accent, preferred_locale) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, user.userId, name, memberName, description, accent, payload.preferredLocale === "en" ? "en" : "zh")
      .run();

    const row = await database.prepare("SELECT id, name, member_name, description, accent, preferred_locale, created_at FROM research_spaces WHERE id = ? AND owner_user_id = ?")
      .bind(id, user.userId)
      .first<SpaceRow>();
    return Response.json({ space: row ? toSpace(row) : null }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create research space";
    const status = message.includes("UNIQUE") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
