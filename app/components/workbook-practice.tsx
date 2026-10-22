'use client';
import { useEffect, useRef, useState } from 'react';
import { workspaceFetch as fetch } from '../../lib/workspace-request';
import type { WorkbookSource, WorkbookState } from '../../lib/research-workbook';
import { completePractice, practiceProgress, validateWorkbookPractice, workbookPracticeTasks, type WorkbookPractice as Practice } from '../../lib/workbook-practice';
import { sessionDraftKey, writeSessionDraft, clearSessionDraft } from '../../lib/session-draft';
import { DraftRecovery } from './draft-recovery';
import { mergePractice, type PracticeConflict } from '../../lib/practice-merge';
import { MathText } from './math-text';
import './workbook-practice.css';

export function WorkbookPractice({ userId, spaceId, trackId, workbookId, practiceId = '', locale, onSelect, onOpenPaper, onBack, onSaved }: {
  userId: string; spaceId: string; trackId: string; workbookId: string; practiceId?: string; locale: 'zh' | 'en';
  onSelect: (id: string) => void; onOpenPaper: (source: WorkbookSource, focus: string) => void; onBack: () => void; onSaved?: () => void;
}) {
  const zh = locale === 'zh', [state, setState] = useState<WorkbookState | null>(null), [practice, setPractice] = useState<Practice | null>(null);
  const [busy, setBusy] = useState('load'), [error, setError] = useState(''), [notice, setNotice] = useState(''), [reload, setReload] = useState(0);
  const [conflicts, setConflicts] = useState<PracticeConflict[]>([]);
  const generation = useRef(0), selection = useRef(practiceId);
  useEffect(()=>{selection.current=practiceId;},[practiceId]);
  useEffect(() => {
    const abort = new AbortController(), epoch = ++generation.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the scoped external read while retaining session drafts under their own workbook key.
    setBusy('load'); setError(''); setState(null); setPractice(null); setConflicts([]);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- The URL selection is external navigation state, including browser back/forward.
    if (state?.content && workbookPracticeTasks(state.content).some(task => task.id === practiceId)) setPractice(value => value ? { ...value, activeId: practiceId } : value);
  }, [practiceId, state?.content]);
  const draftKey = sessionDraftKey(userId, spaceId, `practice:${workbookId}`);
  const savedPractice = state?.artifact?.value.practice || null;
  const base = JSON.stringify(savedPractice), dirty = Boolean(practice && JSON.stringify(practice) !== base);
  const edit = (value: Practice) => {
    setPractice(value); setNotice('');
    if (!writeSessionDraft(draftKey, base, JSON.stringify(value))) setError(zh ? '无法暂存，请保存后再离开。' : 'Draft storage unavailable. Save before leaving.');
  };
  const reconcile = (latest: WorkbookState, local: Practice, original: Practice | null) => {
    setError('');
    const merged = mergePractice(original, local, latest.artifact?.value.practice || null);
    setState(latest); setPractice(merged.value); setConflicts(merged.conflicts);
    // Keep the original base while choices are pending so a refresh can reconstruct the conflicts.
    if (!writeSessionDraft(draftKey, JSON.stringify(merged.conflicts.length ? original : latest.artifact?.value.practice || null), JSON.stringify(merged.conflicts.length ? local : merged.value))) {
      setError(zh ? '无法暂存，请完成核对并保存后再离开。' : 'Draft storage unavailable. Review and save before leaving.');
    }
    setNotice(merged.conflicts.length ? (zh ? '已读取最新记录。不同字段已合并，请逐项选择冲突内容；尚未提交。' : 'Latest record loaded. Independent changes merged; choose each conflicting field. Nothing submitted yet.') : (zh ? '已合并最新记录与本地输入，请核对后再次保存。' : 'Latest record merged with local input. Review and save again.'));
  };
  const recover = async () => {
    if (!practice || !state || busy) return;
    const epoch = generation.current; setBusy('recover'); setError('');
    try {
      const response = await fetch('/api/research-workbook?' + new URLSearchParams({ spaceId, trackId, workbookId }));
      if (!response.ok) throw Error();
      const data = await response.json() as { workbook: WorkbookState }, latest = data.workbook;
      if (generation.current !== epoch) return;
      if (latest.id !== workbookId || !latest.content) throw Error();
      if (latest.stale || latest.status !== 'ready' || latest.revision !== state.revision || JSON.stringify(latest.content) !== JSON.stringify(state.content)) {
        setState({ ...state, stale: true });
        setError(zh ? '材料已变化，本地输入与草稿保留。请返回原比较核对来源；旧成果不会写入新材料。' : 'Evidence changed. Local input and draft preserved. Review sources in the comparison before continuing.');
        return;
      }
      reconcile(latest, practice, savedPractice);
    } catch { if (generation.current === epoch) setError(zh ? '最新记录暂未读取，输入仍保留，请重试读取。' : 'Latest record unavailable. Input preserved; retry loading the latest record.'); }
    finally { if (generation.current === epoch) setBusy(''); }
  };
  const save = async (complete = false) => {
    if (!practice || !state?.content || busy || conflicts.length || state.stale || state.status !== 'ready') return;
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
      setError(failure instanceof Error && failure.message === '409' ? (zh ? '保存版本已变化，输入仍保留。请读取最新记录并合并，再保存。' : 'Saved revision changed. Input preserved. Load the latest record to merge before saving.') : (zh ? '保存未完成，输入仍保留，请重试。' : 'Save failed. Input preserved; retry.'));
    } finally { if (generation.current === epoch) setBusy(''); }
  };
  const tasks = state?.content ? workbookPracticeTasks(state.content) : [], task = tasks.find(item => item.id === practice?.activeId);
  const entry = practice?.entries[practice.activeId] || { result: '', unresolved: '', completed: false };
  const progress = state?.content && practice ? practiceProgress(state.content, practice) : null;
  const disabled = Boolean(busy) || Boolean(conflicts.length) || !state || state.stale || state.status !== 'ready';
  return <main className="pi-practice" aria-label={zh ? '比较练习' : 'Comparison exercise'}>
    <button type="button" onClick={onBack}>← {zh ? '返回原比较' : 'Back to the comparison'}</button>
    <header><p>{zh ? '学习 · 以原比较证据为依据' : 'STUDY · GROUNDED IN THE ORIGINAL COMPARISON'}</p><h1>{zh ? '把比较变成研究成果' : 'Turn comparison into research work'}</h1><p>{zh ? '沿用已核对的练习与证据，不替换已有学习路径；完成状态由你确认。' : 'Use reviewed exercises and evidence without replacing your learning path. You confirm completion.'}</p></header>
    {error && <p role="alert">{error} <button type="button" disabled={Boolean(busy) || Boolean(state?.stale)} onClick={() => practice ? void recover() : setReload(value => value + 1)}>{practice ? (zh ? '读取最新记录并合并' : 'Load latest and merge') : (zh ? '重新载入' : 'Reload')}</button></p>}
    {notice && <p role="status">{notice}</p>}
    {conflicts.length > 0 && <section className="pi-practice-conflicts" aria-label={zh ? '核对保存冲突' : 'Review save conflicts'}><h2>{zh ? '选择要保留的内容' : 'Choose content to keep'}</h2><p>{zh ? '编辑区暂时锁定。选择只更新本地草稿，核对完成后仍需点击保存。合并修改后的任务需要重新确认完成。' : 'Editor locked during review. Choices only update the local draft; save after reviewing. Changed tasks require completion confirmation again.'}</p>{conflicts.map(conflict => <article key={conflict.taskId + conflict.field}><h3>{conflict.taskId === 'learning' ? (zh ? '学习练习' : 'Learning exercise') : (zh ? `研究核查 ${Number(conflict.taskId.slice(5)) + 1}` : `Research check ${Number(conflict.taskId.slice(5)) + 1}`)} · {conflict.field === 'result' ? (zh ? '成果与依据' : 'Result') : (zh ? '待查问题' : 'Open questions')}</h3>{(['local', 'remote'] as const).map(side => <div key={side}><strong>{side === 'local' ? (zh ? '本地输入' : 'Local input') : (zh ? '最新记录' : 'Latest record')}</strong><p className="pi-practice-conflict-value">{conflict[side] || (zh ? '（空内容）' : '(Empty)')}</p><button type="button" onClick={() => {
      const value = { ...practice!, entries: { ...practice!.entries, [conflict.taskId]: { ...practice!.entries[conflict.taskId], [conflict.field]: conflict[side], completed: false } } };
      const remaining = conflicts.filter(item => item !== conflict);
      setPractice(value); setConflicts(remaining);
      // Until all choices are resolved, retain the original recoverable draft rather than a partial merge.
      if (!remaining.length) edit(value);
    }}>{side === 'local' ? (zh ? '保留本地输入' : 'Keep local input') : (zh ? '采用最新记录' : 'Use latest record')}</button></div>)}</article>)}</section>}
    {busy === 'load' && <p role="status">{zh ? '正在读取原比较与练习记录…' : 'Loading the comparison and exercise records…'}</p>}
    {state?.stale && <p role="alert">{zh ? '来源或研究问题已变化。本页可回顾旧成果，请回到比较更新材料后再继续。' : 'Sources or the research question changed. Review past results here; update evidence in the comparison before continuing.'}</p>}
    {task && practice && <>
      <p className="pi-practice-progress">{progress!.completed}/{progress!.total} {zh ? '项由你确认完成' : 'tasks confirmed complete by you'}{progress!.allCompleted ? (zh ? ' · 全部完成，可回顾成果' : ' · All complete; revisit your results') : ''} · {state?.artifact ? (zh ? `已保存版本 ${state.artifact.revision}` : `Saved revision ${state.artifact.revision}`) : (zh ? '尚未保存' : 'Not saved yet')}</p>
      <div className="pi-practice-layout"><nav aria-label={zh ? '练习任务' : 'Exercise tasks'}>{tasks.map((item, index) => <button type="button" key={item.id} aria-current={item.id === task.id ? 'step' : undefined} disabled={Boolean(busy) || Boolean(conflicts.length)} onClick={() => { edit({ ...practice, activeId: item.id }); onSelect(item.id); }}>{practice.entries[item.id]?.completed ? '✓' : String(index + 1).padStart(2, '0')} · {item.id === 'learning' ? (zh ? '学习练习' : 'Learning exercise') : (zh ? `研究核查 ${index + 1}` : `Research check ${index + 1}`)}</button>)}</nav>
      <section><h2><MathText inline>{zh ? task.titleZh : task.titleEn}</MathText></h2><p><MathText>{zh ? task.goalZh : task.goalEn}</MathText></p>
        {task.id === 'learning' && <p><strong>{zh ? '需要的基础：' : 'Prerequisites: '}</strong><MathText>{zh ? state!.content!.learning.prerequisiteZh : state!.content!.learning.prerequisiteEn}</MathText></p>}
        <details><summary>{zh ? '核对原文与比较依据' : 'Check sources and comparison evidence'}</summary>{task.evidenceIds.map(id => { const dimension = state!.content!.dimensions.find(item => id.startsWith(item.id + ':')), source = state!.sources.find(item => id.endsWith(':' + item.id)), cell = dimension?.cells.find(item => item.paperId === source?.id); return source && cell && <article key={id}><h3>{source.title}</h3>{(cell.quotes || (cell.quote ? [cell.quote] : [])).map((quote, index) => <blockquote key={index}>{quote}<cite>{zh ? '该论文摘要' : 'Paper abstract'}</cite></blockquote>)}<button type="button" onClick={() => onOpenPaper(source, zh ? task.goalZh : task.goalEn)}>{zh ? '带着任务打开论文' : 'Open paper for this task'} →</button></article>; })}</details>
        <h3>{zh ? '本项完成标准' : 'Completion check'}</h3><p><MathText>{zh ? task.checkpointZh : task.checkpointEn}</MathText></p>
        {!conflicts.length && <DraftRecovery key={draftKey} storageKey={draftKey} current={JSON.stringify(practice)} base={base} locale={locale} onRestore={(value, draftBase) => { try { const restored = validateWorkbookPractice(JSON.parse(value), state!.content!); const original = JSON.parse(draftBase) as Practice | null; if (original) validateWorkbookPractice(original, state!.content!); reconcile(state!, restored, original); onSelect(restored.activeId); } catch { setError(zh ? '草稿无法读取，已保存记录保留。' : 'Draft unavailable; saved records preserved.'); } }} />}
        <label>{zh ? '本项成果与依据' : 'Result and supporting evidence'}<textarea rows={6} maxLength={4000} value={entry.result} disabled={disabled} onChange={event => edit({ ...practice, entries: { ...practice.entries, [task.id]: { ...entry, result: event.target.value, completed: false } } })} /></label>
        <label>{zh ? '仍需查证的问题' : 'Questions still to verify'}<textarea rows={3} maxLength={2500} value={entry.unresolved} disabled={disabled} onChange={event => edit({ ...practice, entries: { ...practice.entries, [task.id]: { ...entry, unresolved: event.target.value, completed: false } } })} /></label>
        <footer><button type="button" disabled={disabled || !dirty} onClick={() => void save()}>{zh ? '保存成果' : 'Save result'}</button><button className="primary" type="button" disabled={disabled || !entry.result.trim() || entry.completed} onClick={() => void save(true)}>{entry.completed ? (zh ? '本项已完成' : 'Task complete') : (zh ? '保存并确认完成，继续下一项' : 'Save, mark complete & continue')}</button></footer>
        <p className="pi-practice-caption">{zh ? '这是你的练习与自查记录，不代表模型已证明结论，也不会自动标记论文已读或掌握。' : 'These are your exercise and self-check records, not a model-verified proof. Papers are not automatically marked read or mastered.'}</p>
      </section></div>
    </>}
  </main>;
}
