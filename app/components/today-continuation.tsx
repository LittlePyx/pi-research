'use client';
import { useState } from 'react';
import { comparisonLocation, decodeContinuation, readComparisonLocation } from '../../lib/workbook-continuation';
import { useSavedRead } from './use-saved-read';
import { MathText } from './math-text';
import { workspaceHash } from '../../lib/workspace-navigation';

export function TodayContinuation({ userId, spaceId, locale, onResume }: { userId: string; spaceId: string; locale: 'zh' | 'en'; onResume: (hash: string) => void }) {
  const zh = locale === 'zh';
  const [location] = useState(() => readComparisonLocation(userId, spaceId));
  const read = useSavedRead(`${userId}:${spaceId}`, '/api/workspace-continuation?' + new URLSearchParams({ spaceId, location }), decodeContinuation);
  const item = read.data?.continuation;
  if (item?.practice?.allCompleted) return null;
  const context = item && comparisonLocation(item.hash, spaceId);
  if (!item || !context) return read.error ? <p className="pi-continuation-status" role="status">{zh ? '上次比较暂未载入。' : 'The last comparison could not load.'} <button type="button" onClick={read.reload}>{zh ? '重试' : 'Retry'}</button></p> : null;
  const destination = workspaceHash({ ...context.workbook, ...(item.practice ? { workbookPanel: 'task' as const } : {}), from: context.workbook.from || 'today', returnTo: context.workbook.returnTo || workspaceHash({ view: 'today', space: spaceId }) });
  return <aside className="pi-today-continuation" aria-label={zh ? '未完成的比较' : 'Unfinished comparison'}>
    <span title={zh ? item.titleZh : item.titleEn}>{zh ? `${item.sourceCount} 篇论文 · ` : `${item.sourceCount} papers · `}<MathText inline>{zh ? item.titleZh : item.titleEn}</MathText></span>
    <button type="button" onClick={() => onResume(destination)}>{zh ? '继续上次比较' : 'Continue last comparison'} →</button>
    {read.error && <small role="status">{zh ? '状态暂未更新' : 'Status could not refresh'} <button type="button" onClick={read.reload}>{zh ? '重试' : 'Retry'}</button></small>}
  </aside>;
}
