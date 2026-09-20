'use client';

import type { LearningPathStep, LearningResource } from '../../lib/learning-path';
import { learningNextTask } from '../../lib/learning-next-task';
import { LearningResourceList } from './learning-resource-list';
import { MathText } from './math-text';

export function LearningStageWorkspace({ step, locale, openingId, onOpen, signals, canComplete, busy, onComplete, duration }: {
  step: LearningPathStep; locale: 'zh' | 'en'; openingId: string | null;
  onOpen: (resource: LearningResource) => void;
  signals: (resource: LearningResource, locale: 'zh' | 'en') => string[];
  canComplete: boolean; busy: boolean; onComplete: () => void; duration: string;
}) {
  const zh = locale === 'zh';
  const task = learningNextTask(step);
  const grounded = step.guidanceStatus === 'grounded' && step.resources.length > 0;
  const why = grounded ? (zh ? step.whyZh : step.whyEn) : '';
  const focus = (grounded ? (zh ? step.readFocusZh : step.readFocusEn) : '') || (zh ? task?.resource.readingFocusZh : task?.resource.readingFocusEn);
  const checkpoint = (grounded ? (zh ? step.checkpointZh : step.checkpointEn) : '') || (zh
    ? '在论文笔记中记录一条有出处的结论、适用条件，以及一个仍需查证的问题。'
    : 'Record a sourced claim, its conditions, and one question to verify in your paper notes.');
  const list = (resources: LearningResource[]) => <LearningResourceList resources={resources} locale={locale} openingId={openingId} onOpen={onOpen} signals={signals} supplementary />;
  return <section id="learning-stage-content" className="pi-lesson" aria-label={zh ? '阶段材料' : 'Stage materials'}>
    <header className="pi-lesson-heading"><span>{zh ? '本阶段' : 'THIS STAGE'} · {duration}</span><h2>{zh ? step.titleZh : step.titleEn}</h2><p><MathText inline>{zh ? step.goalZh : step.goalEn}</MathText></p></header>
    {why && <p className="pi-lesson-purpose"><strong>{zh ? '为什么学' : 'Why this stage'}</strong><MathText inline>{why}</MathText></p>}
    <section className="pi-lesson-papers"><header><h3>{zh ? '阅读材料' : 'Reading material'}</h3><span>{step.resources.length} {zh ? '篇' : 'papers'}</span></header>
      {step.resources.length ? list(step.resources) : <p className="pi-lesson-empty">{zh ? '合适的材料会在后台补充。你可以先了解阶段目标，或查看其他阶段。' : 'Suitable material will be added in the background. Review the goal or explore another stage.'}</p>}
    </section>
    {Boolean(step.supplementaryResources?.length) && <section className="pi-lesson-supplement"><h3>{zh ? '延伸阅读' : 'Further reading'}</h3><p>{zh ? '帮助理解主题，不计入本阶段完成。' : 'Useful context; does not count toward stage completion.'}</p>{list(step.supplementaryResources || [])}</section>}
    {task && <section className="pi-lesson-exercise"><h3>{zh ? '带着问题读' : 'Read with a question'}</h3><p><MathText inline>{focus || (zh ? '核对论文研究的问题、使用的假设，以及摘要明确支持的结论。' : 'Check the research question, assumptions and claims supported by the abstract.')}</MathText></p><h3>{zh ? '读完后，留下什么' : 'After reading'}</h3><p><MathText inline>{checkpoint}</MathText></p></section>}
    <footer><p>{step.status === 'completed' ? (zh ? '你已完成这个阶段，可以随时回顾。' : 'This stage is complete. Revisit it any time.') : step.resources.length ? (zh ? '阅读并完成上述记录后，再推进学习进度。' : 'Read and record your findings before moving on.') : (zh ? '阶段材料就绪后，可继续学习并记录进度。' : 'Continue and record progress once stage material is available.')}</p><button type="button" disabled={busy || !canComplete} onClick={onComplete}>{busy ? '…' : step.status === 'completed' ? (zh ? '重新学习' : 'Reopen stage') : (zh ? '完成本阶段' : 'Complete stage')}</button></footer>
  </section>;
}
