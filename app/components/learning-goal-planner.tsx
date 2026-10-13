'use client';
import { workspaceFetch as fetch } from "../../lib/workspace-request";


import { useEffect, useRef, useState } from 'react';
import { LEARNING_GOALS, type LearningGoal, type LearningPlanPreview } from '../../lib/learning-goal';
import type { GraphTaskContext } from '../../lib/graph-task';
import type { LearningPath } from '../../lib/learning-path';

type Track = { id: string; titleZh: string; titleEn: string };
export function LearningGoalPlanner({ spaceId, tracks, target, trackId, path, locale, open, onOpen, onCommit, busy, taskContext, onRead }: {
  spaceId: string; tracks: Track[]; target: string; trackId: string | null; path: LearningPath | null;
  locale: 'zh' | 'en'; open: boolean; onOpen: (open: boolean) => void;
  onCommit: (previewId: string) => Promise<void>; busy: boolean; taskContext?: GraphTaskContext; onRead?: (paperId:string)=>void;
}) {
  const zh = locale === 'zh';
  const [selected, setSelected] = useState(trackId || 'custom');
  const [topic, setTopic] = useState(target);
  const [goal, setGoal] = useState<LearningGoal>(path?.learningGoal || 'papers');
  const [background, setBackground] = useState(taskContext?.question || path?.learnerBackground || '');
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
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaceId, action: 'preview', target: topic.trim(), trackId: selected === 'custom' ? null : selected, goal, background, preferredCanonicalIds:taskContext?.papers.map(p=>p.canonicalId) || [] }) });
      const data = await response.json() as { preview?: LearningPlanPreview };
      if (!response.ok || !data.preview) throw new Error(String(response.status));
      if (request.current === controller && !controller.signal.aborted) setPreview(data.preview);
    } catch (failure) {
      if (request.current === controller) setError(zh ? (failure instanceof Error && failure.message === '409' ? '材料或当前路径已变化，请重新预览。' : '本次规划未完成，请稍后重试。原路径仍保留。') : 'Planning did not finish, or the materials changed. Retry the preview; your saved path is preserved.');
    } finally { clearTimeout(timer); if (request.current === controller) setLoading(false); }
  };
  return <section className={`pi-goal-planner${preview ? ' has-preview' : ''}`} id="learning-goal-planner" hidden={Boolean(path && !open && !taskContext?.readingTask)}>
    {taskContext?.readingTask && <aside className="pi-start-confirm"><h3>{zh?'第一项阅读任务':'Your first reading task'}</h3><p>{(zh?taskContext.readingTask.focusZh:taskContext.readingTask.focusEn)||(zh?'核对原论文的研究对象、假设与结论。':'Check the objects, assumptions and conclusions in the original paper.')}</p><p>{zh?'在论文笔记中记录：采用的假设、关键结论、与你目标的联系，以及仍需核查的问题。保存后可返回学习页，继续规划。':'Record assumptions, key conclusions, links to your goal and open checks in the paper notes. Return here after saving to continue planning.'}</p>{onRead&&<button type="button" onClick={()=>onRead(taskContext.readingTask!.paperId)}>{zh?'打开起点论文，开始阅读':'Open the starting paper'} →</button>}</aside>}
    <button type="button" className="pi-goal-toggle" aria-expanded={open} aria-controls="learning-goal-fields" onClick={() => onOpen(!open)}>{path ? (zh ? '调整学习计划' : 'Edit learning plan') : (zh ? '建立学习计划' : 'Create a learning plan')}<span>{open ? (zh ? '收起' : 'Collapse') : (zh ? '编辑' : 'Edit')}</span></button>
    {open && <div id="learning-goal-fields" className={`pi-goal-fields${preview ? " has-preview" : ""}`}>
      <div className="pi-goal-inputs">
        {taskContext?.papers.length ? <aside className="pi-graph-handoff"><strong>{zh ? '本次目标的起点材料' : 'Starting papers for this goal'}</strong><ul>{taskContext.papers.map(p=><li key={p.canonicalId}>{p.title}</li>)}</ul><p>{zh ? '优先考虑这些论文，同时补充必要基础；未经评审或不适合的材料不会强行加入阶段。' : 'Prioritize these papers and add prerequisites where needed. Unreviewed or unsuitable papers cannot fill stages.'}</p></aside> : null}
        {selected === 'custom' && <label className="pi-goal-topic">{zh ? '学习目标' : 'Learning topic'}<input value={topic} maxLength={240} disabled={busy} placeholder={zh ? '例如：高斯信源率失真函数的计算方法' : 'For example: computing Gaussian rate-distortion functions'} onChange={e => { invalidate(); setTopic(e.target.value); }} /></label>}
        <div className="pi-goal-controls">
          <label>{selected === 'custom' ? (zh ? '已有研究方向' : 'Existing research direction') : (zh ? '学习目标' : 'Learning topic')}<select value={selected} disabled={busy} onChange={e => choose(e.target.value)}><option value="custom">{zh ? '自定义目标' : 'Custom topic'}</option>{tracks.map(t => <option key={t.id} value={t.id}>{zh ? t.titleZh : t.titleEn}</option>)}</select></label>
          <label>{zh ? '学习程度' : 'Desired outcome'}<select value={goal} disabled={busy} onChange={e => { invalidate(); setGoal(e.target.value as LearningGoal); }}>{Object.entries(LEARNING_GOALS).map(([id, label]) => <option key={id} value={id}>{label[locale]}</option>)}</select></label>
        </div>
        <p className="pi-goal-material-note">{zh ? '从本空间的可用文献中匹配，缺少材料的阶段会标记待补。' : 'Matches eligible papers in this workspace. Stages with no matching material remain pending.'}</p>
        <label className="pi-goal-background">{goal === 'research' ? (zh ? '研究问题（必填）' : 'Research question (required)') : (zh ? '补充背景与疑问（选填）' : 'Background and questions (optional)')}<textarea rows={3} maxLength={1000} disabled={busy} value={background} placeholder={zh ? '例如：学过基础信息论，希望理解多元情形需要哪些条件。' : 'What do you already know, and where do you get stuck?'} onChange={e => { invalidate(); setBackground(e.target.value); }} /></label>
        <div className="pi-goal-actions"><button className="primary" type="button" disabled={busy || loading || topic.trim().length < 4 || (goal === 'research' && background.trim().length < 12)} onClick={() => void prepare()}>{loading ? (zh ? '正在匹配材料与规划…' : 'Matching papers and planning…') : (zh ? '预览学习路径' : 'Preview learning path')}</button><span>{zh ? '确认后才替换当前路径。' : 'Your current path changes only after confirmation.'}</span></div>
        {error && <p role="alert">{error}</p>}
      </div>
      {preview && <section className="pi-goal-preview" aria-label={zh ? '路径预览' : 'Path preview'}>
        <header><span>{zh ? '路径预览' : 'PATH PREVIEW'}</span><h2>{preview.target}</h2><p>{LEARNING_GOALS[preview.goal][locale]} · {preview.materialCount} {zh ? '篇拟采用材料' : 'selected papers'}</p></header>
        {Boolean(preview.missingPreferred?.length) && <p role="status">{zh ? `已选材料中有 ${preview.missingPreferred!.length} 篇尚不可用于学习规划，未将其他论文冒充为这些选择。` : `${preview.missingPreferred!.length} selected paper(s) are not eligible for planning; they were not substituted.`}</p>}
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
