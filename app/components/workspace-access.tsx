'use client';
import {useEffect,useRef,useState} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
import type {WorkspaceSession} from '../../lib/workspace-identity';

export function WorkspaceAccess({session,locale,demo=false}:{session:WorkspaceSession|null;locale:'zh'|'en';demo?:boolean}) {
  const zh=locale==='zh', [confirm,setConfirm]=useState<'connect'|'restore'|'browser'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const surface=useRef<HTMLElement>(null),previousConfirm=useRef(confirm);
  useEffect(()=>{
    if(confirm)surface.current?.querySelector<HTMLElement>('.pi-access-confirm')?.focus();
    else if(previousConfirm.current)surface.current?.querySelector<HTMLElement>(previousConfirm.current==='browser'?'.pi-access-secondary button':'.pi-access-actions button')?.focus();
    previousConfirm.current=confirm;
  },[confirm]);
  const change=async()=>{
    if(!confirm||busy||demo)return;setBusy(true);setError('');
    try{
      let legacyWorkspaceId:string|null=null;
      if(confirm==='browser'){try{legacyWorkspaceId=localStorage.getItem('pi-anonymous-workspace')}catch{throw Error('unavailable')}}
      const r=await workspaceFetch('/api/workspace-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:confirm,...(confirm==='browser'?{legacyWorkspaceId}:{})}),signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw Error(r.status===409?'conflict':r.status===401?'signin':r.status===404?'missing':'unavailable');
      const data=await r.json() as WorkspaceSession;if(confirm==='browser'?!['browser','account'].includes(data.mode):data.mode!=='account')throw Error('unavailable');
      window.location.reload();
    }catch(e){const reason=e instanceof Error?e.message:'';setError(reason==='conflict'?(zh?'账号或工作区已连接到其他身份。现有资料保留，请恢复已连接空间或换用原账号。':'This account or workspace is already connected elsewhere. Saved data is preserved. Restore the connected workspace or use the original account.'):reason==='signin'?(zh?'请先登录 ChatGPT，再完成连接。':'Sign in with ChatGPT first.'):reason==='missing'?(zh?'这个账号还没有连接工作区。请先在原浏览器中连接。':'This account has no connected workspace. Connect from the original browser first.'):(zh?'操作暂未确认，现有资料保留。请重试或重新载入核对。':'The operation could not be confirmed. Saved data is preserved. Retry or reload to check.'));setBusy(false)}
  };
  const connected=session?.mode==='account',locked=session?.mode==='locked';
  return <section ref={surface} className="pi-workspace-access" aria-label={zh?'访问与恢复':'Access & recovery'}>
    <div className="pi-access-status"><span className="pi-access-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M8 20h8m-4-4v4"/>{connected&&<path d="m8 10 3 3 5-5"/>}{locked&&<path d="M12 7v4m0 2v.1"/>}</svg></span><div>
     <h3>{demo?(zh?'演示工作区':'Demo workspace'):locked?(zh?'登录以恢复访问':'Sign in to restore access'):connected?(zh?'已连接 ChatGPT':'Connected to ChatGPT'):session?.differentWorkspace?(zh?'恢复另一个工作区':'Recover another workspace'):(zh?'当前通过浏览器访问':'Access through this browser')}</h3>
     {session?.accountLabel&&<p className="pi-access-account">{session.accountLabel}</p>}
    </div></div>
    <p className="pi-access-description">{demo?(zh?'演示资料可自由体验，无需连接账号。':'Explore the sample materials without connecting an account.'):locked?(zh?'使用连接此工作区的原账号，继续访问已保存的资料。':'Use the account connected to this workspace to access saved materials.'):connected?(zh?'在其他设备登录同一账号，即可恢复空间、文献和已保存笔记。':'Sign in with the same account on another device to recover spaces, papers and saved notes.'):session?.differentWorkspace?(zh?'此账号已有工作区。恢复后切换访问，当前浏览器的资料仍保留，不合并。':'This account already has a workspace. Recovery switches access; current browser data stays separate and preserved.'):(zh?'在原资料所在的浏览器连接 ChatGPT，即可在其他设备找回。':'Connect ChatGPT in the browser holding your materials to recover them on other devices.')}</p>
    {!demo&&!confirm&&<div className="pi-access-actions">{(!session?.signedIn||locked)?<a className="pi-access-primary" href="/signin-with-chatgpt?return_to=%2F%3Fworkspace-access%3D1" target="_top">{zh?'登录 ChatGPT':'Sign in with ChatGPT'}</a>:!session.accountAvailable?<p role="status">{zh?'账号连接服务暂不可用，当前浏览器访问保留。':'Account connection is unavailable; browser access is preserved.'}</p>:<>{!connected&&!session.differentWorkspace&&<button className="pi-access-primary" type="button" disabled={busy} onClick={()=>{setConfirm('connect');setError('')}}>{zh?'连接当前工作区':'Connect this workspace'}</button>}{session.linked&&!connected&&<button className={session.differentWorkspace?'pi-access-primary':undefined} type="button" disabled={busy} onClick={()=>{setConfirm('restore');setError('')}}>{zh?'恢复已连接的工作区':'Restore connected workspace'}</button>}</>}</div>}
    {confirm&&<div className="pi-access-confirm" tabIndex={-1} role="group" aria-label={zh?'确认工作区操作':'Confirm workspace action'}><h4>{confirm==='connect'?(zh?'连接当前工作区':'Connect this workspace'):confirm==='browser'?(zh?'返回原工作区':'Return to your original workspace'):(zh?'恢复并切换工作区':'Restore & switch workspace')}</h4><p>{confirm==='browser'?(zh?'返回本浏览器原来的工作区，账号连接仍然保留。请先保存正在编辑的内容。':'Return to the original browser workspace without removing the account connection. Save ongoing edits first.'):confirm==='connect'?(zh?'连接当前浏览器下的全部研究空间。原空间、文献和笔记保留，不重建或转移。':'Connect all research spaces in this browser. Existing spaces, papers and notes remain in place.'):(zh?'切换到该账号已连接的工作区。当前工作区资料保留；请先保存正在编辑的内容。':'Switch to this account’s connected workspace. Current workspace data remains intact; save ongoing edits first.')}</p><div><button className="pi-access-primary" type="button" disabled={busy} onClick={()=>void change()}>{busy?(zh?'正在核对…':'Checking…'):confirm==='connect'?(zh?'确认连接':'Confirm connection'):confirm==='browser'?(zh?'确认返回':'Confirm return'):(zh?'确认恢复并切换':'Restore & switch')}</button><button type="button" disabled={busy} onClick={()=>{setConfirm(null);setError('')}}>{zh?'取消':'Cancel'}</button></div></div>}
    {error&&<p role="alert">{error}</p>}
    {!demo&&<><p className="pi-access-note">{zh?'模型 Key 与未保存草稿留在原浏览器，不随账号恢复。':'Model keys and unsaved drafts stay in the original browser.'}</p><details className="pi-access-help"><summary>{zh?'恢复范围与限制':'Recovery details'}</summary><p>{zh?'恢复现有研究空间、文献和已保存笔记，不重建或转移资料。文献与笔记备份可在论文库导出。尚未连接且浏览器身份已清除时，无法仅凭空间链接找回。':'Recovery keeps existing spaces, papers and saved notes in place. Export paper and note backups from the library. Without a prior account connection or browser identity, a space link alone cannot restore access.'}</p></details></>}
    {!demo&&!confirm&&(session?.canReturnToBrowser||session?.signedIn)&&<div className="pi-access-secondary">{session?.canReturnToBrowser&&<button type="button" disabled={busy} onClick={()=>{setConfirm('browser');setError('')}}>{zh?'返回本浏览器原工作区':'Return to original browser workspace'}</button>}{session?.signedIn&&<a href="/signout-with-chatgpt?return_to=%2F%3Fworkspace-access%3D1" target="_top">{zh?'退出 ChatGPT 账号':'Sign out of ChatGPT'}</a>}</div>}
  </section>;
}
