'use client';
import { useState } from 'react';
import { comparisonLocation, decodeContinuation, readComparisonLocation } from '../../lib/workbook-continuation';
import { useSavedRead } from './use-saved-read';
import { MathText } from './math-text';

export function TodayContinuation({ userId, spaceId, locale, onResume }: { userId: string; spaceId: string; locale: 'zh' | 'en'; onResume: (hash: string) => void }) {
  const zh = locale === 'zh';
  const [location] = useState(() => readComparisonLocation(userId, spaceId));
  const read = useSavedRead(`${userId}:${spaceId}`, '/api/workspace-continuation?' + new URLSearchParams({ spaceId, location }), decodeContinuation);
  const item = read.data?.continuation;
  if (!item || !comparisonLocation(item.hash, spaceId)) return read.error ? <p className="pi-continuation-status" role="status">{zh ? '比较任务暂未载入。' : 'Comparison tasks could not load.'} <button type="button" onClick={read.reload}>{zh ? '重试' : 'Retry'}</button></p> : null;
  const paper = comparisonLocation(item.hash, spaceId)!.location.view === 'paper-detail';
  const action = !paper&&item.practice ? (item.practice.allCompleted ? (zh?'回顾练习成果':'Review exercise results') : (zh?'继续下一项练习':'Continue the next exercise')) : paper ? (zh ? '继续核对原文' : 'Continue checking the source') : item.status === 'ready' ? (zh ? '继续比较与记录' : 'Continue comparison & notes') : item.status === 'rejected' || item.status === 'retryable' ? (zh ? '查看问题与恢复' : 'Review issues & recovery') : (zh ? '查看生成进度' : 'View generation progress');
  return <section className="pi-today-continuation" aria-label={zh ? '继续比较任务' : 'Continue your comparison'}>
    <div><p className="pi-continuation-eyebrow">{zh ? '继续你的研究' : 'CONTINUE YOUR RESEARCH'} · {zh ? `${item.sourceCount} 篇比较` : `${item.sourceCount} papers`}</p>
      <h2 title={zh ? item.titleZh : item.titleEn}><MathText inline>{zh ? item.titleZh : item.titleEn}</MathText></h2>
      <p>{item.practice ? (zh?`已确认完成 ${item.practice.completed}/${item.practice.total} 项 · 成果已保存`:`${item.practice.completed}/${item.practice.total} confirmed complete · results saved`) : item.status === 'ready' ? item.savedRevision ? (zh ? `已有比较结果与记录 · 已保存版本 ${item.savedRevision}` : `Comparison and notes · saved revision ${item.savedRevision}`) : (zh ? '已有比较结果，可继续记录结论与待解问题。' : 'Comparison available. Continue recording conclusions and open questions.') : item.status === 'rejected' ? (zh ? '核对未通过，打开后查看具体问题。' : 'Review did not pass. Open the comparison for details.') : item.status === 'retryable' ? (zh ? '生成已中断，打开后从已保存进度恢复。' : 'Generation was interrupted. Open to resume from the saved progress.') : (zh ? '任务进度已保存，打开后查看下一步。' : 'Progress saved. Open to see the next step.')}</p>
      {read.error && <p role="status">{zh ? '状态暂未更新，显示上次读取的任务。' : 'Showing the last loaded task; status could not refresh.'} <button type="button" onClick={read.reload}>{zh ? '重试' : 'Retry'}</button></p>}
    </div>
    <button className="primary" type="button" onClick={() => onResume(item.hash)}>{action} →</button>
  </section>;
}
