'use client';

import { useEffect, useRef } from 'react';
import { SAVED_COMPARISON_PAGE_SIZE } from '../../lib/research-memory-view';
import { comparisonMemoryResponse } from '../../lib/saved-memory-response';
import { workspaceHash, type MemoryLocation } from '../../lib/workspace-navigation';
import { MathText } from './math-text';
import { useSavedRead } from './use-saved-read';

type Route = { id: string; title: string };

export function MemoryResume({ spaceId, routes, locale, location, onLocationChange }: {
  spaceId: string; routes: Route[]; locale: 'zh' | 'en'; location: MemoryLocation;
  onLocationChange: (patch: MemoryLocation) => void;
}) {
  const zh = locale === 'zh';
  const { memoryTrack: trackId = '', memoryQuery: query = '', memoryPage: page = 1, memoryFocus: focusedId } = location;
  const offset = (page - 1) * SAVED_COMPARISON_PAGE_SIZE;
  const params = new URLSearchParams({ spaceId, kind: 'comparisons', trackId, q: query, offset: String(offset) });
  const read = useSavedRead(JSON.stringify([spaceId, trackId]), '/api/research-memory?' + params, comparisonMemoryResponse);
  const section = useRef<HTMLElement>(null);
  const result = read.data;
  const shownQuery = new URLSearchParams(read.dataUrl?.split('?')[1]).get('q') || '';
  const shownPage = result ? Math.floor(result.offset / SAVED_COMPARISON_PAGE_SIZE) + 1 : 1;

  useEffect(() => {
    if (!focusedId || !result || read.loading || read.error) return;
    const anchor = Array.from(section.current?.querySelectorAll<HTMLAnchorElement>('[data-saved-comparison]') || [])
      .find(link => link.dataset.savedComparison === focusedId);
    anchor?.focus({ preventScroll: true });
    anchor?.scrollIntoView({ block: 'center' });
  }, [focusedId, result, read.loading, read.error]);

  const changeFilters = (patch: MemoryLocation) => onLocationChange({ ...patch, memoryPage: undefined, memoryFocus: undefined });
  const changePage = (memoryPage: number) => onLocationChange({ memoryPage, memoryFocus: undefined });
  const retryLabel = zh ? '重试' : 'Retry';

  return <section ref={section} className="pi-memory-resume" aria-label={zh ? '已保存比较' : 'Saved comparisons'}>
    <header><h2>{zh ? '比较记录' : 'Saved comparisons'}</h2></header>
    <div className="pi-memory-comparison-filters">
      <form key={query} role="search" onSubmit={event => {
        event.preventDefault();
        const next = String(new FormData(event.currentTarget).get('q') || '').trim();
        if (next === query && page === 1) read.reload();
        else changeFilters({ memoryQuery: next || undefined });
      }}>
        <label>{zh ? '搜索比较记录' : 'Search comparisons'}<input name="q" defaultValue={query} maxLength={160} placeholder={zh ? '研究问题、路线或判断' : 'Question, route or judgment'} /></label>
        <button type="submit">{zh ? '搜索' : 'Search'}</button>
        {query && <button type="button" onClick={() => changeFilters({ memoryQuery: undefined })}>{zh ? '清除' : 'Clear'}</button>}
      </form>
      <label>{zh ? '研究路线' : 'Research route'}<select value={trackId} onChange={event => changeFilters({ memoryTrack: event.target.value || undefined })}>
        <option value="">{zh ? '全部路线' : 'All routes'}</option>
        {trackId && !routes.some(route => route.id === trackId) && <option value={trackId}>{zh ? '当前路线' : 'Current route'}</option>}
        {routes.map(route => <option key={route.id} value={route.id}>{route.title}</option>)}
      </select></label>
    </div>
    {read.loading && <p role="status">{result ? (zh ? '正在更新，暂时显示上次载入的比较。' : 'Updating. Previously loaded comparisons are shown.') : (zh ? '正在载入比较记录…' : 'Loading saved comparisons…')}</p>}
    {read.error && <div className="pi-saved-read-error" role="alert">
      <p>{read.error === 'access' || read.error === 'missing' ? (zh ? '当前研究空间暂不可访问。' : 'This workspace cannot be accessed.') : result ? (zh ? '读取未完成，以下保留上次载入的记录。' : 'Could not load comparisons. Previously loaded records are shown.') : (zh ? '比较记录暂未载入。' : 'Comparison records could not load.')}</p>
      <button type="button" onClick={read.reload}>{retryLabel}</button>
    </div>}
    {result && <>
      <p className="pi-memory-count">{zh ? `${result.total} 份比较记录` : `${result.total} saved comparisons`}{shownQuery && ` · ${shownQuery}`}</p>
      {!result.items.length && <p>{result.offset ? (zh ? '本页暂无记录，请返回上一页。' : 'This page is empty. Return to the previous page.') : shownQuery || trackId ? (zh ? '当前筛选没有匹配的比较记录。' : 'No saved comparisons match these filters.') : (zh ? '在论文比较中保存判断、待查问题或核查笔记后，可以在这里找回。' : 'Judgments, open questions and notes saved in comparisons will appear here.')}</p>}
      <div className="pi-memory-comparisons">{result.items.map(item => {
        const returnTo = workspaceHash({ view: 'memory', space: spaceId, ...location, memoryQuery: shownQuery, memoryPage: shownPage, memoryFocus: item.workbookId });
        const href = workspaceHash({ view: 'workbook', id: item.trackId, space: spaceId, workbookId: item.workbookId, from: 'memory', returnTo });
        return <article key={item.workbookId}>
          <p className="pi-memory-comparison-meta"><span>{zh ? item.routeZh : item.routeEn}</span><time dateTime={item.savedAt.replace(' ', 'T')}>{item.savedAt.slice(0, 10)}</time></p>
          <h3><a href={href} data-saved-comparison={item.workbookId}><MathText inline>{zh ? item.questionZh : item.questionEn}</MathText></a></h3>
          {(item.decision || item.unresolved) && <details><summary>{zh ? '查看判断与待查问题' : 'Judgment and open questions'}</summary>
            {item.decision && <div><h4>{zh ? '已保存判断' : 'Saved judgment'}</h4><p className="pi-memory-comparison-text"><MathText>{item.decision}</MathText></p></div>}
            {item.unresolved && <div><h4>{zh ? '待查问题' : 'Open questions'}</h4><p className="pi-memory-comparison-text"><MathText>{item.unresolved}</MathText></p></div>}
          </details>}
        </article>;
      })}</div>
      {Boolean(result.offset || result.nextOffset !== null) && <nav className="pi-memory-pagination" aria-label={zh ? '比较记录分页' : 'Saved comparison pages'}>
        <button type="button" disabled={read.loading || Boolean(read.error) || !result.offset} onClick={() => changePage(page - 1)}>{zh ? '上一页' : 'Previous'}</button>
        <span>{shownPage} / {Math.max(1, Math.ceil(result.total / SAVED_COMPARISON_PAGE_SIZE))}</span>
        <button type="button" disabled={read.loading || Boolean(read.error) || result.nextOffset === null} onClick={() => changePage(page + 1)}>{zh ? '下一页' : 'Next'}</button>
      </nav>}
    </>}
  </section>;
}
