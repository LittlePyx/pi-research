export const NETWORK_DISMISS_REASON_CODE = "network_dismissed";

type NetworkDismissalInput = {
  spaceId: string;
  candidateId: string;
  paperId: string;
  paperTitle: string;
};

type NetworkDismissalReversalInput = {
  spaceId: string;
  candidateId: string;
  paperId: string;
};

/**
 * Builds the complete transactional feedback side of a research-network
 * dismissal. Every follow-up statement is gated on the candidate having
 * reached `dismissed`, so a concurrent acceptance can never be overwritten or
 * leak a negative preference into the daily monitor.
 */
export function researchNetworkDismissalStatements(
  database: D1Database,
  input: NetworkDismissalInput,
) {
  const { spaceId, candidateId, paperId } = input;
  const title = input.paperTitle.trim().slice(0, 420);
  const sourceId = `${paperId}:${NETWORK_DISMISS_REASON_CODE}`;
  const signalExpiresAt = new Date(Date.now() + 730 * 86_400_000).toISOString();
  const dismissedCandidateExists = `EXISTS (
    SELECT 1 FROM research_network_candidates
    WHERE id = ? AND space_id = ? AND status = 'dismissed'
  )`;

  return [
    database.prepare(
      `UPDATE research_network_candidates
       SET status = 'dismissed', last_seen_at = CURRENT_TIMESTAMP
       WHERE id = ? AND space_id = ? AND status <> 'accepted'`,
    ).bind(candidateId, spaceId),
    database.prepare(
      `INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback, reason_code, note)
       SELECT ?, ?, ?, 0, 'not_relevant', ?, ?
       WHERE ${dismissedCandidateExists}
       ON CONFLICT(space_id, paper_id) DO UPDATE SET
        saved = 0, feedback = 'not_relevant', reason_code = excluded.reason_code,
        note = excluded.note, updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      crypto.randomUUID(), spaceId, paperId, NETWORK_DISMISS_REASON_CODE,
      "Dismissed from the research-network discovery view.", candidateId, spaceId,
    ),
    database.prepare(
      `UPDATE research_preference_signals
       SET active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE space_id = ? AND source_type = 'paper_feedback' AND source_id LIKE ?
        AND ${dismissedCandidateExists}`,
    ).bind(spaceId, `${paperId}:%`, candidateId, spaceId),
    database.prepare(
      `INSERT INTO research_preference_signals
       (id, space_id, layer, kind, label_zh, label_en, evidence, confidence, weight,
        source_type, source_id, active, expires_at)
       SELECT ?, ?, 'explicit', 'exclusion', ?, ?, ?, 96, 100,
        'paper_feedback', ?, 1, ?
       WHERE ${dismissedCandidateExists}
       ON CONFLICT(space_id, source_type, source_id, kind, label_en) DO UPDATE SET
        layer = excluded.layer, label_zh = excluded.label_zh, evidence = excluded.evidence,
        confidence = excluded.confidence, weight = excluded.weight, active = 1,
        observed_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at,
        updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      crypto.randomUUID(), spaceId, `排除：${title}`, `Exclude: ${title}`,
      "已在论文网络中忽略 / Dismissed from the research network",
      sourceId, signalExpiresAt, candidateId, spaceId,
    ),
    database.prepare(
      `UPDATE research_tracks
       SET intelligence_status = 'pending', intelligence_attempt_count = 0,
        intelligence_error = NULL, intelligence_retry_at = NULL, intelligence_lock_token = NULL,
        intelligence_lock_expires_at = NULL, intelligence_refresh_requested_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE space_id = ? AND id IN (
        SELECT DISTINCT seed.track_id
        FROM research_network_candidate_edges edge
        JOIN research_track_papers seed ON seed.id = edge.seed_paper_id AND seed.space_id = edge.space_id
        WHERE edge.candidate_id = ? AND edge.space_id = ? AND seed.curation_status = 'active'
       ) AND ${dismissedCandidateExists}`,
    ).bind(spaceId, candidateId, spaceId, candidateId, spaceId),
    database.prepare(
      `DELETE FROM monitor_query_plans
       WHERE space_id = ? AND plan_date = date('now') AND ${dismissedCandidateExists}`,
    ).bind(spaceId, candidateId, spaceId),
  ];
}

/**
 * Reverses only the explicit negative memory created by a graph dismissal.
 * The candidate transition is first in the same batch and every cleanup is
 * gated on that accepted state. This makes both possible D1 serializations of
 * an accept/dismiss race converge on an accepted candidate without a stale
 * Today exclusion.
 */
export function researchNetworkDismissalReversalStatements(
  database: D1Database,
  input: NetworkDismissalReversalInput,
) {
  const { spaceId, candidateId, paperId } = input;
  const acceptedCandidateExists = `EXISTS (
    SELECT 1 FROM research_network_candidates
    WHERE id = ? AND space_id = ? AND status = 'accepted'
  )`;

  return [
    database.prepare(
      `UPDATE research_network_candidates
       SET status = 'accepted', last_seen_at = CURRENT_TIMESTAMP
       WHERE id = ? AND space_id = ?`,
    ).bind(candidateId, spaceId),
    database.prepare(
      `DELETE FROM paper_feedback
       WHERE space_id = ? AND paper_id = ?
        AND feedback = 'not_relevant' AND reason_code = ?
        AND ${acceptedCandidateExists}`,
    ).bind(spaceId, paperId, NETWORK_DISMISS_REASON_CODE, candidateId, spaceId),
    database.prepare(
      `DELETE FROM research_preference_signals
       WHERE space_id = ? AND source_type = 'paper_feedback'
        AND source_id = ? AND kind = 'exclusion'
        AND ${acceptedCandidateExists}`,
    ).bind(spaceId, `${paperId}:${NETWORK_DISMISS_REASON_CODE}`, candidateId, spaceId),
    database.prepare(
      `DELETE FROM monitor_query_plans
       WHERE space_id = ? AND plan_date = date('now') AND ${acceptedCandidateExists}`,
    ).bind(spaceId, candidateId, spaceId),
  ];
}
