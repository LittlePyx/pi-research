export const MONITOR_AUTOMATION_LIMITS = Object.freeze({
  scheduledRunsWithoutActivity: 3,
  inactiveDays: 7,
  dailyRequests: 36,
  dailyTokens: 80_000,
});

export const MONITOR_VISIT_ACTIVITY_HEARTBEAT_MINUTES = 5;

function timestamp(value) {
  if (!value) return Number.NaN;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return Date.parse(normalized);
}

export function monitorAutomationPauseReason(input) {
  const limits = input.limits || MONITOR_AUTOMATION_LIMITS;
  const lastActivityAt = timestamp(input.lastUserActivityAt);
  const inactiveMs = limits.inactiveDays * 86_400_000;
  if (!Number.isFinite(lastActivityAt) || input.now - lastActivityAt >= inactiveMs) {
    return input.scheduledRunsSinceActivity >= limits.scheduledRunsWithoutActivity ? "unattended_runs" : "inactive";
  }
  if (input.dailyRequests >= limits.dailyRequests || input.dailyTokens >= limits.dailyTokens) return "daily_budget";
  return null;
}

export function monitorAutomationPauseCopy(reason) {
  if (reason === "unattended_runs") return {
    zh: "Pi 已在无人打开网页时完成 3 轮扫描，现已待机；下次打开研究空间后恢复。",
    en: "Pi completed three unattended scans and is now on standby. It resumes when this research space is opened again.",
  };
  if (reason === "inactive") return {
    zh: "这个研究空间已 7 天没有访问，自动扫描已待机；下次打开后恢复。",
    en: "This research space has not been visited for seven days. Automatic scanning resumes on the next visit.",
  };
  if (reason === "daily_budget") return {
    zh: "今天的后台智能分析预算已用完；Pi 会在额度刷新后自动继续，无需手动恢复。",
    en: "Today's background analysis budget has been used. Pi resumes automatically after the budget resets; no manual action is needed.",
  };
  if (reason === "model_unavailable") return {
    zh: "后台模型暂不可用，自动扫描已待机；连接可用模型后手动恢复。",
    en: "The background model is unavailable. Connect a working model and resume manually.",
  };
  return { zh: "自动扫描正常运行。", en: "Automatic scanning is active." };
}

/**
 * A browser visit is real user activity. It may resume only pauses caused by
 * absence; budget and model-availability safeguards remain authoritative.
 * The heartbeat is throttled because an active scan polls this endpoint.
 */
export async function recordMonitorVisitActivity(database, spaceId) {
  return database.prepare(
    `UPDATE monitor_runs SET
      last_user_activity_at = CURRENT_TIMESTAMP,
      scheduled_runs_since_activity = 0,
      next_run_at = CASE
       WHEN automation_pause_reason IN ('inactive', 'unattended_runs')
        AND status IN ('idle', 'ready', 'error') THEN CURRENT_TIMESTAMP
       ELSE next_run_at END,
      automation_paused_at = CASE
       WHEN automation_pause_reason IN ('inactive', 'unattended_runs') THEN NULL
       ELSE automation_paused_at END,
      automation_pause_reason = CASE
       WHEN automation_pause_reason IN ('inactive', 'unattended_runs') THEN ''
       ELSE automation_pause_reason END,
      updated_at = CASE
       WHEN automation_pause_reason IN ('inactive', 'unattended_runs') THEN CURRENT_TIMESTAMP
       ELSE updated_at END
     WHERE space_id = ? AND (
      automation_pause_reason IN ('inactive', 'unattended_runs')
      OR last_user_activity_at IS NULL
      OR datetime(last_user_activity_at) <= datetime('now', '-${MONITOR_VISIT_ACTIVITY_HEARTBEAT_MINUTES} minutes')
     )`,
  ).bind(spaceId).run();
}
