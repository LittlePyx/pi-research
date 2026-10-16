import {datedBriefText} from './today-presentation.mjs';
import {briefEditorial} from './brief-editorial.mjs';

/** Keep saved findings bound to their original paper IDs, not the display order. */
export function digestOverview(brief, papers, locale='zh') {
 if (!brief) return null;
 const zh=locale==='zh', suffix=zh?'Zh':'En';
 const ids=brief.paperIds || [], seen=new Set();
 const findings=ids.flatMap((id,index)=>{
  if(seen.has(id))return []; seen.add(id);
  const paper=papers.find(p=>p.id===id);
  if(!paper || paper.qualityStage!=='recommended' || ['dismissed','snoozed'].includes(paper.userState) || ['not_relevant','later'].includes(paper.feedback))return [];
  const text=brief['signals'+suffix]?.[index] || paper['contribution'+suffix] || paper['whyRead'+suffix];
  if(!text?.trim())return [];
  return [{id,title:paper.title,text,action:brief['readingPlan'+suffix]?.[index] || ''}];
 }).slice(0,3);
 const editorial=briefEditorial(brief,findings,locale);
 return {
  date:brief.date,
  historical:!brief.isCurrent,
  headline:brief.model==='evidence-summary' ? (zh?'本期发现与关注点':'Findings & priorities') : datedBriefText(brief['headline'+suffix] || '',brief),
  ...editorial,overview:datedBriefText(editorial.overview,brief),...(editorial.process?{process:datedBriefText(editorial.process,brief)}:{}),
  findings,
 };
}
