'use client';

import { useEffect, useRef } from 'react';
import type { LibraryGraphNeighbor, LibraryGraphResult } from '../../lib/library-graph';
import { MathText } from './math-text';
import {GraphPaperChoice} from './graph-paper-choice';
import type {RouteSelection} from './use-route-selection';
import './library-citation-neighborhood.css';

export type LibraryCitationSnapshot = LibraryGraphResult & {
  focusTitle?: string; focusCanonicalId?:string; status: 'pending' | 'ready' | 'empty' | 'partial' | 'error' | 'missing_id';
  checkedAt: string | null; retryAt: number; busy: boolean;
};

const neighborKey = (paper: LibraryGraphNeighbor) => `${paper.kind}:${paper.canonicalId}`;
const graphLimit = 3;

export function LibraryCitationNeighborhood({ paper, graph, locale, checking, loading, cooling, error, onCheck, onRetry, onOpen, onFocus, mode, selected, onSelect, onMode, selection, active }: {
  paper: { id: string; title: string }; graph: LibraryCitationSnapshot | null; locale: 'zh' | 'en';
  checking: boolean; loading: boolean; cooling: boolean; error: string;
  onCheck: () => void; onRetry: () => void; onOpen: (id: string) => void; onFocus: (paper: { id: string; title: string }) => void;
  mode:'graph'|'list';selected:string;onSelect:(id:string)=>void;onMode:(mode:'graph'|'list')=>void;selection?:RouteSelection;active:boolean;
}) {
  const zh = locale === 'zh';
  const inspector = useRef<HTMLElement>(null);
  const restored=useRef('');
  const items = graph?.items || [];
  const selectedPaper = items.find(item => neighborKey(item) === selected);
  const title = graph?.focusTitle || paper.title;
  const groups = [
    { kind: 'reference', title: zh ? '参考文献' : 'References', items: items.filter(item => item.kind === 'reference') },
    { kind: 'citation', title: zh ? '后续引用' : 'Citing papers', items: items.filter(item => item.kind === 'citation') },
  ] as const;
  const canCheck = Boolean(graph && !checking && !loading && !graph.busy && !graph.limited && !cooling && graph.status !== 'missing_id');
  const statuses = {
    pending: zh ? '等待查询引用关系。' : 'Citation links have yet to be queried.',
    ready: zh ? '显示来源已返回的直接引用。' : 'Showing direct citations returned by the provider.',
    partial: zh ? '仅覆盖部分关系，已找到的引用可以先看。' : 'Coverage is partial. Available links are shown below.',
    empty: zh ? '该来源未返回关系，其他来源可能仍有记录。' : 'This provider returned no links. Other sources may have records.',
    error: zh ? '引用来源暂不可用，可以稍后重试。' : 'The citation provider is unavailable. Retry later.',
    missing_id: zh ? '这篇论文缺少可查询的 DOI、arXiv 或 Semantic Scholar 标识。' : 'This paper has no supported DOI, arXiv or Semantic Scholar identifier.',
  };

  const selectedKey=selectedPaper?neighborKey(selectedPaper):'';
  useEffect(()=>{
    if(!active||!selectedKey){restored.current='';return;}
    if(restored.current===selectedKey)return;
    restored.current=selectedKey;
    const frame=requestAnimationFrame(() => {
      const panel = inspector.current;
      if (!panel) return;
      const { top, bottom } = panel.getBoundingClientRect();
      if (mode === 'list' || top < 72 || bottom > window.innerHeight) {
        panel.focus({ preventScroll: true });
        panel.scrollIntoView({ block: 'nearest' });
      }
    });
    return()=>cancelAnimationFrame(frame);
  },[active,selectedKey,mode]);

  const detail = selectedPaper && <section ref={inspector} tabIndex={-1} className="pi-citation-neighbor" aria-label={zh ? '关系详情' : 'Citation details'}>
    <div>
      <p>{selectedPaper.kind === 'reference' ? (zh ? '起点论文引用此文' : 'The starting paper cites this work') : (zh ? '此文引用起点论文' : 'This work cites the starting paper')} · {selectedPaper.provider}</p>
      <h3><MathText inline>{selectedPaper.title}</MathText></h3>
      <p>{[selectedPaper.authors, selectedPaper.year, selectedPaper.paperId ? (zh ? '已在论文库' : 'In library') : (zh ? '库外文献' : 'Outside library')].filter(Boolean).join(' · ')}</p>
    </div>
    <div className="pi-citation-actions">
      {selectedPaper.paperId && <>
        <GraphPaperChoice paper={selectedPaper} selection={selection} locale={locale}/>
        <button type="button" onClick={() => onOpen(selectedPaper.paperId!)}>{zh ? '阅读论文' : 'Read paper'}</button>
        <button type="button" onClick={() => onFocus({ id: selectedPaper.paperId!, title: selectedPaper.title })}>{zh ? '以此为起点' : 'Explore from here'}</button>
      </>}
      {/^https?:\/\//i.test(selectedPaper.url) && <a href={selectedPaper.url} target="_blank" rel="noreferrer">{zh ? '打开来源' : 'Open source'} ↗</a>}
    </div>
  </section>;

  return <section className="pi-library-citation" aria-label={zh ? '引用网络' : 'Citation network'}>
    <header className="pi-citation-header">
      <div><h2>{zh ? '引用网络' : 'Citation network'}</h2>
        {graph && <p role="status">{graph.busy || checking ? (zh ? '正在查询来源，已有关系可以继续查看。' : 'Checking sources. Existing links remain available.') : statuses[graph.status]}</p>}
        {!graph && loading && <p role="status">{zh ? '正在读取已保存的引用关系…' : 'Loading saved citation links…'}</p>}
      </div>
      <div className="pi-citation-actions">
        {items.length > 0 && <div role="group" aria-label={zh ? '引用展示方式' : 'Citation display'} className="pi-citation-display">
          <button type="button" aria-pressed={mode === 'graph'} onClick={() => onMode('graph')}>{zh ? '网络图' : 'Network'}</button>
          <button type="button" aria-pressed={mode === 'list'} onClick={() => onMode('list')}>{zh ? '列表' : 'List'}</button>
        </div>}
        {graph && graph.status !== 'missing_id' && !graph.limited && <button type="button" disabled={!canCheck} onClick={onCheck}>
          {checking || graph.busy ? (zh ? '查询中…' : 'Checking…') : cooling ? (zh ? '等待再次查询' : 'Waiting to retry') : graph.status === 'partial' ? (zh ? '查询下一批' : 'Check next batch') : (zh ? '查询引用' : 'Check citations')}
        </button>}
      </div>
    </header>
    {error && <p role="alert">{error} <button type="button" onClick={onRetry}>{zh ? '重新读取' : 'Reload links'}</button></p>}
    {mode === 'list' && detail}
    <div className="pi-citation-diagram" data-mode={mode}>
      <div className="pi-citation-origin" data-has-references={groups[0].items.length > 0} data-has-citations={groups[1].items.length > 0}>
        <span>{zh ? '当前论文' : 'Starting paper'}</span>
        <h3><MathText inline>{title}</MathText></h3>
        <div className="pi-citation-actions"><button type="button" onClick={() => onOpen(paper.id)}>{zh ? '阅读起点论文' : 'Read starting paper'}</button>
          {graph?.focusCanonicalId&&<GraphPaperChoice paper={{canonicalId:graph.focusCanonicalId,title}} selection={selection} locale={locale}/>}</div>
      </div>
      {groups.map(group => <section key={group.kind} className="pi-citation-group" data-kind={group.kind}>
        <h3>{group.title}{graph && <span>{group.items.length}</span>}</h3>
        <ul>{(mode === 'graph' ? group.items.slice(0, graphLimit) : group.items).map(item => <li key={neighborKey(item)}>
          <button type="button" aria-pressed={selected === neighborKey(item)} onClick={() => onSelect(neighborKey(item))}>
            <span className="pi-citation-node-title"><MathText inline>{item.title}</MathText></span>
            <small>{[item.year, item.paperId ? (zh ? '库内' : 'In library') : (zh ? '库外' : 'External')].filter(Boolean).join(' · ')}</small>
          </button>
        </li>)}</ul>
        {graph && !group.items.length && <p>{zh ? '当前无可显示记录' : 'No links to show'}</p>}
        {mode === 'graph' && group.items.length > graphLimit && <button type="button" className="pi-citation-show-all" onClick={() => onMode('list')}>{zh ? `查看全部 ${group.items.length} 篇` : `See all ${group.items.length}`} →</button>}
      </section>)}
    </div>
    {mode === 'graph' && detail}
    {graph && <div className="pi-citation-coverage">
      {items.length > 0 && mode === 'graph' && <span className="pi-citation-arrow-legend">{zh ? '箭头从引用方指向被引用方' : 'Arrows point from citing to cited papers'}</span>}
      {mode === 'graph' && groups.some(group => group.items.length > graphLimit) && <span>{zh ? `每侧先展示 ${graphLimit} 篇` : `Up to ${graphLimit} per side`}</span>}
      {graph.limited && <span>{zh ? '已达到 400 条关系的展示上限。' : 'The 400-link limit has been reached.'}</span>}
      {cooling && <span>{zh ? '下次可查询' : 'Next query'} {new Date(graph.retryAt).toLocaleTimeString(zh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
      {graph.checkedAt && <span>{zh ? '已查询' : 'Checked'} {new Date(graph.checkedAt).toLocaleDateString(zh ? 'zh-CN' : 'en-US')}</span>}
    </div>}
  </section>;
}
