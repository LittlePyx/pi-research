import {readWorkspaceLocation} from './workspace-navigation.ts';

export type WorkbookHistoryMode = 'push'|'replace'|'open-evidence'|'close-evidence';

export function isWorkbookInspectorReturn(previousHash:string,currentHash:string){
  const previous=readWorkspaceLocation(previousHash),current=readWorkspaceLocation(currentHash);
  return previous.view==='workbook'&&current.view==='workbook'&&Boolean(previous.workbookId)&&
    previous.space===current.space&&previous.id===current.id&&previous.workbookId===current.workbookId&&
    Boolean(previous.workbookFocus&&previous.workbookFocus!=='practice-results')&&(!current.workbookFocus||current.workbookFocus==='practice-results');
}

/** Only consume an inspector entry that this workbook opened itself. Deep links close in place. */
export function workbookInspectorReturn(state:unknown,hash:string):string|null{
  const from=state&&typeof state==='object'?(state as Record<string,unknown>).piWorkbookInspectorFrom:null;
  if(typeof from!=='string'||!from.startsWith('#workbook/'))return null;
  const origin=readWorkspaceLocation(from),current=readWorkspaceLocation(hash);
  return origin.view==='workbook'&&current.view==='workbook'&&Boolean(current.workbookId)&&
    origin.space===current.space&&origin.id===current.id&&origin.workbookId===current.workbookId&&(!origin.workbookFocus||origin.workbookFocus==='practice-results')?from:null;
}
