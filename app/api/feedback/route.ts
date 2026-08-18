import { NextResponse } from "next/server";

import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";

type FeedbackPayload = {
  spaceId?: string;
  paperId?: string;
  kind?: "save" | "relevant" | "not_relevant" | "shown" | "open" | "later";
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

  const ownedPaper = await DB.prepare("SELECT id FROM monitored_papers WHERE id = ? AND space_id = ? LIMIT 1")
    .bind(paperId, spaceId)
    .first<{ id: string }>();
  if (!ownedPaper) return NextResponse.json({ error: "Paper not found" }, { status: 404 });

  if (kind === "shown") {
    await DB.prepare(
      `INSERT INTO paper_delivery_state (id, space_id, paper_id, show_count, first_shown_at, last_shown_at)
       VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET
         show_count = paper_delivery_state.show_count + 1,
         first_shown_at = COALESCE(paper_delivery_state.first_shown_at, CURRENT_TIMESTAMP),
         last_shown_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), spaceId, paperId).run();
    return NextResponse.json({ ok: true, state: "seen" });
  }

  if (kind === "open") {
    await DB.prepare(
      `INSERT INTO paper_delivery_state (id, space_id, paper_id, opened_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET opened_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), spaceId, paperId).run();
    return NextResponse.json({ ok: true, state: "seen" });
  }

  if (kind === "later") {
    const snoozedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await DB.prepare(
      `INSERT INTO paper_delivery_state (id, space_id, paper_id, snoozed_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET snoozed_until = excluded.snoozed_until, updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), spaceId, paperId, snoozedUntil).run();
    await DB.prepare("UPDATE paper_feedback SET saved = 0, feedback = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ?")
      .bind(spaceId, paperId).run();
    return NextResponse.json({ ok: true, state: "snoozed", snoozedUntil });
  }

  const saved = kind === "save" ? Number(body.value) : 0;
  const feedback = kind === "save" ? null : body.value ? kind : null;

  if (kind === "save") {
    await DB.prepare(
      `INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET
         saved = excluded.saved,
         feedback = CASE WHEN excluded.saved = 1 THEN NULL ELSE paper_feedback.feedback END,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(crypto.randomUUID(), spaceId, paperId, saved)
      .run();
  } else if (kind === "not_relevant") {
    await DB.prepare(
      `INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET
         saved = 0,
         feedback = excluded.feedback,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(crypto.randomUUID(), spaceId, paperId, feedback)
      .run();
  } else {
    await DB.prepare(
      `INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET
         feedback = excluded.feedback,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), spaceId, paperId, feedback).run();
  }

  if (body.value) {
    await DB.prepare("UPDATE paper_delivery_state SET snoozed_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ?")
      .bind(spaceId, paperId).run();
  }

  return NextResponse.json({ ok: true, state: body.value ? kind === "not_relevant" ? "dismissed" : "accepted" : "pending" });
}
