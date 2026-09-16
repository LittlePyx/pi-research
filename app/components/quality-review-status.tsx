import { monitorQualityReviewStatus } from "../../lib/monitor-quality-queue.mjs";

type Queue = { pendingCount: number; verificationCount: number; retryCount: number; awaitingAbstractCount: number; abstractRetryAt: number | null; observedAt: string };
type ReviewMonitor = {
  status: string; nextRunAt?: string | null; leaseExpiresAt?: string | null; qualityQueue?: Queue | null;
  automation?: { paused?: boolean; pauseMessageZh?: string; pauseMessageEn?: string };
  scanJob?: { nextRetryAt?: string | null } | null;
};

export function QualityReviewStatus({ monitor, locale, failureMessage, phase, formatTime }: {
  monitor: ReviewMonitor | null; locale: "zh" | "en"; failureMessage: string; phase: string;
  formatTime: (value: string, locale: "zh" | "en") => string;
}) {
  const status = monitorQualityReviewStatus(monitor);
  if (!status) return null;
  const zh = locale === "zh";
  const labels: Record<string, string> = zh ? {
    active: "正在处理候选", scheduled: "候选已排队", paused: "候选评审已暂停", retry: "评审中断，等待重试",
    evidence: "部分候选待补摘要", overdue: "候选评审接续延迟", unscheduled: "候选尚未安排接续",
  } : {
    active: "Processing candidates", scheduled: "Candidates queued", paused: "Candidate review paused", retry: "Review interrupted; retry pending",
    evidence: "Some candidates need abstracts", overdue: "Candidate review is overdue", unscheduled: "Review has not been scheduled",
  };
  const reason = status.state === "paused" ? (zh ? monitor?.automation?.pauseMessageZh : monitor?.automation?.pauseMessageEn)
    : status.state === "retry" ? failureMessage
    : status.state === "active" ? phase
    : status.state === "overdue" ? (zh ? "已超过计划时间 25 分钟，尚未检测到运行中的任务。当前无法给出完成时间。" : "No running task was detected more than 25 minutes after the scheduled time. Completion time is unknown.")
    : status.state === "unscheduled" ? (zh ? "尚无可用的下次运行时间，需要检查调度状态。" : "No next run is recorded; scheduling needs attention.")
    : status.state === "evidence" ? (zh ? "上次补全没有获得足够的摘要；来源退避结束后才能再次尝试，不代表质量不通过。" : "The last recovery did not obtain enough abstract evidence. Source backoff must expire before retrying; this is not a quality rejection.")
    : (zh ? "候选按批次筛选、深评和独立核对；本轮结束后，剩余材料接续处理。" : "Candidates are screened, reviewed, and independently checked in batches. Remaining work continues in later runs.");
  return <section className={`v2-background-review-status ${status.state}`} aria-label={zh ? "候选评审进度" : "Candidate review progress"}>
    <header><h2>{labels[status.state]}</h2><span>{status.pendingCount || status.awaitingAbstractCount} {status.pendingCount ? (zh ? "篇待评审" : "awaiting review") : (zh ? "篇待补摘要" : "awaiting abstracts")}</span></header>
    <p>{reason || (zh ? "自动评审暂未运行，已有进度保留。" : "Automatic review is not running; progress is preserved.")}</p>
    <div className="v2-review-stages">
      {status.pendingCount > 0 && <span>{zh ? "待筛选／深评" : "Screen / review"} <b>{status.firstReviewCount}</b></span>}
      {status.pendingCount > 0 && <span>{zh ? "待独立核对" : "Independent check"} <b>{status.verificationCount}</b></span>}
      {status.retryCount > 0 && <span>{zh ? "技术失败待重试" : "Technical retries"} <b>{status.retryCount}</b></span>}
      {status.awaitingAbstractCount > 0 && <span>{zh ? "另有摘要待补全" : "Also awaiting abstracts"} <b>{status.awaitingAbstractCount}</b></span>}
    </div>
    {status.state !== "active" && status.state !== "paused" && status.nextAt && <p className="v2-review-next">{zh ? "下次可尝试时间：" : "Next eligible attempt: "}<time>{formatTime(status.nextAt, locale)}</time>{zh ? "；由后续调度接续，不是全部评完的时间。" : "; processing follows a scheduler check, not a completion deadline."}</p>}
    <details><summary>{zh ? "为什么要等？怎样才算通过？" : "Why the wait? What passes review?"}</summary>
      <p>{zh ? "正常有积压时约 10 分钟后安排下一轮，调度检查也有间隔。单次只处理有限批次；超时、来源限流、摘要不足或模型连接问题都会延长等待，没有统一完成时限。" : "With a backlog, the next run is normally scheduled about 10 minutes later, followed by a scheduler check. Batches are bounded; timeouts, source limits, missing abstracts, or model connection issues can extend the wait. There is no fixed completion deadline."}</p>
      <ol><li>{zh ? "确认为论文，相关性至少 72 分、质量至少 65 分，并给出完整的中英文解读和阅读理由。" : "A research paper with relevance ≥72, quality ≥65, and complete bilingual analysis and reading rationale."}</li>
        <li>{zh ? "书目与摘要依据通过独立核对；需要修订的内容修订后重新检查。分数达标本身不等于推荐通过。" : "Bibliographic and abstract evidence must pass an independent check, with corrections checked again. Scores alone do not qualify a recommendation."}</li>
        <li>{zh ? "通过后进入可推荐材料，再按优先级安排今日主序或备选阅读；未通过与待评估分别保存。" : "Passing papers become eligible for the primary reading order or further reading. Rejected and pending papers remain distinct."}</li></ol>
    </details>
  </section>;
}
