import {MathText} from './math-text';
type Reading = {id:string;title:string;whyZh:string;whyEn:string};
type Context = {goal:{id:string;question:string;status:string;monitoringStatus:string}|null;papers:Reading[];loading:boolean;unavailable:boolean;fieldDescription?:string};
export function DiscoveryBrief({context,active,demo,locale,onRead,onLibrary,onProgress}:{context?:Context;active:boolean;demo:boolean;locale:'zh'|'en';onRead:(id:string)=>void;onLibrary:()=>void;onProgress:()=>void}) {
 const zh=locale==='zh';
 // Only the current question endpoint supplies these independently checked links.
 // Never fill this list from the space-wide discovery archive.
 const papers=context?.goal&&!context.loading&&!context.unavailable?context.papers.filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i).slice(0,3):[];
 const inactive=context?.goal&&(context.goal.status!=='active'||context.goal.monitoringStatus!=='active');
 const summary=context?.unavailable?(zh?'暂时无法核对当前问题的关联结果，请重试读取研究问题。':'Related results could not be checked. Retry loading the research question.')
  :context?.loading?(zh?'正在核对当前问题与已有阅读。':'Checking the current question and its readings.')
  :!context?.goal?(zh?'按研究领域整理阅读，目前暂无可展示的精选。已发现的材料和评审记录仍可查看，无需先提出问题。':'Reading is selected for your research field. No selected reading is available yet; discovered materials and reviews remain accessible without a question.')
  :papers.length?(zh?'以下阅读已关联这个问题，可从评审依据判断是否值得深入。':'These readings are linked to this question. Use the review rationale to decide what to explore.')
  :inactive?(zh?'这个问题已暂停或结束，目前没有可展示的关联阅读。':'This question is paused or resolved, with no related readings to display.')
  :(zh?'目前还没有已核验、可展示的关联阅读；这不代表没有检索结果。可在发现进度中查看查询、候选和评审记录。':'No verified related reading is available yet. This does not mean discovery found nothing. Check queries, candidates and reviews in Discovery.');
 return <section className="pi-discovery-brief" aria-label={zh?'文献发现简报':'Discovery brief'}>
  <header><div><p className="pi-brief-eyebrow">{demo?(zh?'演示材料':'DEMO MATERIALS'):(context?.goal?(zh?'围绕当前问题':'YOUR RESEARCH QUESTION'):(zh?'你的研究领域':'YOUR RESEARCH FIELD'))}</p><h2>{zh?'研究简报':'Research brief'}</h2></div><button type="button" onClick={onProgress}>{zh?'查看发现进度':'View discovery'} →</button></header>
  {!context?.goal&&context?.fieldDescription&&<p className="pi-brief-scope">{context.fieldDescription}</p>}
  <p className="pi-brief-summary">{summary}</p>
  {active&&!demo&&<p className="pi-brief-scope">{zh?'本空间有检索或评审任务正在进行；具体问题的执行记录见发现进度。':'A discovery or review task is running in this space. See Discovery for the question-specific records.'}</p>}
  {papers.length>0&&<ol>{papers.map(p=><li key={p.id}><button className="pi-brief-paper" type="button" onClick={()=>onRead(p.id)}><MathText inline>{p.title}</MathText><span aria-hidden="true">↗</span></button><p><MathText inline>{zh?p.whyZh:p.whyEn}</MathText></p></li>)}</ol>}
  <button type="button" onClick={onLibrary}>{zh?'浏览空间文献库':'Browse space library'} →</button>
 </section>;
}
