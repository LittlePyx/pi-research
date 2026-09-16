import type { LearningPathStep } from './learning-path';

export function learningBrowseStep(steps: LearningPathStep[], current: LearningPathStep | null,
  scope: string, selection: { scope: string; stepId: string } | null) {
  return (selection?.scope === scope ? steps.find(step => step.id === selection.stepId) : null)
    || current || steps[0] || null;
}

export function canChangeLearningStep(step: LearningPathStep, current: LearningPathStep | null) {
  return step.status === 'completed' || (step.id === current?.id && step.resources.length > 0);
}

/** A material shortage must not hide usable reading in another stage. This is browsing, not advancement. */
export function nextReadableLearningStep(steps: LearningPathStep[], selected: LearningPathStep | null) {
  if (selected?.resources.some(r => r.qualification === 'quality_approved')) return null;
  return steps.find(s => s.id !== selected?.id && s.status !== 'completed'
    && s.resources.some(r => r.qualification === 'quality_approved')) || null;
}
