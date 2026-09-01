export function isRecommendationQualityStage(stage) {
  return stage === "recommended" || stage === "reviewing";
}

export function archiveQualityStagePresentation(stage, locale = "en") {
  const zh = locale === "zh";
  if (stage === "queued") return {
    label: zh ? "等待质量评审" : "Awaiting quality review",
    kicker: zh ? "共享质量队列" : "SHARED QUALITY QUEUE",
    note: zh
      ? "这篇论文已进入共享质量队列，但尚未完成深度质量评审；它目前只是候选线索，不构成路线证据或正式推荐。"
      : "This paper is in the shared quality queue, but deep quality review is not complete. It is currently only a candidate lead and is neither route evidence nor a formal recommendation.",
  };
  if (stage === "reviewed") return {
    label: zh ? "评审未入选" : "Reviewed, not selected",
    kicker: zh ? "质量评审结果" : "QUALITY REVIEW OUTCOME",
    note: zh
      ? "Pi 已完成质量评审，但这篇论文没有通过最终推荐门槛；它仅保留在探索账本中供检索，不构成路线证据或正式推荐。"
      : "Pi completed quality review, but this paper did not clear the final recommendation gate. It remains only in the exploration ledger for retrieval and is neither route evidence nor a formal recommendation.",
  };
  return {
    label: zh ? "发现线索" : "Discovery lead",
    kicker: zh ? "探索记录" : "EXPLORATION RECORD",
    note: zh
      ? "扫描发现并保存了这篇真实论文，但尚未完成质量评审；保留它是为了可追溯检索，不等同于推荐或路线证据。"
      : "The scan found and retained this real paper, but quality review is not complete. It remains for traceable retrieval and is neither a recommendation nor route evidence.",
  };
}

export function routeDiscoveryPresentation(stage, locale = "en") {
  const zh = locale === "zh";
  if (stage === "recommended") return {
    label: zh ? "推荐来源" : "Recommendation source",
    fallbackTitle: zh ? "该线索已通过共享质量评估" : "This lead cleared the shared quality review",
    impactHeading: zh ? "它对路线的作用" : "How it advances the route",
    impactFooter: zh
      ? "这篇论文已通过质量评估；用户确认后才会进入正式路线证据。"
      : "This paper cleared quality review; it becomes formal route evidence only after user confirmation.",
  };
  if (stage === "reviewing") return {
    label: zh ? "候选来源" : "Candidate source",
    fallbackTitle: zh ? "该线索正在共享质量队列中评估，尚非推荐" : "This lead is in the shared quality queue and is not yet a recommendation",
    impactHeading: zh ? "为什么这条路线需要评估它" : "Why this route is evaluating it",
    impactFooter: zh
      ? "这仍是候选线索；只有通过质量评估并经用户确认后才会成为正式路线证据。"
      : "This is still a candidate lead; it becomes formal route evidence only after quality review and user confirmation.",
  };
  if (stage === "queued") return {
    label: zh ? "候选线索" : "Candidate lead",
    fallbackTitle: zh ? "已进入共享质量队列，尚未完成评审，也不是路线证据" : "Entered the shared quality queue; review is incomplete and this is not route evidence",
    impactHeading: zh ? "为什么路线把它送入质量队列" : "Why the route sent it to quality review",
    impactFooter: zh
      ? "这仍是待评估线索；只有通过质量评估并经用户确认后才会成为正式路线证据。"
      : "This lead is still awaiting evaluation; it becomes formal route evidence only after quality review and user confirmation.",
  };
  return {
    label: zh ? "发现线索" : "Discovery lead",
    fallbackTitle: zh ? "由路线检索发现并保留用于追溯；未入选推荐，也不是路线证据" : "Found through route search and retained for traceability; it is neither selected nor route evidence",
    impactHeading: zh ? "为什么路线检索会找到它" : "Why the route search found it",
    impactFooter: zh
      ? "这段关系仅解释检索来源，不表示论文通过质量评估，也不会更新正式路线证据。"
      : "This relationship explains retrieval provenance only. It does not mean the paper cleared quality review or update formal route evidence.",
  };
}
