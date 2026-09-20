"use client";
import { useState } from "react";
import { readSessionDraft, clearSessionDraft } from "../../lib/session-draft";

/** Recovery is explicit: a browser draft never confirms a research decision. */
export function DraftRecovery({ storageKey, current, base, locale, onRestore }: {
  storageKey: string; current: string; base: string; locale: "zh" | "en"; onRestore: (value: string) => void;
}) {
  const [candidate, setCandidate] = useState(() => readSessionDraft(storageKey));
  if (!candidate || candidate.value === current || candidate.value === base) return null;
  const zh = locale === "zh";
  return <aside className="pi-draft-recovery" role="status">
    <strong>{candidate.base !== base ? (zh ? "已保存内容有变化，另有未提交草稿" : "Saved content changed; an unsubmitted draft is available") : (zh ? "找到本标签页的未提交草稿" : "An unsubmitted draft is available in this tab")}</strong>
    <p>{zh ? "恢复只填写编辑区，不会提交或确认研究内容。" : "Restoring fills the editor without submitting or confirming research."}</p>
    <details><summary>{zh ? "查看草稿" : "Preview draft"}</summary><pre>{candidate.value || (zh ? "（空内容）" : "(Empty)")}</pre></details>
    <button type="button" onClick={() => { onRestore(candidate.value); setCandidate(null); }}>{zh ? "恢复到编辑区" : "Restore to editor"}</button>
    <button type="button" onClick={() => { clearSessionDraft(storageKey, candidate.value); setCandidate(null); }}>{zh ? "保留已保存内容" : "Keep saved content"}</button>
  </aside>;
}
