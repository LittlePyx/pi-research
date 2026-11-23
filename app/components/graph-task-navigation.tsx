'use client';

import type { GraphMode } from '../../lib/workspace-navigation';

export function GraphTaskNavigation({ mode, onMode, locale }: {
  mode: GraphMode; onMode: (mode: GraphMode) => void; locale: 'zh' | 'en';
}) {
  const items = [
    { id: 'citations', zh: '直接引用', en: 'Direct citations' },
    { id: 'similarity', zh: '相似论文', en: 'Similar papers' },
  ] as const;
  return <nav className="pi-graph-tasks" aria-label={locale === 'zh' ? '论文关系类型' : 'Paper relationships'}>
    {items.map(item => <button type="button" key={item.id} aria-pressed={mode === item.id}
      onClick={() => onMode(item.id)}><strong>{item[locale]}</strong></button>)}
  </nav>;
}
