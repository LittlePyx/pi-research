import type { PracticeEntry, WorkbookPractice } from './workbook-practice';

export type PracticeConflict = { taskId: string; field: 'result' | 'unresolved'; local: string; remote: string };
const empty: PracticeEntry = { result: '', unresolved: '', completed: false };

/** Three-way merge: selection stays local; confirmation only follows an unchanged, confirmed entry. */
export function mergePractice(base: WorkbookPractice | null, local: WorkbookPractice, remote: WorkbookPractice | null) {
  const conflicts: PracticeConflict[] = [];
  const entries: WorkbookPractice['entries'] = {};
  for (const taskId of new Set([...Object.keys(base?.entries || {}), ...Object.keys(local.entries), ...Object.keys(remote?.entries || {})])) {
    const b = base?.entries[taskId] || empty, l = local.entries[taskId] || empty, r = remote?.entries[taskId] || empty;
    const merged = { ...l };
    for (const field of ['result', 'unresolved'] as const) {
      if (l[field] === b[field]) merged[field] = r[field];
      else if (r[field] !== b[field] && l[field] !== r[field]) conflicts.push({ taskId, field, local: l[field], remote: r[field] });
    }
    const completed = l.completed === b.completed ? r.completed : l.completed;
    merged.completed = completed && Boolean(merged.result.trim()) && [l, r].some(entry => entry.completed && entry.result === merged.result && entry.unresolved === merged.unresolved);
    entries[taskId] = merged;
  }
  return { value: { activeId: local.activeId, entries }, conflicts };
}
