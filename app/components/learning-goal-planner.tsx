'use client';

import { useEffect, useRef, useState } from 'react';
import { LEARNING_GOALS, type LearningGoal, type LearningPlanPreview } from '../../lib/learning-goal';
import type { LearningPath } from '../../lib/learning-path';

type Track = { id: string; titleZh: string; titleEn: string };
export function LearningGoalPlanner({ spaceId, tracks, target, trackId, path, locale, open, onOpen, onCommit, busy }: {
  spaceId: string; tracks: Track[]; target: string; trackId: string | null; path: LearningPath | null;
  locale: 'zh' | 'en'; open: boolean; onOpen: (open: boolean) => void;
  onCommit: (previewId: string) => Promise<void>; busy: boolean;
}) {
  const zh = locale === 'zh';
  const [selected, setSelected] = useState(trackId || 'custom');
  const [topic, setTopic] = useState(target);
  const [goal, setGoal] = useState<LearningGoal>(path?.learningGoal || 'papers');
  const [background, setBackground] = useState(path?.learnerBackground || '');
  const [preview, setPreview] = useState<LearningPlanPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  const invalidate = () => { request.current?.abort(); request.current = null; setLoading(false); setPreview(null); setError(''); };
  const choose = (id: string) => {
    invalidate(); setSelected(id);
    const track = tracks.find(t => t.id === id);
    if (track) setTopic(zh ? track.titleZh : track.titleEn);
  };
  const prepare = async () => {
    invalidate(); const controller = new AbortController(); request.current = controller; setLoading(true);
    const timer = setTimeout(() => controller.abort(), 270_000);
    try {
      const response = await fetch('/api/learning-path', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaceId, action: 'preview', target: topic.trim(), trackId: selected === 'custom' ? null : selected, goal, background }) });
      const data = await response.json() as { preview?: LearningPlanPreview };
      if (!response.ok || !data.preview) throw new Error(String(response.status));
      if (request.current === controller && !controller.signal.aborted) setPreview(data.preview);
    } catch (failure) {
      if (request.current === controller) setError(zh ? (failure instanceof Error && failure.message === '409' ? '材料或当前路径已变化，请重新预览。' : '本次规划未完成，请稍后重试。原路径仍保留。') : 'Planning did not finish, or the materials changed. Retry the preview; your saved path is preserved.');
    } finally { clearTimeout(timer); if (request.current === controller) setLoading(false); }
  };
  const suggestions = selected === 'custom' ? tracks.filter(t => !topic.trim() || `${t.titleZh} ${t.titleEn}`.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(t.titleZh.toLowerCase())).slice(0, 3) : [];
  return <section className="pi-goal-planner" id="learning-goal-planner">
    <button type="button" className="pi-goal-toggle" aria-expanded={open} aria-controls="learning-goal-fields" onClick={() => onOpen(!open)}>{zh ? '学习目标与路径规划' : 'Learning goal & planning'}<span>{open ? '−' : '+'}</span></button>
    {open && <div id="learning-goal-fields" className="pi-goal-fields">
      <div className="pi-goal-inputs">
        <label>{zh ? '学习方向' : 'Study topic'}<select value={selected} disabled={busy} onChange={e => choose(e.target.value)}><option value="custom">{zh ? '自己输入目标' : 'Enter my own topic'}</option>{tracks.map(t => <option key={t.id} value={t.id}>{zh ? t.titleZh : t.titleEn}</option>)}</select></label>
        {selected === 'custom' && <label>{zh ? '具体想学什么' : 'What do you want to learn?'}<input value={topic} maxLength={240} disabled={busy} placeholder={zh ? '例如：高斯信源率失真函数的计算方法' : 'For example: computing Gaussian rate-distortion functions'} onChange={e => { invalidate(); setTopic(e.target.value); }} /><small>{zh ? '从当前空间的已评审材料中匹配；输入新领域不代表已有对应材料。' : 'Matches reviewed papers in this workspace. A new topic may have no matching material.'}</small></label>}
        {suggestions.length > 0 && <div className="pi-goal-suggestions"><span>{zh ? '可选的研究方向' : 'Available research directions'}</span>{suggestions.map(t => <button key={t.id} type="button" disabled={busy} onClick={() => choose(t.id)}>{zh ? t.titleZh : t.titleEn}</button>)}</div>}
        <label>{zh ? '希望达到什么程度' : 'Desired outcome'}<select value={goal} disabled={busy} onChange={e => { invalidate(); setGoal(e.target.value as LearningGoal); }}>{Object.entries(LEARNING_GOALS).map(([id, label]) => <option key={id} value={id}>{label[locale]}</option>)}</select></label>
        <label>{goal === 'research' ? (zh ? '想回答的研究问题（必填）' : 'Research question (required)') : (zh ? '已有基础与想解决的问题（选填）' : 'Background and specific questions (optional)')}<textarea rows={3} maxLength={1000} disabled={busy} value={background} placeholder={zh ? '例如：学过基础信息论，希望理解多元情形需要哪些条件。' : 'What do you already know, and where do you get stuck?'} onChange={e => { invalidate(); setBackground(e.target.value); }} /></label>
        <div className="pi-goal-actions"><button className="primary" type="button" disabled={busy || loading || topic.trim().length < 4 || (goal === 'research' && background.trim().length < 12)} onClick={() => void prepare()}>{loading ? (zh ? '正在匹配材料与规划…' : 'Matching papers and planning…') : (zh ? '预览学习路径' : 'Preview learning path')}</button><span>{zh ? '确认后才替换当前路径。' : 'Your current path changes only after confirmation.'}</span></div>
        {error && <p role="alert">{error}</p>}
      </div>
      {preview && <section className="pi-goal-preview" aria-label={zh ? '路径预览' : 'Path preview'}>
        <header><span>{zh ? '路径预览' : 'PATH PREVIEW'}</span><h2>{preview.target}</h2><p>{LEARNING_GOALS[preview.goal][locale]} · {preview.materialCount} {zh ? '篇拟采用材料' : 'selected papers'}</p></header>
        <p>{zh ? `已检查 ${preview.candidateCount} 篇可用材料；没有匹配论文的阶段保持待补。` : `${preview.candidateCount} available papers considered. Stages with no matching paper remain pending.`}</p>
        {!preview.modelPlanned && <p role="status">{zh ? '当前材料不足，下面是待完善的阶段框架，尚未完成个性化规划。' : 'There is not enough material for personalized planning. This is an incomplete stage outline.'}</p>}
        <ol>{preview.steps.map(step => <li key={step.kind}><h3>{zh ? step.titleZh : step.titleEn}</h3><p>{zh ? step.goalZh : step.goalEn}</p>{step.papers.length ? <ul>{step.papers.map(p => <li key={p.id}>{p.title}</li>)}</ul> : <span className="pi-preview-missing">{zh ? '材料待补齐' : 'Material needed'}</span>}<p className="pi-preview-checkpoint">{zh ? '检查点：' : 'Checkpoint: '}{zh ? step.checkpointZh : step.checkpointEn}</p></li>)}</ol>
        <p>{zh ? '建立新路径后会重新匹配阶段；论文笔记与阅读记录保留。' : 'Stages are matched again for the new path. Paper notes and reading records are preserved.'}</p>
        <button type="button" className="primary" disabled={busy || loading} onClick={() => void onCommit(preview.id)}>{busy ? (zh ? '正在保存…' : 'Saving…') : path ? (zh ? '使用这条路径' : 'Use this path') : (zh ? '开始这条路径' : 'Start this path')}</button>
      </section>}
    </div>}
  </section>;
}

export function LearningPathHeader({ path, locale, onAdjust, onRefresh, busy }: { path: LearningPath; locale: 'zh' | 'en'; onAdjust: () => void; onRefresh: () => void; busy: boolean }) {
  const zh = locale === 'zh'; const current = path.steps.find(s => s.status !== 'completed');
  const papers = new Set(path.steps.flatMap(s => s.resources.map(r => r.canonicalId || r.id))).size;
  return <header className="pi-current-path"><div className="pi-current-path-title"><div><span>{zh ? '正在学习' : 'CURRENT STUDY'}</span><h2>{path.target}</h2><p>{path.learningGoal ? LEARNING_GOALS[path.learningGoal][locale] : (zh ? '尚未选择学习程度，可在调整目标中补充。' : 'Choose a learning outcome under Adjust goal.')}</p></div><div className="pi-current-path-actions"><button type="button" onClick={onAdjust}>{zh ? '调整目标' : 'Adjust goal'}</button><button type="button" disabled={busy} onClick={onRefresh}>{zh ? '更新本路径材料' : 'Refresh path materials'}</button></div></div><div className="pi-current-path-progress"><strong>{current ? (zh ? current.titleZh : current.titleEn) : (zh ? '已完成全部阶段' : 'All stages complete')}</strong><span>{path.completedSteps}/{path.steps.length} {zh ? '阶段完成' : 'stages complete'}</span><span>{papers} {zh ? '篇路径材料' : 'path papers'}</span><progress value={path.completedSteps} max={Math.max(1, path.steps.length)} aria-label={zh ? '阶段进度' : 'Stage progress'} /></div></header>;
}
