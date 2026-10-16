import {MathText} from './math-text';
export type DigestOverviewData={date:string;historical:boolean;boundToTask?:boolean;headline:string;overview:string;overviewSources?:{id:string;title:string}[];process?:string;findings:{id:string;title:string;text:string;action:string}[]};
export function DigestOverview({data,locale,demo,onRead,onEvidence}:{data:DigestOverviewData;locale:'zh'|'en';demo:boolean;onRead:(id:string)=>void;onEvidence?:(id:string)=>void}) {
 const zh=locale==='zh';
 return <section className="pi-digest-overview" aria-label={zh?'本期检索综述':'Discovery overview'}>
  <p className="pi-digest-edition">{demo?(zh?'演示综述':'SAMPLE OVERVIEW'):data.boundToTask?(zh?'单次任务简报':'TASK BRIEF'):(zh?'空间检索综述 · 日汇总':'SPACE DAILY OVERVIEW')} · {data.date}{!demo&&!data.boundToTask&&data.historical?(zh?' · 历史记录':' · Earlier edition'):''}</p>
  <h3>{data.headline||(zh?'本期发现与关注点':'Findings & priorities')}</h3>
  {data.overview&&<p className="pi-digest-opening"><MathText inline>{data.overview}</MathText></p>}
  {data.overviewSources?.length&&<nav className="pi-digest-sources" aria-label={zh?'简报依据':'Brief sources'}>{data.overviewSources.map((source,index)=><button type="button" key={source.id} onClick={()=>(onEvidence||onRead)(source.id)}>[{index+1}] <MathText inline>{source.title}</MathText> →</button>)}</nav>}
  {data.process&&<details className="pi-digest-process"><summary>{zh?'检索与核验过程':'Search & verification process'}</summary><p><MathText inline>{data.process}</MathText></p></details>}
  {data.findings.length>0&&<details className="pi-digest-findings"><summary>{zh?'展开关注点与论文依据':'Findings & paper sources'} · {data.findings.length}</summary>{data.findings.map((finding,index)=><div className="pi-digest-finding" key={finding.id}>
   <span aria-hidden="true">{String(index+1).padStart(2,'0')}</span><div><p><MathText inline>{finding.text}</MathText></p>
   {finding.action&&<p className="pi-digest-reading-action"><MathText inline>{finding.action}</MathText></p>}
   <button type="button" onClick={()=>(onEvidence||onRead)(finding.id)} title={finding.title}>{zh?'依据论文：':'Source: '}<MathText inline>{finding.title}</MathText></button></div>
  </div>)}</details>}
 </section>;
}
