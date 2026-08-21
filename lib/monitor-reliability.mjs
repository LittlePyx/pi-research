function timestamp(value) {
  if (!value) return Number.NaN;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return Date.parse(normalized);
}

export function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const bounded = Math.max(0, Math.min(1, ratio));
  const rank = Math.ceil(bounded * sorted.length) - 1;
  return sorted[Math.max(0, rank)];
}

export function buildReliabilityProgram(input) {
  const now = input.now ?? Date.now();
  const ordered = [...input.jobs].sort((left, right) => timestamp(right.startedAt) - timestamp(left.startedAt));
  const terminal = ordered.filter((job) => job.status === "ready" || job.status === "error");
  const succeeded = terminal.filter((job) => job.status === "ready");
  const failed = terminal.filter((job) => job.status === "error");
  const active = ordered.filter((job) => job.status !== "ready" && job.status !== "error");
  const durations = terminal.flatMap((job) => {
    const started = timestamp(job.startedAt);
    const completed = timestamp(job.completedAt);
    return Number.isFinite(started) && Number.isFinite(completed) && completed >= started ? [completed - started] : [];
  });
  const firstRecommendationTimes = ordered.flatMap((job) => {
    const started = timestamp(job.startedAt);
    const first = timestamp(job.firstRecommendationAt);
    return Number.isFinite(started) && Number.isFinite(first) && first >= started ? [first - started] : [];
  });
  const successRate = terminal.length ? Math.round(succeeded.length / terminal.length * 100) : 0;
  const zeroRecommendationRuns = succeeded.filter((job) => job.recommendedCount === 0).length;
  let consecutiveZeroRecommendationRuns = 0;
  for (const job of ordered) {
    if (job.status !== "ready") continue;
    if (job.recommendedCount > 0) break;
    consecutiveZeroRecommendationRuns += 1;
  }
  const staleActiveJobs = active.filter((job) => {
    const started = timestamp(job.startedAt);
    return Number.isFinite(started) && now - started > 20 * 60 * 1000;
  }).length;
  const labels = input.calibration.labels;
  const acceptanceRate = labels ? Math.round(input.calibration.accepted / labels * 100) : 0;
  const sourceFailureCount = input.sourceFailures.reduce((sum, source) => sum + source.failures, 0);
  const alerts = [];

  if (staleActiveJobs) alerts.push({
    code: "stale_scan",
    severity: "critical",
    titleZh: "扫描任务失去心跳",
    titleEn: "Scan heartbeat is stale",
    detailZh: `${staleActiveJobs} 个扫描任务运行超过 20 分钟仍未进入可恢复的终态。`,
    detailEn: `${staleActiveJobs} scan job(s) have remained active for more than 20 minutes without reaching a recoverable terminal state.`,
  });
  if (terminal.length >= 3 && successRate < 95) alerts.push({
    code: "scan_reliability",
    severity: successRate < 80 ? "critical" : "warning",
    titleZh: "扫描成功率低于目标",
    titleEn: "Scan success rate is below target",
    detailZh: `近 14 天成功率 ${successRate}%，目标不低于 95%。`,
    detailEn: `The 14-day success rate is ${successRate}%; the target is at least 95%.`,
  });
  if (consecutiveZeroRecommendationRuns >= 2) alerts.push({
    code: "zero_recommendation_streak",
    severity: "warning",
    titleZh: "连续扫描没有形成推荐",
    titleEn: "Consecutive scans yielded no recommendation",
    detailZh: `已连续 ${consecutiveZeroRecommendationRuns} 次完成扫描但没有论文通过质量门槛，应检查路线覆盖、摘要证据和阈值校准。`,
    detailEn: `${consecutiveZeroRecommendationRuns} completed scans yielded no paper above the quality gate; review route coverage, abstract evidence, and calibration.`,
  });
  if (sourceFailureCount) alerts.push({
    code: "source_degradation",
    severity: "warning",
    titleZh: "部分论文来源正在降级",
    titleEn: "Some literature sources are degraded",
    detailZh: `近 14 天记录到 ${sourceFailureCount} 次来源失败；备用来源仍应维持扫描完成。`,
    detailEn: `${sourceFailureCount} source failure(s) were recorded in 14 days; fallback sources should keep scans completing.`,
  });
  if (labels < 10) alerts.push({
    code: "insufficient_quality_labels",
    severity: "info",
    titleZh: "真实质量样本仍不足",
    titleEn: "Not enough real quality labels yet",
    detailZh: `目前只有 ${labels} 个明确结果标签，至少积累 10 个后再判断个性化推荐是否稳定改善。`,
    detailEn: `Only ${labels} explicit outcome label(s) are available; collect at least 10 before judging whether personalization is improving reliably.`,
  });

  return {
    periodDays: 14,
    targets: {
      scanSuccessRate: 95,
      p95ScanMinutes: 5,
      p50FirstRecommendationSeconds: 90,
      minimumOutcomeLabels: 10,
      consecutiveZeroRecommendationLimit: 1,
    },
    actual: {
      attempts: terminal.length,
      succeeded: succeeded.length,
      failed: failed.length,
      active: active.length,
      resumed: ordered.filter((job) => Boolean(job.resumeOfJobId)).length,
      successRate,
      p50DurationMs: percentile(durations, 0.5),
      p95DurationMs: percentile(durations, 0.95),
      p50FirstRecommendationMs: percentile(firstRecommendationTimes, 0.5),
      p95FirstRecommendationMs: percentile(firstRecommendationTimes, 0.95),
      zeroRecommendationRuns,
      consecutiveZeroRecommendationRuns,
      staleActiveJobs,
      sourceFailureCount,
    },
    evaluation: {
      ...input.calibration,
      acceptanceRate,
      sampleReady: labels >= 10,
    },
    sources: input.sourceFailures,
    alerts,
  };
}
