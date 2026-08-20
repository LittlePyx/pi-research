export type SemanticScholarQuotaReservation = {
  scope: string;
  limit: number;
};

function normalizedReservations(reservations: SemanticScholarQuotaReservation[]) {
  const unique = new Map<string, number>();
  for (const reservation of reservations) {
    const scope = String(reservation.scope || "").trim();
    const limit = Math.max(1, Math.round(reservation.limit || 0));
    if (scope) unique.set(scope, limit);
  }
  return Array.from(unique, ([scope, limit]) => ({ scope, limit }));
}

/**
 * Atomically reserves one request across every supplied quota layer.
 *
 * The single INSERT...SELECT statement either changes every quota row or no
 * rows. SQLite/D1 serializes the condition check and the UPSERT as one write,
 * so concurrent requests cannot both consume the final shared slot.
 */
export async function reserveSemanticScholarUsage(
  database: D1Database,
  reservations: SemanticScholarQuotaReservation[],
  usageDate: string,
) {
  const quotas = normalizedReservations(reservations);
  if (!quotas.length) return true;
  const values = quotas.map(() => "(?, ?, ?)").join(", ");
  const bindings = quotas.flatMap((quota) => [quota.scope, quota.limit, crypto.randomUUID()]);
  const result = await database.prepare(
    `WITH quota(scope, quota_limit, new_id) AS (VALUES ${values})
     INSERT INTO ai_usage_daily (id, scope, usage_date, request_count, input_tokens, output_tokens)
     SELECT new_id, scope, ?, 1, 0, 0 FROM quota
     WHERE NOT EXISTS (
       SELECT 1 FROM quota required
       JOIN ai_usage_daily existing ON existing.scope = required.scope AND existing.usage_date = ?
       WHERE existing.request_count >= required.quota_limit
     )
     ON CONFLICT(scope, usage_date) DO UPDATE SET
       request_count = ai_usage_daily.request_count + 1,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(...bindings, usageDate, usageDate).run();
  return (result.meta.changes || 0) === quotas.length;
}
