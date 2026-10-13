import {MathText} from './math-text';
export type DigestOverviewData={date:string;historical:boolean;boundToTask?:boolean;headline:string;overview:string;findings:{id:string;title:string;text:string;action:string}[]};
export function DigestOverview({data,locale,demo,onRead}:{data:DigestOverviewData;locale:'zh'|'en';demo:boolean;onRead:(id:string)=>void}) {
 const zh=locale==='zh';
 return <section className="pi-digest-overview" aria-label={zh?'本期检索综述':'Discovery overview'}>
  <p className="pi-digest-edition">{demo?(zh?'演示综述':'SAMPLE OVERVIEW'):data.boundToTask?(zh?'单次任务简报':'TASK BRIEF'):(zh?'空间检索综述 · 日汇总':'SPACE DAILY OVERVIEW')} · {data.date}{!demo&&!data.boundToTask&&data.historical?(zh?' · 历史记录':' · Earlier edition'):''}</p>
  <h3>{data.headline||(zh?'本期发现与关注点':'Findings & priorities')}</h3>
  {data.overview&&<p className="pi-digest-opening"><MathText inline>{data.overview}</MathText></p>}
  {data.findings.length>0&&<div className="pi-digest-findings"><h4>{zh?'值得关注':'Worth your attention'}</h4>{data.findings.map((finding,index)=><div className="pi-digest-finding" key={finding.id}>
   <span aria-hidden="true">{String(index+1).padStart(2,'0')}</span><div><p><MathText inline>{finding.text}</MathText></p>
   {finding.action&&<p className="pi-digest-reading-action"><MathText inline>{finding.action}</MathText></p>}
   <button type="button" onClick={()=>onRead(finding.id)} title={finding.title}>{zh?'依据论文：':'Source: '}<MathText inline>{finding.title}</MathText></button></div>
  </div>)}</div>}
 </section>;
}
