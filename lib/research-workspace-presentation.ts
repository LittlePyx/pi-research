import type { LearningPathStep, LearningReadingStatus, LearningResource } from "./learning-path";
import type { ResearchTrackPaper, ResearchTrackRole } from "./research-map";

type Locale = "zh" | "en";
type Localized = { zh: string; en: string };

export function researchRoleLabel(role: ResearchTrackRole, locale: Locale) {
  const labels: Record<ResearchTrackRole, Localized> = {
    background: { zh: "相关方法与背景", en: "Methods and background" },
    foundation: { zh: "奠基", en: "Foundation" },
    milestone: { zh: "发展节点", en: "Milestone" },
    frontier: { zh: "近年前沿", en: "Frontier" },
  };
  return labels[role][locale];
}

export function researchPaperYear(paper: ResearchTrackPaper) {
  return paper.publishedAt?.slice(0, 4) || "—";
}

export function learningTime(minutes: number, locale: Locale) {
  if (minutes < 60) return locale === "zh" ? `${minutes} 分钟` : `${minutes} min`;
  const hours = Math.round(minutes / 6) / 10;
  return locale === "zh" ? `约 ${hours} 小时` : `≈ ${hours} h`;
}

export function readingStatusLabel(status: LearningReadingStatus, locale: Locale) {
  const labels: Record<LearningReadingStatus, Localized> = {
    unread: { zh: "未加入阅读", en: "Not queued" },
    queued: { zh: "待读", en: "Queued" },
    reading: { zh: "阅读中", en: "Reading" },
    read: { zh: "已读", en: "Read" },
    mastered: { zh: "已掌握", en: "Mastered" },
    cited: { zh: "已引用", en: "Cited" },
  };
  return labels[status || "unread"][locale];
}

export function learningResourceSourceLabel(source: LearningResource["source"], locale: Locale) {
  if (source === "research-map+daily-scan") return locale === "zh" ? "路线证据 · 今日评审" : "Route evidence · Daily review";
  if (source === "daily-scan") return locale === "zh" ? "今日质量评审" : "Daily quality review";
  if (source === "research-map") return locale === "zh" ? "研究路线证据" : "Research-route evidence";
  return locale === "zh" ? "已保存真实论文" : "Saved real paper";
}

export function learningResourceSignals(resource: LearningResource, locale: Locale) {
  if ("demo" in resource && resource.demo === true) return [locale === "zh" ? "演示材料 · 未执行质量评审" : "Demo material · no quality review"];
  return [
    resource.qualification === "quality_approved" ? (locale === "zh" ? "质量已通过" : "Quality approved") : "",
    learningResourceSourceLabel(resource.source, locale),
    resource.readingStatus && resource.readingStatus !== "unread" ? readingStatusLabel(resource.readingStatus, locale) : "",
  ].filter(Boolean);
}

export function learningEvidenceLabel(step: LearningPathStep, locale: Locale) {
  const labels = {
    ready: { zh: "材料已就绪", en: "Evidence ready" },
    searching: { zh: "正在补证", en: "Finding evidence" },
    awaiting_quality: { zh: "候选正在质量评估", en: "Candidates in quality review" },
    retryable: { zh: "材料待补充", en: "More material needed" },
    degraded: { zh: "材料待补充", en: "More material needed" },
    insufficient: { zh: "材料待补充", en: "More material needed" },
    missing: { zh: "材料待补充", en: "More material needed" },
  } as const;
  return labels[step.evidenceStatus][locale];
}
