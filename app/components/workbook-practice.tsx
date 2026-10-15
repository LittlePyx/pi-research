'use client';
import { useEffect, useRef, useState } from 'react';
import { workspaceFetch as fetch } from '../../lib/workspace-request';
import type { WorkbookSource, WorkbookState } from '../../lib/research-workbook';
import { completePractice, practiceProgress, validateWorkbookPractice, workbookPracticeTasks, type WorkbookPractice as Practice } from '../../lib/workbook-practice';
import { sessionDraftKey, writeSessionDraft, clearSessionDraft } from '../../lib/session-draft';
import { DraftRecovery } from './draft-recovery';
import { MathText } from './math-text';
import './workbook-practice.css';

export function WorkbookPractice({ userId, spaceId, trackId, workbookId, practiceId = '', locale, onSelect, onOpenPaper, onBack, onSaved }: {
  userId: string; spaceId: string; trackId: string; workbookId: string; practiceId?: string; locale: 'zh' | 'en';
  onSelect: (id: string) => void; onOpenPaper: (source: WorkbookSource, focus: string) => void; onBack: () => void; onSaved?: () => void;
}) {
  const zh = locale === 'zh', [state, setState] = useState<WorkbookState | null>(null), [practice, setPractice] = useState<Practice | null>(null);
  const [busy, setBusy] = useState('load'), [error, setError] = useState(''), [notice, setNotice] = useState(''), [reload, setReload] = useState(0);
  const generation = useRef(0), selection = useRef(practiceId); selection.current = practiceId;
  useEffect(() => {
    const abort = new AbortController(), epoch = ++generation.current;
    setBusy('load'); setError(''); setState(null); setPractice(null);
    fetch('/api/research-workbook?' + new URLSearchParams({ spaceId, trackId, workbookId }), { signal: abort.signal })
      .then(async response => { if (!response.ok) throw Error(); const data = await response.json() as { workbook: WorkbookState }; if (data.workbook.id !== workbookId || !data.workbook.content) throw Error(); return data.workbook; })
      .then(workbook => {
        if (generation.current !== epoch) return;
        const tasks = workbookPracticeTasks(workbook.content!), saved = workbook.artifact?.value.practice || { activeId: tasks[0].id, entries: {} };
        setState(workbook); setPractice({ ...saved, activeId: tasks.some(task => task.id === selection.current) ? selection.current : saved.activeId });
      }).catch(() => { if (!abort.signal.aborted && generation.current === epoch) setError(zh ? '练习暂未载入，请重试。原记录保留。' : 'Exercise could not load. Retry; saved records are preserved.'); })
      .finally(() => { if (generation.current === epoch) setBusy(''); });
    return () => { abort.abort(); generation.current = epoch + 1; };
  }, [spaceId, trackId, workbookId, reload]);
  useEffect(() => {
    if (state?.content && workbookPracticeTasks(state.content).some(task => task.id === practiceId)) setPractice(value => value ? { ...value, activeId: practiceId } : value);
  }, [practiceId, state?.content]);
  const draftKey = sessionDraftKey(userId, spaceId, `practice:${workbookId}`);
  const savedPractice = state?.artifact?.value.practice || null;
  const base = JSON.stringify(savedPractice), dirty = Boolean(practice && JSON.stringify(practice) !== base);
  const edit = (value: Practice) => {
    setPractice(value); setNotice('');
    if (!writeSessionDraft(draftKey, base, JSON.stringify(value))) setError(zh ? '无法暂存，请保存后再离开。' : 'Draft storage unavailable. Save before leaving.');
  };
  const save = async (complete = false) => {
    if (!practice || !state?.content || busy || state.stale || state.status !== 'ready') return;
    const epoch = generation.current; setBusy('save'); setError(''); setNotice('');
    try {
      const value = complete ? completePractice(state.content, practice) : practice;
      const response = await fetch('/api/research-workbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaceId, trackId, workbookId, action: 'save-practice', sourceRevision: state.revision, baseRevision: state.artifact?.revision || 0, value }) });
      if (!response.ok) throw Error(String(response.status));
      const data = await response.json() as { workbook: WorkbookState };
      if (generation.current !== epoch) return;
      clearSessionDraft(draftKey, JSON.stringify(practice)); setState(data.workbook); setPractice(data.workbook.artifact!.value.practice!);
      setNotice(complete ? (zh ? '成果已保存，本项由你确认完成；阅读和掌握状态未改变。' : 'Result saved and task marked complete by you. Reading and mastery are unchanged.') : (zh ? '练习成果已保存。' : 'Exercise result saved.'));
      onSelect(data.workbook.artifact!.value.practice!.activeId);
      onSaved?.();
    } catch (failure) {
      if (generation.current !== epoch) return;
      setError(failure instanceof Error && failure.message === '409' ? (zh ? '材料或保存版本已变化。输入仍保留，请复制成果后重新载入，再核对合并。' : 'Evidence or saved revision changed. Input preserved; copy it before reloading and reconciling.') : (zh ? '保存未完成，输入仍保留，请重试。' : 'Save failed. Input preserved; retry.'));
    } finally { if (generation.current === epoch) setBusy(''); }
  };
  const tasks = state?.content ? workbookPracticeTasks(state.content) : [], task = tasks.find(item => item.id === practice?.activeId);
  const entry = practice?.entries[practice.activeId] || { result: '', unresolved: '', completed: false };
  const progress = state?.content && practice ? practiceProgress(state.content, practice) : null;
  const disabled = Boolean(busy) || !state || state.stale || state.status !== 'ready';
  return <main className="pi-practice" aria-label={zh ? '比较练习' : 'Comparison exercise'}>
    <button type="button" onClick={onBack}>← {zh ? '返回原比较' : 'Back to the comparison'}</button>
    <header><p>{zh ? '学习 · 以原比较证据为依据' : 'STUDY · GROUNDED IN THE ORIGINAL COMPARISON'}</p><h1>{zh ? '把比较变成研究成果' : 'Turn comparison into research work'}</h1><p>{zh ? '沿用已核对的练习与证据，不替换已有学习路径；完成状态由你确认。' : 'Use reviewed exercises and evidence without replacing your learning path. You confirm completion.'}</p></header>
    {error && <p role="alert">{error} <button type="button" disabled={Boolean(busy)} onClick={() => setReload(value => value + 1)}>{zh ? '重新载入' : 'Reload'}</button></p>}
    {notice && <p role="status">{notice}</p>}
    {busy === 'load' && <p role="status">{zh ? '正在读取原比较与练习记录…' : 'Loading the comparison and exercise records…'}</p>}
    {state?.stale && <p role="alert">{zh ? '来源或研究问题已变化。本页可回顾旧成果，请回到比较更新材料后再继续。' : 'Sources or the research question changed. Review past results here; update evidence in the comparison before continuing.'}</p>}
    {task && practice && <>
      <p className="pi-practice-progress">{progress!.completed}/{progress!.total} {zh ? '项由你确认完成' : 'tasks confirmed complete by you'}{progress!.allCompleted ? (zh ? ' · 全部完成，可回顾成果' : ' · All complete; revisit your results') : ''} · {state?.artifact ? (zh ? `已保存版本 ${state.artifact.revision}` : `Saved revision ${state.artifact.revision}`) : (zh ? '尚未保存' : 'Not saved yet')}</p>
      <div className="pi-practice-layout"><nav aria-label={zh ? '练习任务' : 'Exercise tasks'}>{tasks.map((item, index) => <button type="button" key={item.id} aria-current={item.id === task.id ? 'step' : undefined} onClick={() => { edit({ ...practice, activeId: item.id }); onSelect(item.id); }}>{practice.entries[item.id]?.completed ? '✓' : String(index + 1).padStart(2, '0')} · {item.id === 'learning' ? (zh ? '学习练习' : 'Learning exercise') : (zh ? `研究核查 ${index + 1}` : `Research check ${index + 1}`)}</button>)}</nav>
      <section><h2><MathText inline>{zh ? task.titleZh : task.titleEn}</MathText></h2><p><MathText>{zh ? task.goalZh : task.goalEn}</MathText></p>
        {task.id === 'learning' && <p><strong>{zh ? '需要的基础：' : 'Prerequisites: '}</strong><MathText>{zh ? state!.content!.learning.prerequisiteZh : state!.content!.learning.prerequisiteEn}</MathText></p>}
        <details><summary>{zh ? '核对原文与比较依据' : 'Check sources and comparison evidence'}</summary>{task.evidenceIds.map(id => { const dimension = state!.content!.dimensions.find(item => id.startsWith(item.id + ':')), source = state!.sources.find(item => id.endsWith(':' + item.id)), cell = dimension?.cells.find(item => item.paperId === source?.id); return source && cell && <article key={id}><h3>{source.title}</h3>{(cell.quotes || (cell.quote ? [cell.quote] : [])).map((quote, index) => <blockquote key={index}>{quote}<cite>{zh ? '该论文摘要' : 'Paper abstract'}</cite></blockquote>)}<button type="button" onClick={() => onOpenPaper(source, zh ? task.goalZh : task.goalEn)}>{zh ? '带着任务打开论文' : 'Open paper for this task'} →</button></article>; })}</details>
        <h3>{zh ? '本项完成标准' : 'Completion check'}</h3><p><MathText>{zh ? task.checkpointZh : task.checkpointEn}</MathText></p>
        <DraftRecovery key={draftKey} storageKey={draftKey} current={JSON.stringify(practice)} base={base} locale={locale} onRestore={value => { try { const restored = validateWorkbookPractice(JSON.parse(value), state!.content!); edit(restored); onSelect(restored.activeId); } catch { setError(zh ? '草稿无法读取，已保存记录保留。' : 'Draft unavailable; saved records preserved.'); } }} />
        <label>{zh ? '本项成果与依据' : 'Result and supporting evidence'}<textarea rows={6} maxLength={4000} value={entry.result} disabled={disabled} onChange={event => edit({ ...practice, entries: { ...practice.entries, [task.id]: { ...entry, result: event.target.value, completed: false } } })} /></label>
        <label>{zh ? '仍需查证的问题' : 'Questions still to verify'}<textarea rows={3} maxLength={2500} value={entry.unresolved} disabled={disabled} onChange={event => edit({ ...practice, entries: { ...practice.entries, [task.id]: { ...entry, unresolved: event.target.value, completed: false } } })} /></label>
        <footer><button type="button" disabled={disabled || !dirty} onClick={() => void save()}>{zh ? '保存成果' : 'Save result'}</button><button className="primary" type="button" disabled={disabled || !entry.result.trim() || entry.completed} onClick={() => void save(true)}>{entry.completed ? (zh ? '本项已完成' : 'Task complete') : (zh ? '保存并确认完成，继续下一项' : 'Save, mark complete & continue')}</button></footer>
        <p className="pi-practice-caption">{zh ? '这是你的练习与自查记录，不代表模型已证明结论，也不会自动标记论文已读或掌握。' : 'These are your exercise and self-check records, not a model-verified proof. Papers are not automatically marked read or mastered.'}</p>
      </section></div>
    </>}
  </main>;
}
