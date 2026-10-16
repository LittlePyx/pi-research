import {sessionDraftKey,readSessionDraft,writeSessionDraft,clearSessionDraft} from './session-draft.ts';
import type {GraphTaskContext} from './graph-task';
export const comparisonInputKey=(user:string,space:string,track:string,version='')=>sessionDraftKey(user,space,`comparison-input:${track}:${version}`);
/** Session input is only a selection intent; the server still checks every paper's eligibility. */
export function readComparisonInput(key:string,spaceId:string):GraphTaskContext|undefined {
 try {
  const value=JSON.parse(readSessionDraft(key)?.value||'null');
  if(!value||value.spaceId!==spaceId||typeof value.question!=='string'||value.question.length>1000||!Array.isArray(value.papers)||value.papers.length>3)return;
  if(value.papers.some((p:{canonicalId?:unknown;title?:unknown})=>typeof p?.canonicalId!=='string'||!p.canonicalId||p.canonicalId.length>240||typeof p.title!=='string'||p.title.length>2000))return;
  return value;
 }catch{return;}
}
export const writeComparisonInput=(key:string,context:GraphTaskContext)=>writeSessionDraft(key,'',JSON.stringify(context));
export function clearComparisonInput(key:string){const draft=readSessionDraft(key);if(draft)clearSessionDraft(key,draft.value);}
