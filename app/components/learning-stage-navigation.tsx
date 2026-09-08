'use client';

import type { LearningPathStep } from '../../lib/learning-path';

export function LearningStageNavigation({ steps, selectedId, currentId, locale, label, onSelect }: {
  steps: LearningPathStep[]; selectedId?: string; currentId?: string; locale: 'zh' | 'en';
  label: (step: LearningPathStep, locale: 'zh' | 'en') => string;
  onSelect: (id: string) => void;
}) {
  return <nav className="pi-learning-stage-nav" aria-label={locale === 'zh' ? '查看学习阶段' : 'Browse learning stages'}>
    {steps.map((step, index) => <button type="button" key={step.id}
      aria-pressed={selectedId === step.id} aria-controls="learning-stage-content"
      onClick={() => onSelect(step.id)}>
      <span>{String(index + 1).padStart(2, '0')}</span>
      <span><strong>{locale === 'zh' ? step.titleZh : step.titleEn}</strong>
        <small>{label(step, locale)} · {step.resources.length} {locale === 'zh' ? '篇' : 'papers'}</small></span>
      <em>{step.status === 'completed' ? (locale === 'zh' ? '已完成' : 'Completed')
        : step.id === currentId ? (locale === 'zh' ? '当前进度' : 'Current progress') : ''}</em>
    </button>)}
  </nav>;
}
