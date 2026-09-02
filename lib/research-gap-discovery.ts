import { researchProblemDiscoveryQuery } from "./research-problem.ts";

export type ResearchGapDiscoveryOrigin = "direction" | "synthesis" | "problem";
export type ResearchGapDiscoveryPurpose = "route" | "learning";
export type ResearchGapDiscoveryStatus = "pending" | "running" | "retryable" | "ready" | "empty" | "degraded" | "superseded";
export type ResearchGapDiscoveryClaimMode = "due" | "stalled";

export type ResearchGapDiscoveryClaim = {
  id: string;
  spaceId: string;
  trackId: string;
  ownerUserId: string;
  origin: ResearchGapDiscoveryOrigin;
  purpose: ResearchGapDiscoveryPurpose;
  signalRevision: string;
  queryText: string;
  attemptCount: number;
  lockToken: string;
};

type ClaimRow = {
  id: string;
  space_id: string;
  track_id: string;
  owner_user_id: string;
  origin: string;
  purpose: string;
  signal_revision: string;
  query_text: string;
  attempt_count: number;
};

export const RESEARCH_GAP_DISCOVERY_MAX_ATTEMPTS = 3;
export const RESEARCH_GAP_DISCOVERY_LEASE_MS = 2 * 60_000;

export function safeAutomaticResearchGapQuery(value: unknown) {
  const query = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  return /^[\x20-\x7E]{4,240}$/.test(query) && !/\b(?:AND|OR|NOT)\b/.test(query) ? query : "";
}

export function researchGapDiscoveryRetryAt(attemptCount: number, now = new Date()) {
  const delays = [15 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
  return new Date(now.getTime() + delays[Math.min(Math.max(1, attemptCount), delays.length) - 1]).toISOString();
}

export async function researchGapDiscoverySignalRevision(input: {
  origin: ResearchGapDiscoveryOrigin;
  purpose?: ResearchGapDiscoveryPurpose;
  sourceRevision: string;
  queryText: string;
}) {
  const stable = JSON.stringify({
    origin: input.origin,
    purpose: input.purpose || "route",
    sourceRevision: input.sourceRevision.trim(),
    queryText: safeAutomaticResearchGapQuery(input.queryText).toLocaleLowerCase(),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function enqueueResearchGapDiscovery(database: D1Database, input: {
  spaceId: string;
  trackId: string;
  origin: ResearchGapDiscoveryOrigin;
  purpose?: ResearchGapDiscoveryPurpose;
  sourceRevision: string;
  queryText: string;
}) {
  const queryText = safeAutomaticResearchGapQuery(input.queryText);
  if (!queryText || !input.sourceRevision.trim()) return { queued: false, reason: "unsafe_or_unversioned" as const };
  const signalRevision = await researchGapDiscoverySignalRevision({
    origin: input.origin,
    purpose: input.purpose,
    sourceRevision: input.sourceRevision,
    queryText,
  });
  const existing = await database.prepare(
    "SELECT id, status FROM research_gap_discovery_jobs WHERE space_id = ? AND track_id = ? AND purpose = ? AND signal_revision = ? LIMIT 1",
  ).bind(input.spaceId, input.trackId, input.purpose || "route", signalRevision).first<{ id: string; status: string }>();
  if (existing) return { queued: false, reason: "already_recorded" as const, id: existing.id, signalRevision };

  const id = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  await database.batch([
    database.prepare(
      `UPDATE research_gap_discovery_jobs SET status = 'superseded', completed_at = CURRENT_TIMESTAMP,
        lock_token = NULL, lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE space_id = ? AND track_id = ? AND purpose = ? AND status IN ('pending', 'retryable')`,
    ).bind(input.spaceId, input.trackId, input.purpose || "route"),
    database.prepare(
      `INSERT OR IGNORE INTO research_gap_discovery_jobs
       (id, space_id, track_id, purpose, origin, signal_revision, query_text, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    ).bind(id, input.spaceId, input.trackId, input.purpose || "route", input.origin, signalRevision, queryText),
    database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date = ?").bind(input.spaceId, today),
  ]);
  return { queued: true, id, signalRevision };
}

export async function materializeStoredDirectionGapDiscovery(database: D1Database) {
  const problems = await database.prepare(
    `SELECT problem.id, problem.space_id, problem.track_id, problem.updated_at,
      COALESCE(synthesis.input_revision, '') AS synthesis_revision,
      COALESCE((SELECT assessment.input_revision FROM research_problem_assessments assessment
       WHERE assessment.problem_id = problem.id ORDER BY assessment.created_at DESC, assessment.rowid DESC LIMIT 1), '') AS assessment_revision,
      COALESCE((SELECT assessment.next_search_query FROM research_problem_assessments assessment
       WHERE assessment.problem_id = problem.id ORDER BY assessment.created_at DESC, assessment.rowid DESC LIMIT 1), '') AS next_search_query
     FROM research_problems problem
     JOIN research_tracks track ON track.id = problem.track_id AND track.space_id = problem.space_id
     JOIN research_spaces space ON space.id = problem.space_id
     JOIN monitor_runs run ON run.space_id = problem.space_id
     LEFT JOIN research_syntheses synthesis ON synthesis.space_id = problem.space_id AND synthesis.track_id = problem.track_id
     WHERE problem.status = 'active' AND track.build_status IN ('ready', 'partial')
      AND COALESCE(track.monitoring_status, 'active') = 'active'
      AND space.owner_user_id LIKE 'anonymous:%' AND run.automation_paused_at IS NULL
      AND run.last_user_activity_at IS NOT NULL AND datetime(run.last_user_activity_at) > datetime('now', '-7 days')
      AND NOT EXISTS (SELECT 1 FROM research_gap_discovery_jobs job WHERE job.track_id = track.id AND job.purpose = 'route')
     ORDER BY datetime(run.last_user_activity_at) DESC, datetime(problem.updated_at) DESC LIMIT 3`,
  ).all<{ id: string; space_id: string; track_id: string; updated_at: string; synthesis_revision: string; assessment_revision: string; next_search_query: string }>();
  for (const problem of problems.results) {
    const hypotheses = await database.prepare(
      `SELECT id, statement, status, updated_at FROM research_problem_hypotheses
       WHERE problem_id = ? ORDER BY position`,
    ).bind(problem.id).all<{ id: string; statement: string; status: string; updated_at: string }>();
    const queryText = await researchProblemDiscoveryQuery({
      problemStatus: "active",
      problemUpdatedAt: problem.updated_at,
      synthesisRevision: problem.synthesis_revision,
      hypotheses: hypotheses.results.map((item) => ({
        id: item.id,
        statement: item.statement,
        status: item.status,
        updatedAt: item.updated_at,
      })),
      assessmentInputRevision: problem.assessment_revision,
      nextSearchQuery: problem.next_search_query,
    });
    if (!queryText) continue;
    return enqueueResearchGapDiscovery(database, {
      spaceId: problem.space_id,
      trackId: problem.track_id,
      origin: "problem",
      sourceRevision: problem.assessment_revision,
      queryText,
    });
  }
  const rows = await database.prepare(
    `SELECT track.id, track.space_id, track.intelligence_json, track.intelligence_updated_at
     FROM research_tracks track
     JOIN research_spaces space ON space.id = track.space_id
     JOIN monitor_runs run ON run.space_id = track.space_id
     WHERE track.intelligence_status = 'ready' AND track.intelligence_updated_at IS NOT NULL
      AND track.intelligence_json != '{}' AND track.build_status IN ('ready', 'partial')
      AND COALESCE(track.monitoring_status, 'active') = 'active'
      AND space.owner_user_id LIKE 'anonymous:%' AND run.automation_paused_at IS NULL
      AND run.last_user_activity_at IS NOT NULL AND datetime(run.last_user_activity_at) > datetime('now', '-7 days')
      AND NOT EXISTS (SELECT 1 FROM research_gap_discovery_jobs job WHERE job.track_id = track.id AND job.purpose = 'route')
     ORDER BY datetime(run.last_user_activity_at) DESC, datetime(track.intelligence_updated_at) DESC LIMIT 3`,
  ).all<{ id: string; space_id: string; intelligence_json: string; intelligence_updated_at: string }>();
  for (const row of rows.results) {
    let queryText = "";
    try {
      queryText = safeAutomaticResearchGapQuery((JSON.parse(row.intelligence_json) as { nextSearchQuery?: unknown }).nextSearchQuery);
    } catch { /* malformed legacy intelligence is not actionable */ }
    if (!queryText) continue;
    return enqueueResearchGapDiscovery(database, {
      spaceId: row.space_id,
      trackId: row.id,
      origin: "direction",
      sourceRevision: row.intelligence_updated_at,
      queryText,
    });
  }
  return { queued: false, reason: "none_due" as const };
}

export async function claimResearchGapDiscovery(
  database: D1Database,
  now = new Date(),
  unboundedRetries = false,
  mode: ResearchGapDiscoveryClaimMode = "due",
): Promise<ResearchGapDiscoveryClaim | null> {
  for (let raceAttempt = 0; raceAttempt < 3; raceAttempt += 1) {
    const eligibility = mode === "stalled"
      ? "job.status = 'running' AND (job.lock_expires_at IS NULL OR datetime(job.lock_expires_at) <= CURRENT_TIMESTAMP)"
      : `job.status = 'pending'
         OR (job.status = 'retryable' AND (job.next_retry_at IS NULL OR datetime(job.next_retry_at) <= CURRENT_TIMESTAMP))`;
    const ordering = mode === "stalled"
      ? "datetime(COALESCE(job.lock_expires_at, job.created_at)) ASC, datetime(job.created_at) ASC, job.id ASC"
      : "datetime(COALESCE(job.next_retry_at, job.created_at)) ASC, datetime(job.created_at) ASC, job.id ASC";
    const claim = database.prepare(
      `SELECT job.id, job.space_id, job.track_id, job.purpose, job.origin, job.signal_revision, job.query_text,
        job.attempt_count, space.owner_user_id
       FROM research_gap_discovery_jobs job
       JOIN research_tracks track ON track.id = job.track_id AND track.space_id = job.space_id
       JOIN research_spaces space ON space.id = job.space_id
       JOIN monitor_runs run ON run.space_id = job.space_id
       WHERE ${mode === "due" && !unboundedRetries ? "job.attempt_count < ? AND" : ""} (${eligibility})
        AND track.build_status IN ('ready', 'partial') AND COALESCE(track.monitoring_status, 'active') = 'active'
        AND space.owner_user_id LIKE 'anonymous:%' AND run.automation_paused_at IS NULL
        AND run.last_user_activity_at IS NOT NULL AND datetime(run.last_user_activity_at) > datetime('now', '-7 days')
       ORDER BY ${ordering} LIMIT 1`,
    );
    const row = await (mode === "due" && !unboundedRetries
      ? claim.bind(RESEARCH_GAP_DISCOVERY_MAX_ATTEMPTS).first<ClaimRow>()
      : claim.first<ClaimRow>());
    if (!row) return null;
    const lockToken = crypto.randomUUID();
    const lockExpiresAt = new Date(now.getTime() + RESEARCH_GAP_DISCOVERY_LEASE_MS).toISOString();
    const claimed = await database.prepare(
      `UPDATE research_gap_discovery_jobs SET status = 'running', attempt_count = attempt_count + 1,
        error = NULL, next_retry_at = NULL, lock_token = ?, lock_expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND (${mode === "stalled"
    ? "status = 'running' AND (lock_expires_at IS NULL OR datetime(lock_expires_at) <= CURRENT_TIMESTAMP)"
    : `status = 'pending'
        OR (status = 'retryable' AND (next_retry_at IS NULL OR datetime(next_retry_at) <= CURRENT_TIMESTAMP))`})`,
    ).bind(lockToken, lockExpiresAt, row.id).run();
    if (Number(claimed.meta?.changes || 0)) return {
      id: row.id,
      spaceId: row.space_id,
      trackId: row.track_id,
      ownerUserId: row.owner_user_id,
      purpose: row.purpose === "learning" ? "learning" : "route",
      origin: row.origin === "problem" || row.origin === "synthesis" ? row.origin : "direction",
      signalRevision: row.signal_revision,
      queryText: row.query_text,
      attemptCount: Math.max(0, row.attempt_count || 0) + 1,
      lockToken,
    };
  }
  return null;
}

export async function completeResearchGapDiscovery(database: D1Database, input: {
  id: string;
  lockToken: string;
  degraded: boolean;
  discoveredCount?: number;
  queuedCount: number;
  sourceStatuses: unknown[];
  error?: string;
  now?: Date;
  unboundedRetries?: boolean;
}) {
  const current = await database.prepare(
    "SELECT attempt_count FROM research_gap_discovery_jobs WHERE id = ? AND status = 'running' AND lock_token = ? LIMIT 1",
  ).bind(input.id, input.lockToken).first<{ attempt_count: number }>();
  if (!current) return { changed: 0, status: "superseded" as const, retryAt: null };
  const discoveredCount = Math.max(0, Math.floor(input.discoveredCount ?? input.queuedCount ?? 0));
  const noCandidates = !input.degraded && discoveredCount === 0;
  const retryAllowed = Boolean(input.unboundedRetries) || current.attempt_count < RESEARCH_GAP_DISCOVERY_MAX_ATTEMPTS;
  const status: ResearchGapDiscoveryStatus = input.degraded
    ? retryAllowed ? "retryable" : "degraded"
    : noCandidates
      ? retryAllowed ? "retryable" : "empty"
      : "ready";
  const retryAt = status === "retryable" ? researchGapDiscoveryRetryAt(current.attempt_count, input.now || new Date()) : null;
  const error = input.error?.slice(0, 300) || (noCandidates ? "no_candidates" : null);
  const result = await database.prepare(
    `UPDATE research_gap_discovery_jobs SET status = ?, queued_count = queued_count + ?,
      source_status_json = ?, error = ?, next_retry_at = ?, completed_at = CASE WHEN ? IN ('ready', 'empty', 'degraded') THEN CURRENT_TIMESTAMP ELSE NULL END,
      lock_token = NULL, lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'running' AND lock_token = ?`,
  ).bind(status, Math.max(0, Math.floor(input.queuedCount || 0)), JSON.stringify(input.sourceStatuses || []),
    error, retryAt, status, input.id, input.lockToken).run();
  return { changed: Number(result.meta?.changes || 0), status, retryAt };
}

/**
 * A successful retrieval is not the end of a learning-gap search when every
 * candidate later fails the shared quality gate. Reopen the same durable job
 * so its next attempt can rotate provider pages without deleting the rejected
 * candidates or their audits. Production remains bounded; development can keep
 * exploring indefinitely through the existing unbounded policy.
 */
export async function continueResearchGapDiscoveryAfterQualityShortfall(database: D1Database, input: {
  id: string;
  now?: Date;
  unboundedRetries?: boolean;
}) {
  const current = await database.prepare(
    "SELECT attempt_count FROM research_gap_discovery_jobs WHERE id = ? AND purpose = 'learning' AND status = 'ready' LIMIT 1",
  ).bind(input.id).first<{ attempt_count: number }>();
  if (!current) return { changed: 0, status: "superseded" as const, retryAt: null };
  const retryAllowed = Boolean(input.unboundedRetries) || current.attempt_count < RESEARCH_GAP_DISCOVERY_MAX_ATTEMPTS;
  const status: ResearchGapDiscoveryStatus = retryAllowed ? "retryable" : "empty";
  const retryAt = status === "retryable" ? researchGapDiscoveryRetryAt(current.attempt_count, input.now || new Date()) : null;
  const result = await database.prepare(
    `UPDATE research_gap_discovery_jobs SET status = ?, error = 'quality_gate_no_match', next_retry_at = ?,
      completed_at = CASE WHEN ? = 'empty' THEN CURRENT_TIMESTAMP ELSE NULL END,
      lock_token = NULL, lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND purpose = 'learning' AND status = 'ready'`,
  ).bind(status, retryAt, status, input.id).run();
  return { changed: Number(result.meta?.changes || 0), status, retryAt };
}

export async function supersedeResearchGapDiscovery(database: D1Database, input: { id: string; lockToken: string; error?: string }) {
  const result = await database.prepare(
    `UPDATE research_gap_discovery_jobs SET status = 'superseded', error = ?, next_retry_at = NULL,
      completed_at = CURRENT_TIMESTAMP, lock_token = NULL, lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'running' AND lock_token = ?`,
  ).bind(input.error?.slice(0, 300) || "signal_superseded", input.id, input.lockToken).run();
  return Number(result.meta?.changes || 0);
}

export async function settleMatchingResearchGapDiscoveries(database: D1Database, input: {
  spaceId: string;
  trackId: string;
  queryText: string;
  degraded: boolean;
  discoveredCount?: number;
  queuedCount: number;
  sourceStatuses: unknown[];
}) {
  const queryText = safeAutomaticResearchGapQuery(input.queryText);
  if (!queryText) return 0;
  const noCandidates = !input.degraded && Math.max(0, Math.floor(input.discoveredCount ?? input.queuedCount ?? 0)) === 0;
  const status = input.degraded || noCandidates ? "retryable" : "ready";
  const retryAt = status === "retryable" ? researchGapDiscoveryRetryAt(1) : null;
  const result = await database.prepare(
    `UPDATE research_gap_discovery_jobs SET status = ?, queued_count = queued_count + ?,
      source_status_json = ?, error = CASE WHEN ? = 1 THEN 'source_unavailable' WHEN ? = 1 THEN 'no_candidates' ELSE NULL END,
      next_retry_at = ?, completed_at = CASE WHEN ? = 'ready' THEN CURRENT_TIMESTAMP ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
     WHERE space_id = ? AND track_id = ? AND purpose = 'route' AND query_text = ? AND status IN ('pending', 'retryable')`,
  ).bind(status, Math.max(0, Math.floor(input.queuedCount || 0)), JSON.stringify(input.sourceStatuses || []),
    input.degraded ? 1 : 0, noCandidates ? 1 : 0, retryAt, status, input.spaceId, input.trackId, queryText).run();
  return Number(result.meta?.changes || 0);
}
