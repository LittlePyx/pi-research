import { useEffect, useState } from "react";
import { workspaceFetch as fetch } from '../../lib/workspace-request';
import type { ResearchTrack } from "../../lib/research-map";
import { routeNextAction, type RouteComparison, type RouteOverview } from "../../lib/route-overview";
import { currentRouteStatements, routeMaterialState } from "../../lib/route-material-state";
import { MathText } from "./math-text";
import { InterfaceIcon } from "./interface-icon";
import {comparisonEligibilityText} from '../../lib/comparison-eligibility';
import type {RouteSelection} from './use-route-selection';
import "./route-start.css";

type Synthesis = { status: string; stale: boolean; statements: Array<{ id: string; kind: string; titleZh: string; titleEn: string; textZh: string; textEn: string; sourcePaperIds: string[]; sources: Array<{ paperId: string; title: string; evidenceQuote: string; evidenceLevel: string; sourceUrl: string }> }> };
const href = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;

export function RouteStart({ spaceId, active, track, synthesis, loading, failed, locale, onEvidence, onMaterials, onSynthesis, onPaperOpen, onRead, onCompare, onProblem, onLearn, selection }: {
  spaceId: string; active: boolean;
  track: ResearchTrack; synthesis: Synthesis | null; loading: boolean; failed: boolean; locale: "zh" | "en";
  onEvidence: () => void; onMaterials: () => void; onSynthesis: () => void; onPaperOpen: () => void;
  onRead?: (id:string)=>void;
  onCompare: (workbookId?: string, question?: string) => void; onProblem: () => void; onLearn: () => void;
  selection:RouteSelection;
}) {
  const zh = locale === "zh";
  const scope = `${spaceId}:${track.id}`;
  const [remote,setRemote] = useState<{scope:string;data:RouteOverview|null;error:boolean}>({scope:'',data:null,error:false});
  const [retry,setRetry] = useState(0);
  useEffect(()=>{
    if(!active)return;
    const controller=new AbortController();
    setRemote({scope,data:null,error:false});
    fetch('/api/research-workbook?'+new URLSearchParams({spaceId,trackId:track.id,overview:'1'}),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),cache:'no-store'})
      .then(async response=>{const data=await response.json() as {overview?:RouteOverview};if(!response.ok||!data.overview||data.overview.spaceId!==spaceId||data.overview.trackId!==track.id)throw Error();return data.overview;})
      .then(data=>{if(!controller.signal.aborted){setRemote({scope,data,error:false});selection.seedQuestion(data.question);}})
      .catch(()=>{if(!controller.signal.aborted)setRemote({scope,data:null,error:true});});
    return()=>controller.abort();
  },[spaceId,track.id,active,retry]);
  const overview=remote.scope===scope?remote.data:null;
  const overviewFailed=remote.scope===scope&&remote.error;
  const action=routeNextAction(overview);
  const latest=overview?.comparisons[0];
  const actionText={read:zh?'阅读路线材料':'Read route materials',compare:zh?'选择论文比较':'Select papers to compare',resume:zh?'继续上次比较':'Resume comparison',record:zh?'继续记录判断':'Continue your judgment',saved:zh?'查看已保存比较':'View saved comparison',check:zh?'核对已有比较':'Check previous comparison'}[action];
  const openComparison=(item:RouteComparison)=>onCompare(item.id);
  const saved=overview?.savedJudgment;
  const recent=overview?.comparisons.filter(item=>item.id!==saved?.id) || [];
  const savedTime=(value:string)=>new Date(value.includes('T')?value:value.replace(' ','T')+'Z').toLocaleString(zh?'zh-CN':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const comparisonRecord=(item:RouteComparison,judgment=false)=><article key={item.id} className="pi-route-comparison-record">
    <div className="pi-route-record-meta"><span>{item.stale?(zh?'依据已变化 · 需核对':'Evidence changed · check required'):item.status==='ready'?(item.savedRevision?(zh?'已保存':'Saved'):(zh?'比较已就绪 · 待记录':'Ready · add notes')):item.status==='retryable'?(zh?'等待重试':'Retry available'):item.status==='rejected'?(zh?'依据核验未通过':'Evidence review not passed'):(zh?'比较未完成':'Comparison in progress')}</span>{item.savedAt&&<time dateTime={item.savedAt.replace(' ','T')+'Z'}>{savedTime(item.savedAt)}</time>}</div>
    {item.question&&<h3><MathText>{item.question}</MathText></h3>}
    <p className="pi-route-record-papers">{item.papers.map(p=>p.title).join(' / ')|| (zh?'查看原比较中的论文':'View the original sources')}</p>
    {judgment&&<>{item.decision&&<p className="pi-route-record-decision"><MathText>{item.decision}</MathText></p>}{!item.decision&&item.unresolved&&<p className="pi-route-record-decision">{zh?'待解决：':'Unresolved: '}{item.unresolved}</p>}{!item.decision&&!item.unresolved&&<p>{zh?`已保存 ${item.observationCount} 项证据笔记`:`${item.observationCount} evidence notes saved`}</p>}</>}
    <button type="button" onClick={()=>openComparison(item)}>{judgment?(zh?'查看判断与依据':'Judgment & evidence'):(zh?'打开这次比较':'Open comparison')} →</button>
  </article>;
  const material = routeMaterialState(track);
  const papers = track.papers.filter(paper => material.paperIds.includes(paper.id));
  const statements = currentRouteStatements(synthesis);
  const findings = statements.filter(statement => statement.kind !== "evidence_gap");
  const questions = statements.filter(statement => statement.kind === "evidence_gap");
  const loadingMessage = zh ? "正在读取已保存的判断，材料可以先阅读。" : "Loading saved findings. You can read the papers now.";
  const failureMessage = zh ? "判断暂未载入，已有材料仍可阅读。" : "Findings could not load. Collected papers remain available.";
  return <section className="pi-route-start" aria-label={zh ? "当前材料与判断" : "Current materials and findings"}>
    <div className="pi-route-entry">
      <div><small>{zh ? "当前研究问题" : "CURRENT QUESTION"}</small>
        <h2>{overview?.question?<MathText>{overview.question}</MathText>:overview?(zh?'从路线材料中确定一个研究问题':'Define a question from the route materials'):overviewFailed?(zh?'路线状态暂未载入':'Route status unavailable'):(zh?'正在读取当前路线…':'Loading this route…')}</h2>
        {overview?.question&&overview.question.length>90&&<details className="pi-route-question-detail"><summary>{zh?'完整研究问题':'Full research question'}</summary><p><MathText>{overview.question}</MathText></p></details>}
        <p role="status">{overview?(zh?`本路线 ${overview.routeEligibleCount} 篇可比较${overview.routeEligibleCount<2?(overview.eligibleCount>=2?" · 可从工作区补选材料":" · 至少需要两篇已核验摘要"):""}`:`${overview.routeEligibleCount} eligible in this route${overview.routeEligibleCount<2?(overview.eligibleCount>=2?" · Select additional workspace sources":" · Two verified abstracts required"):""}`):overviewFailed?(zh?'已有材料可以继续阅读，请重试加载问题与记录。':'You can read the materials. Retry to load the question and records.'):(zh?'正在核对可用材料与已保存成果':'Checking eligible materials and saved work')}</p>
      </div>
      <div className="pi-route-task-actions"><button type="button" className="pi-research-primary" onClick={()=>latest?openComparison(latest):action==='compare'?onCompare(undefined,overview?.question):onEvidence()}>{actionText} <span aria-hidden="true">→</span></button>{overviewFailed?<button type="button" onClick={()=>setRetry(n=>n+1)}>{zh?'重试加载':'Retry loading'}</button>:overview&&<button type="button" onClick={onProblem}>{overview.question?(zh?'问题与任务':'Question & tasks'):(zh?'确定研究问题':'Define a question')} →</button>}</div>
    </div>
    <div className="pi-route-overview-columns">
      <section className="pi-route-material-preview">
        <header className="pi-route-section-heading"><div><h2>{zh ? "路线材料" : "Route materials"} <span>{papers.length}</span></h2><p>{papers.length ? (zh ? "选一篇开始阅读，或查看全部材料。" : "Pick a paper to read, or explore the full collection.") : (zh ? "尚未收录材料，不代表相关研究不存在。" : "No materials collected yet; relevant research may exist.")}</p></div><button type="button" onClick={onEvidence}>{zh ? "查看全部" : "View all"} →</button></header>
        {papers.length ? <div className="pi-route-start-papers">{papers.slice(0, 4).map((paper,index) => {
          const sourceUrl=href(paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : ""));
          const material=overview?.materials?.find(m=>m.canonicalId.toLowerCase()===paper.canonicalId.toLowerCase());
          const checked=selection.value.papers.some(p=>p.canonicalId.toLowerCase()===paper.canonicalId.toLowerCase());
          const why=material?.eligibility==='eligible'?(zh?material.whyReadZh||material.whyReadEn:material.whyReadEn||material.whyReadZh):'';
          return <article key={paper.id}>
            <span className="pi-route-paper-index" aria-hidden="true">{String(index+1).padStart(2,"0")}</span>
            <div className="pi-route-paper-content">
              <div className="pi-route-paper-meta"><small>{paper.venue || (zh ? "研究论文" : "Research paper")}{paper.publishedAt ? ` · ${paper.publishedAt.slice(0,4)}` : ""}</small><span className="pi-route-paper-state">{paper.provenance === "user_confirmed" ? (zh ? "已确认纳入路线" : "Confirmed") : (zh ? "已收录 · 归属待确认" : "Collected · route fit unconfirmed")}</span></div>
              <p className="pi-route-eligibility">{comparisonEligibilityText(material?.eligibility,zh)}{material&&<span> · {({reading:zh?'阅读中':'Reading',read:zh?'已读':'Read',mastered:zh?'已掌握':'Mastered',cited:zh?'已引用':'Cited',unread:zh?'未标记已读':'Not marked read',queued:zh?'待阅读':'Queued'} as Record<string,string>)[material.readingStatus] || (zh?'未标记已读':'Not marked read')}</span>}</p>
              <h3>{onRead ? <button type="button" className="pi-route-paper-title" onClick={()=>onRead(paper.id)}><MathText inline>{paper.title}</MathText></button> : <MathText inline>{paper.title}</MathText>}</h3>
              <p className="pi-route-paper-authors" title={paper.authors}>{paper.authors}</p>
              {(why || paper.rationaleZh || paper.rationaleEn) && <p className="pi-route-paper-relevance"><strong>{why?(zh?'推荐理由：':'Why read: '):(zh?'收录理由：':'Collection rationale: ')}</strong>{why || (zh?paper.rationaleZh||paper.rationaleEn:paper.rationaleEn||paper.rationaleZh)}</p>}
              <div className="pi-route-paper-actions">{onRead && <button type="button" onClick={()=>onRead(paper.id)}><InterfaceIcon name="reading" />{zh ? "阅读与笔记" : "Read & take notes"}</button>}{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" onClick={onPaperOpen}>{zh ? "原文" : "Original"} ↗</a> : <span>{zh ? "原文链接待补" : "Source link pending"}</span>}</div>
              <label className="pi-route-choose"><input type="checkbox" aria-label={`${zh?'选择比较':'Select for comparison'} ${paper.title}`} checked={checked} disabled={!checked&&(material?.eligibility!=='eligible'||selection.value.papers.length>=3)} onChange={()=>selection.toggle({canonicalId:paper.canonicalId,title:paper.title})} />{zh?'加入比较':'Select to compare'}</label>
              {(paper.rationaleZh || paper.rationaleEn) && <details><summary>{zh ? "完整收录理由" : "Full collection rationale"}</summary><p>{zh ? paper.rationaleZh || paper.rationaleEn : paper.rationaleEn || paper.rationaleZh}</p></details>}
            </div>
          </article>;
        })}</div> : <div className="pi-route-empty-state"><InterfaceIcon name="document" /><h3>{zh ? "为这条线索收集第一批材料" : "Collect the first papers for this lead"}</h3><p>{zh ? "从待审核候选开始，核对相关性后再选用。" : "Start with pending candidates and check their relevance."}</p><button type="button" onClick={onMaterials}>{zh ? "查看候选材料" : "View candidates"} →</button></div>}
      </section>
      <aside className="pi-route-support" aria-label={zh ? "研究判断与工具" : "Findings and research tools"}>
        <section className="pi-route-records"><header className="pi-route-section-heading"><h2>{zh?'我的判断':'My judgment'}</h2><InterfaceIcon name="notes" /></header>{saved?comparisonRecord(saved,true):<p>{overview?(zh?'尚未保存个人判断。比较中的记录会保存在这里。':'No personal judgment saved yet. Your comparison notes will appear here.'):(zh?'问题与记录尚未载入。':'Question and records have not loaded yet.')}</p>}
          {recent.length>0&&<><h2 className="pi-route-recent-heading">{zh?'最近比较':'Recent comparisons'}</h2>{recent.slice(0,2).map(item=>comparisonRecord(item))}</>}
        </section>
        <section className="pi-route-findings-preview"><header className="pi-route-section-heading"><h2>{zh ? "Pi 综合判断" : "Pi synthesis"}</h2><InterfaceIcon name="synthesis" /></header>
          {findings.length ? findings.slice(0,3).map(item=><article key={item.id}><h3>{zh ? item.titleZh : item.titleEn}</h3><p><MathText>{zh ? item.textZh : item.textEn}</MathText></p><details><summary>{zh ? "核对出处" : "Check sources"}</summary>{item.sources.filter(source=>source.evidenceLevel==="abstract"&&source.evidenceQuote.trim()).map((source,index)=><blockquote key={`${source.paperId}:${index}`}><p><MathText>{source.evidenceQuote}</MathText></p>{href(source.sourceUrl)?<a href={href(source.sourceUrl)} target="_blank" rel="noreferrer">{source.title} ↗</a>:<cite>{source.title}</cite>}</blockquote>)}</details></article>) : <div className="pi-route-findings-empty"><p role="status">{loading ? loadingMessage : failed ? failureMessage : synthesis?.stale ? (zh ? "材料已变化，已有判断需要重新核对。" : "Materials changed. Previous findings need review.") : (zh ? "尚无 Pi 综合判断，可在“问题与判断”中核对现有材料。" : "No Pi synthesis yet. Check the collected evidence in Question & findings.")}</p><small>{zh ? "材料整理未完成，不代表领域存在研究空白。" : "Incomplete synthesis does not establish a research gap."}</small></div>}
          <button type="button" onClick={onSynthesis}>{zh ? "查看综合判断" : "View synthesis"} →</button>
        </section>
        <section className="pi-route-tools"><h2>{zh ? "研究工具" : "Research tools"}</h2><button type="button" disabled={!overview||overview.eligibleCount<2} onClick={()=>onCompare(undefined,overview?.question)}><InterfaceIcon name="synthesis" /><span><strong>{zh ? "新建论文比较" : "New comparison"}</strong><small>{overview&&overview.eligibleCount<2?(zh?'至少需要两篇已核验摘要':'Two verified abstracts required'):(zh ? "选择材料并核对条件与依据" : "Select sources and check conditions")}</small></span><span aria-hidden="true">→</span></button><button type="button" onClick={onLearn}><InterfaceIcon name="reading" /><span><strong>{zh ? "路线学习" : "Study this route"}</strong><small>{zh ? "需要补充基础时再开始" : "Build foundations when you need them"}</small></span><span aria-hidden="true">→</span></button></section>
      </aside>
    </div>
    {questions.length>0&&<section className="pi-route-open-questions"><h2>{zh ? "待核实的问题" : "Questions to investigate"}</h2><p>{zh ? "问题限于当前材料范围，尚不能认定为领域未解决问题。" : "Scoped to collected material, not established open problems."}</p>{questions.map(item=><article key={item.id}><h3>{zh ? item.titleZh : item.titleEn}</h3><p>{zh ? item.textZh : item.textEn}</p><button type="button" onClick={onSynthesis}>{zh ? "核对问题依据" : "Check evidence"} →</button></article>)}</section>}
    <details className="pi-route-start-pending"><summary>{zh ? "材料整理进度" : "Collection progress"}<span>{material.inReviewCount+material.pendingConfirmationCount} {zh ? "待处理" : "pending"}</span></summary><ul><li>{zh ? `待审核 ${material.inReviewCount} 篇；待确认纳入 ${material.pendingConfirmationCount} 篇。` : `${material.inReviewCount} in review; ${material.pendingConfirmationCount} awaiting confirmation.`}</li>{material.missingCollectionRoles.length>0&&<li>{zh ? "尚未收录：" : "Not yet collected: "}{material.missingCollectionRoles.map(role=>({foundation:zh?"基础材料":"foundations",milestone:zh?"关键发展":"milestones",frontier:zh?"近期进展":"recent developments"})[role]).join("、")}</li>}</ul><button type="button" onClick={onMaterials}>{zh ? "查看材料补充状态" : "View collection status"} →</button></details>
  </section>;
}
