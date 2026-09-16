export const LEARNING_GOALS = {
  overview: { zh: "理解核心概念", en: "Understand core concepts" },
  papers: { zh: "读懂核心论文", en: "Read the core papers" },
  methods: { zh: "掌握方法与证明思路", en: "Understand methods and proof strategies" },
  research: { zh: "为具体研究问题做准备", en: "Prepare for a research question" },
} as const;
export type LearningGoal = keyof typeof LEARNING_GOALS;
export function learningGoal(value: unknown): LearningGoal {
  return typeof value === "string" && Object.hasOwn(LEARNING_GOALS, value) ? value as LearningGoal : "papers";
}
export function learningGoalPrompt(topic: string, goal: LearningGoal, background: string) {
  const outcome = {
    overview: "Prioritize prerequisite definitions and a small concept map. End with an explanation exercise, not a new research problem.",
    papers: "Prioritize understanding the core papers and comparing their assumptions and conclusions. End with a source-linked comparison.",
    methods: "Prioritize method steps, assumptions and proof strategies. End with a reconstruction exercise; proofs still require original-paper reading.",
    research: "Prioritize the user's specific research question. End with a testable hypothesis and a concrete plan to check it.",
  }[goal];
  return `${topic}. ${outcome} Learning outcome: ${LEARNING_GOALS[goal].en}. ${background ? `Learner background and specific question: ${background}.` : ""} Adjust depth and checkpoints to this outcome. Do not assume the learner has mastered prerequisites. For an overview, emphasize definitions; for methods, distinguish abstract-level statements from proofs requiring original reading.`;
}
export type LearningPlanPreview = {
  id: string; target: string; trackId: string | null; goal: LearningGoal; background: string;
  candidateCount: number; materialCount: number; modelPlanned: boolean;
  steps: Array<{ kind: string; titleZh: string; titleEn: string; goalZh: string; goalEn: string;
    checkpointZh: string; checkpointEn: string; papers: Array<{ id: string; title: string }> }>;
};
