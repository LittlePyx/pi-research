"use client";
import { workspaceFetch as fetch } from "../../lib/workspace-request";


import { useEffect, useRef, useState } from "react";
import type { WorkbookArtifact, WorkbookSource, WorkbookState } from "../../lib/research-workbook";
import { workbookPaperLabel } from '../../lib/research-workbook';
import { graphSelection, type GraphTaskContext } from "../../lib/graph-task";
import { DraftRecovery } from "./draft-recovery";
import { sessionDraftKey, readSessionDraft, writeSessionDraft, clearSessionDraft } from "../../lib/session-draft";
import {comparisonInputKey,comparisonQuestionKey,migrateComparisonQuestionDraft,readComparisonInput,writeComparisonInput} from '../../lib/comparison-input';
import { MathText } from "./math-text";
import {workbookPresentation,workbookStatusLabel} from "../../lib/workbook-presentation";
import { workbookResponseDetailText } from "../../lib/workbook-recovery";
import {appendWorkbookResult} from '../../lib/workbook-followup';
import {WorkbookFollowup} from './workbook-followup';
import "./research-workbook.css";

const emptyArtifact = (): WorkbookArtifact => ({ observations: {}, decision: "", unresolved: "" });
function reviewIssueLabel(id: string, zh: boolean) {
  const names: Record<string, [string, string]> = { question: ['比较问题', 'Comparison question'], dimension: ['比较维度', 'Comparison dimension'], cell: ['摘要内容与出处', 'Abstract claim and evidence'], comparison: ['比较结论', 'Comparison conclusion'], 'task:title': ['研究任务', 'Research task'], 'task:criterion': ['任务完成标准', 'Task completion criteria'], 'learning:goal': ['学习目标', 'Learning goal'], 'learning:prerequisite': ['学习基础', 'Learning prerequisites'], 'learning:exercise': ['学习练习', 'Learning exercise'], 'learning:checkpoint': ['学习检查标准', 'Learning checkpoint'] };
  if (id.startsWith('task:step:')) return `${zh ? '任务步骤' : 'Task step'} ${Number(id.split(':')[2]) + 1}`;
  return (names[id] || names[id.split(':')[0]] || ['内容核对', 'Content review'])[zh ? 0 : 1];
}
type WorkbookResponse = { workbook: WorkbookState; versions: Array<{ id: string; status: string; created_at: string }>; error?: string };
type WorkbookPanel="evidence"|"relations"|"task";
export function ResearchWorkbook({ userId, spaceId, trackId, locale, onOpenPaper, onBack, taskContext, initialWorkbookId="", onWorkbookChange, initialPanel="evidence", initialFocus="", onViewChange, onStartPractice, refreshKey=0, active=true }: {
  active?: boolean; userId: string; spaceId: string; trackId: string; locale: "zh" | "en"; taskContext?: GraphTaskContext;
  onOpenPaper: (source: WorkbookSource, focus: string) => void;
  onBack: () => void;
  initialWorkbookId?: string; onWorkbookChange?: (id: string) => void;
  initialPanel?:WorkbookPanel;initialFocus?:string;onViewChange?:(panel:WorkbookPanel,focus:string)=>void; onStartPractice?:(id:string)=>void; refreshKey?:number;
}) {
  const [state, setState] = useState<WorkbookState | null>(null);
  const [versions, setVersions] = useState<Array<{ id: string; status: string; created_at: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [allowRepair, setAllowRepair] = useState(false);
  const [comparisonQuestion, setComparisonQuestion] = useState(taskContext?.question || '');
  const [panel, setPanel] = useState<WorkbookPanel>(initialPanel);
  const [focus, setFocus] = useState(initialFocus);
  const [restoredView, setRestoredView] = useState({spaceId,trackId,panel:initialPanel,focus:initialFocus});
  const [artifact, setArtifact] = useState<WorkbookArtifact>(emptyArtifact);
  const [busy, setBusy] = useState("load"); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [draftStored,setDraftStored]=useState(true);
  const [saveConflict,setSaveConflict]=useState(false);
  const generation = useRef(0);
  const [loadRetry,setLoadRetry]=useState(0);
  const [now, setNow] = useState(() => Date.now());
  const zh = locale === "zh";
  const content = state?.content;
  const text = (value: { [key: string]: unknown }, key: string) => String(value[`${key}${zh ? "Zh" : "En"}`] || "");
  const draftKey = sessionDraftKey(userId, spaceId, `workbook:${trackId}:${state?.id || ""}:${state?.revision || ""}`);
  const questionDraftKey = comparisonQuestionKey(userId,spaceId,trackId,state?.id||initialWorkbookId);
  const inputKey=comparisonInputKey(userId,spaceId,trackId,state?.id||initialWorkbookId);
  const retainInputs=(ids:string[],question:string)=>writeComparisonInput(inputKey,{spaceId,question,papers:ids.flatMap(id=>{const source=state?.candidates.find(s=>s.id===id);return source?[{canonicalId:source.canonicalId,title:source.title}]:[]})});
  const editSelection=(ids:string[])=>{setSelected(ids);if(!retainInputs(ids,comparisonQuestion))setError(zh?'无法暂存材料选择，请保留当前页。':'Selection storage unavailable; keep this page open.');};
  const editQuestion = (value: string) => {
    setComparisonQuestion(value);
    if (!writeSessionDraft(questionDraftKey, state?.focusQuestion || '', value)) setError(zh ? '无法暂存问题，请准备比较后再离开。' : 'Question draft storage unavailable. Prepare the comparison before leaving.');
    retainInputs(selected,value);
  };
  const editArtifact = (update: (previous: WorkbookArtifact) => WorkbookArtifact) => {
    const next = update(artifact); setArtifact(next);
    const stored=writeSessionDraft(draftKey, JSON.stringify(state?.artifact?.value || emptyArtifact()), JSON.stringify(next));setDraftStored(stored);
    if (!stored) setError(zh ? "无法暂存草稿，请保存后再离开。" : "Draft storage unavailable. Save before leaving.");
  };
  const dirty = JSON.stringify(artifact) !== JSON.stringify(state?.artifact?.value || emptyArtifact());
  const questionDirty = comparisonQuestion !== (state?.focusQuestion || '');
  const refreshed = useRef(refreshKey);

  if(restoredView.spaceId!==spaceId||restoredView.trackId!==trackId||restoredView.panel!==initialPanel||restoredView.focus!==initialFocus){
    setRestoredView({spaceId,trackId,panel:initialPanel,focus:initialFocus});
    setPanel(initialPanel);
    setFocus(initialFocus);
  }

  useEffect(() => {
    const refreshOnly = refreshed.current !== refreshKey; refreshed.current = refreshKey;
    if(refreshOnly&&(dirty || questionDirty))return;
    const readId = refreshOnly && state?.id ? state.id : initialWorkbookId;
    const abort = new AbortController(); const epoch = ++generation.current;
    setBusy("load"); setError(""); setSaveConflict(false); setDraftStored(true); setState(null); setArtifact(emptyArtifact()); setMissing([]);
    if (!refreshOnly) setComparisonQuestion(taskContext?.question || '');
    fetch(`/api/research-workbook?spaceId=${encodeURIComponent(spaceId)}&trackId=${encodeURIComponent(trackId)}&workbookId=${encodeURIComponent(readId)}&selection=${taskContext ? "1" : "0"}&canonicalIds=${encodeURIComponent(taskContext?.papers.map(p=>p.canonicalId).join(",") || "")}&focus=${encodeURIComponent(taskContext?.question || "")}`, { signal: AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]) })
      .then(async r => { const data = await r.json() as WorkbookResponse; if (!r.ok) throw new Error(data.error || "Unable to load workbook"); return data; })
      .then(data => { if (generation.current !== epoch) return; setState(data.workbook); migrateComparisonQuestionDraft(userId,spaceId,trackId,data.workbook.id||initialWorkbookId,data.workbook.focusQuestion||''); setComparisonQuestion(data.workbook.id ? data.workbook.focusQuestion || '' : taskContext?.question || ''); setVersions(data.versions); setArtifact(data.workbook.artifact?.value || emptyArtifact()); if (data.workbook.id) onWorkbookChange?.(data.workbook.id); const input=readComparisonInput(comparisonInputKey(userId,spaceId,trackId,data.workbook.id||initialWorkbookId),spaceId); if(input){const selection=graphSelection(data.workbook.candidates,input.papers.map(p=>p.canonicalId));setSelected(selection.selected);setMissing(selection.missing);if(!data.workbook.id)setComparisonQuestion(input.question);} else if (taskContext?.papers.length && !data.workbook.id) { const selection = graphSelection(data.workbook.candidates, taskContext.papers.map(p=>p.canonicalId)); setSelected(selection.selected); setMissing(selection.missing); } else setSelected(data.workbook.sources.length ? data.workbook.sources.map((s: WorkbookSource) => s.id) : data.workbook.candidates.filter((s: WorkbookSource) => s.routeMember).slice(0, 3).map((s: WorkbookSource) => s.id)); })
      .catch(e => { if (!abort.signal.aborted && generation.current === epoch) setError(e.message); })
      .finally(() => { if (generation.current === epoch) setBusy(""); });
    return () => { abort.abort(); generation.current = epoch + 1; };
  }, [spaceId, trackId, taskContext, initialWorkbookId, refreshKey, loadRetry]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the external clock after the server changes a retry deadline.
    setNow(Date.now());
    const deadlines = [state?.retryAt || 0, state?.busyUntil || 0].filter(value => value > Date.now());
    if (!deadlines.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...deadlines) - Date.now() + 50));
    return () => clearTimeout(timer);
  }, [state?.retryAt, state?.busyUntil]);

  const inspectorTrigger = useRef<HTMLElement | null>(null);
  const [inspectorModal, setInspectorModal] = useState(false);
  const closeInspector = () => {
    setFocus(""); onViewChange?.(panel, "");
    requestAnimationFrame(() => {
      const trigger = inspectorTrigger.current?.isConnected ? inspectorTrigger.current : Array.from(document.querySelectorAll<HTMLElement>('[data-evidence-id]')).find(node => node.dataset.evidenceId === focus);
      trigger?.focus({ preventScroll: true });
      trigger?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dialog = document.getElementById("workbook-evidence-inspector") as HTMLDialogElement | null;
    if (!dialog) return;
    const media = window.matchMedia("(max-width: 1399px)");
    const previousOverflow = document.body.style.overflow;
    const sync = () => {
      dialog.close();
      const validFocus = content?.dimensions.some(d => d.cells.some(c => `${d.id}:${c.paperId}` === focus));
      const modal = active && media.matches && Boolean(validFocus);
      setInspectorModal(modal);
      document.body.style.overflow = modal ? "hidden" : previousOverflow;
      if (active && modal) dialog.showModal();
      else if (active && !media.matches) dialog.show();
      if (validFocus && dialog.open) dialog.focus({ preventScroll: true });
    };
    sync(); media.addEventListener("change", sync);
    return () => { media.removeEventListener("change", sync); dialog.close(); document.body.style.overflow = previousOverflow; };
  }, [focus, panel, state?.id, Boolean(content), spaceId, trackId, active]);
  const inspect = (id: string) => {
    inspectorTrigger.current = document.activeElement as HTMLElement;
    setFocus(id);
    onViewChange?.(panel,id);
  };

  const request = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/research-workbook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spaceId, trackId, ...body }) });
    const data = await response.json() as WorkbookResponse; if (!response.ok) { const error=new Error(data.error || "Unable to update workbook") as Error & {status:number};error.status=response.status;throw error; }
    return data as { workbook: WorkbookState; versions: typeof versions };
  };
  const save = async (returnAfter=false) => {
    if (!state || busy || state.stale) return;
    const epoch = generation.current; setBusy("save"); setError(""); setNotice(""); setSaveConflict(false);
    try {
      const data = await request({ action: "save-artifact", workbookId: state.id, sourceRevision: state.revision, baseRevision: state.artifact?.revision || 0, value: artifact });
      if (generation.current !== epoch) return;
      clearSessionDraft(draftKey, JSON.stringify(artifact));
      setState(data.workbook); setNotice(zh ? "比较记录已保存。" : "Comparison notes saved.");
      if(returnAfter)onBack();
    } catch (e) { if (generation.current === epoch) {setSaveConflict((e as {status?:number}).status===409);setError(e instanceof Error ? e.message : "Save failed");} }
    finally { if (generation.current === epoch) setBusy(""); }
  };
  const prepare = async (resume: boolean, revise = false) => {
    if (busy || dirty) return;
    const epoch = generation.current; setBusy(resume ? "verify" : "draft"); setError(""); setNotice("");
    try {
      let data = await request(resume ? { action: "advance", workbookId: state?.id } : { action: "prepare", paperIds: revise ? state?.sources.map(s => s.id) : selected,
        focusQuestion: revise ? state?.focusQuestion || '' : comparisonQuestion, allowRepair: revise || allowRepair });
      if (generation.current !== epoch) return;
      if (!resume && !revise && data.workbook.id) { clearSessionDraft(questionDraftKey, comparisonQuestion); setComparisonQuestion(data.workbook.focusQuestion || comparisonQuestion.trim()); }
      setState(data.workbook); setVersions(data.versions);
      if (data.workbook.id) onWorkbookChange?.(data.workbook.id);
      if (revise) setSelected(data.workbook.sources.map(s => s.id));
      // eslint-disable-next-line react-hooks/purity -- This runs in the asynchronous prepare handler, checking the server lease between requests.
      for (let pass=0; pass<12 && data.workbook.status === "verifying" && !data.workbook.stale && !(data.workbook.busyUntil && data.workbook.busyUntil > Date.now()); pass++) {
        setBusy("verify"); data = await request({ action: "advance", workbookId: data.workbook.id });
        if (generation.current !== epoch) return;
        setState(data.workbook); setVersions(data.versions);
      }
      setArtifact(data.workbook.artifact?.value || emptyArtifact()); setFocus(""); onViewChange?.(panel, "");
    } catch (e) { if (generation.current === epoch) setError(e instanceof Error ? e.message : "Preparation failed"); }
    finally { if (generation.current === epoch) setBusy(""); }
  };
  const openVersion = async (id: string) => {
    if (busy || dirty) return;
    const epoch = generation.current; setBusy("load"); setError("");
    try {
      const r = await fetch(`/api/research-workbook?spaceId=${encodeURIComponent(spaceId)}&trackId=${encodeURIComponent(trackId)}&workbookId=${encodeURIComponent(id)}`);
      const data = await r.json() as WorkbookResponse; if (!r.ok) throw new Error(data.error);
      if (generation.current !== epoch) return;
      setState(data.workbook); setComparisonQuestion(data.workbook.focusQuestion || ''); setArtifact(data.workbook.artifact?.value || emptyArtifact()); setFocus("");
      setMissing([]); onWorkbookChange?.(data.workbook.id!); onViewChange?.(panel, "");
      setSelected(data.workbook.sources.map((s: WorkbookSource) => s.id));
    } catch (e) { if (generation.current === epoch) setError(e instanceof Error ? e.message : "Load failed"); }
    finally { if (generation.current === epoch) setBusy(""); }
  };
  const focused = content?.dimensions.flatMap(d => d.cells.map(c => ({ dimension: d, cell: c, id: `${d.id}:${c.paperId}` }))).find(c => c.id === focus);
  const source = state?.sources.find(s => s.id === focused?.cell.paperId);
  const storedDraft=readSessionDraft(draftKey);
  const pendingDraft=!dirty&&storedDraft&&storedDraft.value!==JSON.stringify(artifact)&&storedDraft.value!==JSON.stringify(state?.artifact?.value||emptyArtifact());
  const saveStatus=busy==='save'?(zh?'正在保存到工作区…':'Saving to workspace…'):state?.stale?(zh?'依据已变化 · 当前版本仅供回顾':'Evidence changed · historical version'):saveConflict?(zh?'保存版本有变化 · 本地输入已保留':'Saved version changed · local input retained'):error?(zh?'操作未完成 · 输入保留在本页':'Action incomplete · input retained here'):dirty?(draftStored?(zh?'未提交 · 草稿已暂存在本标签页':'Not submitted · draft saved in this tab'):(zh?'未提交 · 无法暂存，请先保存':'Not submitted · draft storage failed; save now')):pendingDraft?(zh?'有本地草稿待恢复':'Local draft available to restore'):state?.artifact?(zh?`已保存到工作区 · 版本 ${state.artifact.revision}`:`Saved to workspace · revision ${state.artifact.revision}`):(zh?'尚未保存判断':'No judgment saved yet');
  const artifactRecovery = !dirty && <DraftRecovery key={draftKey} storageKey={draftKey} current={JSON.stringify(artifact)} base={JSON.stringify(state?.artifact?.value || emptyArtifact())} locale={locale} onRestore={value => { try { const restored = JSON.parse(value); if (typeof restored.decision === "string" && typeof restored.unresolved === "string" && restored.observations && typeof restored.observations === "object") setArtifact(restored); } catch { setError(zh ? "草稿无法读取，已保存内容不受影响。" : "Draft unavailable; saved content is unchanged."); } }} />;
  const jumpToRecord=()=>{const element=document.querySelector<HTMLElement>(pendingDraft?'.pi-workbook-artifact .pi-draft-recovery button':'.pi-workbook-artifact textarea');element?.scrollIntoView({block:'center',behavior:'auto'});element?.focus({preventScroll:true});};

  const progress=workbookPresentation(state,busy,error,zh);
  const refreshProgress=()=>{if(dirty||state&&questionDirty)return;if(state?.id)void openVersion(state.id);else setLoadRetry(n=>n+1);};

  return <main className="pi-workbook pi-comparison-workspace">
    <button type="button" className="v2-back" onClick={onBack}>← {zh ? "返回原任务" : "Return to original task"}</button>
    <header className="pi-workbook-heading"><p>{zh ? "研究工作台" : "RESEARCH WORKSPACE"}</p><h1>{zh ? "论文比较" : "Paper comparison"}</h1><p>{zh ? "对齐研究条件，核对每条结论的依据。" : "Align the conditions and check the evidence behind each conclusion."}</p></header>
    {content && <section className="pi-comparison-question"><small>{zh ? "本次研究问题" : "RESEARCH QUESTION"}</small><p><MathText>{text(content,"question")}</MathText></p></section>}
    <section className="pi-workbook-progress" aria-label={zh?"比较进度与恢复":"Comparison progress and recovery"}>
      <ol aria-label={zh?"比较步骤":"Comparison steps"}>{([['sources','选材','Sources'],['draft','生成','Draft'],['review','核对','Review'],...(state?.revisionFlow?[['repair','按需修订','Correct if needed'] as const]:[]),['record','记录判断','Judgment']] as const).map(([phase,zhLabel,enLabel])=><li key={phase} aria-current={progress.phase===phase?'step':undefined}>{zh?zhLabel:enLabel}</li>)}</ol>
      <strong role="status">{progress.title}</strong>
      {progress.reviewLabel&&<p className="pi-workbook-round" role="status">{progress.reviewLabel}</p>}
      {progress.preservation&&<p className="pi-workbook-preservation">{progress.preservation}</p>}
      {!!state?.protocolRecoveries&&<p>{zh?`已自动恢复 ${state.protocolRecoveries} 次格式或引用异常；仍需通过完整证据核对。`:`Automatically recovered ${state.protocolRecoveries} format or reference errors; full evidence review is still required.`}</p>}
      <details className="pi-progress-explanation" open={state?.status!=='ready'||Boolean(error)||busy==='save'}><summary>{zh?'保留内容与下一步':'Preserved content and next steps'}</summary>
      <p><b>{zh?'已保留：':'Preserved: '}</b>{progress.retained}</p>
      {progress.failure&&<p role="alert">{progress.failure}</p>}
      <p><b>{zh?'下一步：':'Next: '}</b>{progress.next}</p>
      </details>
      {error&&<div role="alert"><p>{saveConflict?(zh?'保存版本有变化，本地输入已保留。请核对最新保存内容后恢复草稿。':'The saved version changed. Local input is retained; check the latest saved content before restoring your draft.'):(zh?'本次操作未完成，输入仍保留在当前页。':'The action did not complete; input is retained on this page.')}</p><details><summary>{zh?'查看错误详情':'Error details'}</summary><p>{error}</p></details></div>}
      {state?.failure?.detail&&<details><summary>{zh?'查看具体原因':'Failure details'}</summary><p>{workbookResponseDetailText(state.failure.detail,zh)}</p></details>}
      {!busy&&(error||state&&['draft','verifying','retryable'].includes(state.status))&&<div className="pi-workbook-recovery-actions">
        {state?.id&&!error&&<button type="button" disabled={state.stale||dirty||questionDirty||state.retryAt>now||(state.busyUntil||0)>now} onClick={()=>void prepare(true)}>{progress.resumeLabel}</button>}
        <button type="button" disabled={dirty||Boolean(state&&questionDirty)} onClick={refreshProgress}>{zh?'刷新进度':'Refresh progress'}</button>
        {Boolean(state?.busyUntil&&state.busyUntil>now)&&<small>{zh?'已有请求正在处理，请刷新进度确认结果。':'A request is in progress. Refresh to check its result.'}</small>}
        {Boolean(state?.retryAt&&state.retryAt>now)&&<small>{zh?'可继续时间：':'Continue after: '}{new Date(state!.retryAt).toLocaleTimeString(zh?'zh-CN':'en-US')}</small>}
        {(dirty||state&&questionDirty)&&<small>{zh?'请先保存或保留当前草稿，再刷新比较。':'Save or retain the current draft before refreshing the comparison.'}</small>}
      </div>}
      {state?.revisionFlow&&<details><summary>{zh?'修订与保留记录':'Correction and preservation record'}</summary><p>{zh?'反馈修订：':'Feedback corrections: '}{state.revisionFlow.repairs} / {state.revisionFlow.limit}{state.revisionFlow.revisedFields!==undefined?(zh?` · 仅修改 ${state.revisionFlow.revisedFields} 个未通过字段，保留 ${state.revisionFlow.preservedFields} 个字段；全部重新核对。`:` · Changed only ${state.revisionFlow.revisedFields} failed fields; preserved ${state.revisionFlow.preservedFields} fields. All fields are reviewed again.`):''}</p></details>}
    </section>
    {notice&&<p role="status">{notice}</p>}
    {taskContext && <details className="pi-graph-handoff" open={missing.length>0}><summary>{zh ? "来源任务与初始选材" : "Original task and starting papers"}</summary><p>{taskContext.question}</p><ul>{taskContext.papers.map(p=><li key={p.canonicalId}>{p.title}{missing.includes(p.canonicalId.toLowerCase()) ? (zh ? " · 尚未通过摘要评审，未用于正式比较" : " · not yet eligible for reviewed comparison") : ""}</li>)}</ul>{missing.length>0&&<p>{zh ? "保留了你的选择，不会换成其他论文。可以返回原任务查看原文或完成材料评审后重试。" : "Your selection is preserved; other papers will not be substituted. Return to the task to inspect originals or retry after review."}</p>}</details>}
    <details className="pi-workbook-picker" open={!content}>
      <summary>{zh ? "调整比较材料" : "Change comparison sources"}</summary>
      <p>{zh ? "选择 2–3 篇已审核论文。原始成果与补充阅读的身份不会因此改变。" : "Select 2–3 reviewed papers. This does not change their original or supplementary evidence roles."}</p>
      <label className="pi-workbook-question">{zh ? '本次比较问题' : 'Question for this comparison'}<textarea aria-label={zh?'本次比较问题':'Question for this comparison'} rows={3} maxLength={1000} disabled={Boolean(busy)} value={comparisonQuestion} onChange={event => editQuestion(event.target.value)} /><small>{zh ? '收窄到所选摘要能支持的对象、条件和结果。留空则沿用路线问题；改写后点击“准备有据的比较与任务”会新建版本，旧记录保留。' : 'Focus on objects, conditions and results supported by the selected abstracts. Leave empty to use the route question. Prepare again to create a new version; previous records are preserved.'}</small></label>
      <DraftRecovery key={questionDraftKey} storageKey={questionDraftKey} current={comparisonQuestion} base={state?.focusQuestion || ''} locale={locale} onRestore={editQuestion} />
      <div>{state?.candidates.map(s => <label key={s.id} aria-label={s.title}><input type="checkbox" checked={selected.includes(s.id)} disabled={Boolean(busy) || (!selected.includes(s.id) && selected.length >= 3)} onChange={() => editSelection(selected.includes(s.id) ? selected.filter(id => id !== s.id) : [...selected, s.id])} /><span><MathText inline>{s.title}</MathText><small>{s.routeMember ? zh ? "当前路线材料" : "Current route material" : zh ? "本空间候选材料，需判断适配性" : "Workspace candidate; check its fit"}</small></span></label>)}</div>
      <label className="pi-workbook-repair-option"><input type="checkbox" checked={allowRepair} disabled={Boolean(busy)} onChange={e => setAllowRepair(e.target.checked)} /><span>{zh ? '允许根据评审反馈修订一次' : 'Allow one correction using review feedback'}<small>{zh ? '试用：会增加模型调用。材料不足时停止；修订后全部重新核对。' : 'Pilot: adds model calls. Stops for missing evidence; all corrected content is reviewed again.'}</small></span></label>
      {state && state.candidates.length < 2 && <p>{zh ? "当前不足两篇已审核且有摘要的材料。已有发现流程继续补证；这里不会用未审核论文凑数。" : "Fewer than two reviewed papers have abstracts. Existing discovery continues; unreviewed papers cannot fill the comparison."}</p>}
      <button type="button" disabled={Boolean(busy) || dirty || selected.length < 2 || missing.length > 0} onClick={() => void prepare(false)}>{zh ? "准备有据的比较与任务" : "Prepare comparison and tasks"}</button>
      {questionDirty && <small>{zh ? '本次比较问题尚未提交，请准备新版本后再切换历史。' : 'This comparison question is unsubmitted. Prepare a new version before switching history.'}</small>}
      {versions.length > 1 && <label>{zh ? "历史版本" : "History"}<select value={state?.id || ""} disabled={Boolean(busy) || dirty || questionDirty} onChange={e => void openVersion(e.target.value)}>{versions.map((v, i) => <option key={v.id} value={v.id}>{versions.length - i} · {v.created_at} · {workbookStatusLabel(v.status,zh)}</option>)}</select></label>}
    </details>
    {state?.status === "rejected" && <section className="pi-workbook-review-issues"><h2>{zh ? '比较未通过的原因' : 'Why the comparison did not pass'}</h2><p>{zh ? "请按具体原因核查材料。未通过的内容尚未发布为研究结论。" : "Check the sources against these specific reasons. Rejected content has not been published as a research finding."}</p>
      {!!state.reviewIssues?.length && <ul>{state.reviewIssues.map(issue => <li key={issue.id}><strong>{reviewIssueLabel(issue.id, zh)}</strong><p><MathText>{issue.reason}</MathText></p>{issue.issueType === 'evidence_gap' && <small>{zh ? '需要补充证据，自动修订已停止。' : 'Additional evidence is needed; automatic correction has stopped.'}</small>}<div>{issue.paperIds.map(id => { const paper = state.sources.find(s => s.id === id); return paper && <button type="button" key={id} onClick={() => onOpenPaper(paper, issue.reason)}>{zh ? '核查材料：' : 'Inspect source: '}{paper.title}</button>; })}</div></li>)}</ul>}
      {!state.revisionFlow && <button type="button" disabled={Boolean(busy) || state.stale || dirty} onClick={() => void prepare(false, true)}>{zh ? '试用按反馈修订一次' : 'Try one feedback correction'}</button>}
    </section>}
    {content && <>
      <div className="pi-comparison-sources">{state.sources.map(source => <div key={source.id}><span>{workbookPaperLabel(source.id,state.sources)}</span><p><MathText inline>{source.title}</MathText></p></div>)}</div>
      <nav className="pi-workbook-tabs" aria-label={zh ? "比较工作视角" : "Workbook view"}>{(["evidence", "relations", "task"] as const).map(p => <button type="button" key={p} aria-pressed={panel === p} onClick={() => {setPanel(p);onViewChange?.(p,focus);}}>{p === "evidence" ? zh ? "条件与证据" : "Conditions & evidence" : p === "relations" ? zh ? "关系与可比性" : "Relationships & comparability" : zh ? "研究练习" : "Research exercise"}</button>)}</nav>

      <div className={`pi-workbook-layout${focused ? " inspecting" : ""}`}><div>
        {panel === "evidence" && <section><h2>{zh ? "条件比较表" : "Condition comparison"}</h2><p>{zh ? "点选比较项，查看摘要出处并记录自己的核查。摘要缺少的信息会明确标注。" : "Select a cell to inspect its abstract evidence and record your check. Missing means not provided in the abstract."}</p><div className="pi-workbook-table-scroll"><table><thead><tr><th>{zh ? "比较维度" : "Dimension"}</th>{state.sources.map(s => <th key={s.id}><MathText inline>{s.title}</MathText></th>)}</tr></thead><tbody>{content.dimensions.map(d => <tr key={d.id}><th><strong>{text(d, "label")}</strong><small>{text(d, "purpose")}</small></th>{state.sources.map(s => { const c = d.cells.find(c => c.paperId === s.id)!; const id = `${d.id}:${s.id}`; return <td key={s.id}><button type="button" data-evidence-id={id} aria-pressed={focus === id} onClick={() => inspect(id)}><MathText>{c.status === "missing" ? zh ? "摘要未提供" : "Not provided in abstract" : text(c, "text")}</MathText>{artifact.observations[id] && <small>{zh ? "已有核查笔记" : "Check recorded"}</small>}</button></td>; })}</tr>)}</tbody></table></div></section>}
        {panel === "relations" && <section><h2>{zh ? "这些结果能否直接比较？" : "Can these results be compared directly?"}</h2><div className="pi-workbook-relation" role="group" aria-label={zh ? "材料与比较关系" : "Sources and comparison"}>{state.sources.map((s, i) => <div key={s.id}><span>{i + 1}</span><MathText inline>{s.title}</MathText></div>)}<strong>{content.comparison.status === "comparable" ? zh ? "当前证据支持比较" : "Comparable in current evidence" : content.comparison.status === "conditional" ? zh ? "需区分适用条件" : "Conditional comparison" : zh ? "信息不足，关系待核查" : "Insufficient evidence; relationship unresolved"}</strong></div><p><MathText>{text(content.comparison, "text")}</MathText></p><p>{zh ? "以下连结指向比较依据；不表示论文之间存在引用、支持或推广关系。" : "The links below identify comparison evidence; they do not assert citation, support or generalization relationships."}</p><div className="pi-workbook-evidence-links">{content.comparison.evidenceIds.map(id => <button type="button" key={id} data-evidence-id={id} onClick={() => inspect(id)}>{content.dimensions.find(d => id.startsWith(d.id + ":"))?.[zh ? "labelZh" : "labelEn"]} · {state.sources.find(s => id.endsWith(":" + s.id))?.title}</button>)}</div></section>}
        {panel === "task" && <section><h2>{text(content.task, "title")}</h2><p>{zh ? "逐项核查写在证据侧栏的「这一项的核查笔记」；整体结论与可比性判断写在下方「目前的判断及依据」，缺失条件写在「仍缺的条件或待解决问题」。" : "Write cell checks in Check note for this cell in the evidence sidebar. Put the overall conclusion and comparability judgment in Current judgment and evidence below, and missing conditions in Missing conditions or unresolved questions."}</p><ol>{content.task.steps.map((s, i) => <li key={i}><MathText>{text(s, "text")}</MathText>{onStartPractice&&<button type="button" disabled={Boolean(busy)||dirty||state.stale} onClick={()=>onStartPractice(`task-${i}`)}>{zh?"执行这项核查":"Work on this check"} →</button>}<div className="pi-workbook-evidence-links">{s.evidenceIds.map(id => <button key={id} type="button" onClick={() => inspect(id)}>{zh ? "查看依据" : "Inspect evidence"} · {content.dimensions.find(d => id.startsWith(d.id + ":"))?.[zh ? "labelZh" : "labelEn"]}</button>)}</div></li>)}</ol><p><strong>{zh ? "完成标准：" : "Completion criteria: "}</strong><MathText>{text(content.task, "criterion")}</MathText></p><section className="pi-workbook-lesson"><h3>{zh ? "解决当前障碍的学习单元" : "Learning unit for the current obstacle"}</h3><h4>{text(content.learning, "goal")}</h4><dl><dt>{zh ? "需要的基础" : "Prerequisites"}</dt><dd><MathText>{text(content.learning, "prerequisite")}</MathText></dd><dt>{zh ? "用这些材料练习" : "Exercise using these sources"}</dt><dd><MathText>{text(content.learning, "exercise")}</MathText></dd><dt>{zh ? "检查自己的结果" : "Check your result"}</dt><dd><MathText>{text(content.learning, "checkpoint")}</MathText></dd></dl>{onStartPractice&&<button type="button" disabled={Boolean(busy)||dirty||state.stale} onClick={()=>onStartPractice("learning")}>{zh?"开始这项学习练习":"Start this learning exercise"} →</button>}</section>{dirty&&<p>{zh?"请先保存比较记录，再进入练习。":"Save comparison notes before starting an exercise."}</p>}</section>}

      </div><dialog id="workbook-evidence-inspector" tabIndex={-1} className="pi-workbook-inspector" aria-modal={inspectorModal || undefined} onCancel={event => { event.preventDefault(); closeInspector(); }} aria-label={zh ? "证据与核查笔记" : "Evidence and check notes"}>{focused && source ? <><div className="pi-inspector-heading"><h2>{text(focused.dimension, "label")}</h2><button type="button" onClick={closeInspector}>{zh ? "关闭依据" : "Close evidence"} ×</button></div><h3><MathText inline>{source.title}</MathText></h3>{focused.cell.quote ? <>{(focused.cell.quotes || [focused.cell.quote]).map((quote,index) => <blockquote key={index}><MathText>{quote}</MathText><cite>{zh ? "来源：该论文摘要" : "Source: paper abstract"} · {index+1}</cite></blockquote>)}</> : <p>{zh ? "摘要未提供这项信息，不能用推测补全。" : "The abstract does not provide this information; do not fill it by inference."}</p>}<button type="button" onClick={() => onOpenPaper(source, text(focused.dimension, "purpose"))}>{zh ? "带着这项核查打开论文" : "Open paper for this check"} →</button>{inspectorModal && artifactRecovery}<label>{zh ? "这一项的核查笔记" : "Check note for this cell"}<textarea value={artifact.observations[focus] || ""} maxLength={2500} disabled={Boolean(busy)} onChange={e => editArtifact(a => ({ ...a, observations: { ...a.observations, [focus]: e.target.value } }))} /></label><small>{zh ? "核查笔记与下方判断一并保存。" : "This note is saved with the comparison artifact."}</small></> : <><h2>{zh ? "证据侧栏" : "Evidence inspector"}</h2><p>{zh ? "选择表格中的比较项或任务中的依据，即可查看具体出处。" : "Select a comparison cell or task reference to inspect its source."}</p></>}</dialog></div>
        <section className="pi-workbook-artifact">{!inspectorModal && artifactRecovery}<h2>{zh ? "我的判断与记录" : "My judgment and notes"}</h2><p>{zh ? "记录自己的判断；这不会自动确认研究路线、已读或掌握。" : "Record your judgment. This does not confirm a research route, reading status or mastery."}</p><label>{zh ? "目前的判断及依据" : "Current judgment and evidence"}<textarea value={artifact.decision} maxLength={4000} disabled={Boolean(busy)} onChange={e => editArtifact(a => ({ ...a, decision: e.target.value }))} /></label><label>{zh ? "仍缺的条件或待解决问题" : "Missing conditions or unresolved questions"}<textarea value={artifact.unresolved} maxLength={4000} disabled={Boolean(busy)} onChange={e => editArtifact(a => ({ ...a, unresolved: e.target.value }))} /></label></section>
        <WorkbookFollowup content={content} sources={state.sources} question={artifact.unresolved} practice={state.artifact?.value.practice} locale={locale} disabled={Boolean(busy)||state.stale||Boolean(pendingDraft)} dirty={dirty} active={active} reveal={focus==='practice-results'} onOpenPaper={onOpenPaper} onStartPractice={onStartPractice} onAppend={(field,label,value)=>{const next=appendWorkbookResult(artifact[field],label,value);if(next===null)return false;editArtifact(current=>({...current,[field]:next}));return true;}} />
      <footer className="pi-workbook-savebar" aria-label={zh?'比较记录保存':'Save comparison notes'}><div><strong role="status">{saveStatus}</strong>{dirty&&<small>{zh?'证据笔记、整体判断和待查问题一并保存':'Cell notes, judgment and unresolved questions are saved together'}</small>}</div><div className="pi-savebar-actions"><button type="button" onClick={jumpToRecord}>{pendingDraft?(zh?'恢复本地草稿':'Restore local draft'):(zh?'编辑判断':'Edit judgment')}</button><button type="button" disabled={Boolean(busy) || !dirty || state.stale} onClick={() => void save()}>{zh ? "保存记录" : "Save notes"}</button><button type="button" className="pi-savebar-primary" disabled={Boolean(busy) || !dirty || state.stale} onClick={() => void save(true)}>{zh ? "保存并返回原任务" : "Save & return to task"}</button></div></footer>
    </>}
  </main>;
}
