import type {GraphTaskContext} from './graph-task';
import type {RouteComparison} from './route-overview';

/** Summary, question and primary action must describe the same task. */
export function comparisonTaskTarget(selection:GraphTaskContext,draft:GraphTaskContext|null|undefined,record:RouteComparison|undefined,matchingId:string|null=null){
  if(draft)return {kind:'draft' as const,question:draft.question,saved:false};
  if(record?.savedRevision&&matchingId===record.id)return {kind:'record' as const,question:record.question,saved:true};
  if(selection.papers.length>=2)return {kind:'selection' as const,question:selection.question,saved:false};
  if(record&&!record.savedRevision)return {kind:'record' as const,question:record.question,saved:false};
  if(selection.papers.length)return {kind:'selection' as const,question:selection.question,saved:false};
  return {kind:'record' as const,question:record?.question||'',saved:Boolean(record?.savedRevision)};
}
