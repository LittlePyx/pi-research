import { learningResourceHref, learningResourcePaperId, type LearningPathStep, type LearningResource } from "./learning-path.ts";

/** Choose only from this stage's already admitted materials. No progress writes. */
export function learningNextTask(step: LearningPathStep) {
  if (step.status === "completed") return null;
  const usable = (resource: LearningResource) => resource.qualification === "quality_approved"
    && Boolean(learningResourcePaperId(resource) || learningResourceHref(resource));
  const primary = step.resources.filter(usable);
  const supplementary = primary.length === 0;
  const candidates = supplementary ? (step.supplementaryResources || []).filter(usable) : primary;
  // Continue an ongoing reading before starting another; never infer mastery from a visit.
  const resource = candidates.find(item => item.readingStatus === "reading")
    || candidates.find(item => !item.readingStatus || ["unread", "queued"].includes(item.readingStatus))
    || candidates[0];
  if (!resource) return null;
  return { resource, supplementary, revisit: ["read", "mastered", "cited"].includes(resource.readingStatus || "") };
}
