/** Durable rotation for current learning paths; it does not create new paths or scans. */
export const LEARNING_STAGE_ELIGIBLE_SQL = `SELECT p.id AS path_id, p.space_id, s.owner_user_id
  FROM learning_paths p JOIN research_spaces s ON s.id = p.space_id
  JOIN monitor_runs r ON r.space_id = p.space_id
  WHERE p.status NOT IN ('completed', 'superseded') AND s.owner_user_id LIKE 'anonymous:%'
    AND r.automation_paused_at IS NULL AND datetime(r.last_user_activity_at) > datetime('now', '-7 days')
    AND EXISTS (SELECT 1 FROM learning_path_steps step WHERE step.path_id = p.id AND step.status != 'completed')`;

export async function runLearningStageScheduler(options: {
  database: D1Database;
  dispatch: (item: { spaceId: string; pathId: string; workspaceId: string }) => Promise<{ ok: boolean; status?: string }>;
  now?: number;
}) {
  const { database, dispatch } = options;
  const now = options.now ?? Date.now();
  await database.prepare(`INSERT OR IGNORE INTO learning_stage_dispatches (path_id, space_id)
    SELECT path_id, space_id FROM (${LEARNING_STAGE_ELIGIBLE_SQL})`).run();
  const due = await database.prepare(`SELECT d.path_id, d.space_id, e.owner_user_id
    FROM learning_stage_dispatches d JOIN (${LEARNING_STAGE_ELIGIBLE_SQL}) e ON e.path_id = d.path_id AND e.space_id = d.space_id
    WHERE d.next_at <= ? AND d.lease_until <= ? ORDER BY d.next_at, d.path_id LIMIT 1`)
    .bind(now, now).first<{ path_id: string; space_id: string; owner_user_id: string }>();
  if (!due) return { attempted: false, status: "idle" };
  const token = crypto.randomUUID();
  const claimed = await database.prepare(`UPDATE learning_stage_dispatches SET lock_token = ?, lease_until = ?, status = 'running', updated_at = ?
    WHERE path_id = ? AND space_id = ? AND lease_until <= ? AND next_at <= ?`)
    .bind(token, now + 180_000, new Date(now).toISOString(), due.path_id, due.space_id, now, now).run();
  if (!claimed.meta.changes) return { attempted: false, status: "busy" };
  let status = "retryable";
  try {
    const result = await dispatch({ spaceId: due.space_id, pathId: due.path_id, workspaceId: due.owner_user_id.slice("anonymous:".length) });
    if (result.ok && ["attached", "empty", "valid", "waiting", "stale", "unconfigured", "invalid", "retryable"].includes(result.status || "")) status = result.status!;
  } catch { /* Preserve a retryable state, never raw model responses or headers. */ }
  const delay = status === "attached" || status === "valid" ? 30_000 : status === "retryable" || status === "invalid" ? 300_000 : 600_000;
  const saved = await database.prepare(`UPDATE learning_stage_dispatches SET status = ?, next_at = ?, lease_until = 0, lock_token = NULL, updated_at = ?
    WHERE path_id = ? AND space_id = ? AND lock_token = ?`)
    .bind(status, now + delay, new Date(now).toISOString(), due.path_id, due.space_id, token).run();
  return { attempted: true, status: saved.meta.changes ? status : "stale", spaceId: due.space_id, pathId: due.path_id };
}
