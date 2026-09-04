"use client";

import type { ResearchTrack } from "../../lib/research-map";

type Locale = "zh" | "en";

export function RouteEvolutionWorkbench({
  track,
  locale,
  action,
  onPropose,
  onDecision,
  formatNotificationTime,
}: {
  track: ResearchTrack;
  locale: Locale;
  action: string | null;
  onPropose: () => void;
  onDecision: (revisionId: string, decision: "confirm" | "dismiss") => void;
  formatNotificationTime: (value: string, locale: Locale) => string;
}) {
  const revisions = track.routeRevisions || [];
  const proposed = revisions.find((revision) => revision.status === "proposed") || null;
  const history = revisions.filter((revision) => revision.status !== "proposed");
  const currentFormal = revisions.find((revision) => revision.status === "confirmed") || null;
  const effectiveness = currentFormal?.effectiveness || null;
  const shadowExperiment = effectiveness?.shadowExperiment || null;
  const busy = Boolean(action?.startsWith("evolution-"));
  const statusLabel = (revision: (typeof revisions)[number]) => revision.model === "system-baseline"
    ? (locale === "zh" ? "初始正式基线" : "Initial formal baseline")
    : revision.status === "confirmed"
      ? (locale === "zh" ? "当前正式版本" : "Current formal version")
      : revision.status === "dismissed"
      ? (locale === "zh" ? "已驳回" : "Dismissed")
      : revision.status === "superseded"
        ? (locale === "zh" ? "历史版本" : "Historical version")
        : (locale === "zh" ? "待确认" : "Awaiting confirmation");
  return <section className="v2-route-evolution">
    <header><div><p className="v2-kicker">{locale === "zh" ? "路线版本" : "ROUTE REVISION"}</p><h2>{locale === "zh" ? "更新提案" : "Revision proposal"}</h2><p>{locale === "zh" ? "仅使用已确认、已核对的论文；论文证据与 Pi 综合分开显示。" : "Uses confirmed, independently checked papers only; paper evidence and Pi synthesis remain separate."}</p></div><button type="button" onClick={onPropose} disabled={busy || track.confirmedEvidenceCount < 1}>{action === `evolution-propose:${track.id}` ? (locale === "zh" ? "正在形成提案…" : "Drafting proposal…") : proposed ? (locale === "zh" ? "依据变化后重新生成" : "Regenerate after evidence changes") : (locale === "zh" ? "根据当前证据形成提案" : "Propose from current evidence")}</button></header>
    {proposed ? <article className="v2-route-evolution-proposal">
      <div className="v2-route-evolution-status"><span>v{proposed.version}</span><strong>{locale === "zh" ? "待你确认" : "Awaiting your confirmation"}</strong><small>{proposed.confidence}% {locale === "zh" ? "提案置信度" : "proposal confidence"}</small></div>
      <div className="v2-route-evolution-diff">
        <section><small>{locale === "zh" ? "当前正式路线" : "CURRENT FORMAL ROUTE"}</small><h3>{locale === "zh" ? proposed.previousTitleZh : proposed.previousTitleEn}</h3><p>{locale === "zh" ? proposed.previousSummaryZh : proposed.previousSummaryEn}</p><div>{proposed.previousSearchQueries.map((query) => <code key={query}>{query}</code>)}</div></section>
        <i>→</i>
        <section className="next"><small>{locale === "zh" ? "提议的新版本" : "PROPOSED NEXT VERSION"}</small><h3>{locale === "zh" ? proposed.titleZh : proposed.titleEn}</h3><p>{locale === "zh" ? proposed.summaryZh : proposed.summaryEn}</p><div>{proposed.searchQueries.map((query) => <code key={query}>{query}</code>)}</div></section>
      </div>
      <div className="v2-route-evolution-reason"><small>{locale === "zh" ? "为什么建议变化" : "WHY THIS CHANGE IS PROPOSED"}</small><p>{locale === "zh" ? proposed.rationaleZh : proposed.rationaleEn}</p></div>
      <div className="v2-route-evolution-sources"><section><header><strong>{locale === "zh" ? "已确认论文证据" : "Confirmed paper evidence"}</strong><span>{proposed.sourcePapers.length}</span></header>{proposed.sourcePapers.map((paper) => <div key={paper.paperId}><b>✓</b><span><strong>{paper.title}</strong><small>{[paper.authors, paper.venue, paper.publishedAt?.slice(0, 4)].filter(Boolean).join(" · ")}</small></span></div>)}</section><section className="pi-synthesis"><header><strong>{locale === "zh" ? "Pi 跨论文综合（推断）" : "Pi cross-paper synthesis (inferred)"}</strong><span>{proposed.sourceStatements.length}</span></header>{proposed.sourceStatements.map((statement) => <div key={statement.statementId}><b>π</b><span><strong>{locale === "zh" ? statement.titleZh : statement.titleEn}</strong><small>{locale === "zh" ? statement.textZh : statement.textEn}</small></span></div>)}{!proposed.sourceStatements.length && <p>{locale === "zh" ? "本提案只使用论文证据，没有引用额外综合结论。" : "This proposal relies on paper evidence without additional synthesis statements."}</p>}</section></div>
      <footer><p>{locale === "zh" ? "确认后才会替换正式路线描述和下一轮检索词；驳回不会删除证据或历史。" : "Only confirmation replaces the formal route definition and future queries. Dismissal removes no evidence or history."}</p><div><button type="button" className="secondary" onClick={() => onDecision(proposed.id, "dismiss")} disabled={busy}>{action === `evolution-dismiss:${proposed.id}` ? "…" : (locale === "zh" ? "驳回并保留记录" : "Dismiss and retain")}</button><button type="button" onClick={() => onDecision(proposed.id, "confirm")} disabled={busy}>{action === `evolution-confirm:${proposed.id}` ? "…" : (locale === "zh" ? "确认更新正式路线" : "Confirm formal route update")}</button></div></footer>
    </article> : <div className="v2-route-evolution-empty"><span>△</span><div><strong>{track.confirmedEvidenceCount > 0 ? (locale === "zh" ? "正式证据已有变化时，可以形成下一版路线提案" : "A new route proposal can be formed when formal evidence changes") : (locale === "zh" ? "还没有足够的正式证据" : "Not enough formal evidence yet")}</strong><p>{track.confirmedEvidenceCount > 0 ? (locale === "zh" ? "提案生成后仍需你确认，不会自动改写路线。" : "The proposal still requires your confirmation and never rewrites the route automatically.") : (locale === "zh" ? "论文先通过共享质量队列和证据核对，再由你的接受或完成阅读确认进入路线。" : "A paper must pass shared quality review and evidence verification, then be confirmed by your acceptance or completed reading.")}</p></div></div>}
    {effectiveness && <section className={`v2-route-effectiveness ${effectiveness.verdict}`}>
      <header><div><small>{locale === "zh" ? `v${effectiveness.version} · 正式版本成效` : `v${effectiveness.version} · FORMAL VERSION OUTCOME`}</small><strong>{effectiveness.verdict === "retain" ? (locale === "zh" ? "建议保留当前版本" : "Retain the current version") : effectiveness.verdict === "reconsider" ? (locale === "zh" ? "建议人工考虑上一版本" : "Consider the prior version") : (locale === "zh" ? "继续观察，不下结论" : "Keep observing")}</strong></div><span>{effectiveness.confidence}% {locale === "zh" ? "判断置信度" : "decision confidence"}</span></header>
      <div className="v2-route-effectiveness-window"><span>{locale === "zh" ? "观察窗口" : "Observation window"}</span><time>{formatNotificationTime(effectiveness.windowStartedAt, locale)}</time><i>→</i><time>{effectiveness.windowEndedAt ? formatNotificationTime(effectiveness.windowEndedAt, locale) : (locale === "zh" ? "现在" : "now")}</time></div>
      <dl>
        <div><dt>{locale === "zh" ? "路线候选" : "Candidates"}</dt><dd>{effectiveness.candidateCount}</dd><small>{locale === "zh" ? "按首次发现归属版本" : "attributed at first discovery"}</small></div>
        <div><dt>{locale === "zh" ? "进入深评" : "Deep reviewed"}</dt><dd>{effectiveness.deepReviewedCount}</dd><small>{effectiveness.candidateCount ? `${effectiveness.deepReviewRate}%` : "—"}</small></div>
        <div><dt>{locale === "zh" ? "正式推荐" : "Recommended"}</dt><dd>{effectiveness.recommendedCount}</dd><small>{effectiveness.deepReviewedCount ? `${effectiveness.recommendationRate}%` : "—"}{effectiveness.recommendationRateDelta !== null ? ` · ${effectiveness.recommendationRateDelta > 0 ? "+" : ""}${effectiveness.recommendationRateDelta}pp` : ""}</small></div>
        <div><dt>{locale === "zh" ? "接受 / 完读" : "Accepted / completed"}</dt><dd>{effectiveness.acceptedCount} / {effectiveness.readingCompletedCount}</dd><small>{effectiveness.recommendedCount ? `${effectiveness.acceptanceRate}% ${locale === "zh" ? "接受率" : "acceptance"}` : "—"}</small></div>
        <div><dt>{locale === "zh" ? "正式路线证据" : "Formal evidence"}</dt><dd>{effectiveness.formalEvidenceCount}</dd><small>{effectiveness.readingStartedCount} {locale === "zh" ? "篇开始阅读" : "started reading"}</small></div>
        <div><dt>{locale === "zh" ? "研究判断变化" : "Research changes"}</dt><dd>{effectiveness.problemAssessmentCount + effectiveness.synthesisUpdateCount}</dd><small>{locale === "zh" ? `${effectiveness.problemAssessmentCount} 次问题评估 · ${effectiveness.synthesisUpdateCount} 次综合` : `${effectiveness.problemAssessmentCount} problem · ${effectiveness.synthesisUpdateCount} synthesis`}</small></div>
      </dl>
      {shadowExperiment && <section className={`v2-route-shadow-experiment ${shadowExperiment.status}`}>
        <header><div><small>{locale === "zh" ? "上一版受控对照" : "PRIOR-VERSION CONTROL"}</small><strong>{shadowExperiment.verdict === "retain_current" ? (locale === "zh" ? "对照支持保留当前版" : "Control supports the current version") : shadowExperiment.verdict === "consider_previous" ? (locale === "zh" ? "建议人工复核上一版" : "Manually review the prior version") : (locale === "zh" ? "样本积累中，不下结论" : "Collecting evidence; no conclusion")}</strong></div><span>{locale === "zh" ? `上限 ${shadowExperiment.maxShadowAttempts} 轮 × ${shadowExperiment.maxResultsPerAttempt} 条` : `Cap ${shadowExperiment.maxShadowAttempts} runs × ${shadowExperiment.maxResultsPerAttempt}`}</span></header>
        <div className="v2-route-shadow-arms">{[
          { key: "current", label: locale === "zh" ? `当前正式版 v${shadowExperiment.current.version}` : `Current formal v${shadowExperiment.current.version}`, arm: shadowExperiment.current },
          { key: "shadow", label: locale === "zh" ? `上一版对照 v${shadowExperiment.shadow.version}` : `Prior control v${shadowExperiment.shadow.version}`, arm: shadowExperiment.shadow },
        ].map(({ key, label, arm }) => <article className={key} key={key}><header><strong>{label}</strong><small>{arm.attemptCount} {locale === "zh" ? "轮发现" : "discovery runs"}</small></header><dl><div><dt>{locale === "zh" ? "候选" : "Candidates"}</dt><dd>{arm.candidateCount}</dd></div><div><dt>{locale === "zh" ? "深评" : "Reviewed"}</dt><dd>{arm.deepReviewedCount}</dd></div><div><dt>{locale === "zh" ? "推荐" : "Recommended"}</dt><dd>{arm.recommendedCount}</dd></div><div><dt>{locale === "zh" ? "接受 / 完读" : "Accepted / read"}</dt><dd>{arm.acceptedCount} / {arm.readingCompletedCount}</dd></div></dl></article>)}</div>
        <footer><p>{locale === "zh" ? shadowExperiment.summaryZh : shadowExperiment.summaryEn}</p>{shadowExperiment.recommendationRateDelta !== null && <small>{locale === "zh" ? `上一版相对当前版推荐率：${shadowExperiment.recommendationRateDelta > 0 ? "+" : ""}${shadowExperiment.recommendationRateDelta}pp` : `Prior-versus-current recommendation rate: ${shadowExperiment.recommendationRateDelta > 0 ? "+" : ""}${shadowExperiment.recommendationRateDelta}pp`}</small>}</footer>
      </section>}
      {effectiveness.sourceFailureCount > 0 && <aside><b>!</b><p>{locale === "zh" ? `窗口内记录到 ${effectiveness.sourceFailureCount} 次路线来源降级；Pi 不会把低产出误判成路线质量下降。` : `${effectiveness.sourceFailureCount} route-source degradations occurred in this window. Pi will not mistake low yield for lower route quality.`}</p></aside>}
      <footer><p>{locale === "zh" ? effectiveness.summaryZh : effectiveness.summaryEn}</p><small>{locale === "zh" ? "建议只依据真实候选、质量审计、反馈、阅读和正式证据；不会自动回退，也不会降低质量门槛。" : "The recommendation uses real candidates, quality audits, feedback, reading and formal evidence only. It never rolls back automatically or lowers the quality gate."}</small></footer>
    </section>}
    {history.length > 0 && <details className="v2-route-evolution-history"><summary><span><strong>{locale === "zh" ? "路线版本历史" : "Route version history"}</strong><small>{locale === "zh" ? "所有确认、驳回和旧版本均保留" : "Confirmed, dismissed, and prior versions are retained"}</small></span><b>{history.length}</b></summary><div>{history.map((revision) => <article className={`${revision.status} ${revision.model === "system-baseline" ? "baseline" : ""}`} key={revision.id}><header><span>v{revision.version}</span><strong>{statusLabel(revision)}</strong><time>{formatNotificationTime(revision.decidedAt || revision.updatedAt, locale)}</time></header><h3>{locale === "zh" ? revision.titleZh : revision.titleEn}</h3><p>{locale === "zh" ? revision.rationaleZh : revision.rationaleEn}</p><small>{revision.model === "system-baseline" ? (locale === "zh" ? "原样快照 · 未改写路线" : "Exact snapshot · route unchanged") : <>{revision.sourcePaperIds.length} {locale === "zh" ? "篇论文证据" : "paper sources"} · {revision.sourceStatementIds.length} {locale === "zh" ? "条 Pi 综合" : "Pi synthesis statements"}{revision.effectiveness ? ` · ${revision.effectiveness.recommendedCount} ${locale === "zh" ? "篇正式推荐" : "recommended"}` : ""}</>}</small></article>)}</div></details>}
  </section>;
}
