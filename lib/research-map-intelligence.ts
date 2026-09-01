export type ResearchTrackIntelligenceStatus = "pending" | "running" | "retryable" | "ready";

export type ResearchTrackIntelligenceClaim = {
  trackId: string;
  lockToken: string;
  attemptCount: number;
};

type ClaimRow = {
  id: string;
  intelligence_attempt_count: number;
};

export const RESEARCH_TRACK_INTELLIGENCE_LEASE_MS = 42_000;

export function defensiveResearchTrackIntelligenceStatus(value: unknown, hasStoredIntelligence: boolean): ResearchTrackIntelligenceStatus {
  if (value === "ready") return hasStoredIntelligence ? "ready" : "pending";
  if (value === "running" || value === "retryable" || value === "pending") return value;
  return hasStoredIntelligence ? "ready" : "pending";
}

export function researchTrackIntelligenceRetryAt(attemptCount: number, now = new Date()) {
  const delays = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];
  const delay = delays[Math.min(Math.max(1, attemptCount), delays.length) - 1];
  return new Date(now.getTime() + delay).toISOString();
}

export async function requestResearchTrackIntelligenceRefresh(
  database: D1Database,
  spaceId: string,
  trackId: string,
  now = new Date(),
) {
  const timestamp = now.toISOString();
  const result = await database.prepare(
    `UPDATE research_tracks
     SET intelligence_status = 'pending', intelligence_attempt_count = 0,
      intelligence_error = NULL, intelligence_retry_at = NULL,
      intelligence_lock_token = NULL, intelligence_lock_expires_at = NULL,
      intelligence_refresh_requested_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND space_id = ?
      AND COALESCE(monitoring_status, 'active') = 'active'
      AND (intelligence_status <> 'running' OR intelligence_lock_expires_at IS NULL OR intelligence_lock_expires_at <= ?)
      AND EXISTS (
       SELECT 1 FROM research_track_papers tp
       WHERE tp.track_id = research_tracks.id AND tp.space_id = research_tracks.space_id
        AND tp.curation_status = 'active'
      )`,
  ).bind(timestamp, trackId, spaceId, timestamp).run();
  return Number(result.meta?.changes || 0);
}

export async function claimResearchTrackIntelligence(
  database: D1Database,
  spaceId: string,
  input: { preferredTrackId?: string; now?: Date } = {},
): Promise<ResearchTrackIntelligenceClaim | null> {
  const now = input.now || new Date();
  const nowIso = now.toISOString();
  const preferredTrackId = input.preferredTrackId?.trim() || null;

  for (let raceAttempt = 0; raceAttempt < 3; raceAttempt += 1) {
    const row = await database.prepare(
      `SELECT rt.id, rt.intelligence_attempt_count
       FROM research_tracks rt
       WHERE rt.space_id = ? AND rt.build_status IN ('ready', 'partial')
        AND COALESCE(rt.monitoring_status, 'active') = 'active'
        AND (? IS NULL OR rt.id = ?)
        AND EXISTS (
         SELECT 1 FROM research_track_papers tp
         WHERE tp.track_id = rt.id AND tp.space_id = rt.space_id AND tp.curation_status = 'active'
        )
        AND (
         rt.intelligence_status = 'pending'
         OR (rt.intelligence_status = 'ready' AND (rt.intelligence_updated_at IS NULL OR rt.intelligence_json = '{}'))
         OR (rt.intelligence_status = 'retryable' AND (rt.intelligence_retry_at IS NULL OR rt.intelligence_retry_at <= ?))
         OR (rt.intelligence_status = 'running' AND (rt.intelligence_lock_expires_at IS NULL OR rt.intelligence_lock_expires_at <= ?))
        )
       ORDER BY CASE rt.user_role WHEN 'core' THEN 0 WHEN 'support' THEN 1 ELSE 2 END,
        rt.position, rt.updated_at
       LIMIT 1`,
    ).bind(spaceId, preferredTrackId, preferredTrackId, nowIso, nowIso).first<ClaimRow>();
    if (!row) return null;

    const lockToken = crypto.randomUUID();
    const lockExpiresAt = new Date(now.getTime() + RESEARCH_TRACK_INTELLIGENCE_LEASE_MS).toISOString();
    const claimed = await database.prepare(
      `UPDATE research_tracks
       SET intelligence_status = 'running',
        intelligence_attempt_count = intelligence_attempt_count + 1,
        intelligence_error = NULL, intelligence_retry_at = NULL,
        intelligence_lock_token = ?, intelligence_lock_expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND space_id = ?
        AND (
         intelligence_status = 'pending'
         OR (intelligence_status = 'ready' AND (intelligence_updated_at IS NULL OR intelligence_json = '{}'))
         OR (intelligence_status = 'retryable' AND (intelligence_retry_at IS NULL OR intelligence_retry_at <= ?))
         OR (intelligence_status = 'running' AND (intelligence_lock_expires_at IS NULL OR intelligence_lock_expires_at <= ?))
        )`,
    ).bind(lockToken, lockExpiresAt, row.id, spaceId, nowIso, nowIso).run();
    if (Number(claimed.meta?.changes || 0) > 0) {
      return { trackId: row.id, lockToken, attemptCount: Math.max(0, row.intelligence_attempt_count || 0) + 1 };
    }
  }
  return null;
}

export async function completeResearchTrackIntelligence(
  database: D1Database,
  input: { spaceId: string; trackId: string; lockToken: string; intelligenceJson: string; model: string },
) {
  const result = await database.prepare(
    `UPDATE research_tracks
     SET intelligence_json = ?, intelligence_model = ?, intelligence_updated_at = CURRENT_TIMESTAMP,
      intelligence_status = 'ready', intelligence_error = NULL, intelligence_retry_at = NULL,
      intelligence_lock_token = NULL, intelligence_lock_expires_at = NULL,
      intelligence_refresh_requested_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND space_id = ? AND intelligence_status = 'running' AND intelligence_lock_token = ?`,
  ).bind(input.intelligenceJson, input.model, input.trackId, input.spaceId, input.lockToken).run();
  return Number(result.meta?.changes || 0);
}

export async function deferResearchTrackIntelligence(
  database: D1Database,
  input: { spaceId: string; trackId: string; lockToken: string; attemptCount: number; errorCode: string; now?: Date },
) {
  const retryAt = researchTrackIntelligenceRetryAt(input.attemptCount, input.now || new Date());
  const result = await database.prepare(
    `UPDATE research_tracks
     SET intelligence_status = 'retryable', intelligence_error = ?, intelligence_retry_at = ?,
      intelligence_lock_token = NULL, intelligence_lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND space_id = ? AND intelligence_status = 'running' AND intelligence_lock_token = ?`,
  ).bind(input.errorCode.slice(0, 120), retryAt, input.trackId, input.spaceId, input.lockToken).run();
  return { changed: Number(result.meta?.changes || 0), retryAt };
}
