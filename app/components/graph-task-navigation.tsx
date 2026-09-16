'use client';

export function GraphTaskNavigation({ mode, onMode, onCompare, canCompare, citations, similarities, candidates, stages, locale }: {
  mode: 'similarity' | 'citations' | 'path'; onMode: (mode: 'similarity' | 'citations' | 'path') => void;
  onCompare: () => void; canCompare: boolean; citations: number; similarities: number; candidates: number; stages: number; locale: 'zh' | 'en';
}) {
  const zh = locale === 'zh';
  const tasks = [
    { id: 'citations' as const, title: zh ? '查引用' : 'Trace citations', description: zh ? '追溯来源与后续工作' : 'Trace sources and follow-up work', count: zh ? `${citations} 条引用` : `${citations} citations` },
    { id: 'similarity' as const, title: zh ? '找相关工作' : 'Find related work', description: zh ? '从论文出发，找可核对的邻近材料' : 'Explore neighbors of your starting papers', count: zh ? `${similarities} 条相似关系 · ${candidates} 篇候选` : `${similarities} similarity links · ${candidates} candidates` },
    { id: 'path' as const, title: zh ? '安排阅读' : 'Plan reading', description: zh ? '查看已保存路径的阶段与材料' : 'Use the stages and papers in your saved path', count: zh ? `${stages} 个已保存阶段` : `${stages} saved stages` },
  ];
  return <div className="pi-graph-task-area"><nav className="pi-graph-tasks" aria-label={zh ? '图谱任务' : 'Graph tasks'}>{tasks.map(task => <button type="button" key={task.id} aria-pressed={mode === task.id} onClick={() => onMode(task.id)}><strong>{task.title}</strong><span>{task.description}</span><small>{task.count}</small></button>)}<button type="button" disabled={!canCompare} onClick={onCompare}><strong>{zh ? '比较论文' : 'Compare papers'}</strong><span>{zh ? '对照问题、条件、方法与局限' : 'Compare questions, assumptions, methods and limits'}</span><small>{canCompare ? (zh ? '进入当前方向的比较工作台' : 'Open this direction’s comparison workspace') : (zh ? '先在下方选择一个方向' : 'Select a direction below first')}</small></button></nav><p className="pi-graph-task-hint">{mode === 'citations' ? (zh ? '箭头表示引用方向；选中论文可核对关系来源。引用本身不表示支持或反驳。' : 'Arrows show citation direction. Select a paper to inspect sources; a citation does not imply support or contradiction.') : mode === 'similarity' ? (zh ? '先选起始论文，再发现相关工作。共同参考文献与语义相似分别标注，浅色候选需经过评审。' : 'Select starting papers, then discover related work. Shared references and semantic similarity are labeled separately; candidates still require review.') : (zh ? '这里展示已保存的学习路径。阶段顺序是阅读安排，不是已经证实的知识依赖。' : 'This view shows your saved learning path. Stage order is a reading plan, not an established knowledge dependency.')}</p></div>;
}
