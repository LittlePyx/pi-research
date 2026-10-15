import type { WorkbookContent } from './research-workbook';

export type PracticeEntry = { result: string; unresolved: string; completed: boolean };
export type WorkbookPractice = { activeId: string; entries: Record<string, PracticeEntry> };
export function workbookPracticeTasks(content: WorkbookContent) {
  return [...content.task.steps.map((step, index) => ({ id: `task-${index}`, titleZh: `${content.task.titleZh} · ${index + 1}`, titleEn: `${content.task.titleEn} · ${index + 1}`, goalZh: step.textZh, goalEn: step.textEn,
    checkpointZh: '记录本步操作、原文依据及适用条件，写明仍需查证的问题。', checkpointEn: 'Record this operation, its source evidence and conditions, and any unresolved checks.', evidenceIds: step.evidenceIds })),
    { id: 'learning', titleZh: content.learning.goalZh, titleEn: content.learning.goalEn, goalZh: content.learning.exerciseZh, goalEn: content.learning.exerciseEn,
      checkpointZh: content.learning.checkpointZh, checkpointEn: content.learning.checkpointEn, evidenceIds: [...new Set(content.task.steps.flatMap(step => step.evidenceIds))] }];
}
export function validateWorkbookPractice(raw: unknown, content: WorkbookContent): WorkbookPractice {
  const value = raw as WorkbookPractice;
  const ids = new Set(workbookPracticeTasks(content).map(task => task.id));
  if (!value || typeof value !== 'object' || !ids.has(value.activeId) || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) throw Error('invalid_practice');
  const entries = Object.fromEntries(Object.entries(value.entries).map(([id, entry]) => {
    if (!ids.has(id) || !entry || typeof entry.result !== 'string' || entry.result.length > 4000 || typeof entry.unresolved !== 'string' || entry.unresolved.length > 2500 || typeof entry.completed !== 'boolean' || entry.completed && !entry.result.trim()) throw Error('invalid_practice_entry');
    return [id, { result: entry.result.trim(), unresolved: entry.unresolved.trim(), completed: entry.completed }];
  }));
  return { activeId: value.activeId, entries };
}
export function practiceProgress(content: WorkbookContent, practice: WorkbookPractice) {
  const tasks = workbookPracticeTasks(content);
  const completed = tasks.filter(task => practice.entries[task.id]?.completed).length;
  const selected = tasks.find(task => task.id === practice.activeId) || tasks[0];
  const active = completed < tasks.length && practice.entries[selected.id]?.completed ? tasks.find(task => !practice.entries[task.id]?.completed)! : selected;
  return { active, completed, total: tasks.length, allCompleted: completed === tasks.length };
}
export function completePractice(content: WorkbookContent, practice: WorkbookPractice): WorkbookPractice {
  const current = practice.entries[practice.activeId];
  if (!current?.result.trim()) throw Error('practice_result_required');
  const entries = { ...practice.entries, [practice.activeId]: { ...current, completed: true } };
  const tasks = workbookPracticeTasks(content), index = tasks.findIndex(task => task.id === practice.activeId);
  const next = [...tasks.slice(index + 1), ...tasks.slice(0, index)].find(task => !entries[task.id]?.completed);
  return validateWorkbookPractice({ activeId: next?.id || practice.activeId, entries }, content);
}
