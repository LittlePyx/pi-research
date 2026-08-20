import { NextResponse } from "next/server";

import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { FEEDBACK_REASONS, recordPaperFeedbackSignal, type FeedbackReasonCode } from "../../../lib/preference-memory";
import { reconcileResearchMapEvidenceStatements } from "../../../lib/research-map-evidence";

type FeedbackPayload = {
  spaceId?: string;
  paperId?: string;
  kind?: "save" | "relevant" | "not_relevant" | "shown" | "open" | "later";
  value?: boolean;
  reasonCode?: string;
  note?: string;
};

async function addResearchTrackSignal(database: D1Database, spaceId: string, paperId: string, weight: number) {
  await database.prepare(
    `UPDATE research_tracks SET interaction_score = MIN(35, interaction_score + ?), updated_at = CURRENT_TIMESTAMP
     WHERE space_id = ? AND id IN (
       SELECT tp.track_id FROM research_track_papers tp
       JOIN monitored_papers mp ON mp.space_id = tp.space_id AND mp.canonical_id = tp.canonical_id
       WHERE mp.id = ? AND mp.space_id = ?
     )`,
  ).bind(weight, spaceId, paperId, spaceId).run();
}

async function refreshResearchLoopAfterFeedback(database: D1Database, spaceId: string, paperId: string) {
  await database.prepare(
    `UPDATE research_tracks SET intelligence_json = '{}', intelligence_model = '', intelligence_updated_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE space_id = ? AND id IN (
       SELECT tp.track_id FROM research_track_papers tp
       JOIN monitored_papers mp ON mp.space_id = tp.space_id AND mp.canonical_id = tp.canonical_id
       WHERE mp.id = ? AND mp.space_id = ?
     )`,
  ).bind(spaceId, paperId, spaceId).run();
}

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

  const ownedPaper = await DB.prepare("SELECT id, title FROM monitored_papers WHERE id = ? AND space_id = ? LIMIT 1")
    .bind(paperId, spaceId)
    .first<{ id: string; title: string }>();
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
    await addResearchTrackSignal(DB, spaceId, paperId, 1);
    return NextResponse.json({ ok: true, state: "seen" });
  }

  if (kind === "later") {
    const snoozedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await DB.prepare(
      `INSERT INTO paper_delivery_state (id, space_id, paper_id, snoozed_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET snoozed_until = excluded.snoozed_until, updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), spaceId, paperId, snoozedUntil).run();
    await addResearchTrackSignal(DB, spaceId, paperId, 1);
    return NextResponse.json({ ok: true, state: "snoozed", snoozedUntil });
  }

  const saved = kind === "save" ? Number(body.value) : 0;
  const feedback = kind === "save" ? null : body.value ? kind : null;
  const reasonCode = body.reasonCode && body.reasonCode in FEEDBACK_REASONS ? body.reasonCode as FeedbackReasonCode : null;
  const note = (body.note || "").trim().slice(0, 500);
  if (reasonCode) {
    const polarity = FEEDBACK_REASONS[reasonCode].polarity;
    if ((kind === "relevant" && polarity !== "positive") || (kind === "not_relevant" && polarity !== "negative")) {
      return NextResponse.json({ error: "Feedback reason does not match the decision" }, { status: 400 });
    }
  }

  let feedbackStatement: D1PreparedStatement;
  if (kind === "save") {
    feedbackStatement = DB.prepare(
      `INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback, reason_code, note)
       VALUES (?, ?, ?, ?, NULL, NULL, '')
       ON CONFLICT(space_id, paper_id) DO UPDATE SET
         saved = excluded.saved,
         feedback = paper_feedback.feedback,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(crypto.randomUUID(), spaceId, paperId, saved);
  } else if (kind === "not_relevant") {
    feedbackStatement = DB.prepare(
      `INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback, reason_code, note)
       VALUES (?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET
         saved = 0,
         feedback = excluded.feedback,
         reason_code = excluded.reason_code,
         note = excluded.note,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(crypto.randomUUID(), spaceId, paperId, feedback, reasonCode, note);
  } else {
    feedbackStatement = DB.prepare(
      `INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback, reason_code, note)
       VALUES (?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET
         feedback = excluded.feedback,
         reason_code = excluded.reason_code,
         note = excluded.note,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), spaceId, paperId, feedback, reasonCode, note);
  }

  // D1 batches are transactional. Every evidence predicate below observes the
  // feedback row written above, so two tabs making opposite decisions cannot
  // leave the paper feedback and research map in contradictory states.
  await DB.batch([
    feedbackStatement,
    ...reconcileResearchMapEvidenceStatements(DB, spaceId, paperId),
  ]);

  if (body.value) {
    await DB.prepare("UPDATE paper_delivery_state SET snoozed_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ?")
      .bind(spaceId, paperId).run();
    if (kind === "save" || kind === "relevant" || reasonCode === "duplicate_known") {
      await addResearchTrackSignal(DB, spaceId, paperId, kind === "relevant" ? 5 : kind === "save" ? 3 : 2);
    }
  }

  if ((kind === "relevant" || kind === "not_relevant") && !body.value) {
    await DB.prepare("UPDATE research_preference_signals SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND source_type = 'paper_feedback' AND source_id LIKE ?")
      .bind(spaceId, `${paperId}:%`).run();
  } else if (body.value && reasonCode) {
    await DB.prepare("UPDATE research_preference_signals SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND source_type = 'paper_feedback' AND source_id LIKE ?")
      .bind(spaceId, `${paperId}:%`).run();
    await recordPaperFeedbackSignal(DB, spaceId, paperId, ownedPaper.title, reasonCode, note);
  }

  if (kind === "save" || kind === "relevant" || kind === "not_relevant") {
    await refreshResearchLoopAfterFeedback(DB, spaceId, paperId);
  }

  return NextResponse.json({ ok: true, state: body.value ? kind === "not_relevant" ? "dismissed" : "accepted" : "pending" });
}
