"use client";
import { workspaceFetch as fetch } from "../../lib/workspace-request";


import { useEffect, useRef, useState } from "react";
import type { WorkbookArtifact, WorkbookSource, WorkbookState } from "../../lib/research-workbook";
import { graphSelection, type GraphTaskContext } from "../../lib/graph-task";
import { DraftRecovery } from "./draft-recovery";
import { sessionDraftKey, writeSessionDraft, clearSessionDraft } from "../../lib/session-draft";
import { MathText } from "./math-text";
import { workbookFailureText, workbookResponseDetailText } from "../../lib/workbook-recovery";
import "./research-workbook.css";

const emptyArtifact = (): WorkbookArtifact => ({ observations: {}, decision: "", unresolved: "" });
function reviewIssueLabel(id: string, zh: boolean) {
  const names: Record<string, [string, string]> = { question: ['比较问题', 'Comparison question'], dimension: ['比较维度', 'Comparison dimension'], cell: ['摘要内容与出处', 'Abstract claim and evidence'], comparison: ['比较结论', 'Comparison conclusion'], 'task:title': ['研究任务', 'Research task'], 'task:criterion': ['任务完成标准', 'Task completion criteria'], 'learning:goal': ['学习目标', 'Learning goal'], 'learning:prerequisite': ['学习基础', 'Learning prerequisites'], 'learning:exercise': ['学习练习', 'Learning exercise'], 'learning:checkpoint': ['学习检查标准', 'Learning checkpoint'] };
  if (id.startsWith('task:step:')) return `${zh ? '任务步骤' : 'Task step'} ${Number(id.split(':')[2]) + 1}`;
  return (names[id] || names[id.split(':')[0]] || ['内容核对', 'Content review'])[zh ? 0 : 1];
}
type WorkbookResponse = { workbook: WorkbookState; versions: Array<{ id: string; status: string; created_at: string }>; error?: string };
type WorkbookPanel="evidence"|"relations"|"task";
export function ResearchWorkbook({ userId, spaceId, trackId, locale, onOpenPaper, onBack, taskContext, initialWorkbookId="", onWorkbookChange, initialPanel="evidence", initialFocus="", onViewChange }: {
  userId: string; spaceId: string; trackId: string; locale: "zh" | "en"; taskContext?: GraphTaskContext;
  onOpenPaper: (source: WorkbookSource, focus: string) => void;
  onBack: () => void;
  initialWorkbookId?: string; onWorkbookChange?: (id: string) => void;
  initialPanel?:WorkbookPanel;initialFocus?:string;onViewChange?:(panel:WorkbookPanel,focus:string)=>void;
}) {
  const [state, setState] = useState<WorkbookState | null>(null);
  const [versions, setVersions] = useState<Array<{ id: string; status: string; created_at: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [allowRepair, setAllowRepair] = useState(false);
  const [panel, setPanel] = useState<WorkbookPanel>(initialPanel);
  const [focus, setFocus] = useState(initialFocus);
  const [restoredView, setRestoredView] = useState({spaceId,trackId,panel:initialPanel,focus:initialFocus});
  const [artifact, setArtifact] = useState<WorkbookArtifact>(emptyArtifact);
  const [busy, setBusy] = useState("load"); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const zh = locale === "zh";
  const content = state?.content;
  const text = (value: { [key: string]: unknown }, key: string) => String(value[`${key}${zh ? "Zh" : "En"}`] || "");
  const draftKey = sessionDraftKey(userId, spaceId, `workbook:${trackId}:${state?.id || ""}:${state?.revision || ""}`);
  const editArtifact = (update: (previous: WorkbookArtifact) => WorkbookArtifact) => {
    const next = update(artifact); setArtifact(next);
    if (!writeSessionDraft(draftKey, JSON.stringify(state?.artifact?.value || emptyArtifact()), JSON.stringify(next))) setError(zh ? "无法暂存草稿，请保存后再离开。" : "Draft storage unavailable. Save before leaving.");
  };
  const dirty = JSON.stringify(artifact) !== JSON.stringify(state?.artifact?.value || emptyArtifact());

  if(restoredView.spaceId!==spaceId||restoredView.trackId!==trackId||restoredView.panel!==initialPanel||restoredView.focus!==initialFocus){
    setRestoredView({spaceId,trackId,panel:initialPanel,focus:initialFocus});
    setPanel(initialPanel);
    setFocus(initialFocus);
  }

  useEffect(() => {
    const abort = new AbortController(); const epoch = ++generation.current;
    setBusy("load"); setError(""); setState(null); setArtifact(emptyArtifact()); setMissing([]);
    fetch(`/api/research-workbook?spaceId=${encodeURIComponent(spaceId)}&trackId=${encodeURIComponent(trackId)}&workbookId=${encodeURIComponent(initialWorkbookId)}&selection=${taskContext ? "1" : "0"}&canonicalIds=${encodeURIComponent(taskContext?.papers.map(p=>p.canonicalId).join(",") || "")}&focus=${encodeURIComponent(taskContext?.question || "")}`, { signal: abort.signal })
      .then(async r => { const data = await r.json() as WorkbookResponse; if (!r.ok) throw new Error(data.error || "Unable to load workbook"); return data; })
      .then(data => { if (generation.current !== epoch) return; setState(data.workbook); setVersions(data.versions); setArtifact(data.workbook.artifact?.value || emptyArtifact()); if (data.workbook.id) onWorkbookChange?.(data.workbook.id); if (taskContext?.papers.length && !data.workbook.id) { const selection = graphSelection(data.workbook.candidates, taskContext.papers.map(p=>p.canonicalId)); setSelected(selection.selected); setMissing(selection.missing); } else setSelected(data.workbook.sources.length ? data.workbook.sources.map((s: WorkbookSource) => s.id) : data.workbook.candidates.filter((s: WorkbookSource) => s.routeMember).slice(0, 3).map((s: WorkbookSource) => s.id)); })
      .catch(e => { if (!abort.signal.aborted && generation.current === epoch) setError(e.message); })
      .finally(() => { if (generation.current === epoch) setBusy(""); });
    return () => { abort.abort(); generation.current = epoch + 1; };
  }, [spaceId, trackId, taskContext, initialWorkbookId]);

  useEffect(() => {
    setNow(Date.now());
    const deadlines = [state?.retryAt || 0, state?.busyUntil || 0].filter(value => value > Date.now());
    if (!deadlines.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...deadlines) - Date.now() + 50));
    return () => clearTimeout(timer);
  }, [state?.retryAt, state?.busyUntil]);

  const inspectorTrigger = useRef<HTMLElement | null>(null);
  const inspect = (id: string) => {
    inspectorTrigger.current = document.activeElement as HTMLElement;
    setFocus(id);
    onViewChange?.(panel,id);
    requestAnimationFrame(() => {
      const inspector = document.getElementById("workbook-evidence-inspector");
      inspector?.focus({ preventScroll: true });
      if (window.innerWidth <= 1100) inspector?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  const request = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/research-workbook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spaceId, trackId, ...body }) });
    const data = await response.json() as WorkbookResponse; if (!response.ok) throw new Error(data.error || "Unable to update workbook");
    return data as { workbook: WorkbookState; versions: typeof versions };
  };
  const save = async () => {
    if (!state || busy || state.stale) return;
    const epoch = generation.current; setBusy("save"); setError(""); setNotice("");
    try {
      const data = await request({ action: "save-artifact", workbookId: state.id, sourceRevision: state.revision, baseRevision: state.artifact?.revision || 0, value: artifact });
      if (generation.current !== epoch) return;
      clearSessionDraft(draftKey, JSON.stringify(artifact));
      setState(data.workbook); setNotice(zh ? "产物已保存；阅读与掌握状态保持原样。" : "Artifact saved; reading and mastery statuses are unchanged.");
    } catch (e) { if (generation.current === epoch) setError(e instanceof Error ? e.message : "Save failed"); }
    finally { if (generation.current === epoch) setBusy(""); }
  };
  const prepare = async (resume: boolean, revise = false) => {
    if (busy || dirty) return;
    const epoch = generation.current; setBusy(resume ? "verify" : "draft"); setError(""); setNotice("");
    try {
      let data = await request(resume ? { action: "advance", workbookId: state?.id } : { action: "prepare", paperIds: revise ? state?.sources.map(s => s.id) : selected,
        focusQuestion: revise ? state?.focusQuestion || '' : taskContext?.question || "", allowRepair: revise || allowRepair });
      if (generation.current !== epoch) return;
      setState(data.workbook); setVersions(data.versions);
      if (data.workbook.id) onWorkbookChange?.(data.workbook.id);
      if (revise) setSelected(data.workbook.sources.map(s => s.id));
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
      setState(data.workbook); setArtifact(data.workbook.artifact?.value || emptyArtifact()); setFocus("");
      setMissing([]); onWorkbookChange?.(data.workbook.id!); onViewChange?.(panel, "");
      setSelected(data.workbook.sources.map((s: WorkbookSource) => s.id));
    } catch (e) { if (generation.current === epoch) setError(e instanceof Error ? e.message : "Load failed"); }
    finally { if (generation.current === epoch) setBusy(""); }
  };
  const focused = content?.dimensions.flatMap(d => d.cells.map(c => ({ dimension: d, cell: c, id: `${d.id}:${c.paperId}` }))).find(c => c.id === focus);
  const source = state?.sources.find(s => s.id === focused?.cell.paperId);

  return <main className="pi-workbook pi-comparison-workspace">
    <button type="button" className="v2-back" onClick={onBack}>← {zh ? "返回研究" : "Back to research"}</button>
    <header className="pi-workbook-heading"><p>{zh ? "论文比较 · 核对条件与证据" : "Paper comparison · conditions and evidence"}</p><h1><MathText>{content ? text(content, "question") : zh ? "把论文放在相同条件下比较" : "Compare papers under explicit conditions"}</MathText></h1><p>{zh ? "证据、核查任务与学习练习共用一份比较表。" : "Evidence, research tasks and learning exercises share one comparison table."}</p></header>
    {error && <p role="alert" className="pi-workbook-error">{error}</p>}
    {(busy || notice) && <p role="status">{busy ? busy === "verify" ? (zh ? "正在独立核对每个比较项和学习任务…" : "Independently checking every comparison and learning field…") : busy === "draft" ? (zh ? "正在从选定摘要提取比较维度和具体任务…" : "Extracting comparison dimensions and concrete tasks from the selected abstracts…") : (zh ? "正在读取或保存…" : "Loading or saving…") : notice}</p>}
    {state?.stale && <p className="pi-workbook-error">{zh ? "这是旧证据版本。来源或研究问题已变化，旧内容仅供回顾；请用当前材料重新准备。" : "Evidence or the research question changed. This version is historical; prepare a new comparison with current sources."}</p>}
    {taskContext && <section className="pi-graph-handoff"><strong>{zh ? "来自图谱的研究任务" : "Task from the graph"}</strong><p>{taskContext.question}</p><ul>{taskContext.papers.map(p=><li key={p.canonicalId}>{p.title}{missing.includes(p.canonicalId.toLowerCase()) ? (zh ? " · 尚未通过摘要评审，未用于正式比较" : " · not yet eligible for reviewed comparison") : ""}</li>)}</ul>{missing.length>0&&<p>{zh ? "保留了你的选择，不会换成其他论文。可以返回图谱查看原文或完成材料评审后重试。" : "Your selection is preserved; other papers will not be substituted. Return to the graph to inspect originals or retry after review."}</p>}</section>}
    <details className="pi-workbook-picker" open={!content}>
      <summary>{zh ? "调整比较材料" : "Change comparison sources"}</summary>
      <p>{zh ? "选择 2–3 篇已审核论文。原始成果与补充阅读的身份不会因此改变。" : "Select 2–3 reviewed papers. This does not change their original or supplementary evidence roles."}</p>
      <div>{state?.candidates.map(s => <label key={s.id} aria-label={s.title}><input type="checkbox" checked={selected.includes(s.id)} disabled={Boolean(busy) || (!selected.includes(s.id) && selected.length >= 3)} onChange={() => setSelected(ids => ids.includes(s.id) ? ids.filter(id => id !== s.id) : [...ids, s.id])} /><span><MathText inline>{s.title}</MathText><small>{s.routeMember ? zh ? "当前路线材料" : "Current route material" : zh ? "本空间候选材料，需判断适配性" : "Workspace candidate; check its fit"}</small></span></label>)}</div>
      <label className="pi-workbook-repair-option"><input type="checkbox" checked={allowRepair} disabled={Boolean(busy)} onChange={e => setAllowRepair(e.target.checked)} /><span>{zh ? '允许根据评审反馈修订一次' : 'Allow one correction using review feedback'}<small>{zh ? '试用：会增加模型调用。材料不足时停止；修订后全部重新核对。' : 'Pilot: adds model calls. Stops for missing evidence; all corrected content is reviewed again.'}</small></span></label>
      {state && state.candidates.length < 2 && <p>{zh ? "当前不足两篇已审核且有摘要的材料。已有发现流程继续补证；这里不会用未审核论文凑数。" : "Fewer than two reviewed papers have abstracts. Existing discovery continues; unreviewed papers cannot fill the comparison."}</p>}
      <button type="button" disabled={Boolean(busy) || dirty || selected.length < 2 || missing.length > 0} onClick={() => void prepare(false)}>{zh ? "准备有据的比较与任务" : "Prepare comparison and tasks"}</button>
      {versions.length > 1 && <label>{zh ? "历史版本" : "History"}<select value={state?.id || ""} disabled={Boolean(busy) || dirty} onChange={e => void openVersion(e.target.value)}>{versions.map((v, i) => <option key={v.id} value={v.id}>{versions.length - i} · {v.created_at} · {v.status}</option>)}</select></label>}
    </details>
    {state && ["draft", "verifying", "retryable"].includes(state.status) && !busy && <div role="status">
      <p>{state.failure ? workbookFailureText(state.failure.code, zh) : zh ? "内容尚未完成，已保存的部分可继续处理。" : "Content is unfinished; saved progress can be continued."}</p>
      {state.failure?.code === 'invalid_response' && state.failure.detail && <p>{workbookResponseDetailText(state.failure.detail, zh)}</p>}
      <p>{state.revisionFlow?.next === 'repair' ? (zh ? '评审反馈已保存，下一步按反馈修订一次，再全部重新核对。' : 'Review feedback is saved. Next: one correction, followed by a full independent review.') : state.stage === 'review' ? (zh ? "比较草稿已保存，继续时只进行独立核对。" : "The draft is saved. Continuing resumes independent review only.") : (zh ? "尚未保存完整草稿，继续时会重新生成当前步骤。" : "A complete draft is not saved yet. Continuing regenerates this step.")}</p>
      {Boolean(state.reviewProgress?.total) && <p>{zh ? "已核对比较项：" : "Reviewed fields: "}{state.reviewProgress!.completed} / {state.reviewProgress!.total}</p>}
      <button type="button" disabled={state.stale || dirty || state.retryAt > now || (state.busyUntil || 0) > now} onClick={() => void prepare(true)}>{state.revisionFlow?.next === 'repair' ? (zh ? '修订并重新核对' : 'Correct and review again') : state.stage === 'draft' ? (zh ? "继续生成" : "Continue generation") : (zh ? "继续核对" : "Continue review")}</button>
      <button type="button" disabled={dirty} onClick={() => void openVersion(state.id!)}>{zh ? "刷新进度" : "Refresh progress"}</button>
      {(state.busyUntil || 0) > now && <small>{zh ? "已有请求正在处理，可以刷新进度；超时后可继续。" : "A request is in progress. Refresh its progress; continue if it expires."}</small>}
      {state.retryAt > now && <small>{zh ? "稍后重试：" : "Retry after: "}{new Date(state.retryAt).toLocaleTimeString()}</small>}
    </div>}
    {state?.revisionFlow && <p role="status">{zh ? '反馈修订：' : 'Feedback corrections: '}{state.revisionFlow.repairs} / {state.revisionFlow.limit}{state.status === 'rejected' ? (zh ? ' · 本次流程已停止，请按下方原因补充材料或调整问题。' : ' · This run has stopped. Use the reasons below to revise the question or sources.') : ''}</p>}
    {state?.status === "rejected" && <section className="pi-workbook-review-issues"><h2>{zh ? '比较未通过的原因' : 'Why the comparison did not pass'}</h2><p>{zh ? "请按具体原因核查材料。未通过的内容尚未发布为研究结论。" : "Check the sources against these specific reasons. Rejected content has not been published as a research finding."}</p>
      {!!state.reviewIssues?.length && <ul>{state.reviewIssues.map(issue => <li key={issue.id}><strong>{reviewIssueLabel(issue.id, zh)}</strong><p><MathText>{issue.reason}</MathText></p>{issue.issueType === 'evidence_gap' && <small>{zh ? '需要补充证据，自动修订已停止。' : 'Additional evidence is needed; automatic correction has stopped.'}</small>}<div>{issue.paperIds.map(id => { const paper = state.sources.find(s => s.id === id); return paper && <button type="button" key={id} onClick={() => onOpenPaper(paper, issue.reason)}>{zh ? '核查材料：' : 'Inspect source: '}{paper.title}</button>; })}</div></li>)}</ul>}
      {!state.revisionFlow && <button type="button" disabled={Boolean(busy) || state.stale || dirty} onClick={() => void prepare(false, true)}>{zh ? '试用按反馈修订一次' : 'Try one feedback correction'}</button>}
    </section>}
    {content && <>
      <div className="pi-comparison-sources">{state.sources.map((source,index) => <div key={source.id}><span>{String(index+1).padStart(2,"0")}</span><p><MathText inline>{source.title}</MathText></p></div>)}</div>
      <nav className="pi-workbook-tabs" aria-label={zh ? "比较工作视角" : "Workbook view"}>{(["evidence", "relations", "task"] as const).map(p => <button type="button" key={p} aria-pressed={panel === p} onClick={() => {setPanel(p);onViewChange?.(p,focus);}}>{p === "evidence" ? zh ? "条件与证据" : "Conditions & evidence" : p === "relations" ? zh ? "关系与可比性" : "Relationships & comparability" : zh ? "研究练习" : "Research exercise"}</button>)}</nav>

      <div className={`pi-workbook-layout${focused ? " inspecting" : ""}`}><div>
        {panel === "evidence" && <section><h2>{zh ? "条件比较表" : "Condition comparison"}</h2><p>{zh ? "点选比较项，查看摘要出处并记录自己的核查。摘要缺少的信息会明确标注。" : "Select a cell to inspect its abstract evidence and record your check. Missing means not provided in the abstract."}</p><div className="pi-workbook-table-scroll"><table><thead><tr><th>{zh ? "比较维度" : "Dimension"}</th>{state.sources.map(s => <th key={s.id}><MathText inline>{s.title}</MathText></th>)}</tr></thead><tbody>{content.dimensions.map(d => <tr key={d.id}><th><strong>{text(d, "label")}</strong><small>{text(d, "purpose")}</small></th>{state.sources.map(s => { const c = d.cells.find(c => c.paperId === s.id)!; const id = `${d.id}:${s.id}`; return <td key={s.id}><button type="button" aria-pressed={focus === id} onClick={() => inspect(id)}><MathText>{c.status === "missing" ? zh ? "摘要未提供" : "Not provided in abstract" : text(c, "text")}</MathText>{artifact.observations[id] && <small>{zh ? "已有核查笔记" : "Check recorded"}</small>}</button></td>; })}</tr>)}</tbody></table></div></section>}
        {panel === "relations" && <section><h2>{zh ? "这些结果能否直接比较？" : "Can these results be compared directly?"}</h2><div className="pi-workbook-relation" role="group" aria-label={zh ? "材料与比较关系" : "Sources and comparison"}>{state.sources.map((s, i) => <div key={s.id}><span>{i + 1}</span><MathText inline>{s.title}</MathText></div>)}<strong>{content.comparison.status === "comparable" ? zh ? "当前证据支持比较" : "Comparable in current evidence" : content.comparison.status === "conditional" ? zh ? "需区分适用条件" : "Conditional comparison" : zh ? "信息不足，关系待核查" : "Insufficient evidence; relationship unresolved"}</strong></div><p><MathText>{text(content.comparison, "text")}</MathText></p><p>{zh ? "以下连结指向比较依据；不表示论文之间存在引用、支持或推广关系。" : "The links below identify comparison evidence; they do not assert citation, support or generalization relationships."}</p><div className="pi-workbook-evidence-links">{content.comparison.evidenceIds.map(id => <button type="button" key={id} onClick={() => inspect(id)}>{content.dimensions.find(d => id.startsWith(d.id + ":"))?.[zh ? "labelZh" : "labelEn"]} · {state.sources.find(s => id.endsWith(":" + s.id))?.title}</button>)}</div></section>}
        {panel === "task" && <section><h2>{text(content.task, "title")}</h2><ol>{content.task.steps.map((s, i) => <li key={i}><MathText>{text(s, "text")}</MathText><div className="pi-workbook-evidence-links">{s.evidenceIds.map(id => <button key={id} type="button" onClick={() => inspect(id)}>{zh ? "查看依据" : "Inspect evidence"} · {content.dimensions.find(d => id.startsWith(d.id + ":"))?.[zh ? "labelZh" : "labelEn"]}</button>)}</div></li>)}</ol><p><strong>{zh ? "完成标准：" : "Completion criteria: "}</strong><MathText>{text(content.task, "criterion")}</MathText></p><section className="pi-workbook-lesson"><h3>{zh ? "解决当前障碍的学习单元" : "Learning unit for the current obstacle"}</h3><h4>{text(content.learning, "goal")}</h4><dl><dt>{zh ? "需要的基础" : "Prerequisites"}</dt><dd><MathText>{text(content.learning, "prerequisite")}</MathText></dd><dt>{zh ? "用这些材料练习" : "Exercise using these sources"}</dt><dd><MathText>{text(content.learning, "exercise")}</MathText></dd><dt>{zh ? "检查自己的结果" : "Check your result"}</dt><dd><MathText>{text(content.learning, "checkpoint")}</MathText></dd></dl></section></section>}

      </div><aside id="workbook-evidence-inspector" tabIndex={-1} className="pi-workbook-inspector" aria-label={zh ? "证据与核查笔记" : "Evidence and check notes"}>{focused && source ? <><div className="pi-inspector-heading"><h2>{text(focused.dimension, "label")}</h2><button type="button" onClick={() => { setFocus("");onViewChange?.(panel,""); requestAnimationFrame(() => inspectorTrigger.current?.focus()); }}>{zh ? "关闭依据" : "Close evidence"} ×</button></div><h3><MathText inline>{source.title}</MathText></h3>{focused.cell.quote ? <blockquote><MathText>{focused.cell.quote}</MathText><cite>{zh ? "来源：该论文摘要" : "Source: paper abstract"}</cite></blockquote> : <p>{zh ? "摘要未提供这项信息，不能用推测补全。" : "The abstract does not provide this information; do not fill it by inference."}</p>}<button type="button" onClick={() => onOpenPaper(source, text(focused.dimension, "purpose"))}>{zh ? "带着这项核查打开论文" : "Open paper for this check"} →</button><label>{zh ? "这一项的核查笔记" : "Check note for this cell"}<textarea value={artifact.observations[focus] || ""} maxLength={2500} disabled={Boolean(busy)} onChange={e => editArtifact(a => ({ ...a, observations: { ...a.observations, [focus]: e.target.value } }))} /></label><small>{zh ? "核查笔记与下方判断一并保存。" : "This note is saved with the comparison artifact."}</small></> : <><h2>{zh ? "证据侧栏" : "Evidence inspector"}</h2><p>{zh ? "选择表格中的比较项或任务中的依据，即可查看具体出处。" : "Select a comparison cell or task reference to inspect its source."}</p></>}</aside></div>
        <section className="pi-workbook-artifact"><DraftRecovery key={draftKey} storageKey={draftKey} current={JSON.stringify(artifact)} base={JSON.stringify(state.artifact?.value || emptyArtifact())} locale={locale} onRestore={value => { try { const restored = JSON.parse(value); if (typeof restored.decision === "string" && typeof restored.unresolved === "string" && restored.observations && typeof restored.observations === "object") setArtifact(restored); } catch { setError(zh ? "草稿无法读取，已保存内容不受影响。" : "Draft unavailable; saved content is unchanged."); } }} /><h2>{zh ? "我的判断与记录" : "My judgment and notes"}</h2><p>{zh ? "记录自己的判断；这不会自动确认研究路线、已读或掌握。" : "Record your judgment. This does not confirm a research route, reading status or mastery."}</p><label>{zh ? "目前的判断及依据" : "Current judgment and evidence"}<textarea value={artifact.decision} maxLength={4000} disabled={Boolean(busy)} onChange={e => editArtifact(a => ({ ...a, decision: e.target.value }))} /></label><label>{zh ? "仍缺的条件或待解决问题" : "Missing conditions or unresolved questions"}<textarea value={artifact.unresolved} maxLength={4000} disabled={Boolean(busy)} onChange={e => editArtifact(a => ({ ...a, unresolved: e.target.value }))} /></label><button type="button" disabled={Boolean(busy) || !dirty || state.stale} onClick={() => void save()}>{zh ? "保存记录" : "Save notes"}</button><small>{dirty ? zh ? "有未保存修改，请先保存再切换版本。" : "Unsaved changes; save before switching versions." : state.artifact ? `${zh ? "已保存版本" : "Saved revision"} ${state.artifact.revision}` : zh ? "尚未保存" : "Not saved yet"}</small></section>
    </>}
  </main>;
}
