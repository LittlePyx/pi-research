import type {WorkbookState} from './research-workbook';
import {workbookFailureText} from './workbook-recovery.ts';

export function workbookStatusLabel(status:string,zh:boolean){
  const labels:Record<string,[string,string]>={empty:['待选择材料','Choose sources'],draft:['生成中','Drafting'],verifying:['核对中','Reviewing'],ready:['已核验','Reviewed'],rejected:['待补证或调整问题','Needs evidence or a revised question'],retryable:['可恢复','Resumable']};
  return labels[status]?.[zh?0:1]||(zh?'状态待确认':'Status unavailable');
}
export function workbookPresentation(state:WorkbookState|null,busy:string,error:string,zh:boolean){
  const review=state?.stage==='review'||state?.status==='verifying';
  const repair=state?.revisionFlow?.next==='repair';
  const phase=state?.status==='ready'?'record':review||repair?'review':state?.id||busy==='draft'?'draft':'sources';
  const title=busy==='load'?(zh?'正在读取比较与保存记录':'Loading the comparison and saved notes'):busy==='save'?(zh?'正在保存比较记录':'Saving comparison notes'):state?.stale?(zh?'依据已变化，需要重新核对':'Evidence changed; review is needed'):state?.status==='rejected'?(zh?'核对未通过，请检查具体依据':'Review did not pass; inspect the evidence'):error||state?.failure?(review?(zh?'核对暂时中断':'Review interrupted'):(zh?'比较暂未完成':'Comparison incomplete')):state?.status==='ready'?(zh?'比较已核验，可继续记录判断':'Comparison reviewed; record your judgment'):busy==='verify'||review?(zh?'正在独立核对比较内容':'Independently reviewing the comparison'):busy==='draft'?(zh?'正在生成有据的比较':'Preparing an evidence-based comparison'):(zh?'选择材料并确定比较问题':'Choose sources and a comparison question');
  const retained=state?.status==='ready'?(zh?'已核验的比较与保存记录保留在当前版本。':'Reviewed content and saved notes remain in this version.'):review||repair?(zh?'比较草稿已保存，继续时只进行独立核对。':'The draft is saved. Continuing resumes independent review only.'):(zh?'所选论文和输入问题保留；尚未完成的内容不会作为研究结论发布。':'Selected papers and your question are retained. Unfinished content is not published as a research finding.');
  const next=state?.stale?(zh?'使用当前材料重新准备比较，旧版本仍可回顾。':'Prepare with current sources; the old version remains available.'):state?.status==='rejected'?(zh?'查看未通过项；补充证据或收窄问题后再准备比较。':'Inspect failed fields; add evidence or narrow the question before preparing again.'):error?(zh?'先刷新进度，确认已经完成的步骤，再继续处理。':'Refresh progress to check completed steps before continuing.'):repair?(zh?'按反馈修订一次，再核对全部内容。':'Apply one correction, then review all content.'):state?.status==='ready'?(zh?'核查具体出处，保存自己的判断与待解决问题。':'Check sources and save your judgment and unresolved questions.'):(zh?'完成当前步骤后进入核对；刷新进度不会重新生成内容。':'Continue the current step. Refreshing progress does not regenerate content.');
  return {phase,title:error&&state?.status==='ready'?(zh?'操作未完成，已有比较保留':'Action incomplete; the reviewed comparison is preserved'):title,retained,next,failure:state?.failure?workbookFailureText(state.failure.code,zh):''};
}
