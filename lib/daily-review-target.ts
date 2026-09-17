export const DAILY_DEEP_REVIEW_TARGET = 5;
export const DAILY_DISCOVERY_ROUND_LIMIT = 4;
export const DAILY_TOPUP_INTERVAL_MS = 30 * 60 * 1000;

export const DAILY_REVIEW_PROGRESS_SQL = `SELECT
 (SELECT COUNT(DISTINCT value) FROM monitor_reliability_events e,
   json_each(e.metadata_json, '$.canonicalIds')
   WHERE e.space_id=? AND e.kind='daily_deep_review_completed'
   AND date(e.created_at,'+8 hours')=?) AS completed,
 (SELECT COUNT(*) FROM monitor_scan_jobs j WHERE j.space_id=?
   AND date(j.started_at,'+8 hours')=? AND COALESCE(j.resume_of_job_id,'')=''
   AND COALESCE(json_extract(j.work_queue_json,'$.scanMode'),'full')!='quality_queue') AS discoveryRounds`;

export type DailyReviewProgress = { completed: number; discoveryRounds: number; target: number };
export async function readDailyReviewProgress(db: D1Database, spaceId: string, now: number): Promise<DailyReviewProgress> {
  const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const row = await db.prepare(DAILY_REVIEW_PROGRESS_SQL).bind(spaceId, day, spaceId, day)
    .first<{ completed: number; discoveryRounds: number }>();
  return { completed: row?.completed || 0, discoveryRounds: row?.discoveryRounds || 0, target: DAILY_DEEP_REVIEW_TARGET };
}

export function needsDailyReviewTopup(progress: DailyReviewProgress) {
  return progress.completed < progress.target && progress.discoveryRounds < DAILY_DISCOVERY_ROUND_LIMIT;
}

export function dailyReviewTopupDue(progress: DailyReviewProgress, now: number, lastSourceScanAt: string | null, nextRunAt: string | null) {
  const parse = (value: string | null) => value ? Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value.replace(' ', 'T') + 'Z') : NaN;
  const last = parse(lastSourceScanAt), next = parse(nextRunAt);
  return needsDailyReviewTopup(progress) && Number.isFinite(last)
    && now - last >= DAILY_TOPUP_INTERVAL_MS && (!Number.isFinite(next) || next <= now);
}
