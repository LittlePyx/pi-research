import { NextResponse } from "next/server";

import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { passiveEngagementWeight, passiveInterestConfidence } from "../../../lib/passive-engagement.mjs";
import { FEEDBACK_REASONS, recordPaperFeedbackSignal, upsertPreferenceSignal, type FeedbackReasonCode } from "../../../lib/preference-memory";
import { reconcileResearchMapEvidenceStatements } from "../../../lib/research-map-evidence";

type PassiveEngagementKind = "engaged_view" | "detail_dwell" | "original_click" | "share" | "ask_pi";
type PassiveEngagementEventKind = PassiveEngagementKind | "detail_open" | "revisit";

type FeedbackPayload = {
  spaceId?: string;
  paperId?: string;
  kind?: "save" | "relevant" | "not_relevant" | "shown" | "open" | "later" | PassiveEngagementKind;
  value?: boolean;
  reasonCode?: string;
  note?: string;
  eventKey?: string;
  dwellMs?: number;
  context?: string;
};

type EngagementTrack = { id: string; title_zh: string; title_en: string };

function feedbackEffect(kind: FeedbackPayload["kind"], value: boolean, reasonCode: FeedbackReasonCode | null) {
  if (!value) return {
    zh: "已撤销这次判断；论文回到待处理状态。",
    en: "This decision was removed and the paper returned to the inbox.",
  };
  if (kind === "later") return {
    zh: "已推迟 3 天；不会降低这个方向或方法的推荐权重。",
    en: "Snoozed for three days without lowering this topic or method.",
  };
  if (reasonCode === "duplicate_known") return {
    zh: "已标记为已掌握；下一轮会减少同类入门内容，继续寻找更深或更新的工作。",
    en: "Marked as mastered. Pi will reduce similar introductory work and seek deeper or newer papers.",
  };
  if (kind === "not_relevant") return {
    zh: "已降低相似检索分支的优先级；历史论文和其他研究方向不会被删除。",
    en: "Similar retrieval branches were deprioritized without deleting history or other directions.",
  };
  if (kind === "relevant") return {
    zh: "已加强对应主题、方法或问题的下一轮检索；完成书目与摘要证据核对后，才会记为路线证据变化。",
    en: "The matching topic, method, or question will guide the next scan; route evidence changes still require bibliographic and abstract evidence checks.",
  };
  if (kind === "save") return {
    zh: "已保存，并作为后续检索的正向信号；不会直接把论文当成已验证路线证据。",
    en: "Saved as a positive discovery signal, without treating the paper as verified route evidence.",
  };
  return { zh: "已记录。", en: "Recorded." };
}

async function resolveEngagementTrack(database: D1Database, spaceId: string, paperId: string) {
  const formal = await database.prepare(
    `SELECT t.id, t.title_zh, t.title_en FROM monitored_papers p
     JOIN research_track_papers tp ON tp.space_id = p.space_id AND tp.canonical_id = p.canonical_id
     JOIN research_tracks t ON t.id = tp.track_id AND t.space_id = tp.space_id
     WHERE p.id = ? AND p.space_id = ? AND tp.curation_status = 'active' ORDER BY tp.position LIMIT 1`,
  ).bind(paperId, spaceId).first<EngagementTrack>();
  if (formal) return formal;
  const proposal = await database.prepare(
    `SELECT t.id, t.title_zh, t.title_en FROM research_map_evidence_proposals ep
     JOIN research_tracks t ON t.id = ep.track_id AND t.space_id = ep.space_id
     WHERE ep.paper_id = ? AND ep.space_id = ? AND ep.status IN ('confirmed', 'pending')
     ORDER BY CASE ep.status WHEN 'confirmed' THEN 0 ELSE 1 END, ep.updated_at DESC LIMIT 1`,
  ).bind(paperId, spaceId).first<EngagementTrack>();
  if (proposal) return proposal;
  const audit = await database.prepare(
    `SELECT provenance_json FROM recommendation_audit_events
     WHERE paper_id = ? AND space_id = ? AND recommended = 1
     ORDER BY reviewed_at DESC, rowid DESC LIMIT 1`,
  ).bind(paperId, spaceId).first<{ provenance_json: string }>();
  let routeIds: string[] = [];
  try {
    const origins = JSON.parse(audit?.provenance_json || "[]") as Array<{ routeId?: unknown }>;
    routeIds = Array.from(new Set(origins.map((origin) => typeof origin.routeId === "string" ? origin.routeId.trim() : "").filter(Boolean))).slice(0, 6);
  } catch { routeIds = []; }
  for (const routeId of routeIds) {
    const track = await database.prepare("SELECT id, title_zh, title_en FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1")
      .bind(routeId, spaceId).first<EngagementTrack>();
    if (track) return track;
  }
  return null;
}

async function addResearchTrackSignal(database: D1Database, spaceId: string, paperId: string, weight: number) {
  const track = await resolveEngagementTrack(database, spaceId, paperId);
  if (!track) return;
  await database.prepare(
    "UPDATE research_tracks SET interaction_score = MIN(35, interaction_score + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?",
  ).bind(weight, track.id, spaceId).run();
}

async function recordPassiveEngagement(
  database: D1Database,
  input: { spaceId: string; paperId: string; kind: PassiveEngagementEventKind; eventKey?: string; dwellMs?: number; context?: string },
) {
  const dwellMs = Math.max(0, Math.min(300_000, Math.round(input.dwellMs || 0)));
  const weight = passiveEngagementWeight(input.kind, dwellMs);
  if (!weight) return { recorded: false, reason: "below_threshold" };
  const eventKey = (input.eventKey || crypto.randomUUID()).trim().slice(0, 180);
  const context = (input.context || "today").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "today";
  const track = await resolveEngagementTrack(database, input.spaceId, input.paperId);
  const result = await database.prepare(
    `INSERT OR IGNORE INTO paper_engagement_events
     (id, space_id, paper_id, event_key, kind, weight, dwell_ms, context, route_id)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM paper_engagement_events
       WHERE space_id = ? AND paper_id = ? AND kind = ? AND occurred_at >= datetime('now', '-1 day')) < 12`,
  ).bind(crypto.randomUUID(), input.spaceId, input.paperId, eventKey, input.kind, weight, dwellMs, context, track?.id || null,
    input.spaceId, input.paperId, input.kind).run();
  if (Number(result.meta?.changes || 0) <= 0) return { recorded: false, reason: "duplicate_or_capped" };
  await database.prepare("DELETE FROM paper_engagement_events WHERE space_id = ? AND occurred_at < datetime('now', '-120 days')")
    .bind(input.spaceId).run();
  if (!track) return { recorded: true, routeId: null };
  const summary = await database.prepare(
    `SELECT COALESCE(SUM(weight), 0) AS weight FROM paper_engagement_events
     WHERE space_id = ? AND route_id = ? AND occurred_at >= datetime('now', '-90 days')`,
  ).bind(input.spaceId, track.id).first<{ weight: number }>();
  const accumulatedWeight = Number(summary?.weight || 0);
  if (accumulatedWeight >= 4) {
    const disabled = await database.prepare(
      "SELECT 1 AS disabled FROM research_preference_signals WHERE space_id = ? AND source_type = 'passive_engagement' AND source_id = ? AND active = 0 LIMIT 1",
    ).bind(input.spaceId, track.id).first<{ disabled: number }>();
    if (!disabled) {
      const confidence = passiveInterestConfidence(accumulatedWeight);
      await upsertPreferenceSignal(database, {
        spaceId: input.spaceId,
        layer: "inferred",
        kind: "behavior_interest",
        labelZh: `近期反复关注：${track.title_zh}`,
        labelEn: `Recent sustained interest: ${track.title_en}`,
        evidence: "根据有效停留、详情阅读、原文访问或向 Pi 提问等行为推断；单纯曝光不计入，明确反馈始终优先。 / Inferred from qualified dwell, detail reading, original-paper visits, or questions to Pi; exposure alone does not count and explicit feedback always wins.",
        confidence,
        weight: Math.min(78, confidence),
        sourceType: "passive_engagement",
        sourceId: track.id,
        expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      });
    }
  }
  return { recorded: true, routeId: track.id };
}

async function refreshResearchLoopAfterFeedback(database: D1Database, spaceId: string, paperId: string) {
  await database.prepare(
    `UPDATE research_tracks SET intelligence_status = 'pending', intelligence_attempt_count = 0,
      intelligence_error = NULL, intelligence_retry_at = NULL, intelligence_lock_token = NULL,
      intelligence_lock_expires_at = NULL, intelligence_refresh_requested_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
     WHERE space_id = ? AND id IN (
       SELECT tp.track_id FROM research_track_papers tp
       JOIN monitored_papers mp ON mp.space_id = tp.space_id AND mp.canonical_id = tp.canonical_id
       WHERE mp.id = ? AND mp.space_id = ? AND tp.curation_status = 'active'
     )`,
  ).bind(spaceId, paperId, spaceId).run();
}

async function recordRecommendationFeedbackOutcome(database: D1Database, input: {
  spaceId: string;
  paperId: string;
  kind: "save" | "relevant" | "not_relevant" | "later";
  value: boolean;
  reasonCode?: FeedbackReasonCode | null;
}) {
  try {
    const [audit, sources] = await Promise.all([
      database.prepare(
        `SELECT scan_job_id, horizon, recommendation_tier, provenance_json, reviewed_at
         FROM recommendation_audit_events WHERE space_id = ? AND paper_id = ?
         ORDER BY reviewed_at DESC, rowid DESC LIMIT 1`,
      ).bind(input.spaceId, input.paperId).first<{
        scan_job_id: string;
        horizon: string;
        recommendation_tier: string;
        provenance_json: string;
        reviewed_at: string;
      }>(),
      database.prepare(
        `SELECT source_key, channel, query_key, appearances FROM monitor_candidate_sources
         WHERE space_id = ? AND paper_id = ? ORDER BY last_seen_at DESC LIMIT 8`,
      ).bind(input.spaceId, input.paperId).all<{
        source_key: string;
        channel: string;
        query_key: string;
        appearances: number;
      }>(),
    ]);
    const outcome = input.value && (input.kind === "save" || input.kind === "relevant")
      ? "success"
      : input.value && input.kind === "not_relevant" && input.reasonCode !== "duplicate_known"
        ? "degraded"
        : "info";
    await database.prepare(
      `INSERT INTO monitor_reliability_events
       (id, space_id, scan_job_id, kind, stage, source, outcome, message, metadata_json)
       VALUES (?, ?, ?, 'recommendation_feedback_outcome', 'user_feedback', 'quality-learning', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), input.spaceId, audit?.scan_job_id || null, outcome,
      "An explicit recommendation outcome was attributed to its discovery branches for future planning",
      JSON.stringify({
        paperId: input.paperId,
        feedbackKind: input.kind,
        value: input.value,
        reasonCode: input.reasonCode || null,
        horizon: audit?.horizon || null,
        recommendationTier: audit?.recommendation_tier || null,
        provenance: audit?.provenance_json ? JSON.parse(audit.provenance_json) : [],
        branches: sources.results,
      }),
    ).run();
  } catch (error) {
    // Feedback must remain responsive even if internal attribution telemetry is unavailable.
    console.error("Failed to attribute recommendation feedback", error);
  }
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
    const previous = await DB.prepare("SELECT opened_at FROM paper_delivery_state WHERE space_id = ? AND paper_id = ? LIMIT 1")
      .bind(spaceId, paperId).first<{ opened_at: string | null }>();
    await DB.prepare(
      `INSERT INTO paper_delivery_state (id, space_id, paper_id, opened_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET opened_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), spaceId, paperId).run();
    await recordPassiveEngagement(DB, {
      spaceId, paperId, kind: previous?.opened_at ? "revisit" : "detail_open",
      eventKey: body.eventKey, context: body.context || "paper_detail",
    });
    return NextResponse.json({ ok: true, state: "seen" });
  }

  if (["engaged_view", "detail_dwell", "original_click", "share", "ask_pi"].includes(kind)) {
    const engagement = await recordPassiveEngagement(DB, {
      spaceId, paperId, kind: kind as PassiveEngagementKind,
      eventKey: body.eventKey, dwellMs: body.dwellMs, context: body.context,
    });
    return NextResponse.json({ ok: true, state: "observed", engagement });
  }

  if (kind === "later") {
    const snoozedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await DB.prepare(
      `INSERT INTO paper_delivery_state (id, space_id, paper_id, snoozed_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET snoozed_until = excluded.snoozed_until, updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), spaceId, paperId, snoozedUntil).run();
    await addResearchTrackSignal(DB, spaceId, paperId, 1);
    await recordRecommendationFeedbackOutcome(DB, { spaceId, paperId, kind, value: true });
    return NextResponse.json({ ok: true, state: "snoozed", snoozedUntil, effect: feedbackEffect(kind, true, null) });
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
    ...(reasonCode === "duplicate_known" && body.value ? [DB.prepare(
      `INSERT INTO paper_reading_progress (id, space_id, paper_id, status, note, completed_at)
       VALUES (?, ?, ?, 'mastered', '', CURRENT_TIMESTAMP)
       ON CONFLICT(space_id, paper_id) DO UPDATE SET status = 'mastered',
        note = paper_reading_progress.note, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), spaceId, paperId)] : []),
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
    await recordRecommendationFeedbackOutcome(DB, { spaceId, paperId, kind, value: body.value, reasonCode });
  }

  return NextResponse.json({
    ok: true,
    state: body.value ? kind === "not_relevant" ? "dismissed" : "accepted" : "pending",
    effect: feedbackEffect(kind, body.value, reasonCode),
  });
}
