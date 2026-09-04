import type { LearningPath, LearningPathStep, LearningStepKind } from "./learning-path";

export const LEARNING_GUIDANCE_POLICY = "learning-guidance-v1";
const fields = ["titleZh", "titleEn", "goalZh", "goalEn", "whyZh", "whyEn", "readFocusZh", "readFocusEn", "checkpointZh", "checkpointEn"] as const;
export type LearningGuidanceText = Pick<LearningPathStep, typeof fields[number] | "kind">;
export type LearningGuidanceSource = { canonicalId: string; title: string; authors: string; abstractText: string };
export type LearningGuidanceReview = {
  policy: typeof LEARNING_GUIDANCE_POLICY;
  contentKey: string;
  citations: Array<{ canonicalId: string; quote: string }>;
};
const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

export function learningGuidanceText(step: LearningGuidanceText): LearningGuidanceText {
  return { kind: step.kind, ...Object.fromEntries(fields.map((field) => [field, step[field]])) } as LearningGuidanceText;
}

function contentKey(step: LearningGuidanceText, sources: LearningGuidanceSource[]) {
  // Cache binding only, not a signature or a substitute for scholarly review.
  const content = JSON.stringify([learningGuidanceText(step), sources.map((source) => [source.canonicalId, source.title, source.authors, source.abstractText]).sort((a, b) => a[0].localeCompare(b[0]))]);
  let hash = 2166136261;
  for (const char of content) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${LEARNING_GUIDANCE_POLICY}:${content.length}:${(hash >>> 0).toString(16)}`;
}

/** Only called on the independent review response, never the author's self-rating. */
export function groundedGuidanceReview(step: LearningGuidanceText, sources: LearningGuidanceSource[], value: unknown): LearningGuidanceReview | null {
  if (!value || typeof value !== "object" || !sources.length) return null;
  const raw = value as Record<string, unknown>;
  if (raw.verdict !== "supported" || !Array.isArray(raw.citations) || !raw.citations.length || raw.citations.length > 12) return null;
  const citations: LearningGuidanceReview["citations"] = [];
  for (const item of raw.citations) {
    if (!item || typeof item !== "object") return null;
    const citation = item as Record<string, unknown>;
    if (typeof citation.canonicalId !== "string" || typeof citation.quote !== "string") return null;
    const source = sources.find((source) => source.canonicalId === citation.canonicalId);
    const quote = citation.quote.trim();
    // Title matching admits a paper, but cannot establish a theorem's bound.
    if (!source || quote.length < 35 || quote.length > 700 || !normalize(source.abstractText).includes(normalize(quote))) return null;
    citations.push({ canonicalId: source.canonicalId, quote });
  }
  return { policy: LEARNING_GUIDANCE_POLICY, contentKey: contentKey(step, sources), citations };
}

export function guidanceReviewIsCurrent(step: LearningGuidanceText, sources: LearningGuidanceSource[], value: unknown) {
  if (!value || typeof value !== "object") return false;
  const review = value as LearningGuidanceReview;
  return review.policy === LEARNING_GUIDANCE_POLICY && review.contentKey === contentKey(step, sources)
    && Boolean(groundedGuidanceReview(step, sources, { verdict: "supported", citations: review.citations }));
}

const tasks: Record<LearningStepKind, [string, string, string, string]> = {
  prerequisite: ["前置知识", "Prerequisites", "列出理解原始问题需要的定义与假设。", "List the definitions and assumptions needed to understand the original problem."],
  foundation: ["基础文献", "Foundational papers", "核对原始问题的对象、定义与假设。", "Check the objects, definitions and assumptions of the original problem."],
  method: ["核心方法", "Core methods", "梳理方法步骤及其适用条件。", "Trace the method's steps and the conditions under which they apply."],
  milestone: ["里程碑文献", "Milestone papers", "对照原始文献，比较推进前后的假设与结论。", "Compare assumptions and conclusions before and after the advance using the original papers."],
  frontier: ["前沿文献", "Frontier papers", "区分已有结论、局限与待解决问题。", "Separate established conclusions, limitations and open questions."],
  project: ["研究问题", "Research question", "写出待检验的假设和能够改变判断的结果。", "State a testable hypothesis and the result that would change the judgment."],
};

/** A public projection. Stored targets remain intact for matching and discovery. */
export function presentLearningGuidance(path: LearningPath): LearningPath {
  const unreviewed = path.steps.some((step) => step.guidanceStatus !== "grounded");
  return {
    ...path,
    ...(unreviewed ? {
      titleZh: path.target, titleEn: path.target,
      rationaleZh: "按阶段阅读原始文献；缺失材料继续检索，结论以可获得的论文证据为依据。",
      rationaleEn: "Read the original papers by stage. Missing material stays in discovery; conclusions require available paper evidence.",
    } : {}),
    steps: path.steps.map((step) => {
      if (step.guidanceStatus === "grounded" && step.resources.length) return step;
      const [titleZh, titleEn, goalZh, goalEn] = tasks[step.kind];
      return {
        ...step, titleZh, titleEn, goalZh, goalEn,
        guidanceStatus: "reading-task" as const,
        whyZh: "先核对文献，再判断它对当前研究问题的作用。",
        whyEn: "Check the papers before judging their contribution to the current research question.",
        readFocusZh: step.resources.length ? "从所列论文中核对问题、假设、结论与局限。" : "材料待补齐；找到原始文献后再核对具体结论。",
        readFocusEn: step.resources.length ? "Check the problem, assumptions, conclusions and limitations in the listed papers." : "Material is still missing; check the specific conclusions once the original papers are available.",
        checkpointZh: "用明确的论文依据说明判断；不能确定的内容保留为问题。",
        checkpointEn: "Support the judgment with specific paper evidence; keep uncertain points as questions.",
      };
    }),
  };
}
