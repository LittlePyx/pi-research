export function TodayDiscoveryStatus({state,hasReading,phase,candidates,reviewed,href,locale}:{state:'running'|'error'|'idle';hasReading:boolean;phase:string;candidates?:number;reviewed?:number;href:string;locale:'zh'|'en'}) {
 if(state==='idle')return null;
 const zh=locale==='zh',running=state==='running';
 const count=(value:number|undefined)=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):null;
 const found=count(candidates),checked=count(reviewed);
 return <section className={`pi-discovery-notice ${hasReading?'is-compact':'is-empty'} ${running?'is-running':'is-error'}`} aria-label={zh?'文献查找状态':'Literature discovery status'}>
  <div className="pi-discovery-indicator" aria-hidden="true">{running?<span/>:'!'}</div>
  <div className="pi-discovery-message"><div role="status" aria-live="polite"><h2>{running?(zh?(hasReading?'Pi 正在寻找新的文献':'Pi 正在为你寻找文献'):(hasReading?'Pi is finding new papers':'Pi is finding papers for you')):(zh?'本次文献查找暂时中断':'Literature discovery has paused')}</h2><p>{running?(hasReading?(phase||(zh?'正在检索与核对，你可以继续阅读已有材料。':'Searching and checking. You can keep reading saved papers.')):(zh?'正在检索与核对相关论文。通过评审的材料会自动出现在这里。':'Searching and checking relevant papers. Reviewed selections will appear here automatically.')):(zh?'已有材料仍然保留。可查看原因与恢复操作。':'Saved materials are preserved. View the reason and recovery options.')}</p></div>
  {running&&!hasReading&&phase&&<p className="pi-discovery-phase">{phase}</p>}
  {running&&(found||checked)&&<p className="pi-discovery-counts">{[found?(zh?`已找到 ${found} 篇候选`:`${found} candidates found`):'',checked?(zh?`已评审 ${checked} 篇`:`${checked} reviewed`):''].filter(Boolean).join(' · ')}</p>}</div>
  <a href={href}>{running?(zh?'查看发现进度':'View progress'):(zh?'查看原因与恢复':'View recovery options')} <span aria-hidden="true">→</span></a>
 </section>;
}
