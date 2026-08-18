import { NextResponse } from "next/server";

import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";

type FeedbackPayload = {
  spaceId?: string;
  paperId?: string;
  kind?: "save" | "relevant" | "not_relevant";
  value?: boolean;
};

export async function POST(request: Request) {
  const user = getApiUser(request);

  if (!user) {
    return NextResponse.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as FeedbackPayload | null;
  const spaceId = body?.spaceId?.trim();
  const paperId = body?.paperId?.trim();
  const kind = body?.kind;

  if (!spaceId || !paperId || !kind || typeof body?.value !== "boolean") {
    return NextResponse.json({ error: "Invalid feedback payload" }, { status: 400 });
  }

  const DB = getDatabase();
  await ensureSchema(DB);

  const ownedSpace = await DB.prepare(
    "SELECT id FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1",
  )
    .bind(spaceId, user.userId)
    .first<{ id: string }>();

  if (!ownedSpace) {
    return NextResponse.json({ error: "Research space not found" }, { status: 404 });
  }

  const saved = kind === "save" ? Number(body.value) : 0;
  const feedback = kind === "save" ? null : body.value ? kind : null;

  if (kind === "save") {
    await DB.prepare(
      `INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET
         saved = excluded.saved,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(crypto.randomUUID(), spaceId, paperId, saved)
      .run();
  } else {
    await DB.prepare(
      `INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET
         feedback = excluded.feedback,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(crypto.randomUUID(), spaceId, paperId, feedback)
      .run();
  }

  return NextResponse.json({ ok: true });
}
