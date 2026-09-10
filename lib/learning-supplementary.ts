import type { LearningPath, LearningResource } from "./learning-path";
import { learningStageAccepts, type LearningStagePaper } from "./learning-stage-match.ts";

// Equivalent noun inflections only. Keep the existing overlap threshold and
// never apply this reading aid to the admission of original-work evidence.
const inflections: Record<string, string> = {
  constants: "constant", inequalities: "inequality", measures: "measure",
  densities: "density", bodies: "body", vectors: "vector", bounds: "bound",
};
const topicText = (text: string) => text.replace(/\b[a-z]+\b/gi, word => inflections[word.toLowerCase()] || word);

/** Read-only alternatives, not original-work evidence or completion credit. */
export function withSupplementaryReading(path: LearningPath, approved: Array<{
  resource: LearningResource;
  paper: LearningStagePaper;
}>): LearningPath {
  return {
    ...path,
    steps: path.steps.map((step) => {
      if (step.resources.length || step.status === "completed") return step;
      const previous = step.supplementaryResources || [];
      if (previous.length >= 2) return step;
      const key = (resource: LearningResource) => (resource.canonicalId || resource.id).trim().toLowerCase();
      const seen = new Set(previous.map(key));
      const additions: LearningResource[] = [];
      for (const candidate of approved) {
        if (candidate.resource.qualification !== "quality_approved" || seen.has(key(candidate.resource))) continue;
        // A survey may help explain this exact subject, but cannot stand in for
        // the missing original. Keep the existing topic-overlap check; never
        // use citation count, age or a broad direction label as stage matching.
        if (!learningStageAccepts({ ...step, kind: "method", titleEn: topicText(step.titleEn), goalEn: topicText(step.goalEn) }, {
          ...candidate.paper, title: topicText(candidate.paper.title), abstractText: topicText(candidate.paper.abstractText),
        })) continue;
        additions.push(candidate.resource);
        seen.add(key(candidate.resource));
        if (previous.length + additions.length >= 2) break;
      }
      return additions.length ? { ...step, supplementaryResources: [...previous, ...additions] } : step;
    }),
  };
}
