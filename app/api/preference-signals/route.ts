import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";

export async function PATCH(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  const payload = await request.json().catch(() => null) as { spaceId?: string; signalId?: string; active?: boolean } | null;
  const spaceId = payload?.spaceId?.trim() || "";
  const signalId = payload?.signalId?.trim() || "";
  if (!spaceId || !signalId || typeof payload?.active !== "boolean") {
    return Response.json({ error: "spaceId, signalId, and active are required" }, { status: 400 });
  }
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1")
    .bind(spaceId, user.userId).first<{ id: string }>();
  if (!space) return Response.json({ error: "Research space not found" }, { status: 404 });
  const signal = await database.prepare("SELECT id, layer FROM research_preference_signals WHERE id = ? AND space_id = ? LIMIT 1")
    .bind(signalId, spaceId).first<{ id: string; layer: string }>();
  if (!signal) return Response.json({ error: "Preference signal not found" }, { status: 404 });
  if (signal.layer === "explicit" && !payload.active) {
    return Response.json({ error: "Explicit user evidence must be changed at its original source" }, { status: 409 });
  }
  await database.prepare("UPDATE research_preference_signals SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?")
    .bind(payload.active ? 1 : 0, signalId, spaceId).run();
  await database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date = date('now')").bind(spaceId).run();
  return Response.json({ ok: true });
}
