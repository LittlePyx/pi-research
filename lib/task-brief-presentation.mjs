import {datedBriefText} from './today-presentation.mjs';
import {briefEditorial} from './brief-editorial.mjs';
/** @param {import('./task-brief').TaskBriefView|null|undefined} task */
export function taskBriefOverview(task,locale='zh'){
 if(!task)return null;
 const suffix=locale==='zh'?'Zh':'En',summary=task.summary;
 const state=id=>task.currentStates.find(s=>s.paperId===id);
 const findings=task.records.filter(r=>r.selected&&r.paperId&&state(r.paperId)&&!state(r.paperId).snoozed&&!['not_relevant','later'].includes(state(r.paperId).feedback)).slice(0,3).map(r=>({id:r.paperId||'',title:r.title,text:r['signal'+suffix]||r.review?.['contribution'+suffix]||r.review?.['whyRead'+suffix]||'',action:r['action'+suffix]||''})).filter(f=>f.text);
 const dated={date:summary.briefDate,isCurrent:false};
 const editorial=briefEditorial(summary,findings,locale);
 return {date:summary.briefDate,historical:true,boundToTask:true,headline:summary.model==='evidence-summary'?(locale==='zh'?'本次任务的发现与关注点':'This task’s findings & priorities'):datedBriefText(summary['headline'+suffix],dated),...editorial,overview:datedBriefText(editorial.overview,dated),...(editorial.process?{process:datedBriefText(editorial.process,dated)}:{}),findings};
}
/** @param {import('./task-brief').TaskBriefView|null|undefined} task
 * @param {string|undefined} goalId
 * @param {string[]} excludedIds */
export function taskBriefReading(task,goalId,excludedIds=[]){
 if(!task||goalId&&task.scope.problemId!==goalId)return null;
 const excluded=new Set(excludedIds);
 return task.records.filter(r=>r.selected&&r.paperId&&!excluded.has(r.paperId)&&task.currentStates.some(s=>s.paperId===r.paperId&&s.recommended&&!s.snoozed&&!['read','mastered','cited'].includes(s.readingStatus)&&!['not_relevant','later'].includes(s.feedback))).map(r=>({id:r.paperId||'',title:r.title,whyZh:r.review?.whyReadZh||'',whyEn:r.review?.whyReadEn||'',focusZh:r.review?.readingFocusZh||'',focusEn:r.review?.readingFocusEn||'',checkZh:r.review?.limitationsZh||'',checkEn:r.review?.limitationsEn||'',contributionZh:r.review?.contributionZh||'',contributionEn:r.review?.contributionEn||''}));
}
/** @param {import('./task-brief').TaskBriefView|null|undefined} task
 * @param {string[]} excludedIds */
export function taskBriefLeads(task,excludedIds=[]){
 if(!task)return [];
 const excluded=new Set(excludedIds);
 return task.records.filter(r=>!r.selected&&r.paperId&&!excluded.has(r.paperId)&&task.currentStates.some(s=>s.paperId===r.paperId&&!s.recommended&&!s.snoozed&&!['read','mastered','cited'].includes(s.readingStatus)&&!['not_relevant','later'].includes(s.feedback))).slice(0,4).map(r=>({id:r.paperId||'',title:r.title,venue:r.venue,publishedAt:r.publishedAt,discoveredAt:r.discoveredAt,qualityStage:!r.review?'queued':r.review.verificationStatus==='pending'||r.review.verificationRetryable?'reviewing':'reviewed',screeningReason:r.review?.screeningReason||'',discoverySources:[{key:r.source,labelZh:r.source==='demo-fixture'?'演示文献记录':r.source,labelEn:r.source==='demo-fixture'?'Demo paper record':r.source}]}));
}
