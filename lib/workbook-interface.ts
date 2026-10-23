import type {PracticeEntry} from './workbook-practice';

/** Saved text is progress, but only the user's explicit confirmation completes a task. */
export function workbookTaskPresentation(entry:PracticeEntry|undefined,zh:boolean){
  const recorded=Boolean(entry?.result.trim()||entry?.unresolved.trim());
  const kind=entry?.completed?'complete':recorded?'saved':'new';
  return {kind,recorded,status:kind==='complete'?(zh?'已确认完成':'Confirmed complete'):kind==='saved'?(zh?'已保存，待继续':'Saved, in progress'):(zh?'未开始':'Not started'),
    action:kind==='complete'?(zh?'查看成果':'View result'):kind==='saved'?(zh?'继续核查':'Continue check'):(zh?'开始核查':'Start check'),
    recordAction:kind==='complete'?(zh?'回顾这项核查':'Review this check'):(zh?'继续这项核查':'Continue this check')};
}

export function workbookSavePresentation({busy,stale,conflict,error,dirty,draftStored,pendingDraft,revision,zh}:{
  busy:string;stale:boolean;conflict:boolean;error:boolean;dirty:boolean;draftStored:boolean;pendingDraft:boolean;revision:number;zh:boolean;
}){
  const mode=busy==='save'?'saving':stale?'stale':conflict?'conflict':error?'error':dirty?'dirty':pendingDraft?'recovery':revision?'saved':'empty';
  const status=mode==='saving'?(zh?'正在保存到工作区…':'Saving to workspace…'):mode==='stale'?(zh?'依据已变化 · 当前版本仅供回顾':'Evidence changed · historical version'):mode==='conflict'?(zh?'保存版本有变化 · 本地输入已保留':'Saved version changed · local input retained'):mode==='error'?(zh?'操作未完成 · 输入保留在本页':'Action incomplete · input retained here'):mode==='dirty'?(draftStored?(zh?'未提交 · 草稿已暂存在本标签页':'Not submitted · draft saved in this tab'):(zh?'未提交 · 无法暂存，请先保存':'Not submitted · draft storage failed; save now')):mode==='recovery'?(zh?'有本地草稿待恢复':'Local draft available to restore'):mode==='saved'?(zh?`已保存到工作区 · 版本 ${revision}`:`Saved to workspace · revision ${revision}`):(zh?'尚未保存判断':'No judgment saved yet');
  return {mode,status,canSave:!busy&&!stale&&dirty&&!pendingDraft,canLeave:!busy&&!dirty&&!pendingDraft,
    taskBlocked:Boolean(busy)||stale||dirty||pendingDraft,
    editorLabel:pendingDraft?(zh?'恢复本地草稿':'Restore local draft'):revision?(zh?'编辑判断':'Edit judgment'):(zh?'记录判断':'Record judgment')};
}
