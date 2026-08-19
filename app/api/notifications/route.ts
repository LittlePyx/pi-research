import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";

type NotificationRow = {
  id: string;
  kind: string;
  priority: string;
  title_zh: string;
  title_en: string;
  body_zh: string;
  body_en: string;
  action_view: string;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

async function ownedDatabase(request: Request, spaceId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 }) };
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1")
    .bind(spaceId, user.userId).first<{ id: string }>();
  if (!space) return { error: Response.json({ error: "Research space not found" }, { status: 404 }) };
  return { database };
}

async function readNotifications(database: D1Database, spaceId: string) {
  const result = await database.prepare(
    `SELECT id, kind, priority, title_zh, title_en, body_zh, body_en, action_view, entity_id, read_at, created_at
     FROM research_notifications WHERE space_id = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ORDER BY CASE WHEN read_at IS NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 40`,
  ).bind(spaceId).all<NotificationRow>();
  return result.results.map((row) => ({
    id: row.id,
    kind: row.kind,
    priority: row.priority,
    titleZh: row.title_zh,
    titleEn: row.title_en,
    bodyZh: row.body_zh,
    bodyEn: row.body_en,
    actionView: row.action_view,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export async function GET(request: Request) {
  const spaceId = new URL(request.url).searchParams.get("spaceId")?.trim() || "";
  if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
  const context = await ownedDatabase(request, spaceId);
  if ("error" in context) return context.error;
  const notifications = await readNotifications(context.database, spaceId);
  return Response.json({ notifications, unreadCount: notifications.filter((item) => !item.readAt).length });
}

export async function PATCH(request: Request) {
  const input = await request.json().catch(() => null) as { spaceId?: string; notificationId?: string; readAll?: boolean } | null;
  const spaceId = input?.spaceId?.trim() || "";
  if (!spaceId || (!input?.readAll && !input?.notificationId?.trim())) {
    return Response.json({ error: "spaceId and a notification action are required" }, { status: 400 });
  }
  const context = await ownedDatabase(request, spaceId);
  if ("error" in context) return context.error;
  if (input.readAll) {
    await context.database.prepare(
      "UPDATE research_notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE space_id = ?",
    ).bind(spaceId).run();
  } else {
    await context.database.prepare(
      "UPDATE research_notifications SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?",
    ).bind(input.notificationId!.trim(), spaceId).run();
  }
  const notifications = await readNotifications(context.database, spaceId);
  return Response.json({ notifications, unreadCount: notifications.filter((item) => !item.readAt).length });
}
