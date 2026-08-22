function uniqueText(items) {
  return Array.from(new Set((items || []).filter((item) => typeof item === "string" && item.trim())));
}

export function mergeDailyBriefHistory(existing, incoming) {
  if (!existing?.paperIds?.length) return incoming;

  const order = uniqueText([...existing.paperIds, ...incoming.paperIds]);
  const details = new Map();
  const remember = (brief) => {
    brief.paperIds.forEach((paperId, index) => {
      details.set(paperId, {
        signalZh: brief.signalsZh[index] || "",
        signalEn: brief.signalsEn[index] || "",
        readingZh: brief.readingPlanZh[index] || "",
        readingEn: brief.readingPlanEn[index] || "",
      });
    });
  };
  remember(existing);
  remember(incoming);

  const currentRecommended = uniqueText(incoming.paperIds).length;
  const retainedRecommendations = Math.max(0, order.length - currentRecommended);
  const cumulative = order.length > currentRecommended;
  return {
    ...incoming,
    headlineZh: cumulative
      ? currentRecommended
        ? `今天累计有 ${order.length} 篇论文通过严格筛选`
        : `今天累计保留 ${order.length} 篇推荐，本轮没有新增`
      : incoming.headlineZh,
    headlineEn: cumulative
      ? currentRecommended
        ? `${order.length} papers have passed today's strict review`
        : `${order.length} recommendations remain available; this run added none`
      : incoming.headlineEn,
    overviewZh: cumulative
      ? `${incoming.overviewZh} 今天较早入选的 ${retainedRecommendations || order.length} 篇论文仍保留，不会被本轮结果覆盖。`
      : incoming.overviewZh,
    overviewEn: cumulative
      ? `${incoming.overviewEn} ${retainedRecommendations || order.length} paper(s) selected earlier today remain available and were not overwritten by this run.`
      : incoming.overviewEn,
    paperIds: order,
    signalsZh: order.map((paperId) => details.get(paperId)?.signalZh || ""),
    signalsEn: order.map((paperId) => details.get(paperId)?.signalEn || ""),
    readingPlanZh: order.map((paperId) => details.get(paperId)?.readingZh || ""),
    readingPlanEn: order.map((paperId) => details.get(paperId)?.readingEn || ""),
    watchlistZh: uniqueText([...existing.watchlistZh, ...incoming.watchlistZh]),
    watchlistEn: uniqueText([...existing.watchlistEn, ...incoming.watchlistEn]),
    metrics: {
      ...incoming.metrics,
      latestRecommended: currentRecommended,
      retainedRecommendations,
      recommended: order.length,
    },
  };
}
