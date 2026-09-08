import type { LearningPathStep } from './learning-path';

export function learningBrowseStep(steps: LearningPathStep[], current: LearningPathStep | null,
  scope: string, selection: { scope: string; stepId: string } | null) {
  return (selection?.scope === scope ? steps.find(step => step.id === selection.stepId) : null)
    || current || steps[0] || null;
}

export function canChangeLearningStep(step: LearningPathStep, current: LearningPathStep | null) {
  return step.status === 'completed' || (step.id === current?.id && step.resources.length > 0);
}
