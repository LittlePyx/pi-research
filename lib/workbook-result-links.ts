import type {WorkbookArtifact,WorkbookContent} from './research-workbook';
import {workbookPracticeTasks,type WorkbookPractice} from './workbook-practice.ts';

export type WorkbookResultLink={taskId:string;field:'decision'|'unresolved';snapshot:string;artifactRevision:number;evidenceIds:string[]};
export const resultLinkKey=(link:Pick<WorkbookResultLink,'taskId'|'field'>)=>`${link.field}:${link.taskId}`;
export const currentLinkedText=(practice:WorkbookPractice|undefined,link:Pick<WorkbookResultLink,'taskId'|'field'>)=>{
  const entry=practice?.entries[link.taskId];return (link.field==='decision'?entry?.result:entry?.unresolved)?.trim()||'';
};
export function validateResultLinks(raw:unknown,content:WorkbookContent):WorkbookResultLink[]{
  const tasks=workbookPracticeTasks(content),seen=new Set<string>();
  if(!Array.isArray(raw)||raw.length>tasks.length*2)throw Error('invalid_result_links');
  return raw.map(value=>{
    const task=tasks.find(task=>task.id===value?.taskId);
    if(!task||!['decision','unresolved'].includes(value.field)||typeof value.snapshot!=='string'||!value.snapshot.trim()||value.snapshot.length>(value.field==='decision'?4000:2500)||!Number.isSafeInteger(value.artifactRevision)||value.artifactRevision<1)throw Error('invalid_result_link');
    const evidenceIds=[...new Set(task.evidenceIds)];
    if(!Array.isArray(value.evidenceIds)||value.evidenceIds.length!==evidenceIds.length||!evidenceIds.every(id=>value.evidenceIds.includes(id)))throw Error('invalid_result_link_evidence');
    const key=resultLinkKey(value);if(seen.has(key))throw Error('duplicate_result_link');seen.add(key);
    return {taskId:task.id,field:value.field,snapshot:value.snapshot.trim(),artifactRevision:value.artifactRevision,evidenceIds};
  });
}
/** New links bind to a saved task. Existing snapshots remain valid when the task is revised. */
export function bindResultLinks(value:WorkbookArtifact,saved:WorkbookArtifact,revision:number):WorkbookArtifact{
  if(value.links===undefined)return value;
  return {...value,links:value.links.map(link=>{
    const previous=saved.links?.find(item=>resultLinkKey(item)===resultLinkKey(link));
    if(previous&&JSON.stringify(previous)===JSON.stringify(link))return link;
    if(!revision||currentLinkedText(saved.practice,link)!==link.snapshot)throw Error('The saved check changed. Review the linked result before saving.');
    return {...link,artifactRevision:revision};
  })};
}
export function associateWorkbookResult(value:WorkbookArtifact,content:WorkbookContent,practice:WorkbookPractice|undefined,revision:number,taskId:string,field:WorkbookResultLink['field']):WorkbookArtifact{
  const task=workbookPracticeTasks(content).find(task=>task.id===taskId),snapshot=currentLinkedText(practice,{taskId,field});
  if(!task||!snapshot||revision<1)throw Error('saved_result_required');
  const link:WorkbookResultLink={taskId,field,snapshot,artifactRevision:revision,evidenceIds:[...new Set(task.evidenceIds)]};
  return {...value,links:[...(value.links||[]).filter(item=>resultLinkKey(item)!==resultLinkKey(link)),link]};
}
export const removeWorkbookResultLink=(value:WorkbookArtifact,key:string):WorkbookArtifact=>({...value,links:(value.links||[]).filter(link=>resultLinkKey(link)!==key)});
