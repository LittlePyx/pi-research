'use client';

import type { LearningPathStep } from '../../lib/learning-path';

export function LearningStageGuidance({ step, locale }: {
  step: LearningPathStep; locale: 'zh' | 'en';
}) {
  // Generic reading-task fallback is already expressed by the stage goal.
  // Only show paper-specific guidance after its independent evidence review.
  if (step.guidanceStatus !== 'grounded' || !step.resources.length) return null;
  const rows = locale === 'zh'
    ? [['为什么', step.whyZh], ['读什么', step.readFocusZh], ['如何决定', step.checkpointZh]]
    : [['WHY', step.whyEn], ['READ', step.readFocusEn], ['DECIDE', step.checkpointEn]];
  const visible = rows.filter(([, text]) => text?.trim());
  if (!visible.length) return null;
  return <div className="v2-learning-now-guidance">{visible.map(([label, text]) =>
    <article key={label}><small>{label}</small><p>{text}</p></article>
  )}</div>;
}
