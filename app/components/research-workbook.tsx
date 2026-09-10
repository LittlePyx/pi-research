"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkbookArtifact, WorkbookSource, WorkbookState } from "../../lib/research-workbook";
import { MathText } from "./math-text";
import "./research-workbook.css";

const emptyArtifact = (): WorkbookArtifact => ({ observations: {}, decision: "", unresolved: "" });
type WorkbookResponse = { workbook: WorkbookState; versions: Array<{ id: string; status: string; created_at: string }>; error?: string };
export function ResearchWorkbook({ spaceId, trackId, locale, onOpenPaper, onBack }: {
  spaceId: string; trackId: string; locale: "zh" | "en";
  onOpenPaper: (source: WorkbookSource, focus: string) => void;
  onBack: () => void;
}) {
  const [state, setState] = useState<WorkbookState | null>(null);
  const [versions, setVersions] = useState<Array<{ id: string; status: string; created_at: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [panel, setPanel] = useState<"evidence" | "relations" | "task">("evidence");
  const [focus, setFocus] = useState("");
  const [artifact, setArtifact] = useState<WorkbookArtifact>(emptyArtifact);
  const [busy, setBusy] = useState("load"); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const zh = locale === "zh";
  const content = state?.content;
  const text = (value: { [key: string]: unknown }, key: string) => String(value[`${key}${zh ? "Zh" : "En"}`] || "");
  const dirty = JSON.stringify(artifact) !== JSON.stringify(state?.artifact?.value || emptyArtifact());

  useEffect(() => {
    const abort = new AbortController(); const epoch = ++generation.current;
    fetch(`/api/research-workbook?spaceId=${encodeURIComponent(spaceId)}&trackId=${encodeURIComponent(trackId)}`, { signal: abort.signal })
      .then(async r => { const data = await r.json() as WorkbookResponse; if (!r.ok) throw new Error(data.error || "Unable to load workbook"); return data; })
      .then(data => { if (generation.current !== epoch) return; setState(data.workbook); setVersions(data.versions); setArtifact(data.workbook.artifact?.value || emptyArtifact()); setSelected(data.workbook.sources.length ? data.workbook.sources.map((s: WorkbookSource) => s.id) : data.workbook.candidates.filter((s: WorkbookSource) => s.routeMember).slice(0, 3).map((s: WorkbookSource) => s.id)); })
      .catch(e => { if (!abort.signal.aborted && generation.current === epoch) setError(e.message); })
      .finally(() => { if (generation.current === epoch) setBusy(""); });
    return () => { abort.abort(); generation.current = epoch + 1; };
  }, [spaceId, trackId]);

  useEffect(() => {
    if (!state?.retryAt) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, state.retryAt - Date.now() + 50));
    return () => clearTimeout(timer);
  }, [state?.retryAt]);

  const inspect = (id: string) => {
    setFocus(id);
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 850px)").matches) document.getElementById("workbook-evidence-inspector")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      setState(data.workbook); setNotice(zh ? "产物已保存；阅读与掌握状态保持原样。" : "Artifact saved; reading and mastery statuses are unchanged.");
    } catch (e) { if (generation.current === epoch) setError(e instanceof Error ? e.message : "Save failed"); }
    finally { if (generation.current === epoch) setBusy(""); }
  };
  const prepare = async (resume: boolean) => {
    if (busy || dirty) return;
    const epoch = generation.current; setBusy(resume ? "verify" : "draft"); setError(""); setNotice("");
    try {
      let data = await request(resume ? { action: "advance", workbookId: state?.id } : { action: "prepare", paperIds: selected });
      if (generation.current !== epoch) return;
      setState(data.workbook); setVersions(data.versions);
      if (data.workbook.status === "verifying" && !data.workbook.stale) {
        setBusy("verify"); data = await request({ action: "advance", workbookId: data.workbook.id });
        if (generation.current !== epoch) return;
        setState(data.workbook); setVersions(data.versions);
      }
      setArtifact(data.workbook.artifact?.value || emptyArtifact()); setFocus("");
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
      setSelected(data.workbook.sources.map((s: WorkbookSource) => s.id));
    } catch (e) { if (generation.current === epoch) setError(e instanceof Error ? e.message : "Load failed"); }
    finally { if (generation.current === epoch) setBusy(""); }
  };
  const focused = content?.dimensions.flatMap(d => d.cells.map(c => ({ dimension: d, cell: c, id: `${d.id}:${c.paperId}` }))).find(c => c.id === focus);
  const source = state?.sources.find(s => s.id === focused?.cell.paperId);

  return <main className="pi-workbook">
    <button type="button" className="v2-back" onClick={onBack}>← {zh ? "返回研究" : "Back to research"}</button>
    <header className="pi-workbook-heading"><p>{zh ? "研究比较工作台 · 候选草稿" : "Research comparison · candidate draft"}</p><h1><MathText>{content ? text(content, "question") : zh ? "把论文放在相同条件下比较" : "Compare papers under explicit conditions"}</MathText></h1><p>{zh ? "证据、核查任务与学习练习共用一份比较表。" : "Evidence, research tasks and learning exercises share one comparison table."}</p></header>
    {error && <p role="alert" className="pi-workbook-error">{error}</p>}
    <p role="status">{busy ? busy === "verify" ? (zh ? "正在独立核对每个比较项和学习任务…" : "Independently checking every comparison and learning field…") : busy === "draft" ? (zh ? "正在从选定摘要提取比较维度和具体任务…" : "Extracting comparison dimensions and concrete tasks from the selected abstracts…") : (zh ? "正在读取或保存…" : "Loading or saving…") : notice}</p>
    {state?.stale && <p className="pi-workbook-error">{zh ? "这是旧证据版本。来源或研究问题已变化，旧内容仅供回顾；请用当前材料重新准备。" : "Evidence or the research question changed. This version is historical; prepare a new comparison with current sources."}</p>}
    <details className="pi-workbook-picker" open={!content}>
      <summary>{zh ? "比较材料与历史版本" : "Comparison sources and versions"}</summary>
      <p>{zh ? "选择 2–3 篇已审核论文。原始成果与补充阅读的身份不会因此改变。" : "Select 2–3 reviewed papers. This does not change their original or supplementary evidence roles."}</p>
      <div>{state?.candidates.map(s => <label key={s.id} aria-label={s.title}><input type="checkbox" checked={selected.includes(s.id)} disabled={Boolean(busy) || (!selected.includes(s.id) && selected.length >= 3)} onChange={() => setSelected(ids => ids.includes(s.id) ? ids.filter(id => id !== s.id) : [...ids, s.id])} /><span><MathText>{s.title}</MathText><small>{s.routeMember ? zh ? "当前路线材料" : "Current route material" : zh ? "本空间候选材料，需判断适配性" : "Workspace candidate; check its fit"}</small></span></label>)}</div>
      {state && state.candidates.length < 2 && <p>{zh ? "当前不足两篇已审核且有摘要的材料。已有发现流程继续补证；这里不会用未审核论文凑数。" : "Fewer than two reviewed papers have abstracts. Existing discovery continues; unreviewed papers cannot fill the comparison."}</p>}
      <button type="button" disabled={Boolean(busy) || dirty || selected.length < 2} onClick={() => void prepare(false)}>{zh ? "准备有据的比较与任务" : "Prepare comparison and tasks"}</button>
      {versions.length > 1 && <label>{zh ? "历史版本" : "History"}<select value={state?.id || ""} disabled={Boolean(busy) || dirty} onChange={e => void openVersion(e.target.value)}>{versions.map((v, i) => <option key={v.id} value={v.id}>{versions.length - i} · {v.created_at} · {v.status}</option>)}</select></label>}
    </details>
    {state && ["draft", "verifying", "retryable"].includes(state.status) && !busy && <p>{zh ? "内容尚未完成，已保存的部分可继续处理。" : "Content is unfinished; saved progress can be continued."} <button type="button" disabled={state.stale || dirty || state.retryAt > now} onClick={() => void prepare(true)}>{zh ? "继续核对" : "Continue review"}</button>{state.retryAt > now && <small>{zh ? "稍后重试：" : "Retry after: "}{new Date(state.retryAt).toLocaleTimeString()}</small>}</p>}
    {state?.status === "rejected" && <p>{zh ? "这组材料生成的比较未通过内容核对。请调整材料；未审核稿不会展示成研究结论。" : "The comparison failed content review. Adjust the sources; an unreviewed draft is not presented as a research finding."}</p>}
    {content && <>
      <nav className="pi-workbook-tabs" aria-label={zh ? "比较工作视角" : "Workbook view"}>{(["evidence", "relations", "task"] as const).map(p => <button type="button" key={p} aria-pressed={panel === p} onClick={() => setPanel(p)}>{p === "evidence" ? zh ? "条件与证据" : "Conditions & evidence" : p === "relations" ? zh ? "关系与可比性" : "Relationships & comparability" : zh ? "任务、学习与产物" : "Tasks, learning & artifacts"}</button>)}</nav>
      <div className="pi-workbook-layout"><div>
        {panel === "evidence" && <section><h2>{zh ? "条件比较表" : "Condition comparison"}</h2><p>{zh ? "点选比较项，查看摘要出处并记录自己的核查。空白表示摘要未提供。" : "Select a cell to inspect its abstract evidence and record your check. Missing means not provided in the abstract."}</p><div className="pi-workbook-table-scroll"><table><thead><tr><th>{zh ? "比较维度" : "Dimension"}</th>{state.sources.map(s => <th key={s.id}><MathText>{s.title}</MathText></th>)}</tr></thead><tbody>{content.dimensions.map(d => <tr key={d.id}><th><strong>{text(d, "label")}</strong><small>{text(d, "purpose")}</small></th>{state.sources.map(s => { const c = d.cells.find(c => c.paperId === s.id)!; const id = `${d.id}:${s.id}`; return <td key={s.id}><button type="button" aria-pressed={focus === id} onClick={() => inspect(id)}><MathText>{c.status === "missing" ? zh ? "摘要未提供" : "Not provided in abstract" : text(c, "text")}</MathText>{artifact.observations[id] && <small>{zh ? "已有核查笔记" : "Check recorded"}</small>}</button></td>; })}</tr>)}</tbody></table></div></section>}
        {panel === "relations" && <section><h2>{zh ? "这些结果能否直接比较？" : "Can these results be compared directly?"}</h2><div className="pi-workbook-relation" role="group" aria-label={zh ? "材料与比较关系" : "Sources and comparison"}>{state.sources.map((s, i) => <div key={s.id}><span>{i + 1}</span><MathText>{s.title}</MathText></div>)}<strong>{content.comparison.status === "comparable" ? zh ? "当前证据支持比较" : "Comparable in current evidence" : content.comparison.status === "conditional" ? zh ? "需区分适用条件" : "Conditional comparison" : zh ? "信息不足，关系待核查" : "Insufficient evidence; relationship unresolved"}</strong></div><p><MathText>{text(content.comparison, "text")}</MathText></p><p>{zh ? "以下连结指向比较依据；不表示论文之间存在引用、支持或推广关系。" : "The links below identify comparison evidence; they do not assert citation, support or generalization relationships."}</p><div className="pi-workbook-evidence-links">{content.comparison.evidenceIds.map(id => <button type="button" key={id} onClick={() => inspect(id)}>{content.dimensions.find(d => id.startsWith(d.id + ":"))?.[zh ? "labelZh" : "labelEn"]} · {state.sources.find(s => id.endsWith(":" + s.id))?.title}</button>)}</div></section>}
        {panel === "task" && <section><h2>{text(content.task, "title")}</h2><ol>{content.task.steps.map((s, i) => <li key={i}><MathText>{text(s, "text")}</MathText><div className="pi-workbook-evidence-links">{s.evidenceIds.map(id => <button key={id} type="button" onClick={() => inspect(id)}>{zh ? "查看依据" : "Inspect evidence"} · {content.dimensions.find(d => id.startsWith(d.id + ":"))?.[zh ? "labelZh" : "labelEn"]}</button>)}</div></li>)}</ol><p><strong>{zh ? "完成标准：" : "Completion criteria: "}</strong><MathText>{text(content.task, "criterion")}</MathText></p><section className="pi-workbook-lesson"><h3>{zh ? "解决当前障碍的学习单元" : "Learning unit for the current obstacle"}</h3><h4>{text(content.learning, "goal")}</h4><dl><dt>{zh ? "需要的基础" : "Prerequisites"}</dt><dd><MathText>{text(content.learning, "prerequisite")}</MathText></dd><dt>{zh ? "用这些材料练习" : "Exercise using these sources"}</dt><dd><MathText>{text(content.learning, "exercise")}</MathText></dd><dt>{zh ? "检查自己的结果" : "Check your result"}</dt><dd><MathText>{text(content.learning, "checkpoint")}</MathText></dd></dl></section></section>}
        <section className="pi-workbook-artifact"><h2>{zh ? "我的比较产物" : "My comparison artifact"}</h2><p>{zh ? "记录自己的判断；这不会自动确认研究路线、已读或掌握。" : "Record your judgment. This does not confirm a research route, reading status or mastery."}</p><label>{zh ? "目前的判断及依据" : "Current judgment and evidence"}<textarea value={artifact.decision} maxLength={4000} disabled={Boolean(busy)} onChange={e => setArtifact(a => ({ ...a, decision: e.target.value }))} /></label><label>{zh ? "仍缺的条件或待解决问题" : "Missing conditions or unresolved questions"}<textarea value={artifact.unresolved} maxLength={4000} disabled={Boolean(busy)} onChange={e => setArtifact(a => ({ ...a, unresolved: e.target.value }))} /></label><button type="button" disabled={Boolean(busy) || !dirty || state.stale} onClick={() => void save()}>{zh ? "保存比较产物" : "Save comparison artifact"}</button><small>{dirty ? zh ? "有未保存修改，请先保存再切换版本。" : "Unsaved changes; save before switching versions." : state.artifact ? `${zh ? "已保存版本" : "Saved revision"} ${state.artifact.revision}` : zh ? "尚未保存" : "Not saved yet"}</small></section>
      </div><aside id="workbook-evidence-inspector" className="pi-workbook-inspector" aria-label={zh ? "证据与核查笔记" : "Evidence and check notes"}>{focused && source ? <><h2>{text(focused.dimension, "label")}</h2><h3><MathText>{source.title}</MathText></h3>{focused.cell.quote ? <blockquote><MathText>{focused.cell.quote}</MathText><cite>{zh ? "来源：该论文摘要" : "Source: paper abstract"}</cite></blockquote> : <p>{zh ? "摘要未提供这项信息，不能用推测补全。" : "The abstract does not provide this information; do not fill it by inference."}</p>}<button type="button" onClick={() => onOpenPaper(source, text(focused.dimension, "purpose"))}>{zh ? "带着这项核查打开论文" : "Open paper for this check"} →</button><label>{zh ? "这一项的核查笔记" : "Check note for this cell"}<textarea value={artifact.observations[focus] || ""} maxLength={2500} disabled={Boolean(busy)} onChange={e => setArtifact(a => ({ ...a, observations: { ...a.observations, [focus]: e.target.value } }))} /></label><small>{zh ? "笔记随“保存比较产物”一并保存。" : "This note is saved with the comparison artifact."}</small></> : <><h2>{zh ? "证据侧栏" : "Evidence inspector"}</h2><p>{zh ? "选择表格中的比较项或任务中的依据，即可查看具体出处。" : "Select a comparison cell or task reference to inspect its source."}</p></>}</aside></div>
    </>}
  </main>;
}
