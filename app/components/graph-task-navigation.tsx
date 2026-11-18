'use client';

type Mode = 'similarity' | 'citations' | 'path';

export function GraphTaskNavigation({ mode, onMode, locale }: {
  mode: Mode; onMode: (mode: Mode) => void; locale: 'zh' | 'en';
}) {
  const items = [
    { id: 'similarity', zh: '相似论文', en: 'Similar papers' },
    { id: 'citations', zh: '直接引用', en: 'Direct citations' },
    { id: 'path', zh: '阅读顺序', en: 'Reading order' },
  ] as const;
  return <nav className="pi-graph-tasks" aria-label={locale === 'zh' ? '论文关系与阅读' : 'Paper relations and reading'}>
    {items.map(item => <button type="button" key={item.id} aria-pressed={mode === item.id}
      onClick={() => onMode(item.id)}><strong>{item[locale]}</strong></button>)}
  </nav>;
}
